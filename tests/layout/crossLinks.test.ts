import { crossLinks, nodeAtLine, visibleCrossLinks } from '../../src/layout/crossLinks';
import { visibleTree } from '../../src/layout/visibleTree';
import { toParserInput } from '../../src/parser/adapter';
import { buildTree } from '../../src/parser/buildTree';
import { allNodes } from '../../src/parser/treeWalk';
import { CollapseState } from '../../src/view/collapseState';
import { loadFixture } from '../fixtures';

function tree() {
  const { text, cache } = loadFixture('crosslinks');
  return buildTree(toParserInput(cache, text), 'crosslinks');
}

test('nodeAtLine picks the innermost node', () => {
  const t = tree();
  expect(nodeAtLine(t, 4)?.id).toBe('Links/Alpha/#1');
  expect(nodeAtLine(t, 10)?.id).toBe('Links/Beta/Inner/#1');
  expect(nodeAtLine(t, 8)?.id).toBe('Links/Beta/Inner');
  expect(nodeAtLine(t, 0)?.id).toBe('Links');
  expect(nodeAtLine(t, 17)?.id).toBe('Links/Gamma/#2/#1');
  expect(nodeAtLine(t, 3)).toBeNull();
});

test('crossLinks maps lines to node ids, drops self links and duplicates', () => {
  expect(
    crossLinks(tree(), [
      { fromLine: 4, toLine: 6 },
      { fromLine: 4, toLine: 6 },
      { fromLine: 4, toLine: 4 },
      { fromLine: 4, toLine: 3 },
      { fromLine: 16, toLine: 12 },
    ]),
  ).toEqual([
    { fromId: 'Links/Alpha/#1', toId: 'Links/Beta' },
    { fromId: 'Links/Gamma/#2', toId: 'Links/Gamma' },
  ]);
});

test('visibleCrossLinks moves hidden ends to the nearest visible ancestor', () => {
  const t = tree();
  const collapse = new CollapseState();
  collapse.toggle('Links/Beta');
  collapse.toggle('Links/Gamma');
  const visible = new Set(allNodes(visibleTree(t, collapse).tree).map((n) => n.id));
  expect(
    visibleCrossLinks(
      t,
      [
        { fromId: 'Links/Gamma/#2/#1', toId: 'Links/Beta/Inner' },
        { fromId: 'Links/Gamma/#1', toId: 'Links/Beta' },
        { fromId: 'Links/Gamma/#2', toId: 'Links/Gamma' },
        { fromId: 'Links/Alpha/#1', toId: 'Links/Beta/Inner/#1' },
      ],
      visible,
    ),
  ).toEqual([
    { fromId: 'Links/Gamma', toId: 'Links/Beta' },
    { fromId: 'Links/Alpha/#1', toId: 'Links/Beta' },
  ]);
});
