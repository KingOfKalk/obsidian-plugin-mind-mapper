import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/settings';

test('defaults match the spec', () => {
  expect(DEFAULT_SETTINGS).toEqual({
    defaultLayout: 'circle-clockwise',
    maxNodeWidth: 320,
    maxNodeHeight: 240,
    siblingGap: 12,
    levelGap: 60,
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
      maxNodeWidth: '500',
      maxNodeHeight: 5,
      siblingGap: 'wide',
      levelGap: 1000,
      extra: true,
    }),
  ).toEqual({
    defaultLayout: 'circle-clockwise',
    maxNodeWidth: 500,
    maxNodeHeight: 120,
    siblingGap: 12,
    levelGap: 400,
  });
});

test('sanitizeSettings keeps valid values and rounds numbers', () => {
  expect(
    sanitizeSettings({
      defaultLayout: 'top-to-bottom',
      maxNodeWidth: 400.6,
      maxNodeHeight: 300,
      siblingGap: 0,
      levelGap: 20,
    }),
  ).toEqual({
    defaultLayout: 'top-to-bottom',
    maxNodeWidth: 401,
    maxNodeHeight: 300,
    siblingGap: 0,
    levelGap: 20,
  });
});

test.each([NaN, Infinity, -Infinity])('non-finite number %s falls back to the default', (value) => {
  expect(sanitizeSettings({ maxNodeWidth: value }).maxNodeWidth).toBe(320);
});
