import { toParserInput } from '../../src/parser/adapter';
import { buildTree } from '../../src/parser/buildTree';
import type { MindMapTree } from '../../src/parser/types';
import { CollapseState } from '../../src/view/collapseState';
import { loadFixture } from '../fixtures';

function fixtureTree(name: string, basename: string): MindMapTree {
  const { text, cache } = loadFixture(name);
  return buildTree(toParserInput(cache, text), basename);
}

test('collapseAll collapses every node with children except the root', () => {
  const tree = fixtureTree('worked-example', 'Worked example');
  const state = new CollapseState();
  state.collapseAll(tree);
  expect(state.has('Project/Tasks')).toBe(true);
  expect(state.has('Project/Notes')).toBe(true);
  expect(state.has('Project')).toBe(false);
  expect(state.has('Project/#1')).toBe(false);
  expect(state.has('Project/Tasks/#1')).toBe(false);
  expect(state.size).toBe(2);
});

test('toggle flips one id; expandAll clears', () => {
  const state = new CollapseState();
  state.toggle('a');
  state.toggle('b');
  expect(state.has('a')).toBe(true);
  state.toggle('a');
  expect(state.has('a')).toBe(false);
  expect(state.has('b')).toBe(true);
  state.expandAll();
  expect(state.size).toBe(0);
});

test('prune drops ids that are no longer in the tree or have no children', () => {
  const tree = fixtureTree('worked-example', 'Worked example');
  const state = new CollapseState();
  state.toggle('Project/Tasks');
  state.toggle('Project/#1');
  state.toggle('Project/Gone');
  state.prune(tree);
  expect(state.has('Project/Tasks')).toBe(true);
  expect(state.has('Project/#1')).toBe(false);
  expect(state.has('Project/Gone')).toBe(false);
  expect(state.size).toBe(1);
});
