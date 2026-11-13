import { crossLinks, lineIndex, visibleCrossLinks } from '../../src/layout/crossLinks';
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

test('lineIndex picks the innermost node', () => {
  const at = lineIndex(tree());
  expect(at(4)?.id).toBe('Links/Alpha/#1');
  expect(at(10)?.id).toBe('Links/Beta/Inner/#1');
  expect(at(8)?.id).toBe('Links/Beta/Inner');
  expect(at(0)?.id).toBe('Links');
  expect(at(17)?.id).toBe('Links/Gamma/#2/#1');
  expect(at(3)).toBeNull();
});

test('crossLinks maps lines to node ids and keeps the source line; drops self links and duplicates', () => {
  expect(
    crossLinks(tree(), [
      { fromLine: 4, toLine: 6 },
      { fromLine: 4, toLine: 6 },
      { fromLine: 4, toLine: 4 },
      { fromLine: 4, toLine: 3 },
      { fromLine: 16, toLine: 12 },
    ]),
  ).toEqual([
    { fromId: 'Links/Alpha/#1', toId: 'Links/Beta', line: 4 },
    { fromId: 'Links/Gamma/#2', toId: 'Links/Gamma', line: 16 },
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
        { fromId: 'Links/Gamma/#2/#1', toId: 'Links/Beta/Inner', line: 17 },
        { fromId: 'Links/Gamma/#1', toId: 'Links/Beta', line: 14 },
        { fromId: 'Links/Gamma/#2', toId: 'Links/Gamma', line: 16 },
        { fromId: 'Links/Alpha/#1', toId: 'Links/Beta/Inner/#1', line: 4 },
      ],
      visible,
    ),
  ).toEqual([
    { fromId: 'Links/Gamma', toId: 'Links/Beta', line: 17 },
    { fromId: 'Links/Alpha/#1', toId: 'Links/Beta', line: 4 },
  ]);
});
