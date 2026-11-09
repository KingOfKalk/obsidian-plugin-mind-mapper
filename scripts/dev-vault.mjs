// Dev vault helpers: copy test notes in, enable the plugin, pull recorded fixtures back.
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gitCommonDir, resolveDevTargets } from './dev-paths.mjs';

const CONFIG_DIR = '.obsidian';
const FIXTURES = 'fixtures';
const RECORDING_SUFFIX = '.cache.json';
// A dot file in the vault root: Obsidian does not index hidden files, and it stays out of `.obsidian/`.
const SYNC_MANIFEST = '.mind-mapper-sync.json';

/**
 * @param {string} name file or folder name
 * @returns {boolean} whether syncing may copy (and later prune) it
 */
function isSyncable(name) {
  return name !== CONFIG_DIR && name !== SYNC_MANIFEST && !name.endsWith(RECORDING_SUFFIX);
}

/**
 * @param {string} dir
 * @param {string} [prefix] relative path of `dir` below the walk root
 * @returns {string[]} relative paths (forward slashes) of all syncable files below `dir`
 */
function listNotes(dir, prefix = '') {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    if (!isSyncable(entry.name)) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listNotes(dir, path));
    else files.push(path);
  }
  return files;
}

/**
 * @param {string} file
 * @returns {string[]} the relative paths recorded by the previous sync, or none
 */
function readManifest(file) {
  if (!existsSync(file)) return [];
  try {
    const parsed = /** @type {unknown} */ (JSON.parse(readFileSync(file, 'utf8')));
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Deletes `files` (relative to `destDir`), then the folders they leave empty.
 * Entries that are not plain syncable files inside `destDir` are skipped.
 * @param {string} destDir
 * @param {string[]} files
 */
function prune(destDir, files) {
  const root = resolve(destDir);
  for (const file of files) {
    const path = resolve(root, file);
    const parts = relative(root, path).split(sep);
    if (parts[0] === '..' || parts.some((part) => !isSyncable(part))) continue;
    rmSync(path, { force: true });
    for (let dir = dirname(path); dir !== root; dir = dirname(dir)) {
      if (!existsSync(dir) || readdirSync(dir).length > 0) break;
      rmdirSync(dir);
    }
  }
}

/**
 * Copies every file of `srcDir` into `destDir`, overwriting notes of the same name, and records the
 * copied paths in a manifest inside `destDir`. Notes that an earlier sync copied and `srcDir` no
 * longer has are deleted again (with the folders they leave empty). Files that are in no manifest
 * (the user's own notes) are never deleted, and without a manifest nothing is.
 * Skips `.obsidian/` and recordings (`*.cache.json`): those only flow dev vault → repo.
 * @param {string} srcDir
 * @param {string} destDir
 */
export function syncNotes(srcDir, destDir) {
  const manifestFile = join(destDir, SYNC_MANIFEST);
  const previous = readManifest(manifestFile);
  const notes = listNotes(srcDir);
  mkdirSync(destDir, { recursive: true });
  // File by file, not `cpSync` with a filter: on the devcontainer's workspace mount that left
  // overwritten notes write-only (0200), so Obsidian could not read them. Setting the mode
  // explicitly also repairs copies an earlier sync broke.
  for (const note of notes) {
    const source = join(srcDir, note);
    const target = join(destDir, note);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    chmodSync(target, statSync(source).mode & 0o777);
  }
  const current = new Set(notes);
  prune(
    destDir,
    previous.filter((file) => !current.has(file)),
  );
  writeFileSync(manifestFile, `${JSON.stringify(notes, null, 2)}\n`);
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
