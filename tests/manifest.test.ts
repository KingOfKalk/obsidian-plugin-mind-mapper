import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Manifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  isDesktopOnly: boolean;
  authorUrl?: string;
  fundingUrl?: unknown;
}

interface Package {
  version: string;
  description?: string;
  repository?: unknown;
  bugs?: unknown;
  homepage?: string;
}

const REPOSITORY = 'https://github.com/KingOfKalk/obsidian-plugin-mind-mapper';

const read = <T>(file: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), file), 'utf8')) as T;

/** Obsidian community directory rules (Reference/Manifest, Submission requirements for plugins). */
test('manifest follows the community submission rules', () => {
  const manifest = read<Manifest>('manifest.json');
  const versions = read<Record<string, string>>('versions.json');
  expect(manifest.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  expect(manifest.id).not.toMatch(/obsidian/i);
  expect(manifest.id).not.toMatch(/plugin$/);
  expect(manifest.name).not.toMatch(/obsidian|obsi-|-sidian|plugin/i);
  expect(manifest.description.length).toBeLessThanOrEqual(250);
  expect(manifest.description).toMatch(/\.$/);
  expect(manifest.description).not.toMatch(/^this is a plugin/i);
  // Correct capitalization of trademarks ("Markdown", "Obsidian", "PDF"), no emoji.
  expect(manifest.description).not.toMatch(/\b(markdown|obsidian|pdf)\b/);
  expect(manifest.description).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  expect(read<{ version: string }>('package.json').version).toBe(manifest.version);
  expect(manifest.isDesktopOnly).toBe(true);
  expect(manifest.fundingUrl).toBeUndefined();
});

test('manifest description and author URL (issue #80)', () => {
  const manifest = read<Manifest>('manifest.json');
  expect(manifest.description).toBe(
    'Show any note as a live, read-only mind map that follows you while you write: headings, lists and blocks become nodes, rendered like reading view.',
  );
  expect(manifest.authorUrl).toBe('https://github.com/KingOfKalk');
});

test('package.json links the repository, issues and README, description in sync', () => {
  const pkg = read<Package>('package.json');
  expect(pkg.repository).toEqual({ type: 'git', url: `git+${REPOSITORY}.git` });
  expect(pkg.bugs).toEqual({ url: `${REPOSITORY}/issues` });
  expect(pkg.homepage).toBe(`${REPOSITORY}#readme`);
  expect(pkg.description).toBe(read<Manifest>('manifest.json').description);
});

/** Declarative settings (getSettingDefinitions) exist since 1.13.0; the tab has no display() fallback. */
test('minAppVersion is the newest public Obsidian, 1.15.0', () => {
  expect(read<Manifest>('manifest.json').minAppVersion).toBe('1.15.0');
});

test('command ids do not repeat the plugin id', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'commands', 'viewCommands.ts'), 'utf8');
  const main = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');
  const ids = [...`${source}\n${main}`.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
  expect(ids.length).toBeGreaterThan(5);
  for (const id of ids) expect(id).not.toContain('mind-mapper');
});
