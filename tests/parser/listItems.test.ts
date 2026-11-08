import { itemMarkdown } from '../../src/parser/listItems';
import type { ListItemInput } from '../../src/parser/types';

/** Item covering `source` (one item, possibly with continuation lines) inside `before + source`. */
function item(source: string, before = '', task: string | null = null): [string, ListItemInput] {
  const text = before + source;
  const startOffset = before.length + (source.length - source.trimStart().length);
  return [
    text,
    {
      startLine: before.split('\n').length - 1,
      endLine: before.split('\n').length - 1 + source.split('\n').length - 1,
      startOffset,
      endOffset: text.length,
      parentLine: -1,
      task,
    },
  ];
}

test.each<[string, string]>([
  ['- a', 'a'],
  ['* a', 'a'],
  ['+ a', 'a'],
  ['3. a', '3. a'],
  ['10) a', '10) a'],
])('%s -> %s', (source, expected) => {
  const [text, input] = item(source);
  expect(itemMarkdown(text, input, [])).toBe(expected);
});

test.each<[string, string, string]>([
  ['- [ ] a', ' ', '- [ ] a'],
  ['- [x] a', 'x', '- [x] a'],
  ['* [-] a', '-', '- [-] a'],
  ['1. [x] a', 'x', '1. [x] a'],
])('task %s -> %s', (source, task, expected) => {
  const [text, input] = item(source, '', task);
  expect(itemMarkdown(text, input, [])).toBe(expected);
});

test('continuation lines are dedented by the content indent', () => {
  const [text, input] = item('- [ ] Write parser\n  Details for the parser.', '', ' ');
  expect(itemMarkdown(text, input, [])).toBe('- [ ] Write parser\nDetails for the parser.');
});

test('nested item: indentation of its own line and continuation removed', () => {
  const [text, input] = item('  - Child\n    more', '- Parent\n');
  expect(itemMarkdown(text, input, [])).toBe('Child\nmore');
});

test('indented code inside an item stays a code block', () => {
  const [text, input] = item('- Item\n  Para.\n\n      code');
  expect(itemMarkdown(text, input, [])).toBe('Item\nPara.\n\n    code');
});

test('trailing block id is stripped', () => {
  const [text, input] = item('- Item ^item-id');
  expect(itemMarkdown(text, input, [])).toBe('Item');
});

test('non-image embeds in items become links', () => {
  const [text, input] = item('- see ![[Note]]');
  expect(itemMarkdown(text, input, [{ startOffset: 6, endOffset: 15, link: 'Note' }])).toBe(
    'see [[Note]]',
  );
});
