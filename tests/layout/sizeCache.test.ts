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

test('nodes whose content hashes collide never get the size of the other (issue #49)', () => {
  // Same 32-bit FNV-1a hash (be8a61cd), different markdown.
  const a = node('node 667793');
  const b = node('node 1267970');
  const other = { size: { width: 300, height: 90 }, clip: { x: false, y: true } };
  const cache = new SizeCache(() => NODE_LIMITS);
  cache.set(a, measured);
  expect(cache.get(b)).toBeUndefined();
  expect(cache.set(b, other)).toBe(true);
  expect(cache.get(a)).toEqual(measured);
  expect(cache.get(b)).toEqual(other);
  cache.retain([b]);
  expect(cache.get(a)).toBeUndefined();
  expect(cache.get(b)).toEqual(other);
});

// Issue #103: outside, the box is measured without its trailing tags, which form a row below it.
test('cache entries depend on the tag position', () => {
  let position: 'outside' | 'inside' = 'outside';
  const cache = new SizeCache(
    () => NODE_LIMITS,
    () => position,
  );
  const withRow = { ...measured, tags: { width: 80, height: 22 } };
  cache.set(node('x #a/b'), withRow);
  position = 'inside';
  expect(cache.get(node('x #a/b'))).toBeUndefined();
  position = 'outside';
  expect(cache.get(node('x #a/b'))).toEqual(withRow);
});

test('a changed tag row is a change; sub-pixel differences are not', () => {
  const cache = new SizeCache(() => NODE_LIMITS);
  const a = node('x #a/b');
  expect(cache.set(a, { ...measured, tags: null })).toBe(true);
  expect(cache.set(a, { ...measured, tags: { width: 80, height: 22 } })).toBe(true);
  expect(cache.set(a, { ...measured, tags: { width: 80.3, height: 22.2 } })).toBe(false);
  expect(cache.set(a, { ...measured, tags: { width: 80, height: 48 } })).toBe(true);
  expect(cache.set(a, { ...measured, tags: null })).toBe(true);
});
