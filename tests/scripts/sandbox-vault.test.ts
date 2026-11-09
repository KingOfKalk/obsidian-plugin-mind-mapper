import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  docsMappings,
  enablePlugin,
  notesMappings,
  pullFixtures,
  syncFiles,
  syncNotes,
} from '../../scripts/sandbox-vault.mjs';

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

test('syncNotes never overwrites recordings in the sandbox vault', () => {
  const src = tmp();
  const dest = tmp();
  write(join(src, 'fixtures', 'a.md'), 'note');
  write(join(src, 'fixtures', 'a.cache.json'), '{"old":true}');
  write(join(dest, 'fixtures', 'a.cache.json'), '{"fresh":true}');

  syncNotes(src, dest);

  expect(readFileSync(join(dest, 'fixtures', 'a.cache.json'), 'utf8')).toBe('{"fresh":true}');
  expect(readFileSync(join(dest, 'fixtures', 'a.md'), 'utf8')).toBe('note');
});

const MANIFEST = '.mind-mapper-sync.json';

test('syncNotes prunes a note that was synced earlier and is gone from the source', () => {
  const src = tmp();
  const dest = tmp();
  write(join(src, 'Keep.md'), 'keep');
  write(join(src, 'Old.md'), 'old');
  syncNotes(src, dest);
  expect(existsSync(join(dest, 'Old.md'))).toBe(true);

  rmSync(join(src, 'Old.md'));
  syncNotes(src, dest);

  expect(existsSync(join(dest, 'Old.md'))).toBe(false);
  expect(readFileSync(join(dest, 'Keep.md'), 'utf8')).toBe('keep');
});

test('syncNotes records the copied notes in a manifest outside .obsidian', () => {
  const src = tmp();
  const dest = tmp();
  write(join(src, 'B.md'), 'b');
  write(join(src, 'demo', 'A.md'), 'a');
  write(join(src, 'demo', 'A.cache.json'), '{}');
  write(join(src, '.obsidian', 'app.json'), '{}');

  syncNotes(src, dest);

  const manifest = JSON.parse(readFileSync(join(dest, MANIFEST), 'utf8')) as string[];
  expect([...manifest].sort()).toEqual(['B.md', 'demo/A.md']);
});

test('syncNotes never prunes notes the user created in the dest vault', () => {
  const src = tmp();
  const dest = tmp();
  write(join(src, 'Old.md'), 'old');
  syncNotes(src, dest);
  write(join(dest, 'Mine.md'), 'mine');
  write(join(dest, 'folder', 'Mine too.md'), 'mine');

  rmSync(join(src, 'Old.md'));
  syncNotes(src, dest);

  expect(existsSync(join(dest, 'Old.md'))).toBe(false);
  expect(readFileSync(join(dest, 'Mine.md'), 'utf8')).toBe('mine');
  expect(readFileSync(join(dest, 'folder', 'Mine too.md'), 'utf8')).toBe('mine');
});

test('syncNotes never touches .obsidian, even if a manifest lists it', () => {
  const src = tmp();
  const dest = tmp();
  write(join(dest, '.obsidian', 'app.json'), '{"dest":true}');
  write(join(dest, '.obsidian', 'plugins', 'x', 'data.json'), '{}');
  write(join(dest, 'fixtures', 'a.cache.json'), '{"fresh":true}');
  write(join(src, 'Note.md'), 'n');
  writeFileSync(
    join(dest, MANIFEST),
    JSON.stringify(['.obsidian/app.json', 'fixtures/a.cache.json', '../outside.md']),
  );
  write(join(dest, '..', 'outside.md'), 'outside');

  syncNotes(src, dest);

  expect(readFileSync(join(dest, '.obsidian', 'app.json'), 'utf8')).toBe('{"dest":true}');
  expect(existsSync(join(dest, '.obsidian', 'plugins', 'x', 'data.json'))).toBe(true);
  expect(existsSync(join(dest, 'fixtures', 'a.cache.json'))).toBe(true);
  expect(existsSync(join(dest, '..', 'outside.md'))).toBe(true);
});

