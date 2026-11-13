import { browser, expect } from '@wdio/globals';
import { byId, openMindMap, settle, waitForAnimation, writeNote } from '../helpers';

/**
 * The E2E helpers themselves (issue #62): `waitForAnimation` tells an animation that does not end
 * from a window that renders no frames for a while (the first Obsidian start on a CI runner).
 */

const NOTE = 'helpers.md';
const TEXT = ['# Root', '', '## One', '', '## Two', ''].join('\n');

/** Moved away from the fit, so "Fit to view" glides. */
const START = { x: 40, y: 30, zoom: 0.6 };

/** Pauses rendering: the window is hidden for `ms` (no animation frames meanwhile), then shown. */
async function renderNoFramesFor(ms: number): Promise<void> {
  await browser.execute((duration) => {
    const electron = (
      window as unknown as {
        electron: { remote: { getCurrentWindow(): { hide(): void; show(): void } } };
      }
    ).electron;
    const win = electron.remote.getCurrentWindow();
    win.hide();
    window.setTimeout(() => win.show(), duration);
  }, ms);
}

function isAnimating(): Promise<boolean> {
  return browser.execute(
    (selector) => document.querySelector(selector)?.classList.contains('is-animating') ?? false,
    byId('map.canvas'),
  );
}

describe('E2E helpers', function () {
  beforeEach(async function () {
    await writeNote(NOTE, TEXT);
    await openMindMap(NOTE);
    await settle();
  });

  it('waitForAnimation waits while the window renders no frames', async function () {
    await browser.executeObsidian(({ app }, t) => {
      const view = app.workspace.getLeavesOfType('mind-mapper-view')[0]?.view as unknown as {
        setTransform(t: unknown): void;
      };
      view.setTransform(t);
    }, START);
    // Longer than the 5 s an animation may take while frames are rendered.
    await renderNoFramesFor(6000);
    const started = Date.now();
    await browser.executeObsidianCommand('mind-mapper:fit-to-view');
    expect(await isAnimating()).toBe(true);
    await waitForAnimation();
    expect(Date.now() - started).toBeGreaterThanOrEqual(5000);
    expect(await isAnimating()).toBe(false);
  });

  it('waitForAnimation still reports an animation that does not end', async function () {
    // An animation that never ends: the class stays while frames are rendered.
    await browser.execute((selector) => {
      document.querySelector(selector)?.classList.add('is-animating');
    }, byId('map.canvas'));
    await expect(waitForAnimation()).rejects.toThrow('animation did not end');
    await browser.execute((selector) => {
      document.querySelector(selector)?.classList.remove('is-animating');
    }, byId('map.canvas'));
  });
});
