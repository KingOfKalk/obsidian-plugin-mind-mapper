import { mkdirSync, readFileSync } from 'node:fs';
import { browser } from '@wdio/globals';
import { openMindMap, setObsidianLanguage, settle, waitForCache, writeNote } from './helpers';
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
    'dividers-headings',
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

  it('start collapsed', async function () {
    const text = readFileSync('test-vault/fixtures/worked-example.md', 'utf8');
    await writeNote('start-collapsed.md', `---\nmind-mapper-collapsed: true\n---\n${text}`);
    await openMindMap('start-collapsed.md');
    await settle();
    await browser.saveScreenshot(`${dir}/start-collapsed.png`);
  });

  // Colour themes in light and dark mode, in full screen so the nodes are readable.
  for (const theme of ['rainbow', 'accent', 'ocean', 'forest']) {
    for (const mode of ['light', 'dark'] as const) {
      it(`theme ${theme} ${mode}`, async function () {
        await useTheme(theme, mode);
        await openMindMap('fixtures/worked-example.md');
        await settle();
        await saveFullScreenShot(`${dir}/theme-${theme}-${mode}.png`);
      });
    }
  }

  // Eight levels: rainbow starts again at level 7, accent (4 steps) at level 5.
  for (const [theme, mode] of [
    ['rainbow', 'light'],
    ['rainbow', 'dark'],
    ['accent', 'light'],
    ['accent', 'dark'],
  ] as const) {
    it(`theme ${theme} ${mode}, deep nesting`, async function () {
      await useTheme(theme, mode);
      await writeNote(
        'theme-deep.md',
        [
          '---',
          'mind-mapper-layout: left-to-right',
          '---',
          '# Deep',
          '## Level 1',
          '### Level 2',
          '#### Level 3',
          '##### Level 4',
          '###### Level 5',
          '- Level 6',
          '  - Level 7',
          '    - Level 8',
          '## Level 1 again',
          'A paragraph on level 2.',
          '',
        ].join('\n'),
      );
      await openMindMap('theme-deep.md');
      await settle();
      await saveFullScreenShot(`${dir}/theme-${theme}-deep-${mode}.png`);
    });
  }

  // Clipped nodes: the expand button takes the tinted node background.
  for (const mode of ['light', 'dark'] as const) {
    it(`theme rainbow ${mode}, clipped nodes`, async function () {
      await useTheme('rainbow', mode);
      await openMindMap('fixtures/long-content.md');
      await settle();
      await saveFullScreenShot(`${dir}/theme-rainbow-clipped-${mode}.png`);
    });
  }

  // Loud palette (see LOUD_PALETTE): wrong, missing or leaking colours stand out. Review by eye.
  const deepNote = [
    '---',
    'mind-mapper-layout: left-to-right',
    '---',
    '# Deep',
    '## Level 1',
    '### Level 2',
    '#### Level 3',
    '##### Level 4',
    '###### Level 5',
    '- Level 6',
    '  - Level 7',
    '    - Level 8',
    '## Level 1 again',
    'A paragraph on level 2.',
    '',
  ].join('\n');

  it('loud rainbow, deep map with a selected node', async function () {
    await useTheme('rainbow', 'light');
    await writeNote('theme-deep.md', deepNote);
    await openMindMap('theme-deep.md');
    await settle();
    await browser.execute(() => {
      document
        .querySelector<HTMLElement>('.mind-mapper-node[data-level="3"] .mind-mapper-node-content')
        ?.click();
    });
    await settle();
    await withLoudPalette(() => saveFullScreenShot(`${dir}/loud-rainbow-deep.png`));
  });

  it('loud rainbow, collapsed branch, cross-links and divider', async function () {
    await useTheme('rainbow', 'light');
    await openMindMap('demo/Feature tour.md');
    await settle();
    await browser.execute(() => {
      const node = Array.from(
        document.querySelectorAll<HTMLElement>('.mind-mapper-node[data-node-id]'),
      ).find((el) => el.dataset.nodeId?.endsWith('/Timeline'));
      document
        .querySelector<HTMLElement>(`.mind-mapper-collapse[data-node-id="${node?.dataset.nodeId}"]`)
        ?.click();
    });
    await settle();
    await withLoudPalette(async () => {
      await browser.executeObsidianCommand('mind-mapper:fit-to-view');
      await browser.pause(300);
      await browser.saveScreenshot(`${dir}/loud-rainbow-tour-window.png`);
      await saveFullScreenShot(`${dir}/loud-rainbow-tour.png`);
    });
  });

  it('loud rainbow, clipped nodes', async function () {
    await useTheme('rainbow', 'light');
    await openMindMap('fixtures/long-content.md');
    await settle();
    await withLoudPalette(() => saveFullScreenShot(`${dir}/loud-rainbow-clipped.png`));
  });

  for (const theme of ['none', 'accent', 'ocean', 'forest']) {
    it(`loud ${theme}, tour`, async function () {
      await useTheme(theme, 'light');
      await openMindMap('demo/Feature tour.md');
      await settle();
      await withLoudPalette(() => saveFullScreenShot(`${dir}/loud-${theme}-tour.png`));
    });
  }

  it('loud none, full screen lists', async function () {
    await useTheme('none', 'light');
    await openMindMap('fixtures/lists.md');
    await settle();
    await withLoudPalette(() => saveFullScreenShot(`${dir}/loud-none-full-screen.png`));
  });

  it('back to light mode without a colour theme', async function () {
    await useTheme('none', 'light');
  });

  it('settings', async function () {
    await saveSettingsScreenshots(`${dir}/settings`);
  });

  // Last: restarts Obsidian in German.
  it('German UI', async function () {
    await setObsidianLanguage('de');
    await openMindMap('fixtures/worked-example.md');
    await settle();
    await browser.saveScreenshot(`${dir}/german-map.png`);
    await saveSettingsScreenshots(`${dir}/german-settings`);
    await setObsidianLanguage(null);
  });
});

