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
  // The state lives only in data-mm-state (issue #40): no state class next to it.
  expect(toggle?.getAttribute('data-mm-state')).toBe('expanded');
  expect([...(toggle?.classList ?? [])].sort()).toEqual(['is-side-right', 'mind-mapper-collapse']);

  const collapsed: MapLayout = { ...layout, nodes: layout.nodes.slice(0, 2), edges: [] };
  renderer.setLayout(collapsed, { hidden: new Map([['R/A', 5]]), hasChildren: withChildren });
  const again = parent.querySelector<HTMLElement>('.mind-mapper-collapse');
  expect(again?.textContent).toBe('5');
  expect(again?.getAttribute('aria-label')).toBe('Expand');
  expect(again?.getAttribute('data-mm-state')).toBe('collapsed');
  expect([...(again?.classList ?? [])].sort()).toEqual(['is-side-right', 'mind-mapper-collapse']);
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

describe('kanban (issue #32)', () => {
  const kanban = (count: number | undefined): MapLayout => ({
    ...layout,
    nodes: layout.nodes.map((p) =>
      p.node.id === 'R/A' && count !== undefined ? { ...p, count } : p,
    ),
    edges: [],
    toggles: false,
  });
  const bubbles = (parent: HTMLElement) =>
    [...parent.querySelectorAll<HTMLElement>('.mind-mapper-card-count')].map((el) => ({
      node: el.closest<HTMLElement>('.mind-mapper-node')?.dataset.nodeId,
      text: el.textContent,
      label: el.getAttribute('aria-label'),
      id: el.getAttribute('data-mm-id'),
      tag: el.tagName,
    }));

  test('a layout without toggles shows none, also for collapsed nodes; old ones are removed', () => {
    const { parent, renderer } = hooked();
    renderer.setLayout(layout, { hidden: new Map(), hasChildren: withChildren });
    expect(parent.querySelectorAll('.mind-mapper-collapse')).toHaveLength(1);
    renderer.setLayout(kanban(3), { hidden: new Map([['R/B', 4]]), hasChildren: withChildren });
    expect(parent.querySelectorAll('.mind-mapper-collapse')).toHaveLength(0);
  });

  test('a column header shows its card count in a bubble inside the node, info only', () => {
    const { parent, renderer, hooks } = hooked();
    renderer.setLayout(kanban(3), { hidden: new Map(), hasChildren: withChildren });
    expect(bubbles(parent)).toEqual([
      { node: 'R/A', text: '3', label: '3 cards', id: 'node.card-count', tag: 'SPAN' },
    ]);
    // Not a control: a click on it selects the header.
    parent.querySelector<HTMLElement>('.mind-mapper-card-count')?.click();
    expect(hooks.select).toHaveBeenCalledWith('R/A');
    expect(hooks.toggle).not.toHaveBeenCalled();
    // The count follows the layout; a layout without counts removes the bubble.
    renderer.setLayout(kanban(12), { hidden: new Map(), hasChildren: withChildren });
    expect(bubbles(parent).map((b) => b.text)).toEqual(['12']);
    renderer.setLayout(layout, { hidden: new Map(), hasChildren: withChildren });
    expect(bubbles(parent)).toEqual([]);
  });

  test('one card and German', () => {
    const { parent, renderer } = hooked();
    renderer.setLayout(kanban(1));
    expect(bubbles(parent)[0]?.label).toBe('1 card');
    useGerman();
    renderer.setLayout(kanban(0));
    expect(bubbles(parent)[0]?.label).toBe('0 Karten');
    renderer.setLayout(kanban(1));
    expect(bubbles(parent)[0]?.label).toBe('1 Karte');
  });

  test('a header rendered later (culling) gets its bubble', () => {
    const { parent, renderer } = hooked();
    renderer.setLayout(kanban(2));
    const el = parent.querySelector('.mind-mapper-node[data-node-id="R/A"]');
    expect(el?.querySelector('.mind-mapper-card-count')?.textContent).toBe('2');
    // The content stays the node's first child (content reuse inserts it first).
    expect(el?.firstElementChild?.classList.contains('mind-mapper-node-content')).toBe(true);
  });
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
    { fromId: 'R/A', toId: 'R/B', line: 3 },
    { fromId: 'R/A', toId: 'Gone', line: 4 },
  ]);
  const paths = [...parent.querySelectorAll('svg.mind-mapper-edges path.mind-mapper-crosslink')];
  expect(paths).toHaveLength(1);
  // R/A (260,-42,200x36) above R/B (260,6,200x36): vertical, bottom of A to top of B
  expect(paths[0]?.getAttribute('d')).toBe('M 360 -6 C 360 34, 360 -34, 360 6');
  renderer.setCrossLinks([]);
  expect(parent.querySelectorAll('path.mind-mapper-crosslink')).toHaveLength(0);
});

