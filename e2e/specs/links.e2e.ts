import { browser, expect } from '@wdio/globals';
import { openMindMap, settle, waitForCache } from '../helpers';

const LINK = '.mind-mapper-node[data-node-id="Embeds/#6"] a.internal-link';

async function openNoteThenMap(): Promise<void> {
  await waitForCache('fixtures/embeds.md');
  await browser.executeObsidian(async ({ app }) => {
    app.workspace.detachLeavesOfType('mind-mapper-view');
    const file = app.vault.getFileByPath('fixtures/embeds.md');
    if (file) await app.workspace.getLeaf(false).openFile(file);
  });
  await openMindMap('fixtures/embeds.md');
  await settle();
}

function leafSummary() {
  return browser.executeObsidian(({ app }) => {
    const leaves: { type: string; file: string | null }[] = [];
    app.workspace.iterateRootLeaves((leaf) => {
      const state = leaf.getViewState();
      leaves.push({
        type: state.type,
        file: (state.state as { file?: string } | undefined)?.file ?? null,
      });
    });
    return leaves;
  });
}

function clickLink(init: MouseEventInit = {}): Promise<void> {
  return browser.execute(
    (selector, eventInit) => {
      const link = document.querySelector(selector);
      if (!link) throw new Error(`missing ${selector}`);
      link.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...eventInit }),
      );
    },
    LINK,
    init,
  );
}

describe('links inside nodes', function () {
  it('a plain click opens the note in the note leaf and keeps the map', async function () {
    await openNoteThenMap();
    await clickLink();
    await browser.waitUntil(
      async () => (await leafSummary()).some((l) => l.file === 'fixtures/lists.md'),
      { timeout: 10000, timeoutMsg: 'lists.md was not opened' },
    );
    const leaves = await leafSummary();
    expect(leaves.filter((l) => l.type === 'mind-mapper-view')).toEqual([
      { type: 'mind-mapper-view', file: 'fixtures/embeds.md' },
    ]);
  });

  it('Ctrl/Cmd click opens a new tab', async function () {
    await openNoteThenMap();
    const before = (await leafSummary()).length;
    await clickLink({ ctrlKey: true, metaKey: process.platform === 'darwin' });
    await browser.waitUntil(async () => (await leafSummary()).length === before + 1, {
      timeout: 10000,
      timeoutMsg: 'no new tab opened',
    });
    const leaves = await leafSummary();
    expect(leaves.some((l) => l.file === 'fixtures/lists.md')).toBe(true);
    expect(leaves.some((l) => l.type === 'mind-mapper-view')).toBe(true);
  });

  it('middle click opens a new tab, like reading view', async function () {
    await openNoteThenMap();
    const before = (await leafSummary()).length;
    // A real middle click (WebDriver): Chromium sends it as `auxclick`, not `click`.
    await browser.$(LINK).click({ button: 'middle' });
    await browser.waitUntil(async () => (await leafSummary()).length === before + 1, {
      timeout: 10000,
      timeoutMsg: 'no new tab opened',
    });
    const leaves = await leafSummary();
    expect(leaves.some((l) => l.file === 'fixtures/lists.md')).toBe(true);
    expect(leaves.some((l) => l.type === 'mind-mapper-view')).toBe(true);
  });

  it('hovering a link emits hover-link for page preview', async function () {
    await openNoteThenMap();
    await browser.executeObsidian(({ app }) => {
      const store = window as unknown as { hoverEvents: unknown[] };
      store.hoverEvents = [];
      // 'hover-link' has no typed overload on Workspace.on
      const workspace = app.workspace as unknown as {
        on(name: string, callback: (info: { source: string; linktext: string }) => void): unknown;
      };
      workspace.on('hover-link', (info) => {
        store.hoverEvents.push({ source: info.source, linktext: info.linktext });
      });
    });
    await browser.execute((selector) => {
      document
        .querySelector(selector)
        ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    }, LINK);
    const events = await browser.execute(
      () => (window as unknown as { hoverEvents: unknown[] }).hoverEvents,
    );
    expect(events).toEqual([{ source: 'mind-mapper-view', linktext: 'lists' }]);
  });
});

describe('links in the expand overlay', function () {
  it('an internal link in the overlay opens the note and closes the overlay', async function () {
    const long = `# Overlay\n\n${'Filler text to clip the node. '.repeat(60)}[[lists]] at the end.\n`;
    await browser.executeObsidian(async ({ app }, text) => {
      await app.vault.adapter.write('overlay-link.md', text);
    }, long);
    await openMindMap('overlay-link.md');
    await settle();
    await browser.execute(() => {
      document
        .querySelector<HTMLElement>(
          '.mind-mapper-node[data-node-id="Overlay/#1"] .mind-mapper-node-expand',
        )
        ?.click();
    });
    const link = browser.$('.mind-mapper-full-content a.internal-link');
    await link.waitForExist({ timeout: 10000 });
    await browser.execute(() => {
      document.querySelector<HTMLElement>('.mind-mapper-full-content a.internal-link')?.click();
    });
    await browser.waitUntil(
      async () => (await leafSummary()).some((l) => l.file === 'fixtures/lists.md'),
      { timeout: 10000, timeoutMsg: 'lists.md was not opened from the overlay' },
    );
    await expect(browser.$('.mind-mapper-full-content')).not.toExist();
  });
});