/**
 * Loud palette (test-only, never shipped): Obsidian's real colours are subtle, so a colour on the
 * wrong element is hard to see. These overrides give every variable that styles.css uses its own
 * unmistakable colour. Legend (variable -> colour; the plugin element that uses it):
 *   --color-red     magenta  #ff00ff  rainbow level 1 / 7, forest/ocean: unused
 *   --color-orange  lime     #00ff00  rainbow level 2 / 8, forest level 3
 *   --color-yellow  blue     #0000ff  rainbow level 3, forest level 2
 *   --color-green   yellow   #ffff00  rainbow level 4, ocean level 3, forest level 1
 *   --color-blue    red      #ff0000  rainbow level 5, ocean level 1
 *   --color-cyan    black    #000000  ocean level 2
 *   --color-purple  cyan     #00ffff  rainbow level 6, ocean level 4
 *   --color-pink    orange   #ff8000  (unused by the plugin)
 *   --interactive-accent  violet   #8000ff  accent theme, cross-links, selection ring, collapsed badge, hover
 *   --text-on-accent      gold     #ffcc00  count in the collapsed badge
 *   --text-faint          sky blue #00a0ff  edges without a colour theme
 *   --hr-color            teal     #008080  dividers
 *   --background-modifier-border  brown #996633  node border (no theme), skeleton stroke, collapse button and controls border
 *   --background-primary  pale yellow #ffffcc  canvas, nodes (10 % tint base), buttons, controls
 *   --background-secondary pale pink  #ffccee  skeleton rects below 20 % zoom
 *   --text-normal         dark purple #330066  node text, button hover
 *   --text-muted          dark green  #006633  canvas text, collapse count, controls
 *   --text-error          raspberry   #cc0066  render-error node border
 */
