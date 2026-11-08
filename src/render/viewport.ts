import type { Point, Rect, Size } from '../layout/types';

/** screen = world * zoom + (x, y) */
export interface Transform {
  x: number;
  y: number;
  zoom: number;
}

export const ZOOM_LIMITS = { min: 0.1, max: 4 };
export const ZOOM_STEP = 1.2;
export const FIT_PADDING = 40;
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

/** Zooms by `factor`, keeping the world point under screen point `at` fixed. */
export function zoomAt(t: Transform, factor: number, at: Point): Transform {
  const zoom = clampZoom(t.zoom * factor);
  const ratio = zoom / t.zoom;
  return { x: at.x - (at.x - t.x) * ratio, y: at.y - (at.y - t.y) * ratio, zoom };
}

/** `null` while the viewport has no size (hidden tab); never zooms above 1. */
export function fitToBounds(bounds: Rect, size: Size): Transform | null {
  if (size.width <= 0 || size.height <= 0) return null;
  const zoom = clampZoom(
    Math.min(
      (size.width - 2 * FIT_PADDING) / bounds.width,
      (size.height - 2 * FIT_PADDING) / bounds.height,
      1,
    ),
  );
  return {
    x: size.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: size.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  };
}

export function resetZoom(t: Transform, size: Size): Transform {
  return zoomAt(t, 1 / t.zoom, { x: size.width / 2, y: size.height / 2 });
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
