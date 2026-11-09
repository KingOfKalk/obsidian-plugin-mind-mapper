import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/settings';

test('defaults match the spec', () => {
  expect(DEFAULT_SETTINGS).toEqual({
    defaultLayout: 'circle-clockwise',
    startCollapsed: false,
    defaultTheme: 'rainbow',
    maxNodeWidth: 320,
    maxNodeHeight: 240,
    siblingGap: 12,
    levelGap: 60,
    fitMaxZoom: 200,
  });
});

test.each([null, undefined, 'garbage', 42, []])(
  'sanitizeSettings(%j) gives the defaults',
  (raw) => {
    expect(sanitizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
  },
);

test('sanitizeSettings: missing, wrong-typed, out-of-range and unknown values', () => {
  expect(
    sanitizeSettings({
      defaultLayout: 'spiral',
      startCollapsed: 'yes',
      defaultTheme: 'neon',
      maxNodeWidth: '500',
      maxNodeHeight: 5,
      siblingGap: 'wide',
      levelGap: 1000,
      fitMaxZoom: 900,
      extra: true,
    }),
  ).toEqual({
    defaultLayout: 'circle-clockwise',
    startCollapsed: false,
    defaultTheme: 'rainbow',
    maxNodeWidth: 500,
    maxNodeHeight: 120,
    siblingGap: 12,
    levelGap: 400,
    fitMaxZoom: 400,
  });
});

test('sanitizeSettings keeps valid values and rounds numbers', () => {
  expect(
    sanitizeSettings({
      defaultLayout: 'top-to-bottom',
      startCollapsed: true,
      defaultTheme: 'ocean',
      maxNodeWidth: 400.6,
      maxNodeHeight: 300,
      siblingGap: 0,
      levelGap: 20,
      fitMaxZoom: 150,
    }),
  ).toEqual({
    defaultLayout: 'top-to-bottom',
    startCollapsed: true,
    defaultTheme: 'ocean',
    maxNodeWidth: 401,
    maxNodeHeight: 300,
    siblingGap: 0,
    levelGap: 20,
    fitMaxZoom: 150,
  });
});

test.each([NaN, Infinity, -Infinity])('non-finite number %s falls back to the default', (value) => {
  expect(sanitizeSettings({ maxNodeWidth: value }).maxNodeWidth).toBe(320);
});

test.each([1, 'true', null])(
  'startCollapsed %j that is not a boolean falls back to false',
  (value) => {
    expect(sanitizeSettings({ startCollapsed: value }).startCollapsed).toBe(false);
  },
);

test.each(['none', 'rainbow', 'ocean', 'forest', 'accent'])('defaultTheme %s is kept', (value) => {
  expect(sanitizeSettings({ defaultTheme: value }).defaultTheme).toBe(value);
});

test.each(['Rainbow', '', 3, null, ['ocean']])(
  'defaultTheme %j that is not a theme falls back to rainbow',
  (value) => {
    expect(sanitizeSettings({ defaultTheme: value }).defaultTheme).toBe('rainbow');
  },
);

test.each([
  [50, 100],
  [100, 100],
  [225, 225],
  [233.4, 233],
  ['300', 300],
  [400, 400],
  [401, 400],
  ['wide', 200],
  [NaN, 200],
])('fitMaxZoom %j becomes %j', (value, expected) => {
  expect(sanitizeSettings({ fitMaxZoom: value }).fitMaxZoom).toBe(expected);
});
