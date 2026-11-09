import { browser, expect } from '@wdio/globals';
import {
  leafSummary,
  mouseOnNode,
  openMindMap,
  openNote,
  settle,
  waitForCache,
  writeNote,
} from '../helpers';

function node(id: string) {
  return browser.$(`.mind-mapper-node[data-node-id="${id}"]`);
}

function viewport() {
  return browser.execute(() => ({
    transform: document.querySelector<HTMLElement>('.mind-mapper-world')?.style.transform ?? '',
    selected: Array.from(
      document.querySelectorAll<HTMLElement>('.mind-mapper-node.is-selected'),
    ).map((el) => el.dataset.nodeId),
  }));
}

describe('live update', function () {
  it('typing in the editor updates the map and keeps transform and selection', async function () {
    const path = 'live-typing.md';
    await writeNote(path, '# Live\n\nAlpha paragraph.\n\n## Beta\n\nBeta text.\n');
    await openNote(path);
    await openMindMap(path);
    await settle();
    await mouseOnNode('Live/Beta', 'click');
    await browser.execute(() => {
      document
        .querySelector('.mind-mapper-canvas')
        ?.dispatchEvent(
          new WheelEvent('wheel', { deltaX: 30, deltaY: 20, bubbles: true, cancelable: true }),
        );
    });
    const before = await viewport();
    expect(before.selected).toEqual(['Live/Beta']);

    // Spike: time from the edit to the `changed` event and to the new node in the DOM.
    await browser.executeObsidian(({ app }, notePath) => {
      const spike = { t0: 0, changed: 0, dom: 0 };
      (window as unknown as { spike: typeof spike }).spike = spike;
      const ref = app.metadataCache.on('changed', (file) => {
        if (file.path !== notePath || spike.changed) return;
        spike.changed = performance.now();
        app.metadataCache.offref(ref);
      });
      const timer = window.setInterval(() => {
        if (!document.querySelector('.mind-mapper-node[data-node-id="Live/Beta/#2"]')) return;
        spike.dom = performance.now();
        window.clearInterval(timer);
      }, 5);
      const leaf = app.workspace
        .getLeavesOfType('markdown')
        .find((l) => (l.view as unknown as { file?: { path: string } }).file?.path === notePath);
      const editor = (
        leaf?.view as unknown as {
          editor?: {
            lineCount(): number;
            replaceRange(t: string, p: { line: number; ch: number }): void;
          };
        }
      ).editor;
      if (!editor) throw new Error('no editor');
      spike.t0 = performance.now();
      editor.replaceRange('\nGamma paragraph.\n', { line: editor.lineCount(), ch: 0 });
    }, path);

    await node('Live/Beta/#2').waitForExist({ timeout: 10000, timeoutMsg: 'map did not update' });
    const spike = await browser.execute(
      () => (window as unknown as { spike: { t0: number; changed: number; dom: number } }).spike,
    );
    console.log(
      `[spike] changed event ${Math.round(spike.changed - spike.t0)} ms after the edit, new node ${Math.round(spike.dom - spike.t0)} ms after the edit`,
    );
    // From the changed event: 300 ms debounce plus parse, layout and render.
    expect(spike.dom - spike.changed).toBeLessThan(1000);
    const after = await viewport();
    expect(after).toEqual(before);
  });

  it('collapse toggle hides the subtree; expand all shows it', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    await browser.execute(() => {
      document
        .querySelector<HTMLElement>('.mind-mapper-collapse[data-node-id="Project/Tasks"]')
        ?.click();
    });
    await expect(node('Project/Tasks/#1')).not.toExist();
    // the toggle sits just outside its node: it never covers node content
    const gap = await browser.execute(() => {
      const nodeRect = document
        .querySelector('.mind-mapper-node[data-node-id="Project/Tasks"]')
        ?.getBoundingClientRect();
      const toggleRect = document
        .querySelector('.mind-mapper-collapse[data-node-id="Project/Tasks"]')
        ?.getBoundingClientRect();
      return nodeRect && toggleRect ? toggleRect.left - nodeRect.right : -1;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    await expect(browser.$('.mind-mapper-collapse[data-node-id="Project/Tasks"]')).toHaveText('2');
    await browser.executeObsidianCommand('mind-mapper:expand-all');
    await expect(node('Project/Tasks/#1')).toExist();
  });

  it('collapse all and expand all buttons in the controls work', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    const collapseButton = browser.$('.mind-mapper-controls button[aria-label="Collapse all"]');
    const expandButton = browser.$('.mind-mapper-controls button[aria-label="Expand all"]');
    await expect(collapseButton.$('svg')).toExist();
    await expect(expandButton.$('svg')).toExist();
    await collapseButton.click();
    await expect(node('Project/Tasks/#1')).not.toExist();
    await expect(node('Project/Tasks')).toExist();
    await expandButton.click();
    await expect(node('Project/Tasks/#1')).toExist();
  });
});

describe('jump to source', function () {
  it('double click puts the cursor on the line in the open note', async function () {
    await openNote('fixtures/worked-example.md');
    await openMindMap('fixtures/worked-example.md');
    await settle();
    const leavesBefore = (await leafSummary()).length;
    await mouseOnNode('Project/Tasks', 'dblclick');
    await browser.waitUntil(
      () =>
        browser.executeObsidian(({ app, obsidian }) => {
          const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
          return view?.editor.getCursor().line === 3;
        }),
      { timeout: 10000, timeoutMsg: 'cursor is not on "## Tasks" (line 3)' },
    );
    expect((await leafSummary()).length).toBe(leavesBefore);
  });

  it('double click opens a split when the note is not open; the map stays', async function () {
    await waitForCache('fixtures/worked-example.md');
    await browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType('markdown'));
    await openMindMap('fixtures/worked-example.md');
    await settle();
    const before = await leafSummary();
    await mouseOnNode('Project/Notes', 'dblclick');
    await browser.waitUntil(async () => (await leafSummary()).length === before.length + 1, {
      timeout: 10000,
      timeoutMsg: 'no split opened',
    });
    const after = await leafSummary();
    expect(after).toContainEqual({ type: 'markdown', file: 'fixtures/worked-example.md' });
    expect(after).toContainEqual({
      type: 'mind-mapper-view',
      file: 'fixtures/worked-example.md',
    });
  });
});

describe('rename and delete', function () {
  it('rename keeps the map and updates the title', async function () {
    await writeNote('rename-me.md', '# Rename me\n\nText.\n');
    await openMindMap('rename-me.md');
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getFileByPath('rename-me.md');
      if (!file) throw new Error('missing');
      await app.fileManager.renameFile(file, 'renamed-note.md');
    });
    await browser.waitUntil(
      async () =>
        (await leafSummary()).some(
          (l) => l.type === 'mind-mapper-view' && l.file === 'renamed-note.md',
        ),
      { timeout: 10000, timeoutMsg: 'map did not follow the rename' },
    );
    const titles = await browser.execute(() =>
      Array.from(document.querySelectorAll('.workspace-tab-header-inner-title')).map(
        (el) => el.textContent,
      ),
    );
    expect(titles).toContain('renamed-note');
    await expect(browser.$('.mind-mapper-node.is-root')).toExist();
  });

  it('delete shows "Note was deleted"', async function () {
    await writeNote('delete-me.md', '# Delete me\n\nText.\n');
    await openMindMap('delete-me.md');
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getFileByPath('delete-me.md');
      if (!file) throw new Error('missing');
      await app.vault.delete(file);
    });
    await expect(browser.$('.mind-mapper-placeholder')).toHaveText('Note was deleted');
  });
});
