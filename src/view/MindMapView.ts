import {
  type CachedMetadata,
  type EventRef,
  type HoverParent,
  type HoverPopover,
  ItemView,
  type KeymapEventHandler,
  Notice,
  Scope,
  type TFile,
  type ViewStateResult,
  type WorkspaceLeaf,
} from 'obsidian';
import { VIEW_ICON, VIEW_TYPE_MIND_MAP } from '../constants';
import { anchoredTransform, nearestNode } from '../layout/anchor';
import { estimateSize, limitsFor, measuredSize, type NodeLimits } from '../layout/nodeSize';
import { SizeCache } from '../layout/sizeCache';
import { visibleTree } from '../layout/visibleTree';
import { layoutTree } from '../layout/tidyTree';
import type { MapLayout, MapLayoutName, PositionedNode, Rect, Size } from '../layout/types';
import { worldViewport } from '../render/culling';
import { DEFAULT_SETTINGS, type MindMapSettings } from '../settings';
import { type CrossLink, crossLinks, visibleCrossLinks } from '../layout/crossLinks';
import { invalidOptionMessage, type MapOptions, readMapOptions } from './frontmatter';
import { crossLinkInputs } from './linkTargets';
import { toParserInput } from '../parser/adapter';
import { buildTree } from '../parser/buildTree';
import { allNodes, walk } from '../parser/treeWalk';
import type { MindMapTree } from '../parser/types';
import { type CollapseInfo, DomMapRenderer } from '../render/DomMapRenderer';
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
import { jumpToSource } from '../commands/jumpToSource';
import { t } from '../i18n';
import { CollapseState } from './collapseState';
import { FullScreen } from './fullScreen';
import { LeafRecency } from './leafRecency';
import { fileBasename, parseViewState } from './viewState';

/** What the plugin provides to each map view. */
export interface ViewServices {
  /** Which leaf was active last (jump to source, link clicks). */
  recency: LeafRecency;
  settings(): MindMapSettings;
  /** Shows `message` once per `id` for the session. */
  warnOnce(id: string, message: string): void;
}

const RELAYOUT_DEBOUNCE_MS = 100;
/** Spec "Live update": debounced about 300 ms. */
export const LIVE_UPDATE_DEBOUNCE_MS = 300;
const NO_CLIP = { x: false, y: false };

/**
 * The node to keep in place across a re-layout, then its ancestors (nearest first), all as
 * positioned before: when a collapse hides the node, its nearest visible ancestor stays in place.
 */
type Anchor = PositionedNode[];

interface MapDom {
  placeholderEl: HTMLElement;
  /** "This note has no content yet" over the root-only map. */
  hintEl: HTMLElement;
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
  /** The one `changed` listener (live update, and the first render of a not yet indexed note). */
  private changeRef: EventRef | null = null;
  /** Vault rename / delete / create listeners. */
  private vaultRefs: EventRef[] = [];
  /** The pinned note was deleted; a note created at its path is shown again. */
  private deleted = false;
  private updateTimer: number | null = null;
  private readonly content = new NodeContentRenderer(this.app, () => this.pinnedFile ?? '', this);
  private tree: MindMapTree | null = null;
  private readonly sizes = new SizeCache(() => this.limits());
  private observer: ResizeObserver | null = null;
  /** Observed content element -> node id. */
  private readonly observed = new Map<Element, string>();
  private relayoutTimer: number | null = null;
  private relayoutOnResize = false;
  /** True while the transform is an (automatic or requested) fit the user has not changed since. */
  private fitted = false;
  private readonly collapse = new CollapseState();
  /**
   * Effective `mind-mapper-collapsed` (or setting) last applied to the shown note, null before the
   * first tree of a note: only a change of it collapses or expands all (spec "Collapse all mode").
   */
  private startCollapsed: boolean | null = null;
  /** Collapse toggles of the current layout. */
  private collapseInfo: CollapseInfo = { hidden: new Map(), hasChildren: () => false };
  private selected: string | null = null;
  /** Last non-zero canvas size (a hidden tab reports 0 x 0). */
  private lastSize: Size = { width: 0, height: 0 };