const linkEnds = (parent: HTMLElement) =>
  [...parent.querySelectorAll<HTMLElement>('.mind-mapper-node.is-link-end')].map(
    (el) => el.dataset.nodeId,
  );

test('each cross-link gets a wide invisible hit path right after its line; crossLinkAt maps it back', () => {
  const { parent, renderer } = setup();
  renderer.setLayout(layout);
  renderer.setCrossLinks([
    { fromId: 'R/A', toId: 'R/B', line: 3 },
    { fromId: 'R', toId: 'R/B', line: 7 },
  ]);
  const svg = parent.querySelector('svg.mind-mapper-edges');
  const hits = [...(svg?.querySelectorAll('path.mind-mapper-crosslink-hit') ?? [])];
  expect(hits).toHaveLength(2);
  const lines = [...(svg?.querySelectorAll('path.mind-mapper-crosslink') ?? [])];
  expect(hits.map((h) => h.getAttribute('d'))).toEqual(lines.map((l) => l.getAttribute('d')));
  expect(hits.map((h) => h.previousElementSibling)).toEqual(lines);
  expect(hits.map((h) => [h.getAttribute('data-from-id'), h.getAttribute('data-to-id')])).toEqual([
    ['R/A', 'R/B'],
    ['R', 'R/B'],
  ]);
  expect(renderer.crossLinkAt(hits[1] ?? null)).toEqual({ fromId: 'R', toId: 'R/B', line: 7 });
  expect(renderer.crossLinkAt(lines[0] ?? null)).toBeNull();
  expect(renderer.crossLinkAt(parent.querySelector('.mind-mapper-node'))).toBeNull();
  expect(renderer.crossLinkAt(null)).toBeNull();
  renderer.setCrossLinks([]);
  expect(parent.querySelectorAll('path.mind-mapper-crosslink-hit')).toHaveLength(0);
});

test('setHighlightedLink rings both end nodes and emphasises the line; null clears', () => {
  const { parent, renderer } = setup();
  renderer.setLayout(layout);
  renderer.setCrossLinks([
    { fromId: 'R/A', toId: 'R/B', line: 3 },
    { fromId: 'R', toId: 'R/B', line: 7 },
  ]);
  const highlighted = () =>
    [...parent.querySelectorAll('path.mind-mapper-crosslink.is-highlighted')].length;
  renderer.setHighlightedLink({ fromId: 'R', toId: 'R/B', line: 7 });
  expect(linkEnds(parent)).toEqual(['R', 'R/B']);
  expect(highlighted()).toBe(1);
  const lines = [...parent.querySelectorAll('path.mind-mapper-crosslink')];
  expect(lines[1]?.classList.contains('is-highlighted')).toBe(true);
  // a link highlight is not a node selection
  expect(parent.querySelectorAll('.mind-mapper-node.is-selected')).toHaveLength(0);
  renderer.setHighlightedLink({ fromId: 'R/A', toId: 'R/B', line: 3 });
  expect(linkEnds(parent)).toEqual(['R/A', 'R/B']);
  expect(lines[0]?.classList.contains('is-highlighted')).toBe(true);
  expect(highlighted()).toBe(1);
  renderer.setHighlightedLink(null);
  expect(linkEnds(parent)).toEqual([]);
  expect(highlighted()).toBe(0);
});

test('the link highlight survives new cross-links with the same ends and ends with them', () => {
  const { parent, renderer } = setup();
  renderer.setLayout(layout);
  renderer.setCrossLinks([{ fromId: 'R/A', toId: 'R/B', line: 3 }]);
  renderer.setHighlightedLink({ fromId: 'R/A', toId: 'R/B', line: 3 });
  renderer.setLayout(layout);
  renderer.setCrossLinks([{ fromId: 'R/A', toId: 'R/B', line: 5 }]);
  expect(linkEnds(parent)).toEqual(['R/A', 'R/B']);
  expect(parent.querySelector('path.mind-mapper-crosslink')?.classList).toContain('is-highlighted');
  expect(renderer.highlightedLink).toEqual({ fromId: 'R/A', toId: 'R/B', line: 5 });
  renderer.setCrossLinks([{ fromId: 'R', toId: 'R/B', line: 5 }]);
  expect(linkEnds(parent)).toEqual([]);
  expect(renderer.highlightedLink).toBeNull();
});

