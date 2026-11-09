import { browser, expect } from '@wdio/globals';
import { openMindMap, settle, writeNote } from '../helpers';

const NOTE = 'theme-rainbow.md';
const LONG = 'A long paragraph that is clipped at the max node size. '.repeat(40);
const TEXT = [
  '# Theme',
  '',
  '## Alpha',
  '',
  'Alpha text.',
  '',
  '### Deep',
  '',
  'Deep text.',
  '',
  '```js',
  'const deep = true;',
  '```',
  '',
  LONG,
  '',
  '## Beta',
  '',
  LONG,
  '',
].join('\n');

const ROOT = 'Theme';
const ALPHA = 'Theme/Alpha';
const BETA = 'Theme/Beta';
/** Level 2 */
const ALPHA_TEXT = 'Theme/Alpha/#1';
/** Level 3: plain text, a code block, a clipped paragraph. */
const DEEP_TEXT = 'Theme/Alpha/Deep/#1';
const DEEP_CODE = 'Theme/Alpha/Deep/#2';
const DEEP_LONG = 'Theme/Alpha/Deep/#3';
/** Level 2, clipped */
const BETA_LONG = 'Theme/Beta/#1';

/** Seven first-level branches: every rainbow colour once. */
const PALETTE_NOTE = 'theme-palette.md';
const PALETTE_TEXT = `# Palette\n\n${[1, 2, 3, 4, 5, 6, 7].map((i) => `## Branch ${i}\n`).join('\n')}`;

interface NodeStyle {
  background: string;
  border: string;
  borderWidth: string;
  color: string;
  fontSize: string;
  fontWeight: string;
}

interface Styles {
  node: Record<string, NodeStyle>;
  /** Stroke and width of the edge into each node, by target node id. */
  edge: Record<string, { stroke: string; width: string }>;
  /** `expression` (a CSS colour using variables) resolved in the map, by expression. */
  resolved: Record<string, string>;
}

/** Computed styles of the nodes and edges, and CSS colour expressions resolved in the canvas. */
function styles(expressions: string[] = []): Promise<Styles> {
  return browser.execute((exprs) => {
    const canvas = document.querySelector<HTMLElement>('.mind-mapper-canvas');
    if (!canvas) throw new Error('no map');
    const node: Record<string, NodeStyle> = {};
    for (const el of Array.from(canvas.querySelectorAll<HTMLElement>('.mind-mapper-node'))) {
      const style = getComputedStyle(el);
      node[el.dataset.nodeId ?? ''] = {
        background: style.backgroundColor,
        border: style.borderTopColor,
        borderWidth: style.borderTopWidth,
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      };
    }
    // Edge i of the layout: the renderer keeps them in layout order, but the target is only in
    // the data; read it from the matching node by position instead: each edge ends at its node.
    const edge: Record<string, { stroke: string; width: string }> = {};
    const world = canvas.querySelector<HTMLElement>('.mind-mapper-world');
    for (const path of Array.from(
      canvas.querySelectorAll<SVGPathElement>('path.mind-mapper-edge'),
    )) {
      const end = path.getPointAtLength(path.getTotalLength());
      const target = Array.from(
        world?.querySelectorAll<HTMLElement>('.mind-mapper-node') ?? [],
      ).find((el) => {
        const left = parseFloat(el.style.left);
        const top = parseFloat(el.style.top);
        const right = left + parseFloat(el.style.width);
        const bottom = top + parseFloat(el.style.height);
        const near = (a: number, b: number) => Math.abs(a - b) < 1;
        return (near(end.x, left) || near(end.x, right)) && end.y > top && end.y < bottom;
      });
      const style = getComputedStyle(path);
      if (target)
        edge[target.dataset.nodeId ?? ''] = { stroke: style.stroke, width: style.strokeWidth };
    }
    // A probe in the canvas resolves each expression like the map's own elements do.
    const probe = canvas.createDiv();
    const resolved: Record<string, string> = {};
    for (const expression of exprs) {
      probe.style.backgroundColor = expression;
      resolved[expression] = getComputedStyle(probe).backgroundColor;
    }
    probe.remove();
    return { node, edge, resolved };
  }, expressions);
}

const fill = (colour: string) =>
  `color-mix(in srgb, var(${colour}) var(--mind-mapper-fill), var(--background-primary))`;
