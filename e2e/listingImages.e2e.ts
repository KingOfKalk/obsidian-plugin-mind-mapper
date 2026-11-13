import { mkdirSync } from 'node:fs';
import { browser } from '@wdio/globals';
import type { WorkspaceLeaf } from 'obsidian';
import { byId, setWindowSize, settle, waitForAnimation, waitForCache, writeNote } from './helpers';

/**
 * Screenshots for the Obsidian community directory listing (committed in docs/images/listing/):
 * five images of exactly 1200 x 800 px (the listing's size), no annotations. Run with
 * `npm run listing:images`; not part of `test:e2e`.
 */
const DIR = 'docs/images/listing';
const WIDTH = 1200;
const HEIGHT = 800;
const TOUR = 'demo/Feature tour.md';
const TAGS = 'demo/Nested tags.md';

const OFFSITE_NOTE = 'Team offsite.md';
const OFFSITE_TEXT = `# Team offsite

## Agenda

- Retro
- Roadmap for next quarter
- Open questions

## Travel

- Train at 8:10
- Back by 18:00

## Food

- Lunch is booked
- Vegan options for three people
`;

const KANBAN_NOTE = 'Product launch.md';
const KANBAN_TEXT = `---
mind-mapper-layout: kanban
---

# Product launch

## To do

- Write the press release
  - Draft
  - Review with legal
- Book the venue #area/events

---

## Doing

- Website redesign #team/design
- Beta feedback
  - Collect from 20 users

## Done

- Name and logo
- Launch date set
`;

type Plugins = {
  plugins: { plugins: Record<string, { updateSettings(p: unknown): Promise<void> }> };
};

/** Obsidian's base color scheme and the map's color theme and layout. */
async function useLook(
  mode: 'light' | 'dark',
  theme: string,
  layout = 'circle-clockwise',
): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, base, name, defaultLayout) => {
      (app as unknown as { changeTheme(theme: string): void }).changeTheme(
        base === 'dark' ? 'obsidian' : 'moonstone',
      );
      await (app as unknown as Plugins).plugins.plugins['mind-mapper']?.updateSettings({
        defaultTheme: name,
        defaultLayout,
        startCollapsed: false,
      });
    },
    mode,
    theme,
    layout,
  );
  await browser.waitUntil(
    async () =>
      (await browser.execute(() => document.body.classList.contains('theme-dark'))) ===
      (mode === 'dark'),
    { timeout: 5000, timeoutMsg: `Obsidian is not in ${mode} mode` },
  );
  // CSS transitions are off for 200 ms after a switch
  await browser.pause(300);
}

/**
 * The main area shows only the map of `notePath` (with the note on its left when `withNote`),
 * both sidebars closed. Waits for the root node and a settled layout.
 */
async function showMap(notePath: string, withNote = false): Promise<void> {
  await waitForCache(notePath);
  await browser.executeObsidian(
    async ({ app }, path, note) => {
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

async function fit(): Promise<void> {
  await browser.$(byId('controls.fit')).click();
  await waitForAnimation();
  await settle();
}

/** Selects the node with this ID (as a click on its content does). */
async function selectNode(id: string): Promise<void> {
  await browser.execute((nodeId) => {
    document
      .querySelector<HTMLElement>(
        `.mind-mapper-node[data-node-id="${nodeId}"] .mind-mapper-node-content`,
      )
      ?.click();
  }, id);
}

/** Pointer on an empty spot (no hover highlight), then the picture. */
async function shoot(name: string, pointer = { x: WIDTH - 30, y: HEIGHT - 30 }): Promise<void> {
  await browser.action('pointer').move(pointer).perform();
  await browser.pause(600);
  await browser.saveScreenshot(`${DIR}/${name}.png`);
}

describe('community directory listing images', function () {
  before(async function () {
    mkdirSync(DIR, { recursive: true });
    await writeNote(OFFSITE_NOTE, OFFSITE_TEXT);
    await writeNote(KANBAN_NOTE, KANBAN_TEXT);
    // no window buttons, status bar, vault name or inline title (the note has its own H1) in the pictures
    await browser.execute(() => {
      const style = document.head.createEl('style', { attr: { id: 'listing-images' } });
      style.textContent =
        '.titlebar-button-container, .status-bar, .workspace-drawer-vault-switcher, .titlebar-text, .inline-title { display: none !important; }';
    });
    await setWindowSize(WIDTH, HEIGHT);
  });

  it('1 note and live map side by side (light)', async function () {
    await useLook('light', 'rainbow', 'left-to-right');
    await showMap(OFFSITE_NOTE, true);
    await fit();
    await shoot('1-note-and-map');
  });

  it('2 rich map in a color theme (dark)', async function () {
    await useLook('dark', 'rainbow');
    await showMap(TOUR);
    await fit();
    await shoot('2-rich-map-dark');
  });

  it('3 kanban layout (light)', async function () {
    await useLook('light', 'ocean');
    await showMap(KANBAN_NOTE);
    await fit();
    await shoot('3-kanban');
  });

  it('4 nested tags (dark)', async function () {
    await useLook('dark', 'forest', 'left-to-right');
    await showMap(TAGS);
    await fit();
    await shoot('4-nested-tags');
  });

  it('5 full screen with a highlighted link (light)', async function () {
    await useLook('light', 'ocean');
    await showMap(TOUR);
    await browser.$(byId('controls.full-screen')).click();
    await browser.$(byId('fullscreen.overlay')).waitForExist({ timeout: 5000 });
    await fit();
    // a press on the first link's hit area highlights it (as in the UI element images)
    await browser.execute(() => {
      const hit = document.querySelector('[data-mm-id="link.hit-area"]');
      const canvas = document.querySelector('[data-mm-id="map.canvas"]');
      const init = { bubbles: true, button: 0, pointerId: 1, clientX: 1, clientY: 1 };
      hit?.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
      canvas?.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    });
    await browser.$(byId('link.highlight')).waitForExist({ timeout: 5000 });
    await settle();
    // the control bar fades after 2 s without mouse movement
    await shoot('5-full-screen-link', { x: WIDTH / 2, y: 120 });
    await browser.keys('Escape');
  });
});
