import { browser, expect } from '@wdio/globals';
import { leafSummary, openMindMap, settle, writeNote } from '../helpers';

/** Issue #57: nested tags in node content as two-part pills (scope + value). */
const NOTE = 'demo/Nested tags.md';
const PARAGRAPH = '.mind-mapper-node[data-node-id="Nested tags/#1"]';

interface TagInfo {
  text: string;
  href: string | null;
  label: string | null;
  id: string | null;
  parts: string[];
}

function tags(selector: string): Promise<TagInfo[]> {
  return browser.execute(
    (sel) =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>(`${sel} a.tag`)).map((a) => ({
        text: a.textContent ?? '',
        href: a.getAttribute('href'),
        label: a.getAttribute('aria-label'),
        id: a.getAttribute('data-mm-id'),
        parts: Array.from(a.children)
          .filter((c) => c.getBoundingClientRect().width > 0)
          .map((c) => c.textContent ?? ''),
      })),
    selector,
  );
}

function searchQuery(): Promise<string | null> {
  return browser.executeObsidian(({ app }) => {
    const leaf = app.workspace.getLeavesOfType('search')[0];
    const view = leaf?.view as unknown as { getQuery?: () => string } | undefined;
    return view?.getQuery?.() ?? null;
  });
}

function selectedNode(): Promise<string | undefined> {
  return browser.execute(
    () => document.querySelector<HTMLElement>('.mind-mapper-node.is-selected')?.dataset.nodeId,
  );
}

/** Obsidian's private core plugin registry (only what the tests use). */
interface CorePlugin {
  enabled: boolean;
  enable(user: boolean): Promise<void>;
  disable(user: boolean): void;
}

async function setSearchEnabled(enabled: boolean): Promise<void> {
  await browser.executeObsidian(async ({ app }, on) => {
    const { internalPlugins } = app as unknown as {
      internalPlugins: { getPluginById(id: string): CorePlugin | null };
    };
    const search = internalPlugins.getPluginById('global-search');
    if (!search || search.enabled === on) return;
    if (on) await search.enable(true);
    else search.disable(true);
  }, enabled);
}

function setSearchQuery(query: string): Promise<void> {
  return browser.executeObsidian(({ app }, q) => {
    const leaf = app.workspace.getLeavesOfType('search')[0];
    const view = leaf?.view as unknown as { setQuery?: (q: string) => void } | undefined;
    view?.setQuery?.(q);
  }, query);
}

describe('nested tags in node content', function () {
  before(async function () {
    await openMindMap(NOTE);
    await settle();
  });

  it('renders nested tags as scope + value, plain tags unchanged', async function () {
    expect(await tags(PARAGRAPH)).toEqual([
      { text: '#solo', href: '#solo', label: null, id: null, parts: [] },
      {
        text: '#obsidian/test',
        href: '#obsidian/test',
        label: '#obsidian/test',
        id: 'node.tag',
        parts: ['#obsidian', 'test'],
      },
      {
        text: '#project/alpha/backend',
        href: '#project/alpha/backend',
        label: '#project/alpha/backend',
        id: 'node.tag',
        parts: ['#project/alpha', 'backend'],
      },
    ]);
  });

  // Issue #77: a click on a tag opens the tag search like in reading view (Obsidian's private
  // global-search plugin, guarded). Like any link in a node it is no node click: the selection
  // stays as it was (here: the root), and no note opens.
  async function clickTag(selector: string) {
    await openMindMap(NOTE);
    await settle();
    await browser.$('.mind-mapper-node.is-root .mind-mapper-node-content').click();
    const selected = await selectedNode();
    const leaves = await leafSummary();
    await browser.$(selector).click();
    await browser.pause(500);
    return {
      query: await searchQuery(),
      selectionUnchanged: typeof selected === 'string' && (await selectedNode()) === selected,
      leavesUnchanged: JSON.stringify(await leafSummary()) === JSON.stringify(leaves),
    };
  }

  it('a click on a plain tag opens the search with the tag query', async function () {
    expect(await clickTag(`${PARAGRAPH} a.tag[href="#solo"]`)).toEqual({
      query: 'tag:#solo',
      selectionUnchanged: true,
      leavesUnchanged: true,
    });
  });

  it('a click on either part of a nested-tag pill searches the full tag', async function () {
    const pill = `${PARAGRAPH} a.tag[href="#project/alpha/backend"]`;
    const expected = {
      query: 'tag:#project/alpha/backend',
      selectionUnchanged: true,
      leavesUnchanged: true,
    };
    expect(await clickTag(`${pill} .mind-mapper-tag-value`)).toEqual(expected);
    await setSearchQuery('');
    expect(await clickTag(`${pill} .mind-mapper-tag-scope`)).toEqual(expected);
  });

  it('with the search core plugin disabled a tag click does nothing, without an error', async function () {
    await setSearchEnabled(false);
    try {
      await browser.execute(() => {
        const w = window as unknown as { mmErrors: string[] };
        w.mmErrors = [];
        window.addEventListener('error', (e) => w.mmErrors.push(String(e.message)));
      });
      const result = await clickTag(
        `${PARAGRAPH} a.tag[href="#obsidian/test"] .mind-mapper-tag-value`,
      );
      expect(result).toEqual({ query: null, selectionUnchanged: true, leavesUnchanged: true });
      expect(
        await browser.execute(() => (window as unknown as { mmErrors: string[] }).mmErrors),
      ).toEqual([]);
    } finally {
      await setSearchEnabled(true);
    }
  });

  it('hover shows the full tag as tooltip', async function () {
    await openMindMap(NOTE);
    await settle();
    await browser.$(`${PARAGRAPH} a.tag[href="#obsidian/test"]`).moveTo();
    const tooltip = browser.$('.tooltip');
    await tooltip.waitForExist({ timeout: 5000 });
    await expect(tooltip).toHaveText('#obsidian/test');
  });
});