const tint = (colour: string) =>
  `color-mix(in srgb, var(${colour}) var(--mind-mapper-tint), var(--background-primary))`;
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

async function setFrontmatterTheme(path: string, theme: string | null): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, notePath, value) => {
      const file = app.vault.getFileByPath(notePath);
      if (!file) throw new Error(`no note ${notePath}`);
      await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        if (value === null) delete frontmatter['mind-mapper-theme'];
        else frontmatter['mind-mapper-theme'] = value;
      });
    },
    path,
    theme,
  );
}

async function updateSettings(patch: Record<string, unknown>): Promise<void> {
  await browser.executeObsidian(async ({ app }, settings) => {
    const plugin = (
      app as unknown as {
        plugins: { plugins: Record<string, { updateSettings(p: unknown): Promise<void> }> };
      }
    ).plugins.plugins['mind-mapper'];
    if (!plugin) throw new Error('plugin not loaded');
    await plugin.updateSettings(settings);
  }, patch);
}

/** Obsidian's base colour scheme (moonstone light, obsidian dark). */
async function useMode(mode: 'light' | 'dark'): Promise<void> {
  await browser.executeObsidian(({ app }, base) => {
    (app as unknown as { changeTheme(theme: string): void }).changeTheme(
      base === 'dark' ? 'obsidian' : 'moonstone',
    );
  }, mode);
  await browser.waitUntil(
    async () =>
      (await browser.execute(() => document.body.classList.contains('theme-dark'))) ===
      (mode === 'dark'),
    { timeout: 5000, timeoutMsg: `Obsidian is not in ${mode} mode` },
  );
  // CSS transitions are off for 200 ms after a switch.
  await browser.pause(300);
}

function themeClass(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelector('.mind-mapper-canvas')?.classList ?? []).filter((c) =>
      c.startsWith('mind-mapper-theme-'),
    ),
  );
}

