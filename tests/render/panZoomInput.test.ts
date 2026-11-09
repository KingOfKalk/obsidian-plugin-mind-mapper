import { Component } from 'obsidian';
import { attachPanZoom } from '../../src/render/panZoomInput';
import { IDENTITY, type Transform } from '../../src/render/viewport';

function setup(
  onTap?: (target: EventTarget | null) => void,
  onDoubleTap?: (target: EventTarget | null) => void,
) {
  const canvas = document.createElement('div');
  const nodeEl = canvas.appendChild(document.createElement('div'));
  nodeEl.className = 'mind-mapper-node';
  const nodeLabel = nodeEl.appendChild(document.createElement('span'));
  const controls = canvas.appendChild(document.createElement('div'));
  controls.className = 'mind-mapper-controls';
  // A link line's hit path: not a node, so a drag on it pans.
  const line = canvas.appendChild(document.createElement('div'));
  line.className = 'mind-mapper-crosslink-hit';
  document.body.appendChild(canvas);
  let transform: Transform = IDENTITY;
  const target = {
    getTransform: () => transform,
    setTransform: vi.fn((t: Transform) => {
      transform = t;
    }),
  };
  const component = new Component();
  attachPanZoom(component, canvas, target, onTap, onDoubleTap);
  return { canvas, nodeLabel, controls, line, target, component, get: () => transform };
}

function wheel(el: HTMLElement, init: WheelEventInit): WheelEvent {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

function pointer(el: HTMLElement, type: string, x: number, y: number, buttons = 1): void {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      buttons,
      clientX: x,
      clientY: y,
      pointerId: 1,
    }),
  );
}

function drag(start: HTMLElement, canvas: HTMLElement): void {
  pointer(start, 'pointerdown', 100, 100);
  pointer(canvas, 'pointermove', 120, 110);
  pointer(canvas, 'pointermove', 130, 120);
  pointer(canvas, 'pointerup', 130, 120);
}

test('wheel pans and prevents page scroll', () => {
  const { canvas, get } = setup();
  const event = wheel(canvas, { deltaY: 100 });
  expect(get()).toEqual({ x: 0, y: -100, zoom: 1 });
  expect(event.defaultPrevented).toBe(true);
});

test('ctrl + wheel zooms at the pointer', () => {
  const { canvas, get } = setup();
  wheel(canvas, { deltaY: -250, ctrlKey: true, clientX: 50, clientY: 40 });
  expect(get().zoom).toBeCloseTo(2);
  // the world point under the pointer stays fixed: (50 - x) / zoom === 50
  expect((50 - get().x) / get().zoom).toBeCloseTo(50);
  expect((40 - get().y) / get().zoom).toBeCloseTo(40);
});

test('wheel over a node also uses canvas coordinates', () => {
  const { nodeLabel, get } = setup();
  wheel(nodeLabel, { deltaY: -250, ctrlKey: true, clientX: 50, clientY: 40 });
  expect((50 - get().x) / get().zoom).toBeCloseTo(50);
});

test('dragging on the empty canvas pans', () => {
  const { canvas, get } = setup();
  drag(canvas, canvas);
  expect(get()).toEqual({ x: 30, y: 20, zoom: 1 });
  expect(canvas.classList.contains('is-panning')).toBe(false);
});

test('dragging that starts on a node or the controls does not pan', () => {
  const { canvas, nodeLabel, controls, target } = setup();
  drag(nodeLabel, canvas);
  drag(controls, canvas);
  expect(target.setTransform).not.toHaveBeenCalled();
});

test('listeners are removed on unload', () => {
  const { canvas, component, target } = setup();
  component.unload();
  wheel(canvas, { deltaY: 100 });
  drag(canvas, canvas);
  expect(target.setTransform).not.toHaveBeenCalled();
});

test('canvas gets is-panning while dragging', () => {
  const { canvas } = setup();
  pointer(canvas, 'pointerdown', 0, 0);
  expect(canvas.classList.contains('is-panning')).toBe(true);
  pointer(canvas, 'pointerup', 0, 0);
  expect(canvas.classList.contains('is-panning')).toBe(false);
});

test('a move without pressed button ends a drag whose pointerup was lost', () => {
  const { canvas, get } = setup();
  pointer(canvas, 'pointerdown', 100, 100);
  pointer(canvas, 'pointermove', 110, 100);
  pointer(canvas, 'pointermove', 150, 150, 0);
  pointer(canvas, 'pointermove', 200, 200, 0);
  expect(get()).toEqual({ x: 10, y: 0, zoom: 1 });
  expect(canvas.classList.contains('is-panning')).toBe(false);
});

