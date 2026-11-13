import { toParserInput } from '../../src/parser/adapter';
import { buildTree } from '../../src/parser/buildTree';
import type { MindMapTree } from '../../src/parser/types';
import { drillMarkdown, drilledTree, findNode, isValidDrillPath } from '../../src/view/drill';
import { loadFixture } from '../fixtures';

function fixtureTree(name: string): MindMapTree {
  const { text, cache } = loadFixture(name);
  return buildTree(toParserInput(cache, text), name);
}

test('findNode finds a node by ID anywhere in the tree, null when missing', () => {
  const tree = fixtureTree('crosslinks');
  expect(findNode(tree.root, 'Links/Beta/Inner')?.kind).toBe('heading');
  expect(findNode(tree.root, 'Links')).toBe(tree.root);
  expect(findNode(tree.root, 'Links/Missing')).toBeNull();
});

test('drilledTree: the node becomes the root (kind root), its subtree is kept as is', () => {
  const tree = fixtureTree('crosslinks');
  const beta = findNode(tree.root, 'Links/Beta');
  const drilled = drilledTree(tree, 'Links/Beta');
  expect(drilled?.root).toMatchObject({
    id: 'Links/Beta',
    kind: 'root',
    markdown: beta?.markdown,
    line: beta?.line,
  });
  // The children keep their identity (size cache, render cache).
  expect(drilled?.root.children).toEqual(beta?.children);
  expect(drilled?.root.children[0]).toBe(beta?.children[0]);
  // The source tree is untouched.
  expect(beta?.kind).toBe('heading');
});

test('drilledTree of a missing node is null', () => {
  expect(drilledTree(fixtureTree('crosslinks'), 'Links/Missing')).toBeNull();
});

test.each([
  [[], true],
  [['Links/Beta'], true],
  [['Links/Beta', 'Links/Beta/Inner'], true],
  // Gone (renamed or deleted).
  [['Links/Delta'], false],
  [['Links/Beta', 'Links/Beta/Gone'], false],
  // Each step lies inside the one before.
  [['Links/Beta', 'Links/Gamma/#2'], false],
  // The root is never a drill step; a step repeated is not inside the one before.
  [['Links'], false],
  [['Links/Beta', 'Links/Beta'], false],
])('isValidDrillPath(%j) -> %s', (path, expected) => {
  expect(isValidDrillPath(fixtureTree('crosslinks'), path)).toBe(expected);
});

test('isValidDrillPath with markdown: a step whose ID names another node now does not fit', () => {
  const before = fixtureTree('drill-shift-before');
  const after = fixtureTree('drill-shift-after');
  const known = drillMarkdown(before, ['Shift/#1']);
  expect(known).toEqual(['Alpha']);
  expect(isValidDrillPath(after, ['Shift/#1'], known)).toBe(false);
  expect(isValidDrillPath(after, ['Shift/#2'], known)).toBe(true);
  // unknown markdown (a restored path): any node with the ID
  expect(isValidDrillPath(after, ['Shift/#1'], [])).toBe(true);
});
