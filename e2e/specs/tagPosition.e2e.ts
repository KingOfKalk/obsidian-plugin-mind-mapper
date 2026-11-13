import { browser, expect } from '@wdio/globals';
import { byId, mouseOnNode, openMindMap, settle, writeNote } from '../helpers';

/**
 * Issue #103: the tag position. Outside (the default): the trailing tags of a node's last line in
 * a row below its box, at the edge opposite the text; the layout spaces nodes by box and row.
 */

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Pill extends Box {
  href: string;
}

interface Geometry {
  /** The node's box: its border box, from its layout position (world coordinates). */
  box: Box;
  /** The tag row (`node.tags`) if it is outside the box, world coordinates. */
  row: Box | null;
  /** All tags of the node in DOM order, world coordinates. */
  pills: Pill[];
  /** Lines of text in the box (distinct tops of the text outside the tag row). */
  lines: number;
}

/** Geometry of the node `id`, unscaled world coordinates. */
function geometry(id: string): Promise<Geometry> {
  return browser.execute((nodeId) => {
    const node = document.querySelector<HTMLElement>(
      `.mind-mapper-node[data-node-id="${CSS.escape(nodeId)}"]`,
    );
    if (!node) throw new Error(`no node ${nodeId}`);
    const nodeRect = node.getBoundingClientRect();
    const scale = nodeRect.width / node.offsetWidth;
    const x0 = parseFloat(node.style.left);
    const y0 = parseFloat(node.style.top);
    const world = (r: DOMRect) => ({
      left: Math.round((x0 + (r.left - nodeRect.left) / scale) * 10) / 10,
      right: Math.round((x0 + (r.right - nodeRect.left) / scale) * 10) / 10,
      top: Math.round((y0 + (r.top - nodeRect.top) / scale) * 10) / 10,
      bottom: Math.round((y0 + (r.bottom - nodeRect.top) / scale) * 10) / 10,
    });
    const rowEl = node.querySelector<HTMLElement>('[data-mm-id="node.tags"]');
    const outside = rowEl !== null && getComputedStyle(rowEl).position === 'absolute';
    const content = node.querySelector('.mind-mapper-node-content');
    const tops = new Set<number>();
    const walker = document.createTreeWalker(content ?? node, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if ((t.textContent ?? '').trim() === '' || t.parentElement?.closest('a.tag')) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width > 0) tops.add(Math.round((r.top - nodeRect.top) / scale / 4));
      }
    }
    return {
      box: {
        left: x0,
        right: x0 + node.offsetWidth,
        top: y0,
        bottom: y0 + node.offsetHeight,
      },
      row: outside && rowEl ? world(rowEl.getBoundingClientRect()) : null,
      pills: Array.from(node.querySelectorAll<HTMLElement>('a.tag')).map((a) => ({
        href: a.getAttribute('href') ?? '',
        ...world(a.getBoundingClientRect()),
      })),
      lines: tops.size,
    };
  }, id);
}

/**
 * Overlaps between boxes and tag rows of different nodes, and lines (edges, dividers) through a tag
 * row: none expected.
 */
function collisions(): Promise<string[]> {
  return browser.execute(() => {
    const found: string[] = [];
    interface R {
      id: string;
      kind: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }
    const rects: R[] = [];
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('.mind-mapper-node'))) {
      const id = node.dataset.nodeId ?? '';
      const x0 = parseFloat(node.style.left);
      const y0 = parseFloat(node.style.top);
      rects.push({ id, kind: 'box', x: x0, y: y0, w: node.offsetWidth, h: node.offsetHeight });
      const row = node.querySelector<HTMLElement>('[data-mm-id="node.tags"]');
      if (!row || getComputedStyle(row).position !== 'absolute') continue;
      const nodeRect = node.getBoundingClientRect();
      const scale = nodeRect.width / node.offsetWidth;
      // The pills: the row element itself may be wider (max node width) than what it shows.
      for (const pill of Array.from(row.querySelectorAll('a.tag'))) {
        const r = pill.getBoundingClientRect();
        rects.push({
          id,
          kind: 'tag',
          x: x0 + (r.left - nodeRect.left) / scale,
          y: y0 + (r.top - nodeRect.top) / scale,
          w: r.width / scale,
          h: r.height / scale,
        });
      }
    }
    const hit = (a: R, b: R) =>
      a.x < b.x + b.w - 0.5 &&
      b.x < a.x + a.w - 0.5 &&
      a.y < b.y + b.h - 0.5 &&
      b.y < a.y + a.h - 0.5;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const [a, b] = [rects[i], rects[j]];
        if (a && b && a.id !== b.id && hit(a, b)) {
          found.push(`${a.kind} ${a.id} overlaps ${b.kind} ${b.id}`);
        }
      }
    }
    const paths = Array.from(
      document.querySelectorAll<SVGPathElement>('path.mind-mapper-edge, path.mind-mapper-divider'),
    );
    for (const path of paths) {
      const length = path.getTotalLength();
      for (let s = 0; s <= length; s += 2) {
        const p = path.getPointAtLength(s);
        const tag = rects.find(
          (r) => r.kind === 'tag' && p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h,
        );
        if (tag) {
          found.push(`${path.getAttribute('class')} crosses the tags of ${tag.id}`);
          break;
        }
      }
    }
    return found;
  });
}

