import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { estimateSize } from '../../src/layout/nodeSize';
import { layoutTree } from '../../src/layout/tidyTree';
import { visibleTree } from '../../src/layout/visibleTree';
import {
  LAYOUT_NAMES,
  type LayoutOptions,
  type MapLayout,
  type MapLayoutName,
  type PositionedNode,
  type Rect,
} from '../../src/layout/types';
import { toParserInput } from '../../src/parser/adapter';
import { buildTree } from '../../src/parser/buildTree';
import type { MindMapNode } from '../../src/parser/types';
import { CollapseState } from '../../src/view/collapseState';
import { loadFixture } from '../fixtures';

function n(id: string, ...children: MindMapNode[]): MindMapNode {
  return {
    id,
    kind: 'heading',
    label: id,
    markdown: id,
    sectionType: null,
    level: 1,
    line: 0,
    children,
  };
}

const options = (layout: MapLayoutName): LayoutOptions => ({
  siblingGap: 10,
  levelGap: 50,
  nodeSize: () => ({ width: 100, height: 20 }),
  layout,
});

function center(p: Rect): { x: number; y: number } {
  return { x: p.x + p.width / 2, y: p.y + p.height / 2 };
}

/** Position of each first-level child relative to the root: side (r/l) and vertical sign. */
function clock(layout: MapLayout, count: number): string[] {
  const byId = new Map(layout.nodes.map((p) => [p.node.id, p]));
  const root = byId.get('r');
  if (!root) throw new Error('no root');
  const c = center(root);
  return Array.from({ length: count }, (_, i) => {
    const p = byId.get(`c${i + 1}`);
    if (!p) throw new Error(`no c${i + 1}`);
    const d = center(p);
    const side = d.x > c.x ? 'r' : 'l';
    const v = Math.abs(d.y - c.y) < 0.001 ? '0' : d.y < c.y ? 'up' : 'down';
    return `${side} ${v}`;
  });
}

function star(count: number): MindMapNode {
  return n('r', ...Array.from({ length: count }, (_, i) => n(`c${i + 1}`)));
}

test.each([
  [1, ['r 0']],
  [2, ['r 0', 'l 0']],
  [3, ['r up', 'r down', 'l 0']],
  [4, ['r up', 'r down', 'l down', 'l up']],
  [6, ['r up', 'r 0', 'r down', 'l down', 'l 0', 'l up']],
])('circle-clockwise clock positions with %i branches', (count, expected) => {
  expect(clock(layoutTree({ root: star(count) }, options('circle-clockwise')), count)).toEqual(
    expected,
  );
});

test('circle-counter-clockwise mirrors clockwise horizontally', () => {
  const cw = clock(layoutTree({ root: star(6) }, options('circle-clockwise')), 6);
  const ccw = clock(layoutTree({ root: star(6) }, options('circle-counter-clockwise')), 6);
  expect(ccw).toEqual(cw.map((s) => (s.startsWith('r') ? `l${s.slice(1)}` : `r${s.slice(1)}`)));
});

test('a single branch in circle-counter-clockwise sits at 9 o clock', () => {
  expect(clock(layoutTree({ root: star(1) }, options('circle-counter-clockwise')), 1)).toEqual([
    'l 0',
  ]);
});

test.each(['circle-clockwise', 'circle-counter-clockwise'] as const)(
  '%s with zero children is the root alone',
  (layout) => {
    const result = layoutTree({ root: n('r') }, options(layout));
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    expect(result.bounds).toEqual({ x: 0, y: -10, width: 100, height: 20 });
  },
);

const DIRECTION: Record<string, { axis: 'x' | 'y'; sign: (dx: number, dy: number) => boolean }> = {
  'left-to-right': { axis: 'x', sign: (dx) => dx > 0 },
  'right-to-left': { axis: 'x', sign: (dx) => dx < 0 },
  'top-to-bottom': { axis: 'y', sign: (_dx, dy) => dy > 0 },
  'bottom-to-top': { axis: 'y', sign: (_dx, dy) => dy < 0 },
};

test.each(Object.keys(DIRECTION))('%s grows every subtree in its direction', (name) => {
  const tree = { root: n('r', n('a', n('a1'), n('a2')), n('b', n('b1')), n('c')) };
  const layout = layoutTree(tree, {
    ...options(name as MapLayoutName),
    nodeSize: (node) => ({ width: 60 + node.id.length * 20, height: 20 + node.id.length * 5 }),
  });
  const byId = new Map(layout.nodes.map((p) => [p.node.id, p]));
  const dir = DIRECTION[name];
  if (!dir) throw new Error(name);
  expect(layout.edges).toHaveLength(6);
  for (const edge of layout.edges) {
    const [from, to] = [byId.get(edge.fromId), byId.get(edge.toId)];
    if (!from || !to) throw new Error('missing');
    const [cf, ct] = [center(from), center(to)];
    expect(dir.sign(ct.x - cf.x, ct.y - cf.y), `${edge.fromId} -> ${edge.toId}`).toBe(true);
    expect(edge.axis).toBe(dir.axis);
  }
});

