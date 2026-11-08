import { buildTree } from '../../src/parser/buildTree';
import { toParserInput } from '../../src/parser/adapter';
import type { MindMapNode } from '../../src/parser/types';
import { loadFixture } from '../fixtures';

function outline(node: MindMapNode, depth = 0): string[] {
  return [
    `${'  '.repeat(depth)}${node.id}`,
    ...node.children.flatMap((c) => outline(c, depth + 1)),
  ];
}

function treeOf(name: string) {
  const { cache, text } = loadFixture(name);
  return buildTree(toParserInput(cache, text), name).root;
}

test.each<[string, string[]]>([
  ['worked-example', ['Project', '  Project/Tasks', '  Project/Notes']],
  ['skipped-levels', ['A', '  A/B', '  A/C', '    A/C/D', '  A/E']],
  ['multiple-h1', ['', '  One', '    One/One child', '  Two']],
  ['content-before-h1', ['', '  Title', '    Title/Sub']],
  ['ignored-before-h1', ['Title', '  Title/Sub']],
  ['no-h1', ['', '  Deep first', '  A', '    A/A1', '  B', '    B/B deep']],
  ['no-headings', ['']],
  ['empty', ['']],
  ['frontmatter-only', ['']],
  ['setext', ['Title', '  Title/Sub', '  Title/ATX child']],
  ['headings-in-code', ['Root', '  Root/Real']],
  [
    'duplicates-and-special',
    [
      'Root',
      '  Root/Notes',
      '  Root/Notes[2]',
      '  Root/A\\/B',
      '  Root/Notes\\[2]',
      '  Root/**Bold** `code` \\[\\[Link]]',
      '  Root/Closed',
      '  Root/Ärger 🚀 Ελληνικά',
    ],
  ],
])('%s', (name, expected) => {
  expect(outline(treeOf(name))).toEqual(expected);
});

test('virtual root is labelled with the file name', () => {
  expect(treeOf('no-h1')).toMatchObject({ id: '', label: 'no-h1', line: null });
});