/** Issue #92: trailing tags on the side opposite the text, small corners, branch colors. */
const TRAILING = 'trailing-tags.md';
const TRAILING_TEXT = [
  '---',
  'mind-mapper-theme: rainbow',
  '---',
  '# Trailing #solo',
  '',
  '## Book the venue #area/events',
  '',
  'A much longer first line of text<br>short #x/y',
  '',
  'Mid #solo in the middle',
  '',
  '## Done #status/closed',
  '',
  '- [ ] Fix the login #bug',
  '',
].join('\n');

/** Nodes by a tag only they have. */
const ROOT = '.mind-mapper-node.is-root';
const HEADING = '.mind-mapper-node:has(a.tag[href="#area/events"])';
const SHORT = '.mind-mapper-node:has(a.tag[href="#x/y"])';
const MID = '.mind-mapper-node:has(> .mind-mapper-node-content > p > a.tag[href="#solo"])';
const HEADER = '.mind-mapper-node:has(a.tag[href="#status/closed"])';
const CARD = '.mind-mapper-node:has(a.tag[href="#bug"])';

interface Box {
  left: number;
  right: number;
}

interface TagGeometry {
  /** The node's inner box (inside border and padding) and its content box, node coordinates. */
  inner: Box;
  content: Box;
  /** The tag (first `a.tag` with `href`). */
  tag: Box;
  /** The text before the tag (the paragraph's first text node; for `<br>` text: its last). */
  text: Box;
  /** The tag sits in the trailing-tags wrapper, and that wrapper's computed float. */
  trailing: boolean;
  float: string;
  /** The card count bubble, if any. */
  count: Box | null;
}

/** Geometry of the tag `href` in the node `selector`, unscaled, relative to the node's left edge. */
function geometry(selector: string, href: string): Promise<TagGeometry> {
  return browser.execute(
    (sel, h) => {
      const node = document.querySelector<HTMLElement>(sel);
      const a = node?.querySelector<HTMLElement>(`a.tag[href="${h}"]`);
      if (!node || !a) throw new Error(`no tag ${h} in ${sel}`);
      const nodeRect = node.getBoundingClientRect();
      const scale = nodeRect.width / node.offsetWidth;
      const box = (r: DOMRect) => ({
        left: Math.round((r.left - nodeRect.left) / scale),
        right: Math.round((r.right - nodeRect.left) / scale),
      });
      const style = getComputedStyle(node);
      const start = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      const end = parseFloat(style.borderRightWidth) + parseFloat(style.paddingRight);
      const block = a.closest('p, li, h1, h2, h3, h4, h5, h6');
      const texts = Array.from(block?.childNodes ?? []).filter(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
      );
      const range = document.createRange();
      range.selectNodeContents(texts[texts.length - 1] ?? a);
      const wrapper = a.closest<HTMLElement>('.mind-mapper-trailing-tags');
      const count = node.querySelector('.mind-mapper-card-count');
      const content = node.querySelector('.mind-mapper-node-content');
      if (!content) throw new Error(`no content in ${sel}`);
      return {
        inner: { left: start, right: node.offsetWidth - end },
        content: box(content.getBoundingClientRect()),
        tag: box(a.getBoundingClientRect()),
        text: box(range.getBoundingClientRect()),
        trailing: wrapper !== null,
        float: wrapper ? getComputedStyle(wrapper).float : 'none',
        count: count ? box(count.getBoundingClientRect()) : null,
      };
    },
    selector,
    href,
  );
}

