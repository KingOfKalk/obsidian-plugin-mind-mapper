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

/** Tiny tree from `id: childIds` pairs; the first id is the root. */
function treeOf(spec: Record<string, string[]>): MindMapTree {
  const make = (id: string): MindMapTree['root'] => ({
    id,
    kind: 'heading',
    label: id,
    markdown: id,
    sectionType: null,
    level: 0,
    line: 0,
    children: (spec[id] ?? []).map(make),
  });
  return { root: make(Object.keys(spec)[0] ?? '') };
}

describe('update after a live change', () => {
  const before = treeOf({ R: ['R/A', 'R/B'], 'R/A': ['R/A/#1'], 'R/B': ['R/B/#1'] });

  test('in collapse-all mode a moved or new branch starts collapsed', () => {
    const state = new CollapseState();
    state.collapseAll(before);
    // R/B moved under R/A: new id R/A/B; new branch R/C
    const after = treeOf({
      R: ['R/A', 'R/C'],
      'R/A': ['R/A/#1', 'R/A/B'],
      'R/A/B': ['R/A/B/#1'],
      'R/C': ['R/C/#1'],
    });
    state.update(before, after);
    expect(state.has('R/A')).toBe(true);
    expect(state.has('R/A/B')).toBe(true);
    expect(state.has('R/C')).toBe(true);
    expect(state.has('R/B')).toBe(false);
    expect(state.has('R')).toBe(false);
  });

  test('in collapse-all mode a node that gains children starts collapsed', () => {
    const state = new CollapseState();
    state.collapseAll(before);
    const after = treeOf({
      R: ['R/A', 'R/B'],
      'R/A': ['R/A/#1'],
      'R/A/#1': ['R/A/#1/#1'],
      'R/B': ['R/B/#1'],
    });
    state.update(before, after);
    expect(state.has('R/A/#1')).toBe(true);
  });

  test('a branch expanded by hand stays expanded in collapse-all mode', () => {
    const state = new CollapseState();
    state.collapseAll(before);
    state.toggle('R/A');
    state.update(before, before);
    expect(state.has('R/A')).toBe(false);
    expect(state.has('R/B')).toBe(true);
  });

  test('outside collapse-all mode new branches start expanded', () => {
    const state = new CollapseState();
    state.toggle('R/A');
    const after = treeOf({ R: ['R/A', 'R/C'], 'R/A': ['R/A/#1'], 'R/C': ['R/C/#1'] });
    state.update(before, after);
    expect(state.has('R/A')).toBe(true);
    expect(state.has('R/C')).toBe(false);
  });

  test('expandAll ends collapse-all mode', () => {
    const state = new CollapseState();
    state.collapseAll(before);
    state.expandAll();
    const after = treeOf({ R: ['R/A', 'R/C'], 'R/A': ['R/A/#1'], 'R/C': ['R/C/#1'] });
    state.update(before, after);
    expect(state.size).toBe(0);
  });

  test('in collapse-all mode the old root that became a first-level node starts collapsed', () => {
    const state = new CollapseState();
    state.collapseAll(before);
    // text typed above the H1: virtual root '', old root R is now a first-level node
    const after = treeOf({
      '': ['#1', 'R'],
      R: ['R/A', 'R/B'],
      'R/A': ['R/A/#1'],
      'R/B': ['R/B/#1'],
    });
    state.update(before, after);
    expect(state.has('R')).toBe(true);
    expect(state.has('')).toBe(false);
  });

  test('without a previous tree, collapse-all mode collapses everything again', () => {
    const state = new CollapseState();
    state.collapseAll(before);
    state.update(null, before);
    expect(state.has('R/A')).toBe(true);
    expect(state.has('R/B')).toBe(true);
    const fresh = new CollapseState();
    fresh.update(null, before);
    expect(fresh.size).toBe(0);
  });

  test('reset clears ids and ends collapse-all mode', () => {
    const state = new CollapseState();
    state.collapseAll(before);
    state.reset();
    expect(state.size).toBe(0);
    state.update(null, before);
    expect(state.size).toBe(0);
  });

  test('update prunes ids that are gone', () => {
    const state = new CollapseState();
    state.toggle('R/B');
    state.update(before, treeOf({ R: ['R/A'], 'R/A': ['R/A/#1'] }));
    expect(state.size).toBe(0);
  });
});
