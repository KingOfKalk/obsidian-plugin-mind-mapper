import type { MapLayout } from '../../src/layout/types';
import type { MindMapNode } from '../../src/parser/types';
import { DomMapRenderer } from '../../src/render/DomMapRenderer';

function node(id: string, kind: MindMapNode['kind'] = 'heading', label = id): MindMapNode {
  return { id, kind, label, level: 1, line: 0, children: [] };
}

const layout: MapLayout = {
  nodes: [
    { node: node('R', 'root'), x: 0, y: -18, width: 200, height: 36 },
    { node: node('R/A'), x: 260, y: -42, width: 200, height: 36 },
    { node: node('R/B'), x: 260, y: 6, width: 200, height: 36 },
  ],
  edges: [
    { fromId: 'R', toId: 'R/A', source: { x: 200, y: 0 }, target: { x: 260, y: -24 } },
    { fromId: 'R', toId: 'R/B', source: { x: 200, y: 0 }, target: { x: 260, y: 24 } },
  ],
  bounds: { x: 0, y: -42, width: 460, height: 84 },
};

function setup(): { parent: HTMLElement; renderer: DomMapRenderer } {
  const parent = document.createElement('div');
  return { parent, renderer: new DomMapRenderer(parent) };
}

test('renders one node div per node and one path per edge', () => {
  const { parent, renderer } = setup();
  renderer.setLayout(layout);
  const nodes = [...parent.querySelectorAll<HTMLElement>('.mind-mapper-node')];
  expect(nodes.map((n) => n.dataset.nodeId)).toEqual(['R', 'R/A', 'R/B']);
  expect(nodes[1]?.style.left).toBe('260px');
  expect(nodes[1]?.style.top).toBe('-42px');
  expect(nodes[1]?.style.width).toBe('200px');
  expect(nodes[1]?.style.height).toBe('36px');
  expect(nodes[0]?.classList.contains('is-root')).toBe(true);
  expect(nodes[1]?.classList.contains('is-root')).toBe(false);
  expect(nodes[1]?.querySelector('.mind-mapper-node-label')?.textContent).toBe('R/A');
  const paths = [...parent.querySelectorAll('svg.mind-mapper-edges path.mind-mapper-edge')];
  expect(paths.map((p) => p.getAttribute('d'))).toEqual([
    'M 200 0 C 230 0, 230 -24, 260 -24',
    'M 200 0 C 230 0, 230 24, 260 24',
  ]);
  expect(renderer.canvasEl.parentElement).toBe(parent);
});

test('setLayout replaces previous content', () => {
  const { parent, renderer } = setup();
  renderer.setLayout(layout);
  renderer.setLayout({ ...layout, nodes: layout.nodes.slice(0, 1), edges: [] });
  expect(parent.querySelectorAll('.mind-mapper-node')).toHaveLength(1);
  expect(parent.querySelectorAll('path.mind-mapper-edge')).toHaveLength(0);
});

test('setTransform writes the CSS transform on the world element', () => {
  const { parent, renderer } = setup();
  renderer.setTransform({ x: 10, y: 20, zoom: 0.5 });
  const world = parent.querySelector<HTMLElement>('.mind-mapper-world');
  expect(world?.style.transform).toBe('translate(10px, 20px) scale(0.5)');
});

test('long labels keep fixed size and expose the full text as title', () => {
  const { parent, renderer } = setup();
  const label = 'x'.repeat(300);
  renderer.setLayout({
    ...layout,
    nodes: [{ node: node('L', 'heading', label), x: 0, y: 0, width: 200, height: 36 }],
    edges: [],
  });
  const el = parent.querySelector<HTMLElement>('.mind-mapper-node');
  expect(el?.style.width).toBe('200px');
  expect(el?.title).toBe(label);
});
