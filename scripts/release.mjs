// Packages the release assets into release/mind-mapper-<version>.zip (run after `npm run check`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

/** @param {string} path @returns {{ version: string }} */
function readVersion(path) {
  return /** @type {{ version: string }} */ (JSON.parse(readFileSync(path, 'utf8')));
}

const { version } = readVersion('manifest.json');
const packageVersion = readVersion('package.json').version;
if (version !== packageVersion) {
  throw new Error(
    `manifest.json version ${version} differs from package.json version ${packageVersion}`,
  );
}

const zip = `release/mind-mapper-${version}.zip`;
mkdirSync('release', { recursive: true });
rmSync(zip, { force: true });
execFileSync('zip', ['-j', zip, 'main.js', 'manifest.json', 'styles.css'], { stdio: 'inherit' });
console.log(`Created ${zip}`);