  private readonly services: ViewServices;
  /** Frontmatter of the shown note (`mind-mapper-layout` is read per layout). */
  private frontmatter: Record<string, unknown> | undefined = undefined;
  private readonly fullScreen = new FullScreen({
    contentEl: this.contentEl,
    title: () => this.getDisplayText(),
    onExit: () => this.exitFullScreen(),
  });
  /** Transform before entering full screen (restored on exit). */
  private beforeFullScreen: Transform | null = null;
  private escHandler: KeymapEventHandler | null = null;
  /** While in full screen: another active leaf (quick switcher, search, hover link) exits it. */
  private leafChangeRef: EventRef | null = null;
  /** Same-note links of the current tree (all nodes, before collapse). */
  private links: CrossLink[] = [];
  /** Layout of the current map; a different effective layout fits once. */
  private layoutName: MapLayoutName | null = null;

  constructor(leaf: WorkspaceLeaf, services: Partial<ViewServices> = {}) {
    super(leaf);
    const shown = new Set<string>();
    this.services = {
      recency: services.recency ?? new LeafRecency(),
      settings: services.settings ?? (() => DEFAULT_SETTINGS),
      warnOnce:
        services.warnOnce ??
        ((id, message) => {
          if (shown.has(id)) return;
          shown.add(id);
          new Notice(message);
        }),
    };
  }

  private get recency(): LeafRecency {
    return this.services.recency;
  }

  private limits(): NodeLimits {
    const settings = this.services.settings();
    return limitsFor(settings.maxNodeWidth, settings.maxNodeHeight);
  }

  /** Frontmatter options of the shown note, plugin settings as defaults. */
  private mapOptions(): MapOptions {
    const { defaultLayout, startCollapsed, defaultTheme } = this.services.settings();
    return readMapOptions(this.frontmatter, defaultLayout, startCollapsed, defaultTheme);
  }

  /** Frontmatter `mind-mapper-layout`, else the plugin setting. */
  private effectiveLayout(): MapLayoutName {
    return this.mapOptions().layout;
  }

  /**
   * Applies `mind-mapper-collapsed` (else the setting) to `tree` when it differs from the value
   * applied last: a note's first tree starts collapsed, a flip runs "Collapse all" or "Expand all".
   * Otherwise the user's collapse state stays.
   */
  private applyStartCollapsed(tree: MindMapTree): void {
    const collapsed = this.mapOptions().collapsed;
    if (collapsed === this.startCollapsed) return;
    const first = this.startCollapsed === null;
    this.startCollapsed = collapsed;
    if (collapsed) this.collapse.collapseAll(tree);
    else if (!first) this.collapse.expandAll();
  }

  private layoutWillChange(): boolean {
    return this.layoutName !== null && this.effectiveLayout() !== this.layoutName;
  }

  /** Tree of the note with frontmatter options; ignored values are reported (once, by the plugin). */
  private parse(file: TFile, cache: CachedMetadata, text: string): MindMapTree {
    this.frontmatter = cache.frontmatter;
    const options = this.mapOptions();
    for (const { key, value } of options.invalid) {
      this.services.warnOnce(
        `${file.path}\0${key}\0${value}`,
        invalidOptionMessage(key, value, file.path, options),
      );
    }
    const tree = buildTree(toParserInput(cache, text), file.basename, options.title);
    const resolve = (linkpath: string, source: string): string | null =>
      this.app.metadataCache.getFirstLinkpathDest(linkpath, source)?.path ?? null;
    this.links = crossLinks(tree, crossLinkInputs(cache, file.path, resolve));
    return tree;
  }

  /** Max node size as CSS custom properties (content caps in styles.css). */
  private applyCssLimits(): void {
    const { maxWidth, maxHeight } = this.limits();
    this.contentEl.style.setProperty('--mind-mapper-node-max-width', `${maxWidth}px`);
    this.contentEl.style.setProperty('--mind-mapper-node-max-height', `${maxHeight}px`);
  }

  get file(): string | null {
    return this.pinnedFile;
  }

  get selectedId(): string | null {
    return this.selected;
  }

  select(id: string | null): void {
    this.selected = id;
    this.dom?.renderer.setSelected(id);
  }

  get isFullScreen(): boolean {
    return this.fullScreen.active;
  }

  toggleFullScreen(): void {
    if (this.fullScreen.active) this.exitFullScreen();
    else this.enterFullScreen();
  }

