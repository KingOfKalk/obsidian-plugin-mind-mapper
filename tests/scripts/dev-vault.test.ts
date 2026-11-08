import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enablePlugin, pullFixtures, syncNotes } from '../../scripts/dev-vault.mjs';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'mm-vault-'));
}

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

test('syncNotes copies all files except .obsidian, keeps extra target files', () => {
  const src = tmp();
  const dest = tmp();
  write(join(src, 'Note.md'), 'new');
  write(join(src, 'fixtures', 'a.md'), 'a');
  write(join(src, '.obsidian', 'app.json'), '{"src":true}');
  write(join(dest, 'Note.md'), 'old');
  write(join(dest, 'Mine.md'), 'mine');
  write(join(dest, '.obsidian', 'app.json'), '{"dest":true}');

  syncNotes(src, dest);

  expect(readFileSync(join(dest, 'Note.md'), 'utf8')).toBe('new');
  expect(readFileSync(join(dest, 'fixtures', 'a.md'), 'utf8')).toBe('a');
  expect(readFileSync(join(dest, 'Mine.md'), 'utf8')).toBe('mine');
  expect(readFileSync(join(dest, '.obsidian', 'app.json'), 'utf8')).toBe('{"dest":true}');
});

test('enablePlugin creates community-plugins.json once and keeps an existing one', () => {
  const vault = tmp();
  enablePlugin(vault, 'mind-mapper');
  const file = join(vault, '.obsidian', 'community-plugins.json');
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['mind-mapper']);

  writeFileSync(file, '["hot-reload"]');
  enablePlugin(vault, 'mind-mapper');
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['hot-reload', 'mind-mapper']);

  enablePlugin(vault, 'mind-mapper');
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['hot-reload', 'mind-mapper']);
});

test('pullFixtures copies only cache.json files and returns their names', () => {
  const vault = tmp();
  const repoVault = tmp();
  write(join(vault, 'fixtures', 'a.cache.json'), '{"a":1}');
  write(join(vault, 'fixtures', 'a.md'), 'changed in Obsidian');
  write(join(repoVault, 'fixtures', 'a.md'), 'original');

  expect(pullFixtures(vault, repoVault)).toEqual(['a.cache.json']);
  expect(readFileSync(join(repoVault, 'fixtures', 'a.cache.json'), 'utf8')).toBe('{"a":1}');
  expect(readFileSync(join(repoVault, 'fixtures', 'a.md'), 'utf8')).toBe('original');
  expect(readdirSync(join(repoVault, 'fixtures')).sort()).toEqual(['a.cache.json', 'a.md']);
});

test('pullFixtures without recordings returns an empty list', () => {
  expect(pullFixtures(tmp(), tmp())).toEqual([]);
});

test('syncNotes never overwrites recordings in the dev vault', () => {
  const src = tmp();
  const dest = tmp();
  write(join(src, 'fixtures', 'a.md'), 'note');
  write(join(src, 'fixtures', 'a.cache.json'), '{"old":true}');
  write(join(dest, 'fixtures', 'a.cache.json'), '{"fresh":true}');

  syncNotes(src, dest);

  expect(readFileSync(join(dest, 'fixtures', 'a.cache.json'), 'utf8')).toBe('{"fresh":true}');
  expect(readFileSync(join(dest, 'fixtures', 'a.md'), 'utf8')).toBe('note');
});
