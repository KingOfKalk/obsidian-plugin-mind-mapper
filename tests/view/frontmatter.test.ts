import { invalidOptionMessage, readMapOptions } from '../../src/view/frontmatter';

test('valid layout and title', () => {
  expect(
    readMapOptions(
      { 'mind-mapper-layout': 'top-to-bottom', 'mind-mapper-title': '  Plan  ' },
      'circle-clockwise',
      false,
    ),
  ).toEqual({ title: 'Plan', layout: 'top-to-bottom', collapsed: false, invalid: [] });
});

test('absent keys use the defaults without warnings', () => {
  expect(readMapOptions(undefined, 'left-to-right', false)).toEqual({
    title: null,
    layout: 'left-to-right',
    collapsed: false,
    invalid: [],
  });
  expect(readMapOptions({ tags: ['x'] }, 'circle-clockwise', true)).toEqual({
    title: null,
    layout: 'circle-clockwise',
    collapsed: true,
    invalid: [],
  });
});

test.each([['spiral'], [3], [['left-to-right']]])(
  'invalid layout %j falls back with a warning',
  (value) => {
    const options = readMapOptions({ 'mind-mapper-layout': value }, 'right-to-left', false);
    expect(options.layout).toBe('right-to-left');
    expect(options.invalid).toEqual([{ key: 'mind-mapper-layout', value: String(value) }]);
  },
);

test.each([
  [42, '42'],
  [['a', 'b'], 'a,b'],
  [true, 'true'],
  [{ a: 1 }, '{"a":1}'],
])('title %j that is not text falls back with a warning', (value, shown) => {
  const options = readMapOptions({ 'mind-mapper-title': value }, 'circle-clockwise', false);
  expect(options.title).toBeNull();
  expect(options.invalid).toEqual([{ key: 'mind-mapper-title', value: shown }]);
});

test.each(['', '   '])('empty title %j falls back silently', (value) => {
  expect(readMapOptions({ 'mind-mapper-title': value }, 'circle-clockwise', false)).toEqual({
    title: null,
    layout: 'circle-clockwise',
    collapsed: false,
    invalid: [],
  });
});

test('keys without value (null) fall back silently', () => {
  expect(
    readMapOptions(
      { 'mind-mapper-title': null, 'mind-mapper-layout': null, 'mind-mapper-collapsed': null },
      'circle-clockwise',
      true,
    ),
  ).toEqual({ title: null, layout: 'circle-clockwise', collapsed: true, invalid: [] });
});

test('the old mind_map_* keys are ignored', () => {
  expect(
    readMapOptions(
      { mind_map_title: 'Old', mind_map_layout: 'top-to-bottom' },
      'circle-clockwise',
      false,
    ),
  ).toEqual({ title: null, layout: 'circle-clockwise', collapsed: false, invalid: [] });
});

test.each([
  [true, false, true],
  [false, true, false],
  [true, true, true],
  [false, false, false],
])('mind-mapper-collapsed %j overrides the setting %j', (value, setting, collapsed) => {
  expect(readMapOptions({ 'mind-mapper-collapsed': value }, 'circle-clockwise', setting)).toEqual({
    title: null,
    layout: 'circle-clockwise',
    collapsed,
    invalid: [],
  });
});

test.each([
  ['yes', 'yes'],
  ['true', 'true'],
  [1, '1'],
  [0, '0'],
  [['true'], 'true'],
  [{ a: true }, '{"a":true}'],
])('mind-mapper-collapsed %j that is not a boolean falls back with a warning', (value, shown) => {
  for (const setting of [false, true]) {
    const options = readMapOptions({ 'mind-mapper-collapsed': value }, 'circle-clockwise', setting);
    expect(options.collapsed).toBe(setting);
    expect(options.invalid).toEqual([{ key: 'mind-mapper-collapsed', value: shown }]);
  }
});

test('notice texts name the key, the value, the note and the fallback', () => {
  const options = readMapOptions(
    { 'mind-mapper-layout': 'spiral', 'mind-mapper-collapsed': 'yes', 'mind-mapper-title': 3 },
    'left-to-right',
    true,
  );
  expect(
    options.invalid.map(({ key, value }) => invalidOptionMessage(key, value, 'a/Note.md', options)),
  ).toEqual([
    'Mind Mapper: mind-mapper-title in a/Note.md is not text, using the default title',
    'Mind Mapper: unknown mind-mapper-layout "spiral" in a/Note.md, using left-to-right',
    'Mind Mapper: mind-mapper-collapsed "yes" in a/Note.md is not true or false, using true',
  ]);
});
