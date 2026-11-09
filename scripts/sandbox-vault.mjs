// Sandbox vault helpers: copy test notes in, enable the plugin, pull recorded fixtures back.
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
 * @typedef {object} FileMapping
 * @property {string} from path of the source file
 * @property {string} to destination path, relative to the vault (forward slashes)
 */

/**
 * @param {string} srcDir
 * @returns {FileMapping[]} every syncable file of `srcDir`, at the same relative path in the vault
 */
export function notesMappings(srcDir) {
  return listNotes(srcDir).map((note) => ({ from: join(srcDir, note), to: note }));
}

/** Folder in the vault that holds the copied docs. */
const DOCS_FOLDER = 'Docs';
/** Docs that are copied, with the file name they get in the vault (the names `[[wikilinks]]` use). */
const DOC_NAMES = { 'user-manual.md': 'User manual.md', 'developer.md': 'Developer guide.md' };

/**
 * The user manual, the developer guide and `images/` of the repo's `docs/` folder, as `Docs/…` in the
 * vault. The images keep their relative path to the docs, so the manual's `images/manual/x.png` resolves.
 * Other docs (spec, plans) are not copied.
 * @param {string} docsDir
 * @returns {FileMapping[]}
 */
export function docsMappings(docsDir) {
  /** @type {FileMapping[]} */
  const mappings = Object.entries(DOC_NAMES)
    .filter(([file]) => existsSync(join(docsDir, file)))
    .map(([file, name]) => ({ from: join(docsDir, file), to: `${DOCS_FOLDER}/${name}` }));
  const images = join(docsDir, 'images');
  if (existsSync(images)) {
    for (const image of listNotes(images)) {
      mappings.push({ from: join(images, image), to: `${DOCS_FOLDER}/images/${image}` });
    }
  }
  return mappings;
}

/**
 * Copies every mapped file into `destDir`, overwriting files of the same name, and records the
 * copied paths in one manifest inside `destDir`. Files that an earlier sync copied and `mappings`
 * no longer has are deleted again (with the folders they leave empty). Files that are in no manifest
 * (the user's own notes) are never deleted, and without a manifest nothing is.
 * `.obsidian/` and recordings (`*.cache.json`) are never written or pruned.
 * @param {string} destDir
 * @param {FileMapping[]} mappings
 */
export function syncFiles(destDir, mappings) {
  const manifestFile = join(destDir, SYNC_MANIFEST);
  const previous = readManifest(manifestFile);
  // A later mapping for the same target wins.
  const targets = new Map(mappings.map(({ from, to }) => [to, from]));
  mkdirSync(destDir, { recursive: true });
  // File by file, not `cpSync` with a filter: on the devcontainer's workspace mount that left
  // overwritten notes write-only (0200), so Obsidian could not read them. Setting the mode
  // explicitly also repairs copies an earlier sync broke.
  for (const [to, from] of targets) {
    const target = join(destDir, to);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(from, target);
    chmodSync(target, statSync(from).mode & 0o777);
  }
  prune(
    destDir,
    previous.filter((file) => !targets.has(file)),
  );
  writeFileSync(manifestFile, `${JSON.stringify([...targets.keys()], null, 2)}\n`);
}

/**
 * Copies every file of `srcDir` into `destDir` (see `syncFiles`).
 * Skips `.obsidian/` and recordings (`*.cache.json`): those only flow sandbox vault → repo.
 * @param {string} srcDir
 * @param {string} destDir
 */
export function syncNotes(srcDir, destDir) {
  syncFiles(destDir, notesMappings(srcDir));
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
 * Copies `fixtures/*.cache.json` from the sandbox vault into the repo's test vault.
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

// `node scripts/sandbox-vault.mjs pull-fixtures`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { vaultDir } = resolveDevTargets(process.env, gitCommonDir);
  if (process.argv[2] !== 'pull-fixtures' || !vaultDir) {
    throw new Error(
      'usage: node scripts/sandbox-vault.mjs pull-fixtures (default sandbox vault only)',
    );
  }
  const names = pullFixtures(vaultDir, 'tests/vault');
  console.log(`Pulled ${names.length} fixtures from ${vaultDir}`);
}
