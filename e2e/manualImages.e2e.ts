import { mkdirSync } from 'node:fs';
import { browser } from '@wdio/globals';
import type { WorkspaceLeaf } from 'obsidian';
import { settle, waitForCache, writeNote } from './helpers';

/**
 * User manual images (committed in docs/images/manual/): each one shows one thing, cropped by the
 * window size. Run with `npm run manual:images`; not part of `test:e2e`.
 */
const DIR = 'docs/images/manual';
const SIMPLE = 'demo/Simple note.md';
const TOUR = 'demo/Feature tour.md';

const LINKS_NOTE = 'Trip to Lisbon.md';
const LINKS_TEXT = `# Trip to Lisbon

## Bookings

- Flight on May 3
- Hotel by the river ^hotel

## Days

Day 1: old town and the castle.

---

Day 2: Belém, tickets under [[#Bookings]].

## Budget

1,200 € in total, [[#^hotel|hotel]] included.
`;

const LONG_NOTE = 'Reading notes.md';
const LONG_TEXT = `# Reading notes

## Quotes

- Short and clear.
- From the first chapter: good habits are small, repeated and boring, and that is exactly why they work. The author keeps coming back to one idea: make the next step so easy that you cannot say no to it. Put the running shoes by the door, keep the book on the pillow, prepare the lunch the evening before. None of these steps is impressive on its own; together they change the whole week. The last pages add a warning: a habit that depends on motivation breaks on the first bad day.
`;

const TREE_NOTE = 'Team offsite.md';
const TREE_TEXT = `---
mind-mapper-layout: top-to-bottom
---

# Team offsite

## Agenda

- Retro
- Roadmap

## Travel

- Train 8:10
- Back by 18:00

## Food

- Lunch booked
- Vegan options
`;

type Plugins = {
  plugins: { plugins: Record<string, { updateSettings(p: unknown): Promise<void> }> };
};

/** Resizes the current window's content through Electron (WebDriver window commands do not work in Obsidian). */
async function setWindowSize(width: number, height: number): Promise<void> {
  await browser.execute(
    (w, h) => {
      const electron = (
        window as unknown as {
          electron: {
            remote: { getCurrentWindow(): { setContentSize(w: number, h: number): void } };
          };
        }
      ).electron;
      electron.remote.getCurrentWindow().setContentSize(w, h);
    },
    width,
    height,
  );
  await browser.waitUntil(
    () =>
      browser.execute((w, h) => window.innerWidth === w && window.innerHeight === h, width, height),
    { timeout: 5000, timeoutMsg: `window is not ${width} x ${height}` },
  );
}

async function updateSettings(settings: Record<string, unknown>): Promise<void> {
  await browser.executeObsidian(async ({ app }, patch) => {
    await (app as unknown as Plugins).plugins.plugins['mind-mapper']?.updateSettings(patch);
  }, settings);
}

/**
 * The main area shows only the map of `notePath` (with the note on its left when `withNote`),
 * both sidebars closed. Waits for the root node and a settled layout.
 */
async function showMap(notePath: string, withNote = false): Promise<void> {
  await waitForCache(notePath);
  await browser.executeObsidian(
    async ({ app }, path, note) => {
      // keep one tab of the main area, close all others
      const leaves: WorkspaceLeaf[] = [];
      app.workspace.iterateRootLeaves((leaf) => {
        leaves.push(leaf);
      });
      const [first, ...others] = leaves;
      if (!first) throw new Error('no leaf in the main area');
      for (const leaf of others) leaf.detach();
      let mapLeaf: WorkspaceLeaf = first;
      if (note) {
        const file = app.vault.getFileByPath(path);
        if (!file) throw new Error(`missing ${path}`);
        await first.openFile(file, { active: true });
        mapLeaf = app.workspace.createLeafBySplit(first, 'vertical');
      }
      await mapLeaf.setViewState({ type: 'mind-mapper-view', active: true, state: { file: path } });
      // views in background tabs are deferred until revealed
      await app.workspace.revealLeaf(first);
      await app.workspace.revealLeaf(mapLeaf);
      app.workspace.leftSplit.collapse();
      app.workspace.rightSplit.collapse();
      app.workspace.setActiveLeaf(mapLeaf, { focus: true });
    },
    notePath,
    withNote,
  );
  await browser.$('.mind-mapper-node.is-root').waitForExist({ timeout: 15000 });
  await settle();
}

