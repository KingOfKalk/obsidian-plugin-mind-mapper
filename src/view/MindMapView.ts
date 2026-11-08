import {
  type EventRef,
  type HoverParent,
  type HoverPopover,
  ItemView,
  type ViewStateResult,
} from 'obsidian';
import { VIEW_ICON, VIEW_TYPE_MIND_MAP } from '../constants';
import { anchoredTransform, nearestNode } from '../layout/anchor';
import { estimateSize, measuredSize } from '../layout/nodeSize';
import { SizeCache } from '../layout/sizeCache';
import { DEFAULT_LAYOUT, layoutTree } from '../layout/tidyTree';
import type { MapLayout, Size } from '../layout/types';
import { toParserInput } from '../parser/adapter';
import { buildTree } from '../parser/buildTree';
import type { MindMapTree } from '../parser/types';
import { DomMapRenderer } from '../render/DomMapRenderer';
import { NodeContentModal } from '../render/NodeContentModal';
import { NodeContentRenderer } from '../render/NodeContentRenderer';
import { attachLinkHandling } from '../render/linkHandling';
import { type MapActions, MapControls } from '../render/MapControls';
import { attachPanZoom, type PanZoomTarget } from '../render/panZoomInput';
import {
  fitToBounds,
  IDENTITY,
  resetZoom,
  type Transform,
  ZOOM_STEP,
  zoomAt,
} from '../render/viewport';
import { fileBasename, parseViewState } from './viewState';

const RELAYOUT_DEBOUNCE_MS = 100;
const NO_CLIP = { x: false, y: false };

interface MapDom {
  placeholderEl: HTMLElement;
  renderer: DomMapRenderer;
  controls: MapControls;
}

export class MindMapView extends ItemView implements MapActions, PanZoomTarget, HoverParent {
  /** Page preview attaches its popover here (HoverParent). */
  hoverPopover: HoverPopover | null = null;
  private pinnedFile: string | null = null;
  private dom: MapDom | null = null;
  private layout: MapLayout | null = null;
  private transform: Transform = IDENTITY;
  private pendingFit = true;
  /** Incremented on every load; an async load that is no longer current is discarded. */
  private generation = 0;
  private cacheWait: EventRef | null = null;
  private readonly content = new NodeContentRenderer(this.app, () => this.pinnedFile ?? '', this);
  private tree: MindMapTree | null = null;
  private readonly sizes = new SizeCache();
  private observer: ResizeObserver | null = null;
  /** Observed content element -> node id. */
  private readonly observed = new Map<Element, string>();
  private relayoutTimer: number | null = null;
  private relayoutOnResize = false;
  /** True while the transform is an (automatic or requested) fit the user has not changed since. */
  private fitted = false;

  get file(): string | null {
    return this.pinnedFile;
  }

  getViewType(): string {
    return VIEW_TYPE_MIND_MAP;
  }

  override getIcon(): string {
    return VIEW_ICON;
  }

  getDisplayText(): string {
    return this.pinnedFile === null ? 'Mind map' : fileBasename(this.pinnedFile);
  }

  override async onOpen(): Promise<void> {
    this.pendingFit = true;
    await this.loadNote();
  }

  override async onClose(): Promise<void> {
    this.generation++;
    this.stopWaitingForCache();
    this.cancelRelayout();
    this.observer?.disconnect();
    this.observer = null;
    this.observed.clear();
    this.tree = null;
    this.layout = null;
    this.dom?.renderer.clear();
    this.content.releaseAll();
    await super.onClose();
  }

  override getState(): Record<string, unknown> {
    return { ...super.getState(), file: this.pinnedFile };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const file = parseViewState(state).file;
    if (file !== this.pinnedFile) this.pendingFit = true;
    this.pinnedFile = file;
    await super.setState(state, result);
    await this.loadNote();
  }

  override onResize(): void {
    if (this.relayoutOnResize) this.relayout();
    if (this.pendingFit) this.tryFit();
  }

  getTransform(): Transform {
    return this.transform;
  }

