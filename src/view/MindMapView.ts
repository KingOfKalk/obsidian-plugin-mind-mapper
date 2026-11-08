import { type EventRef, ItemView, type ViewStateResult } from 'obsidian';
import { VIEW_ICON, VIEW_TYPE_MIND_MAP } from '../constants';
import { DEFAULT_LAYOUT, layoutTree } from '../layout/tidyTree';
import type { MapLayout, Size } from '../layout/types';
import { toParserInput } from '../parser/adapter';
import { buildTree } from '../parser/buildTree';
import { DomMapRenderer } from '../render/DomMapRenderer';
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

interface MapDom {
  placeholderEl: HTMLElement;
  renderer: DomMapRenderer;
  controls: MapControls;
}

export class MindMapView extends ItemView implements MapActions, PanZoomTarget {
  private pinnedFile: string | null = null;
  private dom: MapDom | null = null;
  private layout: MapLayout | null = null;
  private transform: Transform = IDENTITY;
  private pendingFit = true;
  /** Incremented on every load; an async load that is no longer current is discarded. */
  private generation = 0;
  private cacheWait: EventRef | null = null;

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
    if (this.pendingFit) this.tryFit();
  }

  getTransform(): Transform {
    return this.transform;
  }

  setTransform(t: Transform): void {
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
    const tree = buildTree(toParserInput(cache, text), file.basename);
    this.showLayout(
      layoutTree(tree, {
        siblingGap: DEFAULT_LAYOUT.siblingGap,
        levelGap: DEFAULT_LAYOUT.levelGap,
        nodeSize: () => ({ width: DEFAULT_LAYOUT.nodeWidth, height: DEFAULT_LAYOUT.nodeHeight }),
      }),
    );
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
    const renderer = new DomMapRenderer(this.contentEl);
    const controls = new MapControls(renderer.canvasEl, this);
    const placeholderEl = this.contentEl.createDiv({ cls: 'mind-mapper-placeholder' });
    attachPanZoom(this, renderer.canvasEl, this);
    this.dom = { placeholderEl, renderer, controls };
    this.setTransform(this.transform);
    return this.dom;
  }

  private showMessage(text: string): void {
    const dom = this.ensureDom();
    this.layout = null;
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
    if (this.pendingFit) this.tryFit();
  }

  /** Fits once the view has a real size; a hidden tab keeps the fit pending for `onResize`. */
  private tryFit(): void {
    if (!this.layout) return;
    const fitted = fitToBounds(this.layout.bounds, this.size());
    if (!fitted) return;
    this.pendingFit = false;
    this.setTransform(fitted);
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
