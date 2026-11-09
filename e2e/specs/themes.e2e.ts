import { browser, expect } from '@wdio/globals';
import { openMindMap, settle, writeNote } from '../helpers';

const NOTE = 'theme-rainbow.md';
const LONG = 'A long paragraph that is clipped at the max node size. '.repeat(40);
const TEXT = `# Theme\n\n## Alpha\n\nAlpha text.\n\n## Beta\n\n${LONG}\n`;

interface Colours {
  /** Computed border colour of each node, by id. */
  border: Record<string, string>;
  /** Computed stroke of the edge into each node, by target node level. */
  edge: Record<string, string>;
  /** Computed values of Obsidian's variables in the map. */
  vars: Record<string, string>;
}

/** Computed node borders, edge strokes and the CSS variables they should resolve to. */
function colours(): Promise<Colours> {
  return browser.execute(() => {
    const canvas = document.querySelector<HTMLElement>('.mind-mapper-canvas');
    if (!canvas) throw new Error('no map');
    const border: Record<string, string> = {};
    for (const el of Array.from(canvas.querySelectorAll<HTMLElement>('.mind-mapper-node'))) {
      border[el.dataset.nodeId ?? ''] = getComputedStyle(el).borderTopColor;
    }
    const edge: Record<string, string> = {};
    for (const el of Array.from(canvas.querySelectorAll('path.mind-mapper-edge'))) {
      edge[el.getAttribute('data-level') ?? ''] = getComputedStyle(el).stroke;
    }
    // A probe in the canvas resolves each variable like the map's own elements do.
    const probe = canvas.createDiv();
    const vars: Record<string, string> = {};
    for (const name of [
      '--color-red',
      '--color-orange',
      '--color-blue',
      '--interactive-accent',
      '--background-modifier-border',
      '--text-faint',
    ]) {
      probe.style.color = `var(${name})`;
      vars[name] = getComputedStyle(probe).color;
    }
    probe.remove();
    return { border, edge, vars };
  });
}

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
  });

  after(async function () {
    await updateSettings({ defaultTheme: 'none' });
  });

  it('rainbow colours first-level nodes red, second-level orange, and the edges into them; the root keeps its look', async function () {
    await openMindMap(NOTE);
    await settle();
    const { border, edge, vars } = await colours();
    expect(border['Theme/Alpha']).toBe(vars['--color-red']);
    expect(border['Theme/Beta']).toBe(vars['--color-red']);
    expect(border['Theme/Alpha/#1']).toBe(vars['--color-orange']);
    expect(edge['1']).toBe(vars['--color-red']);
    expect(edge['2']).toBe(vars['--color-orange']);
    expect(border['Theme']).toBe(vars['--interactive-accent']);
  });

  it('the expand button of a clipped node has the tinted node background, not a plain square', async function () {
    await openMindMap(NOTE);
    await settle();
    const node = '.mind-mapper-node[data-node-id="Theme/Beta/#1"]';
    await browser.$(`${node}.is-clipped`).waitForExist({ timeout: 10000 });
    const [nodeBg, buttonBg, plain] = await browser.execute((selector) => {
      const el = document.querySelector(selector);
      const button = el?.querySelector('.mind-mapper-node-expand');
      if (!el || !button) throw new Error('no clipped node');
      const probe = document.body.createDiv();
      probe.style.backgroundColor = 'var(--background-primary)';
      const result = [
        getComputedStyle(el).backgroundColor,
        getComputedStyle(button).backgroundColor,
        getComputedStyle(probe).backgroundColor,
      ];
      probe.remove();
      return result;
    }, node);
    expect(nodeBg).not.toBe(plain);
    expect(buttonBg).toBe(nodeBg);
  });

  it('a canvas without a known theme class keeps the default look', async function () {
    await openMindMap(NOTE);
    await settle();
    for (const cls of [null, 'mind-mapper-theme-neon']) {
      await browser.execute((extra) => {
        const canvas = document.querySelector('.mind-mapper-canvas');
        if (!canvas) throw new Error('no map');
        canvas.classList.remove('mind-mapper-theme-rainbow');
        if (extra) canvas.classList.add(extra);
      }, cls);
      const { border, edge, vars } = await colours();
      expect({ cls, border: border['Theme/Alpha'] }).toEqual({
        cls,
        border: vars['--background-modifier-border'],
      });
      expect({ cls, edge: edge['1'] }).toEqual({ cls, edge: vars['--text-faint'] });
    }
  });

  it('none keeps the default look; frontmatter edits and the setting switch the theme live', async function () {
    await openMindMap(NOTE);
    await settle();
    await setFrontmatterTheme(NOTE, 'none');
    await browser.waitUntil(async () => (await themeClass()).includes('mind-mapper-theme-none'), {
      timeout: 10000,
      timeoutMsg: 'the theme did not switch to none',
    });
    const plain = await colours();
    expect(plain.border['Theme/Alpha']).toBe(plain.vars['--background-modifier-border']);
    expect(plain.border['Theme/Alpha/#1']).toBe(plain.vars['--background-modifier-border']);
    expect(plain.edge['1']).toBe(plain.vars['--text-faint']);

    // Without the key the setting applies, and a setting change re-applies it at once.
    await setFrontmatterTheme(NOTE, null);
    await updateSettings({ defaultTheme: 'ocean' });
    await browser.waitUntil(async () => (await themeClass()).includes('mind-mapper-theme-ocean'), {
      timeout: 10000,
      timeoutMsg: 'the theme did not switch to ocean',
    });
    const ocean = await colours();
    expect(ocean.border['Theme/Alpha']).toBe(ocean.vars['--color-blue']);
  });
});
