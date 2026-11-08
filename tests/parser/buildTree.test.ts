import { buildTree } from '../../src/parser/buildTree';
import type { HeadingInput, MindMapNode } from '../../src/parser/types';

function h(text: string, level: number, line: number): HeadingInput {
  return { text, level, line };
}

/** Builds headings from `#`-prefixed strings, one per line. */
function headings(...lines: string[]): HeadingInput[] {
  return lines.map((l, line) => {
    const match = /^(#+) (.*)$/.exec(l);
    if (!match?.[1] || match[2] === undefined) throw new Error(`bad heading ${l}`);
    return h(match[2], match[1].length, line);
  });
}

function outline(node: MindMapNode, depth = 0): string[] {
  return [
    `${'  '.repeat(depth)}${node.id}`,
    ...node.children.flatMap((c) => outline(c, depth + 1)),
  ];
}

test('single H1 without content before it is the root', () => {
  const tree = buildTree(
    { headings: [h('Project', 1, 0), h('Tasks', 2, 3), h('Notes', 2, 8)], firstContentLine: 0 },
    'note',
  );
  expect(tree.root).toMatchObject({
    id: 'Project',
    kind: 'root',
    label: 'Project',
    level: 1,
    line: 0,
  });
  expect(tree.root.children.map((c) => c.id)).toEqual(['Project/Tasks', 'Project/Notes']);
  expect(tree.root.children.map((c) => c.line)).toEqual([3, 8]);
  expect(tree.root.children[0]).toMatchObject({ kind: 'heading', label: 'Tasks', level: 2 });
});

test('content before the H1 gives a virtual root', () => {
  const tree = buildTree({ headings: [h('Title', 1, 4)], firstContentLine: 2 }, 'note');
  expect(tree.root).toMatchObject({ id: '', kind: 'root', label: 'note', level: 0, line: null });
  expect(outline(tree.root)).toEqual(['', '  Title']);
});

test('multiple H1s give a virtual root with H1s as first level', () => {
  const tree = buildTree(
    { headings: headings('# One', '## One child', '# Two'), firstContentLine: 0 },
    'note',
  );
  expect(outline(tree.root)).toEqual(['', '  One', '    One/One child', '  Two']);
});

test('no H1: highest level present is first level', () => {
  const tree = buildTree(
    {
      headings: headings('### Deep first', '## A', '### A1', '## B', '##### B deep'),
      firstContentLine: 0,
    },
    'note',
  );
  expect(outline(tree.root)).toEqual([
    '',
    '  Deep first',
    '  A',
    '    A/A1',
    '  B',
    '    B/B deep',
  ]);
});

test('skipped levels attach to nearest parent', () => {
  const tree = buildTree(
    { headings: headings('# A', '### B', '## C', '#### D', '## E'), firstContentLine: 0 },
    'note',
  );
  expect(outline(tree.root)).toEqual(['A', '  A/B', '  A/C', '    A/C/D', '  A/E']);
});

test('duplicate siblings get occurrence index, cousins do not', () => {
  const tree = buildTree(
    {
      headings: headings('# R', '## X', '### N', '## Y', '### N', '## X'),
      firstContentLine: 0,
    },
    'note',
  );
  expect(outline(tree.root)).toEqual(['R', '  R/X', '    R/X/N', '  R/Y', '    R/Y/N', '  R/X[2]']);
});

test.each([0, null])('no headings gives a root-only tree (firstContentLine %s)', (first) => {
  const tree = buildTree({ headings: [], firstContentLine: first }, 'My note');
  expect(tree.root).toEqual({
    id: '',
    kind: 'root',
    label: 'My note',
    level: 0,
    line: null,
    children: [],
  });
});
