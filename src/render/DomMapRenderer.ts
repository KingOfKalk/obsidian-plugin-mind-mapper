import { setIcon } from 'obsidian';
import { t } from '../i18n';
import type { CrossLink } from '../layout/crossLinks';
import { crossLinkPath, edgePath } from '../layout/edgePath';
import type { MapLayout, PositionedNode, Side, TextAlign } from '../layout/types';
import { isImageOnly } from '../layout/nodeSize';
import type { MindMapNode } from '../parser/types';
import { detailLevel, SpatialIndex, worldViewport } from './culling';
import { branchAttr, levelAttr, type MapThemeName, themeClass } from './themes';
import { IDENTITY, type Transform, transformCss } from './viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** New nodes rendered per culling pass (one pass per frame): keeps panning into new areas smooth. */
export const RENDER_BUDGET = 40;

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

const SIDES: readonly Side[] = ['right', 'left', 'bottom', 'top'];
const ALIGNS: readonly TextAlign[] = ['left', 'right', 'center'];

const NO_COLLAPSE: CollapseInfo = { hidden: new Map(), hasChildren: () => false };

/** Clicks on these inside a node keep their own behavior and are not node clicks. */
const NOT_A_NODE_CLICK = 'a, button, input, .mind-mapper-node-expand';

type Clip = { x: boolean; y: boolean };

export interface RendererOptions {
  /** Spec "Performance": DOM only for nodes in the viewport plus a margin; skeleton at tiny zoom. */
  culling?: boolean;
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
  private edgePaths: SVGPathElement[] = [];
  private readonly nodes = new Map<string, NodeDom>();
  private readonly toggles = new Map<string, HTMLElement>();
  private selectedId: string | null = null;
  /** Hit path of each drawn cross-link -> the link (a tap on a line looks it up). */
  private readonly linkHits = new Map<EventTarget, CrossLink>();
  /** Visible path of each drawn cross-link by `linkKey`. */
  private readonly linkLines = new Map<string, SVGPathElement>();
  private highlighted: CrossLink | null = null;
  /** Layer after all nodes with a copy of the highlighted line (painted above the nodes). */
  private highlightEl: SVGSVGElement | null = null;
  /** Node rects of the last layout (cross-links are drawn from the layout, never from the DOM). */
  private rects = new Map<string, PositionedNode>();
  private layout: MapLayout | null = null;
  private collapse: CollapseInfo = NO_COLLAPSE;
  private index: SpatialIndex | null = null;
  /** Clip state by node ID, also for nodes without DOM (applied when they are rendered). */
  private readonly clips = new Map<string, Clip>();
  private transform: Transform = IDENTITY;
  private readonly culling: boolean;
  /** The canvas had a real size once (a renderer never sized renders everything). */
  private sized = false;
  private frame: number | null = null;
  private skeletonD: string | null = null;
  private theme: MapThemeName = 'none';

  constructor(
    parentEl: HTMLElement,
    private readonly hooks: NodeContentHooks = PLAIN_TEXT,
    options: RendererOptions = {},
  ) {
    this.culling = options.culling ?? false;
    this.canvasEl = parentEl.createDiv({ cls: 'mind-mapper-canvas' });
    this.canvasEl.addClass(themeClass(this.theme));
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
    this.rects = new Map(layout.nodes.map((p) => [p.node.id, p]));
    this.renderEdges(layout);
    this.layout = layout;
    this.collapse = collapse;
    this.skeletonD = null;
    this.index = this.culling ? new SpatialIndex(layout.nodes) : null;
    this.reconcile();
  }

  /** Renders the nodes in view (culling) and releases the others; cheap when nothing changed. */
  updateVisible(): void {
    if (this.layout) this.reconcile();
  }

  /** Number of nodes with DOM (tests, benchmark). */
  renderedCount(): number {
    return this.nodes.size;
  }

