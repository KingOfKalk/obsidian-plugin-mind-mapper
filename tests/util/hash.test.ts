import { fnv1a } from '../../src/util/hash';

test('known FNV-1a 32-bit values', () => {
  expect(fnv1a('')).toBe('811c9dc5');
  expect(fnv1a('a')).toBe('e40c292c');
  expect(fnv1a('foobar')).toBe('bf9cf968');
});

test('non-ASCII text hashes by UTF-16 code units and differs per text', () => {
  expect(fnv1a('Größe 🚀')).not.toBe(fnv1a('Grosse 🚀'));
  expect(fnv1a('Größe 🚀')).toMatch(/^[0-9a-f]{8}$/);
});
