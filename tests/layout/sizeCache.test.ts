import { SizeCache } from '../../src/layout/sizeCache';
import type { MindMapNode } from '../../src/parser/types';

function node(markdown: string): MindMapNode {
  return {
    id: markdown,
    kind: 'paragraph',
    label: markdown,
    markdown,
    sectionType: null,
    level: 0,
    line: 0,
    children: [],
  };
}

const measured = { size: { width: 100, height: 30 }, clip: { x: false, y: false } };

test('the size cache keeps only nodes of the current tree', () => {
  const cache = new SizeCache();
  cache.set(node('a'), measured);
  cache.set(node('b'), measured);
  cache.retain([node('b'), node('c')]);
  expect(cache.get(node('a'))).toBeUndefined();
  expect(cache.get(node('b'))).toEqual(measured);
});
