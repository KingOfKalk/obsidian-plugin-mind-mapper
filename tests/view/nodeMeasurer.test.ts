import type { Clip } from '../../src/layout/nodeSize';
import { limitsFor } from '../../src/layout/nodeSize';
import { SizeCache } from '../../src/layout/sizeCache';
import type { MapLayout, PositionedNode, Size } from '../../src/layout/types';
import type { MindMapNode } from '../../src/parser/types';
import { TRAILING_TAGS_CLASS } from '../../src/render/nestedTags';
import { type MeasureHost, NodeMeasurer } from '../../src/view/nodeMeasurer';

/** Node measuring of the map view (issue #50): ResizeObserver into the size cache. */

interface FakeObserver {
  observed: Set<Element>;
  connected: boolean;
}
interface FakeObserverClass {
  instances: FakeObserver[];
  trigger(elements?: Element[]): void;
}
const FakeRO = (globalThis as unknown as { FakeResizeObserver: FakeObserverClass })
  .FakeResizeObserver;

const LIMITS = limitsFor(300, 200);

function node(id: string): MindMapNode {
  return {
    id,
    kind: 'paragraph',
    markdown: `text of ${id}`,
    line: 0,
    children: [],
  } as unknown as MindMapNode;
}

function layoutOf(nodes: MindMapNode[]): MapLayout {
  return {
    nodes: nodes.map((n) => ({ node: n, x: 0, y: 0, width: 10, height: 10 }) as PositionedNode),
    edges: [],
    dividers: [],
    bounds: { x: 0, y: 0, width: 10, height: 10 },
  };
}

/** Pretends `el` has this natural size. */
function sized(el: HTMLElement, width: number, height: number): void {
  for (const [key, value] of Object.entries({
    offsetWidth: width,
    offsetHeight: height,
    scrollWidth: width,
    scrollHeight: height,
  })) {
    Object.defineProperty(el, key, { configurable: true, value });
  }
}

function setup() {
  const a = node('a');
  const b = node('b');
  let layout: MapLayout | null = layoutOf([a, b]);
  let canvas: Size = { width: 800, height: 600 };
  const clipped: [string, Clip][] = [];
  const relayout = vi.fn();
  const sizes = new SizeCache(() => LIMITS);
  const host: MeasureHost = {
    win: () => window,
    limits: () => LIMITS,
    layout: () => layout,
    canvasSize: () => canvas,
    setClipped: (id, clip) => clipped.push([id, clip]),
    relayout,
  };
  const measurer = new NodeMeasurer(host, sizes);
  const elA = document.body.createDiv();
  const elB = document.body.createDiv();
  return {
    measurer,
    sizes,
    a,
    b,
    elA,
    elB,
    clipped,
    relayout,
    setLayout: (l: MapLayout | null) => (layout = l),
    setCanvas: (s: Size) => (canvas = s),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeRO.instances.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  document.body.empty();
});

test('a reported size goes into the size cache and schedules one debounced re-layout', () => {
  const { measurer, sizes, a, b, elA, elB, clipped, relayout } = setup();
  measurer.observe(
    new Map([
      ['a', elA],
      ['b', elB],
    ]),
  );
  expect(FakeRO.instances).toHaveLength(1);
  sized(elA, 50, 20);
  sized(elB, 500, 20);
  FakeRO.trigger();
  expect(sizes.get(a)?.size.width).toBeGreaterThan(50);
  expect(sizes.get(b)?.clip).toEqual({ x: true, y: false });
  expect(clipped).toContainEqual(['b', { x: true, y: false }]);
  expect(relayout).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100);
  expect(relayout).toHaveBeenCalledTimes(1);
});

test('the same size again schedules no re-layout', () => {
  const { measurer, elA, relayout } = setup();
  measurer.observe(new Map([['a', elA]]));
  sized(elA, 50, 20);
  FakeRO.trigger();
  vi.advanceTimersByTime(100);
  FakeRO.trigger();
  vi.advanceTimersByTime(100);
  expect(relayout).toHaveBeenCalledTimes(1);
});

test('a hidden canvas, a missing map or unlaid-out content measures nothing', () => {
  const { measurer, sizes, a, elA, setCanvas, setLayout } = setup();
  measurer.observe(new Map([['a', elA]]));
  sized(elA, 0, 0);
  FakeRO.trigger();
  expect(sizes.get(a)).toBeUndefined();
  sized(elA, 50, 20);
  setCanvas({ width: 0, height: 0 });
  FakeRO.trigger();
  expect(sizes.get(a)).toBeUndefined();
  setCanvas({ width: 800, height: 600 });
  setLayout(null);
  FakeRO.trigger();
  expect(sizes.get(a)).toBeUndefined();
});

test('cancelRelayout drops a scheduled re-layout', () => {
  const { measurer, elA, relayout } = setup();
  measurer.observe(new Map([['a', elA]]));
  sized(elA, 50, 20);
  FakeRO.trigger();
  measurer.cancelRelayout();
  vi.advanceTimersByTime(500);
  expect(relayout).not.toHaveBeenCalled();
});

test('measureAll measures every observed content without a report', () => {
  const { measurer, sizes, a, b, elA, elB } = setup();
  measurer.observe(
    new Map([
      ['a', elA],
      ['b', elB],
    ]),
  );
  sized(elA, 50, 20);
  sized(elB, 60, 20);
  measurer.measureAll();
  expect(sizes.get(a)).toBeDefined();
  expect(sizes.get(b)).toBeDefined();
});

test('release stops observing an element', () => {
  const { measurer, elA, elB } = setup();
  measurer.observe(
    new Map([
      ['a', elA],
      ['b', elB],
    ]),
  );
  measurer.release(elA);
  expect([...(FakeRO.instances[0]?.observed ?? [])]).toEqual([elB]);
});

test('moveToWindow observes the same contents with a new observer; disconnect stops it', () => {
  const { measurer, elA, elB } = setup();
  measurer.observe(
    new Map([
      ['a', elA],
      ['b', elB],
    ]),
  );
  measurer.moveToWindow();
  expect(FakeRO.instances).toHaveLength(2);
  expect(FakeRO.instances[0]?.connected).toBe(false);
  expect([...(FakeRO.instances[1]?.observed ?? [])]).toEqual([elA, elB]);
  measurer.disconnect();
  expect(FakeRO.instances[1]?.connected).toBe(false);
});

// Issue #92: content with trailing tags stretches to its node (styles.css), e.g. a kanban card in
// a wider column. Measured is its natural width (stretch off while measuring), or a node would
// never get narrower again.
test('stretched content (trailing tags) is measured without its stretch', () => {
  const { measurer, sizes, a, elA, relayout } = setup();
  measurer.observe(new Map([['a', elA]]));
  elA.addClass(TRAILING_TAGS_CLASS);
  const width = () => (elA.classList.contains('is-measuring') ? 50 : 200);
  for (const key of ['offsetWidth', 'scrollWidth']) {
    Object.defineProperty(elA, key, { configurable: true, get: width });
  }
  for (const key of ['offsetHeight', 'scrollHeight']) {
    Object.defineProperty(elA, key, { configurable: true, value: 20 });
  }
  FakeRO.trigger();
  const natural = sizes.get(a)?.size.width;
  expect(natural).toBeLessThan(100);
  expect(elA.classList.contains('is-measuring')).toBe(false);
  // Without trailing tags nothing is toggled.
  elA.removeClass(TRAILING_TAGS_CLASS);
  measurer.measureAll();
  expect(sizes.get(a)?.size.width).toBeGreaterThan(200);
  vi.advanceTimersByTime(100);
  expect(relayout).toHaveBeenCalled();
});
