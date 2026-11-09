import { browser } from '@wdio/globals';
import { openMindMap, writeNote } from '../helpers';

/** Text of the view header title of the (single) open map. */
function headerTitle(): Promise<string | null> {
  return browser.execute(
    () =>
      document.querySelector(
        '.workspace-leaf-content[data-type="mind-mapper-view"] .view-header-title',
      )?.textContent ?? null,
  );
}

describe('view header title', function () {
  it('shows the note name after open, after a rename and after switching to another note', async function () {
    await writeNote('header-one.md', '# One\n\nText.\n');
    await writeNote('header-two.md', '# Two\n\nText.\n');
    await openMindMap('header-one.md');
    await browser.waitUntil(async () => (await headerTitle()) === 'header-one', {
      timeout: 5000,
      timeoutMsg: `header title after open: ${await headerTitle()}`,
    });

    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getFileByPath('header-one.md');
      if (!file) throw new Error('missing');
      await app.fileManager.renameFile(file, 'header-renamed.md');
    });
    await browser.waitUntil(async () => (await headerTitle()) === 'header-renamed', {
      timeout: 5000,
      timeoutMsg: `header title after rename: ${await headerTitle()}`,
    });

    await browser.executeObsidian(async ({ app }) => {
      const leaf = app.workspace.getLeavesOfType('mind-mapper-view')[0];
      if (!leaf) throw new Error('no map leaf');
      await leaf.setViewState({ type: 'mind-mapper-view', state: { file: 'header-two.md' } });
    });
    await browser.waitUntil(async () => (await headerTitle()) === 'header-two', {
      timeout: 5000,
      timeoutMsg: `header title after switching note: ${await headerTitle()}`,
    });
  });
});
