import { mkdirSync, readFileSync } from 'node:fs';
import { docsMappings } from '../scripts/sandbox-vault.mjs';
import { browser } from '@wdio/globals';
import {
  byId,
  openMindMap,
  openNote,
  setObsidianLanguage,
  settle,
  waitForAnimation,
  waitForCache,
  waitForMenu,
  writeNote,
} from './helpers';
import { generateNote } from './perf/generateNote';

/** Nine first-level branches with a paragraph, a code block, a table and a callout below. */
const branchesNote = [
  '# Branches',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((i) => [
    `## Branch ${i}`,
    `Text of branch ${i}.`,
    `### Detail ${i}`,
    i % 3 === 0
      ? '```js\nconst branch = ' + i + ';\n```'
      : i % 3 === 1
        ? `| a | b |\n| - | - |\n| ${i} | x |`
        : `> [!note] Callout ${i}\n> Inside.`,
    `- Item ${i}`,
    '  - Nested item',
  ]),
  '',
].join('\n\n');

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
      await waitForAnimation();
      await browser.pause(300);
      await browser.saveScreenshot(`${dir}/${note}.png`);
    });
  }

  it('welcome', async function () {
    await openMindMap('Welcome.md');
    await settle();
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await browser.executeObsidianCommand('mind-mapper:fit-to-view');
    await waitForAnimation();
    await browser.pause(300);
    await browser.saveScreenshot(`${dir}/welcome.png`);
    await browser.keys('Escape');
  });

  it('dividers at 100 %', async function () {
    await openMindMap('fixtures/thematic-breaks.md');
    await settle();
    await browser.executeObsidianCommand('mind-mapper:reset-zoom');
    await browser.executeObsidianCommand('mind-mapper:back-to-root');
    await waitForAnimation();
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
    'kanban',
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
        await waitForAnimation();
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

  it('images: thumbnail node, inline icon, icon in a table', async function () {
    await writeNote(
      'inline-images.md',
      [
        '# Images',
        '',
        '![[pixel.png]]',
        '',
        'Icon ![[launch-banner.svg|16]] inside a paragraph.',
        '',
        '| Icon | Name |',
        '| - | - |',
        '| ![[launch-banner.svg\\|16]] | banner |',
        '',
      ].join('\n'),
    );
    await openMindMap('inline-images.md');
    await settle();
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await browser.executeObsidianCommand('mind-mapper:fit-to-view');
    await waitForAnimation();
    await browser.pause(300);
    await browser.saveScreenshot(`${dir}/inline-images.png`);
    await browser.keys('Escape');
  });

  it('update error notice', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getFileByPath('fixtures/worked-example.md');
      const cache = file && app.metadataCache.getFileCache(file);
      if (!file || !cache) return;
      // A cache the parser cannot read: the map keeps its last version with a notice.
      app.metadataCache.trigger('changed', file, await app.vault.cachedRead(file), {
        ...cache,
        sections: [{ type: 'paragraph' }],
      });
    });
    await browser.$(byId('map.update-error')).waitForDisplayed({ timeout: 5000 });
    await browser.saveScreenshot(`${dir}/update-error.png`);
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
    await waitForAnimation();
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
    await waitForAnimation();
    await browser.pause(300);
    await browser.saveScreenshot(`${dir}/collapsed.png`);
  });

  it('start collapsed', async function () {
    const text = readFileSync('tests/vault/fixtures/worked-example.md', 'utf8');
    await writeNote('start-collapsed.md', `---\nmind-mapper-collapsed: true\n---\n${text}`);
    await openMindMap('start-collapsed.md');
    await settle();
    await browser.saveScreenshot(`${dir}/start-collapsed.png`);
  });

  // Zoom controls and a fit that keeps the badges of a collapsed map inside the margin.
  for (const mode of ['light', 'dark'] as const) {
    it(`zoom controls and fitted collapsed map ${mode}`, async function () {
      await useTheme('rainbow', mode);
      await openMindMap('fixtures/numbered.md');
      await settle();
      await browser.executeObsidianCommand('mind-mapper:collapse-all');
      await settle();
      await browser.executeObsidianCommand('mind-mapper:fit-to-view');
      await waitForAnimation();
      await browser.pause(300);
      await browser.saveScreenshot(`${dir}/fit-collapsed-${mode}.png`);
      await saveFullScreenShot(`${dir}/fit-collapsed-full-screen-${mode}.png`);
      await saveControlsShots(`${dir}/controls-${mode}`);
      await browser.executeObsidianCommand('mind-mapper:expand-all');
    });
  }

  // Color themes in light and dark mode, in full screen so the nodes are readable.
  for (const theme of ['rainbow', 'ocean', 'forest', 'accent', 'none']) {
    for (const mode of ['light', 'dark'] as const) {
      it(`theme ${theme} ${mode}`, async function () {
        await useTheme(theme, mode);
        await openMindMap('fixtures/worked-example.md');
        await settle();
        await saveFullScreenShot(`${dir}/theme-${theme}-${mode}.png`);
      });
    }
  }

  // Eight levels: level 1 filled, level 2 tinted, level 3 and deeper plain text, all in the branch color.
  for (const [theme, mode] of [
    ['rainbow', 'light'],
    ['rainbow', 'dark'],
    ['none', 'light'],
    ['none', 'dark'],
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

  // Nine first-level branches: rainbow (7 colors) starts again at branch 8; blocks at level 3.
  for (const mode of ['light', 'dark'] as const) {
    it(`theme rainbow ${mode}, nine branches`, async function () {
      await useTheme('rainbow', mode);
      await writeNote('theme-branches.md', branchesNote);
      await openMindMap('theme-branches.md');
      await settle();
      await saveFullScreenShot(`${dir}/theme-rainbow-branches-${mode}.png`);
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

  it('loud rainbow, nine branches', async function () {
    await useTheme('rainbow', 'light');
    await writeNote('theme-branches.md', branchesNote);
    await openMindMap('theme-branches.md');
    await settle();
    await withLoudPalette(() => saveFullScreenShot(`${dir}/loud-rainbow-branches.png`));
  });

  it('loud none, nine branches', async function () {
    await useTheme('none', 'light');
    await writeNote('theme-branches.md', branchesNote);
    await openMindMap('theme-branches.md');
    await settle();
    await withLoudPalette(() => saveFullScreenShot(`${dir}/loud-none-branches.png`));
  });

  // Loud palette (see LOUD_PALETTE): wrong, missing or leaking colors stand out. Review by eye.
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
      await waitForAnimation();
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

  it('loud controls', async function () {
    await useTheme('rainbow', 'light');
    await openMindMap('fixtures/worked-example.md');
    await settle();
    // 100 % is a preset: the menu shows it checked.
    await browser.executeObsidianCommand('mind-mapper:reset-zoom');
    await waitForAnimation();
    await withLoudPalette(() => saveControlsShots(`${dir}/loud-controls`));
  });

  // Issue #21: link lines behind the nodes (none through the root text), then a clicked link line
  // above them with its ends ringed (light, dark and loud palette).
  for (const [mode, loud] of [
    ['light', false],
    ['dark', false],
    ['light', true],
  ] as const) {
    it(`link highlight ${loud ? 'loud' : mode}`, async function () {
      await useTheme('rainbow', mode);
      await openMindMap('fixtures/crosslinks.md');
      await settle();
      await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
      const name = (state: string) =>
        `${dir}/${loud ? `loud-crosslinks-${state}` : `crosslinks-${state}-${mode}`}.png`;
      const shoot = async () => {
        await browser.pause(300);
        await browser.saveScreenshot(name('plain'));
        await browser.execute(() => {
          const hit = document.querySelector(
            '.mind-mapper-crosslink-hit[data-from-id="Links/Gamma/#1"][data-to-id="Links/Beta/Inner"]',
          );
          const canvas = document.querySelector('.mind-mapper-canvas');
          const init = { bubbles: true, button: 0, pointerId: 1, clientX: 1, clientY: 1 };
          hit?.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
          canvas?.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        });
        await browser.pause(300);
        await browser.saveScreenshot(name('highlight'));
      };
      if (loud) await withLoudPalette(shoot);
      else await shoot();
      await browser.keys('Escape');
    });
  }

  // Issue #23: a selected branch, drilled into (center marker, highlighted button), then stacked
  // (light, dark and loud palette). In full screen, the pointer moved just before each shot: the
  // control bar shows.
  for (const [mode, loud] of [
    ['light', false],
    ['dark', false],
    ['light', true],
  ] as const) {
    it(`drill-down ${loud ? 'loud' : mode}`, async function () {
      await useTheme('rainbow', mode);
      await openMindMap('demo/Feature tour.md');
      await settle();
      const prefix = loud ? `${dir}/loud-drill` : `${dir}/drill-${mode}`;
      const shoot = async () => {
        await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
        await clickNodeEndingWith('/Timeline');
        await browser.executeObsidianCommand('mind-mapper:fit-to-view');
        await waitForAnimation();
        await pointerAway();
        await browser.saveScreenshot(`${prefix}-1-selected.png`);
        await browser.$(byId('controls.drill')).click();
        await drillEnd();
        await pointerAway();
        await browser.saveScreenshot(`${prefix}-2-drilled.png`);
        await clickNodeEndingWith('/Timeline/Launch day');
        await browser.$(byId('controls.drill')).click();
        await drillEnd();
        await pointerAway();
        await browser.saveScreenshot(`${prefix}-3-stacked.png`);
        await browser.executeObsidianCommand('mind-mapper:show-whole-map');
        await drillEnd();
        await pointerAway();
        await browser.saveScreenshot(`${prefix}-4-drilled-out.png`);
        await browser.keys('Escape');
      };
      if (loud) await withLoudPalette(shoot);
      else await shoot();
    });
  }

  // Issue #32: the kanban layout (fixtures/kanban.md has `mind-mapper-layout: kanban`): light, dark,
  // loud palette, Collapse all (overview with counts), dividers at 100 %, drilled in, full screen.
  for (const [mode, loud] of [
    ['light', false],
    ['dark', false],
    ['light', true],
  ] as const) {
    it(`kanban ${loud ? 'loud' : mode}`, async function () {
      await useTheme('rainbow', mode);
      await openMindMap('fixtures/kanban.md');
      await settle();
      const name = loud ? `${dir}/loud-kanban` : `${dir}/kanban-${mode}`;
      const shoot = async () => {
        await browser.executeObsidianCommand('mind-mapper:fit-to-view');
        await waitForAnimation();
        await pointerAway();
        await browser.saveScreenshot(`${name}.png`);
        await saveFullScreenShot(`${name}-full-screen.png`);
      };
      if (loud) await withLoudPalette(shoot);
      else await shoot();
    });
  }

  it('kanban collapsed, dividers, drilled in', async function () {
    await useTheme('rainbow', 'light');
    await openMindMap('fixtures/kanban.md');
    await settle();
    await browser.executeObsidianCommand('mind-mapper:collapse-all');
    await settle();
    await browser.executeObsidianCommand('mind-mapper:fit-to-view');
    await waitForAnimation();
    await pointerAway();
    await browser.saveScreenshot(`${dir}/kanban-collapsed.png`);
    await browser.executeObsidianCommand('mind-mapper:expand-all');
    await settle();
    await clickNodeEndingWith('/Doing/Website redesign/#2');
    await browser.executeObsidianCommand('mind-mapper:reset-zoom');
    await waitForAnimation();
    await pointerAway();
    await browser.saveScreenshot(`${dir}/kanban-dividers-100.png`);
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await clickNodeEndingWith('/Doing');
    await browser.$(byId('controls.drill')).click();
    await drillEnd();
    await pointerAway();
    await browser.saveScreenshot(`${dir}/kanban-drilled.png`);
    await browser.executeObsidianCommand('mind-mapper:show-whole-map');
    await drillEnd();
    await browser.keys('Escape');
  });

  // Issue #57: nested tags as two-part pills (plain, two and three levels; in filled level 1
  // headings and kanban column headers): light, dark and loud palette, the map and its nodes up close;
  // issue #92: branch colors, and Obsidian's tag colors in theme "none".
  for (const [mode, loud, theme] of [
    ['light', false, 'rainbow'],
    ['dark', false, 'rainbow'],
    ['light', true, 'rainbow'],
    ['light', false, 'none'],
  ] as const) {
    const label = loud ? 'loud' : theme === 'none' ? 'none' : mode;
    it(`nested tags ${label}`, async function () {
      await useTheme(theme, mode);
      await openMindMap('demo/Nested tags.md');
      await settle();
      const name = loud ? `${dir}/loud-nested-tags` : `${dir}/nested-tags-${label}`;
      const shoot = async () => {
        // Full screen: the fitted map, then its nodes up close at 100 %.
        await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
        await browser.pause(300);
        await browser.saveScreenshot(`${name}.png`);
        await browser.executeObsidianCommand('mind-mapper:reset-zoom');
        await waitForAnimation();
        await pointerAway();
        for (const [selector, suffix] of [
          ['[data-node-id="Nested tags/#1"]', 'paragraph'],
          [':has(a.tag[href="#status/closed"])', 'heading'],
          // Issue #92: a node on each side of the map (text aligned left / right).
          [':has(a.tag[href="#status/open"])', 'heading-open'],
        ] as const) {
          await browser.$(`.mind-mapper-node${selector}`).saveScreenshot(`${name}-${suffix}.png`);
        }
        await browser.keys('Escape');
        await browser.executeObsidian(({ app }) => {
          for (const leaf of app.workspace.getLeavesOfType('mind-mapper-view')) {
            (leaf.view as unknown as { chooseLayout(l: string | null): void }).chooseLayout(
              'kanban',
            );
          }
        });
        await settle();
        await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
        await browser.executeObsidianCommand('mind-mapper:fit-to-view');
        await waitForAnimation();
        await pointerAway();
        await browser.saveScreenshot(`${name}-kanban.png`);
        await browser.executeObsidianCommand('mind-mapper:reset-zoom');
        await waitForAnimation();
        await pointerAway();
        await browser
          .$('.mind-mapper-node:has(a.tag[href="#status/open"])')
          .saveScreenshot(`${name}-kanban-header.png`);
        await browser
          .$('.mind-mapper-node:has(a.tag[href="#bug"])')
          .saveScreenshot(`${name}-kanban-card.png`);
        await browser.keys('Escape');
        await browser.executeObsidian(({ app }) => {
          for (const leaf of app.workspace.getLeavesOfType('mind-mapper-view')) {
            (leaf.view as unknown as { chooseLayout(l: string | null): void }).chooseLayout(null);
          }
        });
      };
      if (loud) await withLoudPalette(shoot);
      else await shoot();
    });
  }

  it('back to light mode without a color theme', async function () {
    await useTheme('none', 'light');
  });

  it('settings', async function () {
    await saveSettingsScreenshots(`${dir}/settings`);
  });

  it('docs copied into the vault: manual in reading view, images render', async function () {
    await copyDocsIntoVault();
    await openNote('Docs/User manual.md');
    // Reading view renders section by section: scroll to the first image so it is drawn.
    const imageLine = readFileSync('docs/user-manual.md', 'utf8')
      .split('\n')
      .findIndex((line) => line.startsWith('![') && line.includes('images/manual/'));
    await browser.executeObsidian(async ({ app, obsidian }, line) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      await view?.setState({ ...view.getState(), mode: 'preview' }, { history: false });
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      view?.previewMode.applyScroll(line);
    }, imageLine);
    await browser.pause(1500);
    const images = await browser.executeObsidian(() => {
      const found = Array.from(
        activeDocument.querySelectorAll<HTMLImageElement>('.markdown-preview-view img'),
      );
      return found.map((img) => ({ src: img.getAttribute('src') ?? '', width: img.naturalWidth }));
    });
    if (
      images.length === 0 ||
      images.some((img) => img.width === 0 || !img.src.includes('/Docs/images/'))
    ) {
      throw new Error(`manual images do not render: ${JSON.stringify(images)}`);
    }
    await browser.saveScreenshot(`${dir}/docs-manual-reading-view.png`);
  });

  // Last: restarts Obsidian in German.
  it('German UI', async function () {
    await setObsidianLanguage('de');
    await openMindMap('fixtures/worked-example.md');
    await settle();
    await browser.saveScreenshot(`${dir}/german-map.png`);
    await saveControlsShots(`${dir}/german-controls`);
    await saveSettingsScreenshots(`${dir}/german-settings`);
    await setObsidianLanguage(null);
  });
});

/**
 * Loud palette (test-only, never shipped): Obsidian's real colors are subtle, so a color on the
 * wrong element is hard to see. These overrides give every variable that styles.css uses its own
 * unmistakable color. Legend (variable -> color; the plugin element that uses it):
 *   --color-red     magenta  #ff00ff  rainbow branch 1 / 8
 *   --color-orange  lime     #00ff00  rainbow branch 2 / 9, forest branch 3
 *   --color-yellow  blue     #0000ff  rainbow branch 3, forest branch 2
 *   --color-green   yellow   #ffff00  rainbow branch 4, ocean branch 3, forest branch 1
 *   --color-cyan    black    #000000  rainbow branch 5, ocean branch 2
 *   --color-blue    red      #ff0000  rainbow branch 6, ocean branch 1
 *   --color-purple  cyan     #00ffff  rainbow branch 7, ocean branch 4
 *   --color-pink    orange   #ff8000  (unused by the plugin)
 *   --interactive-accent  violet   #8000ff  accent theme, cross-links, selection ring, collapsed badge, hover
 *   (level 1 fill: 50 % branch color, level 2: 18 %, mixed into --background-primary)
 *   --text-on-accent      gold     #ffcc00  count in the collapsed badge
 *   --text-faint          sky blue #00a0ff  theme none: edges, level 1 fill and level 2 tint (mixed)
 *   --hr-color            teal     #008080  dividers
 *   --background-modifier-border  brown #996633  block border (theme none), skeleton stroke, collapse button and controls border
 *   --background-primary  pale yellow #ffffcc  canvas, fill and tint base, blocks, buttons, controls
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

/**
 * The controls bar as is, while typing a zoom ("87,5"), the window with the zoom preset, layout
 * and color theme menus open, and the bar with both overrides active (highlighted). Ends with
 * the note's layout and theme again, fitted.
 */
async function saveControlsShots(prefix: string): Promise<void> {
  const controls = browser.$('.mind-mapper-controls');
  await browser.$('.mind-mapper-world').moveTo();
  await controls.saveScreenshot(`${prefix}.png`);
  await browser.$(byId('controls.zoom-input')).click();
  await browser.keys(['8', '7', ',', '5']);
  await controls.saveScreenshot(`${prefix}-editing.png`);
  await browser.keys('Escape');
  await browser.$(byId('controls.zoom-presets')).click();
  await waitForMenu();
  await browser.pause(200);
  await browser.saveScreenshot(`${prefix}-menu.png`);
  await browser.keys('Escape');
  await browser.$('.menu').waitForExist({ reverse: true, timeout: 5000 });
  // The layout (8th child) and color theme (9th) menus; labels differ per language.
  for (const [child, name] of [
    [8, 'layout'],
    [9, 'theme'],
  ] as const) {
    await browser.$(`.mind-mapper-controls > :nth-child(${child})`).click();
    await waitForMenu();
    await browser.pause(200);
    await browser.saveScreenshot(`${prefix}-${name}-menu.png`);
    await browser.keys('Escape');
    await browser.$('.menu').waitForExist({ reverse: true, timeout: 5000 });
  }
  // Both overridden: the buttons are highlighted. Then back to the note's layout and theme. Through
  // the view: Esc on a menu leaves another leaf active, so the map commands are not available.
  const choose = (layout: string | null, theme: string | null) =>
    browser.executeObsidian(
      ({ app }, l, t) => {
        for (const leaf of app.workspace.getLeavesOfType('mind-mapper-view')) {
          const view = leaf.view as unknown as {
            chooseLayout(layout: string | null): void;
            chooseTheme(theme: string | null): void;
          };
          view.chooseLayout(l);
          view.chooseTheme(t);
        }
      },
      layout,
      theme,
    );
  await choose('top-to-bottom', 'ocean');
  await settle();
  await browser.$('.mind-mapper-world').moveTo();
  await browser.pause(200);
  await controls.saveScreenshot(`${prefix}-overridden.png`);
  await choose(null, null);
  await settle();
}

/** Clicks (selects) the node whose ID ends with `suffix`. */
async function clickNodeEndingWith(suffix: string): Promise<void> {
  await browser.execute((end) => {
    const node = Array.from(
      document.querySelectorAll<HTMLElement>('.mind-mapper-node[data-node-id]'),
    ).find((el) => el.dataset.nodeId?.endsWith(end));
    if (!node) throw new Error(`no node ending with ${end}`);
    node.querySelector<HTMLElement>('.mind-mapper-node-content')?.click();
  }, suffix);
}

/** Waits for the end of a drill-down animation and the re-layout after it. */
async function drillEnd(): Promise<void> {
  await waitForAnimation();
  await settle();
}

/** Pointer off the control bar (no tooltip in the shot), then a moment for the hover to end. */
async function pointerAway(): Promise<void> {
  await browser.action('pointer').move({ x: 5, y: 5 }).perform();
  await browser.pause(300);
}

/** Full screen fits the map to the whole window; Esc leaves it again. */
async function saveFullScreenShot(path: string): Promise<void> {
  await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
  await browser.pause(300);
  await browser.saveScreenshot(path);
  await browser.keys('Escape');
}

/** The plugin's default color theme and Obsidian's base theme (moonstone light, obsidian dark). */
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

/** Writes the docs into the vault like the dev build does (`docsMappings`): `Docs/User manual.md`, `Docs/images/…`. */
async function copyDocsIntoVault(): Promise<void> {
  for (const { from, to } of docsMappings('docs')) {
    await browser.executeObsidian(
      async ({ app }, path, base64) => {
        const folder = path.split('/').slice(0, -1).join('/');
        if (folder && !(await app.vault.adapter.exists(folder)))
          await app.vault.adapter.mkdir(folder);
        await app.vault.adapter.writeBinary(
          path,
          Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer,
        );
      },
      to,
      readFileSync(from).toString('base64'),
    );
  }
  await waitForCache('Docs/User manual.md');
}
