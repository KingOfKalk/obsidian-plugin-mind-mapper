import { type Clip, measuredSize, type NodeLimits } from '../layout/nodeSize';
import type { SizeCache } from '../layout/sizeCache';
import type { MapLayout, Size } from '../layout/types';
import type { MindMapNode } from '../parser/types';
import { LAST_LINE_CLASS, TRAILING_TAGS_CLASS } from '../render/nestedTags';

const RELAYOUT_DEBOUNCE_MS = 100;

/** What the measurer needs from its view. */
export interface MeasureHost {
  /** The view's own window (ResizeObserver, timers): popout safe, changes with a moved tab. */
  win(): Window;
  limits(): NodeLimits;
  /** The shown layout; null: no map, nothing to measure. */
  layout(): MapLayout | null;
  /** The canvas size (0 x 0 while hidden). */
  canvasSize(): Size;
  setClipped(id: string, clip: Clip): void;
  /** Measured sizes changed: lay out again (debounced). */
  relayout(): void;
}

/**
 * Measures rendered node contents (one ResizeObserver for all of them) into the size cache; a
 * changed size schedules a debounced re-layout.
 */
export class NodeMeasurer {
  private observer: ResizeObserver | null = null;
  /** Observed content element -> node id. */
  private readonly observed = new Map<Element, string>();
  private relayoutTimer: number | null = null;

  constructor(
    private readonly host: MeasureHost,
    private readonly sizes: SizeCache,
  ) {}

  /** Observes these contents (node id -> element); the observer comes from the view's window. */
  observe(contents: ReadonlyMap<string, Element>): void {
    const win = this.host.win() as Window & typeof globalThis;
    this.observer ??= new win.ResizeObserver((entries) =>
      this.measure(entries.map((e) => e.target)),
    );
    for (const [id, el] of contents) {
      if (this.observed.get(el) === id) continue;
      this.observed.set(el, id);
      this.observer.observe(el);
    }
  }

  /** The content element is gone (culled, re-rendered). */
  release(el: Element): void {
    this.observer?.unobserve(el);
    this.observed.delete(el);
  }

  /**
   * Measures every observed content now: the ResizeObserver only reports content whose size
   * changes, not a new max node size (cache keys) or new CSS.
   */
  measureAll(): void {
    this.measure([...this.observed.keys()]);
  }

  /**
   * The view moved to another window: the ResizeObserver belongs to the old one (which may close
   * and take the observer with it), so a new one from the new window observes the contents.
   */
  moveToWindow(): void {
    this.observer?.disconnect();
    this.observer = null;
    const observed = [...this.observed];
    this.observed.clear();
    if (observed.length > 0) this.observe(new Map(observed.map(([el, id]) => [id, el])));
  }

  /** Drops a scheduled re-layout (the caller lays out now, or nothing is shown). */
  cancelRelayout(): void {
    if (this.relayoutTimer === null) return;
    this.host.win().clearTimeout(this.relayoutTimer);
    this.relayoutTimer = null;
  }

  /** Stops observing (view closed). */
  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.observed.clear();
  }

  /** Reads rendered content sizes; a change schedules a debounced re-layout. */
  private measure(elements: Element[]): void {
    const layout = this.host.layout();
    if (!layout) return;
    // A hidden tab (display: none) reports 0 x 0 for everything; keep the measured sizes.
    const { width, height } = this.host.canvasSize();
    if (width === 0 || height === 0) return;
    const nodes = new Map(layout.nodes.map((p) => [p.node.id, p.node]));
    // Content with trailing tags stretches to its node (styles.css, issue #92); measured is its
    // natural size, or a node would never get narrower again. Restored before the next frame,
    // so the ResizeObserver sees no change.
    const stretched = elements.filter((el) => el.classList.contains(TRAILING_TAGS_CLASS));
    for (const el of stretched) el.classList.add('is-measuring');
    try {
      this.measureEach(elements, nodes);
    } finally {
      for (const el of stretched) el.classList.remove('is-measuring');
    }
  }

  private measureEach(elements: Element[], nodes: ReadonlyMap<string, MindMapNode>): void {
    let changed = false;
    for (const el of elements) {
      const id = this.observed.get(el);
      const node = id === undefined ? undefined : nodes.get(id);
      // instanceOf, not instanceof: works for nodes of popout windows too.
      if (!node || !el.instanceOf(HTMLElement)) continue;
      // Not laid out (yet): no real size to take.
      if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
      const size = measuredSize(el, this.host.limits());
      // A clipped node shows no tag row (styles.css: its fade mask would hide it).
      const measured = { ...size, tags: size.clipped ? null : tagRowSize(el) };
      if (this.sizes.set(node, measured)) changed = true;
      this.host.setClipped(node.id, measured.clip);
    }
    if (changed) this.scheduleRelayout();
  }

  private scheduleRelayout(): void {
    this.cancelRelayout();
    this.relayoutTimer = this.host.win().setTimeout(() => {
      this.relayoutTimer = null;
      this.host.relayout();
    }, RELAYOUT_DEBOUNCE_MS);
  }
}

/**
 * The tag row below the box (tag position `outside`, issue #103): the last line's trailing tags
 * when styles.css positions them out of the content; null when they stay in the box. Its width is
 * the extent of its pills: the row itself may be as wide as the max node width.
 */
function tagRowSize(content: HTMLElement): Size | null {
  const row = content.querySelector<HTMLElement>(`.mind-mapper-trailing-tags.${LAST_LINE_CLASS}`);
  if (!row || content.win.getComputedStyle(row).position !== 'absolute') return null;
  const pills = Array.from(row.children).filter((child) => child.instanceOf(HTMLElement));
  if (pills.length === 0) return { width: row.offsetWidth, height: row.offsetHeight };
  const left = Math.min(...pills.map((pill) => pill.offsetLeft));
  const right = Math.max(...pills.map((pill) => pill.offsetLeft + pill.offsetWidth));
  return { width: right - left, height: row.offsetHeight };
}
