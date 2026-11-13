import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { edgePath } from '../../src/layout/edgePath';
import { estimateSize } from '../../src/layout/nodeSize';
import { layoutTree } from '../../src/layout/tidyTree';
import {
  LAYOUT_NAMES,
  type LayoutEdge,
  type LayoutOptions,
  type MapLayout,
  type MapLayoutName,
  type Point,
  type PositionedNode,
  type Rect,
  type Size,
  TAG_ROW_GAP,
} from '../../src/layout/types';
import { toParserInput } from '../../src/parser/adapter';
import { buildTree } from '../../src/parser/buildTree';
import type { MindMapNode } from '../../src/parser/types';
import { loadFixture } from '../fixtures';

/** Issue #103: trailing tags in a row below the box; the layout spaces nodes by their footprint. */

function n(id: string, ...children: MindMapNode[]): MindMapNode {
  return {
    id,
    kind: id === 'r' ? 'root' : 'heading',
    label: id,
    markdown: id,
    sectionType: null,
    level: 1,
    line: 0,
    children,
  };
}

const BOX: Size = { width: 100, height: 20 };

function options(
  layout: MapLayoutName,
  rows: Record<string, Size>,
  patch: Partial<LayoutOptions> = {},
): LayoutOptions {
  return {
    siblingGap: 10,
    levelGap: 50,
    nodeSize: () => BOX,
    tagRow: (node) => rows[node.id] ?? null,
    layout,
    maxNodeWidth: 320,
    ...patch,
  };
}

function byId(layout: MapLayout): Map<string, PositionedNode> {
  return new Map(layout.nodes.map((p) => [p.node.id, p]));
}

function get(layout: MapLayout, id: string): PositionedNode {
  const p = byId(layout).get(id);
  if (!p) throw new Error(`no node ${id}`);
  return p;
}

const ROW: Size = { width: 60, height: 22 };

