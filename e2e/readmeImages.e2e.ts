import { browser } from '@wdio/globals';
import { openMindMap, settle } from './helpers';

/**
 * README images (committed in docs/images/): full-screen maps, so no Obsidian chrome is shown.
 * Run with `npm run readme:images`.
 */
async function setLayout(layout: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, name) => {
    const plugins = (
      app as unknown as {
        plugins: { plugins: Record<string, { updateSettings(p: unknown): Promise<void> }> };
      }
    ).plugins.plugins;
    await plugins['mind-mapper']?.updateSettings({ defaultLayout: name });
  }, layout);
}

async function shoot(note: string, file: string): Promise<void> {
  await openMindMap(note);
  await settle();
  // no window buttons in the pictures
  await browser.execute(() => {
    const style = document.head.createEl('style', { attr: { id: 'readme-images' } });
    style.textContent = '.titlebar-button-container { display: none !important; }';
  });
  await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
  await settle();
  // controls fade after 2 s idle; wait for a calm picture without them
  await browser.pause(2600);
  await browser.saveScreenshot(`docs/images/${file}`);
  await browser.keys('Escape');
  await browser.execute(() => document.getElementById('readme-images')?.remove());
}

describe('README images', function () {
  it('circle layout of the demo note', async function () {
    await setLayout('circle-clockwise');
    await shoot('demo/Trip planning.md', 'circle.png');
  });

  it('rich content', async function () {
    await setLayout('left-to-right');
    await shoot('demo/Rich content.md', 'content.png');
    await setLayout('circle-clockwise');
  });
});
