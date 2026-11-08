import { setIcon } from 'obsidian';
import { edgePath } from '../layout/edgePath';
import type { MapLayout, PositionedNode } from '../layout/types';
import type { MindMapNode } from '../parser/types';
import { type Transform, transformCss } from './viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Renderer boundary from the spec; a three.js renderer is a future implementation. */
export interface MapRenderer {
  readonly canvasEl: HTMLElement;
  setLayout(layout: MapLayout, collapse?: CollapseInfo): void;
  setTransform(t: Transform): void;
}

/** How node content is produced; the default writes the markdown as plain text. */
export interface NodeContentHooks {
  render(node: MindMapNode, contentEl: HTMLElement): void;
  release(contentEl: HTMLElement): void;
  expand(node: MindMapNode): void;
  /** Single click on a node (not on a link or button inside it). */
  select?(id: string): void;
  /** Double click on a node (not on a link or button inside it). */
  open?(node: MindMapNode): void;
  /** Click on the collapse toggle of a node. */
  toggle?(id: string): void;
}

/** Collapse toggles: shown for nodes with children; `hidden` holds the counts of collapsed ones. */
export interface CollapseInfo {
  hidden: ReadonlyMap<string, number>;
  hasChildren: (id: string) => boolean;
}

const NO_COLLAPSE: CollapseInfo = { hidden: new Map(), hasChildren: () => false };

/** Clicks on these inside a node keep their own behavior and are not node clicks. */
const NOT_A_NODE_CLICK = 'a, button, input, .mind-mapper-node-expand';

interface NodeDom {
  el: HTMLElement;
  contentEl: HTMLElement;
  node: MindMapNode;
}

const PLAIN_TEXT: NodeContentHooks = {
  render: (node, contentEl) => contentEl.setText(node.markdown),
  release: () => {},
  expand: () => {},
};

/**
 * Absolutely positioned node divs plus one SVG edge layer inside a CSS-transformed world.
 * Node elements are kept across layouts by id; content is re-rendered only when its markdown changes.
 */
export class DomMapRenderer implements MapRenderer {
  readonly canvasEl: HTMLElement;
  private readonly worldEl: HTMLElement;
  private edgesEl: SVGSVGElement | null = null;
  private readonly nodes = new Map<string, NodeDom>();
  private readonly toggles = new Map<string, HTMLElement>();
  private selectedId: string | null = null;

  constructor(
    parentEl: HTMLElement,
    private readonly hooks: NodeContentHooks = PLAIN_TEXT,
  ) {
    this.canvasEl = parentEl.createDiv({ cls: 'mind-mapper-canvas' });
    this.worldEl = this.canvasEl.createDiv({ cls: 'mind-mapper-world' });
    this.worldEl.addEventListener('click', (event) => {
      const id = this.nodeIdOf(event);
      if (id !== null) this.hooks.select?.(id);
    });
    this.worldEl.addEventListener('dblclick', (event) => {
      const id = this.nodeIdOf(event);
      const dom = id === null ? undefined : this.nodes.get(id);
      if (dom) this.hooks.open?.(dom.node);
    });
  }

  setLayout(layout: MapLayout, collapse: CollapseInfo = NO_COLLAPSE): void {
    this.renderEdges(layout);
    const next = new Map(layout.nodes.map((p) => [p.node.id, p.node]));
    // Content that lost its node or its markdown, by markdown: a node whose ID shifted takes it over
    // without re-rendering (render cache across ID shifts, spec "Node identity").
    const pool = new Map<string, HTMLElement[]>();
    for (const [id, dom] of this.nodes) {
      const node = next.get(id);
      if (node && node.markdown === dom.node.markdown) continue;
      dom.contentEl.remove();
      const list = pool.get(dom.node.markdown) ?? [];
      list.push(dom.contentEl);
      pool.set(dom.node.markdown, list);
      if (node) continue;
      dom.el.remove();
      this.nodes.delete(id);
    }
    for (const positioned of layout.nodes) this.placeNode(positioned, pool);
    for (const list of pool.values()) for (const contentEl of list) this.hooks.release(contentEl);
    this.placeToggles(layout, collapse);
  }

  /** `is-selected` on the node with this ID (kept for nodes created later). */
  setSelected(id: string | null): void {
    if (this.selectedId !== null) this.nodes.get(this.selectedId)?.el.removeClass('is-selected');
    this.selectedId = id;
    if (id !== null) this.nodes.get(id)?.el.addClass('is-selected');
  }

  setTransform(t: Transform): void {
    this.worldEl.style.transform = transformCss(t);
  }

  /** `is-clipped` shows the expand button; `is-clipped-x` / `-y` fade the overflowing edge. */
  setClipped(id: string, clip: { x: boolean; y: boolean }): void {
    const el = this.nodes.get(id)?.el;
    if (!el) return;
    el.toggleClass('is-clipped', clip.x || clip.y);
    el.toggleClass('is-clipped-x', clip.x);
    el.toggleClass('is-clipped-y', clip.y);
  }

