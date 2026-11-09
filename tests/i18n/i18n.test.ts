import { language } from '../mocks/obsidian';
import { de } from '../../src/i18n/de';
import { en } from '../../src/i18n/en';
import { loadLanguage, localeFor, t } from '../../src/i18n';

test('German has exactly the English keys, none empty', () => {
  expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  for (const value of [...Object.values(en), ...Object.values(de)]) expect(value).not.toBe('');
});

test('German keeps every placeholder of the English text', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    expect(placeholders(de[key]), key).toEqual(placeholders(en[key]));
  }
});

test('t fills {name} placeholders and leaves unknown ones', () => {
  expect(t('noteNotFound', { path: 'a/b.md' })).toBe('Note not found: a/b.md');
  expect(t('zoomPercent', { percent: 150 })).toBe('150%');
  expect(t('noteNotFound')).toBe('Note not found: {path}');
});

test.each([
  ['de', 'de'],
  ['de-DE', 'de'],
  ['de-AT', 'de'],
  ['de_CH', 'de'],
  ['DE', 'de'],
  ['en', 'en'],
  ['en-GB', 'en'],
  ['fr', 'en'],
  ['da', 'en'],
  ['', 'en'],
])('language %j shows %s', (code, expected) => {
  expect(localeFor(code)).toBe(expected);
});

test('loadLanguage follows Obsidian: German for de, English otherwise', () => {
  language.code = 'de';
  loadLanguage();
  expect(t('openAsMindMap')).toBe('Als Mindmap öffnen');
  expect(t('noteNotFound', { path: 'x.md' })).toBe('Notiz nicht gefunden: x.md');
  language.code = 'ja';
  loadLanguage();
  expect(t('openAsMindMap')).toBe('Open as mind map');
});
