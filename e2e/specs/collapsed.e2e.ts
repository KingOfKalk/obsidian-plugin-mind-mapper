import { browser, expect } from '@wdio/globals';
import { openMindMap, settle, writeNote } from '../helpers';

function shownIds(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.mind-mapper-node'))
      .map((el) => el.dataset.nodeId ?? '')
      .sort(),
  );
}

function collapseLabel(): Promise<string | null> {
  return browser.execute(
    () =>
      document
        .querySelector('.mind-mapper-controls button:nth-child(5)')
        ?.getAttribute('aria-label') ?? null,
  );
}

describe('start collapsed', function () {
  it('a note with mind-mapper-collapsed: true opens collapsed; setting it to false expands all', async function () {
    await openMindMap('fixtures/fm-collapsed.md');
    await settle();
    expect(await shownIds()).toEqual(['Live', 'Live/#1', 'Live/Beta', 'Live/Delta']);
    expect(await collapseLabel()).toBe('Expand all');

    const path = 'start-collapsed.md';
    await writeNote(
      path,
      '---\nmind-mapper-collapsed: true\n---\n# Live\n\nAlpha.\n\n## Beta\n\nBeta text.\n',
    );
    await openMindMap(path);
    await settle();
    expect(await shownIds()).toEqual(['Live', 'Live/#1', 'Live/Beta']);
    // Edited like the Properties checkbox does it.
    await browser.executeObsidian(async ({ app }, notePath) => {
      const file = app.vault.getFileByPath(notePath);
      if (!file) throw new Error(`no note ${notePath}`);
      await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        frontmatter['mind-mapper-collapsed'] = false;
      });
    }, path);
    await browser
      .$('.mind-mapper-node[data-node-id="Live/Beta/#1"]')
      .waitForExist({ timeout: 10000, timeoutMsg: 'the map did not expand' });
    expect(await collapseLabel()).toBe('Collapse all');
  });
});
