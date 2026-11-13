import type { MapLayout, Point, PositionedNode, Rect, Size } from '../layout/types';
import type { CollapseInfo } from '../render/DomMapRenderer';
import { worldViewport } from '../render/culling';
import {
  anchoredTransform,
  fitBounds,
  fitToBounds,
  IDENTITY,
  nextZoomStep,
  resetZoom,
  type Transform,
  zoomTo,
} from '../render/viewport';
import { easeInOut, FADE_MS, GLIDE_MS, lerpTransform, type Phase, PhaseRunner } from './animation';

/** What the camera needs from its view. */
export interface CameraHost {
  /** The view's own window (animation frames, reduced motion): popout safe. */
  win(): Window;
  /**
   * The canvas: the coordinate space of the transform (the view itself may have padding), with
   * `is-animating` while an animation runs. Null before the map DOM exists.
   */
  canvas(): HTMLElement | null;
  /** Shows a transform (renderer and zoom label). */
  showTransform(t: Transform): void;
  /** Opacity of the map during a fade; null: none set. */
  setOpacity(opacity: number | null): void;
  /** The shown map with its collapse toggles; null: none. */
  shown(): { layout: MapLayout; collapse: CollapseInfo } | null;
  /** Max zoom of a fit (1 = 100 %). */
  fitMaxZoom(): number;
}

/**
 * The node to keep in place across a re-layout, then its ancestors (nearest first), all as
 * positioned before: when a collapse hides the node, its nearest visible ancestor stays in place.
 */
export type Anchor = PositionedNode[];

/**
 * Camera of a map view: the transform, fitting, zoom, and its animations (glides and fades,
 * issues #23, #24; at most one runs).
 */
export class Camera {
  private current: Transform = IDENTITY;
  /** A fit is due once the canvas has a real size (opening, full screen, a hidden tab). */
  pendingFit = true;
  /** True while the transform is an (automatic or requested) fit the user has not changed since. */
  fitted = false;
  /** Last non-zero canvas size (a hidden tab reports 0 x 0). */
  private lastSize: Size = { width: 0, height: 0 };
  private animation: PhaseRunner | null = null;
  /**
   * The camera move of the running animation. A re-layout meanwhile (measured sizes) moves its ends
   * with the map, or, gliding to the fit, retargets it to the new fit: it lands where the instant
   * action plus that re-layout would have put the view.
   */
  private cameraGlide: { from: Transform; to: Transform; fit: boolean } | null = null;

  constructor(private readonly host: CameraHost) {}

  get transform(): Transform {
    return this.current;
  }

  /** Shows `t` as is (no change to `fitted`). */
  apply(t: Transform): void {
    this.current = t;
    this.host.showTransform(t);
  }

  /** User-driven transform (pan, zoom, commands): later re-layouts anchor instead of re-fitting. */
  set(t: Transform): void {
    this.finish();
    this.fitted = false;
    this.apply(t);
  }

  /** Next zoom step (spec "Zoom and pan"); wheel and pinch zoom smoothly instead. */
  zoomIn(): void {
    this.finish();
    this.zoomTo(nextZoomStep(this.current.zoom, 1));
  }

  zoomOut(): void {
    this.finish();
    this.zoomTo(nextZoomStep(this.current.zoom, -1));
  }

  /** Zoom (1 = 100 %, clamped to the limits), centered on the canvas; glides there. */
  zoomTo(zoom: number): void {
    this.finish();
    this.glideTo(() => zoomTo(this.current, zoom, this.center()));
  }

  resetZoom(): void {
    this.finish();
    this.glideTo(() => resetZoom(this.current, this.size()));
  }

  /** Glides to the fit; at once while there is nothing to fit yet (it fits when there is). */
  fitToView(): void {
    this.finish();
    const shown = this.host.shown();
    const fit = shown && this.fitTransform(shown.layout, shown.collapse);
    if (!fit || sameTransform(fit, this.current)) {
      this.pendingFit = true;
      this.tryFit();
      return;
    }
    this.run([this.fitGlide()]);
  }

  /**
   * A camera move of the user (zoom controls, Back to root, issue #24): glides to `target`
   * (evaluated now and when the glide starts); later re-layouts anchor instead of re-fitting.
   */
  glideTo(target: () => Transform | null): void {
    this.fitted = false;
    const to = target();
    if (!to || sameTransform(to, this.current)) return;
    this.run([this.glide(target)]);
  }

  /** Fits once the canvas has a real size; a hidden tab keeps the fit pending (next resize). */
  tryFit(): void {
    const shown = this.host.shown();
    if (!shown) return;
    const fitted = this.fitTransform(shown.layout, shown.collapse);
    if (!fitted) return;
    this.pendingFit = false;
    this.fitted = true;
    // Gliding to the fit: it lands on the new one instead of jumping there now.
    if (this.cameraGlide?.fit) this.cameraGlide.to = fitted;
    else this.apply(fitted);
  }

  /** The transform that fits `layout` into the canvas; null while the canvas has no size. */
  fitTransform(layout: MapLayout, collapse: CollapseInfo): Transform | null {
    return fitToBounds(fitBounds(layout, collapse.hidden), this.size(), this.host.fitMaxZoom());
  }