/** The copy of the highlighted line drawn above the nodes, or null. */
function highlightOverlay(parent: HTMLElement): SVGPathElement | null {
  return parent.querySelector<SVGPathElement>(
    'svg.mind-mapper-highlight-layer path.mind-mapper-crosslink-highlight',
  );
}

test('the highlighted line is copied into a layer above all nodes only while highlighted', () => {
  const { parent, renderer } = setup();
  renderer.setLayout(layout);
  renderer.setCrossLinks([{ fromId: 'R/A', toId: 'R/B', line: 3 }]);
  expect(parent.querySelector('svg.mind-mapper-highlight-layer')).toBeNull();
  renderer.setHighlightedLink({ fromId: 'R/A', toId: 'R/B', line: 3 });
  const overlay = highlightOverlay(parent);
  expect(overlay?.getAttribute('d')).toBe(
    parent.querySelector('path.mind-mapper-crosslink')?.getAttribute('d'),
  );
  // after every node in the world (painted above them); not a second cross-link
  const world = parent.querySelector('.mind-mapper-world');
  expect(world?.lastElementChild).toBe(overlay?.ownerSVGElement);
  expect(parent.querySelectorAll('path.mind-mapper-crosslink')).toHaveLength(1);
  renderer.setHighlightedLink(null);
  expect(parent.querySelector('svg.mind-mapper-highlight-layer')).toBeNull();
});

