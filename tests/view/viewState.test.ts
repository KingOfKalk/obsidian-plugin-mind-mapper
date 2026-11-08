import { fileBasename, parseViewState } from '../../src/view/viewState';

test.each([
  [{ file: 'a/b.md' }, { file: 'a/b.md' }],
  [{ file: '' }, { file: null }],
  [{ file: 42 }, { file: null }],
  [{}, { file: null }],
  [undefined, { file: null }],
  [null, { file: null }],
  ['a/b.md', { file: null }],
])('parseViewState(%j) -> %j', (input, expected) => {
  expect(parseViewState(input)).toEqual(expected);
});

test.each([
  ['Note.md', 'Note'],
  ['Notizen/Über Ärger 🚀.md', 'Über Ärger 🚀'],
  ['v1.2 notes.md', 'v1.2 notes'],
  ['a/b/c.md', 'c'],
])('fileBasename(%s) -> %s', (path, expected) => {
  expect(fileBasename(path)).toBe(expected);
});
