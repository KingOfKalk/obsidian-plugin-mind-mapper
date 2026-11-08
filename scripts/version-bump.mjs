// npm `version` lifecycle hook: syncs manifest.json and versions.json with package.json.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * @template {{ version: string, minAppVersion: string }} M
 * @param {M} manifest
 * @param {Record<string, string>} versions
 * @param {string} newVersion
 * @returns {{ manifest: M, versions: Record<string, string> }}
 */
export function bumpVersion(manifest, versions, newVersion) {
  return {
    manifest: { ...manifest, version: newVersion },
    versions: { ...versions, [newVersion]: manifest.minAppVersion },
  };
}

/** @param {string} path */
function readJson(path) {
  return /** @type {unknown} */ (JSON.parse(readFileSync(path, 'utf8')));
}

/** @param {string} path @param {unknown} data */
function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  const newVersion = process.env.npm_package_version;
  if (!newVersion) throw new Error('npm_package_version is not set; run via `npm version`');
  const result = bumpVersion(
    /** @type {{ version: string, minAppVersion: string }} */ (readJson('manifest.json')),
    /** @type {Record<string, string>} */ (readJson('versions.json')),
    newVersion,
  );
  writeJson('manifest.json', result.manifest);
  writeJson('versions.json', result.versions);
  execFileSync('git', ['add', 'manifest.json', 'versions.json']);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