  /** Spec "Full screen": entering fits, Esc (after modals, via the view scope) exits. */
  private enterFullScreen(): void {
    if (this.fullScreen.active || !this.dom) return;
    this.beforeFullScreen = this.transform;
    this.fullScreen.enter();
    this.scope ??= new Scope(this.app.scope);
    this.escHandler = this.scope.register([], 'Escape', () => {
      this.exitFullScreen();
      return false;
    });
    // The overlay hides the workspace: a note opened by anything else would end up behind it, and
    // Esc (this view's scope) only works while this leaf is active.
    this.leafChangeRef = this.app.workspace.on('active-leaf-change', (leaf) => {
      if (leaf !== this.leaf) this.exitFullScreen();
    });
    this.registerEvent(this.leafChangeRef);
    this.fitToView();
  }

  /** Restores the transform from before full screen. */
  exitFullScreen(): void {
    if (!this.fullScreen.active) return;
    this.fullScreen.exit();
    if (this.escHandler) this.scope?.unregister(this.escHandler);
    this.escHandler = null;
    if (this.leafChangeRef) this.app.workspace.offref(this.leafChangeRef);
    this.leafChangeRef = null;
    if (this.beforeFullScreen) this.setTransform(this.beforeFullScreen);
    this.beforeFullScreen = null;
  }

  /** Selects the root and centres it at the current zoom. */
  backToRoot(): void {
    const root = this.tree && this.layout?.nodes.find((p) => p.node.id === this.tree?.root.id);
    if (!root) return;
    this.select(root.node.id);
    const center = this.center();
    const { zoom } = this.transform;
    this.setTransform({
      x: center.x - (root.x + root.width / 2) * zoom,
      y: center.y - (root.y + root.height / 2) * zoom,
      zoom,
    });
  }

  /** Double click: the source line in the editor (spec "Jump to source target"). */
  private jumpTo(line: number | null): void {
    const path = this.pinnedFile;
    if (path === null) return;
    this.exitFullScreen();
    jumpToSource(this.app, this.recency, this.leaf, path, line).catch((error: unknown) => {
      console.error('Mind Mapper: could not open the note', error);
      new Notice(t('couldNotOpenNote'));
    });
  }

  toggleCollapse(id: string): void {
    if (!this.layout) return;
    const anchor = this.layout.nodes.filter((p) => p.node.id === id);
    this.collapse.toggle(id);
    this.relayoutKeeping(anchor);
  }

  /** Frontmatter `mind-mapper-theme`, else the setting: pure CSS, no re-measure, no re-layout. */
  applyTheme(): void {
    this.dom?.renderer.setTheme(this.mapOptions().theme);
  }

  /** Plugin settings changed: a new layout fits once, other changes keep the viewport anchored. */
  refresh(): void {
    this.applyCssLimits();
    this.applyTheme();
    if (!this.layout || !this.tree) return;
    // A new max node size changes the size cache keys and the content caps: measure again now
    // (the ResizeObserver only fires for content whose size changes).
    this.measure([...this.observed.keys()]);
    this.applyStartCollapsed(this.tree);
    if (this.layoutWillChange()) {
      this.cancelRelayout();
      this.pendingFit = true;
      this.showLayout(this.computeLayout(this.tree));
      return;
    }
    this.relayoutKeeping(this.anchorIn(this.layout));
  }

  /** Root and first level stay visible. */
  collapseAll(): void {
    if (!this.tree || !this.layout) return;
    const anchor = this.anchorIn(this.layout);
    this.collapse.collapseAll(this.tree);
    this.relayoutKeeping(anchor);
  }

  expandAll(): void {
    if (!this.layout) return;
    const anchor = this.anchorIn(this.layout);
    this.collapse.expandAll();
    this.relayoutKeeping(anchor);
  }

  getViewType(): string {
    return VIEW_TYPE_MIND_MAP;
  }

  override getIcon(): string {
    return VIEW_ICON;
  }

  getDisplayText(): string {
    return this.pinnedFile === null ? t('viewTitle') : fileBasename(this.pinnedFile);
  }

  override async onOpen(): Promise<void> {
    this.pendingFit = true;
    await this.loadNote();
  }

