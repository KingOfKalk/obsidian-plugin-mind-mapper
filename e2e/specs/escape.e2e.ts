import { browser, expect } from '@wdio/globals';
import { openMindMap, openNote, settle } from '../helpers';

const FULL_SCREEN = '.mind-mapper-full-screen';

/** The menus of the control bar, by their button. */
const MENUS = [
  '.mind-mapper-zoom-menu',
  '.mind-mapper-controls button[aria-label="Layout"]',
  '.mind-mapper-controls button[aria-label="Colour theme"]',
];

function activeViewType(): Promise<string | null> {
  return browser.executeObsidian(
    ({ app, obsidian }) =>
      app.workspace.getActiveViewOfType(obsidian.ItemView)?.getViewType() ?? null,
  );
}

/** Esc, then a moment for Obsidian's (debounced) active leaf events. */
async function pressEscape(): Promise<void> {
  await browser.keys('Escape');
  await browser.pause(200);
}

async function openMenu(buttonSelector: string): Promise<void> {
  await browser.$(buttonSelector).click();
  await browser.$('.menu').waitForExist({ timeout: 5000 });
}

// Obsidian hands an unhandled Esc from a non-navigation view to the last note tab (#13).
describe('Esc on the map', function () {
  beforeEach(async function () {
    // A note tab next to the map: the tab Obsidian would switch to.
    await openNote('fixtures/lists.md');
    await openMindMap('fixtures/worked-example.md');
    await settle();
    expect(await activeViewType()).toBe('mind-mapper-view');
  });

  it('in full screen closes an open menu only; without a menu it leaves full screen', async function () {
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await expect(browser.$(FULL_SCREEN)).toExist();
    for (const menu of MENUS) {
      await openMenu(menu);
      await pressEscape();
      await browser.$('.menu').waitForExist({ reverse: true, timeout: 5000 });
      expect({ menu, active: await activeViewType() }).toEqual({
        menu,
        active: 'mind-mapper-view',
      });
      expect({ menu, fullScreen: await browser.$(FULL_SCREEN).isExisting() }).toEqual({
        menu,
        fullScreen: true,
      });
    }
    await pressEscape();
    await expect(browser.$(FULL_SCREEN)).not.toExist();
    expect(await activeViewType()).toBe('mind-mapper-view');
  });

  it('outside full screen keeps the map the active tab, with and without a menu', async function () {
    await pressEscape();
    expect(await activeViewType()).toBe('mind-mapper-view');
    for (const menu of MENUS) {
      await openMenu(menu);
      await pressEscape();
      await browser.$('.menu').waitForExist({ reverse: true, timeout: 5000 });
      expect({ menu, active: await activeViewType() }).toEqual({
        menu,
        active: 'mind-mapper-view',
      });
    }
  });
});