async function useLayout(layout: string | null): Promise<void> {
  await browser.executeObsidian(({ app }, l) => {
    for (const leaf of app.workspace.getLeavesOfType('mind-mapper-view')) {
      (leaf.view as unknown as { chooseLayout(l: string | null): void }).chooseLayout(l);
    }
  }, layout);
  await settle();
}

async function setFrontmatter(path: string, key: string, value: string | null): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, notePath, k, v) => {
      const file = app.vault.getFileByPath(notePath);
      if (!file) throw new Error(`no note ${notePath}`);
      await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        if (v === null) delete frontmatter[k];
        else frontmatter[k] = v;
      });
    },
    path,
    key,
    value,
  );
  await settle();
}

const near = (a: number, b: number, tolerance = 1) => Math.abs(a - b) <= tolerance;

/** The note of issue #99, exactly as reported. */
const ISSUE_99 = 'issue-99.md';
const ISSUE_99_TEXT = [
  '# Agenda',
  '## Tasks',
  '### Backlog',
  '---',
  '### In Progress',
  '- Backup & restore playbook #server/dns',
  '- Refactor Run #mindMapper',
  '- Milestone Review #mindmapper/docs',
  '',
].join('\n');
const BACKUP = 'Agenda/Tasks/In Progress/#1';

describe('tag position outside (issue #103)', function () {
  it("#99's note: one line of text, the pill in a row below the box at its right edge", async function () {
    await writeNote(ISSUE_99, ISSUE_99_TEXT);
    await openMindMap(ISSUE_99);
    await settle();
    expect(
      await browser.execute(() =>
        Array.from(document.querySelector('.mind-mapper-canvas')?.classList ?? []).filter((c) =>
          c.startsWith('mind-mapper-tags-'),
        ),
      ),
    ).toEqual(['mind-mapper-tags-outside']);
    const backup = await geometry(BACKUP);
    expect(backup.lines).toBe(1);
    expect(backup.row).not.toBeNull();
    expect(backup.pills.map((p) => p.href)).toEqual(['#server/dns']);
    const [pill] = backup.pills;
    // 4 px below the box, flush with its right edge (the text is left-aligned: right side).
    expect(near(pill!.top, backup.box.bottom + 4)).toBe(true);
    expect(near(pill!.right, backup.box.right)).toBe(true);
    // The box holds only the text: well below the max node width.
    expect(backup.box.right - backup.box.left).toBeLessThan(300);
    expect(await collisions()).toEqual([]);
  });

  it('left side (right-aligned text): the row at the left edge of the box', async function () {
    await openMindMap(ISSUE_99);
    await useLayout('right-to-left');
    const backup = await geometry(BACKUP);
    const [pill] = backup.pills;
    expect(backup.lines).toBe(1);
    expect(near(pill!.top, backup.box.bottom + 4)).toBe(true);
    expect(near(pill!.left, backup.box.left)).toBe(true);
    expect(await collisions()).toEqual([]);
    await useLayout(null);
  });
});

const NOTE = 'tag-rows.md';
const NOTE_TEXT = [
  '---',
  'mind-mapper-layout: left-to-right',
  '---',
  '# Tag rows #root/tag',
  '',
  '## Refactor run #team/dev #q3 #q3',
  '',
  '## Plan #alpha/one #beta/two #gamma/three #delta/four #epsilon/five',
  '',
  '## Mid #solo in the middle',
  '',
  '- Item first #early/tag',
  '',
  '  Continuation text #late/tag',
  '',
  '## Last',
  '',
].join('\n');
/** A heading's ID part, escaped like src/parser/nodeId.ts: `\\`, `/`, `[` and `#`. */
const esc = (label: string) => label.replace(/[\\/[#]/g, (char) => `\\${char}`);
const ROOT = esc('Tag rows #root/tag');
const REFACTOR = `${ROOT}/${esc('Refactor run #team/dev #q3 #q3')}`;
const PLAN = `${ROOT}/${esc('Plan #alpha/one #beta/two #gamma/three #delta/four #epsilon/five')}`;
const MID = `${ROOT}/${esc('Mid #solo in the middle')}`;

/** Selector of the node with this ID (a CSS string: backslashes escaped). */
const nodeSel = (id: string) => `.mind-mapper-node[data-node-id="${id.replace(/\\/g, '\\\\')}"]`;

/** IDs of the shown nodes (to find nodes whose ID has a counter). */
function nodeIds(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.mind-mapper-node')).map(
      (el) => el.dataset.nodeId ?? '',
    ),
  );
}

/** Pills grouped by line (same top), each line left to right. */
function lines(pills: Pill[]): Pill[][] {
  const byTop = new Map<number, Pill[]>();
  for (const pill of pills) {
    const key = [...byTop.keys()].find((top) => near(top, pill.top, 2)) ?? pill.top;
    byTop.set(key, [...(byTop.get(key) ?? []), pill]);
  }
  return [...byTop.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, line]) => line.sort((a, b) => a.left - b.left));
}

