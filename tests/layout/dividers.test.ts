import { DIVIDER_GAP, layoutTree } from '../../src/layout/tidyTree';
import type { LayoutOptions, MapLayoutName, PositionedNode } from '../../src/layout/types';
import { visibleTree } from '../../src/layout/visibleTree';
import type { MindMapNode } from '../../src/parser/types';
import { CollapseState } from '../../src/view/collapseState';

function n(id: string, children: MindMapNode[] = [], dividerBefore = false): MindMapNode {
  return {
    id,
    kind: 'paragraph',
    label: id,
    markdown: id,
    sectionType: null,
    level: 0,
    line: 0,
    children,
    ...(dividerBefore ? { dividerBefore: true } : {}),
  };
}

const widths: Record<string, number> = { a: 100, b: 140 };

function options(layout: MapLayoutName): LayoutOptions {
  return {
    siblingGap: 10,
    levelGap: 50,
    nodeSize: (node) => ({ width: widths[node.id] ?? 100, height: 20 }),
    layout,
  };
}

function rect(nodes: PositionedNode[], id: string): PositionedNode {
  const found = nodes.find((p) => p.node.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

test('left-to-right: extra gap and a horizontal line across the wider of two leaves', () => {
  const layout = layoutTree({ root: n('r', [n('a'), n('b', [], true)]) }, options('left-to-right'));
  const a = rect(layout.nodes, 'a');
  const b = rect(layout.nodes, 'b');
  expect(b.y - (a.y + a.height)).toBe(10 + DIVIDER_GAP);
  expect(layout.dividers).toEqual([
    {
      parentId: 'r',
      from: { x: a.x, y: a.y + a.height + (10 + DIVIDER_GAP) / 2 },
      to: { x: a.x + 140, y: a.y + a.height + (10 + DIVIDER_GAP) / 2 },
    },
  ]);
});

test('without a divider there is no extra gap and no line', () => {
  const layout = layoutTree({ root: n('r', [n('a'), n('b')]) }, options('left-to-right'));
  const a = rect(layout.nodes, 'a');
  expect(rect(layout.nodes, 'b').y - (a.y + a.height)).toBe(10);
  expect(layout.dividers).toEqual([]);
});

test('right-to-left: the line is mirrored with its nodes', () => {
  const layout = layoutTree({ root: n('r', [n('a'), n('b', [], true)]) }, options('right-to-left'));
  const a = rect(layout.nodes, 'a');
  const [divider] = layout.dividers;
  expect(divider?.from.x).toBeCloseTo(a.x + a.width);
  expect(divider?.to.x).toBeCloseTo(a.x + a.width - 140);
  expect(divider?.from.y).toBe(divider?.to.y);
});

test('top-to-bottom: a vertical line between the two siblings', () => {
  const layout = layoutTree({ root: n('r', [n('a'), n('b', [], true)]) }, options('top-to-bottom'));
  const a = rect(layout.nodes, 'a');
  const b = rect(layout.nodes, 'b');
  expect(b.x - (a.x + a.width)).toBe(10 + DIVIDER_GAP);
  const [divider] = layout.dividers;
  expect(divider?.from.x).toBe(divider?.to.x);
  expect(divider?.from.x).toBe(a.x + a.width + (10 + DIVIDER_GAP) / 2);
  expect(divider?.from.y).toBe(a.y);
});

test('a divider deeper in the tree is placed under its own parent', () => {
  const layout = layoutTree(
    { root: n('r', [n('p', [n('a'), n('b', [], true)])]) },
    options('left-to-right'),
  );
  expect(layout.dividers.map((d) => d.parentId)).toEqual(['p']);
});

describe('the line spans the two neighboring subtrees', () => {
  // a has one child (a1), b a deeper branch (b1 > b11): b's subtree reaches further out.
  const tree = () => ({
    root: n('r', [n('a', [n('a1')]), n('b', [n('b1', [n('b11')])], true)]),
  });

  test('left-to-right: from the child column to the far edge of the deepest descendant', () => {
    const layout = layoutTree(tree(), options('left-to-right'));
    const a = rect(layout.nodes, 'a');
    const b11 = rect(layout.nodes, 'b11');
    const [divider] = layout.dividers;
    expect(divider?.from.x).toBe(a.x);
    expect(divider?.to.x).toBe(b11.x + b11.width);
    expect(divider?.from.y).toBe(divider?.to.y);
  });

  test('right-to-left: mirrored, reaching the left edge of the deepest descendant', () => {
    const layout = layoutTree(tree(), options('right-to-left'));
    const a = rect(layout.nodes, 'a');
    const b11 = rect(layout.nodes, 'b11');
    const [divider] = layout.dividers;
    expect(divider?.from.x).toBeCloseTo(a.x + a.width);
    expect(divider?.to.x).toBeCloseTo(b11.x);
  });

  test('top-to-bottom: vertical, down to the bottom edge of the deepest descendant', () => {
    const layout = layoutTree(tree(), options('top-to-bottom'));
    const a = rect(layout.nodes, 'a');
    const b11 = rect(layout.nodes, 'b11');
    const [divider] = layout.dividers;
    expect(divider?.from.x).toBe(divider?.to.x);
    expect(divider?.from.y).toBe(a.y);
    expect(divider?.to.y).toBe(b11.y + b11.height);
  });

  test('circle left side: reaching the left edge of the deepest descendant', () => {
    // c3, c4 on the left side; c4 (flagged) has the deeper branch.
    const root = n('r', [n('c1'), n('c2'), n('c3', [n('x')]), n('c4', [n('y', [n('z')])], true)]);
    const layout = layoutTree({ root }, options('circle-clockwise'));
    const c3 = rect(layout.nodes, 'c3');
    const z = rect(layout.nodes, 'z');
    const [divider] = layout.dividers;
    expect(layout.dividers).toHaveLength(1);
    expect(Math.max(divider?.from.x ?? 0, divider?.to.x ?? 0)).toBeCloseTo(c3.x + c3.width);
    expect(Math.min(divider?.from.x ?? 0, divider?.to.x ?? 0)).toBeCloseTo(z.x);
  });

  test('a collapsed neighbor counts only with its visible part', () => {
    const collapsed = new CollapseState();
    collapsed.toggle('b1');
    const layout = layoutTree(visibleTree(tree(), collapsed).tree, options('left-to-right'));
    const a1 = rect(layout.nodes, 'a1');
    const b1 = rect(layout.nodes, 'b1');
    const [divider] = layout.dividers;
    // b1 (100) and a1 (100) end in the same column; b11 is hidden.
    expect(divider?.to.x).toBe(Math.max(a1.x + a1.width, b1.x + b1.width));
    expect(layout.nodes.some((p) => p.node.id === 'b11')).toBe(false);
  });
});

describe('circle layouts', () => {
  // 4 branches: c1, c2 right (top to bottom), c3, c4 left (bottom to top)
  const branches = (flag: string) => ['c1', 'c2', 'c3', 'c4'].map((id) => n(id, [], id === flag));

  test('a divider within the right side is drawn there', () => {
    const layout = layoutTree({ root: n('r', branches('c2')) }, options('circle-clockwise'));
    const c1 = rect(layout.nodes, 'c1');
    const c2 = rect(layout.nodes, 'c2');
    expect(c2.y - (c1.y + c1.height)).toBe(10 + DIVIDER_GAP);
    expect(layout.dividers).toHaveLength(1);
    expect(layout.dividers[0]?.from.x).toBe(c1.x);
  });

  test('a divider within the left side is drawn between its two neighbors', () => {
    const layout = layoutTree({ root: n('r', branches('c4')) }, options('circle-clockwise'));
    const c3 = rect(layout.nodes, 'c3');
    const c4 = rect(layout.nodes, 'c4');
    // left side goes bottom to top: c4 is above c3
    expect(c3.y - (c4.y + c4.height)).toBe(10 + DIVIDER_GAP);
    expect(layout.dividers).toHaveLength(1);
    const [divider] = layout.dividers;
    expect(divider?.from.y).toBe(c4.y + c4.height + (10 + DIVIDER_GAP) / 2);
    expect(Math.max(divider?.from.x ?? 0, divider?.to.x ?? 0)).toBeCloseTo(c3.x + c3.width);
  });

  test('below the first level on the left side, source order is kept', () => {
    const root = n('r', [n('c1'), n('c2'), n('c3', [n('x'), n('y', [], true)]), n('c4')]);
    const layout = layoutTree({ root }, options('circle-clockwise'));
    const x = rect(layout.nodes, 'x');
    const y = rect(layout.nodes, 'y');
    // deeper levels stack top to bottom: x above y, the line between them
    expect(y.y - (x.y + x.height)).toBe(10 + DIVIDER_GAP);
    expect(layout.dividers).toHaveLength(1);
    expect(layout.dividers[0]?.from.y).toBe(x.y + x.height + (10 + DIVIDER_GAP) / 2);
  });

  test('a divider exactly at the split between right and left is not drawn', () => {
    const layout = layoutTree({ root: n('r', branches('c3')) }, options('circle-clockwise'));
    expect(layout.dividers).toEqual([]);
    const c3 = rect(layout.nodes, 'c3');
    const c4 = rect(layout.nodes, 'c4');
    expect(c3.y - (c4.y + c4.height)).toBe(10);
  });
});
