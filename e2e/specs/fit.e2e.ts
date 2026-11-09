import { browser, expect } from '@wdio/globals';
import { openMindMap, settle, waitForAnimation, writeNote } from '../helpers';

type MindMapper = { updateSettings(patch: object): Promise<void> };
type ObsidianApp = { plugins: { plugins: Record<string, MindMapper> } };

async function setFitMaxZoom(percent: number): Promise<void> {
  await browser.executeObsidian(async ({ app }, value) => {
    await (app as unknown as ObsidianApp).plugins.plugins['mind-mapper']!.updateSettings({
      fitMaxZoom: value,
    });
  }, percent);
}

function zoomLabel(): Promise<string> {
  return browser.$('.mind-mapper-zoom-input').getValue();
}

async function clickFit(): Promise<void> {
  await browser.$('.mind-mapper-controls button[aria-label="Fit to view"]').click();
  await waitForAnimation();
}

async function expectZoomLabel(expected: string): Promise<void> {
  await browser.waitUntil(async () => (await zoomLabel()) === expected, {
    timeout: 5000,
    timeoutMsg: `zoom label is "${await zoomLabel()}", expected "${expected}"`,
  });
}

describe('fit zoom cap', function () {
  this.timeout(45000);

  after(async function () {
    await setFitMaxZoom(150);
  });

  it('Fit to view enlarges a small map up to the "Max zoom for fit" setting', async function () {
    await setFitMaxZoom(200);
    await writeNote('fit-small.md', '# Small\n');
    await openMindMap('fit-small.md');
    await settle();
    await expectZoomLabel('200%');

    await setFitMaxZoom(100);
    // The setting does not re-fit an open map; the next fit uses it.
    await expectZoomLabel('200%');
    await clickFit();
    await expectZoomLabel('100%');

    await setFitMaxZoom(250);
    await clickFit();
    await expectZoomLabel('250%');
  });

  it('a map after Collapse all is enlarged by fit, also when entering full screen', async function () {
    await setFitMaxZoom(200);
    await openMindMap('fixtures/worked-example.md');
    await settle();
    await browser.executeObsidianCommand('mind-mapper:collapse-all');
    await settle();
    // The test window is narrow; full screen has room to enlarge.
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await expect(browser.$('.mind-mapper-full-screen')).toExist();
    await browser.waitUntil(async () => parseInt(await zoomLabel(), 10) > 100, {
      timeout: 5000,
      timeoutMsg: 'entering full screen did not enlarge the collapsed map',
    });
    expect(parseInt(await zoomLabel(), 10)).toBeLessThanOrEqual(200);

    await setFitMaxZoom(100);
    await clickFit();
    await expectZoomLabel('100%');
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
  });
});
