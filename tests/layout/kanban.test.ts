import { COUNT_BUBBLE, countBubbleWidth, KANBAN_INDENT } from '../../src/layout/kanban';
import { DIVIDER_GAP, layoutTree } from '../../src/layout/tidyTree';
import type { LayoutOptions, MapLayout, PositionedNode, Size } from '../../src/layout/types';
import { visibleTree } from '../../src/layout/visibleTree';
import type { MindMapNode } from '../../src/parser/types';
import { CollapseState } from '../../src/view/collapseState';

/** Issue #32: the kanban layout. */

function n(id: string, children: MindMapNode[] = [], dividerBefore = false): MindMapNode {
  return {
    id,
    kind: id === 'r' ? 'root' : 'heading',
    label: id,
    markdown: id,
    sectionType: null,
    level: 1,
    line: 0,
    children,
    ...(dividerBefore ? { dividerBefore: true } : {}),
  };
}

const SIZES: Record<string, Size> = {
  r: { width: 100, height: 30 },
  A: { width: 80, height: 30 },
  B: { width: 90, height: 40 },
  C: { width: 60, height: 30 },
  a1: { width: 120, height: 20 },
  a2: { width: 100, height: 20 },
  b1: { width: 140, height: 20 },
};

const options = (patch: Partial<LayoutOptions> = {}): LayoutOptions => ({
  siblingGap: 10,
  levelGap: 50,
  nodeSize: (node) => SIZES[node.id] ?? { width: 60, height: 20 },
  layout: 'kanban',
  maxNodeWidth: 320,
  ...patch,
});

/**
 * r
 * ├ A: a1 (subtasks a1x > a1xx, a1y), a2
 * ├ B: b1
 * └ C (no cards)
 */
const board = (): MindMapNode =>
  n('r', [
    n('A', [n('a1', [n('a1x', [n('a1xx')]), n('a1y')]), n('a2')]),
    n('B', [n('b1')]),
    n('C'),
  ]);

function rects(layout: MapLayout): Record<string, Pick<PositionedNode, 'x' | 'y' | 'width'>> {
  return Object.fromEntries(
    layout.nodes.map((p) => [p.node.id, { x: p.x, y: p.y, width: p.width }]),
  );
}

