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