test('syncNotes removes folders a pruned note leaves empty, but not folders with other files', () => {
  const src = tmp();
  const dest = tmp();
  write(join(src, 'empty', 'deep', 'Gone.md'), 'x');
  write(join(src, 'shared', 'Gone.md'), 'x');
  write(join(src, 'Keep.md'), 'k');
  syncNotes(src, dest);
  write(join(dest, 'shared', 'Mine.md'), 'mine');

  rmSync(join(src, 'empty'), { recursive: true });
  rmSync(join(src, 'shared'), { recursive: true });
  syncNotes(src, dest);

  expect(existsSync(join(dest, 'empty'))).toBe(false);
  expect(existsSync(join(dest, 'shared', 'Gone.md'))).toBe(false);
  expect(readFileSync(join(dest, 'shared', 'Mine.md'), 'utf8')).toBe('mine');
  expect(existsSync(dest)).toBe(true);
});

test('syncNotes without a manifest prunes nothing', () => {
  const src = tmp();
  const dest = tmp();
  write(join(src, 'New.md'), 'new');
  write(join(dest, 'Extra.md'), 'extra');
  write(join(dest, 'folder', 'Extra.md'), 'extra');

  syncNotes(src, dest);

  expect(readFileSync(join(dest, 'Extra.md'), 'utf8')).toBe('extra');
  expect(readFileSync(join(dest, 'folder', 'Extra.md'), 'utf8')).toBe('extra');
  expect(existsSync(join(dest, MANIFEST))).toBe(true);
});

/**
 * Temp dir on the repo's own filesystem: the devcontainer's workspace mount is where `cpSync`
 * with a filter left overwritten notes write-only (0200); `/tmp` does not show it.
 */
function repoTmp(): string {
  const base = join(__dirname, '..', '..', '.test-tmp');
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, 'vault-'));
}

test('syncNotes keeps notes readable: every sync gives copies the source permissions', () => {
  const src = repoTmp();
  const dest = repoTmp();
  write(join(src, 'demo', 'Note.md'), '# Note');
  chmodSync(join(src, 'demo', 'Note.md'), 0o644);
  syncNotes(src, dest);
  syncNotes(src, dest);
  expect(statSync(join(dest, 'demo', 'Note.md')).mode & 0o777).toBe(0o644);
  // a copy already broken by an earlier sync is repaired
  chmodSync(join(dest, 'demo', 'Note.md'), 0o200);
  syncNotes(src, dest);
  expect(statSync(join(dest, 'demo', 'Note.md')).mode & 0o777).toBe(0o644);
  expect(readFileSync(join(dest, 'demo', 'Note.md'), 'utf8')).toBe('# Note');
});

afterAll(() => {
  rmSync(join(__dirname, '..', '..', '.test-tmp'), { recursive: true, force: true });
});

