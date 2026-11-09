import { easeInOut, lerpTransform, type Phase, PhaseRunner } from '../../src/view/animation';

/** requestAnimationFrame stub: frames run only when the test calls `frame(time)`. */
function frames() {
  let next = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const win = {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      pending.set(next, callback);
      return next++;
    }),
    cancelAnimationFrame: vi.fn((id: number) => pending.delete(id)),
  } as unknown as Window;
  const frame = (time: number): void => {
    const callbacks = [...pending.values()];
    pending.clear();
    for (const callback of callbacks) callback(time);
  };
  return { win, frame, pending };
}

function recorder() {
  const log: string[] = [];
  const phase = (name: string, duration: number): Phase => ({
    duration,
    begin: () => log.push(`${name} begin`),
    frame: (p) => log.push(`${name} ${p.toFixed(2)}`),
  });
  return { log, phase };
}

test('runs the phases one after the other, driven by animation frames', () => {
  const { win, frame } = frames();
  const { log, phase } = recorder();
  const done = vi.fn();
  const runner = new PhaseRunner(win, [phase('glide', 100), phase('fade', 50)], done);
  expect(runner.running).toBe(true);
  expect(log).toEqual([]);
  frame(1000);
  expect(log).toEqual(['glide begin', 'glide 0.00']);
  frame(1050);
  frame(1100);
  expect(log.slice(2)).toEqual(['glide 0.50', 'glide 1.00']);
  frame(1116);
  frame(1141);
  frame(1166);
  expect(log.slice(4)).toEqual(['fade begin', 'fade 0.00', 'fade 0.50', 'fade 1.00']);
  expect(done).toHaveBeenCalledTimes(1);
  expect(runner.running).toBe(false);
});

test('finish() runs every remaining phase to its end at once, then done; no frame is left', () => {
  const { win, frame, pending } = frames();
  const { log, phase } = recorder();
  const done = vi.fn();
  const runner = new PhaseRunner(win, [phase('a', 100), phase('b', 100), phase('c', 100)], done);
  frame(0);
  frame(50);
  runner.finish();
  expect(log).toEqual([
    'a begin',
    'a 0.00',
    'a 0.50',
    'a 1.00',
    'b begin',
    'b 1.00',
    'c begin',
    'c 1.00',
  ]);
  expect(done).toHaveBeenCalledTimes(1);
  expect(pending.size).toBe(0);
  expect(runner.running).toBe(false);
  // Finishing twice does nothing more.
  runner.finish();
  frame(500);
  expect(done).toHaveBeenCalledTimes(1);
  expect(log).toHaveLength(8);
});

test('finish() right away (reduced motion) never waits for a frame', () => {
  const { win } = frames();
  const { log, phase } = recorder();
  const done = vi.fn();
  new PhaseRunner(win, [phase('a', 100)], done).finish();
  expect(log).toEqual(['a begin', 'a 1.00']);
  expect(done).toHaveBeenCalledTimes(1);
});

test('cancel() stops without running the rest', () => {
  const { win, frame, pending } = frames();
  const { log, phase } = recorder();
  const done = vi.fn();
  const runner = new PhaseRunner(win, [phase('a', 100)], done);
  frame(0);
  runner.cancel();
  frame(200);
  expect(log).toEqual(['a begin', 'a 0.00']);
  expect(done).not.toHaveBeenCalled();
  expect(pending.size).toBe(0);
  expect(runner.running).toBe(false);
});

test('easeInOut starts and ends slowly and is symmetric', () => {
  expect(easeInOut(0)).toBe(0);
  expect(easeInOut(1)).toBe(1);
  expect(easeInOut(0.5)).toBeCloseTo(0.5);
  expect(easeInOut(0.1)).toBeLessThan(0.1);
  expect(easeInOut(0.9)).toBeGreaterThan(0.9);
});

test('lerpTransform interpolates position and zoom', () => {
  const from = { x: 0, y: 100, zoom: 1 };
  const to = { x: 200, y: -100, zoom: 2 };
  expect(lerpTransform(from, to, 0)).toEqual(from);
  expect(lerpTransform(from, to, 1)).toEqual(to);
  expect(lerpTransform(from, to, 0.5)).toEqual({ x: 100, y: 0, zoom: 1.5 });
});