  /** IDs that should have DOM: all without culling; none at skeleton zoom; else those in view. */
  private wanted(layout: MapLayout): { ids: Set<string>; skeleton: boolean } {
    const all = (): Set<string> => new Set(layout.nodes.map((p) => p.node.id));
    if (!this.culling || !this.index) return { ids: all(), skeleton: false };
    const size = { width: this.canvasEl.clientWidth, height: this.canvasEl.clientHeight };
    if (size.width === 0 || size.height === 0) {
      // Hidden tab: no viewport. Keep what is shown; a renderer never sized renders everything.
      if (!this.sized) return { ids: all(), skeleton: false };
      return {
        ids: new Set([...this.nodes.keys()].filter((id) => this.rects.has(id))),
        skeleton: false,
      };
    }
    this.sized = true;
    const ids = this.index.query(worldViewport(this.transform, size));
    if (detailLevel(this.transform.zoom, ids.size) === 'skeleton') {
      return { ids: new Set(), skeleton: true };
    }
    // Rendering content is the expensive part: at most RENDER_BUDGET new nodes per pass, nearest to
    // the view centre first; the skeleton shows the rest until a later frame renders them.
    const missing = [...ids].filter((id) => !this.nodes.has(id));
    if (missing.length <= RENDER_BUDGET) return { ids, skeleton: false };
    const cx = (size.width / 2 - this.transform.x) / this.transform.zoom;
    const cy = (size.height / 2 - this.transform.y) / this.transform.zoom;
    const distance = (id: string): number => {
      const r = this.rects.get(id);
      return r ? (r.x + r.width / 2 - cx) ** 2 + (r.y + r.height / 2 - cy) ** 2 : Infinity;
    };
    missing.sort((a, b) => distance(a) - distance(b));
    for (const id of missing.slice(RENDER_BUDGET)) ids.delete(id);
    this.scheduleFrame();
    return { ids, skeleton: true };
  }

  private reconcile(): void {
    const layout = this.layout;
    if (!layout) return;
    const { ids, skeleton } = this.wanted(layout);
    const next = new Map(
      layout.nodes.filter((p) => ids.has(p.node.id)).map((p) => [p.node.id, p.node]),
    );
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
    for (const positioned of layout.nodes) {
      if (next.has(positioned.node.id)) this.placeNode(positioned, pool);
    }
    for (const list of pool.values()) for (const contentEl of list) this.hooks.release(contentEl);
    this.placeToggles(layout, this.collapse);
    this.drawSkeleton(layout, skeleton);
    this.keepHighlightOnTop();
  }

  /** All node rects as one path: the map's shape at a zoom where text is unreadable. */
  private drawSkeleton(layout: MapLayout, show: boolean): void {
    const svg = this.edgesEl;
    const existing = svg?.querySelector('.mind-mapper-skeleton');
    if (!show || !svg) {
      existing?.remove();
      return;
    }
    if (existing) return;
    this.skeletonD ??= layout.nodes
      .map((p) => `M ${p.x} ${p.y} h ${p.width} v ${p.height} h ${-p.width} Z`)
      .join(' ');
    const path = this.worldEl.doc.createElementNS(SVG_NS, 'path');
    path.classList.add('mind-mapper-skeleton');
    path.setAttribute('d', this.skeletonD);
    // Above the edges, below cross-links (appended later).
    const firstCrossLink = svg.querySelector('.mind-mapper-crosslink');
    svg.insertBefore(path, firstCrossLink);
  }

