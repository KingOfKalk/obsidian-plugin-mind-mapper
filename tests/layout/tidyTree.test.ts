import { layoutTree } from '../../src/layout/tidyTree';
import type { LayoutOptions, PositionedNode, Rect, Size } from '../../src/layout/types';
import type { MindMapNode, MindMapTree } from '../../src/parser/types';

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

const fixed: LayoutOptions = {
  siblingGap: 10,
  levelGap: 50,
  nodeSize: () => ({ width: 100, height: 20 }),
};

function byId(nodes: PositionedNode[]): Record<string, { x: number; y: number }> {
  return Object.fromEntries(nodes.map((p) => [p.node.id, { x: p.x, y: p.y }]));
}

test('root alone', () => {
  const layout = layoutTree({ root: n('r') }, fixed);
  expect(byId(layout.nodes)).toEqual({ r: { x: 0, y: -10 } });
  expect(layout.bounds).toEqual({ x: 0, y: -10, width: 100, height: 20 });
  expect(layout.edges).toEqual([]);
});

test('three leaf children are stacked and centered on the root', () => {
  const layout = layoutTree({ root: n('r', n('a'), n('b'), n('c')) }, fixed);
  expect(byId(layout.nodes)).toEqual({
    r: { x: 0, y: -10 },
    a: { x: 150, y: -40 },
    b: { x: 150, y: -10 },
    c: { x: 150, y: 20 },
  });
});

test('subtree boxes: parent centered on its children', () => {
  const layout = layoutTree({ root: n('r', n('A', n('A1'), n('A2')), n('B')) }, fixed);
  expect(byId(layout.nodes)).toMatchObject({
    A1: { x: 300, y: -40 },
    A2: { x: 300, y: -10 },
    A: { x: 150, y: -25 },
    B: { x: 150, y: 20 },
  });
});

test('nodes are in depth-first pre-order', () => {
  const layout = layoutTree({ root: n('r', n('A', n('A1')), n('B')) }, fixed);
  expect(layout.nodes.map((p) => p.node.id)).toEqual(['r', 'A', 'A1', 'B']);
});

test('edges run from parent right-center to child left-center', () => {
  const layout = layoutTree({ root: n('r', n('a'), n('b'), n('c')) }, fixed);
  expect(layout.edges[0]).toEqual({
    fromId: 'r',
    toId: 'a',
    source: { x: 100, y: 0 },
    target: { x: 150, y: -30 },
    axis: 'x',
  });
  expect(layout.edges).toHaveLength(3);
});

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomTree(random: () => number): { tree: MindMapTree; sizes: Map<string, Size> } {
  const sizes = new Map<string, Size>();
  let count = 0;
  const make = (depth: number): MindMapNode => {
    const id = `n${count++}`;
    sizes.set(id, { width: 40 + random() * 260, height: 20 + random() * 100 });
    const children: MindMapNode[] = [];
    const childCount = depth < 6 ? Math.floor(random() * 4) : 0;
    for (let i = 0; i < childCount && count < 60; i++) children.push(make(depth + 1));
    return n(id, ...children);
  };
  return { tree: { root: make(0) }, sizes };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('no two nodes overlap and children are right of their parent (random trees)', () => {
  const random = rng(42);
  for (let i = 0; i < 50; i++) {
    const { tree, sizes } = randomTree(random);
    const layout = layoutTree(tree, {
      siblingGap: 10,
      levelGap: 50,
      nodeSize: (node) => sizes.get(node.id) ?? { width: 0, height: 0 },
    });
    const nodes = layout.nodes;
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const [na, nb] = [nodes[a], nodes[b]];
        if (na && nb) expect(intersects(na, nb), `${na.node.id} vs ${nb.node.id}`).toBe(false);
      }
    }
    const pos = new Map(nodes.map((p) => [p.node.id, p]));
    for (const edge of layout.edges) {
      const [from, to] = [pos.get(edge.fromId), pos.get(edge.toId)];
      expect(to && from && to.x >= from.x + from.width).toBe(true);
    }
  }
});

test('bounds enclose all nodes', () => {
  const layout = layoutTree({ root: n('r', n('A', n('A1'), n('A2')), n('B')) }, fixed);
  const { bounds } = layout;
  for (const p of layout.nodes) {
    expect(p.x).toBeGreaterThanOrEqual(bounds.x);
    expect(p.y).toBeGreaterThanOrEqual(bounds.y);
    expect(p.x + p.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(p.y + p.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  }
  expect(bounds).toEqual({ x: 0, y: -40, width: 400, height: 80 });
});