describe('tree layouts', () => {
  test('the row sits 4 px below the box, at the edge opposite the text (right side: right edge)', () => {
    const layout = layoutTree(
      { root: n('r', n('a'), n('b')) },
      options('left-to-right', { a: ROW }),
    );
    const a = get(layout, 'a');
    expect(a.align).toBe('left');
    expect(a.tags).toEqual({
      x: a.x + a.width - ROW.width,
      y: a.y + a.height + TAG_ROW_GAP,
      ...ROW,
    });
    expect(get(layout, 'b').tags).toBeUndefined();
  });

  test('siblings are spaced by the footprint (box + gap + row); the box keeps its size', () => {
    const layout = layoutTree(
      { root: n('r', n('a'), n('b')) },
      options('left-to-right', { a: ROW }),
    );
    const a = get(layout, 'a');
    const b = get(layout, 'b');
    expect({ width: a.width, height: a.height }).toEqual(BOX);
    expect(b.y).toBe(a.y + a.height + TAG_ROW_GAP + ROW.height + 10);
  });

  test('edges attach to the box: middle of its text-side edge', () => {
    const layout = layoutTree(
      { root: n('r', n('a', n('a1'))) },
      options('left-to-right', { a: ROW }),
    );
    const a = get(layout, 'a');
    const a1 = get(layout, 'a1');
    const into = layout.edges.find((e) => e.toId === 'a');
    const out = layout.edges.find((e) => e.fromId === 'a');
    expect(into?.target).toEqual({ x: a.x, y: a.y + a.height / 2 });
    expect(out?.source).toEqual({ x: a.x + a.width, y: a.y + a.height / 2 });
    // A single child stays level with its parent's box (a straight line), not with the footprint.
    expect(a1.y + a1.height / 2).toBe(a.y + a.height / 2);
  });

  test('a row wider than its box reaches towards the parent; the column moves away to make room', () => {
    const wide: Size = { width: 180, height: 22 };
    const plain = layoutTree({ root: n('r', n('a'), n('b')) }, options('left-to-right', {}));
    const layout = layoutTree(
      { root: n('r', n('a'), n('b')) },
      options('left-to-right', { a: wide }),
    );
    const a = get(layout, 'a');
    const b = get(layout, 'b');
    const overhang = wide.width - BOX.width;
    // Boxes of a column stay flush: the whole column moves by the widest overhang.
    expect(a.x).toBe(get(plain, 'a').x + overhang);
    expect(b.x).toBe(a.x);
    // The row ends at the box's right edge and starts where the column used to start.
    expect(a.tags?.x).toBe(get(plain, 'a').x);
    expect((a.tags?.x ?? 0) + wide.width).toBe(a.x + a.width);
    // The lines bend before the rows: a straight piece at the box's middle leads to the box.
    const into = layout.edges.find((e) => e.toId === 'b');
    expect(into?.target).toEqual({ x: b.x, y: b.y + b.height / 2 });
    expect(into?.via).toEqual({ x: get(plain, 'b').x, y: b.y + b.height / 2 });
  });

  test('left side (right-aligned text): the row at the left edge; mirrored', () => {
    const wide: Size = { width: 180, height: 22 };
    const layout = layoutTree(
      { root: n('r', n('a'), n('b')) },
      options('right-to-left', { a: ROW, b: wide }),
    );
    const a = get(layout, 'a');
    const b = get(layout, 'b');
    expect(a.align).toBe('right');
    expect(a.tags).toEqual({ x: a.x, y: a.y + a.height + TAG_ROW_GAP, ...ROW });
    expect(b.tags).toEqual({ x: b.x, y: b.y + b.height + TAG_ROW_GAP, ...wide });
    // b's row reaches past its box towards the root, which stays clear of it.
    const root = get(layout, 'r');
    expect((b.tags?.x ?? 0) + wide.width).toBeLessThan(root.x);
    expect(a.x + a.width).toBe(b.x + b.width);
  });

  test('circle layouts: rows on both sides, at the outer edge', () => {
    const tree = { root: n('r', n('a'), n('b')) };
    const layout = layoutTree(tree, options('circle-clockwise', { a: ROW, b: ROW }));
    const a = get(layout, 'a');
    const b = get(layout, 'b');
    expect([a.align, b.align]).toEqual(['left', 'right']);
    expect(a.tags?.x).toBe(a.x + a.width - ROW.width);
    expect(b.tags?.x).toBe(b.x);
  });

  test('the root keeps its tags inside; vertical layouts (centered text) too', () => {
    for (const layout of ['left-to-right', 'circle-clockwise', 'top-to-bottom', 'bottom-to-top']) {
      const tree = { root: n('r', n('a'), n('b')) };
      const result = layoutTree(tree, options(layout as MapLayoutName, { r: ROW, a: ROW }));
      expect(get(result, 'r').tags).toBeUndefined();
      if (layout.endsWith('bottom') || layout.startsWith('bottom')) {
        const plain = layoutTree(tree, options(layout as MapLayoutName, {}));
        expect(result).toEqual(plain);
      }
    }
  });

  test('dividers start where the column starts, rows included', () => {
    const b = { ...n('b'), dividerBefore: true };
    const layout = layoutTree(
      { root: n('r', n('a'), b) },
      options('left-to-right', { a: { width: 180, height: 22 } }),
    );
    const divider = layout.dividers[0];
    const a = get(layout, 'a');
    expect(divider?.from.x).toBe(a.tags?.x);
    expect(divider?.from.y).toBeGreaterThan((a.tags?.y ?? 0) + 22);
  });

  test('bounds enclose the rows', () => {
    const layout = layoutTree({ root: n('r', n('a')) }, options('left-to-right', { a: ROW }));
    const a = get(layout, 'a');
    expect(layout.bounds.y + layout.bounds.height).toBe(a.y + a.height + TAG_ROW_GAP + ROW.height);
  });
});

describe('kanban', () => {
  const board = () => n('r', n('A', n('a1', n('a1x')), n('a2')), n('B', n('b1')));

  test('a card row sits below the card at its right edge; the next card below the row', () => {
    const layout = layoutTree({ root: board() }, options('kanban', { a1: ROW }));
    const a1 = get(layout, 'a1');
    const a1x = get(layout, 'a1x');
    expect(a1.tags).toEqual({
      x: a1.x + a1.width - ROW.width,
      y: a1.y + a1.height + TAG_ROW_GAP,
      ...ROW,
    });
    // Subtask gap: a third of the sibling gap, rounded.
    expect(a1x.y).toBe(a1.y + a1.height + TAG_ROW_GAP + ROW.height + 3);
  });

  test('a subtask row: the next card below it', () => {
    const layout = layoutTree({ root: board() }, options('kanban', { a1x: ROW }));
    const a1x = get(layout, 'a1x');
    expect(a1x.tags?.y).toBe(a1x.y + a1x.height + TAG_ROW_GAP);
    expect(get(layout, 'a2').y).toBe(a1x.y + a1x.height + TAG_ROW_GAP + ROW.height + 10);
  });

  test('a header row: all cards start below the tallest header footprint', () => {
    const plain = layoutTree({ root: board() }, options('kanban', {}));
    const layout = layoutTree({ root: board() }, options('kanban', { A: ROW }));
    const header = get(layout, 'A');
    expect(header.tags).toEqual({
      x: header.x + header.width - ROW.width,
      y: header.y + header.height + TAG_ROW_GAP,
      ...ROW,
    });
    const shift = TAG_ROW_GAP + ROW.height;
    expect(get(layout, 'a1').y).toBe(get(plain, 'a1').y + shift);
    expect(get(layout, 'b1').y).toBe(get(plain, 'b1').y + shift);
  });

  test('the column is at least as wide as the widest row (capped at the max node width)', () => {
    const layout = layoutTree(
      { root: board() },
      options('kanban', { a2: { width: 250, height: 22 } }),
    );
    expect(get(layout, 'a1').width).toBe(250);
    const capped = layoutTree(
      { root: board() },
      options('kanban', { a2: { width: 250, height: 22 } }, { maxNodeWidth: 200 }),
    );
    expect(get(capped, 'a1').width).toBe(200);
  });

  test('the headline (root) keeps its tags inside', () => {
    const layout = layoutTree({ root: board() }, options('kanban', { r: ROW }));
    expect(get(layout, 'r').tags).toBeUndefined();
  });
});