  /**
   * Dashed lines for same-note links (spec "Links"); replaces the previous ones. Each line is
   * followed by a wide invisible hit path that takes the clicks (issue #21). A highlighted link
   * stays highlighted while a link with the same ends is drawn.
   */
  setCrossLinks(links: CrossLink[]): void {
    const svg = this.edgesEl;
    if (!svg) return;
    const old = svg.querySelectorAll('.mind-mapper-crosslink, .mind-mapper-crosslink-hit');
    for (const el of Array.from(old)) el.remove();
    this.linkHits.clear();
    this.linkLines.clear();
    const doc = this.worldEl.doc;
    let highlighted: CrossLink | null = null;
    for (const link of links) {
      const from = this.rects.get(link.fromId);
      const to = this.rects.get(link.toId);
      if (!from || !to) continue;
      const d = crossLinkPath(from, to);
      const path = doc.createElementNS(SVG_NS, 'path');
      path.classList.add('mind-mapper-crosslink');
      path.setAttribute('d', d);
      svg.appendChild(path);
      const hit = doc.createElementNS(SVG_NS, 'path');
      hit.classList.add('mind-mapper-crosslink-hit');
      hit.setAttribute('d', d);
      hit.setAttribute('data-from-id', link.fromId);
      hit.setAttribute('data-to-id', link.toId);
      svg.appendChild(hit);
      this.linkHits.set(hit, link);
      this.linkLines.set(linkKey(link), path);
      if (this.highlighted && linkKey(this.highlighted) === linkKey(link)) highlighted = link;
    }
    this.setHighlightedLink(highlighted);
  }

  /** The cross-link whose hit path `target` is, else null. */
  crossLinkAt(target: EventTarget | null): CrossLink | null {
    return (target && this.linkHits.get(target)) ?? null;
  }

  get highlightedLink(): CrossLink | null {
    return this.highlighted;
  }

  /**
   * Link highlight (issue #21), its own state next to the node selection: both end nodes get
   * `is-link-end` (kept for nodes created later), the line `is-highlighted`. Only drawn links.
   */
  setHighlightedLink(link: CrossLink | null): void {
    for (const id of this.linkEndIds()) this.nodes.get(id)?.el.removeClass('is-link-end');
    for (const line of this.linkLines.values()) line.classList.remove('is-highlighted');
    const line = link && this.linkLines.get(linkKey(link));
    this.highlighted = line ? link : null;
    this.drawHighlight(line?.getAttribute('d') ?? null);
    if (!line) return;
    line.classList.add('is-highlighted');
    for (const id of this.linkEndIds()) this.nodes.get(id)?.el.addClass('is-link-end');
  }

  /** The copy of the highlighted line above the nodes; removed when nothing is highlighted. */
  private drawHighlight(d: string | null): void {
    if (d === null) {
      this.highlightEl?.remove();
      this.highlightEl = null;
      return;
    }
    if (!this.highlightEl) {
      const doc = this.worldEl.doc;
      this.highlightEl = doc.createElementNS(SVG_NS, 'svg');
      this.highlightEl.classList.add('mind-mapper-highlight-layer');
      const path = doc.createElementNS(SVG_NS, 'path');
      path.classList.add('mind-mapper-crosslink-highlight');
      this.highlightEl.appendChild(path);
    }
    this.highlightEl.firstElementChild?.setAttribute('d', d);
    this.keepHighlightOnTop();
  }

  /** Nodes and toggles created later (culling, re-layout) are appended: move the layer after them. */
  private keepHighlightOnTop(): void {
    const el = this.highlightEl;
    if (el && this.worldEl.lastChild !== el) this.worldEl.appendChild(el);
  }

  private linkEndIds(): string[] {
    return this.highlighted ? [this.highlighted.fromId, this.highlighted.toId] : [];
  }

  /**
   * Spec "Colour themes": one class on the canvas picks the palette; nodes and edges carry their
   * palette colour (`data-branch`) and emphasis (`data-level`), so a switch only rewrites
   * attributes (no re-render, no re-layout: every theme has the same node sizes).
   */
  setTheme(name: MapThemeName): void {
    if (name === this.theme) return;
    this.canvasEl.removeClass(themeClass(this.theme));
    this.theme = name;
    this.canvasEl.addClass(themeClass(name));
    for (const [id, dom] of this.nodes) {
      const rect = this.rects.get(id);
      if (rect) this.setBranch(dom.el, rect.branch);
    }
    this.layout?.edges.forEach((edge, i) => {
      const path = this.edgePaths[i];
      if (path) this.setBranch(path, this.rects.get(edge.toId)?.branch ?? -1);
    });
  }

