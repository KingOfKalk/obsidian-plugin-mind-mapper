import { visibleTree } from '../../src/layout/visibleTree';
import { toParserInput } from '../../src/parser/adapter';
import { buildTree } from '../../src/parser/buildTree';
import type { MindMapNode, MindMapTree } from '../../src/parser/types';
import { CollapseState } from '../../src/view/collapseState';
import { loadFixture } from '../fixtures';

function fixtureTree(name: string, basename: string): MindMapTree {
  const { text, cache } = loadFixture(name);
  return buildTree(toParserInput(cache, text), basename);
}

function find(node: MindMapNode, id: string): MindMapNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = find(child, id);
    if (found) return found;
  }
  return undefined;
}

test('visibleTree cuts children of collapsed nodes and counts all hidden descendants', () => {
  const tree = fixtureTree('lists', 'lists');
  // "Level one" > "Level two" > "Level three"
  expect(find(tree.root, 'Lists/#1/#1/#1')).toBeDefined();
  const state = new CollapseState();
  state.toggle('Lists/#1');
  const { tree: visible, hidden } = visibleTree(tree, state);
  expect(find(visible.root, 'Lists/#1')?.children).toEqual([]);
  expect(find(visible.root, 'Lists/#1/#1')).toBeUndefined();
  expect(hidden.get('Lists/#1')).toBe(2);
  expect(hidden.size).toBe(1);
  // the source tree is untouched
  expect(find(tree.root, 'Lists/#1')?.children).toHaveLength(1);
  // untouched siblings keep their identity
  expect(visible.root.children[1]).toBe(tree.root.children[1]);
});

test('visibleTree with nothing collapsed returns the same root object', () => {
  const tree = fixtureTree('worked-example', 'Worked example');
  const { tree: visible, hidden } = visibleTree(tree, new CollapseState());
  expect(visible.root).toBe(tree.root);
  expect(hidden.size).toBe(0);
});

test('visibleTree never collapses the root (a drilled-in center that is collapsed in the whole map)', () => {
  const tree = fixtureTree('lists', 'lists');
  const state = new CollapseState();
  state.toggle(tree.root.id);
  const { tree: visible, hidden } = visibleTree(tree, state);
  expect(visible.root).toBe(tree.root);
  expect(hidden.size).toBe(0);
});