  /** The first anchor node still in `layout` keeps its screen position. */
  keepInPlace(anchor: Anchor, layout: MapLayout | null): void {
    const positioned = new Map(layout?.nodes.map((p) => [p.node.id, p]));
    for (const before of anchor) {
      const after = positioned.get(before.node.id);
      if (!after) continue;
      // A camera glide on its way moves with the map.
      const glide = this.cameraGlide;
      if (glide && !glide.fit) {
        glide.from = anchoredTransform(glide.from, before, after);
        glide.to = anchoredTransform(glide.to, before, after);
      }
      this.apply(anchoredTransform(this.current, before, after));
      return;
    }
  }

  /**
   * Moves the view to `target` (evaluated when the glide starts), eased; it ends exactly there.
   * `fit`: the target is the fit, a re-layout meanwhile retargets it (see `cameraGlide`).
   */
  glide(target: () => Transform | null, fit = false): Phase {
    return {
      duration: GLIDE_MS,
      begin: () => {
        const to = target();
        this.cameraGlide = to && { from: this.current, to, fit };
      },
      frame: (progress) => {
        const glide = this.cameraGlide;
        if (!glide) return;
        if (progress < 1) {
          this.apply(lerpTransform(glide.from, glide.to, easeInOut(progress)));
          return;
        }
        this.cameraGlide = null;
        this.apply(glide.to);
      },
    };
  }

  /** Glides to the fit of the shown map, which counts as fitted (like after "Fit to view"). */
  fitGlide(): Phase {
    return this.glide(() => {
      const shown = this.host.shown();
      const fit = shown && this.fitTransform(shown.layout, shown.collapse);
      // No size (hidden tab): the next resize fits.
      this.pendingFit = !fit;
      if (fit) this.fitted = true;
      return fit;
    }, true);
  }

  /** Fades the map out, or (after `begin`, the swap) in; opacity only. */
  fade(direction: 'in' | 'out', begin?: () => void): Phase {
    return {
      duration: FADE_MS,
      begin,
      frame: (progress) => {
        const opacity = direction === 'out' ? 1 - progress : progress;
        this.host.setOpacity(direction === 'in' && progress >= 1 ? null : opacity);
      },
    };
  }

  /**
   * Runs the phases on animation frames; at once with the OS setting "reduce motion". The canvas
   * has `is-animating` while it runs (E2E and screenshots wait for its end).
   */
  run(phases: Phase[]): void {
    const canvas = this.host.canvas();
    canvas?.addClass('is-animating');
    const runner = new PhaseRunner(this.host.win(), phases, () => {
      canvas?.removeClass('is-animating');
      if (this.animation !== runner) return;
      this.animation = null;
      this.cameraGlide = null;
    });
    this.animation = runner;
    if (this.reducedMotion()) runner.finish();
  }

  /** A running animation jumps to its end (a new action, pan and zoom input, an edit). */
  finish(): void {
    this.animation?.finish();
  }

  /** Stops a running animation where it is (close, a placeholder replaces the map). */
  cancel(): void {
    this.animation?.cancel();
    this.animation = null;
    this.cameraGlide = null;
    this.host.setOpacity(null);
    this.host.canvas()?.removeClass('is-animating');
  }

  /** The canvas size (0 x 0 while hidden). */
  size(): Size {
    const canvas = this.host.canvas();
    const size = canvas
      ? { width: canvas.clientWidth, height: canvas.clientHeight }
      : { width: 0, height: 0 };
    if (size.width > 0 && size.height > 0) this.lastSize = size;
    return size;
  }

  /** Center of the canvas; a hidden tab (0 x 0) uses its last real size. */
  center(): Point {
    this.size();
    return { x: this.lastSize.width / 2, y: this.lastSize.height / 2 };
  }

  /** `rect` (world) overlaps the canvas; a canvas that never had a size counts everything shown. */
  onScreen(rect: Rect): boolean {
    const current = this.size();
    const size = current.width > 0 && current.height > 0 ? current : this.lastSize;
    if (size.width === 0 || size.height === 0) return true;
    const view = worldViewport(this.current, size, 0);
    return (
      rect.x < view.x + view.width &&
      view.x < rect.x + rect.width &&
      rect.y < view.y + view.height &&
      view.y < rect.y + rect.height
    );
  }

  private reducedMotion(): boolean {
    const win = this.host.win();
    // Popout safe: the view's own window.
    return typeof win.matchMedia === 'function'
      ? win.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  }
}

/** Screen position of the center of `rect` (world) under `t`. */
export function screenCentreOf(rect: Rect, t: Transform): Point {
  return {
    x: (rect.x + rect.width / 2) * t.zoom + t.x,
    y: (rect.y + rect.height / 2) * t.zoom + t.y,
  };
}

/** The transform at `zoom` that puts the center of `rect` (world) at the screen point `at`. */
export function centredAt(rect: Rect, at: Point, zoom: number): Transform {
  return {
    x: at.x - (rect.x + rect.width / 2) * zoom,
    y: at.y - (rect.y + rect.height / 2) * zoom,
    zoom,
  };
}

export function sameTransform(a: Transform, b: Transform): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}
