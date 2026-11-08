import { browser } from '@wdio/globals';
import { openMindMap, settle } from './helpers';

/**
 * Visual check: saves screenshots of a few maps to SCREENSHOT_DIR (default: e2e/screenshots/).
 * Not part of `test:e2e`; run with `npm run screenshots:e2e`.
 */
describe('screenshots', function () {
  const dir = process.env.SCREENSHOT_DIR ?? 'e2e/screenshots';
  for (const note of ['worked-example', 'blocks', 'lists', 'embeds', 'long-content']) {
    it(note, async function () {
      await openMindMap(`fixtures/${note}.md`);
      await settle();
      await browser.executeObsidianCommand('mind-mapper:fit-to-view');
      await browser.pause(300);
      await browser.saveScreenshot(`${dir}/${note}.png`);
    });
  }
});