  contentElements(): ReadonlyMap<string, HTMLElement> {
    return new Map([...this.nodes].map(([id, dom]) => [id, dom.contentEl]));
  }

  /** Releases all node content (view close). */
  clear(): void {
    for (const dom of this.nodes.values()) this.hooks.release(dom.contentEl);
    this.nodes.clear();
    this.toggles.clear();
    this.worldEl.empty();
    this.edgesEl = null;
  }

  private renderEdges(layout: MapLayout): void {
    this.edgesEl?.remove();
    const doc = this.worldEl.doc;
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.classList.add('mind-mapper-edges');
    for (const edge of layout.edges) {
      const path = doc.createElementNS(SVG_NS, 'path');
      path.classList.add('mind-mapper-edge');
      path.setAttribute('d', edgePath(edge));
      svg.appendChild(path);
    }
    this.worldEl.prepend(svg);
    this.edgesEl = svg;
  }

  private nodeIdOf(event: Event): string | null {
    const target = event.target as Node | null;
    // instanceOf, not instanceof: works for nodes of popout windows too.
    if (!target?.instanceOf(Element)) return null;
    if (target.closest(NOT_A_NODE_CLICK)) return null;
    const nodeEl = target.closest<HTMLElement>('.mind-mapper-node');
    return nodeEl?.dataset.nodeId ?? null;
  }

  private placeToggles(layout: MapLayout, collapse: CollapseInfo): void {
    const shown = new Set<string>();
    for (const { node, x, y, width, height } of layout.nodes) {
      const count = collapse.hidden.get(node.id);
      if (count === undefined && !collapse.hasChildren(node.id)) continue;
      shown.add(node.id);
      let toggle = this.toggles.get(node.id);
      if (!toggle) {
        toggle = this.createToggle(node.id);
        this.toggles.set(node.id, toggle);
      }
      const collapsed = count !== undefined;
      toggle.toggleClass('is-collapsed', collapsed);
      toggle.setText(collapsed ? String(count) : '−');
      toggle.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
      toggle.style.left = `${x + width}px`;
      toggle.style.top = `${y + height / 2}px`;
    }
    for (const [id, toggle] of this.toggles) {
      if (shown.has(id)) continue;
      toggle.remove();
      this.toggles.delete(id);
    }
  }

  private createToggle(id: string): HTMLElement {
    const toggle = this.worldEl.createEl('button', {
      cls: 'mind-mapper-collapse',
      attr: { 'data-node-id': id },
    });
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hooks.toggle?.(id);
    });
    return toggle;
  }

  private placeNode(
    { node, x, y, width, height }: PositionedNode,
    pool: Map<string, HTMLElement[]>,
  ): void {
    let dom = this.nodes.get(node.id);
    if (!dom) {
      dom = this.createNode(node, pool.get(node.markdown)?.shift());
      this.nodes.set(node.id, dom);
      dom.el.toggleClass('is-selected', node.id === this.selectedId);
    } else if (dom.node.markdown !== node.markdown) {
      // Old content was pooled (setLayout). Fresh content element: a still running render of the old
      // markdown cannot write into it.
      const reused = pool.get(node.markdown)?.shift();
      if (reused) dom.el.prepend(reused);
      dom.contentEl = reused ?? this.createContent(dom.el, node);
      dom.node = node;
    } else {
      dom.node = node;
    }
    const { el } = dom;
    el.toggleClass('is-root', node.kind === 'root');
    el.setAttribute('title', node.label);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }

  private createNode(node: MindMapNode, reused?: HTMLElement): NodeDom {
    const el = this.worldEl.createDiv({
      cls: 'mind-mapper-node',
      attr: { 'data-node-id': node.id },
    });
    let contentEl: HTMLElement;
    if (reused) {
      el.prepend(reused);
      contentEl = reused;
    } else {
      contentEl = this.createContent(el, node);
    }
    const expand = el.createEl('button', {
      cls: 'mind-mapper-node-expand clickable-icon',
      attr: { 'aria-label': 'Show full content' },
    });
    setIcon(expand, 'maximize-2');
    expand.addEventListener('click', (event) => {
      event.stopPropagation();
      const current = this.nodes.get(node.id);
      if (current) this.hooks.expand(current.node);
    });
    return { el, contentEl, node };
  }

  private createContent(nodeEl: HTMLElement, node: MindMapNode): HTMLElement {
    const contentEl = nodeEl.doc.createElement('div');
    // markdown-rendered: Obsidian scopes its reading view styles (task checkboxes, code blocks,
    // copy button, callouts) under this class.
    contentEl.className = 'mind-mapper-node-content markdown-rendered';
    nodeEl.prepend(contentEl);
    nodeEl.removeClass('is-render-error');
    this.hooks.render(node, contentEl);
    return contentEl;
  }
}
