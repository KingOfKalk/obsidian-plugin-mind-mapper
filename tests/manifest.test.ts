import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Manifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  isDesktopOnly: boolean;
  fundingUrl?: unknown;
}

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
  expect(manifest.description).toContain('Markdown');
  expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  expect(read<{ version: string }>('package.json').version).toBe(manifest.version);
  expect(manifest.isDesktopOnly).toBe(true);
  expect(manifest.fundingUrl).toBeUndefined();
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
