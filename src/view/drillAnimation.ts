import type { Transform } from '../render/viewport';

/** Drill-down animation (issue #23): the view glides towards the node, then cross-fades. */
export const GLIDE_MS = 250;
export const FADE_MS = 150;

/** One step of an animation. */
export interface Phase {
  duration: number;
  /** Runs when the phase starts (before its first frame). */
  begin?(): void;
  /** Linear progress 0..1; the last call is always 1. */
  frame(progress: number): void;
}

/**
 * Runs phases one after the other on animation frames of `win` (the view's window: popout safe).
 * Only transform and opacity change per frame, which keeps large maps smooth.
 */
export class PhaseRunner {
  private index = 0;
  /** Start time of the current phase; null before its first frame. */
  private start: number | null = null;
  private handle: number | null = null;
  private active = true;

  constructor(
    private readonly win: Window,
    private readonly phases: readonly Phase[],
    private readonly done: () => void,
  ) {
    this.request();
  }

  get running(): boolean {
    return this.active;
  }

  /** Runs every remaining phase to its end at once (a new drill step, reduced motion). */
  finish(): void {
    if (!this.active) return;
    this.stopFrames();
    for (; this.index < this.phases.length; this.index++) {
      const phase = this.phases[this.index];
      if (!phase) continue;
      if (this.start === null) phase.begin?.();
      this.start = null;
      phase.frame(1);
    }
    this.end();
  }

  /** Stops where it is; the rest never runs (the view closes or shows something else). */
  cancel(): void {
    this.stopFrames();
    this.active = false;
  }

  private request(): void {
    this.handle = this.win.requestAnimationFrame((time) => this.tick(time));
  }

  private stopFrames(): void {
    if (this.handle !== null) this.win.cancelAnimationFrame(this.handle);
    this.handle = null;
  }

  private tick(time: number): void {
    this.handle = null;
    const phase = this.phases[this.index];
    if (!phase) return this.end();
    if (this.start === null) {
      this.start = time;
      phase.begin?.();
    }
    const progress = phase.duration > 0 ? Math.min(1, (time - this.start) / phase.duration) : 1;
    phase.frame(progress);
    if (progress >= 1) {
      this.index++;
      this.start = null;
      if (this.index >= this.phases.length) return this.end();
    }
    this.request();
  }

  private end(): void {
    this.active = false;
    this.done();
  }
}

/** Slow start and end (cubic). */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Linear between two transforms: every world point moves on a straight line between its screen
 * positions under `from` and `to` (the drilled node glides straight to its place).
 */
export function lerpTransform(from: Transform, to: Transform, t: number): Transform {
  const lerp = (a: number, b: number): number => a + (b - a) * t;
  return { x: lerp(from.x, to.x), y: lerp(from.y, to.y), zoom: lerp(from.zoom, to.zoom) };
}
