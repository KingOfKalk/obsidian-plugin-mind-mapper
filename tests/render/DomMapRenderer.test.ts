import type { MapLayout } from '../../src/layout/types';
import type { MindMapNode } from '../../src/parser/types';
import { DomMapRenderer } from '../../src/render/DomMapRenderer';

function node(id: string, kind: MindMapNode['kind'] = 'heading', label = id): MindMapNode {
  return { id, kind, label, markdown: label, sectionType: null, level: 1, line: 0, children: [] };
}

const layout: MapLayout = {
  nodes: [
    { node: node('R', 'root'), x: 0, y: -18, width: 200, height: 36, childSide: 'right' },
    { node: node('R/A'), x: 260, y: -42, width: 200, height: 36, childSide: 'right' },
    { node: node('R/B'), x: 260, y: 6, width: 200, height: 36, childSide: 'right' },
  ],
  edges: [
    { fromId: 'R', toId: 'R/A', source: { x: 200, y: 0 }, target: { x: 260, y: -24 }, axis: 'x' },
    { fromId: 'R', toId: 'R/B', source: { x: 200, y: 0 }, target: { x: 260, y: 24 }, axis: 'x' },
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

test('long labels keep fixed size and expose the full text as title', () => {
  const { parent, renderer } = setup();
  const label = 'x'.repeat(300);
  renderer.setLayout({
    ...layout,
    nodes: [
      { node: node('L', 'heading', label), x: 0, y: 0, width: 200, height: 36, childSide: 'right' },
    ],
    edges: [],
  });
  const el = parent.querySelector<HTMLElement>('.mind-mapper-node');
  expect(el?.style.width).toBe('200px');
  expect(el?.title).toBe(label);
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
      { node: { ...node(id), markdown }, x: 0, y: 0, width: 200, height: 36, childSide: 'right' },
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
