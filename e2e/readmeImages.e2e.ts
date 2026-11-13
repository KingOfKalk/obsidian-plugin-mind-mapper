import { mkdirSync } from 'node:fs';
import { browser } from '@wdio/globals';
import { byId, settle, waitForCache } from './helpers';

/**
 * README image (committed in docs/images/): the Obsidian window at 800 x 600 px with the file
 * explorer and the map of the feature tour note. Run with `npm run readme:images`.
 */
const NOTE = 'demo/Feature tour.md';
const COLLAPSED = 'Launching Lumen 2.0/Timeline';
const WIDTH = 800;
const HEIGHT = 600;

describe('README image', function () {
  it('hero', async function () {
    mkdirSync('docs/images', { recursive: true });
    // WebDriver's window size is not available in Obsidian; resize through Electron
    await browser.execute(
      (width, height) => {
        const electron = (
          window as unknown as {
            electron: {
              remote: { getCurrentWindow(): { setContentSize(w: number, h: number): void } };
            };
          }
        ).electron;
        electron.remote.getCurrentWindow().setContentSize(width, height);
      },
      WIDTH,
      HEIGHT,
    );
    await browser.waitUntil(
      () =>
        browser.execute(
          (width, height) =>
            window.innerWidth === width &&
            window.innerHeight === height &&
            window.devicePixelRatio === 1,
          WIDTH,
          HEIGHT,
        ),
      { timeout: 5000, timeoutMsg: `window is not ${WIDTH} x ${HEIGHT} at device pixel ratio 1` },
    );

    await waitForCache(NOTE);
    await browser.executeObsidian(async ({ app }, notePath) => {
      const plugins = (
        app as unknown as {
          plugins: { plugins: Record<string, { updateSettings(p: unknown): Promise<void> }> };
        }
      ).plugins.plugins;
      await plugins['mind-mapper']?.updateSettings({ defaultLayout: 'circle-clockwise' });

      // the map in the only tab of the main area
      app.workspace.detachLeavesOfType('mind-mapper-view');
      const leaves: { detach(): void }[] = [];
      app.workspace.iterateRootLeaves((leaf) => {
        leaves.push(leaf);
      });
      const leaf = app.workspace.getLeaf(false);
      for (const other of leaves) if (other !== leaf) other.detach();
      await leaf.setViewState({
        type: 'mind-mapper-view',
        active: true,
        state: { file: notePath },
      });

      // file explorer on the left with the demo folder open, right sidebar closed
      app.workspace.rightSplit.collapse();
      app.workspace.leftSplit.expand();
      const explorer = app.workspace.getLeavesOfType('file-explorer')[0];
      const file = app.vault.getFileByPath(notePath);
      if (explorer && file) {
        (app.workspace.leftSplit as unknown as { setSize(width: number): void }).setSize(180);
        (explorer.view as unknown as { revealInFolder(f: unknown): void }).revealInFolder(file);
      }
      app.workspace.setActiveLeaf(leaf, { focus: true });
    }, NOTE);
    await browser.$('.mind-mapper-node.is-root').waitForExist({ timeout: 15000 });
    await settle();

    // one collapsed branch with its hidden-node count
    await browser.$(`.mind-mapper-collapse[data-node-id="${COLLAPSED}"]`).click();
    await browser
      .$(`.mind-mapper-collapse[data-node-id="${COLLAPSED}"].is-collapsed`)
      .waitForExist();
    await settle();
    // the file explorer is the active leaf, so the command would not reach the map: use its button
    await browser.$(byId('controls.fit')).click();
    // no hover highlight on the button
    await browser
      .action('pointer')
      .move({ x: WIDTH - 20, y: 100 })
      .perform();
    // no window buttons in the picture
    await browser.execute(() => {
      const style = document.head.createEl('style', { attr: { id: 'readme-images' } });
      style.textContent = '.titlebar-button-container, .status-bar { display: none !important; }';
    });
    await browser.pause(600);
    await browser.saveScreenshot('docs/images/hero.png');
    await browser.execute(() => document.getElementById('readme-images')?.remove());
  });
});
