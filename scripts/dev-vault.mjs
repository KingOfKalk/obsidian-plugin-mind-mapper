// Dev vault helpers: copy test notes in, enable the plugin, pull recorded fixtures back.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gitCommonDir, resolveDevTargets } from './dev-paths.mjs';

const CONFIG_DIR = '.obsidian';
const FIXTURES = 'fixtures';
const RECORDING_SUFFIX = '.cache.json';

/**
 * Copies every file of `srcDir` into `destDir`, overwriting notes of the same name; never deletes.
 * Skips `.obsidian/` and recordings (`*.cache.json`): those only flow dev vault → repo.
 * @param {string} srcDir
 * @param {string} destDir
 */
export function syncNotes(srcDir, destDir) {
  cpSync(srcDir, destDir, {
    recursive: true,
    filter: (source) => basename(source) !== CONFIG_DIR && !source.endsWith(RECORDING_SUFFIX),
  });
}

/**
 * Adds `pluginId` to the vault's enabled community plugins.
 * @param {string} vaultDir
 * @param {string} pluginId
 */
export function enablePlugin(vaultDir, pluginId) {
  const file = join(vaultDir, CONFIG_DIR, 'community-plugins.json');
  /** @type {string[]} */
  const enabled = existsSync(file)
    ? /** @type {string[]} */ (JSON.parse(readFileSync(file, 'utf8')))
    : [];
  if (enabled.includes(pluginId)) return;
  mkdirSync(join(vaultDir, CONFIG_DIR), { recursive: true });
  writeFileSync(file, `${JSON.stringify([...enabled, pluginId], null, 2)}\n`);
}

/**
 * Copies `fixtures/*.cache.json` from the dev vault into the repo's test vault.
 * @param {string} vaultDir
 * @param {string} repoVaultDir
 * @returns {string[]} copied file names
 */
export function pullFixtures(vaultDir, repoVaultDir) {
  const from = join(vaultDir, FIXTURES);
  if (!existsSync(from)) return [];
  const names = readdirSync(from).filter((name) => name.endsWith(RECORDING_SUFFIX));
  mkdirSync(join(repoVaultDir, FIXTURES), { recursive: true });
  for (const name of names) cpSync(join(from, name), join(repoVaultDir, FIXTURES, name));
  return names;
}

// `node scripts/dev-vault.mjs pull-fixtures`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { vaultDir } = resolveDevTargets(process.env, gitCommonDir);
  if (process.argv[2] !== 'pull-fixtures' || !vaultDir) {
    throw new Error('usage: node scripts/dev-vault.mjs pull-fixtures (default dev vault only)');
  }
  const names = pullFixtures(vaultDir, 'test-vault');
  console.log(`Pulled ${names.length} fixtures from ${vaultDir}`);
}
