import { childId, escapeSegment, ordinalId } from '../../src/parser/nodeId';

test('childId joins parent and text', () => {
  expect(childId('Project', 'Tasks', 1)).toBe('Project/Tasks');
});

test('childId adds occurrence index for duplicates', () => {
  expect(childId('Project', 'Notes', 2)).toBe('Project/Notes[2]');
});

test('childId under the virtual root has no prefix', () => {
  expect(childId('', 'A', 1)).toBe('A');
});

test.each([
  ['A/B', 'A\\/B'],
  ['Notes[2]', 'Notes\\[2]'],
  ['a\\b', 'a\\\\b'],
  ['Ärger 🚀', 'Ärger 🚀'],
])('escapeSegment(%s) -> %s', (text, expected) => {
  expect(escapeSegment(text)).toBe(expected);
});

test('a heading named like an indexed duplicate does not collide', () => {
  expect(childId('R', 'Notes[2]', 1)).not.toBe(childId('R', 'Notes', 2));
});

test('ordinalId appends the 1-based ordinal', () => {
  expect(ordinalId('Project/Tasks', 1)).toBe('Project/Tasks/#1');
  expect(ordinalId('', 2)).toBe('#2');
});

test('escapeSegment escapes # so headings cannot collide with ordinals', () => {
  expect(escapeSegment('#1')).toBe('\\#1');
  expect(childId('R', '#1', 1)).not.toBe(ordinalId('R', 1));
});