describe('colour themes', function () {
  before(async function () {
    await writeNote(NOTE, `---\nmind-mapper-theme: rainbow\n---\n${TEXT}`);
    await writeNote(PALETTE_NOTE, PALETTE_TEXT);
  });

  after(async function () {
    await updateSettings({ defaultTheme: 'rainbow' });
    await useMode('light');
  });

  it('rainbow: each first-level branch has its own colour, inherited below it; level 1 filled, level 2 tinted', async function () {
    await openMindMap(NOTE);
    await settle();
    const { node, edge, resolved } = await styles([
      fill('--color-red'),
      fill('--color-orange'),
      tint('--color-red'),
      'var(--color-red)',
      'var(--color-orange)',
      'var(--text-normal)',
    ]);
    expect(node[ALPHA]?.background).toBe(resolved[fill('--color-red')]);
    expect(node[BETA]?.background).toBe(resolved[fill('--color-orange')]);
    expect(node[ALPHA]?.background).not.toBe(node[BETA]?.background);
    expect(node[ALPHA_TEXT]?.background).toBe(resolved[tint('--color-red')]);
    expect(node[ALPHA]?.border).toBe(TRANSPARENT);
    expect(node[ALPHA_TEXT]?.border).toBe(TRANSPARENT);
    // text keeps the normal colour
    expect(node[ALPHA]?.color).toBe(resolved['var(--text-normal)']);
    // lines in the branch colour; into the first level thicker
    expect(edge[ALPHA]?.stroke).toBe(resolved['var(--color-red)']);
    expect(edge[BETA]?.stroke).toBe(resolved['var(--color-orange)']);
    expect(edge[ALPHA_TEXT]?.stroke).toBe(resolved['var(--color-red)']);
    expect(edge[DEEP_TEXT]?.stroke).toBe(resolved['var(--color-red)']);
    expect(parseFloat(edge[ALPHA]?.width ?? '0')).toBeGreaterThan(
      parseFloat(edge[ALPHA_TEXT]?.width ?? '0'),
    );
  });

  it('level 3 is plain text, a code block there keeps a branch-coloured border; the root is large text without a box', async function () {
    await openMindMap(NOTE);
    await settle();
    const { node, resolved } = await styles(['var(--color-red)', 'var(--background-primary)']);
    expect(node[DEEP_TEXT]?.background).toBe(TRANSPARENT);
    expect(node[DEEP_TEXT]?.border).toBe(TRANSPARENT);
    expect(node[DEEP_CODE]?.border).toBe(resolved['var(--color-red)']);
    expect(node[DEEP_CODE]?.borderWidth).toBe('1px');
    expect(node[DEEP_CODE]?.background).toBe(resolved['var(--background-primary)']);
    expect(node[ROOT]?.border).toBe(TRANSPARENT);
    expect(node[ROOT]?.background).toBe(TRANSPARENT);
    expect(Number(node[ROOT]?.fontWeight)).toBeGreaterThanOrEqual(700);
    expect(parseFloat(node[ROOT]?.fontSize ?? '0')).toBeGreaterThanOrEqual(
      1.4 * parseFloat(node[ALPHA]?.fontSize ?? '0'),
    );
  });

  it('the selection ring shows on the root', async function () {
    await openMindMap(NOTE);
    await settle();
    await browser.executeObsidianCommand('mind-mapper:back-to-root');
    await browser.$(`.mind-mapper-node.is-root.is-selected`).waitForExist({ timeout: 5000 });
    const shadow = await browser.execute(
      () => getComputedStyle(document.querySelector('.mind-mapper-node.is-root')!).boxShadow,
    );
    expect(shadow).not.toBe('none');
  });

  it('the expand button sits on the node background: tinted on level 2, the canvas background on plain text', async function () {
    await openMindMap(NOTE);
    await settle();
    for (const id of [BETA_LONG, DEEP_LONG]) {
      await browser
        .$(`.mind-mapper-node[data-node-id="${id}"].is-clipped`)
        .waitForExist({ timeout: 10000 });
    }
    const { tinted, plain, primary } = await browser.execute(
      (tintedId, plainId) => {
        /** [node background, expand button background] */
        const backgrounds = (id: string) => {
          const el = document.querySelector(`.mind-mapper-node[data-node-id="${id}"]`);
          const expand = el?.querySelector('.mind-mapper-node-expand');
          if (!el || !expand) throw new Error(`no clipped node ${id}`);
          return {
            node: getComputedStyle(el).backgroundColor,
            button: getComputedStyle(expand).backgroundColor,
          };
        };
        const probe = document.body.createDiv();
        probe.style.backgroundColor = 'var(--background-primary)';
        const result = {
          tinted: backgrounds(tintedId),
          plain: backgrounds(plainId),
          primary: getComputedStyle(probe).backgroundColor,
        };
        probe.remove();
        return result;
      },
      BETA_LONG,
      DEEP_LONG,
    );
    expect(tinted.button).toBe(tinted.node);
    expect(tinted.button).not.toBe(primary);
    expect(plain.node).toBe(TRANSPARENT);
    expect(plain.button).toBe(primary);
  });

  it('none: the same emphasis in greys', async function () {
    await openMindMap(NOTE);
    await settle();
    await setFrontmatterTheme(NOTE, 'none');
    await browser.waitUntil(async () => (await themeClass()).includes('mind-mapper-theme-none'), {
      timeout: 10000,
      timeoutMsg: 'the theme did not switch to none',
    });
    const { node, edge, resolved } = await styles([
      fill('--text-faint'),
      tint('--text-faint'),
      'var(--text-faint)',
      'var(--background-modifier-border)',
    ]);
    expect(node[ALPHA]?.background).toBe(resolved[fill('--text-faint')]);
    expect(node[BETA]?.background).toBe(resolved[fill('--text-faint')]);
    expect(node[ALPHA_TEXT]?.background).toBe(resolved[tint('--text-faint')]);
    expect(node[DEEP_TEXT]?.background).toBe(TRANSPARENT);
    expect(node[DEEP_CODE]?.border).toBe(resolved['var(--background-modifier-border)']);
    expect(edge[ALPHA]?.stroke).toBe(resolved['var(--text-faint)']);
    expect(edge[BETA]?.stroke).toBe(resolved['var(--text-faint)']);
    expect(node[ROOT]?.border).toBe(TRANSPARENT);
  });

  it('a canvas without a known theme class has the none look', async function () {
    await setFrontmatterTheme(NOTE, 'rainbow');
    await openMindMap(NOTE);
    await browser.waitUntil(async () => (await themeClass()).includes('mind-mapper-theme-rainbow'));
    await settle();
    for (const cls of [null, 'mind-mapper-theme-neon']) {
      await browser.execute((extra) => {
        const canvas = document.querySelector('.mind-mapper-canvas');
        if (!canvas) throw new Error('no map');
        canvas.classList.remove('mind-mapper-theme-rainbow');
        if (extra) canvas.classList.add(extra);
      }, cls);
      const { node, edge, resolved } = await styles([fill('--text-faint'), 'var(--text-faint)']);
      expect({ cls, background: node[ALPHA]?.background }).toEqual({
        cls,
        background: resolved[fill('--text-faint')],
      });
      expect({ cls, edge: edge[ALPHA]?.stroke }).toEqual({
        cls,
        edge: resolved['var(--text-faint)'],
      });
    }
  });

  it('frontmatter edits and the setting switch the theme live; switching keeps every node size', async function () {
    await openMindMap(NOTE);
    await settle();
    const sizes = () =>
      browser.execute(() =>
        Array.from(document.querySelectorAll<HTMLElement>('.mind-mapper-node')).map(
          (el) => `${el.dataset.nodeId} ${el.offsetWidth}x${el.offsetHeight}`,
        ),
      );
    const before = await sizes();
    // Without the key the setting applies, and a setting change re-applies it at once.
    await setFrontmatterTheme(NOTE, null);
    await updateSettings({ defaultTheme: 'ocean' });
    await browser.waitUntil(async () => (await themeClass()).includes('mind-mapper-theme-ocean'), {
      timeout: 10000,
      timeoutMsg: 'the theme did not switch to ocean',
    });
    const ocean = await styles([fill('--color-blue'), fill('--color-cyan')]);
    expect(ocean.node[ALPHA]?.background).toBe(ocean.resolved[fill('--color-blue')]);
    expect(ocean.node[BETA]?.background).toBe(ocean.resolved[fill('--color-cyan')]);
    for (const theme of ['none', 'accent', 'forest']) {
      await updateSettings({ defaultTheme: theme });
      await settle();
      expect({ theme, sizes: await sizes() }).toEqual({ theme, sizes: before });
    }
  });

  it('level 1 text has a WCAG contrast of at least 4.5:1 on every palette colour, light and dark', async function () {
    await openMindMap(PALETTE_NOTE);
    await settle();
    const failures: string[] = [];
    const results: string[] = [];
    for (const mode of ['light', 'dark'] as const) {
      await useMode(mode);
      for (const theme of ['rainbow', 'ocean', 'forest', 'accent', 'none']) {
        await updateSettings({ defaultTheme: theme });
        await browser.waitUntil(async () =>
          (await themeClass()).includes(`mind-mapper-theme-${theme}`),
        );
        await browser.pause(100);
        const ratios = await browser.execute(() => {
          // Any CSS colour to sRGB bytes through a canvas (computed colours may be color(srgb …)).
          const ctx = document.createElement('canvas').getContext('2d', {
            willReadFrequently: true,
          });
          if (!ctx) throw new Error('no 2d context');
          const rgb = (colour: string): number[] => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = colour;
            ctx.fillRect(0, 0, 1, 1);
            return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
          };
          const luminance = (colour: string): number => {
            const [r = 0, g = 0, b = 0] = rgb(colour).map((v) => {
              const c = v / 255;
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          return Array.from(
            document.querySelectorAll<HTMLElement>('.mind-mapper-node[data-level="1"]'),
          ).map((el) => {
            const style = getComputedStyle(el);
            const [a, b] = [luminance(style.color), luminance(style.backgroundColor)].sort(
              (x, y) => y - x,
            );
            return {
              branch: el.dataset.branch ?? '',
              ratio: ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05),
              background: style.backgroundColor,
            };
          });
        });
        expect(ratios).toHaveLength(7);
        for (const { branch, ratio, background } of ratios) {
          const line = `${mode} ${theme} colour ${branch}: ${ratio.toFixed(2)} (${background})`;
          results.push(line);
          if (ratio < 4.5) failures.push(line);
        }
      }
    }
    console.log(`Level 1 contrast:\n${results.join('\n')}`);
    expect(failures).toEqual([]);
  });
});
