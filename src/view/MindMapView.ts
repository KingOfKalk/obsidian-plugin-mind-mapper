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
import {
  LAYOUT_NAMES,
  type MapLayout,
  type MapLayoutName,
  type PositionedNode,
  type Rect,
  type Size,
} from '../layout/types';
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
import { type DrillAction, type MapActions, MapControls } from '../render/MapControls';
import { attachPanZoom, type PanZoomTarget } from '../render/panZoomInput';
import { type MapThemeName, THEME_NAMES } from '../render/themes';
import {
  fitBounds,
  fitToBounds,
  IDENTITY,
  nextZoomStep,
  resetZoom,
  type Transform,
  zoomTo,
} from '../render/viewport';
import { jumpToSource } from '../commands/jumpToSource';
import { t } from '../i18n';
import { CollapseState } from './collapseState';
import { drilledTree, findNode, isValidDrillPath } from './drill';
import {
  easeInOut,
  FADE_MS,
  GLIDE_MS,
  lerpTransform,
  type Phase,
  PhaseRunner,
} from './drillAnimation';
import { FullScreen } from './fullScreen';
import { LeafRecency } from './leafRecency';
import { fileBasename, type MindMapViewState, parseViewState } from './viewState';

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
  /**
   * Layout and colour theme chosen in this view (control bar, commands), null: the note's. Saved in
   * the view state, never in the note; they win over the frontmatter and the settings.
   */
  private layoutOverride: MapLayoutName | null = null;
  private themeOverride: MapThemeName | null = null;
  /** Pending animation frame of a layout choice: a burst of choices lays out once. */
  private layoutFrame: number | null = null;
  /**
   * Drill-down (issue #23): IDs of the drilled-in nodes, outermost first; empty: the whole map.
   * Saved in the view state. Changes at once; the shown map follows when its animation swaps it.
   */
  private drillPath: string[] = [];
  /** Centre of the shown map (null: the whole map); trails `drillPath` while animating. */
  private shownCentre: string | null = null;
  private drillAnimation: PhaseRunner | null = null;

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
    this.scope.register([], 'D', (evt) => this.drillKey(evt));
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

  /** Spec "Full screen": entering fits, Esc (after modals, via the view scope) exits. */
  private enterFullScreen(): void {
    if (this.fullScreen.active || !this.dom) return;
    this.beforeFullScreen = this.transform;
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

  /** Selects the root (drilled in: the centre) and centres it at the current zoom. */
  backToRoot(): void {
    this.finishDrillAnimation();
    const rootId = this.shownCentre ?? this.tree?.root.id;
    const root = this.layout?.nodes.find((p) => p.node.id === rootId);
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
    this.finishDrillAnimation();
    if (!this.layout) return;
    const anchor = this.layout.nodes.filter((p) => p.node.id === id);
    this.collapse.toggle(id);
    this.relayoutKeeping(anchor);
  }

  /** The effective colour theme: pure CSS, no re-measure, no re-layout. */
  applyTheme(): void {
    if (!this.dom) return;
    const theme = this.effectiveTheme();
    this.dom.renderer.setTheme(theme);
    this.dom.controls.setTheme(theme, this.themeOverride !== null);
  }

  /** Layout of this view only (null: the note's again): a different layout re-lays out and fits. */
  chooseLayout(layout: MapLayoutName | null): void {
    this.finishDrillAnimation();
    this.layoutOverride = layout;
    this.app.workspace.requestSaveLayout();
    this.dom?.controls.setLayout(this.effectiveLayout(), layout !== null);
    if (!this.tree || !this.layout || !this.layoutWillChange()) return;
    // A held hotkey repeats faster than a large map lays out: at most once per frame, last choice wins.
    this.layoutFrame ??= this.contentEl.win.requestAnimationFrame(() => {
      this.layoutFrame = null;
      if (!this.tree || !this.layout || !this.layoutWillChange()) return;
      this.cancelRelayout();
      this.pendingFit = true;
      this.showLayout(this.computeLayout(this.tree));
    });
  }

  private cancelLayoutFrame(): void {
    if (this.layoutFrame === null) return;
    this.contentEl.win.cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = null;
  }

  /** Colour theme of this view only (null: the note's again), applied live without a re-layout. */
  chooseTheme(theme: MapThemeName | null): void {
    this.themeOverride = theme;
    this.app.workspace.requestSaveLayout();
    this.applyTheme();
  }

  /** The layout after the shown one (wraps around). */
  nextLayout(): void {
    this.chooseLayout(following(LAYOUT_NAMES, this.effectiveLayout()));
  }

  /** The colour theme after the shown one (wraps around). */
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
    this.finishDrillAnimation();
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
    this.finishDrillAnimation();
    if (!this.tree || !this.layout) return;
    const anchor = this.anchorIn(this.layout);
    this.collapse.collapseAll(this.tree);
    this.relayoutKeeping(anchor);
  }

  expandAll(): void {
    this.finishDrillAnimation();
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
    // Bubble phase on the document: after the target, menus and scopes, before Obsidian's own
    // listener on the window.
    this.registerDomEvent(this.containerEl.doc, 'keydown', (evt) => this.keepTabOnEscape(evt));
    await this.loadNote();
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
    this.cancelDrillAnimation();
    this.generation++;
    this.stopListening();
    this.cancelUpdate();
    this.cancelRelayout();
    this.cancelLayoutFrame();
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
    return { ...super.getState(), ...this.viewState() };
  }

  private viewState(): MindMapViewState {
    return {
      file: this.pinnedFile,
      layout: this.layoutOverride,
      theme: this.themeOverride,
      drill: [...this.drillPath],
    };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const { file, layout, theme, drill } = parseViewState(state);
    // Applied by the load below: a different layout fits, the theme is set with the layout, a
    // drill path that no longer fits the note shows the whole map.
    this.layoutOverride = layout;
    this.themeOverride = theme;
    this.finishDrillAnimation();
    this.drillPath = drill;
    this.shownCentre = drill.at(-1) ?? null;
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

  /** Pan and zoom input reads it first: a running drill animation ends, the input continues from there. */
  getTransform(): Transform {
    this.finishDrillAnimation();
    return this.transform;
  }

  /** User-driven transform (pan, zoom, commands): later re-layouts anchor instead of re-fitting. */
  setTransform(t: Transform): void {
    this.finishDrillAnimation();
    this.fitted = false;
    this.applyTransform(t);
  }

  private applyTransform(t: Transform): void {
    this.transform = t;
    this.dom?.renderer.setTransform(t);
    this.dom?.controls.setZoom(t.zoom);
  }

  /** Next zoom step (spec "Zoom and pan"); wheel and pinch zoom smoothly instead. */
  zoomIn(): void {
    this.finishDrillAnimation();
    this.zoomTo(nextZoomStep(this.transform.zoom, 1));
  }

  zoomOut(): void {
    this.finishDrillAnimation();
    this.zoomTo(nextZoomStep(this.transform.zoom, -1));
  }

  /** Zoom (1 = 100 %, clamped to the limits), centred on the canvas. */
  zoomTo(zoom: number): void {
    this.finishDrillAnimation();
    this.setTransform(zoomTo(this.transform, zoom, this.center()));
  }

  resetZoom(): void {
    this.finishDrillAnimation();
    this.setTransform(resetZoom(this.transform, this.size()));
  }

  fitToView(): void {
    this.finishDrillAnimation();
    this.pendingFit = true;
    this.tryFit();
  }

  /** A map is shown around a drilled-in node (issue #23). */
  get isDrilled(): boolean {
    return this.drillPath.length > 0;
  }

  /** The selected node has children and is not the centre: it can become the centre. */
  canDrillDown(): boolean {
    if (!this.tree || !this.layout || this.selected === null) return false;
    const centreId = this.drillPath.at(-1);
    const centre = centreId === undefined ? this.tree.root : findNode(this.tree.root, centreId);
    if (!centre || centre.id === this.selected) return false;
    return (findNode(centre, this.selected)?.children.length ?? 0) > 0;
  }

  private drillAction(): DrillAction {
    if (!this.layout) return null;
    if (this.canDrillDown()) return 'in';
    return this.isDrilled ? 'out' : null;
  }

  /** Control bar button and key D: into the selected node, else out one level. */
  drill(): void {
    const action = this.drillAction();
    if (action === 'in') this.drillDown();
    else if (action === 'out') this.drillOut();
  }

  /** The selected node becomes the centre: only it and its subtree, fitted. */
  drillDown(): void {
    this.finishDrillAnimation();
    const id = this.selected;
    if (id === null || !this.canDrillDown()) return;
    this.setDrillPath([...this.drillPath, id]);
    this.runDrillAnimation([
      this.glide(() => this.drilledInTarget(id)),
      this.fade('out'),
      this.fade('in', () => this.showCentre(id, null)),
    ]);
  }

  /** One level up; the node drilled out of is selected and centred. */
  drillOut(): void {
    this.finishDrillAnimation();
    const left = this.drillPath.at(-1);
    if (left === undefined) return;
    this.drillOutTo(this.drillPath.slice(0, -1), left);
  }

  /** Straight back to the whole map; the outermost drilled node is selected and centred. */
  showWholeMap(): void {
    this.finishDrillAnimation();
    const first = this.drillPath[0];
    if (first === undefined) return;
    this.drillOutTo([], first);
  }

  /** Drilling in reversed: cross-fade with `left` kept in place, then glide until it is centred. */
  private drillOutTo(path: string[], left: string): void {
    this.setDrillPath(path);
    const centre = path.at(-1) ?? null;
    this.select(left);
    this.runDrillAnimation([
      this.fade('out'),
      this.fade('in', () => this.showCentre(centre, left)),
      this.glide(() => this.centredAtFitZoom()),
    ]);
  }

  private setDrillPath(path: string[]): void {
    this.drillPath = path;
    this.app.workspace.requestSaveLayout();
    this.updateDrillControls();
  }

  private updateDrillControls(): void {
    this.dom?.controls.setDrill(this.drillAction(), this.isDrilled);
  }

  /** Key D in the view scope; typing into a text field (the zoom input) is left alone. */
  private drillKey(evt: KeyboardEvent): boolean {
    if (isTextField(evt.target) || this.drillAction() === null) return true;
    this.drill();
    return false;
  }

  /**
   * Shows the map around `centre` (null: the whole map). `keep`: that node (or its nearest shown
   * ancestor) keeps the screen position of the old centre; otherwise the new map is fitted.
   */
  private showCentre(centre: string | null, keep: string | null): void {
    if (!this.tree || !this.layout) return;
    const old = this.layout.nodes.find((p) => p.node.id === this.shownCentre) ?? null;
    const at = old && this.screenCentreOf(old);
    this.shownCentre = centre;
    this.cancelRelayout();
    if (keep === null) this.pendingFit = true;
    this.showLayout(this.computeLayout(this.tree));
    if (keep === null || !at) return;
    const kept = this.layout?.nodes.find((p) => p.node.id === this.selected);
    if (!kept) return;
    const { zoom } = this.transform;
    this.fitted = false;
    this.applyTransform({
      x: at.x - (kept.x + kept.width / 2) * zoom,
      y: at.y - (kept.y + kept.height / 2) * zoom,
      zoom,
    });
  }

  private screenCentreOf(rect: Rect): { x: number; y: number } {
    const { x, y, zoom } = this.transform;
    return { x: (rect.x + rect.width / 2) * zoom + x, y: (rect.y + rect.height / 2) * zoom + y };
  }

  /**
   * Glide target before drilling into `id`: the node where and as large as it will be in the
   * fitted drilled view, so the cross-fade does not move it.
   */
  private drilledInTarget(id: string): Transform | null {
    if (!this.tree || !this.layout) return null;
    const from = this.layout.nodes.find((p) => p.node.id === id);
    const drilled = this.layoutFor(this.tree, id);
    const to = drilled.layout.nodes.find((p) => p.node.id === id);
    const fit = this.fitTransform(drilled.layout, drilled.collapseInfo);
    if (!from || !to || !fit) return null;
    const at = {
      x: (to.x + to.width / 2) * fit.zoom + fit.x,
      y: (to.y + to.height / 2) * fit.zoom + fit.y,
    };
    return {
      x: at.x - (from.x + from.width / 2) * fit.zoom,
      y: at.y - (from.y + from.height / 2) * fit.zoom,
      zoom: fit.zoom,
    };
  }

  /** Glide target after drilling out: the selected node centred, at the zoom that fits the map. */
  private centredAtFitZoom(): Transform | null {
    const node = this.layout?.nodes.find((p) => p.node.id === this.selected);
    if (!this.layout || !node) return null;
    const zoom = this.fitTransform(this.layout, this.collapseInfo)?.zoom ?? this.transform.zoom;
    const center = this.center();
    return {
      x: center.x - (node.x + node.width / 2) * zoom,
      y: center.y - (node.y + node.height / 2) * zoom,
      zoom,
    };
  }

  /** Moves the view to `target` (evaluated when the glide starts), eased. */
  private glide(target: () => Transform | null): Phase {
    let from = this.transform;
    let to: Transform | null = null;
    return {
      duration: GLIDE_MS,
      begin: () => {
        from = this.transform;
        to = target();
      },
      frame: (progress) => {
        if (to) this.applyTransform(lerpTransform(from, to, easeInOut(progress)));
      },
    };
  }

  /** Fades the map out, or (after `begin`, the swap) in; opacity only. */
  private fade(direction: 'in' | 'out', begin?: () => void): Phase {
    return {
      duration: FADE_MS,
      begin,
      frame: (progress) => {
        const opacity = direction === 'out' ? 1 - progress : progress;
        this.dom?.renderer.setOpacity(direction === 'in' && progress >= 1 ? null : opacity);
      },
    };
  }

  /**
   * Runs the phases on animation frames; at once with the OS setting "reduce motion". The canvas
   * has `is-drilling` while it runs (E2E and screenshots wait for its end).
   */
  private runDrillAnimation(phases: Phase[]): void {
    const canvas = this.dom?.renderer.canvasEl;
    canvas?.addClass('is-drilling');
    const runner = new PhaseRunner(this.contentEl.win, phases, () => {
      canvas?.removeClass('is-drilling');
      if (this.drillAnimation === runner) this.drillAnimation = null;
    });
    this.drillAnimation = runner;
    if (this.reducedMotion()) runner.finish();
  }

  private reducedMotion(): boolean {
    const win = this.contentEl.win;
    // Popout safe: the view's own window.
    return typeof win.matchMedia === 'function'
      ? win.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  }

  /** A running drill animation jumps to its end (a new step, user input, a re-layout). */
  private finishDrillAnimation(): void {
    this.drillAnimation?.finish();
  }

  /** Stops a running drill animation where it is (close, a placeholder replaces the map). */
  private cancelDrillAnimation(): void {
    this.drillAnimation?.cancel();
    this.drillAnimation = null;
    this.dom?.renderer.setOpacity(null);
    this.dom?.renderer.canvasEl.removeClass('is-drilling');
  }

  /**
   * Drops a drill path that no longer fits `tree` (the drilled node was removed or renamed): the
   * whole map again, saved. True when it dropped one.
   */
  private dropLostDrill(tree: MindMapTree): boolean {
    if (!this.isDrilled || isValidDrillPath(tree, this.drillPath)) return false;
    this.cancelDrillAnimation();
    this.shownCentre = null;
    this.setDrillPath([]);
    return true;
  }

  private async loadNote(): Promise<void> {
    this.finishDrillAnimation();
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
    const lost = this.dropLostDrill(tree);
    if (this.layoutWillChange() || lost) this.pendingFit = true;
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
          .setViewState({ type: VIEW_TYPE_MIND_MAP, state: { ...this.viewState() } })
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
    this.finishDrillAnimation();
    this.generation++; // a load still reading the file is outdated now
    this.cancelUpdate();
    this.cancelRelayout();
    const tree = this.parse(file, cache, data);
    const previous = this.layout;
    if (!previous || !this.tree) {
      this.dropLostDrill(tree);
      return this.showTree(tree);
    }
    if (this.layoutWillChange()) this.pendingFit = true;
    // Spec "Drill-down": quietly back to the whole map, fitted.
    const lost = this.dropLostDrill(tree);
    if (lost) this.pendingFit = true;
    const ids = new Set(allNodes(tree).map((node) => node.id));
    if (this.selected !== null && !ids.has(this.selected)) this.select(null);
    const anchor = this.anchorIn(previous);
    // Sizes of content that is gone; the cache would otherwise grow with every edit.
    this.sizes.retain(allNodes(tree));
    this.showTree(tree);
    if (lost || this.pendingFit) return;
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

  /** Layout of the shown map (whole or drilled in); sets the collapse toggles and layout name. */
  private computeLayout(tree: MindMapTree): MapLayout {
    const { layout, collapseInfo, name } = this.layoutFor(tree, this.shownCentre);
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
    const parents = new Set(
      allNodes(tree)
        .filter((node) => node.children.length > 0)
        .map((node) => node.id),
    );
    const settings = this.services.settings();
    const limits = this.limits();
    const name = this.effectiveLayout();
    const layout = layoutTree(visible.tree, {
      siblingGap: settings.siblingGap,
      levelGap: settings.levelGap,
      nodeSize: (node) => this.sizes.get(node)?.size ?? estimateSize(node, limits),
      layout: name,
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
    this.registerEvent(
      this.app.workspace.on('css-change', () => this.measure([...this.observed.keys()])),
    );
    this.dom = { placeholderEl, hintEl, renderer, controls };
    this.applyTransform(this.transform);
    return this.dom;
  }

  private showMessage(text: string): void {
    const dom = this.ensureDom();
    this.cancelDrillAnimation();
    this.cancelRelayout();
    this.cancelLayoutFrame();
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
    dom.renderer.setDrillCentre(this.shownCentre);
    this.selectShown(layout);
    dom.controls.setCollapsed(this.collapse.size > 0);
    dom.controls.setLayout(this.layoutName ?? this.effectiveLayout(), this.layoutOverride !== null);
    this.updateDrillControls();
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
      // Not fitToView: a drill animation fading in the measured map keeps running.
      this.pendingFit = true;
      this.tryFit();
      return;
    }
    this.keepInPlace(anchor);
  }

  /** Fits once the view has a real size; a hidden tab keeps the fit pending for `onResize`. */
  private tryFit(): void {
    if (!this.layout) return;
    const fitted = this.fitTransform(this.layout, this.collapseInfo);
    if (!fitted) return;
    this.pendingFit = false;
    this.applyTransform(fitted);
    this.fitted = true;
  }

  /** The transform that fits `layout` into the canvas; null while the canvas has no size. */
  private fitTransform(layout: MapLayout, collapse: CollapseInfo): Transform | null {
    return fitToBounds(
      fitBounds(layout, collapse.hidden),
      this.size(),
      this.services.settings().fitMaxZoom / 100,
    );
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

/** Key events typed into a text field (the zoom input, an editor) are not map keys. */
function isTextField(target: EventTarget | null): boolean {
  const el = target as Node | null;
  if (!el?.instanceOf?.(HTMLElement)) return false;
  return el.isContentEditable || el.matches('input, textarea, select');
}

/** The value after `current` in `values`, the first after the last. */
function following<T>(values: readonly T[], current: T): T {
  return values[(values.indexOf(current) + 1) % values.length] ?? current;
}