function rect(layout: MapLayout, id: string): PositionedNode {
  const found = layout.nodes.find((p) => p.node.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

test('the count bubble is as wide as the collapsed-node bubble', () => {
  expect(countBubbleWidth(3)).toBe(COUNT_BUBBLE.minWidth);
  expect(countBubbleWidth(42)).toBe(COUNT_BUBBLE.chrome + 2 * COUNT_BUBBLE.digit);
});

test('root centered above the board, equal columns side by side, cards stacked, subtasks indented', () => {
  const layout = layoutTree({ root: board() }, options());
  // Column width: the widest of headers (+ count bubble), cards and subtasks (+ indent): b1.
  const W = 140;
  const gap = 2 * 10;
  const left = -(3 * W + 2 * gap) / 2;
  const headerTop = 30 + 50;
  // Cards start below the tallest header (B, 40).
  const cardTop = headerTop + 40 + 10;
  expect(rects(layout)).toEqual({
    r: { x: -50, y: 0, width: 100 },
    A: { x: left, y: headerTop, width: W },
    a1: { x: left, y: cardTop, width: W },
    a1x: { x: left + KANBAN_INDENT, y: cardTop + 30, width: W - KANBAN_INDENT },
    a1xx: { x: left + 2 * KANBAN_INDENT, y: cardTop + 60, width: W - 2 * KANBAN_INDENT },
    a1y: { x: left + KANBAN_INDENT, y: cardTop + 90, width: W - KANBAN_INDENT },
    a2: { x: left, y: cardTop + 120, width: W },
    B: { x: left + W + gap, y: headerTop, width: W },
    b1: { x: left + W + gap, y: cardTop, width: W },
    C: { x: left + 2 * (W + gap), y: headerTop, width: W },
  });
  // Heights stay the nodes' own.
  expect(rect(layout, 'B').height).toBe(40);
  expect(rect(layout, 'a1').height).toBe(20);
});

test('no connection lines and no collapse toggles', () => {
  const layout = layoutTree({ root: board() }, options());
  expect(layout.edges).toEqual([]);
  expect(layout.toggles).toBe(false);
  // Every other layout has toggles.
  expect(layoutTree({ root: board() }, { ...options(), layout: 'left-to-right' }).toggles).not.toBe(
    false,
  );
});

test('depth, branch, alignment and child side', () => {
  const layout = layoutTree({ root: board() }, options());
  const of = (id: string) => {
    const p = rect(layout, id);
    return [p.depth, p.branch, p.align, p.childSide];
  };
  expect(of('r')).toEqual([0, -1, 'center', 'bottom']);
  expect(of('A')).toEqual([1, 0, 'left', 'bottom']);
  expect(of('a1')).toEqual([2, 0, 'left', 'bottom']);
  expect(of('a1xx')).toEqual([4, 0, 'left', 'bottom']);
  expect(of('C')).toEqual([1, 2, 'left', 'bottom']);
});

test('column headers carry the number of their cards (direct children); other nodes none', () => {
  const layout = layoutTree({ root: board() }, options());
  const counts = Object.fromEntries(layout.nodes.map((p) => [p.node.id, p.count]));
  expect(counts).toEqual({
    r: undefined,
    A: 2,
    a1: undefined,
    a1x: undefined,
    a1xx: undefined,
    a1y: undefined,
    a2: undefined,
    B: 1,
    b1: undefined,
    C: 0,
  });
});

test('a collapsed column keeps its card count (childCount) and shows no cards', () => {
  const collapsed = new CollapseState();
  collapsed.collapseAll({ root: board() });
  const full = new Map<string, number>([
    ['A', 2],
    ['B', 1],
    ['C', 0],
  ]);
  const layout = layoutTree(
    visibleTree({ root: board() }, collapsed).tree,
    options({ childCount: (node) => full.get(node.id) ?? node.children.length }),
  );
  expect(layout.nodes.map((p) => [p.node.id, p.count])).toEqual([
    ['r', undefined],
    ['A', 2],
    ['B', 1],
    ['C', 0],
  ]);
});

test('header width leaves room for the count bubble', () => {
  // A header wider than every card: the column takes the header plus the bubble.
  const layout = layoutTree(
    { root: n('r', [n('A', [n('a1')])]) },
    options({ nodeSize: (node) => ({ width: node.id === 'A' ? 200 : 100, height: 20 }) }),
  );
  expect(rect(layout, 'A').width).toBe(200 + COUNT_BUBBLE.gap + countBubbleWidth(1));
  expect(rect(layout, 'a1').width).toBe(rect(layout, 'A').width);
});

test('the column width is capped at the max node width; deep subtasks indent less to fit', () => {
  const layout = layoutTree(
    { root: n('r', [n('A', [n('a1', [n('a1x', [n('a1xx')])])])]) },
    options({
      maxNodeWidth: 120,
      nodeSize: (node) => ({ width: node.id === 'a1xx' ? 110 : 100, height: 20 }),
    }),
  );
  const A = rect(layout, 'A');
  expect(A.width).toBe(120);
  expect(rect(layout, 'a1').width).toBe(120);
  // a1x (100): indented by 20, still fits.
  expect(rect(layout, 'a1x')).toMatchObject({ x: A.x + 20, width: 100 });
  // a1xx (110): only 10 left for the indent; never narrower than the node.
  expect(rect(layout, 'a1xx')).toMatchObject({ x: A.x + 10, width: 110 });
});

test('a node wider than the max node width (an image thumbnail) widens the column to it', () => {
  const layout = layoutTree(
    { root: n('r', [n('A', [n('a1')])]) },
    options({
      maxNodeWidth: 160,
      nodeSize: (node) => ({ width: node.id === 'a1' ? 178 : 100, height: 20 }),
    }),
  );
  expect(rect(layout, 'A').width).toBe(178);
  expect(rect(layout, 'a1').width).toBe(178);
});

test('the root alone sits at the origin', () => {
  const layout = layoutTree({ root: n('r') }, options());
  expect(rects(layout)).toEqual({ r: { x: -50, y: 0, width: 100 } });
  expect(layout.dividers).toEqual([]);
  expect(layout.bounds).toEqual({ x: -50, y: 0, width: 100, height: 30 });
});

test('a root wider than the board stays centered on it', () => {
  const layout = layoutTree(
    { root: n('r', [n('A')]) },
    options({ nodeSize: (node) => ({ width: node.id === 'r' ? 400 : 100, height: 20 }) }),
  );
  const r = rect(layout, 'r');
  const A = rect(layout, 'A');
  expect(r.x + r.width / 2).toBe(A.x + A.width / 2);
});

describe('dividers', () => {
  const same = (): LayoutOptions => options({ nodeSize: () => ({ width: 100, height: 20 }) });
  // Column width with a one-digit count bubble.
  const W = 100 + COUNT_BUBBLE.gap + countBubbleWidth(1);

  test('between two columns: extra gap and a vertical line from the headers to the longer column', () => {
    const layout = layoutTree(
      { root: n('r', [n('A', [n('a1'), n('a2')]), n('B', [n('b1')], true)]) },
      same(),
    );
    const A = rect(layout, 'A');
    const B = rect(layout, 'B');
    const a2 = rect(layout, 'a2');
    expect(B.x - (A.x + W)).toBe(20 + DIVIDER_GAP);
    const x = A.x + W + (20 + DIVIDER_GAP) / 2;
    expect(layout.dividers).toEqual([
      { parentId: 'r', from: { x, y: A.y }, to: { x, y: a2.y + a2.height } },
    ]);
  });

  test('between two cards: extra gap and a horizontal line across the column', () => {
    const layout = layoutTree(
      { root: n('r', [n('A', [n('a1', [n('a1x')]), n('a2', [], true)])]) },
      same(),
    );
    const A = rect(layout, 'A');
    const a1x = rect(layout, 'a1x');
    const a2 = rect(layout, 'a2');
    // The line divides whole cards: below a1's subtask.
    expect(a2.y - (a1x.y + a1x.height)).toBe(10 + DIVIDER_GAP);
    const y = a1x.y + a1x.height + (10 + DIVIDER_GAP) / 2;
    expect(layout.dividers).toEqual([
      { parentId: 'A', from: { x: A.x, y }, to: { x: A.x + W, y } },
    ]);
  });

  test('between two subtasks: a horizontal line from the subtask indent to the column edge', () => {
    const layout = layoutTree(
      { root: n('r', [n('A', [n('a1', [n('a1x'), n('a1y', [], true)])])]) },
      same(),
    );
    const A = rect(layout, 'A');
    const a1x = rect(layout, 'a1x');
    const a1y = rect(layout, 'a1y');
    expect(a1y.y - (a1x.y + a1x.height)).toBe(10 + DIVIDER_GAP);
    const y = a1x.y + a1x.height + (10 + DIVIDER_GAP) / 2;
    expect(layout.dividers).toEqual([
      { parentId: 'a1', from: { x: a1y.x, y }, to: { x: A.x + W, y } },
    ]);
  });

  test('before the first child there is no line and no extra gap', () => {
    const layout = layoutTree({ root: n('r', [n('A', [n('a1', [], true)], true)]) }, same());
    const A = rect(layout, 'A');
    expect(rect(layout, 'a1').y - (A.y + A.height)).toBe(10);
    expect(layout.dividers).toEqual([]);
  });

  test('a collapsed column hides the dividers among its cards', () => {
    const tree = { root: n('r', [n('A', [n('a1'), n('a2', [], true)])]) };
    const collapsed = new CollapseState();
    collapsed.toggle('A');
    const layout = layoutTree(visibleTree(tree, collapsed).tree, same());
    expect(layout.dividers).toEqual([]);
  });
});