describe('tag rows (issue #103)', function () {
  before(async function () {
    await writeNote(NOTE, NOTE_TEXT);
    await openMindMap(NOTE);
    await settle();
  });

  it('several tags: one row in the order of the note, 4 px apart, duplicates as written', async function () {
    const ids = await nodeIds();
    expect(ids).toContain(REFACTOR);
    const refactor = await geometry(REFACTOR);
    expect(refactor.pills.map((p) => p.href)).toEqual(['#team/dev', '#q3', '#q3']);
    const [line, ...more] = lines(refactor.pills);
    expect(more).toEqual([]);
    expect(line!.map((p) => p.href)).toEqual(['#team/dev', '#q3', '#q3']);
    for (let i = 1; i < line!.length; i++) {
      expect(near(line![i]!.left - line![i - 1]!.right, 4)).toBe(true);
    }
    expect(near(line![line!.length - 1]!.right, refactor.box.right)).toBe(true);
    expect(near(line![0]!.top, refactor.box.bottom + 4)).toBe(true);
  });

  it('a row wider than the max node width wraps; every row at the right edge; the box stays small', async function () {
    const plan = await geometry(PLAN);
    expect(plan.lines).toBe(1);
    expect(plan.box.right - plan.box.left).toBeLessThan(100);
    const rows = lines(plan.pills);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.flat().map((p) => p.href)).toEqual([
      '#alpha/one',
      '#beta/two',
      '#gamma/three',
      '#delta/four',
      '#epsilon/five',
    ]);
    for (const row of rows) {
      expect(near(row[row.length - 1]!.right, plan.box.right)).toBe(true);
    }
    // Wrapped at the max node width (320 px), not at the box width.
    const left = Math.min(...plan.pills.map((p) => p.left));
    expect(plan.box.right - left).toBeLessThanOrEqual(320);
    expect(plan.box.right - left).toBeGreaterThan(plan.box.right - plan.box.left);
    // The rows: 4 px apart.
    expect(near(rows[1]![0]!.top - rows[0]![0]!.bottom, 4)).toBe(true);
    expect(await collisions()).toEqual([]);
  });

  it('mid-sentence tags, earlier-line tags and the root keep their tags inside', async function () {
    const mid = await geometry(MID);
    expect(mid.row).toBeNull();
    const [solo] = mid.pills;
    expect(solo!.bottom).toBeLessThanOrEqual(mid.box.bottom);
    const item = (await nodeIds()).find((id) => id.startsWith(`${MID}/`));
    if (!item) throw new Error('no list item');
    const both = await geometry(item);
    const early = both.pills.find((p) => p.href === '#early/tag');
    const late = both.pills.find((p) => p.href === '#late/tag');
    expect(early!.bottom).toBeLessThanOrEqual(both.box.bottom);
    expect(near(late!.top, both.box.bottom + 4)).toBe(true);
    const root = await geometry(ROOT);
    expect(root.row).toBeNull();
    expect(root.pills[0]!.bottom).toBeLessThanOrEqual(root.box.bottom);
  });

  it('vertical layouts (centered text) keep the tags inside', async function () {
    await useLayout('top-to-bottom');
    const refactor = await geometry(REFACTOR);
    expect(refactor.row).toBeNull();
    for (const pill of refactor.pills) expect(pill.bottom).toBeLessThanOrEqual(refactor.box.bottom);
    await useLayout(null);
  });

  it('a click on a tag in the row opens the tag search; a click on the row selects the node', async function () {
    await mouseOnNode(ROOT, 'click');
    await browser.$(`${nodeSel(REFACTOR)} a.tag[href="#team/dev"] .mind-mapper-tag-value`).click();
    await browser.pause(500);
    const query = await browser.executeObsidian(({ app }) => {
      const leaf = app.workspace.getLeavesOfType('search')[0];
      const view = leaf?.view as unknown as { getQuery?: () => string } | undefined;
      return view?.getQuery?.() ?? null;
    });
    expect(query).toBe('tag:#team/dev');
    const selected = await browser.execute(
      () => document.querySelector<HTMLElement>('.mind-mapper-node.is-selected')?.dataset.nodeId,
    );
    expect(selected).toBe(ROOT);
    await browser.execute((id) => {
      const row = document.querySelector(
        `.mind-mapper-node[data-node-id="${CSS.escape(id)}"] [data-mm-id="node.tags"]`,
      );
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    }, REFACTOR);
    expect(
      await browser.execute(
        () => document.querySelector<HTMLElement>('.mind-mapper-node.is-selected')?.dataset.nodeId,
      ),
    ).toBe(REFACTOR);
  });

  it('frontmatter inside: the tags move into the box, the map lays out again', async function () {
    await setFrontmatter(NOTE, 'mind-mapper-tags', 'inside');
    const refactor = await geometry(REFACTOR);
    expect(refactor.row).toBeNull();
    for (const pill of refactor.pills) expect(pill.bottom).toBeLessThanOrEqual(refactor.box.bottom);
    expect(near(refactor.pills[2]!.right, refactor.box.right - 9)).toBe(true);
    await setFrontmatter(NOTE, 'mind-mapper-tags', null);
    const back = await geometry(REFACTOR);
    expect(back.row).not.toBeNull();
    expect(await collisions()).toEqual([]);
  });

  it('an invalid mind-mapper-tags falls back to the setting with a notice', async function () {
    await setFrontmatter(NOTE, 'mind-mapper-tags', 'below');
    const notices = await browser.execute(
      () =>
        Array.from(document.querySelectorAll('.notice')).filter((el) =>
          el.textContent?.includes('unknown mind-mapper-tags "below"'),
        ).length,
    );
    expect(notices).toBe(1);
    expect((await geometry(REFACTOR)).row).not.toBeNull();
    await setFrontmatter(NOTE, 'mind-mapper-tags', null);
  });
});