const LOUD_PALETTE: Record<string, string> = {
  '--color-red': '#ff00ff',
  '--color-red-rgb': '255, 0, 255',
  '--color-orange': '#00ff00',
  '--color-orange-rgb': '0, 255, 0',
  '--color-yellow': '#0000ff',
  '--color-yellow-rgb': '0, 0, 255',
  '--color-green': '#ffff00',
  '--color-green-rgb': '255, 255, 0',
  '--color-blue': '#ff0000',
  '--color-blue-rgb': '255, 0, 0',
  '--color-cyan': '#000000',
  '--color-cyan-rgb': '0, 0, 0',
  '--color-purple': '#00ffff',
  '--color-purple-rgb': '0, 255, 255',
  '--color-pink': '#ff8000',
  '--color-pink-rgb': '255, 128, 0',
  '--color-accent': '#8000ff',
  '--interactive-accent': '#8000ff',
  '--interactive-accent-hover': '#8000ff',
  '--text-on-accent': '#ffcc00',
  '--text-faint': '#00a0ff',
  '--hr-color': '#008080',
  '--background-modifier-border': '#996633',
  '--background-primary': '#ffffcc',
  '--background-secondary': '#ffccee',
  '--text-normal': '#330066',
  '--text-muted': '#006633',
  '--text-error': '#cc0066',
};

/** Runs `shoot` with the loud palette injected (light mode); the style is removed afterwards. */
async function withLoudPalette(shoot: () => Promise<void>): Promise<void> {
  const css = Object.entries(LOUD_PALETTE)
    .map(([name, value]) => `${name}: ${value} !important;`)
    .join(' ');
  await browser.execute((rules) => {
    const style = document.createElement('style');
    style.id = 'loud-palette';
    style.textContent = `body, body.theme-light, body.theme-dark { ${rules} }`;
    document.head.appendChild(style);
  }, css);
  try {
    await browser.pause(300);
    await shoot();
  } finally {
    await browser.execute(() => document.getElementById('loud-palette')?.remove());
  }
}

/** Full screen fits the map to the whole window; Esc leaves it again. */
async function saveFullScreenShot(path: string): Promise<void> {
  await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
  await browser.pause(300);
  await browser.saveScreenshot(path);
  await browser.keys('Escape');
}

/** The plugin's default colour theme and Obsidian's base theme (moonstone light, obsidian dark). */
async function useTheme(theme: string, mode: 'light' | 'dark'): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, name, base) => {
      // Settings > Appearance > Base color scheme.
      (app as unknown as { changeTheme(theme: string): void }).changeTheme(
        base === 'dark' ? 'obsidian' : 'moonstone',
      );
      const plugins = (
        app as unknown as {
          plugins: { plugins: Record<string, { updateSettings(p: unknown): Promise<void> }> };
        }
      ).plugins.plugins;
      await plugins['mind-mapper']?.updateSettings({
        defaultTheme: name,
        defaultLayout: 'circle-clockwise',
      });
    },
    theme,
    mode,
  );
  await browser.waitUntil(
    async () =>
      (await browser.execute(() => document.body.classList.contains('theme-dark'))) ===
      (mode === 'dark'),
    { timeout: 5000, timeoutMsg: `Obsidian is not in ${mode} mode` },
  );
  // CSS transitions are off for 200 ms after a switch.
  await browser.pause(300);
}

/**
 * Obsidian 1.15 opens the settings in their own window; shoots the Mind Mapper tab there:
 * `<path>.png` from the top, `<path>-bottom.png` scrolled to the end (the About group).
 */
async function saveSettingsScreenshots(path: string): Promise<void> {
  const main = await browser.getWindowHandle();
  await browser.executeObsidianCommand('app:open-settings');
  await browser.waitUntil(async () => (await browser.getWindowHandles()).length > 1);
  const settings = (await browser.getWindowHandles()).find((h) => h !== main);
  if (!settings) throw new Error('no settings window');
  await browser.switchToWindow(settings);
  await browser.executeObsidian(async ({ app }) => {
    await (
      app as unknown as { setting: { openTabById(id: string): Promise<unknown> } }
    ).setting.openTabById('mind-mapper');
  });
  await browser.pause(500);
  await browser.saveScreenshot(`${path}.png`);
  await browser.execute(() => {
    const rows = document.querySelectorAll('.vertical-tab-content .setting-item');
    rows[rows.length - 1]?.scrollIntoView({ block: 'end' });
  });
  await browser.pause(300);
  await browser.saveScreenshot(`${path}-bottom.png`);
  await browser.closeWindow();
  await browser.switchToWindow(main);
}