describe('docs in the sandbox vault', () => {
  function makeDocs(): string {
    const docs = tmp();
    write(join(docs, 'user-manual.md'), '# Manual\n![x](images/manual/a.png)');
    write(join(docs, 'developer.md'), '# Developer');
    write(join(docs, 'mvp.md'), 'spec');
    write(join(docs, 'going-public.md'), 'plan');
    write(join(docs, 'superpowers', 'plan.md'), 'plan');
    write(join(docs, 'images', 'hero.png'), 'hero');
    write(join(docs, 'images', 'manual', 'a.png'), 'a');
    return docs;
  }

  test('docsMappings names the two docs and maps the images next to them', () => {
    const mappings = docsMappings(makeDocs());
    expect(mappings.map((mapping) => mapping.to).sort()).toEqual([
      'Docs/Developer guide.md',
      'Docs/User manual.md',
      'Docs/images/hero.png',
      'Docs/images/manual/a.png',
    ]);
  });

  test('syncFiles copies the docs and images so relative image links resolve', () => {
    const docs = makeDocs();
    const dest = tmp();
    syncFiles(dest, docsMappings(docs));
    expect(readFileSync(join(dest, 'Docs', 'User manual.md'), 'utf8')).toContain(
      'images/manual/a.png',
    );
    expect(readFileSync(join(dest, 'Docs', 'Developer guide.md'), 'utf8')).toBe('# Developer');
    expect(readFileSync(join(dest, 'Docs', 'images', 'manual', 'a.png'), 'utf8')).toBe('a');
    expect(readdirSync(join(dest, 'Docs')).sort()).toEqual([
      'Developer guide.md',
      'User manual.md',
      'images',
    ]);
  });

  test('notes and docs share one manifest: nothing of either source is pruned wrongly', () => {
    const notes = tmp();
    const docs = makeDocs();
    const dest = tmp();
    write(join(notes, 'Welcome.md'), 'hi');
    const mappings = () => [...notesMappings(notes), ...docsMappings(docs)];
    syncFiles(dest, mappings());
    syncFiles(dest, mappings());
    expect(existsSync(join(dest, 'Welcome.md'))).toBe(true);
    expect(existsSync(join(dest, 'Docs', 'User manual.md'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dest, MANIFEST), 'utf8')) as string[];
    expect(manifest).toContain('Welcome.md');
    expect(manifest).toContain('Docs/images/manual/a.png');
  });

  test('a doc image removed from docs/ disappears from the vault, the user notes stay', () => {
    const notes = tmp();
    const docs = makeDocs();
    const dest = tmp();
    write(join(notes, 'Welcome.md'), 'hi');
    const mappings = () => [...notesMappings(notes), ...docsMappings(docs)];
    syncFiles(dest, mappings());
    write(join(dest, 'Docs', 'My notes.md'), 'mine');
    write(join(dest, 'Mine.md'), 'mine');

    rmSync(join(docs, 'images', 'manual'), { recursive: true });
    rmSync(join(docs, 'developer.md'));
    syncFiles(dest, mappings());

    expect(existsSync(join(dest, 'Docs', 'images', 'manual'))).toBe(false);
    expect(existsSync(join(dest, 'Docs', 'Developer guide.md'))).toBe(false);
    expect(existsSync(join(dest, 'Docs', 'images', 'hero.png'))).toBe(true);
    expect(existsSync(join(dest, 'Docs', 'User manual.md'))).toBe(true);
    expect(readFileSync(join(dest, 'Docs', 'My notes.md'), 'utf8')).toBe('mine');
    expect(readFileSync(join(dest, 'Mine.md'), 'utf8')).toBe('mine');
    expect(existsSync(join(dest, 'Welcome.md'))).toBe(true);
  });

  test('a note removed from the notes source is pruned while the docs stay', () => {
    const notes = tmp();
    const docs = makeDocs();
    const dest = tmp();
    write(join(notes, 'Old.md'), 'old');
    syncFiles(dest, [...notesMappings(notes), ...docsMappings(docs)]);
    rmSync(join(notes, 'Old.md'));
    syncFiles(dest, [...notesMappings(notes), ...docsMappings(docs)]);
    expect(existsSync(join(dest, 'Old.md'))).toBe(false);
    expect(existsSync(join(dest, 'Docs', 'User manual.md'))).toBe(true);
  });

  test('docs and images keep the source permissions on every sync', () => {
    const docs = makeDocs();
    const dest = repoTmp();
    chmodSync(join(docs, 'user-manual.md'), 0o644);
    chmodSync(join(docs, 'images', 'manual', 'a.png'), 0o644);
    syncFiles(dest, docsMappings(docs));
    chmodSync(join(dest, 'Docs', 'User manual.md'), 0o200);
    syncFiles(dest, docsMappings(docs));
    expect(statSync(join(dest, 'Docs', 'User manual.md')).mode & 0o777).toBe(0o644);
    expect(statSync(join(dest, 'Docs', 'images', 'manual', 'a.png')).mode & 0o777).toBe(0o644);
  });

  test('syncNotes still works as before without docs', () => {
    const src = tmp();
    const dest = tmp();
    write(join(src, 'A.md'), 'a');
    syncNotes(src, dest);
    expect(readFileSync(join(dest, 'A.md'), 'utf8')).toBe('a');
  });
});
