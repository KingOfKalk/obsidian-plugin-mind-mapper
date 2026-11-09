import type { Component } from 'obsidian';
import { panBy, type Transform, wheelAction, zoomAt } from './viewport';

export interface PanZoomTarget {
  getTransform(): Transform;
  setTransform(t: Transform): void;
}

const NO_PAN_SELECTOR = '.mind-mapper-node, .mind-mapper-controls, .mind-mapper-collapse';
/** A press that moved less than this (px) is a tap, not a drag. */
const TAP_TOLERANCE = 4;

/**
 * Canvas-style input: wheel pans, Ctrl/Cmd + wheel and pinch zoom, drag on empty canvas (or a link
 * line) pans.
 * `onTap`: a press and release on the empty canvas (or a link line) without dragging.
 * `onDoubleTap`: a double click there whose two presses were both taps.
 * Both get the element the (last) press started on: after a press the canvas captures the pointer,
 * so the release and the click events no longer target it.
 */
export function attachPanZoom(
  component: Component,
  canvasEl: HTMLElement,
  target: PanZoomTarget,
  onTap?: (target: EventTarget | null) => void,
  onDoubleTap?: (target: EventTarget | null) => void,
): void {
  component.registerDomEvent(
    canvasEl,
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvasEl.getBoundingClientRect();
      const action = wheelAction({
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
      });
      const t = target.getTransform();
      target.setTransform(
        action.kind === 'pan'
          ? panBy(t, action.dx, action.dy)
          : zoomAt(t, action.factor, action.at),
      );
    },
    { passive: false },
  );

  let last: { x: number; y: number; pointerId: number } | null = null;
  let start: { x: number; y: number; moved: boolean; target: EventTarget | null } | null = null;
  /** Where the last tap started (handed to `onDoubleTap`). */
  let tapTarget: EventTarget | null = null;
  /** Taps in a row on the empty canvas; a drag or a press on a node or the controls resets it. */
  let taps = 0;

  component.registerDomEvent(canvasEl, 'pointerdown', (e) => {
    if (e.button !== 0) return;
    if (isNoPan(e.target)) {
      taps = 0;
      return;
    }
    last = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    start = { x: e.clientX, y: e.clientY, moved: false, target: e.target };
    canvasEl.setPointerCapture(e.pointerId);
    canvasEl.addClass('is-panning');
  });

  const end = (e: PointerEvent): void => {
    if (!last || e.pointerId !== last.pointerId) return;
    if (canvasEl.hasPointerCapture(e.pointerId)) canvasEl.releasePointerCapture(e.pointerId);
    canvasEl.removeClass('is-panning');
    last = null;
    start = null;
  };

  component.registerDomEvent(canvasEl, 'pointermove', (e) => {
    if (!last || e.pointerId !== last.pointerId) return;
    // The pointerup can get lost (e.g. released outside the window); no pressed button ends the drag.
    if ((e.buttons & 1) === 0) {
      taps = 0;
      return end(e);
    }
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= TAP_TOLERANCE) {
      start.moved = true;
    }
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { ...last, x: e.clientX, y: e.clientY };
    target.setTransform(panBy(target.getTransform(), dx, dy));
  });

  component.registerDomEvent(canvasEl, 'pointerup', (e) => {
    if (last?.pointerId !== e.pointerId || start === null) return end(e);
    const tap = !start.moved;
    const target = start.target;
    taps = tap ? taps + 1 : 0;
    end(e);
    if (!tap) return;
    tapTarget = target;
    onTap?.(target);
  });
  component.registerDomEvent(canvasEl, 'pointercancel', (e) => {
    taps = 0;
    end(e);
  });

  // The browser's dblclick keeps the system double-click speed; the tap count keeps a double click
  // whose presses panned the map from also fitting it.
  component.registerDomEvent(canvasEl, 'dblclick', (e) => {
    const double = taps >= 2 && !isNoPan(e.target);
    taps = 0;
    if (double) onDoubleTap?.(tapTarget);
  });
}

function isNoPan(target: EventTarget | null): boolean {
  const node = target as Node | null;
  // instanceOf, not instanceof: works for nodes of popout windows too.
  return node?.instanceOf(Element) === true && node.closest(NO_PAN_SELECTOR) !== null;
}