describe('a clipped node (issue #103)', function () {
  it('shows no tag row and gets no room for one', async function () {
    const long = Array.from({ length: 14 }, (_, i) => `Line ${i} of a long paragraph`).join(' ');
    await writeNote(
      'tag-clipped.md',
      `---\nmind-mapper-layout: left-to-right\n---\n# Clipped\n\n${long} #end/tag\n\nNext\n`,
    );
    await openMindMap('tag-clipped.md');
    await settle();
    const clipped = await geometry('Clipped/#1');
    const next = await geometry('Clipped/#2');
    expect(clipped.row).not.toBeNull();
    expect(clipped.pills[0]!.right - clipped.pills[0]!.left).toBe(0);
    // Sibling gap 12: no room for a row.
    expect(near(next.box.top, clipped.box.bottom + 12)).toBe(true);
  });
});

const BOARD = 'tag-board.md';
const BOARD_TEXT = [
  '---',
  'mind-mapper-layout: kanban',
  '---',
  '# Board',
  '',
  '## To do #status/open',
  '',
  '- Card one #bug',
  '  - Subtask #sub/task',
  '- Card two',
  '',
  '## Done',
  '',
  '- Card three',
  '',
].join('\n');

describe('tag rows in the kanban layout (issue #103)', function () {
  before(async function () {
    await writeNote(BOARD, BOARD_TEXT);
    await openMindMap(BOARD);
    await settle();
  });

  it('header, card and subtask: the row below the box at its right edge; the count stays in the header', async function () {
    const ids = await nodeIds();
    const header = ids.find((id) => id.startsWith('Board/To do'));
    const card = ids.find((id) => id.endsWith('/#1') && !id.includes('#1/'));
    const subtask = ids.find((id) => id.includes('#1/#1'));
    const next = ids.find((id) => id.endsWith('/#2'));
    if (!header || !card || !subtask || !next) throw new Error(`nodes: ${ids.join(', ')}`);
    for (const id of [header, card, subtask]) {
      const g = await geometry(id);
      expect(g.row).not.toBeNull();
      const [pill] = g.pills;
      expect(near(pill!.top, g.box.bottom + 4)).toBe(true);
      expect(near(pill!.right, g.box.right)).toBe(true);
    }
    const count = await browser.execute((id) => {
      const node = document.querySelector<HTMLElement>(
        `.mind-mapper-node[data-node-id="${CSS.escape(id)}"]`,
      );
      const bubble = node?.querySelector('[data-mm-id="node.card-count"]')?.getBoundingClientRect();
      const box = node?.getBoundingClientRect();
      return bubble && box ? bubble.bottom <= box.bottom && bubble.right <= box.right : null;
    }, header);
    expect(count).toBe(true);
    // The next card starts below the subtask's row.
    const sub = await geometry(subtask);
    const two = await geometry(next);
    expect(two.box.top).toBeGreaterThan(sub.pills[0]!.bottom);
    expect(await collisions()).toEqual([]);
    expect(await browser.$$(byId('node.tags')).length).toBeGreaterThanOrEqual(3);
  });
});
