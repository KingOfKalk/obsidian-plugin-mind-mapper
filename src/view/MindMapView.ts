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
import { setElementId } from '../elementIds';
import { nearestNode } from '../layout/anchor';
import { estimateSize, limitsFor, type NodeLimits } from '../layout/nodeSize';
import { SizeCache } from '../layout/sizeCache';
import { visibleTree } from '../layout/visibleTree';
import { layoutTree } from '../layout/tidyTree';
import { LAYOUT_NAMES, type MapLayout, type MapLayoutName } from '../layout/types';
import { DEFAULT_SETTINGS, type MindMapSettings } from '../settings';
import type { TagPosition } from '../tagPositions';
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
import { type MapThemeName, THEME_NAMES } from '../themeNames';
import type { Transform } from '../render/viewport';
import { jumpToSource } from '../commands/jumpToSource';
import { t } from '../i18n';
import { CollapseState } from './collapseState';
import { drilledTree } from './drill';
import { DrillDown } from './drillDown';
import { type Anchor, Camera, centredAt } from './camera';
import { FullScreen } from './fullScreen';
import { NodeMeasurer } from './nodeMeasurer';
import { NoteWatcher } from './noteWatcher';
import { LeafRecency } from '../leafRecency';
import { fileBasename, type MindMapViewState, parseViewState } from './viewState';

/** What the plugin provides to each map view. */
export interface ViewServices {
  /** Which leaf was active last (jump to source, link clicks). */
  recency: LeafRecency;
  settings(): MindMapSettings;
  /** Shows `message` once per `id` for the session. */
  warnOnce(id: string, message: string): void;
}

export { LIVE_UPDATE_DEBOUNCE_MS } from './noteWatcher';
const NO_CLIP = { x: false, y: false };

interface MapDom {
  placeholderEl: HTMLElement;
  /** "This note has no content yet" over the root-only map. */
  hintEl: HTMLElement;
  /** Over the last good map while the note's newest version cannot be shown. */
  updateErrorEl: HTMLElement;
  renderer: DomMapRenderer;
  controls: MapControls;
}

