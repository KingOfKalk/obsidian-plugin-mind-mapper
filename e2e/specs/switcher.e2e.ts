import { browser, expect } from '@wdio/globals';
import {
  byId,
  nodeBoxes,
  openMindMap,
  settle,
  waitForCache,
  waitForMenu,
  writeNote,
} from '../helpers';

const NOTE = 'switcher.md';
const TEXT = [
  '---',
  'mind-mapper-layout: left-to-right',
  'mind-mapper-theme: ocean',
  '---',
  '# Switch',
  '',
  '## Alpha',
  '',
  'Alpha text.',
  '',
  '## Beta',
  '',
  'Beta text.',
  '',
  '## Gamma',
  '',
  'Gamma text.',
  '',
].join('\n');

const ROOT = 'Switch';
const ALPHA = 'Switch/Alpha';
const GAMMA = 'Switch/Gamma';

/** The plugin's level gap: the space between the root and its children in the growth direction. */
function levelGap(): Promise<number> {
  return browser.executeObsidian(({ app }) => {
    const plugin = (
      app as unknown as {
        plugins: { plugins: Record<string, { settings: { levelGap: number } }> };
      }
    ).plugins.plugins['mind-mapper'];
    if (!plugin) throw new Error('plugin not loaded');
    return plugin.settings.levelGap;
  });
}

/**
 * The side of the root `child` grows on (world coordinates): the one where the gap between the
 * two boxes is the level gap (a child of a horizontal layout may also be above the root box).
 */
async function side(child: string): Promise<string> {
  const boxes = await nodeBoxes();
  const r = boxes.find((b) => b.id === ROOT);
  const c = boxes.find((b) => b.id === child);
  if (!r || !c) throw new Error(`missing ${ROOT} or ${child}`);
  const gap = await levelGap();
  const gaps: Record<string, number> = {
    right: c.x - (r.x + r.width),
    left: r.x - (c.x + c.width),
    below: c.y - (r.y + r.height),
    above: r.y - (c.y + c.height),
  };
  const sides = Object.keys(gaps).filter((s) => Math.abs((gaps[s] ?? 0) - gap) < 1);
  return sides.join(' or ') || `none of ${JSON.stringify(gaps)}`;
}

/** The note's bytes as hex and its modification time. */
async function noteFile(): Promise<{ bytes: string; mtime: number }> {
  return await browser.executeObsidian(async ({ app }, path) => {
    const file = app.vault.getFileByPath(path);
    if (!file) throw new Error(`no note ${path}`);
    const data = new Uint8Array(await app.vault.adapter.readBinary(path));
    return {
      bytes: Array.from(data, (b) => b.toString(16).padStart(2, '0')).join(''),
      mtime: file.stat.mtime,
    };
  }, NOTE);
}

function themeClass(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelector('.mind-mapper-canvas')?.classList ?? []).filter((c) =>
      c.startsWith('mind-mapper-theme-'),
    ),
  );
}

function alphaBackground(): Promise<string> {
  return browser.execute(() => {
    const el = document.querySelector('.mind-mapper-node[data-node-id="Switch/Alpha"]');
    if (!el) throw new Error('no Alpha node');
    return getComputedStyle(el).backgroundColor;
  });
}

type MenuButton = 'controls.layout' | 'controls.theme';

const button = (id: MenuButton) => browser.$(byId(id));

async function isActive(id: MenuButton): Promise<boolean> {
  const active = ((await button(id).getAttribute('class')) ?? '').split(' ').includes('is-active');
  // The state attribute always agrees with the class: `active`, else absent.
  expect(await button(id).getAttribute('data-mm-state')).toBe(active ? 'active' : null);
  return active;
}

/** Titles of the open menu's items, the checked ones marked with "*". */
function menuItems(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll('.menu .menu-item')).map(
      (el) =>
        (el.querySelector('.menu-item-title')?.textContent ?? '') +
        (el.classList.contains('mod-checked') ? ' *' : ''),
    ),
  );
}

/** Clicks the item `title` of the open menu. */
async function clickMenuItem(title: string): Promise<void> {
  for (const item of await browser.$$('.menu .menu-item')) {
    if ((await item.$('.menu-item-title').getText()) !== title) continue;
    await item.click();
    await browser.$('.menu').waitForExist({ reverse: true, timeout: 5000 });
    return;
  }
  throw new Error(`no menu item ${title}`);
}