/** Nodes whose content overflows (clipped) or is cut off. */
function clippedNodes(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.mind-mapper-node'))
      .filter((el) => {
        const content = el.querySelector<HTMLElement>('.mind-mapper-node-content');
        return (
          el.classList.contains('is-clipped') ||
          !content ||
          content.scrollWidth > content.clientWidth ||
          content.scrollHeight > content.clientHeight
        );
      })
      .map((el) => el.dataset.nodeId ?? ''),
  );
}

function nodeWidth(selector: string): Promise<number> {
  return browser.execute(
    (sel) => document.querySelector<HTMLElement>(sel)?.offsetWidth ?? 0,
    selector,
  );
}

async function useLayout(layout: string | null): Promise<void> {
  await browser.executeObsidian(({ app }, l) => {
    for (const leaf of app.workspace.getLeavesOfType('mind-mapper-view')) {
      (leaf.view as unknown as { chooseLayout(l: string | null): void }).chooseLayout(l);
    }
  }, layout);
  await settle();
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1;

describe('trailing tags (issue #92)', function () {
  before(async function () {
    await writeNote(TRAILING, TRAILING_TEXT);
    await openMindMap(TRAILING);
    await settle();
  });

  after(async function () {
    await useLayout(null);
  });

  it('left-aligned text: trailing tags at the right edge; mid-sentence tags inline', async function () {
    await useLayout('left-to-right');
    const short = await geometry(SHORT, '#x/y');
    expect(short).toMatchObject({ trailing: true, float: 'right' });
    expect(near(short.tag.right, short.inner.right)).toBe(true);
    // "short" stays at the left edge, the tag after it with room in between.
    expect(near(short.text.left, short.inner.left)).toBe(true);
    expect(short.tag.left - short.text.right).toBeGreaterThan(20);
    const heading = await geometry(HEADING, '#area/events');
    expect(heading).toMatchObject({ trailing: true, float: 'right' });
    expect(near(heading.tag.right, heading.inner.right)).toBe(true);
    const mid = await geometry(MID, '#solo');
    expect(mid).toMatchObject({ trailing: false, float: 'none' });
    expect(mid.tag.right).toBeLessThanOrEqual(mid.text.left);
    expect(await clippedNodes()).toEqual([]);
  });

  it('right-aligned text: trailing tags at the left edge', async function () {
    await useLayout('right-to-left');
    const short = await geometry(SHORT, '#x/y');
    expect(short).toMatchObject({ trailing: true, float: 'left' });
    expect(near(short.tag.left, short.inner.left)).toBe(true);
    expect(near(short.text.right, short.inner.right)).toBe(true);
    const card = await geometry(CARD, '#bug');
    expect(near(card.tag.left, card.inner.left)).toBe(true);
    // The task checkbox keeps its room: it does not overlap the tag.
    const overlap = await browser.execute((sel) => {
      const node = document.querySelector(sel);
      const box = node?.querySelector('input[type="checkbox"]')?.getBoundingClientRect();
      const tag = node?.querySelector('a.tag')?.getBoundingClientRect();
      return !box || !tag ? 'missing' : box.left < tag.right;
    }, CARD);
    expect(overlap).toBe(false);
    expect(await clippedNodes()).toEqual([]);
  });

  it('kanban: tags at the right edge of cards, before the count bubble on headers; centered root inline', async function () {
    await useLayout('left-to-right');
    const natural = await nodeWidth(CARD);
    await useLayout('kanban');
    const card = await geometry(CARD, '#bug');
    expect(card.inner.right - card.inner.left).toBeGreaterThan(natural);
    expect(near(card.tag.right, card.inner.right)).toBe(true);
    const header = await geometry(HEADER, '#status/closed');
    expect(header.count).not.toBeNull();
    expect(header.tag.right).toBeLessThan(header.count?.left ?? 0);
    expect(header.count!.left - header.tag.right).toBeLessThan(12);
    const root = await geometry(ROOT, '#solo');
    expect(root).toMatchObject({ trailing: true, float: 'none' });
    expect(await clippedNodes()).toEqual([]);
    // Measured without the stretch: back in a tree, the card is as narrow as before.
    await useLayout('left-to-right');
    expect(await nodeWidth(CARD)).toBe(natural);
  });
});

interface TagColors {
  radius: string;
  border: string;
  /** Plain tag: its own background and text; pill: the scope's. */
  background: string;
  color: string;
  /** Pill only: the value part. */
  valueBackground: string | null;
  valueColor: string | null;
}

/** Computed colors of the tag `href` in the node `selector`, and expressions resolved in the canvas. */
function tagColors(
  selector: string,
  href: string,
  expressions: string[],
): Promise<{ tag: TagColors; resolved: Record<string, string> }> {
  return browser.execute(
    (sel, h, exprs) => {
      const a = document.querySelector<HTMLElement>(`${sel} a.tag[href="${h}"]`);
      const canvas = document.querySelector<HTMLElement>('.mind-mapper-canvas');
      if (!a || !canvas) throw new Error(`no tag ${h} in ${sel}`);
      const own = getComputedStyle(a);
      const scope = a.querySelector('.mind-mapper-tag-scope');
      const value = a.querySelector('.mind-mapper-tag-value');
      const main = getComputedStyle(scope ?? a);
      const val = value ? getComputedStyle(value) : null;
      // Plain tags draw their outline as an inset shadow (no border: same size in every theme).
      const shadow = /^(rgb[^)]*\)|color\([^)]*\))/.exec(own.boxShadow)?.[1];
      const probe = canvas.createDiv();
      const resolved: Record<string, string> = {};
      for (const expression of exprs) {
        probe.style.backgroundColor = expression;
        probe.style.borderRadius = expression;
        resolved[expression] = expression.startsWith('var(--radius')
          ? getComputedStyle(probe).borderTopLeftRadius
          : getComputedStyle(probe).backgroundColor;
      }
      probe.remove();
      return {
        tag: {
          radius: own.borderTopLeftRadius,
          border: scope ? own.borderTopColor : (shadow ?? 'none'),
          background: main.backgroundColor,
          color: main.color,
          valueBackground: val?.backgroundColor ?? null,
          valueColor: val?.color ?? null,
        },
        resolved,
      };
    },
    selector,
    href,
    expressions,
  );
}

