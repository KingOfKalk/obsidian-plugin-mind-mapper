import type { MapLayout } from '../layout/types';
import type { MindMapTree } from '../parser/types';
import type { CollapseInfo } from '../render/DomMapRenderer';
import type { DrillAction } from '../render/MapControls';
import type { Transform } from '../render/viewport';
import { type Camera, centredAt, screenCentreOf } from './camera';
import { drillMarkdown, findNode, isValidDrillPath } from './drill';

/** What drill-down needs from its view. */
export interface DrillHost {
  tree(): MindMapTree | null;
  /** The shown layout; null: no map. */
  layout(): MapLayout | null;
  selected(): string | null;
  select(id: string | null): void;
  /** Layout of the map around `centre`, not shown (the glide target before drilling in). */
  layoutFor(tree: MindMapTree, centre: string): { layout: MapLayout; collapseInfo: CollapseInfo };
  /** Lays out and shows the map around `centre` now; a pending re-layout is dropped. */
  showCentre(): void;
  /** The path changed: the view state is saved, the control bar updated. */
  pathChanged(): void;
}

/**
 * Drill-down (issue #23): which node is the centre of the map, and the animated transitions in
 * and out. The path changes at once; the shown map follows when its animation swaps it.
 */
export class DrillDown {
  /** IDs of the drilled-in nodes, outermost first; empty: the whole map. Saved in the view state. */
  private steps: string[] = [];
  /**
   * Own markdown of each drilled node, by step: an ordinal ID that names another node after an
   * edit (a sibling inserted above) drops the path. Empty for a restored path until the first tree.
   */
  private content: (string | undefined)[] = [];
  /** Centre of the shown map (null: the whole map); trails `steps` while animating. */
  private shown: string | null = null;

  constructor(
    private readonly host: DrillHost,
    private readonly camera: Camera,
  ) {}

  get path(): readonly string[] {
    return this.steps;
  }

  /** Centre of the shown map; null: the whole map. */
  get centre(): string | null {
    return this.shown;
  }

  /** A map is shown around a drilled-in node. */
  get isDrilled(): boolean {
    return this.steps.length > 0;
  }

  /** A saved path (view state); checked against the next tree, which may drop it. */
  restore(path: string[]): void {
    this.steps = path;
    this.content = [];
    this.shown = path.at(-1) ?? null;
  }

  /** The selected node has children and is not the centre: it can become the centre. */
  canDrillDown(): boolean {
    const tree = this.host.tree();
    const selected = this.host.selected();
    if (!tree || !this.host.layout() || selected === null) return false;
    const centreId = this.steps.at(-1);
    const centre = centreId === undefined ? tree.root : findNode(tree.root, centreId);
    if (!centre || centre.id === selected) return false;
    return (findNode(centre, selected)?.children.length ?? 0) > 0;
  }

  /** What the control bar button and key D do now. */
  action(): DrillAction {
    if (!this.host.layout()) return null;
    if (this.canDrillDown()) return 'in';
    return this.isDrilled ? 'out' : null;
  }

  /** Control bar button and key D: into the selected node, else out one level. */
  drill(): void {
    const action = this.action();
    if (action === 'in') this.down();
    else if (action === 'out') this.out();
  }

  /** The selected node becomes the centre: only it and its subtree, fitted. */
  down(): void {
    this.camera.finish();
    const id = this.host.selected();
    if (id === null || !this.canDrillDown()) return;
    this.setPath([...this.steps, id]);
    this.camera.run([
      this.camera.glide(() => this.drilledInTarget(id)),
      this.camera.fade('out'),
      this.camera.fade('in', () => this.showCentre(id, null)),
    ]);
  }

  /** One level up; the node drilled out of stays selected, the map is fitted. */
  out(): void {
    this.camera.finish();
    const left = this.steps.at(-1);
    if (left === undefined) return;
    this.outTo(this.steps.slice(0, -1), left);
  }

  /** Straight back to the whole map; the outermost drilled node is selected, the map fitted. */
  whole(): void {
    this.camera.finish();
    const first = this.steps[0];
    if (first === undefined) return;
    this.outTo([], first);
  }

  /** Key D in the view scope; typing into a text field (the zoom input) is left alone. */
  key(evt: KeyboardEvent): boolean {
    if (isTextField(evt.target) || this.action() === null) return true;
    this.drill();
    return false;
  }

  /**
   * Drops a path that no longer fits `tree` (a drilled node was removed or renamed, or its ID
   * names another node now): the whole map again, saved. True when it dropped one.
   */
  dropLost(tree: MindMapTree): boolean {
    if (!this.isDrilled) return false;
    if (isValidDrillPath(tree, this.steps, this.content)) {
      this.content = drillMarkdown(tree, this.steps);
      return false;
    }
    this.camera.cancel();
    this.shown = null;
    this.setPath([]);
    return true;
  }

  /**
   * Drilling in reversed: cross-fade with `left` kept in place, then glide to the same transform
   * "Fit to view" sets (and the map counts as fitted, like after it).
   */
  private outTo(path: string[], left: string): void {
    this.setPath(path);
    const centre = path.at(-1) ?? null;
    this.host.select(left);
    this.camera.run([
      this.camera.fade('out'),
      this.camera.fade('in', () => this.showCentre(centre, left)),
      this.camera.fitGlide(),
    ]);
  }

  private setPath(path: string[]): void {
    this.steps = path;
    const tree = this.host.tree();
    this.content = tree ? drillMarkdown(tree, path) : [];
    this.host.pathChanged();
  }

  /**
   * Shows the map around `centre` (null: the whole map). `keep`: that node (or its nearest shown
   * ancestor) keeps the screen position of the old centre; otherwise the new map is fitted.
   */
  private showCentre(centre: string | null, keep: string | null): void {
    const layout = this.host.layout();
    if (!this.host.tree() || !layout) return;
    const old = layout.nodes.find((p) => p.node.id === this.shown) ?? null;
    const at = old && screenCentreOf(old, this.camera.transform);
    this.shown = centre;
    if (keep === null) this.camera.pendingFit = true;
    this.host.showCentre();
    if (keep === null || !at) return;
    const selected = this.host.selected();
    const kept = this.host.layout()?.nodes.find((p) => p.node.id === selected);
    if (!kept) return;
    this.camera.fitted = false;
    this.camera.apply(centredAt(kept, at, this.camera.transform.zoom));
  }

  /**
   * Glide target before drilling into `id`: the node where and as large as it will be in the
   * fitted drilled view, so the cross-fade does not move it.
   */
  private drilledInTarget(id: string): Transform | null {
    const tree = this.host.tree();
    const layout = this.host.layout();
    if (!tree || !layout) return null;
    const from = layout.nodes.find((p) => p.node.id === id);
    const drilled = this.host.layoutFor(tree, id);
    const to = drilled.layout.nodes.find((p) => p.node.id === id);
    const fit = this.camera.fitTransform(drilled.layout, drilled.collapseInfo);
    if (!from || !to || !fit) return null;
    return centredAt(from, screenCentreOf(to, fit), fit.zoom);
  }
}

/** Key events typed into a text field (the zoom input, an editor) are not map keys. */
function isTextField(target: EventTarget | null): boolean {
  const el = target as Node | null;
  if (!el?.instanceOf?.(HTMLElement)) return false;
  return el.isContentEditable || el.matches('input, textarea, select');
}
