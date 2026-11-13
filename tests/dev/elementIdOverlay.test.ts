import { ElementIdOverlay } from '../../src/dev/elementIdOverlay';

function element(id: string, rect: { x: number; y: number; width: number; height: number }) {
  const el = document.body.createDiv({ attr: { 'data-mm-id': id } });
  el.getBoundingClientRect = () => DOMRect.fromRect(rect);
  return el;
}

const layer = () => document.body.querySelector<HTMLElement>('.mind-mapper-dev-id-overlay');
const labels = () =>
  [...(layer()?.querySelectorAll<HTMLElement>('.mind-mapper-dev-id-label') ?? [])].filter(
    (el) => !el.hidden,
  );

afterEach(() => document.body.empty());

test('toggle shows a label with the ID next to each element and removes them again', () => {
  element('map.canvas', { x: 0, y: 0, width: 600, height: 400 });
  element('controls.fit', { x: 300, y: 360, width: 24, height: 24 });
  const overlay = new ElementIdOverlay();
  overlay.toggle(document);
  expect(overlay.active).toBe(true);
  expect(labels().map((l) => l.textContent)).toEqual(['map.canvas', 'controls.fit']);
  overlay.toggle(document);
  expect(overlay.active).toBe(false);
  expect(layer()).toBeNull();
});

test('the overlay does not take clicks and the labels carry no ID themselves', () => {
  element('map.canvas', { x: 0, y: 0, width: 600, height: 400 });
  const overlay = new ElementIdOverlay();
  overlay.toggle(document);
  expect(layer()?.style.pointerEvents).toBe('none');
  expect(layer()?.style.position).toBe('fixed');
  expect(layer()?.querySelector('[data-mm-id]')).toBeNull();
  overlay.toggle(document);
});

test('elements without a box (hidden) get no label', () => {
  element('map.placeholder', { x: 0, y: 0, width: 0, height: 0 });
  element('map.canvas', { x: 0, y: 0, width: 600, height: 400 });
  const overlay = new ElementIdOverlay();
  overlay.toggle(document);
  expect(labels().map((l) => l.textContent)).toEqual(['map.canvas']);
  overlay.toggle(document);
});

test('a label follows its element on the next update', () => {
  const el = element('map.canvas', { x: 10, y: 20, width: 600, height: 400 });
  const overlay = new ElementIdOverlay();
  overlay.toggle(document);
  expect(labels()[0]?.style.left).toBe('11px');
  el.getBoundingClientRect = () => DOMRect.fromRect({ x: 50, y: 20, width: 600, height: 400 });
  overlay.update();
  expect(labels()[0]?.style.left).toBe('51px');
  overlay.toggle(document);
});

test('elements covered by another element (behind the full screen overlay) get no label', () => {
  element('ribbon.open-mind-map', { x: 5, y: 100, width: 24, height: 24 });
  const overlayEl = element('fullscreen.overlay', { x: 0, y: 0, width: 600, height: 400 });
  const chip = overlayEl.createDiv({ attr: { 'data-mm-id': 'fullscreen.title-chip' } });
  chip.getBoundingClientRect = () => DOMRect.fromRect({ x: 250, y: 5, width: 100, height: 20 });
  // The overlay is on top everywhere; the chip takes no pointer events (hit test finds the overlay).
  document.elementFromPoint = () => overlayEl;
  const overlay = new ElementIdOverlay();
  overlay.toggle(document);
  expect(labels().map((l) => l.textContent)).toEqual([
    'fullscreen.overlay',
    'fullscreen.title-chip',
  ]);
  overlay.toggle(document);
  Reflect.deleteProperty(document, 'elementFromPoint');
});

test('a label that would leave the window goes on the other side of its element', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
  element('fullscreen.exit', { x: 570, y: 10, width: 24, height: 24 });
  const overlay = new ElementIdOverlay();
  overlay.toggle(document);
  const label = labels()[0];
  Object.defineProperty(label, 'offsetWidth', { configurable: true, value: 90 });
  overlay.update();
  expect(label?.style.left).toBe(`${570 - 2 - 90}px`);
  overlay.toggle(document);
});

test('lines are labelled even where a wider hit path covers them', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('data-mm-id', 'link.line');
  line.getBoundingClientRect = () => DOMRect.fromRect({ x: 100, y: 100, width: 80, height: 60 });
  svg.appendChild(line);
  const cover = document.body.createDiv();
  document.elementFromPoint = () => cover;
  const overlay = new ElementIdOverlay();
  overlay.toggle(document);
  expect(labels().map((l) => l.textContent)).toEqual(['link.line']);
  overlay.toggle(document);
  Reflect.deleteProperty(document, 'elementFromPoint');
});

test('an element with a data-mm-state is labelled "id [state]" and follows state changes', () => {
  const el = element('node.toggle', { x: 100, y: 100, width: 18, height: 18 });
  el.setAttribute('data-mm-state', 'collapsed');
  element('controls.fit', { x: 300, y: 360, width: 24, height: 24 });
  const overlay = new ElementIdOverlay();
  overlay.toggle(document);
  expect(labels().map((l) => l.textContent)).toEqual(['node.toggle [collapsed]', 'controls.fit']);
  el.setAttribute('data-mm-state', 'expanded');
  overlay.update();
  expect(labels().map((l) => l.textContent)).toEqual(['node.toggle [expanded]', 'controls.fit']);
  overlay.toggle(document);
});
