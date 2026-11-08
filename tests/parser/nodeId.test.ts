import { childId, escapeSegment } from '../../src/parser/nodeId';

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