test.each(Object.keys(DIRECTION))('%s edges start and end on the facing node edges', (name) => {
  const layout = layoutTree({ root: n('r', n('a'), n('b')) }, options(name as MapLayoutName));
  const byId = new Map(layout.nodes.map((p) => [p.node.id, p]));
  for (const edge of layout.edges) {
    const [from, to] = [byId.get(edge.fromId), byId.get(edge.toId)];
    if (!from || !to) throw new Error('missing');
    const onEdge = (p: PositionedNode, pt: { x: number; y: number }) =>
      (pt.x === p.x || pt.x === p.x + p.width) && pt.y === p.y + p.height / 2
        ? 'x'
        : (pt.y === p.y || pt.y === p.y + p.height) && pt.x === p.x + p.width / 2
          ? 'y'
          : 'none';
    expect(onEdge(from, edge.source)).toBe(edge.axis);
    expect(onEdge(to, edge.target)).toBe(edge.axis);
  }
});

test('childSide per layout', () => {
  const sides = (layout: MapLayoutName) =>
    Object.fromEntries(
      layoutTree({ root: star(2) }, options(layout)).nodes.map((p) => [p.node.id, p.childSide]),
    );
  expect(sides('left-to-right')).toEqual({ r: 'right', c1: 'right', c2: 'right' });
  expect(sides('right-to-left')).toEqual({ r: 'left', c1: 'left', c2: 'left' });
  expect(sides('top-to-bottom')).toEqual({ r: 'bottom', c1: 'bottom', c2: 'bottom' });
  expect(sides('bottom-to-top')).toEqual({ r: 'top', c1: 'top', c2: 'top' });
  expect(sides('circle-clockwise')).toEqual({ r: 'right', c1: 'right', c2: 'left' });
  expect(sides('circle-counter-clockwise')).toEqual({ r: 'right', c1: 'left', c2: 'right' });
});

test.each(LAYOUT_NAMES)('%s: depth is the tree depth, the root 0', (layout) => {
  const tree = n('r', n('a', n('a1', n('a1x'))), n('b'), n('c', n('c1')));
  const depths = Object.fromEntries(
    layoutTree({ root: tree }, options(layout)).nodes.map((p) => [p.node.id, p.depth]),
  );
  expect(depths).toEqual({ r: 0, a: 1, a1: 2, a1x: 3, b: 1, c: 1, c1: 2 });
});

test.each(LAYOUT_NAMES)(
  '%s: branch is the source index of the first-level ancestor, the root -1',
  (layout) => {
    const tree = n('r', n('a', n('a1', n('a1x'))), n('b'), n('c', n('c1')), n('d', n('d1')));
    const branches = Object.fromEntries(
      layoutTree({ root: tree }, options(layout)).nodes.map((p) => [p.node.id, p.branch]),
    );
    // circle layouts: by source order, not by side (c and d sit on the left)
    expect(branches).toEqual({ r: -1, a: 0, a1: 0, a1x: 0, b: 1, c: 2, c1: 2, d: 3, d1: 3 });
  },
);

test('a collapsed first-level node keeps the branch indexes of the others', () => {
  const tree = n('r', n('a', n('a1')), n('b', n('b1')), n('c'));
  const collapsed = new CollapseState();
  collapsed.toggle('a');
  const { tree: shown } = visibleTree({ root: tree }, collapsed);
  const branches = Object.fromEntries(
    layoutTree(shown, options('circle-clockwise')).nodes.map((p) => [p.node.id, p.branch]),
  );
  expect(branches).toEqual({ r: -1, a: 0, b: 1, b1: 1, c: 2 });
});

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function expectNoOverlap(layout: MapLayout, label: string): void {
  const nodes = layout.nodes;
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const [na, nb] = [nodes[a], nodes[b]];
      if (na && nb && intersects(na, nb)) {
        throw new Error(`${label}: ${na.node.id} overlaps ${nb.node.id}`);
      }
    }
  }
}

const fixtureNames = readdirSync(join(process.cwd(), 'tests', 'vault', 'fixtures'))
  .filter((file) => file.endsWith('.cache.json'))
  .map((file) => file.replace(/\.cache\.json$/, ''));

test.each(LAYOUT_NAMES)('no overlaps in %s for all recorded fixtures', (layout) => {
  expect(fixtureNames.length).toBeGreaterThan(10);
  for (const name of fixtureNames) {
    const { text, cache } = loadFixture(name);
    const tree = buildTree(toParserInput(cache, text), name);
    const result = layoutTree(tree, {
      siblingGap: 12,
      levelGap: 60,
      nodeSize: estimateSize,
      layout,
    });
    expectNoOverlap(result, `${layout} ${name}`);
    expect(result.nodes).toHaveLength(countNodes(tree.root));
  }
});

function countNodes(node: MindMapNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

test('bounds enclose all nodes in circle layouts', () => {
  const layout = layoutTree({ root: star(5) }, options('circle-clockwise'));
  const { bounds } = layout;
  const minX = Math.min(...layout.nodes.map((p) => p.x));
  const maxX = Math.max(...layout.nodes.map((p) => p.x + p.width));
  expect(bounds.x).toBe(minX);
  expect(bounds.x + bounds.width).toBe(maxX);
});