  /** `data-branch` in the current theme; written only when it changes (reconcile runs per frame). */
  private setBranch(el: Element, branch: number): void {
    setAttr(el, 'data-branch', branchAttr(branch, this.theme));
  }

  /** `is-selected` on the node with this ID (kept for nodes created later). */
  setSelected(id: string | null): void {
    if (this.selectedId !== null) this.nodes.get(this.selectedId)?.el.removeClass('is-selected');
    this.selectedId = id;
    if (id !== null) this.nodes.get(id)?.el.addClass('is-selected');
  }

  setTransform(t: Transform): void {
    this.transform = t;
    this.worldEl.style.transform = transformCss(t);
    if (this.culling) this.scheduleFrame();
  }

  /** At most one culling pass per animation frame. */
  private scheduleFrame(): void {
    if (this.frame !== null) return;
    this.frame = this.canvasEl.win.requestAnimationFrame(() => {
      this.frame = null;
      this.updateVisible();
    });
  }

  /** `is-clipped` shows the expand button; `is-clipped-x` / `-y` fade the overflowing edge. */
  setClipped(id: string, clip: Clip): void {
    this.clips.set(id, clip);
    const el = this.nodes.get(id)?.el;
    if (el) this.applyClip(el, clip);
  }

  private applyClip(el: HTMLElement, clip: Clip): void {
    el.toggleClass('is-clipped', clip.x || clip.y);
    el.toggleClass('is-clipped-x', clip.x);
    el.toggleClass('is-clipped-y', clip.y);
  }

  contentElements(): ReadonlyMap<string, HTMLElement> {
    return new Map([...this.nodes].map(([id, dom]) => [id, dom.contentEl]));
  }

  /** Releases all node content (view close). */
  clear(): void {
    if (this.frame !== null) this.canvasEl.win.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.layout = null;
    this.index = null;
    this.clips.clear();
    for (const dom of this.nodes.values()) this.hooks.release(dom.contentEl);
    this.nodes.clear();
    this.toggles.clear();
    this.worldEl.empty();
    this.edgesEl = null;
    this.edgePaths = [];
    this.linkHits.clear();
    this.linkLines.clear();
    this.highlighted = null;
    this.highlightEl = null;
  }

  /** Edge paths are reused across layouts (a re-layout of a large map only updates `d`). */
  private renderEdges(layout: MapLayout): void {
    const doc = this.worldEl.doc;
    let svg = this.edgesEl;
    if (!svg) {
      svg = doc.createElementNS(SVG_NS, 'svg');
      svg.classList.add('mind-mapper-edges');
      insertFirst(this.worldEl, svg);
      this.edgesEl = svg;
      this.edgePaths = [];
    }
    // The skeleton belongs to the previous layout.
    svg.querySelector('.mind-mapper-skeleton')?.remove();
    const firstCrossLink = svg.querySelector('.mind-mapper-crosslink');
    while (this.edgePaths.length > layout.edges.length) this.edgePaths.pop()?.remove();
    layout.edges.forEach((edge, i) => {
      let path = this.edgePaths[i];
      if (!path) {
        path = doc.createElementNS(SVG_NS, 'path');
        path.classList.add('mind-mapper-edge');
        svg.insertBefore(path, firstCrossLink);
        this.edgePaths.push(path);
      }
      path.setAttribute('d', edgePath(edge));
      // Colour themes: the edge takes the level and branch of the node it leads into.
      const to = this.rects.get(edge.toId);
      setAttr(path, 'data-level', levelAttr(to?.depth ?? 0));
      this.setBranch(path, to?.branch ?? -1);
    });
    this.renderDividers(layout, svg);
  }

