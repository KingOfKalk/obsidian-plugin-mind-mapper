import { browser } from '@wdio/globals';
import type { WorkspaceLeaf } from 'obsidian';
import { byId, openMindMap, setWindowSize, settle, waitForAnimation, writeNote } from './helpers';

/**
 * Annotated reference images of docs/ui-elements.md (committed in docs/images/): every element
 * labelled with its ID by the dev command "Show element IDs". Needs a build with the dev code:
 * run with `npm run ui:images`; not part of `test:e2e`.
 */
const DIR = 'docs/images';
const NOTE = 'Trip planning.md';
const TEXT = `# Trip planning

## Bookings

- Flight on May 3
- Hotel by the river

## Days

Day 1: old town and the castle. ^day1

---

Day 2: Belém, by tram like on [[#^day1|day 1]].

## Packing

- Sunscreen
- Camera

## Checklist

\`\`\`text
passport
tickets
charger
adapter
umbrella
book
headphones
snacks
\`\`\`
`;

type Plugins = {
  plugins: { plugins: Record<string, { updateSettings(p: unknown): Promise<void> }> };
};

async function updateSettings(settings: Record<string, unknown>): Promise<void> {
  await browser.executeObsidian(async ({ app }, patch) => {
    await (app as unknown as Plugins).plugins.plugins['mind-mapper']?.updateSettings(patch);
  }, settings);
}

/** The map of NOTE alone in the main area, both sidebars closed. */
async function showMap(): Promise<void> {
  await openMindMap(NOTE);
  await browser.executeObsidian(({ app }) => {
    const others: WorkspaceLeaf[] = [];
    app.workspace.iterateRootLeaves((leaf) => {
      if (leaf.view.getViewType() !== 'mind-mapper-view') others.push(leaf);
    });
    for (const leaf of others) leaf.detach();
    app.workspace.leftSplit.collapse();
    app.workspace.rightSplit.collapse();
  });
  await settle();
  await fit();
}

async function fit(): Promise<void> {
  await browser.$(byId('controls.fit')).click();
  await waitForAnimation();
  await settle();
}

/** Turns the labels on, saves the picture, turns them off. */
async function shootLabelled(name: string): Promise<void> {
  await browser.executeObsidianCommand('mind-mapper:show-element-ids');
  await browser.$('.mind-mapper-dev-id-overlay').waitForExist({ timeout: 5000 });
  await browser.pause(500);
  await browser.saveScreenshot(`${DIR}/${name}.png`);
  await browser.executeObsidianCommand('mind-mapper:show-element-ids');
}

describe('UI element reference images', function () {
  before(async function () {
    await writeNote(NOTE, TEXT);
    await updateSettings({
      defaultLayout: 'left-to-right',
      startCollapsed: false,
      defaultTheme: 'rainbow',
      maxNodeHeight: 120,
    });
    // no window buttons and no status bar in the pictures
    await browser.execute(() => {
      const style = document.head.createEl('style');
      style.textContent = '.titlebar-button-container, .status-bar { display: none !important; }';
    });
  });

  it('map: nodes, lines and control bar', async function () {
    await setWindowSize(1200, 800);
    await showMap();
    await browser.$(`${byId('node.toggle')}[data-node-id="Trip planning/Packing"]`).click();
    await browser
      .$(`${byId('node.toggle')}[data-mm-state="collapsed"]`)
      .waitForExist({ timeout: 5000 });
    await settle();
    await fit();
    // 100 %: room for the slanted labels of the control bar below the map
    await browser.executeObsidianCommand('mind-mapper:reset-zoom');
    await waitForAnimation();
    // the expand button of the clipped code block shows on hover
    await browser.$(byId('node.block')).moveTo();
    await shootLabelled('ui-elements');
  });

  it('full screen, drilled in, a highlighted link', async function () {
    await setWindowSize(1200, 720);
    await showMap();
    await browser.$(byId('controls.full-screen')).click();
    await browser.$(byId('fullscreen.overlay')).waitForExist({ timeout: 5000 });
    await browser.execute(() => {
      document
        .querySelector<HTMLElement>(
          '.mind-mapper-node[data-node-id="Trip planning/Days"] .mind-mapper-node-content',
        )
        ?.click();
    });
    await browser.$(byId('controls.drill')).click();
    await waitForAnimation();
    await settle();
    await browser.execute(() => {
      const hit = document.querySelector('[data-mm-id="link.hit-area"]');
      const canvas = document.querySelector('[data-mm-id="map.canvas"]');
      const init = { bubbles: true, button: 0, pointerId: 1, clientX: 1, clientY: 1 };
      hit?.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
      canvas?.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    });
    await browser.$(byId('link.highlight')).waitForExist({ timeout: 5000 });
    // the control bar fades after 2 s without mouse movement
    await browser.action('pointer').move({ x: 600, y: 120 }).perform();
    await shootLabelled('ui-elements-full-screen');
    await browser.keys('Escape');
  });
});