  override async onClose(): Promise<void> {
    this.exitFullScreen();
    this.generation++;
    this.stopListening();
    this.cancelUpdate();
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

  /**
   * Obsidian fills the view header title once, when the view loads (before setState has set the
   * note), and only refreshes the tab. The API has no hook for the header title: set it ourselves.
   */
  private updateHeaderTitle(): void {
    const title = this.containerEl.querySelector('.view-header-title');
    if (title) title.textContent = this.getDisplayText();
  }

  override getState(): Record<string, unknown> {
    return { ...super.getState(), file: this.pinnedFile };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const file = parseViewState(state).file;
    if (file !== this.pinnedFile) {
      this.pendingFit = true;
      this.collapse.reset();
      this.startCollapsed = null;
    }
    this.pinnedFile = file;
    this.updateHeaderTitle();
    await super.setState(state, result);
    await this.loadNote();
  }

  override onResize(): void {
    this.dom?.renderer.updateVisible();
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
    this.deleted = false;
    this.cancelUpdate();
    this.listenForChanges();
    const path = this.pinnedFile;
    if (path === null) return this.showMessage(t('noNoteSelected'));

    const file = this.app.vault.getFileByPath(path);
    if (!file) return this.showMessage(t('noteNotFound', { path }));

    const cache = this.app.metadataCache.getFileCache(file);
    // Not indexed yet (e.g. at startup): the first `changed` event renders it.
    if (!cache) return this.showMessage(t('loading'));

    let text: string;
    try {
      text = await this.app.vault.cachedRead(file);
    } catch (error) {
      if (generation !== this.generation) return;
      console.error('Mind Mapper: could not read note', path, error);
      return this.showMessage(t('couldNotReadNote'));
    }
    if (generation !== this.generation) return;
    const tree = this.parse(file, cache, text);
    const previous = this.layout;
    if (this.layoutWillChange()) this.pendingFit = true;
    // Same note again (rename, recreate): keep the viewport like a live update.
    if (!previous || this.pendingFit) return this.showTree(tree);
    const anchor = this.anchorIn(previous);
    this.showTree(tree);
    this.fitted = false;
    this.keepInPlace(anchor);
  }

  /** Every new tree passes here, so the collapse state always follows the shown tree. */
  private showTree(tree: MindMapTree): void {
    this.collapse.update(this.tree, tree);
    this.applyStartCollapsed(tree);
    this.tree = tree;
    this.showLayout(this.computeLayout(tree));
  }

  /** Spec "Live update": the event's text matches its cache, no separate read. */
  private listenForChanges(): void {
    if (this.changeRef) return;
    this.listenToVault();
    this.changeRef = this.app.metadataCache.on('changed', (file, data, cache) => {
      if (file.path !== this.pinnedFile) return;
      // Nothing shown yet (loading): render at once.
      if (!this.tree) return this.applyChange(file, data, cache);
      this.cancelUpdate();
      this.updateTimer = this.contentEl.win.setTimeout(() => {
        this.updateTimer = null;
        this.applyChange(file, data, cache);
      }, LIVE_UPDATE_DEBOUNCE_MS);
    });
    this.registerEvent(this.changeRef);
  }

  private stopListening(): void {
    for (const ref of this.vaultRefs) this.app.vault.offref(ref);
    this.vaultRefs = [];
    if (!this.changeRef) return;
    this.app.metadataCache.offref(this.changeRef);
    this.changeRef = null;
  }

  /** Spec "View state": follow a rename, show a deleted note as such. */
  private listenToVault(): void {
    const { vault } = this.app;
    this.vaultRefs = [
      vault.on('rename', (file, oldPath) => {
        if (oldPath !== this.pinnedFile) return;
        // Set first: setState then sees the same file and keeps the viewport (no fit).
        this.pinnedFile = file.path;
        // Updates the tab title and the saved workspace (setState also refreshes the view header title).
        this.leaf
          .setViewState({ type: VIEW_TYPE_MIND_MAP, state: { file: file.path } })
          .catch((error: unknown) => console.error('Mind Mapper: rename failed', error));
      }),
      vault.on('delete', (file) => {
        if (file.path !== this.pinnedFile) return;
        this.deleted = true;
        this.generation++;
        this.cancelUpdate();
        this.showMessage(t('noteDeleted'));
      }),
      vault.on('create', (file) => {
        if (!this.deleted || file.path !== this.pinnedFile) return;
        void this.loadNote();
      }),
    ];
    for (const ref of this.vaultRefs) this.registerEvent(ref);
  }

  private cancelUpdate(): void {
    if (this.updateTimer === null) return;
    this.contentEl.win.clearTimeout(this.updateTimer);
    this.updateTimer = null;
  }

  /** New tree from the note; keeps the viewport anchored (never fits, except a fit still pending from opening). */
  private applyChange(file: TFile, data: string, cache: CachedMetadata): void {
    this.generation++; // a load still reading the file is outdated now
    this.cancelUpdate();
    this.cancelRelayout();
    const tree = this.parse(file, cache, data);
    const previous = this.layout;
    if (!previous || !this.tree) return this.showTree(tree);
    if (this.layoutWillChange()) this.pendingFit = true;
    const ids = new Set(allNodes(tree).map((node) => node.id));
    if (this.selected !== null && !ids.has(this.selected)) this.select(null);
    const anchor = this.anchorIn(previous);
    // Sizes of content that is gone; the cache would otherwise grow with every edit.
    this.sizes.retain(allNodes(tree));
    this.showTree(tree);
    if (this.pendingFit) return;
    this.fitted = false;
    this.keepInPlace(anchor);
  }

  /**
   * The node to keep in place across a re-layout: the selected node if it is on screen, else the
   * one nearest the view center (an off-screen selection would let the visible area jump).
   */
  private anchorIn(layout: MapLayout): Anchor {
    const selected = layout.nodes.find((p) => p.node.id === this.selected);
    const center = this.center();
    const node =
      selected && this.onScreen(selected)
        ? selected
        : nearestNode(layout, {
            x: (center.x - this.transform.x) / this.transform.zoom,
            y: (center.y - this.transform.y) / this.transform.zoom,
          });
    if (!node) return [];
    const positioned = new Map(layout.nodes.map((p) => [p.node.id, p]));
    const ancestors = this.ancestorIds(node.node.id).flatMap((id) => positioned.get(id) ?? []);
    return [node, ...ancestors];
  }

  /** IDs of the ancestors of `id` in the shown tree, nearest first. */
  private ancestorIds(id: string): string[] {
    if (!this.tree) return [];
    const parents = new Map<string, string>();
    walk(this.tree.root, (node) => {
      for (const child of node.children) parents.set(child.id, node.id);
    });
    const ids: string[] = [];
    for (let parent = parents.get(id); parent !== undefined; parent = parents.get(parent)) {
      ids.push(parent);
    }
    return ids;
  }

  private onScreen(rect: Rect): boolean {
    const current = this.size();
    const size = current.width > 0 && current.height > 0 ? current : this.lastSize;
    if (size.width === 0 || size.height === 0) return true;
    const view = worldViewport(this.transform, size, 0);
    return (
      rect.x < view.x + view.width &&
      view.x < rect.x + rect.width &&
      rect.y < view.y + view.height &&
      view.y < rect.y + rect.height
    );
  }

  /** Re-layout after a user action (collapse): no fit, the anchor keeps its screen position. */
  private relayoutKeeping(anchor: Anchor): void {
    if (!this.tree) return;
    this.cancelRelayout();
    this.showLayout(this.computeLayout(this.tree));
    this.fitted = false;
    this.pendingFit = false;
    this.keepInPlace(anchor);
  }

  /** The first anchor node still shown keeps its screen position. */
  private keepInPlace(anchor: Anchor): void {
    const positioned = new Map(this.layout?.nodes.map((p) => [p.node.id, p]));
    for (const before of anchor) {
      const after = positioned.get(before.node.id);
      if (!after) continue;
      this.applyTransform(anchoredTransform(this.transform, before, after));
      return;
    }
  }

  /** Measured size if known (size cache), else the instant estimate. */
  private computeLayout(tree: MindMapTree): MapLayout {
    const visible = visibleTree(tree, this.collapse);
    const parents = new Set(
      allNodes(tree)
        .filter((node) => node.children.length > 0)
        .map((node) => node.id),
    );
    this.collapseInfo = { hidden: visible.hidden, hasChildren: (id) => parents.has(id) };
    const settings = this.services.settings();
    const limits = this.limits();
    this.layoutName = this.effectiveLayout();
    return layoutTree(visible.tree, {
      siblingGap: settings.siblingGap,
      levelGap: settings.levelGap,
      nodeSize: (node) => this.sizes.get(node)?.size ?? estimateSize(node, limits),
      layout: this.layoutName,
    });
  }

  private ensureDom(): MapDom {
    if (this.dom) return this.dom;
    this.contentEl.empty();
    this.contentEl.addClass('mind-mapper-view');
    this.applyCssLimits();
    const renderer = new DomMapRenderer(
      this.contentEl,
      {
        render: (node, contentEl) => {
          void this.content.render(node, contentEl);
          // Content created by culling (panning, zooming) is measured like any other.
          this.observeContent(new Map([[node.id, contentEl]]));
        },
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
            recency: this.recency,
            onNavigate: () => this.exitFullScreen(),
          }).open(),
        open: (node) => this.jumpTo(node.line),
        select: (id) => this.select(id),
        toggle: (id) => this.toggleCollapse(id),
      },
      { culling: true },
    );
    const controls = new MapControls(renderer.canvasEl, this);
    const placeholderEl = this.contentEl.createDiv({ cls: 'mind-mapper-placeholder' });
    const hintEl = renderer.canvasEl.createDiv({
      cls: 'mind-mapper-hint',
      text: t('noContentYet'),
    });
    hintEl.hidden = true;
    attachPanZoom(this, renderer.canvasEl, this, () => this.select(null));
    attachLinkHandling(renderer.canvasEl, {
      app: this.app,
      events: this,
      hoverParent: this,
      mapLeaf: this.leaf,
      recency: this.recency,
      sourcePath: () => this.pinnedFile ?? '',
      onNavigate: () => this.exitFullScreen(),
    });
    this.registerEvent(
      this.app.workspace.on('css-change', () => this.measure([...this.observed.keys()])),
    );
    this.dom = { placeholderEl, hintEl, renderer, controls };
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
    // Shown first: culling needs the canvas size (a hidden canvas measures 0 x 0).
    dom.placeholderEl.hidden = true;
    dom.renderer.canvasEl.hidden = false;
    // Frontmatter edits arrive as a new layout; the theme itself is CSS only.
    this.applyTheme();
    dom.renderer.setLayout(layout, this.collapseInfo);
    this.selectShown(layout);
    dom.controls.setCollapsed(this.collapse.size > 0);
    if (this.tree) {
      const shown = new Set(layout.nodes.map((p) => p.node.id));
      dom.renderer.setCrossLinks(visibleCrossLinks(this.tree, this.links, shown));
    }
    dom.hintEl.hidden = (this.tree?.root.children.length ?? 0) > 0;
    for (const { node } of layout.nodes) {
      dom.renderer.setClipped(node.id, this.sizes.get(node)?.clip ?? NO_CLIP);
    }
    this.observeContent(dom.renderer.contentElements());
    if (this.pendingFit) this.tryFit();
  }

  /** A selected node hidden by a collapse passes the selection to its nearest visible ancestor. */
  private selectShown(layout: MapLayout): void {
    if (this.selected === null) return;
    const shown = new Set(layout.nodes.map((p) => p.node.id));
    if (shown.has(this.selected)) return;
    this.select(this.ancestorIds(this.selected).find((id) => shown.has(id)) ?? null);
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
      const measured = measuredSize(el, this.limits());
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
    const anchor = this.anchorIn(this.layout);
    this.showLayout(this.computeLayout(this.tree));
    if (this.fitted) {
      this.fitToView();
      return;
    }
    this.keepInPlace(anchor);
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
    const size = canvas
      ? { width: canvas.clientWidth, height: canvas.clientHeight }
      : { width: 0, height: 0 };
    if (size.width > 0 && size.height > 0) this.lastSize = size;
    return size;
  }

  /** Center of the canvas; a hidden tab (0 x 0) uses its last real size. */
  private center(): { x: number; y: number } {
    this.size();
    return { x: this.lastSize.width / 2, y: this.lastSize.height / 2 };
  }
}
