import { mkdirSync } from 'node:fs';
import { browser } from '@wdio/globals';
import { openMindMap, settle, waitForCache } from './helpers';
import { generateNote } from './perf/generateNote';

/**
 * Visual check: saves screenshots of a few maps to SCREENSHOT_DIR (default: e2e/screenshots/).
 * Not part of `test:e2e`; run with `npm run screenshots:e2e`.
 */
describe('screenshots', function () {
  const dir = process.env.SCREENSHOT_DIR ?? 'e2e/screenshots';
  before(function () {
    mkdirSync(dir, { recursive: true });
  });
  for (const note of [
    'worked-example',
    'blocks',
    'lists',
    'embeds',
    'long-content',
    'thematic-breaks',
  ]) {
    it(note, async function () {
      await openMindMap(`fixtures/${note}.md`);
      await settle();
      await browser.executeObsidianCommand('mind-mapper:fit-to-view');
      await browser.pause(300);
      await browser.saveScreenshot(`${dir}/${note}.png`);
    });
  }

  it('dividers at 100 %', async function () {
    await openMindMap('fixtures/thematic-breaks.md');
    await settle();
    await browser.executeObsidianCommand('mind-mapper:reset-zoom');
    await browser.executeObsidianCommand('mind-mapper:back-to-root');
    await browser.pause(300);
    await browser.saveScreenshot(`${dir}/thematic-breaks-100.png`);
  });

  for (const layout of [
    'circle-clockwise',
    'circle-counter-clockwise',
    'left-to-right',
    'right-to-left',
    'top-to-bottom',
    'bottom-to-top',
  ]) {
    for (const note of ['worked-example', 'lists']) {
      it(`layout ${layout} ${note}`, async function () {
        await browser.executeObsidian(async ({ app }, name) => {
          const plugins = (
            app as unknown as {
              plugins: { plugins: Record<string, { updateSettings(p: unknown): Promise<void> }> };
            }
          ).plugins.plugins;
          await plugins['mind-mapper']?.updateSettings({ defaultLayout: name });
        }, layout);
        await openMindMap(`fixtures/${note}.md`);
        await settle();
        await browser.executeObsidianCommand('mind-mapper:fit-to-view');
        await browser.pause(300);
        await browser.saveScreenshot(`${dir}/layout-${layout}-${note}.png`);
      });
    }
  }

  it('crosslinks', async function () {
    await browser.executeObsidian(async ({ app }) => {
      const plugins = (
        app as unknown as {
          plugins: { plugins: Record<string, { updateSettings(p: unknown): Promise<void> }> };
        }
      ).plugins.plugins;
      await plugins['mind-mapper']?.updateSettings({ defaultLayout: 'circle-clockwise' });
    });
    await openMindMap('fixtures/crosslinks.md');
    await settle();
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await browser.pause(300);
    await browser.saveScreenshot(`${dir}/crosslinks.png`);
    await browser.keys('Escape');
  });

  it('full screen', async function () {
    await openMindMap('fixtures/lists.md');
    await settle();
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await browser.pause(300);
    await browser.saveScreenshot(`${dir}/full-screen.png`);
    await browser.keys('Escape');
  });

  it('large map at fit and at 100 %', async function () {
    await browser.executeObsidian(
      async ({ app }, text) => {
        await app.vault.adapter.write('large-2000.md', text);
      },
      generateNote(2000, 2000),
    );
    await waitForCache('large-2000.md');
    await openMindMap('large-2000.md');
    await browser.pause(1000);
    await browser.saveScreenshot(`${dir}/large-fit.png`);
    await browser.executeObsidianCommand('mind-mapper:reset-zoom');
    await browser.executeObsidianCommand('mind-mapper:back-to-root');
    await browser.pause(1000);
    await browser.saveScreenshot(`${dir}/large-100.png`);
  });

  it('collapsed and selected', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    await browser.execute(() => {
      document
        .querySelector<HTMLElement>('.mind-mapper-collapse[data-node-id="Project/Tasks"]')
        ?.click();
      document
        .querySelector<HTMLElement>(
          '.mind-mapper-node[data-node-id="Project/Notes"] .mind-mapper-node-content',
        )
        ?.click();
    });
    await settle();
    await browser.executeObsidianCommand('mind-mapper:fit-to-view');
    await browser.pause(300);
    await browser.saveScreenshot(`${dir}/collapsed.png`);
  });
});
