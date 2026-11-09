import type { MapLayout, PositionedNode } from '../../src/layout/types';
import type { MindMapNode } from '../../src/parser/types';
import { DomMapRenderer, RENDER_BUDGET } from '../../src/render/DomMapRenderer';
import { useGerman } from '../helpers';

function node(id: string, kind: MindMapNode['kind'] = 'heading', label = id): MindMapNode {
  return { id, kind, label, markdown: label, sectionType: null, level: 1, line: 0, children: [] };
}

const layout: MapLayout = {
  nodes: [
    {
      node: node('R', 'root'),
      x: 0,
      y: -18,
      width: 200,
      height: 36,
      childSide: 'right',
      align: 'left',
      depth: 0,
      branch: -1,
    },
    {
      node: node('R/A'),
      x: 260,
      y: -42,
      width: 200,
      height: 36,
      childSide: 'right',
      align: 'left',
      depth: 1,
      branch: 0,
    },
    {
      node: node('R/B'),
      x: 260,
      y: 6,
      width: 200,
      height: 36,
      childSide: 'right',
      align: 'left',
      depth: 1,
      branch: 1,
    },
  ],
  edges: [
    { fromId: 'R', toId: 'R/A', source: { x: 200, y: 0 }, target: { x: 260, y: -24 }, axis: 'x' },
    { fromId: 'R', toId: 'R/B', source: { x: 200, y: 0 }, target: { x: 260, y: 24 }, axis: 'x' },
  ],
  dividers: [],
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
  expect(nodes[1]?.querySelector('.mind-mapper-node-content')?.textContent).toBe('R/A');
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

test('long labels keep fixed size; node elements have no title tooltip', () => {
  const { parent, renderer } = setup();
  const label = 'x'.repeat(300);
  renderer.setLayout({
    ...layout,
    nodes: [
      {
        node: node('L', 'heading', label),
        x: 0,
        y: 0,
        width: 200,
        height: 36,
        childSide: 'right',
        align: 'left',
        depth: 1,
        branch: 0,
      },
    ],
    edges: [],
  });
  const el = parent.querySelector<HTMLElement>('.mind-mapper-node');
  expect(el?.style.width).toBe('200px');
  // a native tooltip would compete with page preview
  expect(el?.hasAttribute('title')).toBe(false);
});

function hooked() {
  const parent = document.createElement('div');
  const hooks = {
    render: vi.fn((n: MindMapNode, el: HTMLElement) => {
      el.setText(n.markdown);
    }),
    release: vi.fn(),
    expand: vi.fn(),
    select: vi.fn(),
    open: vi.fn(),
    toggle: vi.fn(),
  };
  return { parent, hooks, renderer: new DomMapRenderer(parent, hooks) };
}

function withMarkdown(id: string, markdown: string): MapLayout {
  return {
    ...layout,
    nodes: [
      {
        node: { ...node(id), markdown },
        x: 0,
        y: 0,
        width: 200,
        height: 36,
        childSide: 'right',
        align: 'left',
        depth: 1,
        branch: 0,
      },
    ],
    edges: [],
  };
}

test('content is rendered through the hooks once per node', () => {
  const { renderer, hooks } = hooked();
  renderer.setLayout(layout);
  expect(hooks.render).toHaveBeenCalledTimes(3);
});

test('same markdown keeps the element and does not re-render; position updates', () => {
  const { parent, renderer, hooks } = hooked();
  renderer.setLayout(withMarkdown('A', 'x'));
  const el = parent.querySelector('.mind-mapper-node');
  renderer.setLayout({
    ...withMarkdown('A', 'x'),
    nodes: [
      {
        node: { ...node('A'), markdown: 'x' },
        x: 50,
        y: 60,
        width: 120,
        height: 40,
        childSide: 'right',
        align: 'left',
        depth: 1,
        branch: 0,
      },
    ],
  });
  const again = parent.querySelector<HTMLElement>('.mind-mapper-node');
  expect(again).toBe(el);
  expect(again?.style.left).toBe('50px');
  expect(again?.style.width).toBe('120px');
  expect(hooks.render).toHaveBeenCalledTimes(1);
});

test('changed markdown renders into a fresh content element and releases the old one', () => {
  const { parent, renderer, hooks } = hooked();
  renderer.setLayout(withMarkdown('A', 'x'));
  const oldContent = parent.querySelector('.mind-mapper-node-content');
  renderer.setLayout(withMarkdown('A', 'y'));
  const newContent = parent.querySelector('.mind-mapper-node-content');
  expect(newContent).not.toBe(oldContent);
  expect(hooks.release).toHaveBeenCalledWith(oldContent);
  expect(newContent?.textContent).toBe('y');
  expect(parent.querySelectorAll('.mind-mapper-node-content')).toHaveLength(1);
});

test('removed nodes are released and removed', () => {
  const { parent, renderer, hooks } = hooked();
  renderer.setLayout(layout);
  renderer.setLayout(withMarkdown('R', 'R'));
  expect(hooks.release).toHaveBeenCalledTimes(2); // R/A and R/B; R keeps its markdown
  expect(parent.querySelectorAll('.mind-mapper-node')).toHaveLength(1);
});

test('content elements are exposed by node id', () => {
  const { renderer } = hooked();
  renderer.setLayout(layout);
  expect([...renderer.contentElements().keys()]).toEqual(['R', 'R/A', 'R/B']);
});

test('clipped nodes show the expand button, which expands without bubbling', () => {
  const { parent, renderer, hooks } = hooked();
  renderer.setLayout(withMarkdown('A', 'x'));
  const nodeEl = parent.querySelector<HTMLElement>('.mind-mapper-node');
  const bubbled = vi.fn();
  parent.addEventListener('click', bubbled);
  renderer.setClipped('A', { x: false, y: true });
  expect(nodeEl?.classList.contains('is-clipped')).toBe(true);
  const button = parent.querySelector<HTMLElement>('.mind-mapper-node-expand');
  expect(button?.getAttribute('aria-label')).toBe('Show full content');
  button?.click();
  expect(hooks.expand).toHaveBeenCalledWith(expect.objectContaining({ id: 'A' }));
  expect(bubbled).not.toHaveBeenCalled();
  renderer.setClipped('A', { x: false, y: false });
  expect(nodeEl?.classList.contains('is-clipped')).toBe(false);
});

test('node content uses Obsidian reading view styles (markdown-rendered)', () => {
  const { parent, renderer } = hooked();
  renderer.setLayout(withMarkdown('A', 'x'));
  const content = parent.querySelector('.mind-mapper-node-content');
  expect(content?.classList.contains('markdown-rendered')).toBe(true);
});

test('clip direction classes follow the overflowing axes', () => {
  const { parent, renderer } = hooked();
  renderer.setLayout(withMarkdown('A', 'x'));
  const nodeEl = parent.querySelector('.mind-mapper-node');
  renderer.setClipped('A', { x: false, y: true });
  expect([...(nodeEl?.classList ?? [])].filter((c) => c.startsWith('is-clipped'))).toEqual([
    'is-clipped',
    'is-clipped-y',
  ]);
  renderer.setClipped('A', { x: true, y: true });
  expect(nodeEl?.classList.contains('is-clipped-x')).toBe(true);
  renderer.setClipped('A', { x: false, y: false });
  expect([...(nodeEl?.classList ?? [])].some((c) => c.startsWith('is-clipped'))).toBe(false);
});

const withChildren = (id: string) => id === 'R' || id === 'R/A';

test('toggle sits outside the node at its right edge and shows the hidden count when collapsed', () => {
  const { parent, renderer } = hooked();
  renderer.setLayout(layout, { hidden: new Map(), hasChildren: withChildren });
  const toggles = [...parent.querySelectorAll<HTMLElement>('.mind-mapper-collapse')];
  expect(toggles).toHaveLength(1);
  const [toggle] = toggles;
  expect(toggle?.parentElement?.classList.contains('mind-mapper-world')).toBe(true);
  expect(toggle?.dataset.nodeId).toBe('R/A');
  expect(toggle?.style.left).toBe('460px');
  expect(toggle?.style.top).toBe('-24px');
  expect(toggle?.classList.contains('is-side-right')).toBe(true);
  expect(toggle?.textContent).toBe('−');
  expect(toggle?.getAttribute('aria-label')).toBe('Collapse');
  expect(toggle?.classList.contains('is-collapsed')).toBe(false);

  const collapsed: MapLayout = { ...layout, nodes: layout.nodes.slice(0, 2), edges: [] };
  renderer.setLayout(collapsed, { hidden: new Map([['R/A', 5]]), hasChildren: withChildren });
  const again = parent.querySelector<HTMLElement>('.mind-mapper-collapse');
  expect(again?.textContent).toBe('5');
  expect(again?.getAttribute('aria-label')).toBe('Expand');
  expect(again?.classList.contains('is-collapsed')).toBe(true);
  expect(parent.querySelectorAll('.mind-mapper-collapse')).toHaveLength(1);
});

test('toggles of removed nodes are removed', () => {
  const { parent, renderer } = hooked();
  renderer.setLayout(layout, { hidden: new Map(), hasChildren: withChildren });
  renderer.setLayout(withMarkdown('X', 'x'), { hidden: new Map(), hasChildren: () => false });
  expect(parent.querySelectorAll('.mind-mapper-collapse')).toHaveLength(0);
});

test('clicking a toggle calls toggle(id) and not select', () => {
  const { parent, renderer, hooks } = hooked();
  renderer.setLayout(layout, { hidden: new Map(), hasChildren: withChildren });
  const bubbled = vi.fn();
  parent.addEventListener('click', bubbled);
  parent.querySelector<HTMLElement>('.mind-mapper-collapse')?.click();
  expect(hooks.toggle).toHaveBeenCalledWith('R/A');
  expect(hooks.select).not.toHaveBeenCalled();
  expect(bubbled).not.toHaveBeenCalled();
});

test('click on a node calls select; dblclick calls open with the current node', () => {
  const { parent, renderer, hooks } = hooked();
  renderer.setLayout(layout);
  const content = parent.querySelector<HTMLElement>(
    '[data-node-id="R/A"] .mind-mapper-node-content',
  );
  content?.click();
  expect(hooks.select).toHaveBeenCalledWith('R/A');
  renderer.setLayout({
    ...layout,
    nodes: layout.nodes.map((p) =>
      p.node.id === 'R/A' ? { ...p, node: { ...p.node, line: 7 } } : p,
    ),
  });
  content?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(hooks.open).toHaveBeenCalledWith(expect.objectContaining({ id: 'R/A', line: 7 }));
});

test('dblclick on a link or the expand button inside a node does not call open', () => {
  const { parent, renderer, hooks } = hooked();
  renderer.setLayout(layout);
  const content = parent.querySelector<HTMLElement>(
    '[data-node-id="R/A"] .mind-mapper-node-content',
  );
  const link = content?.createEl('a', { cls: 'internal-link', text: 'link' });
  link?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  link?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  parent
    .querySelector('[data-node-id="R/A"] .mind-mapper-node-expand')
    ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(hooks.open).not.toHaveBeenCalled();
  expect(hooks.select).not.toHaveBeenCalled();
});

test('setSelected moves is-selected', () => {
  const { parent, renderer } = hooked();
  renderer.setLayout(layout);
  const selected = () =>
    [...parent.querySelectorAll<HTMLElement>('.mind-mapper-node.is-selected')].map(
      (el) => el.dataset.nodeId,
    );
  renderer.setSelected('R/A');
  expect(selected()).toEqual(['R/A']);
  renderer.setSelected('R/B');
  expect(selected()).toEqual(['R/B']);
  renderer.setSelected(null);
  expect(selected()).toEqual([]);
});

test('selection survives setLayout for nodes that are re-created', () => {
  const { parent, renderer } = hooked();
  renderer.setLayout(withMarkdown('A', 'x'));
  renderer.setSelected('B');
  renderer.setLayout(withMarkdown('B', 'y'));
  expect(parent.querySelector('[data-node-id="B"]')?.classList.contains('is-selected')).toBe(true);
});

test('a node whose id shifts keeps its rendered content element (render hook called once)', () => {
  const { parent, renderer, hooks } = hooked();
  const at = (id: string, markdown: string, y: number) => ({
    node: { ...node(id), markdown },
    x: 0,
    y,
    width: 200,
    height: 36,
    childSide: 'right' as const,
    align: 'left' as const,
    depth: 1,
    branch: 0,
  });
  renderer.setLayout({ ...layout, nodes: [at('A/#2', 'x', 0)], edges: [] });
  const original = parent.querySelector('[data-node-id="A/#2"] .mind-mapper-node-content');
  hooks.render.mockClear();
  renderer.setLayout({ ...layout, nodes: [at('A/#2', 'y', 0), at('A/#3', 'x', 50)], edges: [] });
  expect(hooks.render).toHaveBeenCalledTimes(1);
  expect(hooks.render).toHaveBeenCalledWith(
    expect.objectContaining({ markdown: 'y' }),
    expect.anything(),
  );
  expect(parent.querySelector('[data-node-id="A/#3"] .mind-mapper-node-content')).toBe(original);
  expect(hooks.release).not.toHaveBeenCalledWith(original);
  expect(parent.querySelectorAll('.mind-mapper-node-content')).toHaveLength(2);
});

test('pooled content that finds no new owner is released', () => {
  const { parent, renderer, hooks } = hooked();
  renderer.setLayout(withMarkdown('A', 'x'));
  const original = parent.querySelector('.mind-mapper-node-content');
  renderer.setLayout(withMarkdown('B', 'z'));
  expect(hooks.release).toHaveBeenCalledWith(original);
});

test.each([
  ['right', 'is-side-right', '460px', '-24px'],
  ['left', 'is-side-left', '260px', '-24px'],
  ['bottom', 'is-side-bottom', '360px', '-6px'],
  ['top', 'is-side-top', '360px', '-42px'],
] as const)('toggle on the %s side sits at the middle of that edge', (side, cls, left, top) => {
  const { parent, renderer } = hooked();
  renderer.setLayout(
    { ...layout, nodes: layout.nodes.map((p) => ({ ...p, childSide: side })) },
    { hidden: new Map(), hasChildren: withChildren },
  );
  // the root never gets a toggle (circle roots grow on both sides)
  expect(parent.querySelector('.mind-mapper-collapse[data-node-id="R"]')).toBeNull();
  const toggle = parent.querySelector<HTMLElement>('.mind-mapper-collapse[data-node-id="R/A"]');
  expect(toggle?.classList.contains(cls)).toBe(true);
  expect(toggle?.className.match(/is-side-/g)).toHaveLength(1);
  expect(toggle?.style.left).toBe(left);
  expect(toggle?.style.top).toBe(top);
});

test('setCrossLinks draws one dashed path per link from layout rects; unknown nodes are skipped', () => {
  const { parent, renderer } = setup();
  renderer.setLayout(layout);
  renderer.setCrossLinks([
    { fromId: 'R/A', toId: 'R/B' },
    { fromId: 'R/A', toId: 'Gone' },
  ]);
  const paths = [...parent.querySelectorAll('svg.mind-mapper-edges path.mind-mapper-crosslink')];
  expect(paths).toHaveLength(1);
  // R/A (260,-42,200x36) above R/B (260,6,200x36): vertical, bottom of A to top of B
  expect(paths[0]?.getAttribute('d')).toBe('M 360 -6 C 360 34, 360 -34, 360 6');
  renderer.setCrossLinks([]);
  expect(parent.querySelectorAll('path.mind-mapper-crosslink')).toHaveLength(0);
});

describe('culling', () => {
  /** 20 x 20 grid of 100 x 20 nodes, 200 px apart; root at (0,0). */
  function grid(): MapLayout {
    const nodes: MapLayout['nodes'] = [];
    for (let i = 0; i < 400; i++) {
      const kind = i === 0 ? 'root' : 'heading';
      nodes.push({
        node: { ...node(`n${i}`, kind), markdown: `m${i}` },
        x: (i % 20) * 200,
        y: Math.floor(i / 20) * 200,
        width: 100,
        height: 20,
        childSide: 'right',
        align: 'left',
        depth: i === 0 ? 0 : 1,
        branch: i === 0 ? -1 : i - 1,
      });
    }
    const edges = nodes.slice(1).map((p) => ({
      fromId: 'n0',
      toId: p.node.id,
      source: { x: 100, y: 10 },
      target: { x: p.x, y: p.y + 10 },
      axis: 'x' as const,
    }));
    return { nodes, edges, dividers: [], bounds: { x: 0, y: 0, width: 3900, height: 3820 } };
  }

  function culled() {
    const parent = document.createElement('div');
    const hooks = {
      render: vi.fn((n: MindMapNode, el: HTMLElement) => el.setText(n.markdown)),
      release: vi.fn(),
      expand: vi.fn(),
    };
    const renderer = new DomMapRenderer(parent, hooks, { culling: true });
    Object.defineProperty(renderer.canvasEl, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(renderer.canvasEl, 'clientHeight', { configurable: true, value: 400 });
    return { parent, hooks, renderer };
  }

  const ids = (parent: HTMLElement) =>
    [...parent.querySelectorAll<HTMLElement>('.mind-mapper-node')].map((el) => el.dataset.nodeId);

  test('only nodes in the viewport plus margin have DOM; panning renders new ones and releases left ones', () => {
    const { parent, hooks, renderer } = culled();
    renderer.setTransform({ x: 0, y: 0, zoom: 1 });
    renderer.setLayout(grid());
    // viewport 0..400 plus 200 margin each side: columns/rows 0..2 (x 0, 200, 400 < 600)
    expect(renderer.renderedCount()).toBe(9);
    expect(ids(parent)).toContain('n0');
    renderer.setTransform({ x: -2000, y: -2000, zoom: 1 });
    renderer.updateVisible();
    expect(ids(parent)).not.toContain('n0');
    expect(ids(parent)).toContain('n210'); // (2000, 2000)
    expect(renderer.renderedCount()).toBeLessThanOrEqual(16);
    const released = hooks.release.mock.calls.length;
    expect(released).toBeGreaterThanOrEqual(9);
  });

  test('edges and cross-links stay complete when nodes are culled', () => {
    const { parent, renderer } = culled();
    renderer.setLayout(grid());
    renderer.setCrossLinks([{ fromId: 'n1', toId: 'n399' }]);
    expect(parent.querySelectorAll('path.mind-mapper-edge')).toHaveLength(399);
    expect(parent.querySelectorAll('path.mind-mapper-crosslink')).toHaveLength(1);
  });

  test('below 0.2 zoom the map is a skeleton path; all node content released', () => {
    const { parent, hooks, renderer } = culled();
    renderer.setLayout(grid());
    expect(renderer.renderedCount()).toBe(9);
    renderer.setTransform({ x: 0, y: 0, zoom: 0.1 });
    renderer.updateVisible();
    expect(renderer.renderedCount()).toBe(0);
    expect(hooks.release).toHaveBeenCalledTimes(9);
    const skeleton = parent.querySelector('path.mind-mapper-skeleton');
    expect(skeleton?.getAttribute('d')?.match(/M /g)).toHaveLength(400);
    renderer.setTransform({ x: 0, y: 0, zoom: 1 });
    renderer.updateVisible();
    expect(parent.querySelector('path.mind-mapper-skeleton')).toBeNull();
    expect(renderer.renderedCount()).toBe(9);
  });

  test('a culled clipped and selected node gets its classes back when rendered again', () => {
    const { parent, renderer } = culled();
    renderer.setLayout(grid());
    renderer.setClipped('n1', { x: false, y: true });
    renderer.setSelected('n1');
    renderer.setTransform({ x: -2000, y: -2000, zoom: 1 });
    renderer.updateVisible();
    expect(parent.querySelector('[data-node-id="n1"]')).toBeNull();
    renderer.setTransform({ x: 0, y: 0, zoom: 1 });
    renderer.updateVisible();
    const el = parent.querySelector('.mind-mapper-node[data-node-id="n1"]');
    expect(el?.classList.contains('is-clipped-y')).toBe(true);
    expect(el?.classList.contains('is-selected')).toBe(true);
  });

  test('a never sized (0 x 0) canvas renders all nodes on the first layout and keeps the DOM afterwards', () => {
    const { renderer } = culled();
    Object.defineProperty(renderer.canvasEl, 'clientWidth', { configurable: true, value: 0 });
    renderer.setLayout(grid());
    expect(renderer.renderedCount()).toBe(400);
    Object.defineProperty(renderer.canvasEl, 'clientWidth', { configurable: true, value: 400 });
    renderer.updateVisible();
    expect(renderer.renderedCount()).toBe(9);
    Object.defineProperty(renderer.canvasEl, 'clientWidth', { configurable: true, value: 0 });
    renderer.setTransform({ x: -2000, y: -2000, zoom: 1 });
    renderer.updateVisible();
    expect(renderer.renderedCount()).toBe(9);
  });

  test('a small map below 0.2 zoom keeps its content (no skeleton)', () => {
    const { parent, renderer } = culled();
    renderer.setTransform({ x: 0, y: 0, zoom: 0.1 });
    renderer.setLayout({ ...grid(), nodes: grid().nodes.slice(0, 15), edges: [] });
    expect(renderer.renderedCount()).toBe(15);
    expect(parent.querySelector('path.mind-mapper-skeleton')).toBeNull();
  });

  test('new nodes render at most 40 per pass, nearest to the centre first; skeleton until done', () => {
    const { parent, renderer } = culled();
    Object.defineProperty(renderer.canvasEl, 'clientWidth', { configurable: true, value: 4000 });
    Object.defineProperty(renderer.canvasEl, 'clientHeight', { configurable: true, value: 4000 });
    const raf = vi.spyOn(renderer.canvasEl.win, 'requestAnimationFrame').mockReturnValue(1);
    // 250 nodes in view (under the 300 content cap)
    const layout250 = { ...grid(), nodes: grid().nodes.slice(0, 250), edges: [] };
    renderer.setLayout(layout250);
    expect(renderer.renderedCount()).toBe(RENDER_BUDGET);
    expect(RENDER_BUDGET).toBe(40);
    // the centre of the 4000 x 4000 view is (2000, 2000): node n210 renders first
    expect(ids(parent)).toContain('n210');
    expect(ids(parent)).not.toContain('n0');
    expect(parent.querySelector('path.mind-mapper-skeleton')).not.toBeNull();
    expect(raf).toHaveBeenCalled();
    for (let pass = 0; pass < 6; pass++) renderer.updateVisible();
    expect(renderer.renderedCount()).toBe(250);
    expect(parent.querySelector('path.mind-mapper-skeleton')).toBeNull();
    raf.mockRestore();
  });

  test('setTransform schedules one culling pass per animation frame', () => {
    const { renderer } = culled();
    const raf = vi.spyOn(renderer.canvasEl.win, 'requestAnimationFrame').mockReturnValue(1);
    renderer.setLayout(grid());
    renderer.setTransform({ x: -10, y: 0, zoom: 1 });
    renderer.setTransform({ x: -20, y: 0, zoom: 1 });
    expect(raf).toHaveBeenCalledTimes(1);
    raf.mockRestore();
  });
});

test('a new layout reuses the edge path elements', () => {
  const { parent, renderer } = setup();
  renderer.setLayout(layout);
  const before = [...parent.querySelectorAll('path.mind-mapper-edge')];
  renderer.setLayout({
    ...layout,
    edges: layout.edges.map((e) => ({ ...e, target: { x: e.target.x + 10, y: e.target.y } })),
  });
  const after = [...parent.querySelectorAll('path.mind-mapper-edge')];
  expect(after).toHaveLength(2);
  expect(after[0]).toBe(before[0]);
  expect(after[1]).toBe(before[1]);
  expect(after[0]?.getAttribute('d')).toBe('M 200 0 C 235 0, 235 -24, 270 -24');
  renderer.setLayout({ ...layout, edges: layout.edges.slice(0, 1) });
  expect(parent.querySelectorAll('path.mind-mapper-edge')).toHaveLength(1);
});

test('dividers are drawn as dashed lines below cross-links and replaced on each layout', () => {
  const { parent, renderer } = setup();
  renderer.setLayout({
    ...layout,
    dividers: [{ parentId: 'R', from: { x: 260, y: 0 }, to: { x: 460, y: 0 } }],
  });
  renderer.setCrossLinks([{ fromId: 'R/A', toId: 'R/B' }]);
  const svg = parent.querySelector('svg.mind-mapper-edges');
  const dividers = [...(svg?.querySelectorAll('path.mind-mapper-divider') ?? [])];
  expect(dividers.map((d) => d.getAttribute('d'))).toEqual(['M 260 0 L 460 0']);
  renderer.setLayout({
    ...layout,
    dividers: [{ parentId: 'R', from: { x: 260, y: 5 }, to: { x: 460, y: 5 } }],
  });
  const classes = [...(svg?.children ?? [])].map((el) => el.getAttribute('class'));
  expect(classes.filter((c) => c === 'mind-mapper-divider')).toHaveLength(1);
  expect(classes.indexOf('mind-mapper-divider')).toBeLessThan(
    classes.indexOf('mind-mapper-crosslink'),
  );
  expect(svg?.querySelector('path.mind-mapper-divider')?.getAttribute('d')).toBe('M 260 5 L 460 5');
  renderer.setLayout(layout);
  expect(svg?.querySelectorAll('path.mind-mapper-divider')).toHaveLength(0);
});

/** A chain root -> d1 -> d2 -> … of `depth` levels below the root, one edge into each node. */
function chain(depth: number): MapLayout {
  const nodes: MapLayout['nodes'] = Array.from({ length: depth + 1 }, (_, d) => ({
    node: node(`d${d}`, d === 0 ? 'root' : 'heading'),
    x: d * 260,
    y: 0,
    width: 200,
    height: 36,
    childSide: 'right',
    align: 'left',
    depth: d,
    branch: d === 0 ? -1 : 0,
  }));
  const edges = nodes.slice(1).map((p, i) => ({
    fromId: `d${i}`,
    toId: p.node.id,
    source: { x: i * 260 + 200, y: 18 },
    target: { x: p.x, y: 18 },
    axis: 'x' as const,
  }));
  return {
    nodes,
    edges,
    dividers: [],
    bounds: { x: 0, y: 0, width: depth * 260 + 200, height: 36 },
  };
}

function attrsOf(parent: HTMLElement, selector: string, name: string): (string | null)[] {
  return [...parent.querySelectorAll(selector)].map((el) => el.getAttribute(name));
}

function levelsOf(parent: HTMLElement, selector: string): (string | null)[] {
  return attrsOf(parent, selector, 'data-level');
}

/** A root with `count` first-level nodes `b0`, `b1`, … (branch i), each with one child `b<i>/c`. */
function star(count: number): MapLayout {
  const nodes: MapLayout['nodes'] = [chain(0).nodes[0]!];
  const edges: MapLayout['edges'] = [];
  for (let i = 0; i < count; i++) {
    for (const [id, depth, from] of [
      [`b${i}`, 1, 'd0'],
      [`b${i}/c`, 2, `b${i}`],
    ] as const) {
      nodes.push({
        node: node(id),
        x: depth * 260,
        y: i * 60,
        width: 200,
        height: 36,
        childSide: 'right',
        align: 'left',
        depth,
        branch: i,
      });
      edges.push({
        fromId: from,
        toId: id,
        source: { x: 0, y: 0 },
        target: { x: depth * 260, y: i * 60 },
        axis: 'x',
      });
    }
  }
  return { nodes, edges, dividers: [], bounds: { x: 0, y: 0, width: 720, height: count * 60 } };
}

test('nodes and the edges into them carry their emphasis level 1, 2 or 3 (deeper); the root none', () => {
  const { parent, renderer } = setup();
  renderer.setLayout(chain(5));
  expect(levelsOf(parent, '.mind-mapper-node')).toEqual([null, '1', '2', '3', '3', '3']);
  // edge i leads into node d(i+1)
  expect(levelsOf(parent, 'path.mind-mapper-edge')).toEqual(['1', '2', '3', '3', '3']);
});

test('nodes and the edges into them carry their branch colour, repeating after the palette; the root none', () => {
  const { parent, renderer } = setup();
  renderer.setTheme('rainbow');
  renderer.setLayout(star(9));
  const rainbow = ['1', '2', '3', '4', '5', '6', '7', '1', '2'];
  // node order: root, b0, b0/c, b1, b1/c, …; the child takes its branch's colour
  expect(attrsOf(parent, '.mind-mapper-node', 'data-branch')).toEqual([
    null,
    ...rainbow.flatMap((b) => [b, b]),
  ]);
  expect(attrsOf(parent, 'path.mind-mapper-edge', 'data-branch')).toEqual(
    rainbow.flatMap((b) => [b, b]),
  );
});

test.each([
  ['rainbow', ['1', '2', '3', '4', '5', '6', '7', '1', '2']],
  ['ocean', ['1', '2', '3', '4', '1', '2', '3', '4', '1']],
  ['forest', ['1', '2', '3', '4', '1', '2', '3', '4', '1']],
  ['accent', ['1', '1', '1', '1', '1', '1', '1', '1', '1']],
  ['none', ['1', '1', '1', '1', '1', '1', '1', '1', '1']],
] as const)(
  'setTheme(%s) re-colours the existing nodes and edges without a re-render',
  (theme, branches) => {
    const { parent, renderer } = setup();
    renderer.setTheme('rainbow');
    renderer.setLayout(star(9));
    const nodeEl = parent.querySelector('[data-node-id="b8"]');
    const edgeEl = parent.querySelector('path.mind-mapper-edge');
    renderer.setTheme(theme);
    expect(parent.querySelector('[data-node-id="b8"]')).toBe(nodeEl);
    expect(parent.querySelector('path.mind-mapper-edge')).toBe(edgeEl);
    const firstLevel = (selector: string) =>
      attrsOf(parent, selector, 'data-branch').filter((_, i) => i % 2 === 0);
    expect(
      firstLevel('.mind-mapper-node[data-level="1"], .mind-mapper-node[data-level="2"]'),
    ).toEqual(branches);
    expect(firstLevel('path.mind-mapper-edge')).toEqual(branches);
  },
);

test('level and branch follow a new layout on reused node elements and edge paths', () => {
  const { parent, renderer } = setup();
  renderer.setTheme('rainbow');
  renderer.setLayout(star(3));
  const nodeEl = parent.querySelector('[data-node-id="b0/c"]');
  const edgeEl = parent.querySelectorAll('path.mind-mapper-edge')[1];
  // a live edit moved b0/c one level deeper into the third branch (same id in this test)
  const moved = star(3);
  renderer.setLayout({
    ...moved,
    nodes: moved.nodes.map((p) => (p.node.id === 'b0/c' ? { ...p, depth: 3, branch: 2 } : p)),
  });
  expect(parent.querySelector('[data-node-id="b0/c"]')).toBe(nodeEl);
  expect(nodeEl?.getAttribute('data-level')).toBe('3');
  expect(nodeEl?.getAttribute('data-branch')).toBe('3');
  expect(parent.querySelectorAll('path.mind-mapper-edge')[1]).toBe(edgeEl);
  expect(edgeEl?.getAttribute('data-level')).toBe('3');
  expect(edgeEl?.getAttribute('data-branch')).toBe('3');
});

test("nodes created later by culling get their level and the current theme's branch colour", () => {
  const parent = document.createElement('div');
  const renderer = new DomMapRenderer(parent, undefined, { culling: true });
  const canvas = renderer.canvasEl;
  Object.defineProperty(canvas, 'clientWidth', { value: 400 });
  Object.defineProperty(canvas, 'clientHeight', { value: 100 });
  renderer.setTheme('ocean');
  renderer.setLayout(star(9));
  const b8 = () => parent.querySelector('[data-node-id="b8/c"]');
  expect(b8()).toBeNull();
  renderer.setTransform({ x: -2 * 260, y: -8 * 60, zoom: 1 });
  renderer.updateVisible();
  expect(b8()?.getAttribute('data-level')).toBe('2');
  expect(b8()?.getAttribute('data-branch')).toBe('1');
});

test('block nodes (code, tables, callouts, …) and image embeds are marked is-block, also after an edit', () => {
  const { parent, renderer } = setup();
  const nodes = (markdowns: [string, MindMapNode['kind'], string][]): MapLayout => ({
    ...star(0),
    nodes: [
      star(0).nodes[0]!,
      ...markdowns.map(([id, kind, markdown], i) => ({
        node: { ...node(id, kind), markdown, sectionType: kind === 'block' ? 'code' : null },
        x: 260,
        y: i * 60,
        width: 200,
        height: 36,
        childSide: 'right' as const,
        align: 'left' as const,
        depth: 3,
        branch: i,
      })),
    ],
  });
  renderer.setLayout(
    nodes([
      ['code', 'block', '```js\nx\n```'],
      ['image', 'paragraph', '![[photo.png]]'],
      ['text', 'paragraph', 'plain text with ![[photo.png]] inside'],
      ['item', 'list-item', 'an item'],
    ]),
  );
  const isBlock = (id: string) =>
    parent.querySelector(`[data-node-id="${id}"]`)?.classList.contains('is-block');
  expect(['code', 'image', 'text', 'item'].map(isBlock)).toEqual([true, true, false, false]);
  expect(isBlock('d0')).toBe(false);
  // the image paragraph becomes text, the item becomes an image
  renderer.setLayout(
    nodes([
      ['code', 'block', '```js\nx\n```'],
      ['image', 'paragraph', 'now text'],
      ['text', 'paragraph', 'plain text'],
      ['item', 'list-item', '![](photo.jpg)'],
    ]),
  );
  expect(['code', 'image', 'text', 'item'].map(isBlock)).toEqual([true, false, false, true]);
});

/** The `is-align-*` classes of the node with this ID. */
function alignOf(parent: HTMLElement, id: string): string[] {
  const el = parent.querySelector(`.mind-mapper-node[data-node-id="${id}"]`);
  return [...(el?.classList ?? [])].filter((c) => c.startsWith('is-align-'));
}

test('nodes carry the alignment of the layout (is-align-*), updated on reused elements', () => {
  const { parent, renderer } = setup();
  const aligned = (aligns: Record<string, PositionedNode['align']>): MapLayout => ({
    ...layout,
    nodes: layout.nodes.map((p) => ({ ...p, align: aligns[p.node.id] ?? 'left' })),
  });
  renderer.setLayout(aligned({ R: 'center', 'R/A': 'left', 'R/B': 'right' }));
  const rootEl = parent.querySelector('[data-node-id="R"]');
  expect(['R', 'R/A', 'R/B'].map((id) => alignOf(parent, id))).toEqual([
    ['is-align-center'],
    ['is-align-left'],
    ['is-align-right'],
  ]);
  // a layout switch keeps the node elements and changes only the alignment
  renderer.setLayout(aligned({ R: 'right', 'R/A': 'center', 'R/B': 'left' }));
  expect(parent.querySelector('[data-node-id="R"]')).toBe(rootEl);
  expect(['R', 'R/A', 'R/B'].map((id) => alignOf(parent, id))).toEqual([
    ['is-align-right'],
    ['is-align-center'],
    ['is-align-left'],
  ]);
});

test('nodes created later by culling get their alignment', () => {
  const parent = document.createElement('div');
  const renderer = new DomMapRenderer(parent, undefined, { culling: true });
  const canvas = renderer.canvasEl;
  Object.defineProperty(canvas, 'clientWidth', { value: 400 });
  Object.defineProperty(canvas, 'clientHeight', { value: 100 });
  const map = star(9);
  renderer.setLayout({
    ...map,
    nodes: map.nodes.map((p) => (p.node.id === 'b8/c' ? { ...p, align: 'right' } : p)),
  });
  expect(parent.querySelector('[data-node-id="b8/c"]')).toBeNull();
  renderer.setTransform({ x: -2 * 260, y: -8 * 60, zoom: 1 });
  renderer.updateVisible();
  expect(alignOf(parent, 'b8/c')).toEqual(['is-align-right']);
});

test('the canvas has a theme class: none by default, setTheme switches it live', () => {
  const { renderer } = setup();
  renderer.setLayout(layout);
  const themeClasses = () =>
    [...renderer.canvasEl.classList].filter((c) => c.startsWith('mind-mapper-theme-'));
  expect(themeClasses()).toEqual(['mind-mapper-theme-none']);
  const nodeEl = renderer.canvasEl.querySelector('[data-node-id="R/A"]');
  renderer.setTheme('rainbow');
  expect(themeClasses()).toEqual(['mind-mapper-theme-rainbow']);
  renderer.setTheme('accent');
  expect(themeClasses()).toEqual(['mind-mapper-theme-accent']);
  // a pure CSS switch: no re-render
  expect(renderer.canvasEl.querySelector('[data-node-id="R/A"]')).toBe(nodeEl);
  renderer.clear();
  expect(themeClasses()).toEqual(['mind-mapper-theme-accent']);
});

test('in German the toggle and the expand button are labelled German', () => {
  useGerman();
  const { parent, renderer } = hooked();
  renderer.setLayout(layout, { hidden: new Map(), hasChildren: withChildren });
  const toggle = () => parent.querySelector('.mind-mapper-collapse')?.getAttribute('aria-label');
  expect(toggle()).toBe('Einklappen');
  const collapsed: MapLayout = { ...layout, nodes: layout.nodes.slice(0, 2), edges: [] };
  renderer.setLayout(collapsed, { hidden: new Map([['R/A', 5]]), hasChildren: withChildren });
  expect(toggle()).toBe('Ausklappen');
  renderer.setLayout(withMarkdown('A', 'x'));
  renderer.setClipped('A', { x: false, y: true });
  expect(parent.querySelector('.mind-mapper-node-expand')?.getAttribute('aria-label')).toBe(
    'Gesamten Inhalt anzeigen',
  );
});