test('onTap fires for a click without movement on the empty canvas', () => {
  const onTap = vi.fn();
  const { canvas } = setup(onTap);
  pointer(canvas, 'pointerdown', 100, 100);
  pointer(canvas, 'pointermove', 102, 101);
  pointer(canvas, 'pointerup', 102, 101, 0);
  expect(onTap).toHaveBeenCalledTimes(1);
});

test('onTap does not fire after a drag of 10 px, even when it ends at the start', () => {
  const onTap = vi.fn();
  const { canvas } = setup(onTap);
  pointer(canvas, 'pointerdown', 100, 100);
  pointer(canvas, 'pointermove', 110, 100);
  pointer(canvas, 'pointerup', 110, 100, 0);
  pointer(canvas, 'pointerdown', 100, 100);
  pointer(canvas, 'pointermove', 110, 100);
  pointer(canvas, 'pointermove', 100, 100);
  pointer(canvas, 'pointerup', 100, 100, 0);
  expect(onTap).not.toHaveBeenCalled();
});

test('onTap and onDoubleTap get the element the press started on (a link line)', () => {
  const onTap = vi.fn();
  const onDoubleTap = vi.fn();
  const { canvas, line } = setup(onTap, onDoubleTap);
  doubleClick(line, canvas);
  expect(onTap).toHaveBeenCalledTimes(2);
  expect(onTap).toHaveBeenLastCalledWith(line);
  expect(onDoubleTap).toHaveBeenCalledWith(line);
});

test('a drag that starts on a link line pans and is no tap', () => {
  const onTap = vi.fn();
  const { canvas, line, get } = setup(onTap);
  drag(line, canvas);
  expect(get()).toEqual({ x: 30, y: 20, zoom: 1 });
  expect(onTap).not.toHaveBeenCalled();
});

test('onTap does not fire for clicks on a node', () => {
  const onTap = vi.fn();
  const { canvas, nodeLabel } = setup(onTap);
  pointer(nodeLabel, 'pointerdown', 100, 100);
  pointer(canvas, 'pointerup', 100, 100, 0);
  expect(onTap).not.toHaveBeenCalled();
});

/** Two presses without movement plus the dblclick the browser sends after them. */
function doubleClick(el: HTMLElement, canvas: HTMLElement): void {
  for (let i = 0; i < 2; i++) {
    pointer(el, 'pointerdown', 100, 100);
    pointer(canvas, 'pointerup', 100, 100, 0);
  }
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
}

test('onDoubleTap fires for a double click on the empty canvas', () => {
  const onDoubleTap = vi.fn();
  const { canvas } = setup(undefined, onDoubleTap);
  doubleClick(canvas, canvas);
  expect(onDoubleTap).toHaveBeenCalledTimes(1);
});

test('onDoubleTap does not fire for a double click on a node or the controls', () => {
  const onDoubleTap = vi.fn();
  const { canvas, nodeLabel, controls } = setup(undefined, onDoubleTap);
  doubleClick(nodeLabel, canvas);
  doubleClick(controls, canvas);
  expect(onDoubleTap).not.toHaveBeenCalled();
});

test('onDoubleTap does not fire when one of the two presses dragged', () => {
  const onDoubleTap = vi.fn();
  const { canvas } = setup(undefined, onDoubleTap);
  pointer(canvas, 'pointerdown', 100, 100);
  pointer(canvas, 'pointerup', 100, 100, 0);
  pointer(canvas, 'pointerdown', 100, 100);
  pointer(canvas, 'pointermove', 140, 100);
  pointer(canvas, 'pointerup', 140, 100, 0);
  canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  // a drag, then a quick tap: the browser may still count two clicks
  pointer(canvas, 'pointerdown', 100, 100);
  pointer(canvas, 'pointermove', 140, 100);
  pointer(canvas, 'pointerup', 140, 100, 0);
  pointer(canvas, 'pointerdown', 140, 100);
  pointer(canvas, 'pointerup', 140, 100, 0);
  canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(onDoubleTap).not.toHaveBeenCalled();
});

test('onDoubleTap does not fire when the first press was on a node', () => {
  const onDoubleTap = vi.fn();
  const { canvas, nodeLabel } = setup(undefined, onDoubleTap);
  pointer(nodeLabel, 'pointerdown', 100, 100);
  pointer(canvas, 'pointerup', 100, 100, 0);
  pointer(canvas, 'pointerdown', 100, 100);
  pointer(canvas, 'pointerup', 100, 100, 0);
  canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(onDoubleTap).not.toHaveBeenCalled();
});