  /** Spec "Dividers": few per map, so they are simply redrawn; above the edges, below cross-links. */
  private renderDividers(layout: MapLayout, svg: SVGSVGElement): void {
    for (const old of Array.from(svg.querySelectorAll('.mind-mapper-divider'))) old.remove();
    const firstCrossLink = svg.querySelector('.mind-mapper-crosslink');
    for (const { from, to } of layout.dividers) {
      const path = this.worldEl.doc.createElementNS(SVG_NS, 'path');
      path.classList.add('mind-mapper-divider');
      path.setAttribute('d', `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
      svg.insertBefore(path, firstCrossLink);
    }
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
    for (const { node, x, y, width, height, childSide } of layout.nodes) {
      // The root is never collapsed (a circle root grows on both sides); culled nodes have none.
      if (node.kind === 'root' || !this.nodes.has(node.id)) continue;
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
      toggle.setAttribute('aria-label', t(collapsed ? 'expandNode' : 'collapseNode'));
      // Middle of the child-side edge; CSS moves it just outside the node.
      const at = {
        right: { left: x + width, top: y + height / 2 },
        left: { left: x, top: y + height / 2 },
        bottom: { left: x + width / 2, top: y + height },
        top: { left: x + width / 2, top: y },
      }[childSide];
      for (const side of SIDES) toggle.toggleClass(`is-side-${side}`, side === childSide);
      toggle.style.left = `${at.left}px`;
      toggle.style.top = `${at.top}px`;
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
    { node, x, y, width, height, depth, branch, align }: PositionedNode,
    pool: Map<string, HTMLElement[]>,
  ): void {
    let dom = this.nodes.get(node.id);
    if (!dom) {
      dom = this.createNode(node, pool.get(node.markdown)?.shift());
      this.nodes.set(node.id, dom);
      dom.el.toggleClass('is-selected', node.id === this.selectedId);
      dom.el.toggleClass('is-link-end', this.linkEndIds().includes(node.id));
      const clip = this.clips.get(node.id);
      if (clip) this.applyClip(dom.el, clip);
    } else if (dom.node.markdown !== node.markdown) {
      // Old content was pooled (setLayout). Fresh content element: a still running render of the old
      // markdown cannot write into it.
      const reused = pool.get(node.markdown)?.shift();
      if (reused) insertFirst(dom.el, reused);
      dom.contentEl = reused ?? this.createContent(dom.el, node);
      dom.node = node;
    } else {
      dom.node = node;
    }
    const { el } = dom;
    el.toggleClass('is-root', node.kind === 'root');
    // Colour themes: blocks keep a border at every level instead of becoming plain text.
    el.toggleClass('is-block', node.kind === 'block' || isImageOnly(node.markdown));
    // Text flush towards the parent (styles.css applies it to text nodes only, not to blocks).
    for (const a of ALIGNS) el.toggleClass(`is-align-${a}`, a === align);
    setAttr(el, 'data-level', levelAttr(depth));
    this.setBranch(el, branch);
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
      insertFirst(el, reused);
      contentEl = reused;
    } else {
      contentEl = this.createContent(el, node);
    }
    const expand = el.createEl('button', {
      cls: 'mind-mapper-node-expand clickable-icon',
      attr: { 'aria-label': t('showFullContent') },
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
    insertFirst(nodeEl, contentEl);
    nodeEl.removeClass('is-render-error');
    this.hooks.render(node, contentEl);
    return contentEl;
  }
}

/** Identity of a drawn cross-link: its ends (drawn links are unique by ends). */
function linkKey(link: CrossLink): string {
  return `${link.fromId}\n${link.toId}`;
}

/** Sets or removes an attribute, only when it changes (reconcile runs per frame). */
function setAttr(el: Element, name: string, value: string | null): void {
  if (el.getAttribute(name) === value) return;
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

/**
 * `parent.prepend(child)` without `prepend`: in popout windows of older Obsidian versions (1.7.4)
 * `prepend` turned the element into the text "[object HTMLDivElement]". `insertBefore` only takes
 * nodes.
 */
function insertFirst(parent: Element, child: Node): void {
  parent.insertBefore(child, parent.firstChild);
}
