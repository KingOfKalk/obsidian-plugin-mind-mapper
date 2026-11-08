import { limitsFor, NODE_LIMITS } from '../../src/layout/nodeSize';
import { SizeCache } from '../../src/layout/sizeCache';
import type { MindMapNode } from '../../src/parser/types';

function node(markdown: string, kind: MindMapNode['kind'] = 'paragraph'): MindMapNode {
  return {
    id: markdown,
    kind,
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
  const cache = new SizeCache(() => NODE_LIMITS);
  cache.set(node('a'), measured);
  cache.set(node('b'), measured);
  cache.retain([node('b'), node('c')]);
  expect(cache.get(node('a'))).toBeUndefined();
  expect(cache.get(node('b'))).toEqual(measured);
});

test('root and paragraph with the same markdown have separate cache entries', () => {
  const cache = new SizeCache(() => NODE_LIMITS);
  cache.set(node('x', 'root'), measured);
  expect(cache.get(node('x', 'root'))).toEqual(measured);
  expect(cache.get(node('x'))).toBeUndefined();
});

test('cache entries depend on the max node size', () => {
  let limits = NODE_LIMITS;
  const cache = new SizeCache(() => limits);
  cache.set(node('x'), measured);
  limits = limitsFor(500, 240);
  expect(cache.get(node('x'))).toBeUndefined();
  limits = NODE_LIMITS;
  expect(cache.get(node('x'))).toEqual(measured);
});
