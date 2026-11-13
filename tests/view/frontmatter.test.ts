import { invalidOptionMessage, readMapOptions } from '../../src/view/frontmatter';
import { useGerman } from '../helpers';

test('valid layout and title', () => {
  expect(
    readMapOptions(
      { 'mind-mapper-layout': 'top-to-bottom', 'mind-mapper-title': '  Plan  ' },
      'circle-clockwise',
      false,
    ),
  ).toEqual({
    title: 'Plan',
    layout: 'top-to-bottom',
    collapsed: false,
    theme: 'none',
    tags: 'outside',
    invalid: [],
  });
});

test('absent keys use the defaults without warnings', () => {
  expect(readMapOptions(undefined, 'left-to-right', false)).toEqual({
    title: null,
    layout: 'left-to-right',
    collapsed: false,
    theme: 'none',
    tags: 'outside',
    invalid: [],
  });
  expect(readMapOptions({ tags: ['x'] }, 'circle-clockwise', true)).toEqual({
    title: null,
    layout: 'circle-clockwise',
    collapsed: true,
    theme: 'none',
    tags: 'outside',
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
    theme: 'none',
    tags: 'outside',
    invalid: [],
  });
});

test('keys without value (null) fall back silently', () => {
  expect(
    readMapOptions(
      {
        'mind-mapper-title': null,
        'mind-mapper-layout': null,
        'mind-mapper-collapsed': null,
        'mind-mapper-theme': null,
        'mind-mapper-tags': null,
      },
      'circle-clockwise',
      true,
      'ocean',
      'inside',
    ),
  ).toEqual({
    title: null,
    layout: 'circle-clockwise',
    collapsed: true,
    theme: 'ocean',
    tags: 'inside',
    invalid: [],
  });
});

test('the old mind_map_* keys are ignored', () => {
  expect(
    readMapOptions(
      { mind_map_title: 'Old', mind_map_layout: 'top-to-bottom' },
      'circle-clockwise',
      false,
    ),
  ).toEqual({
    title: null,
    layout: 'circle-clockwise',
    collapsed: false,
    theme: 'none',
    tags: 'outside',
    invalid: [],
  });
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
    theme: 'none',
    tags: 'outside',
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
    {
      'mind-mapper-layout': 'spiral',
      'mind-mapper-collapsed': 'yes',
      'mind-mapper-title': 3,
      'mind-mapper-theme': 'neon',
      'mind-mapper-tags': 'below',
    },
    'left-to-right',
    true,
    'forest',
    'inside',
  );
  expect(
    options.invalid.map(({ key, value }) => invalidOptionMessage(key, value, 'a/Note.md', options)),
  ).toEqual([
    'Mind Mapper: mind-mapper-title in a/Note.md is not text, using the default title',
    'Mind Mapper: unknown mind-mapper-layout "spiral" in a/Note.md, using left-to-right',
    'Mind Mapper: mind-mapper-collapsed "yes" in a/Note.md is not true or false, using true',
    'Mind Mapper: unknown mind-mapper-theme "neon" in a/Note.md, using forest',
    'Mind Mapper: unknown mind-mapper-tags "below" in a/Note.md, using inside',
  ]);
});

test('notice texts in German keep key names and values', () => {
  useGerman();
  const options = readMapOptions(
    {
      'mind-mapper-layout': 'spiral',
      'mind-mapper-collapsed': 'yes',
      'mind-mapper-title': 3,
      'mind-mapper-theme': 'neon',
      'mind-mapper-tags': 'below',
    },
    'left-to-right',
    true,
    'forest',
    'inside',
  );
  expect(
    options.invalid.map(({ key, value }) => invalidOptionMessage(key, value, 'a/Note.md', options)),
  ).toEqual([
    'Mind Mapper: mind-mapper-title in a/Note.md ist kein Text, der Standardtitel wird verwendet',
    'Mind Mapper: Unbekanntes mind-mapper-layout "spiral" in a/Note.md, left-to-right wird verwendet',
    'Mind Mapper: mind-mapper-collapsed "yes" in a/Note.md ist nicht true oder false, true wird verwendet',
    'Mind Mapper: Unbekanntes mind-mapper-theme "neon" in a/Note.md, forest wird verwendet',
    'Mind Mapper: Unbekanntes mind-mapper-tags "below" in a/Note.md, inside wird verwendet',
  ]);
});

test.each(['none', 'rainbow', 'ocean', 'forest', 'accent'] as const)(
  'mind-mapper-theme %s overrides the setting',
  (theme) => {
    expect(
      readMapOptions({ 'mind-mapper-theme': theme }, 'circle-clockwise', false, 'ocean'),
    ).toEqual({
      title: null,
      layout: 'circle-clockwise',
      collapsed: false,
      theme,
      tags: 'outside',
      invalid: [],
    });
  },
);

test('without mind-mapper-theme the setting applies', () => {
  expect(readMapOptions({}, 'circle-clockwise', false, 'accent').theme).toBe('accent');
  expect(readMapOptions(undefined, 'circle-clockwise', false, 'rainbow').theme).toBe('rainbow');
});

test.each([
  ['neon', 'neon'],
  ['Rainbow', 'Rainbow'],
  [3, '3'],
  [true, 'true'],
  [['rainbow'], 'rainbow'],
])('unknown mind-mapper-theme %j falls back to the setting with a warning', (value, shown) => {
  const options = readMapOptions(
    { 'mind-mapper-theme': value },
    'circle-clockwise',
    false,
    'forest',
  );
  expect(options.theme).toBe('forest');
  expect(options.invalid).toEqual([{ key: 'mind-mapper-theme', value: shown }]);
});

// Issue #103: the tag position per note.
test.each(['outside', 'inside'] as const)('mind-mapper-tags %s overrides the setting', (tags) => {
  const other = tags === 'outside' ? 'inside' : 'outside';
  const options = readMapOptions(
    { 'mind-mapper-tags': tags },
    'circle-clockwise',
    false,
    'none',
    other,
  );
  expect(options.tags).toBe(tags);
  expect(options.invalid).toEqual([]);
});

test('without mind-mapper-tags the setting applies; the default is outside', () => {
  expect(readMapOptions({}, 'circle-clockwise', false, 'none', 'inside').tags).toBe('inside');
  expect(readMapOptions(undefined, 'circle-clockwise', false, 'none', 'outside').tags).toBe(
    'outside',
  );
  expect(readMapOptions({ 'mind-mapper-tags': null }, 'circle-clockwise', false).tags).toBe(
    'outside',
  );
});

test.each([
  ['below', 'below'],
  ['Outside', 'Outside'],
  [3, '3'],
  [false, 'false'],
  [['inside'], 'inside'],
])('unknown mind-mapper-tags %j falls back to the setting with a warning', (value, shown) => {
  const options = readMapOptions(
    { 'mind-mapper-tags': value },
    'circle-clockwise',
    false,
    'none',
    'inside',
  );
  expect(options.tags).toBe('inside');
  expect(options.invalid).toEqual([{ key: 'mind-mapper-tags', value: shown }]);
});