/** Fit to view through the map's own button (works whatever leaf is active), then settle. */
async function fit(): Promise<void> {
  await browser.$('.mind-mapper-controls button[aria-label="Fit to view"]').click();
  await browser.pause(400);
}

/** Moves the pointer to an empty spot: no hover highlight in the picture. */
async function movePointerAway(x: number, y: number): Promise<void> {
  await browser.action('pointer').move({ x, y }).perform();
}

async function shoot(name: string): Promise<void> {
  await browser.pause(500);
  await browser.saveScreenshot(`${DIR}/${name}.png`);
}

describe('user manual images', function () {
  before(async function () {
    mkdirSync(DIR, { recursive: true });
    await writeNote(LINKS_NOTE, LINKS_TEXT);
    await writeNote(LONG_NOTE, LONG_TEXT);
    await writeNote(TREE_NOTE, TREE_TEXT);
    // no window buttons and no status bar in the pictures
    await browser.execute(() => {
      const style = document.head.createEl('style', { attr: { id: 'manual-images' } });
      style.textContent = '.titlebar-button-container, .status-bar { display: none !important; }';
    });
  });

  beforeEach(async function () {
    await updateSettings({ defaultLayout: 'circle-clockwise', startCollapsed: false });
  });

  it('note and map side by side', async function () {
    await setWindowSize(1100, 480);
    await showMap(TREE_NOTE, true);
    await fit();
    await movePointerAway(850, 100);
    await shoot('note-and-map');
  });

  it('balanced layout', async function () {
    await setWindowSize(820, 480);
    await showMap(SIMPLE);
    await fit();
    await movePointerAway(400, 100);
    await shoot('layout-balanced');
  });

  it('top-to-bottom layout', async function () {
    // set by mind-mapper-layout in the note's frontmatter
    await setWindowSize(820, 440);
    await showMap(TREE_NOTE);
    await fit();
    await movePointerAway(400, 100);
    await shoot('layout-top-to-bottom');
  });

  it('collapsed branch and highlighted collapse button', async function () {
    await setWindowSize(820, 480);
    await showMap(SIMPLE);
    const toggle = 'Garden plans/Vegetables';
    await browser.$(`.mind-mapper-collapse[data-node-id="${toggle}"]`).click();
    await browser.$(`.mind-mapper-collapse[data-node-id="${toggle}"].is-collapsed`).waitForExist();
    await settle();
    await fit();
    await movePointerAway(400, 100);
    await shoot('collapsed');
  });

  it('links and a divider', async function () {
    await setWindowSize(820, 440);
    await showMap(LINKS_NOTE);
    await fit();
    await movePointerAway(400, 100);
    await shoot('links-and-divider');
  });

  it('clipped node with its expand icon', async function () {
    await setWindowSize(820, 500);
    await showMap(LONG_NOTE);
    await fit();
    await movePointerAway(400, 100);
    await shoot('clipped-node');
  });

  it('full screen', async function () {
    await setWindowSize(900, 560);
    await showMap(TOUR);
    await browser.$('.mind-mapper-controls button[aria-label="Toggle full screen"]').click();
    await browser.$('.mind-mapper-full-screen').waitForExist();
    await settle();
    // keep the controls visible: they fade after 2 s without mouse movement
    await movePointerAway(450, 300);
    await browser.pause(300);
    await browser.saveScreenshot(`${DIR}/full-screen.png`);
    await browser.keys('Escape');
  });

  it('settings', async function () {
    // Obsidian 1.15 opens the settings in their own window.
    const main = await browser.getWindowHandle();
    await browser.executeObsidianCommand('app:open-settings');
    await browser.waitUntil(async () => (await browser.getWindowHandles()).length > 1);
    const settings = (await browser.getWindowHandles()).find((h) => h !== main);
    if (!settings) throw new Error('no settings window');
    await browser.switchToWindow(settings);
    await setWindowSize(860, 600);
    // the window title holds the random name of the temporary vault
    await browser.execute(() => {
      const style = document.head.createEl('style');
      style.textContent = '.titlebar { display: none !important; }';
    });
    await browser.executeObsidian(async ({ app }) => {
      await (
        app as unknown as { setting: { openTabById(id: string): Promise<unknown> } }
      ).setting.openTabById('mind-mapper');
    });
    await movePointerAway(5, 5);
    await shoot('settings');
    await browser.closeWindow();
    await browser.switchToWindow(main);
  });
});