  /** User-driven transform (pan, zoom, commands): later re-layouts anchor instead of re-fitting. */
  setTransform(t: Transform): void {
    this.fitted = false;
    this.applyTransform(t);
  }

  private applyTransform(t: Transform): void {
    this.transform = t;
    this.dom?.renderer.setTransform(t);
    this.dom?.controls.setZoom(t.zoom);
  }

  zoomIn(): void {
    this.setTransform(zoomAt(this.transform, ZOOM_STEP, this.center()));
  }

  zoomOut(): void {
    this.setTransform(zoomAt(this.transform, 1 / ZOOM_STEP, this.center()));
  }

  resetZoom(): void {
    this.setTransform(resetZoom(this.transform, this.size()));
  }

  fitToView(): void {
    this.pendingFit = true;
    this.tryFit();
  }

  private async loadNote(): Promise<void> {
    const generation = ++this.generation;
    this.stopWaitingForCache();
    const path = this.pinnedFile;
    if (path === null) return this.showMessage('No note selected');

    const file = this.app.vault.getFileByPath(path);
    if (!file) return this.showMessage(`Note not found: ${path}`);

    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) {
      this.showMessage('Loading…');
      this.waitForCache(path);
      return;
    }

    const text = await this.app.vault.cachedRead(file);
    if (generation !== this.generation) return;
    this.tree = buildTree(toParserInput(cache, text), file.basename);
    this.showLayout(this.computeLayout(this.tree));
  }

  /** Measured size if known (size cache), else the instant estimate. */
  private computeLayout(tree: MindMapTree): MapLayout {
    return layoutTree(tree, {
      siblingGap: DEFAULT_LAYOUT.siblingGap,
      levelGap: DEFAULT_LAYOUT.levelGap,
      nodeSize: (node) => this.sizes.get(node)?.size ?? estimateSize(node),
    });
  }

  /** The cache is not ready yet (e.g. at startup): render once on the first `changed` event. */
  private waitForCache(path: string): void {
    const ref = this.app.metadataCache.on('changed', (file) => {
      if (file.path !== path) return;
      this.stopWaitingForCache();
      void this.loadNote();
    });
    this.cacheWait = ref;
    this.registerEvent(ref);
  }

  private stopWaitingForCache(): void {
    if (!this.cacheWait) return;
    this.app.metadataCache.offref(this.cacheWait);
    this.cacheWait = null;
  }

  private ensureDom(): MapDom {
    if (this.dom) return this.dom;
    this.contentEl.empty();
    this.contentEl.addClass('mind-mapper-view');
    const renderer = new DomMapRenderer(this.contentEl, {
      render: (node, contentEl) => void this.content.render(node, contentEl),
      release: (contentEl) => {
        this.observer?.unobserve(contentEl);
        this.observed.delete(contentEl);
        this.content.release(contentEl);
      },
      expand: (node) =>
        new NodeContentModal(this.app, node, {
          sourcePath: () => this.pinnedFile ?? '',
          hoverParent: this,
          mapLeaf: this.leaf,
        }).open(),
    });
    const controls = new MapControls(renderer.canvasEl, this);
    const placeholderEl = this.contentEl.createDiv({ cls: 'mind-mapper-placeholder' });
    attachPanZoom(this, renderer.canvasEl, this);
    attachLinkHandling(renderer.canvasEl, {
      app: this.app,
      events: this,
      hoverParent: this,
      mapLeaf: this.leaf,
      sourcePath: () => this.pinnedFile ?? '',
    });
    this.registerEvent(
      this.app.workspace.on('css-change', () => this.measure([...this.observed.keys()])),
    );
    this.dom = { placeholderEl, renderer, controls };
    this.applyTransform(this.transform);
    return this.dom;
  }

  private showMessage(text: string): void {
    const dom = this.ensureDom();
    this.cancelRelayout();
    this.tree = null;
    this.layout = null;
    dom.renderer.clear();
    dom.renderer.canvasEl.hidden = true;
    dom.placeholderEl.setText(text);
    dom.placeholderEl.hidden = false;
  }

  private showLayout(layout: MapLayout): void {
    const dom = this.ensureDom();
    this.layout = layout;
    dom.renderer.setLayout(layout);
    dom.placeholderEl.hidden = true;
    dom.renderer.canvasEl.hidden = false;
    for (const { node } of layout.nodes) {
      dom.renderer.setClipped(node.id, this.sizes.get(node)?.clip ?? NO_CLIP);
    }
    this.observeContent(dom.renderer.contentElements());
    if (this.pendingFit) this.tryFit();
  }

  /** One ResizeObserver (from the view's own window, popout safe) for all node contents. */
  private observeContent(contents: ReadonlyMap<string, HTMLElement>): void {
    const win = this.contentEl.win as Window & typeof globalThis;
    this.observer ??= new win.ResizeObserver((entries) =>
      this.measure(entries.map((e) => e.target)),
    );
    for (const [id, el] of contents) {
      if (this.observed.get(el) === id) continue;
      this.observed.set(el, id);
      this.observer.observe(el);
    }
  }

  /** Reads rendered content sizes; a change schedules a debounced re-layout. */
  private measure(elements: Element[]): void {
    if (!this.layout || !this.dom) return;
    // A hidden tab (display: none) reports 0 x 0 for everything; keep the measured sizes.
    const { width, height } = this.size();
    if (width === 0 || height === 0) return;
    const nodes = new Map(this.layout.nodes.map((p) => [p.node.id, p.node]));
    let changed = false;
    for (const el of elements) {
      const id = this.observed.get(el);
      const node = id === undefined ? undefined : nodes.get(id);
      // instanceOf, not instanceof: works for nodes of popout windows too.
      if (!node || !el.instanceOf(HTMLElement)) continue;
      // Not laid out (yet): no real size to take.
      if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
      const measured = measuredSize(el);
      if (this.sizes.set(node, measured)) changed = true;
      this.dom.renderer.setClipped(node.id, measured.clip);
    }
    if (changed) this.scheduleRelayout();
  }

  private scheduleRelayout(): void {
    this.cancelRelayout();
    this.relayoutTimer = this.contentEl.win.setTimeout(() => {
      this.relayoutTimer = null;
      this.relayout();
    }, RELAYOUT_DEBOUNCE_MS);
  }

  private cancelRelayout(): void {
    if (this.relayoutTimer === null) return;
    this.contentEl.win.clearTimeout(this.relayoutTimer);
    this.relayoutTimer = null;
  }

  /** Re-layout with measured sizes: re-fit while still fitted, else keep the node nearest the center in place. */
  private relayout(): void {
    if (!this.tree || !this.layout) return;
    const { width, height } = this.size();
    if (width === 0 || height === 0) {
      // Hidden tab: no viewport to anchor in; run on the next resize with a real size.
      this.relayoutOnResize = true;
      return;
    }
    this.relayoutOnResize = false;
    const previous = this.layout;
    const center = this.center();
    const anchor = nearestNode(previous, {
      x: (center.x - this.transform.x) / this.transform.zoom,
      y: (center.y - this.transform.y) / this.transform.zoom,
    });
    const next = this.computeLayout(this.tree);
    this.showLayout(next);
    if (this.fitted) {
      this.fitToView();
      return;
    }
    const moved = anchor && next.nodes.find((p) => p.node.id === anchor.node.id);
    if (anchor && moved) this.applyTransform(anchoredTransform(this.transform, anchor, moved));
  }

  /** Fits once the view has a real size; a hidden tab keeps the fit pending for `onResize`. */
  private tryFit(): void {
    if (!this.layout) return;
    const fitted = fitToBounds(this.layout.bounds, this.size());
    if (!fitted) return;
    this.pendingFit = false;
    this.applyTransform(fitted);
    this.fitted = true;
  }

  /** The canvas is the coordinate space of the transform (the view itself may have padding). */
  private size(): Size {
    const canvas = this.dom?.renderer.canvasEl;
    return canvas
      ? { width: canvas.clientWidth, height: canvas.clientHeight }
      : { width: 0, height: 0 };
  }

  private center(): { x: number; y: number } {
    const { width, height } = this.size();
    return { x: width / 2, y: height / 2 };
  }
}