test('the overlay follows a re-layout and goes when its link is no longer drawn', () => {
  const { parent, renderer } = setup();
  renderer.setLayout(layout);
  renderer.setCrossLinks([{ fromId: 'R/A', toId: 'R/B', line: 3 }]);
  renderer.setHighlightedLink({ fromId: 'R/A', toId: 'R/B', line: 3 });
  const before = highlightOverlay(parent)?.getAttribute('d');
  const moved: MapLayout = {
    ...layout,
    nodes: layout.nodes.map((p) => (p.node.id === 'R/B' ? { ...p, y: p.y + 100 } : p)),
  };
  renderer.setLayout(moved);
  renderer.setCrossLinks([{ fromId: 'R/A', toId: 'R/B', line: 3 }]);
  const after = highlightOverlay(parent)?.getAttribute('d');
  expect(after).not.toBe(before);
  expect(after).toBe(parent.querySelector('path.mind-mapper-crosslink')?.getAttribute('d'));
  expect(parent.querySelector('.mind-mapper-world')?.lastElementChild).toBe(
    highlightOverlay(parent)?.ownerSVGElement,
  );
  renderer.setCrossLinks([]);
  expect(parent.querySelector('svg.mind-mapper-highlight-layer')).toBeNull();
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
    renderer.setCrossLinks([{ fromId: 'n1', toId: 'n399', line: 1 }]);
    expect(parent.querySelectorAll('path.mind-mapper-edge')).toHaveLength(399);
    expect(parent.querySelectorAll('path.mind-mapper-crosslink')).toHaveLength(1);
  });

  test('a link end rendered later (panned into view) gets the ring', () => {
    const { parent, renderer } = culled();
    renderer.setTransform({ x: 0, y: 0, zoom: 1 });
    renderer.setLayout(grid());
    renderer.setCrossLinks([{ fromId: 'n1', toId: 'n399', line: 1 }]);
    renderer.setHighlightedLink({ fromId: 'n1', toId: 'n399', line: 1 });
    expect(linkEnds(parent)).toEqual(['n1']);
    renderer.setTransform({ x: -3600, y: -3600, zoom: 1 });
    renderer.updateVisible();
    expect(linkEnds(parent)).toEqual(['n399']);
    // nodes created by culling stay below the highlighted line
    expect(parent.querySelector('.mind-mapper-world')?.lastElementChild).toBe(
      highlightOverlay(parent)?.ownerSVGElement,
    );
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
    expect(skeleton?.getAttribute('data-mm-id')).toBe('skeleton');
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

  test('a toggle rendered again after culling keeps its data-mm-state (collapsed and expanded)', () => {
    const { parent, renderer } = culled();
    renderer.setLayout(grid(), {
      hidden: new Map([['n1', 3]]),
      hasChildren: (id) => id === 'n1' || id === 'n2',
    });
    const state = (id: string) =>
      parent
        .querySelector(`.mind-mapper-collapse[data-node-id="${id}"]`)
        ?.getAttribute('data-mm-state');
    expect(state('n1')).toBe('collapsed');
    expect(state('n2')).toBe('expanded');
    renderer.setTransform({ x: -2000, y: -2000, zoom: 1 });
    renderer.updateVisible();
    expect(state('n1')).toBeUndefined();
    renderer.setTransform({ x: 0, y: 0, zoom: 1 });
    renderer.updateVisible();
    expect(state('n1')).toBe('collapsed');
    expect(state('n2')).toBe('expanded');
  });

  test('a culling pass does not rewrite unchanged toggle text and labels (issue #49)', () => {
    const { parent, renderer } = culled();
    renderer.setTransform({ x: 0, y: 0, zoom: 1 });
    renderer.setLayout(grid(), {
      hidden: new Map([['n1', 3]]),
      hasChildren: (id) => id === 'n1' || id === 'n2',
    });
    const toggles = [...parent.querySelectorAll<HTMLElement>('.mind-mapper-collapse')];
    expect(toggles.map((el) => el.textContent)).toEqual(['3', '−']);
    const observer = new MutationObserver(() => {});
    for (const toggle of toggles) {
      observer.observe(toggle, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
      });
    }
    renderer.setTransform({ x: -10, y: 0, zoom: 1 });
    renderer.updateVisible();
    const rewrites = observer
      .takeRecords()
      .filter((r) => r.type !== 'attributes' || r.attributeName === 'aria-label');
    observer.disconnect();
    expect(rewrites).toEqual([]);
    expect(toggles.map((el) => el.getAttribute('aria-label'))).toEqual(['Expand', 'Collapse']);
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

  /** The root in view at (0, 0) plus `count` 10 x 10 nodes from (`x0`, `y0`), `perRow` per row, 20 px apart. */
  function marginOnly(count: number, x0: number, y0: number, perRow: number): MapLayout {
    const root = grid().nodes[0]!;
    const extra = Array.from({ length: count }, (_, i) => ({
      ...root,
      node: { ...node(`m${i}`), markdown: `m${i}` },
      x: x0 + (i % perRow) * 20,
      y: y0 + Math.floor(i / perRow) * 20,
      width: 10,
      height: 10,
      depth: 1,
      branch: i,
    }));
    return { ...grid(), nodes: [root, ...extra], edges: [] };
  }

  test('nodes only in the margin do not count towards the 300 node cap; they still render (issue #47)', () => {
    const { parent, renderer } = culled();
    const raf = vi.spyOn(renderer.canvasEl.win, 'requestAnimationFrame').mockReturnValue(1);
    renderer.setTransform({ x: 0, y: 0, zoom: 1 });
    // view 0..400, margin -200..600: 351 nodes in the strip x 410..580, y -190..580 (margin only)
    renderer.setLayout(marginOnly(351, 410, -190, 9));
    expect(renderer.renderedCount()).toBe(RENDER_BUDGET);
    for (let pass = 0; pass < 10; pass++) renderer.updateVisible();
    expect(renderer.renderedCount()).toBe(352);
    expect(parent.querySelector('path.mind-mapper-skeleton')).toBeNull();
    raf.mockRestore();
  });

  test('nodes only in the margin do not count towards the skeleton zoom minimum (issue #47)', () => {
    const { parent, renderer } = culled();
    const raf = vi.spyOn(renderer.canvasEl.win, 'requestAnimationFrame').mockReturnValue(1);
    renderer.setTransform({ x: 0, y: 0, zoom: 0.1 });
    // view 0..4000 (world), margin -2000..6000: 61 nodes at x 4100..5300 (margin only)
    renderer.setLayout(marginOnly(61, 4100, 0, 61));
    for (let pass = 0; pass < 3; pass++) renderer.updateVisible();
    expect(renderer.renderedCount()).toBe(62);
    expect(parent.querySelector('path.mind-mapper-skeleton')).toBeNull();
    raf.mockRestore();
  });

  /**
   * `inView` 10 x 10 nodes inside the 400 x 400 view (zoom 1) or 4000 x 4000 world view (zoom 0.1),
   * then 4 x 4 nodes 10 px apart (zoom 1) filling the whole margin ring around it.
   */
  function denseMargin(inView: number, zoom: number): MapLayout {
    const root = grid().nodes[0]!;
    const scale = 1 / zoom;
    const view = 400 * scale;
    const at = (id: string, x: number, y: number, size: number): PositionedNode => ({
      ...root,
      node: { ...node(id), markdown: id },
      x,
      y,
      width: size,
      height: size,
      depth: 1,
      branch: 0,
    });
    const nodes = [root];
    for (let i = 0; i < inView; i++) {
      nodes.push(
        at(
          `v${i}`,
          (20 + (i % 18) * 20) * scale,
          (40 + Math.floor(i / 18) * 20) * scale,
          10 * scale,
        ),
      );
    }
    const step = 10 * scale;
    for (let x = -view / 2 + step / 2; x < view * 1.5 - step; x += step) {
      for (let y = -view / 2 + step / 2; y < view * 1.5 - step; y += step) {
        if (x > -step && x < view && y > -step && y < view) continue;
        nodes.push(at(`m${x},${y}`, x, y, 4 * scale));
      }
    }
    return { ...grid(), nodes, edges: [] };
  }

  /** Squared gap between a node and the visible world viewport (0 inside). */
  function gap(p: PositionedNode, view: number): number {
    const dx = Math.max(0, -(p.x + p.width), p.x - view);
    const dy = Math.max(0, -(p.y + p.height), p.y - view);
    return dx * dx + dy * dy;
  }

  function expectMarginCap(zoom: number, inView: number, cap: number): void {
    const { parent, renderer } = culled();
    const raf = vi.spyOn(renderer.canvasEl.win, 'requestAnimationFrame').mockReturnValue(1);
    renderer.setTransform({ x: 0, y: 0, zoom });
    const layout = denseMargin(inView, zoom);
    expect(layout.nodes.length).toBeGreaterThan(cap * 2);
    renderer.setLayout(layout);
    for (let pass = 0; pass < 30; pass++) {
      renderer.updateVisible();
      expect(renderer.renderedCount()).toBeLessThanOrEqual(cap);
    }
    expect(renderer.renderedCount()).toBe(cap);
    expect(parent.querySelector('path.mind-mapper-skeleton')).toBeNull();
    const shown = new Set(ids(parent));
    // every in-view node is rendered
    for (let i = 0; i < inView; i++) expect(shown.has(`v${i}`)).toBe(true);
    expect(shown.has('n0')).toBe(true);
    // the margin is filled nearest to the view first
    const view = 400 / zoom;
    const margin = layout.nodes.filter((p) => p.node.id.startsWith('m'));
    const rendered = margin.filter((p) => shown.has(p.node.id)).map((p) => gap(p, view));
    const skipped = margin.filter((p) => !shown.has(p.node.id)).map((p) => gap(p, view));
    expect(rendered.length).toBe(cap - inView - 1);
    expect(Math.max(...rendered)).toBeLessThanOrEqual(Math.min(...skipped));
    raf.mockRestore();
  }

  test('a dense margin is capped at twice the 300 content cap, in view first, then nearest (issue #47)', () => {
    expectMarginCap(1, 250, 600);
  });

  test('below 0.2 zoom a dense margin is capped at twice the 60 node minimum (issue #47)', () => {
    expectMarginCap(0.1, 40, 120);
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
  renderer.setCrossLinks([{ fromId: 'R/A', toId: 'R/B', line: 3 }]);
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

describe('drill-down (issue #23)', () => {
  const marker = (parent: HTMLElement) =>
    parent.querySelector<HTMLElement>('.mind-mapper-drill-marker');

  test('setDrillCentre marks the centre node and shows the `focus` marker above it', () => {
    const { parent, renderer } = setup();
    renderer.setLayout(layout);
    expect(marker(parent)).toBeNull();
    renderer.setDrillCentre('R');
    const el = marker(parent);
    expect(el?.dataset.icon).toBe('focus');
    expect(el?.getAttribute('aria-label')).toBe('Drilled-in centre');
    // Middle of the top edge (CSS moves it just above the node).
    expect(el?.style.left).toBe('100px');
    expect(el?.style.top).toBe('-18px');
    expect(el?.classList.contains('is-side-top')).toBe(true);
    expect(parent.querySelector('[data-node-id="R"]')?.classList.contains('is-drill-centre')).toBe(
      true,
    );
    renderer.setDrillCentre(null);
    expect(marker(parent)).toBeNull();
    expect(parent.querySelectorAll('.is-drill-centre')).toHaveLength(0);
  });

  test('the marker goes below the centre when its children grow upwards (bottom to top)', () => {
    const { parent, renderer } = setup();
    const [root, ...rest] = layout.nodes;
    if (!root) throw new Error('no root');
    renderer.setLayout({ ...layout, nodes: [{ ...root, childSide: 'top' }, ...rest] });
    renderer.setDrillCentre('R');
    expect(marker(parent)?.style.top).toBe('18px');
    expect(marker(parent)?.classList.contains('is-side-bottom')).toBe(true);
  });

  test('the marker follows the centre across layouts and is removed when it is not laid out', () => {
    const { parent, renderer } = setup();
    renderer.setDrillCentre('R');
    renderer.setLayout(layout);
    expect(marker(parent)).not.toBeNull();
    expect(parent.querySelector('[data-node-id="R"]')?.classList.contains('is-drill-centre')).toBe(
      true,
    );
    renderer.setLayout({ ...layout, nodes: layout.nodes.slice(1), edges: [] });
    expect(marker(parent)).toBeNull();
  });

  test('setOpacity fades the whole map (nodes and lines), null restores it', () => {
    const { parent, renderer } = setup();
    renderer.setLayout(layout);
    const world = parent.querySelector<HTMLElement>('.mind-mapper-world');
    renderer.setOpacity(0.25);
    expect(world?.style.opacity).toBe('0.25');
    renderer.setOpacity(null);
    expect(world?.style.opacity).toBe('');
  });
});

describe('element IDs (issue #33)', () => {
  const mmId = (el: Element | null | undefined) => el?.getAttribute('data-mm-id');

  test('canvas, nodes, node parts and lines carry their data-mm-id', () => {
    const { parent, renderer } = hooked();
    const withBlock: MapLayout = {
      ...layout,
      nodes: layout.nodes.map((p) =>
        p.node.id === 'R/B' ? { ...p, node: node('R/B', 'block') } : p,
      ),
      dividers: [{ parentId: 'R', from: { x: 260, y: 0 }, to: { x: 460, y: 0 } }],
    };
    renderer.setLayout(withBlock, { hidden: new Map(), hasChildren: withChildren });
    renderer.setCrossLinks([{ fromId: 'R/A', toId: 'R/B', line: 3 }]);
    renderer.setHighlightedLink({ fromId: 'R/A', toId: 'R/B', line: 3 });
    renderer.setDrillCentre('R');
    expect(mmId(renderer.canvasEl)).toBe('map.canvas');
    const byNode = (id: string) => parent.querySelector(`.mind-mapper-node[data-node-id="${id}"]`);
    expect(mmId(byNode('R'))).toBe('node.root');
    expect(mmId(byNode('R/A'))).toBe('node.text');
    expect(mmId(byNode('R/B'))).toBe('node.block');
    expect(mmId(byNode('R/A')?.querySelector('.mind-mapper-node-expand'))).toBe('node.expand');
    expect(mmId(parent.querySelector('.mind-mapper-collapse'))).toBe('node.toggle');
    expect(mmId(parent.querySelector('.mind-mapper-drill-marker'))).toBe('node.drill-marker');
    expect(mmId(parent.querySelector('path.mind-mapper-edge'))).toBe('edge');
    expect(mmId(parent.querySelector('path.mind-mapper-divider'))).toBe('divider');
    expect(mmId(parent.querySelector('path.mind-mapper-crosslink'))).toBe('link.line');
    expect(mmId(parent.querySelector('path.mind-mapper-crosslink-hit'))).toBe('link.hit-area');
    expect(mmId(parent.querySelector('path.mind-mapper-crosslink-highlight'))).toBe(
      'link.highlight',
    );
  });

  test('a toggle is always node.toggle; data-mm-state follows collapsed / expanded', () => {
    const { parent, renderer } = hooked();
    const toggle = () => parent.querySelector('.mind-mapper-collapse');
    renderer.setLayout(layout, { hidden: new Map(), hasChildren: withChildren });
    expect(mmId(toggle())).toBe('node.toggle');
    expect(toggle()?.getAttribute('data-mm-state')).toBe('expanded');
    const collapsed: MapLayout = { ...layout, nodes: layout.nodes.slice(0, 2), edges: [] };
    renderer.setLayout(collapsed, { hidden: new Map([['R/A', 5]]), hasChildren: withChildren });
    expect(mmId(toggle())).toBe('node.toggle');
    expect(toggle()?.getAttribute('data-mm-state')).toBe('collapsed');
    renderer.setLayout(layout, { hidden: new Map(), hasChildren: withChildren });
    expect(mmId(toggle())).toBe('node.toggle');
    expect(toggle()?.getAttribute('data-mm-state')).toBe('expanded');
  });
});