/** Opens the menu of the control `id` and clicks `item`. */
async function choose(id: MenuButton, item: string): Promise<void> {
  await button(id).click();
  await browser.$('.menu').waitForExist({ timeout: 5000 });
  await clickMenuItem(item);
}

async function setFrontmatter(key: string, value: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, path, k, v) => {
      const file = app.vault.getFileByPath(path);
      if (!file) throw new Error(`no note ${path}`);
      await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        frontmatter[k] = v;
      });
    },
    NOTE,
    key,
    value,
  );
}

/** The map leaf's saved view state as written to `.obsidian/workspace.json`. */
async function savedWorkspace(): Promise<string> {
  return await browser.executeObsidian(({ app }) =>
    app.vault.adapter.read('.obsidian/workspace.json'),
  );
}

describe('layout and color theme switcher', function () {
  beforeEach(async function () {
    await writeNote(NOTE, TEXT);
    await openMindMap(NOTE);
    await settle();
  });

  it('the layout menu lists the seven layouts, the current one checked; each choice changes the node positions, never the note', async function () {
    const before = await noteFile();
    expect(await isActive('controls.layout')).toBe(false);
    await button('controls.layout').click();
    await waitForMenu();
    expect(await menuItems()).toEqual([
      'Balanced clockwise',
      'Balanced counter-clockwise',
      'Left → right *',
      'Right → left',
      'Top → bottom',
      'Bottom → top',
      'Kanban',
      "Use the note's layout",
    ]);
    await browser.keys('Escape');
    await browser.$('.menu').waitForExist({ reverse: true, timeout: 5000 });

    const expected: [string, string, string][] = [
      // [menu item, side of Alpha, side of Gamma]
      ['Top → bottom', 'below', 'below'],
      ['Bottom → top', 'above', 'above'],
      ['Right → left', 'left', 'left'],
      // Three branches: two on the right, one on the left (counter-clockwise mirrored).
      ['Balanced clockwise', 'right', 'left'],
      ['Balanced counter-clockwise', 'left', 'right'],
      // Kanban: the columns below the headline, the level gap between them.
      ['Kanban', 'below', 'below'],
      ['Left → right', 'right', 'right'],
    ];
    for (const [item, alpha, gamma] of expected) {
      await choose('controls.layout', item);
      await settle();
      expect({ item, alpha: await side(ALPHA), gamma: await side(GAMMA) }).toEqual({
        item,
        alpha,
        gamma,
      });
      expect(await isActive('controls.layout')).toBe(true);
    }
    expect(await noteFile()).toEqual(before);
  });

  it('a theme choice changes the colors live without moving a node; the note is unchanged', async function () {
    const before = await noteFile();
    expect(await themeClass()).toEqual(['mind-mapper-theme-ocean']);
    const ocean = await alphaBackground();
    const boxes = await nodeBoxes();
    await button('controls.theme').click();
    await waitForMenu();
    expect(await menuItems()).toEqual([
      'None',
      'Rainbow',
      'Ocean *',
      'Forest',
      'Accent color',
      "Use the note's theme",
    ]);
    await browser.keys('Escape');
    await choose('controls.theme', 'Rainbow');
    expect(await themeClass()).toEqual(['mind-mapper-theme-rainbow']);
    expect(await alphaBackground()).not.toBe(ocean);
    expect(await nodeBoxes()).toEqual(boxes);
    expect(await isActive('controls.theme')).toBe(true);
    expect(await isActive('controls.layout')).toBe(false);
    expect(await noteFile()).toEqual(before);
  });

  it('the overrides survive an Obsidian restart; "Use the note\'s …" goes back to the frontmatter', async function () {
    await choose('controls.layout', 'Top → bottom');
    await choose('controls.theme', 'Accent color');
    await settle();
    // Obsidian saves the workspace debounced.
    await browser.waitUntil(
      async () => {
        const saved = await savedWorkspace();
        return saved.includes('"layout": "top-to-bottom"') && saved.includes('"theme": "accent"');
      },
      { timeout: 15000, timeoutMsg: 'the overrides were not saved in the workspace' },
    );

    await browser.reloadObsidian();
    await waitForCache(NOTE);
    await browser.executeObsidian(async ({ app }) => {
      const leaf = app.workspace.getLeavesOfType('mind-mapper-view')[0];
      if (!leaf) throw new Error('the map tab was not restored');
      await app.workspace.revealLeaf(leaf);
    });
    await browser.$('.mind-mapper-node.is-root').waitForExist({ timeout: 15000 });
    await settle();
    expect(await side(ALPHA)).toBe('below');
    expect(await themeClass()).toEqual(['mind-mapper-theme-accent']);
    expect(await isActive('controls.layout')).toBe(true);
    expect(await isActive('controls.theme')).toBe(true);

    await choose('controls.layout', "Use the note's layout");
    await settle();
    expect(await side(ALPHA)).toBe('right');
    expect(await isActive('controls.layout')).toBe(false);
    await choose('controls.theme', "Use the note's theme");
    expect(await themeClass()).toEqual(['mind-mapper-theme-ocean']);
    expect(await isActive('controls.theme')).toBe(false);
  });

  it('frontmatter edits do not replace an active override; without one they apply', async function () {
    await choose('controls.layout', 'Top → bottom');
    await choose('controls.theme', 'Forest');
    await setFrontmatter('mind-mapper-layout', 'right-to-left');
    await setFrontmatter('mind-mapper-theme', 'none');
    // Live update is debounced.
    await browser.pause(1000);
    await settle();
    expect(await side(ALPHA)).toBe('below');
    expect(await themeClass()).toEqual(['mind-mapper-theme-forest']);

    await choose('controls.layout', "Use the note's layout");
    await choose('controls.theme', "Use the note's theme");
    await settle();
    expect(await side(ALPHA)).toBe('left');
    expect(await themeClass()).toEqual(['mind-mapper-theme-none']);
  });

  it('commands: "Next layout" and "Next color theme" cycle, "Change layout…" opens the menu', async function () {
    await browser.executeObsidianCommand('mind-mapper:next-layout');
    await settle();
    expect(await side(ALPHA)).toBe('left');
    await browser.executeObsidianCommand('mind-mapper:next-theme');
    expect(await themeClass()).toEqual(['mind-mapper-theme-forest']);
    expect(await isActive('controls.layout')).toBe(true);
    expect(await isActive('controls.theme')).toBe(true);

    await browser.executeObsidianCommand('mind-mapper:change-layout');
    await browser.$('.menu').waitForExist({ timeout: 5000 });
    expect(await menuItems()).toContain('Right → left *');
    await clickMenuItem('Top → bottom');
    await settle();
    expect(await side(ALPHA)).toBe('below');

    // Keyboard only (a hotkey user), the pointer away from where the menu opens.
    await browser.action('pointer').move({ x: 5, y: 5 }).perform();
    await browser.executeObsidianCommand('mind-mapper:change-theme');
    await waitForMenu();
    expect(await menuItems()).toContain('Forest *');
    const selected = () =>
      browser.execute(
        () => document.querySelector('.menu .menu-item.selected .menu-item-title')?.textContent,
      );
    // The arrow keys walk the menu (from the top), Enter chooses.
    await browser.keys('ArrowDown');
    await browser.waitUntil(async () => (await selected()) === 'None', {
      timeout: 5000,
      timeoutMsg: 'ArrowDown did not select the first theme',
    });
    await browser.keys('Enter');
    await browser.$('.menu').waitForExist({ reverse: true, timeout: 5000 });
    expect(await themeClass()).toEqual(['mind-mapper-theme-none']);
  });

  it('the buttons work in full screen', async function () {
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await browser.$('.mind-mapper-full-screen').waitForExist({ timeout: 5000 });
    await choose('controls.layout', 'Bottom → top');
    await settle();
    expect(await side(ALPHA)).toBe('above');
    await choose('controls.theme', 'None');
    expect(await themeClass()).toEqual(['mind-mapper-theme-none']);
    await browser.keys('Escape');
    await browser.$('.mind-mapper-full-screen').waitForExist({ reverse: true, timeout: 5000 });
  });
});
