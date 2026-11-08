import { edgePath } from '../../src/layout/edgePath';

test('cubic bezier with horizontal tangents', () => {
  expect(
    edgePath({ fromId: 'a', toId: 'b', source: { x: 0, y: 0 }, target: { x: 100, y: 50 } }),
  ).toBe('M 0 0 C 50 0, 50 50, 100 50');
});
