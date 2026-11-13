import type { MapLayout, Point, Rect, Side, Size } from '../layout/types';

/** screen = world * zoom + (x, y) */
export interface Transform {
  x: number;
  y: number;
  zoom: number;
}

export const ZOOM_LIMITS = { min: 0.1, max: 4 };
/** Zoom in / out (controls, commands) snap to these; wheel and pinch zoom smoothly. */
export const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
/** Fit margin per side in screen px: a share of the shorter canvas side, at least `min`. */
export const FIT_MARGIN = { ratio: 0.08, min: 48 };
/** A zoom this close to a step counts as that step (float noise from zoomAt). */
const STEP_EPSILON = 1e-6;
export const IDENTITY: Transform = { x: 0, y: 0, zoom: 1 };

const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;
const WHEEL_ZOOM_SPEED = 250;

export function panBy(t: Transform, dx: number, dy: number): Transform {
  return { x: t.x + dx, y: t.y + dy, zoom: t.zoom };
}

function clampZoom(zoom: number): number {
  return Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, zoom));
}

/** Pans so that a node that moved from world point `before` to `after` stays at the same screen point. */
export function anchoredTransform(t: Transform, before: Point, after: Point): Transform {
  return {
    x: t.x + (before.x - after.x) * t.zoom,
    y: t.y + (before.y - after.y) * t.zoom,
    zoom: t.zoom,
  };
}

/** Zooms by `factor`, keeping the world point under screen point `at` fixed. */
export function zoomAt(t: Transform, factor: number, at: Point): Transform {
  return zoomTo(t, t.zoom * factor, at);
}

/** Sets `zoom` (clamped to the limits), keeping the world point under screen point `at` fixed. */
export function zoomTo(t: Transform, zoom: number, at: Point): Transform {
  const next = clampZoom(zoom);
  const ratio = next / t.zoom;
  return { x: at.x - (at.x - t.x) * ratio, y: at.y - (at.y - t.y) * ratio, zoom: next };
}

/** The next step strictly above (`1`) or below (`-1`) `zoom`; at either end the end itself. */
export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STEPS.find((step) => step > zoom + STEP_EPSILON) ?? ZOOM_LIMITS.max;
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom - STEP_EPSILON) ?? ZOOM_LIMITS.min;
}

/**
 * Zoom typed as a percentage ("129", "129%", "129 %", German "87,5"), clamped to the zoom
 * limits; `null` for anything else.
 */
export function parseZoomPercent(text: string): number | null {
  const match = /^(\d+(?:[.,]\d+)?)\s*%?$/.exec(text.trim());
  if (!match?.[1]) return null;
  return clampZoom(Number(match[1].replace(',', '.')) / 100);
}

export function fitMargin(size: Size): number {
  return Math.max(FIT_MARGIN.min, FIT_MARGIN.ratio * Math.min(size.width, size.height));
}

/** Collapse toggle box in world px, mirroring `button.mind-mapper-collapse` in styles.css. */
const TOGGLE = {
  /** Gap between the node edge and the toggle (the CSS translate). */
  offset: 3,
  height: 18,
  minWidth: 18,
  /** Horizontal padding and border. */
  chrome: 10,
  /** Generous width of one digit of the hidden count, so fit never cuts a badge. */
  digit: 8,
};

/** The layout bounds plus the collapse toggles and hidden-count badges outside the node rects. */
export function fitBounds(layout: MapLayout, hidden: ReadonlyMap<string, number>): Rect {
  const parents = new Set(layout.edges.map((e) => e.fromId));
  let { x: left, y: top } = layout.bounds;
  let right = left + layout.bounds.width;
  let bottom = top + layout.bounds.height;
  // Kanban: no toggles (its count bubbles sit inside the column headers).
  const nodes = layout.toggles === false ? [] : layout.nodes;
  for (const p of nodes) {
    // Like the renderer: the root never has a toggle.
    if (p.node.kind === 'root') continue;
    const count = hidden.get(p.node.id);
    if (count === undefined && !parents.has(p.node.id)) continue;
    const width =
      count === undefined
        ? TOGGLE.minWidth
        : Math.max(TOGGLE.minWidth, TOGGLE.chrome + TOGGLE.digit * String(count).length);
    const box = toggleBox(p, p.childSide, width);
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function toggleBox(node: Rect, side: Side, width: number): Rect {
  const { offset, height } = TOGGLE;
  const midX = node.x + node.width / 2;
  const midY = node.y + node.height / 2;
  switch (side) {
    case 'right':
      return { x: node.x + node.width + offset, y: midY - height / 2, width, height };
    case 'left':
      return { x: node.x - offset - width, y: midY - height / 2, width, height };
    case 'bottom':
      return { x: midX - width / 2, y: node.y + node.height + offset, width, height };
    case 'top':
      return { x: midX - width / 2, y: node.y - offset - height, width, height };
  }
}

/**
 * `null` while the viewport has no size (hidden tab); never zooms above `maxZoom`. `bounds`
 * should include the toggles (see `fitBounds`).
 */
export function fitToBounds(bounds: Rect, size: Size, maxZoom: number): Transform | null {
  if (size.width <= 0 || size.height <= 0) return null;
  const margin = fitMargin(size);
  const zoom = clampZoom(
    Math.min(
      (size.width - 2 * margin) / bounds.width,
      (size.height - 2 * margin) / bounds.height,
      maxZoom,
    ),
  );
  return {
    x: size.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: size.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  };
}

export function resetZoom(t: Transform, size: Size): Transform {
  return zoomTo(t, 1, { x: size.width / 2, y: size.height / 2 });
}

export type WheelAction =
  { kind: 'pan'; dx: number; dy: number } | { kind: 'zoom'; factor: number; at: Point };

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  offsetX: number;
  offsetY: number;
}

/** Canvas-style: wheel pans, Ctrl/Cmd + wheel and pinch (ctrlKey wheel) zoom at the pointer. */
export function wheelAction(e: WheelInput): WheelAction {
  const scale = e.deltaMode === 1 ? LINE_HEIGHT_PX : e.deltaMode === 2 ? PAGE_HEIGHT_PX : 1;
  const dx = e.deltaX * scale;
  const dy = e.deltaY * scale;
  if (e.ctrlKey || e.metaKey) {
    return {
      kind: 'zoom',
      factor: 2 ** (-dy / WHEEL_ZOOM_SPEED),
      at: { x: e.offsetX, y: e.offsetY },
    };
  }
  return { kind: 'pan', dx: -dx, dy: -dy };
}

export function transformCss(t: Transform): string {
  return `translate(${t.x}px, ${t.y}px) scale(${t.zoom})`;
}