async function setTheme(theme: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, path, value) => {
      const file = app.vault.getFileByPath(path);
      if (!file) throw new Error(`no note ${path}`);
      await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        frontmatter['mind-mapper-theme'] = value;
      });
    },
    TRAILING,
    theme,
  );
  await settle();
}

const RED = 'var(--color-red)';
const WASH = 'color-mix(in srgb, var(--color-red) 12%, var(--background-primary))';
const DARKER = 'color-mix(in srgb, var(--color-red) 75%, var(--text-normal))';
const BG = 'var(--background-primary)';
const TAG = 'var(--tag-color)';
const TAG_BG = 'var(--tag-background)';
const RADIUS = 'var(--radius-s)';

describe('tag colors and corners (issue #92)', function () {
  before(async function () {
    await writeNote(TRAILING, TRAILING_TEXT);
    await openMindMap(TRAILING);
    await settle();
  });

  after(async function () {
    await setTheme('rainbow');
  });

  it('branch themes: pills and plain tags in the branch color, small corners', async function () {
    const level2 = await tagColors(SHORT, '#x/y', [RED, WASH, BG, RADIUS]);
    const r = level2.resolved;
    expect(level2.tag).toEqual({
      radius: r[RADIUS],
      border: r[RED],
      background: r[RED],
      color: r[BG],
      valueBackground: r[WASH],
      valueColor: r[RED],
    });
    // A plain tag looks like the value part.
    const plain = await tagColors(MID, '#solo', [RED, WASH, RADIUS]);
    expect(plain.tag).toEqual({
      radius: plain.resolved[RADIUS],
      border: plain.resolved[RED],
      background: plain.resolved[WASH],
      color: plain.resolved[RED],
      valueBackground: null,
      valueColor: null,
    });
  });

  it('on a filled level 1 node the branch color is darker', async function () {
    const level1 = await tagColors(HEADING, '#area/events', [DARKER, BG]);
    expect(level1.tag).toMatchObject({
      border: level1.resolved[DARKER],
      background: level1.resolved[DARKER],
      color: level1.resolved[BG],
      valueColor: level1.resolved[DARKER],
    });
  });

  it("the root and theme none keep Obsidian's tag colors", async function () {
    const root = await tagColors(ROOT, '#solo', [TAG, TAG_BG, RADIUS]);
    expect(root.tag).toMatchObject({
      radius: root.resolved[RADIUS],
      background: root.resolved[TAG_BG],
      color: root.resolved[TAG],
      border: 'none',
    });
    await setTheme('none');
    const none = await tagColors(SHORT, '#x/y', [TAG, BG, RADIUS]);
    expect(none.tag).toMatchObject({
      radius: none.resolved[RADIUS],
      border: none.resolved[TAG],
      background: none.resolved[TAG],
      color: none.resolved[BG],
      valueColor: none.resolved[TAG],
    });
  });
});
