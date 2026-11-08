import { crossLinkPath, edgePath } from '../../src/layout/edgePath';

test('cubic bezier with horizontal tangents', () => {
  expect(
    edgePath({
      fromId: 'a',
      toId: 'b',
      source: { x: 0, y: 0 },
      target: { x: 100, y: 50 },
      axis: 'x',
    }),
  ).toBe('M 0 0 C 50 0, 50 50, 100 50');
});

test('vertical axis uses vertical tangents', () => {
  expect(
    edgePath({
      fromId: 'a',
      toId: 'b',
      source: { x: 0, y: 0 },
      target: { x: 100, y: 50 },
      axis: 'y',
    }),
  ).toBe('M 0 0 C 0 25, 100 25, 100 50');
});

test('crossLinkPath leaves and enters through the facing vertical edges when mostly horizontal', () => {
  expect(
    crossLinkPath(
      { x: 0, y: 0, width: 100, height: 20 },
      { x: 300, y: 100, width: 100, height: 20 },
    ),
  ).toBe('M 100 10 C 180 10, 220 110, 300 110');
  expect(
    crossLinkPath(
      { x: 300, y: 100, width: 100, height: 20 },
      { x: 0, y: 0, width: 100, height: 20 },
    ),
  ).toBe('M 300 110 C 220 110, 180 10, 100 10');
});

test('crossLinkPath uses the facing horizontal edges when mostly vertical', () => {
  expect(
    crossLinkPath({ x: 0, y: 0, width: 100, height: 20 }, { x: 0, y: 200, width: 100, height: 20 }),
  ).toBe('M 50 20 C 50 92, 50 128, 50 200');
});
