import { edgePath } from '../../src/layout/edgePath';

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