// "No overlaps" (issue #103): with a tag row on every node, no two footprints overlap and no
// line (edge or divider) crosses a row, in all seven layouts.

function footprint(p: PositionedNode): Rect[] {
  return p.tags ? [p, p.tags] : [p];
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Points along the drawn edge path (parsed from `edgePath`: cubic, then an optional line). */
function edgePoints(edge: LayoutEdge): Point[] {
  const numbers = (edgePath(edge).match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  const [x0, y0, x1, y1, x2, y2, x3, y3, x4, y4] = numbers as (number | undefined)[];
  const points: Point[] = [];
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const u = 1 - t;
    const at = (a = 0, b = 0, c = 0, d = 0) =>
      u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
    points.push({ x: at(x0, x1, x2, x3), y: at(y0, y1, y2, y3) });
    if (x4 !== undefined && y4 !== undefined) {
      points.push({ x: (x3 ?? 0) + (x4 - (x3 ?? 0)) * t, y: (y3 ?? 0) + (y4 - (y3 ?? 0)) * t });
    }
  }
  return points;
}

function inside(point: Point, rect: Rect): boolean {
  return (
    point.x > rect.x &&
    point.x < rect.x + rect.width &&
    point.y > rect.y &&
    point.y < rect.y + rect.height
  );
}

function expectClear(layout: MapLayout, label: string): void {
  const rects = layout.nodes.flatMap((p) => footprint(p).map((r) => ({ id: p.node.id, r })));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [a, b] = [rects[i], rects[j]];
      if (a && b && a.id !== b.id && intersects(a.r, b.r)) {
        throw new Error(`${label}: ${a.id} overlaps ${b.id}`);
      }
    }
  }
  const rows = layout.nodes.flatMap((p) => (p.tags ? [{ id: p.node.id, r: p.tags }] : []));
  for (const edge of layout.edges) {
    const points = edgePoints(edge);
    for (const row of rows) {
      if (points.some((pt) => inside(pt, row.r))) {
        throw new Error(
          `${label}: edge ${edge.fromId} -> ${edge.toId} crosses the row of ${row.id}`,
        );
      }
    }
  }
  for (const divider of layout.dividers) {
    for (const row of rows) {
      const points = Array.from({ length: 101 }, (_, i) => ({
        x: divider.from.x + ((divider.to.x - divider.from.x) * i) / 100,
        y: divider.from.y + ((divider.to.y - divider.from.y) * i) / 100,
      }));
      if (points.some((pt) => inside(pt, row.r))) {
        throw new Error(`${label}: a divider crosses the row of ${row.id}`);
      }
    }
  }
}

const fixtureNames = readdirSync(join(process.cwd(), 'tests', 'vault', 'fixtures'))
  .filter((file) => file.endsWith('.cache.json'))
  .map((file) => file.replace(/\.cache\.json$/, ''));

/** A row on every node, between narrower and much wider than the box (by the node's ID). */
function rowOf(node: MindMapNode): Size {
  let hash = 0;
  for (const ch of node.id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return { width: 30 + (Math.abs(hash) % 290), height: 22 + (Math.abs(hash) % 2) * 26 };
}

test.each(LAYOUT_NAMES)(
  '%s: no footprint overlaps and no line crosses a row (fixtures)',
  (layout) => {
    expect(fixtureNames.length).toBeGreaterThan(10);
    for (const name of fixtureNames) {
      const { text, cache } = loadFixture(name);
      const tree = buildTree(toParserInput(cache, text), name);
      const result = layoutTree(tree, {
        siblingGap: 12,
        levelGap: 60,
        nodeSize: estimateSize,
        tagRow: rowOf,
        layout,
        maxNodeWidth: 320,
      });
      expectClear(result, `${layout} ${name}`);
    }
  },
);
