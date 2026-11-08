import { setIcon } from 'obsidian';
import { edgePath } from '../layout/edgePath';
import type { MapLayout, PositionedNode } from '../layout/types';
import type { MindMapNode } from '../parser/types';
import { type Transform, transformCss } from './viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Renderer boundary from the spec; a three.js renderer is a future implementation. */
export interface MapRenderer {
  readonly canvasEl: HTMLElement;
  setLayout(layout: MapLayout): void;
  setTransform(t: Transform): void;
}

/** How node content is produced; the default writes the markdown as plain text. */
export interface NodeContentHooks {
  render(node: MindMapNode, contentEl: HTMLElement): void;
  release(contentEl: HTMLElement): void;
  expand(node: MindMapNode): void;
}

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

  constructor(
    parentEl: HTMLElement,
    private readonly hooks: NodeContentHooks = PLAIN_TEXT,
  ) {
    this.canvasEl = parentEl.createDiv({ cls: 'mind-mapper-canvas' });
    this.worldEl = this.canvasEl.createDiv({ cls: 'mind-mapper-world' });
  }

  setLayout(layout: MapLayout): void {
    this.renderEdges(layout);
    const seen = new Set<string>();
    for (const positioned of layout.nodes) {
      seen.add(positioned.node.id);
      this.placeNode(positioned);
    }
    for (const [id, dom] of this.nodes) {
      if (seen.has(id)) continue;
      this.hooks.release(dom.contentEl);
      dom.el.remove();
      this.nodes.delete(id);
    }
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

  private placeNode({ node, x, y, width, height }: PositionedNode): void {
    let dom = this.nodes.get(node.id);
    if (!dom) {
      dom = this.createNode(node);
      this.nodes.set(node.id, dom);
    } else if (dom.node.markdown !== node.markdown) {
      // Fresh content element: a still running render of the old markdown cannot write into it.
      this.hooks.release(dom.contentEl);
      const contentEl = this.createContent(dom.el, node);
      dom.contentEl.replaceWith(contentEl);
      dom.contentEl = contentEl;
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

  private createNode(node: MindMapNode): NodeDom {
    const el = this.worldEl.createDiv({
      cls: 'mind-mapper-node',
      attr: { 'data-node-id': node.id },
    });
    const contentEl = this.createContent(el, node);
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