export class MindMapView extends ItemView implements MapActions, PanZoomTarget, HoverParent {
  /** Page preview attaches its popover here (HoverParent). */
  hoverPopover: HoverPopover | null = null;
  private pinnedFile: string | null = null;
  private dom: MapDom | null = null;
  private layout: MapLayout | null = null;
  /** Incremented on every load; an async load that is no longer current is discarded. */
  private generation = 0;
  /** Live update and the note's rename / delete / re-create. */
  private readonly watcher = new NoteWatcher(this.app, {
    win: () => this.contentEl.win,
    path: () => this.pinnedFile,
    hasMap: () => this.tree !== null,
    register: (ref) => this.registerEvent(ref),
    changed: (file, data, cache) => this.applyChange(file, data, cache),
    renamed: (file, oldPath) => {
      // Set first: setState then sees the same file and keeps the viewport (no fit).
      this.pinnedFile = file.path;
      if (this.mapPath === oldPath) this.mapPath = file.path;
      // Updates the tab title and the saved workspace (setState also refreshes the view header title).
      this.leaf
        .setViewState({ type: VIEW_TYPE_MIND_MAP, state: { ...this.viewState() } })
        .catch((error: unknown) => console.error('Mind Mapper: rename failed', error));
    },
    deleted: () => {
      this.generation++;
      this.showMessage(t('noteDeleted'));
    },
    recreated: () => void this.loadNote(),
  });
  private readonly content = new NodeContentRenderer(this.app, () => this.pinnedFile ?? '', this);
  private tree: MindMapTree | null = null;
  /**
   * Effective tag position (frontmatter `mind-mapper-tags`, else the setting), updated with the
   * frontmatter and the settings: the size cache reads it per node.
   */
  private tagPosition: TagPosition = DEFAULT_SETTINGS.tagPosition;
  private readonly sizes = new SizeCache(
    () => this.limits(),
    () => this.tagPosition,
  );
  /** Rendered node contents into `sizes`; a change re-lays out (debounced). */
  private readonly measurer = new NodeMeasurer(
    {
      win: () => this.contentEl.win,
      limits: () => this.limits(),
      layout: () => (this.dom ? this.layout : null),
      canvasSize: () => this.camera.size(),
      setClipped: (id, clip) => this.dom?.renderer.setClipped(id, clip),
      relayout: () => this.relayout(),
    },
    this.sizes,
  );
  private relayoutOnResize = false;
  private readonly collapse = new CollapseState();
  /**
   * Effective `mind-mapper-collapsed` (or setting) last applied to the shown note, null before the
   * first tree of a note: only a change of it collapses or expands all (spec "Collapse all mode").
   */
  private startCollapsed: boolean | null = null;
  /** Collapse toggles of the current layout. */
  private collapseInfo: CollapseInfo = { hidden: new Map(), hasChildren: () => false };
  private selected: string | null = null;

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
  /** Note of the shown map (null: none); a failing update keeps that map only for the same note. */
  private mapPath: string | null = null;
  /** Layout of the current map; a different effective layout fits once. */
  private layoutName: MapLayoutName | null = null;
  /**
   * Layout and color theme chosen in this view (control bar, commands), null: the note's. Saved in
   * the view state, never in the note; they win over the frontmatter and the settings.
   */
  private layoutOverride: MapLayoutName | null = null;
  private themeOverride: MapThemeName | null = null;
  /** Pending animation frame of a layout choice: a burst of choices lays out once. */
  private layoutFrame: number | null = null;
  /** Transform, fit, zoom and their animations (drill-down, fit, zoom, layout switch). */
  private readonly camera = new Camera({
    win: () => this.contentEl.win,
    canvas: () => this.dom?.renderer.canvasEl ?? null,
    showTransform: (t) => {
      this.dom?.renderer.setTransform(t);
      this.dom?.controls.setZoom(t.zoom);
    },
    setOpacity: (opacity) => this.dom?.renderer.setOpacity(opacity),
    shown: () => this.layout && { layout: this.layout, collapse: this.collapseInfo },
    fitMaxZoom: () => this.services.settings().fitMaxZoom / 100,
  });
  /** Drill-down (issue #23): the center of the map and the transitions in and out. */
  private readonly drilling = new DrillDown(
    {
      tree: () => this.tree,
      layout: () => this.layout,
      selected: () => this.selected,
      select: (id) => this.select(id),
      layoutFor: (tree, centre) => this.layoutFor(tree, centre),
      showCentre: () => {
        if (!this.tree) return;
        this.measurer.cancelRelayout();
        this.showLayout(this.computeLayout(this.tree));
      },
      pathChanged: () => {
        this.app.workspace.requestSaveLayout();
        this.updateDrillControls();
      },
    },
    this.camera,
  );

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
    // Spec "Drill-down": D while the map has focus (the view scope, active with its leaf); not a
    // command hotkey. Obsidian matches the key case-insensitively.
    this.scope ??= new Scope(this.app.scope);
    this.scope.register([], 'D', (evt) => this.drilling.key(evt));
    this.scope.register(null, null, (evt) => this.keepTabOnRelayedEscape(evt));
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
    const { defaultLayout, startCollapsed, defaultTheme, tagPosition } = this.services.settings();
    return readMapOptions(
      this.frontmatter,
      defaultLayout,
      startCollapsed,
      defaultTheme,
      tagPosition,
    );
  }

  /** This view's chosen layout, else frontmatter `mind-mapper-layout`, else the plugin setting. */
  private effectiveLayout(): MapLayoutName {
    return this.layoutOverride ?? this.mapOptions().layout;
  }

  /** This view's chosen theme, else frontmatter `mind-mapper-theme`, else the plugin setting. */
  private effectiveTheme(): MapThemeName {
    return this.themeOverride ?? this.mapOptions().theme;
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
    this.tagPosition = options.tags;
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

  /** Selecting (or clearing) a node ends a link highlight; it never highlights links itself. */
  select(id: string | null): void {
    this.selected = id;
    this.dom?.renderer.setSelected(id);
    this.dom?.renderer.setHighlightedLink(null);
    this.updateDrillControls();
  }

  /** A tap on a link line highlights that link instead of a node (issue #21). */
  private highlightLink(link: CrossLink): void {
    this.select(null);
    this.dom?.renderer.setHighlightedLink(link);
  }

  get isFullScreen(): boolean {
    return this.fullScreen.active;
  }

  toggleFullScreen(): void {
    if (this.fullScreen.active) this.exitFullScreen();
    else this.enterFullScreen();
  }

  /**
   * Spec "Full screen": entering fits (at once: the canvas itself jumps to its new size), Esc
   * (after modals, via the view scope) exits.
   */
  private enterFullScreen(): void {
    if (this.fullScreen.active || !this.dom) return;
    this.camera.finish();
    this.beforeFullScreen = this.camera.transform;
    this.fullScreen.enter();
    this.scope ??= new Scope(this.app.scope);
    this.escHandler = this.scope.register([], 'Escape', (evt) => {
      // Obsidian runs scope keys before the input sees them: there Esc only restores its value.
      if (this.dom?.controls.ownsKeys(evt.target)) return true;
      this.exitFullScreen();
      return false;
    });
    // The overlay hides the workspace: a note opened by anything else would end up behind it, and
    // Esc (this view's scope) only works while this leaf is active.
    this.leafChangeRef = this.app.workspace.on('active-leaf-change', (leaf) => {
      if (leaf !== this.leaf) this.exitFullScreen();
    });
    this.registerEvent(this.leafChangeRef);
    this.camera.pendingFit = true;
    this.camera.tryFit();
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

  /** Selects the root (drilled in: the center) and glides it to the center at the current zoom. */
  backToRoot(): void {
    this.camera.finish();
    const rootId = this.drilling.centre ?? this.tree?.root.id;
    if (rootId === undefined || !this.layout?.nodes.some((p) => p.node.id === rootId)) return;
    this.select(rootId);
    this.camera.glideTo(() => {
      const root = this.layout?.nodes.find((p) => p.node.id === rootId);
      return root ? centredAt(root, this.camera.center(), this.camera.transform.zoom) : null;
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
    this.camera.finish();
    if (!this.layout) return;
    const anchor = this.layout.nodes.filter((p) => p.node.id === id);
    this.collapse.toggle(id);
    this.relayoutKeeping(anchor);
  }

  /** The effective color theme: pure CSS, no re-measure, no re-layout. */
  applyTheme(): void {
    if (!this.dom) return;
    const theme = this.effectiveTheme();
    this.dom.renderer.setTheme(theme);
    this.dom.controls.setTheme(theme, this.themeOverride !== null);
  }

  /** Layout of this view only (null: the note's again): a different layout re-lays out and fits. */
  chooseLayout(layout: MapLayoutName | null): void {
    this.camera.finish();
    this.layoutOverride = layout;
    this.app.workspace.requestSaveLayout();
    this.dom?.controls.setLayout(this.effectiveLayout(), layout !== null);
    if (!this.tree || !this.layout || !this.layoutWillChange()) return;
    // A held hotkey repeats faster than a large map lays out: at most once per frame, last choice wins.
    this.layoutFrame ??= this.contentEl.win.requestAnimationFrame(() => {
      this.layoutFrame = null;
      const tree = this.tree;
      if (!tree || !this.layout || !this.layoutWillChange()) return;
      this.switchLayout(() => this.showLayout(this.computeLayout(tree)));
    });
  }

  private cancelLayoutFrame(): void {
    if (this.layoutFrame === null) return;
    this.contentEl.win.cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = null;
  }

  /** Color theme of this view only (null: the note's again), applied live without a re-layout. */
  chooseTheme(theme: MapThemeName | null): void {
    this.themeOverride = theme;
    this.app.workspace.requestSaveLayout();
    this.applyTheme();
  }

  /** The layout after the shown one (wraps around). */
  nextLayout(): void {
    this.chooseLayout(following(LAYOUT_NAMES, this.effectiveLayout()));
  }

  /** The color theme after the shown one (wraps around). */
  nextTheme(): void {
    this.chooseTheme(following(THEME_NAMES, this.effectiveTheme()));
  }

  /** A map is shown (not a placeholder such as "No note selected" or "Loading…"). */
  showsMap(): boolean {
    return this.layout !== null;
  }

  showLayoutMenu(): void {
    this.dom?.controls.showLayoutMenu();
  }

  showThemeMenu(): void {
    this.dom?.controls.showThemeMenu();
  }

  /** Plugin settings changed: a new layout fits once, other changes keep the viewport anchored. */
  refresh(): void {
    this.camera.finish();
    this.applyCssLimits();
    this.applyTheme();
    this.tagPosition = this.mapOptions().tags;
    this.dom?.renderer.setTagPosition(this.tagPosition);
    if (!this.layout || !this.tree) return;
    // A new max node size or tag position changes the size cache keys and the node sizes: measure
    // again now (the ResizeObserver only fires for content whose size changes).
    this.measurer.measureAll();
    this.applyStartCollapsed(this.tree);
    const tree = this.tree;
    if (this.layoutWillChange()) {
      this.switchLayout(() => this.showLayout(this.computeLayout(tree)));
      return;
    }
    this.relayoutKeeping(this.anchorIn(this.layout));
  }

  /** Root and first level stay visible. */
  collapseAll(): void {
    this.camera.finish();
    if (!this.tree || !this.layout) return;
    const anchor = this.anchorIn(this.layout);
    this.collapse.collapseAll(this.tree);
    this.relayoutKeeping(anchor);
  }

  expandAll(): void {
    this.camera.finish();
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
    this.camera.pendingFit = true;
    this.listenForEscape();
    // A tab dragged into another window: measuring follows it there.
    this.register(this.containerEl.onWindowMigrated(() => this.measurer.moveToWindow()));
    await this.loadNote();
  }

  /**
   * Obsidian's workspace listens for Esc on the main window only. Map in the main window: bubble
   * phase on the document, after the target, menus and scopes, before the workspace's listener on
   * the window.
   */
  private listenForEscape(): void {
    this.registerDomEvent(this.app.workspace.rootSplit.doc, 'keydown', (evt) =>
      this.keepTabOnEscape(evt),
    );
  }

  /**
   * Map in a popout: the popout relays its keys to the main window before anything in the popout
   * sees them, and the workspace checks the relayed copy, which only the keymap (scopes) can mark
   * handled. Every key passes this catch-all of the view scope; it returns nothing, so the key goes
   * on to the other handlers (full screen Esc, D).
   */
  private keepTabOnRelayedEscape(evt: KeyboardEvent): void {
    if (this.containerEl.win !== this.app.workspace.rootSplit.win) this.keepTabOnEscape(evt);
  }

  /**
   * Obsidian's workspace hands an Esc nothing marked as handled from a non-navigation view (like
   * this one) to the most recent note tab: a bare Esc, or one that closed a menu of the control bar
   * (menus do not mark it), would take the active tab from the map and end full screen. The map is
   * not a navigation view on purpose (a note opened in the current tab would replace it), so it
   * marks Esc handled instead.
   */
  private keepTabOnEscape(evt: KeyboardEvent): void {
    if (evt.key !== 'Escape') return;
    if (this.app.workspace.getActiveViewOfType(MindMapView) === this) evt.preventDefault();
  }

  override async onClose(): Promise<void> {
    this.exitFullScreen();
    this.camera.cancel();
    this.generation++;
    this.watcher.stop();
    this.measurer.cancelRelayout();
    this.cancelLayoutFrame();
    this.measurer.disconnect();
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
    return { ...super.getState(), ...this.viewState() };
  }

  private viewState(): MindMapViewState {
    return {
      file: this.pinnedFile,
      layout: this.layoutOverride,
      theme: this.themeOverride,
      drill: [...this.drilling.path],
    };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const { file, layout, theme, drill } = parseViewState(state);
    // Applied by the load below: a different layout fits, the theme is set with the layout, a
    // drill path that no longer fits the note shows the whole map.
    this.layoutOverride = layout;
    this.themeOverride = theme;
    this.camera.finish();
    this.drilling.restore(drill);
    if (file !== this.pinnedFile) {
      this.camera.pendingFit = true;
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
    if (this.camera.pendingFit) this.camera.tryFit();
  }

  /** Pan and zoom input reads it first: a running animation ends, the input continues from there. */
  getTransform(): Transform {
    this.camera.finish();
    return this.camera.transform;
  }

  /** User-driven transform (pan, zoom, commands): later re-layouts anchor instead of re-fitting. */
  setTransform(t: Transform): void {
    this.camera.set(t);
  }

  /** Next zoom step (spec "Zoom and pan"); wheel and pinch zoom smoothly instead. */
  zoomIn(): void {
    this.camera.zoomIn();
  }

  zoomOut(): void {
    this.camera.zoomOut();
  }

  /** Zoom (1 = 100 %, clamped to the limits), centered on the canvas; glides there. */
  zoomTo(zoom: number): void {
    this.camera.zoomTo(zoom);
  }

  resetZoom(): void {
    this.camera.resetZoom();
  }

  /** Glides to the fit; at once while there is nothing to fit yet (it fits when there is). */
  fitToView(): void {
    this.camera.fitToView();
  }

  /**
   * A different layout (issue #24): the map fades out, the new one (`swap`) fades in with the node
   * at the center (or the selected one) kept in place, then the view glides to its fit. The choice
   * itself (view state, control bar) applies at once.
   */
  private switchLayout(swap: () => void): void {
    this.measurer.cancelRelayout();
    this.camera.fitted = false;
    this.camera.pendingFit = false;
    this.camera.run([
      this.camera.fade('out'),
      this.camera.fade('in', () => {
        const anchor = this.layout ? this.anchorIn(this.layout) : [];
        this.measurer.cancelRelayout();
        swap();
        this.camera.keepInPlace(anchor, this.layout);
      }),
      this.camera.fitGlide(),
    ]);
  }

  /** A map is shown around a drilled-in node (issue #23). */
  get isDrilled(): boolean {
    return this.drilling.isDrilled;
  }

  /** The selected node has children and is not the center: it can become the center. */
  canDrillDown(): boolean {
    return this.drilling.canDrillDown();
  }

  /** Control bar button and key D: into the selected node, else out one level. */
  drill(): void {
    this.drilling.drill();
  }

  /** The selected node becomes the center: only it and its subtree, fitted. */
  drillDown(): void {
    this.drilling.down();
  }

  /** One level up; the node drilled out of stays selected, the map is fitted. */
  drillOut(): void {
    this.drilling.out();
  }

  /** Straight back to the whole map; the outermost drilled node is selected, the map fitted. */
  showWholeMap(): void {
    this.drilling.whole();
  }

  private updateDrillControls(): void {
    this.dom?.controls.setDrill(this.drilling.action(), this.drilling.isDrilled);
  }

  private async loadNote(): Promise<void> {
    this.camera.finish();
    const generation = ++this.generation;
    this.watcher.watch();
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
    this.safely(path, () => {
      const tree = this.parse(file, cache, text);
      const previous = this.layout;
      const lost = this.drilling.dropLost(tree);
      if (this.layoutWillChange() || lost) this.camera.pendingFit = true;
      // Same note again (rename, recreate): keep the viewport like a live update.
      if (!previous || this.camera.pendingFit) return this.showTree(tree);
      const anchor = this.anchorIn(previous);
      this.showTree(tree);
      this.camera.fitted = false;
      this.camera.keepInPlace(anchor, this.layout);
    });
  }

  /**
   * Spec "Live update": a note version that cannot be parsed or laid out keeps the last good map
   * with a notice (`map.update-error`) until a version works again; with no map of this note yet
   * (opening, another note in this tab), a message.
   */
  private safely(path: string, update: () => void): void {
    const last = {
      tree: this.tree,
      layout: this.layout,
      links: this.links,
      frontmatter: this.frontmatter,
    };
    const lastPath = this.mapPath;
    try {
      if (this.dom) this.dom.updateErrorEl.hidden = true;
      update();
      this.mapPath = path;
    } catch (error) {
      console.error('Mind Mapper: could not update the map', path, error);
      if (!last.tree || !last.layout || lastPath !== path) {
        return this.showMessage(t('couldNotShowNote'));
      }
      this.tree = last.tree;
      this.links = last.links;
      this.frontmatter = last.frontmatter;
      this.layout = last.layout;
      const dom = this.ensureDom();
      dom.hintEl.hidden = true;
      dom.updateErrorEl.hidden = false;
    }
  }

  /** Every new tree passes here, so the collapse state always follows the shown tree. */
  private showTree(tree: MindMapTree): void {
    this.collapse.update(this.tree, tree);
    this.applyStartCollapsed(tree);
    this.tree = tree;
    this.showLayout(this.computeLayout(tree));
  }

  /** New tree from the note; keeps the viewport anchored (never fits, except a fit still pending from opening). */
  private applyChange(file: TFile, data: string, cache: CachedMetadata): void {
    this.camera.finish();
    this.generation++; // a load still reading the file is outdated now
    this.watcher.cancelUpdate();
    this.measurer.cancelRelayout();
    this.safely(file.path, () => this.showChange(file, data, cache));
  }

  private showChange(file: TFile, data: string, cache: CachedMetadata): void {
    const tree = this.parse(file, cache, data);
    const previous = this.layout;
    if (!previous || !this.tree) {
      this.drilling.dropLost(tree);
      return this.showTree(tree);
    }
    const switching = this.layoutWillChange();
    // Spec "Drill-down": quietly back to the whole map, fitted.
    const lost = this.drilling.dropLost(tree);
    if (lost) this.camera.pendingFit = true;
    const ids = new Set(allNodes(tree).map((node) => node.id));
    if (this.selected !== null && !ids.has(this.selected)) this.select(null);
    const anchor = this.anchorIn(previous);
    // Sizes of content that is gone; the cache would otherwise grow with every edit.
    this.sizes.retain(allNodes(tree));
    // A new layout from the frontmatter switches like a chosen one (unless a fit is due anyway).
    if (switching && !this.camera.pendingFit) return this.switchLayout(() => this.showTree(tree));
    if (switching) this.camera.pendingFit = true;
    this.showTree(tree);
    if (lost || this.camera.pendingFit) return;
    this.camera.fitted = false;
    this.camera.keepInPlace(anchor, this.layout);
  }

  /**
   * The node to keep in place across a re-layout: the selected node if it is on screen, else the
   * one nearest the view center (an off-screen selection would let the visible area jump).
   */
  private anchorIn(layout: MapLayout): Anchor {
    const selected = layout.nodes.find((p) => p.node.id === this.selected);
    const center = this.camera.center();
    const node =
      selected && this.camera.onScreen(selected)
        ? selected
        : nearestNode(layout, {
            x: (center.x - this.camera.transform.x) / this.camera.transform.zoom,
            y: (center.y - this.camera.transform.y) / this.camera.transform.zoom,
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

  /** Re-layout after a user action (collapse): no fit, the anchor keeps its screen position. */
  private relayoutKeeping(anchor: Anchor): void {
    if (!this.tree) return;
    this.measurer.cancelRelayout();
    this.showLayout(this.computeLayout(this.tree));
    this.camera.fitted = false;
    this.camera.pendingFit = false;
    this.camera.keepInPlace(anchor, this.layout);
  }

  /** Layout of the shown map (whole or drilled in); sets the collapse toggles and layout name. */
  private computeLayout(tree: MindMapTree): MapLayout {
    const { layout, collapseInfo, name } = this.layoutFor(tree, this.drilling.centre);
    this.collapseInfo = collapseInfo;
    this.layoutName = name;
    return layout;
  }

  /**
   * Layout of `tree`, or of the subtree of `centre` (drill-down); measured size if known (size
   * cache), else the instant estimate.
   */
  private layoutFor(
    tree: MindMapTree,
    centre: string | null,
  ): { layout: MapLayout; collapseInfo: CollapseInfo; name: MapLayoutName } {
    const shown = (centre !== null && drilledTree(tree, centre)) || tree;
    const visible = visibleTree(shown, this.collapse);
    // Children per node in the note (also of collapsed nodes): toggles and kanban card counts.
    const childCounts = new Map(allNodes(tree).map((node) => [node.id, node.children.length]));
    const parents = new Set([...childCounts].filter(([, n]) => n > 0).map(([id]) => id));
    const settings = this.services.settings();
    const limits = this.limits();
    const name = this.effectiveLayout();
    const layout = layoutTree(visible.tree, {
      siblingGap: settings.siblingGap,
      levelGap: settings.levelGap,
      nodeSize: (node) => this.sizes.get(node)?.size ?? estimateSize(node, limits),
      tagRow: (node) => this.sizes.get(node)?.tags ?? null,
      layout: name,
      maxNodeWidth: limits.maxWidth,
      childCount: (node) => childCounts.get(node.id) ?? node.children.length,
    });
    return {
      layout,
      collapseInfo: { hidden: visible.hidden, hasChildren: (id) => parents.has(id) },
      name,
    };
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
          this.measurer.observe(new Map([[node.id, contentEl]]));
        },
        release: (contentEl) => {
          this.measurer.release(contentEl);
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
    setElementId(placeholderEl, 'map.placeholder');
    const hintEl = renderer.canvasEl.createDiv({
      cls: 'mind-mapper-hint',
      text: t('noContentYet'),
    });
    setElementId(hintEl, 'map.empty-hint');
    hintEl.hidden = true;
    const updateErrorEl = renderer.canvasEl.createDiv({
      cls: 'mind-mapper-update-error',
      text: t('couldNotUpdateMap'),
    });
    setElementId(updateErrorEl, 'map.update-error');
    updateErrorEl.hidden = true;
    attachPanZoom(
      this,
      renderer.canvasEl,
      this,
      (target) => {
        const link = renderer.crossLinkAt(target);
        if (link) this.highlightLink(link);
        else this.select(null);
      },
      (target) => {
        // A double click on a link line jumps to where the link is written; elsewhere it fits.
        const link = renderer.crossLinkAt(target);
        if (link) this.jumpTo(link.line);
        else this.fitToView();
      },
    );
    attachLinkHandling(renderer.canvasEl, {
      app: this.app,
      events: this,
      hoverParent: this,
      mapLeaf: this.leaf,
      recency: this.recency,
      sourcePath: () => this.pinnedFile ?? '',
      onNavigate: () => this.exitFullScreen(),
    });
    this.registerEvent(this.app.workspace.on('css-change', () => this.measurer.measureAll()));
    this.dom = { placeholderEl, hintEl, updateErrorEl, renderer, controls };
    this.camera.apply(this.camera.transform);
    return this.dom;
  }

  private showMessage(text: string): void {
    const dom = this.ensureDom();
    this.camera.cancel();
    this.measurer.cancelRelayout();
    this.cancelLayoutFrame();
    this.tree = null;
    this.layout = null;
    this.mapPath = null;
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
    dom.renderer.setDrillCentre(this.drilling.centre);
    // A new tag position (setting, frontmatter) changes node sizes: measure the placed nodes again.
    if (dom.renderer.setTagPosition(this.tagPosition)) this.measurer.measureAll();
    this.selectShown(layout);
    dom.controls.setCollapsed(this.collapse.size > 0);
    dom.controls.setLayout(this.layoutName ?? this.effectiveLayout(), this.layoutOverride !== null);
    this.updateDrillControls();
    if (this.tree) {
      const shown = new Set(layout.nodes.map((p) => p.node.id));
      dom.renderer.setCrossLinks(visibleCrossLinks(this.tree, this.links, shown));
    }
    // Same place as the update error notice, which wins.
    dom.hintEl.hidden = !dom.updateErrorEl.hidden || (this.tree?.root.children.length ?? 0) > 0;
    for (const { node } of layout.nodes) {
      dom.renderer.setClipped(node.id, this.sizes.get(node)?.clip ?? NO_CLIP);
    }
    this.measurer.observe(dom.renderer.contentElements());
    if (this.camera.pendingFit) this.camera.tryFit();
  }

  /** A selected node hidden by a collapse passes the selection to its nearest visible ancestor. */
  private selectShown(layout: MapLayout): void {
    if (this.selected === null) return;
    const shown = new Set(layout.nodes.map((p) => p.node.id));
    if (shown.has(this.selected)) return;
    this.select(this.ancestorIds(this.selected).find((id) => shown.has(id)) ?? null);
  }

  /** Re-layout with measured sizes: re-fit while still fitted, else keep the node nearest the center in place. */
  private relayout(): void {
    if (!this.tree || !this.layout) return;
    const { width, height } = this.camera.size();
    if (width === 0 || height === 0) {
      // Hidden tab: no viewport to anchor in; run on the next resize with a real size.
      this.relayoutOnResize = true;
      return;
    }
    this.relayoutOnResize = false;
    const anchor = this.anchorIn(this.layout);
    this.showLayout(this.computeLayout(this.tree));
    if (this.camera.fitted) {
      // Not fitToView: a running animation keeps going (a fit glide lands on the new fit).
      this.camera.pendingFit = true;
      this.camera.tryFit();
      return;
    }
    this.camera.keepInPlace(anchor, this.layout);
  }
}

/** The value after `current` in `values`, the first after the last. */
function following<T>(values: readonly T[], current: T): T {
  return values[(values.indexOf(current) + 1) % values.length] ?? current;
}
