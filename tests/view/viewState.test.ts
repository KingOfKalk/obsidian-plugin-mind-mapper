import { fileBasename, parseViewState } from '../../src/view/viewState';

const none = { layout: null, theme: null, drill: [] };

test.each([
  [{ file: 'a/b.md' }, { file: 'a/b.md', ...none }],
  [{ file: '' }, { file: null, ...none }],
  [{ file: 42 }, { file: null, ...none }],
  [{}, { file: null, ...none }],
  [undefined, { file: null, ...none }],
  [null, { file: null, ...none }],
  ['a/b.md', { file: null, ...none }],
])('parseViewState(%j) -> %j', (input, expected) => {
  expect(parseViewState(input)).toEqual(expected);
});

test.each([
  [
    { file: 'a.md', layout: 'top-to-bottom', theme: 'ocean' },
    { file: 'a.md', layout: 'top-to-bottom', theme: 'ocean', drill: [] },
  ],
  [
    { file: 'a.md', layout: null, theme: null },
    { file: 'a.md', ...none },
  ],
  // Unknown or malformed overrides are dropped: the note's value applies.
  [
    { file: 'a.md', layout: 'spiral', theme: 'neon' },
    { file: 'a.md', ...none },
  ],
  [
    { file: 'a.md', layout: 3, theme: ['ocean'] },
    { file: 'a.md', ...none },
  ],
  [
    { file: 'a.md', layout: 'Top-To-Bottom', theme: 'Ocean' },
    { file: 'a.md', ...none },
  ],
  [{ layout: 'left-to-right' }, { file: null, layout: 'left-to-right', theme: null, drill: [] }],
])('layout and theme overrides: parseViewState(%j) -> %j', (input, expected) => {
  expect(parseViewState(input)).toEqual(expected);
});

test.each([
  [{ file: 'a.md', drill: ['A/B', 'A/B/#1'] }, ['A/B', 'A/B/#1']],
  // Older states have no drill path: the whole map.
  [{ file: 'a.md' }, []],
  [{ file: 'a.md', drill: [] }, []],
  // Malformed paths are dropped as a whole: the whole map.
  [{ file: 'a.md', drill: 'A/B' }, []],
  [{ file: 'a.md', drill: ['A/B', 3] }, []],
  [{ file: 'a.md', drill: ['A/B', ''] }, []],
  [{ file: 'a.md', drill: null }, []],
])('drill path: parseViewState(%j).drill -> %j', (input, expected) => {
  expect(parseViewState(input).drill).toEqual(expected);
});

test.each([
  ['Note.md', 'Note'],
  ['Notizen/Über Ärger 🚀.md', 'Über Ärger 🚀'],
  ['v1.2 notes.md', 'v1.2 notes'],
  ['a/b/c.md', 'c'],
])('fileBasename(%s) -> %s', (path, expected) => {
  expect(fileBasename(path)).toBe(expected);
});
