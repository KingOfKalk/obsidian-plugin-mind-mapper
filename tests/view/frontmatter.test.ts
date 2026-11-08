import { readMapOptions } from '../../src/view/frontmatter';

test('valid layout and title', () => {
  expect(
    readMapOptions(
      { mind_map_layout: 'top-to-bottom', mind_map_title: '  Plan  ' },
      'circle-clockwise',
    ),
  ).toEqual({ title: 'Plan', layout: 'top-to-bottom', invalid: [] });
});

test('absent keys use the defaults without warnings', () => {
  expect(readMapOptions(undefined, 'left-to-right')).toEqual({
    title: null,
    layout: 'left-to-right',
    invalid: [],
  });
  expect(readMapOptions({ tags: ['x'] }, 'circle-clockwise')).toEqual({
    title: null,
    layout: 'circle-clockwise',
    invalid: [],
  });
});

test.each([['spiral'], [3], [['left-to-right']]])(
  'invalid layout %j falls back with a warning',
  (value) => {
    const options = readMapOptions({ mind_map_layout: value }, 'right-to-left');
    expect(options.layout).toBe('right-to-left');
    expect(options.invalid).toEqual([{ key: 'mind_map_layout', value: String(value) }]);
  },
);

test.each([
  [42, '42'],
  [['a', 'b'], 'a,b'],
  [true, 'true'],
  [{ a: 1 }, '{"a":1}'],
])('title %j that is not text falls back with a warning', (value, shown) => {
  const options = readMapOptions({ mind_map_title: value }, 'circle-clockwise');
  expect(options.title).toBeNull();
  expect(options.invalid).toEqual([{ key: 'mind_map_title', value: shown }]);
});

test.each(['', '   '])('empty title %j falls back silently', (value) => {
  expect(readMapOptions({ mind_map_title: value }, 'circle-clockwise')).toEqual({
    title: null,
    layout: 'circle-clockwise',
    invalid: [],
  });
});

test('keys without value (null) fall back silently', () => {
  expect(
    readMapOptions({ mind_map_title: null, mind_map_layout: null }, 'circle-clockwise'),
  ).toEqual({ title: null, layout: 'circle-clockwise', invalid: [] });
});
