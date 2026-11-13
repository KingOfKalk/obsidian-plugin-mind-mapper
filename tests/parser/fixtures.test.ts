import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildTree } from '../../src/parser/buildTree';
import { toParserInput } from '../../src/parser/adapter';
import type { MindMapNode } from '../../src/parser/types';
import { loadFixture } from '../fixtures';

/** Heading structure only (root and heading nodes). */
function outline(node: MindMapNode, depth = 0): string[] {
  const headings = node.children.filter((c) => c.kind === 'heading');
  return [`${'  '.repeat(depth)}${node.id}`, ...headings.flatMap((c) => outline(c, depth + 1))];
}

/** All nodes as `id [kind] markdown` lines. */
function nodes(node: MindMapNode, depth = 0): string[] {
  const type = node.sectionType ? `:${node.sectionType}` : '';
  const own = `${'  '.repeat(depth)}${node.id} [${node.kind}${type}] ${node.markdown}`;
  return [own, ...node.children.flatMap((c) => nodes(c, depth + 1))];
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
  ['empty-heading-no-h1', ['', '  []', '  Real', '  [][2]']],
  ['empty-heading-h1', ['Root', '  Root/[]', '    Root/[]/[]', '  Root/[][2]']],
  ['empty-h1', ['[]', '  []/[]', '  []/Named']],
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

test('paragraphs: comment skipped, block id stripped, ordinals per heading', () => {
  expect(nodes(treeOf('paragraphs'))).toEqual([
    'Absätze [root] Absätze',
    '  Absätze/#1 [paragraph] Erster Absatz mit Umlauten: Größe, Übung, Ähre.',
    '  Absätze/#2 [paragraph] Zweiter Absatz\nüber zwei Zeilen.',
    '  Absätze/Heading [heading] Heading',
    '    Absätze/Heading/#1 [paragraph] Ein Absatz mit Block-ID.',
    '    Absätze/Heading/#2 [paragraph] Letzter Absatz.',
  ]);
});

test('blocks: one node per block, nested lists and code stay inside', () => {
  const tree = treeOf('blocks');
  expect(tree.children.map((c) => `${c.id} ${c.sectionType}`)).toEqual([
    'Blocks/#1 code',
    'Blocks/#2 code',
    'Blocks/#3 table',
    'Blocks/#4 math',
    'Blocks/#5 blockquote',
    'Blocks/#6 callout',
  ]);
  expect(tree.children.every((c) => c.children.length === 0)).toBe(true);
  expect(tree.children[4]?.markdown).toBe('> Quote line\n> - list in quote\n> - second');
});

test('embeds: non-image embeds become links, images stay embeds', () => {
  expect(treeOf('embeds').children.map((c) => c.markdown)).toEqual([
    '![[pixel.png]]',
    '[[paragraphs]]',
    '[[paragraphs#Heading]]',
    '[[doc.pdf]]',
    '![alt](assets/pixel.png)',
    'Inline [[lists]] and [external](https://example.com).',
  ]);
});

test('skipped: only the paragraph with the footnote reference remains', () => {
  expect(nodes(treeOf('skipped'))).toEqual([
    'Skipped [root] Skipped',
    '  Skipped/#1 [paragraph] Text with a footnote reference.[^1]',
  ]);
});

test('worked example matches the spec tree', () => {
  expect(nodes(treeOf('worked-example'))).toEqual([
    'Project [root] Project',
    '  Project/#1 [paragraph] Intro paragraph.',
    '  Project/Tasks [heading] Tasks',
    '    Project/Tasks/#1 [list-item] - [ ] Write parser\nDetails for the parser.',
    '    Project/Tasks/#2 [list-item] - [x] Set up CI',
    '  Project/Notes [heading] Notes',
    '    Project/Notes/#1 [block:blockquote] > A quote',
  ]);
});

test('lists: nesting, continuation, ordered numbers, tasks, markers', () => {
  expect(nodes(treeOf('lists'))).toEqual([
    'Lists [root] Lists',
    '  Lists/#1 [list-item] Level one',
    '    Lists/#1/#1 [list-item] Level two',
    '      Lists/#1/#1/#1 [list-item] Level three',
    '  Lists/#2 [list-item] Item with continuation\nContinuation paragraph line.\n\n    indented code in item',
    '  Lists/#3 [list-item] Item with block id',
    '  Lists/#4 [list-item] 3. Third',
    '  Lists/#5 [list-item] 4. Fourth',
    '  Lists/#6 [list-item] - [ ] Open task',
    '  Lists/#7 [list-item] - [x] Done task',
    '  Lists/#8 [list-item] - [-] Cancelled task',
    '  Lists/#9 [list-item] Star bullet',
    '  Lists/#10 [list-item] Plus bullet ✓',
  ]);
});

test('list items inside a blockquote stay in the blockquote node', () => {
  expect(treeOf('blocks').children.some((c) => c.kind === 'list-item')).toBe(false);
});

test('comment blocks (own section type) are skipped and are not content before the H1', () => {
  expect(nodes(treeOf('comment-block'))).toEqual([
    'Title [root] Title',
    '  Title/#1 [paragraph] Visible.',
  ]);
});

test('tab-indented continuation and nested items are dedented by columns', () => {
  expect(nodes(treeOf('tabs'))).toEqual([
    'Tabs [root] Tabs',
    '  Tabs/#1 [list-item] parent\ncont line\n\npara after blank',
    '    Tabs/#1/#1 [list-item] child\nchild para\n\nchild para after blank',
    '  Tabs/#2 [list-item] fenced\n```\ncode in item\n```',
  ]);
});

test('continuation after a nested item stays with its item; nested item keeps its parent', () => {
  expect(nodes(treeOf('lazy-lists'))).toEqual([
    'Lazy [root] Lazy',
    '  Lazy/#1 [list-item] a\n\nmore of a',
    '    Lazy/#1/#1 [list-item] b',
    '  Lazy/#2 [list-item] c',
  ]);
});

test('block syntax at the start of headings and items is escaped, one node per line', () => {
  expect(nodes(treeOf('numbered'))).toEqual([
    'Numbered [root] Numbered',
    '  Numbered/1. Introduction [heading] 1\\. Introduction',
    '    Numbered/1. Introduction/#1 [list-item] 1986\\. A great year',
    '    Numbered/1. Introduction/#2 [list-item] \\+ not a nested list',
    '    Numbered/1. Introduction/#3 [list-item] \\> not a quote',
    '    Numbered/1. Introduction/#4 [list-item] \\# not a heading',
  ]);
});

test('thematic breaks: every variant is skipped, setext dashes make a heading, a mid-note block is no frontmatter', () => {
  expect(nodes(treeOf('thematic-breaks'))).toEqual([
    'Dividers [root] Dividers',
    '  Dividers/#1 [paragraph] Before dash divider.',
    '  Dividers/#2 [paragraph] After dash divider.',
    '  Dividers/#3 [paragraph] After star divider.',
    '  Dividers/#4 [paragraph] After underscore divider.',
    '  Dividers/#5 [paragraph] After spaced dash divider.',
    '  Dividers/Paragraph directly above dashes [heading] Paragraph directly above dashes',
    '    Dividers/Paragraph directly above dashes/#1 [paragraph] Under the setext heading.',
    '    Dividers/Paragraph directly above dashes/#2 [paragraph] Paragraph directly above stars',
    '    Dividers/Paragraph directly above dashes/#3 [paragraph] Paragraph directly above underscores',
    '  Dividers/Mid block [heading] Mid block',
    '  Dividers/mind-mapper-title: Not frontmatter [heading] mind-mapper-title: Not frontmatter',
    '    Dividers/mind-mapper-title: Not frontmatter/#1 [paragraph] End.',
  ]);
  const { cache } = loadFixture('thematic-breaks');
  expect(cache?.frontmatter).toEqual({ 'mind-mapper-layout': 'left-to-right' });
});

test('thematic breaks: dividers mark the next node, headings included, if it has a previous sibling', () => {
  const flagged: string[] = [];
  const visit = (node: MindMapNode): void => {
    if (node.dividerBefore) flagged.push(node.id);
    node.children.forEach(visit);
  };
  visit(treeOf('thematic-breaks'));
  expect(flagged).toEqual([
    'Dividers/#2',
    'Dividers/#3',
    'Dividers/#4',
    'Dividers/#5',
    'Dividers/Paragraph directly above dashes/#3',
    'Dividers/Mid block',
    'Dividers/mind-mapper-title: Not frontmatter',
  ]);
});

test('dividers before headings mark that heading under its parent', () => {
  const flagged: string[] = [];
  const visit = (node: MindMapNode): void => {
    if (node.dividerBefore) flagged.push(node.id);
    node.children.forEach(visit);
  };
  const root = treeOf('dividers-headings');
  visit(root);
  expect(outline(root)).toEqual([
    'example',
    '  example/test one',
    '    example/test one/test two',
    '  example/test three',
  ]);
  expect(flagged).toEqual(['example/test one/test two', 'example/test three']);
});

test('headings inside list items, quotes and callouts are not reported, so stay in their container', () => {
  expect(nodes(treeOf('headings-in-containers'))).toEqual([
    'Containers [root] Containers',
    '  Containers/#1 [list-item] \\## Heading in item',
    '  Containers/#2 [list-item] item\n## Heading in continuation',
    '  Containers/#3 [block:blockquote] > ## Heading in quote\n> quote text',
    '  Containers/#4 [block:callout] > [!note] Callout title\n> ## Heading in callout\n> callout text',
    '  Containers/Real [heading] Real',
    '    Containers/Real/#1 [paragraph] After.',
  ]);
});

const fixtureNames = readdirSync(join(process.cwd(), 'tests', 'vault', 'fixtures'))
  .filter((file) => file.endsWith('.cache.json'))
  .map((file) => file.slice(0, -'.cache.json'.length));

test.each(fixtureNames)('%s: all node IDs are unique', (name) => {
  const ids: string[] = [];
  const visit = (node: MindMapNode): void => {
    ids.push(node.id);
    node.children.forEach(visit);
  };
  visit(treeOf(name));
  expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
});
