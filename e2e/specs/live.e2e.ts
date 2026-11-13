import { browser, expect } from '@wdio/globals';
import {
  byId,
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

    await browser.executeObsidian(({ app }, notePath) => {
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
      editor.replaceRange('\nGamma paragraph.\n', { line: editor.lineCount(), ch: 0 });
    }, path);

    // State, not time: the new node shows the typed text (latency: `npm run perf:e2e`).
    await browser.waitUntil(
      async () =>
        (await node('Live/Beta/#2').isExisting()) &&
        (await node('Live/Beta/#2').getText()) === 'Gamma paragraph.',
      { timeout: 10000, timeoutMsg: 'map did not show the typed paragraph' },
    );
    await settle();
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
    // Same ID collapsed and expanded; the state is the attribute.
    const tasks = browser.$(`${'[data-mm-id="node.toggle"]'}[data-node-id="Project/Tasks"]`);
    await expect(tasks).toHaveAttribute('data-mm-state', 'collapsed');
    await browser.executeObsidianCommand('mind-mapper:expand-all');
    await expect(node('Project/Tasks/#1')).toExist();
    await expect(tasks).toHaveAttribute('data-mm-state', 'expanded');
  });

  it('one collapse button collapses and expands all and shows the state', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    const button = () => browser.$('.mind-mapper-controls button:nth-child(5)');
    await expect(button()).toHaveAttribute('aria-label', 'Collapse all');
    await button().click();
    await expect(node('Project/Tasks/#1')).not.toExist();
    await expect(node('Project/Tasks')).toExist();
    await expect(button()).toHaveAttribute('aria-label', 'Expand all');
    await expect(button()).toHaveElementClass('is-active');
    await expect(button()).toHaveAttribute('data-mm-state', 'active');
    // the icon is swapped, not added
    expect(await button().$$('svg').length).toBe(1);
    await button().click();
    await expect(node('Project/Tasks/#1')).toExist();
    await expect(button()).toHaveAttribute('aria-label', 'Collapse all');
    expect(await button().$$('svg').length).toBe(1);
  });
});

describe('collapse all mode', function () {
  it('a moved branch stays collapsed after collapse all', async function () {
    const path = 'collapse-move.md';
    await writeNote(path, '# R\n\n## A\n\n- a1\n\n## B\n\n- b1\n');
    await openMindMap(path);
    await settle();
    await browser.executeObsidianCommand('mind-mapper:collapse-all');
    await expect(node('R/A/#1')).not.toExist();
    // move B under A: B gets the new id R/A/B
    await writeNote(path, '# R\n\n## A\n\n- a1\n\n### B\n\n- b1\n');
    await node('R/B').waitForExist({ timeout: 10000, reverse: true });
    await browser.execute(() => {
      document.querySelector<HTMLElement>('.mind-mapper-collapse[data-node-id="R/A"]')?.click();
    });
    await expect(node('R/A/B')).toExist();
    await expect(node('R/A/#1')).toExist();
    await expect(node('R/A/B/#1')).not.toExist();
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
  it('an update that cannot be parsed keeps the last map with a notice until the next good one', async function () {
    const path = 'live-error.md';
    await writeNote(path, '# Live\n\nAlpha paragraph.\n');
    await openMindMap(path);
    await settle();
    // A cache the parser cannot read (a section without position), as if Obsidian sent one.
    await browser.executeObsidian(async ({ app }, notePath) => {
      const file = app.vault.getFileByPath(notePath);
      const cache = file && app.metadataCache.getFileCache(file);
      if (!file || !cache) throw new Error(`no cache for ${notePath}`);
      const text = await app.vault.cachedRead(file);
      app.metadataCache.trigger('changed', file, text, {
        ...cache,
        sections: [{ type: 'paragraph' }],
      });
    }, path);
    await browser.$(byId('map.update-error')).waitForDisplayed({ timeout: 5000 });
    expect(await browser.$(byId('map.update-error')).getText()).toBe(
      'Could not update the map. Showing the last version.',
    );
    await expect(node('Live/#1')).toExist();

    await writeNote(path, '# Live\n\nAlpha paragraph.\n\nSecond paragraph.\n');
    await node('Live/#2').waitForExist({ timeout: 5000 });
    await expect(browser.$(byId('map.update-error'))).not.toBeDisplayed();
  });
});
