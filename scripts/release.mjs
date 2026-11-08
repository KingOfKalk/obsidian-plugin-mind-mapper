// Packages the release assets (run after `npm run check`): release/<version>/ holds the files to
// upload to the GitHub release whose tag equals the version; a zip is added when `zip` exists.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ASSETS = ['main.js', 'manifest.json', 'styles.css'];

/**
 * @param {{ root: string, version: string, hasZip: boolean, runZip: (zip: string, files: string[]) => void }} options
 * @returns {{ dir: string, zip: string | null }}
 */
export function packageRelease({ root, version, hasZip, runZip }) {
  const dir = join(root, 'release', version);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files = ASSETS.map((file) => {
    const target = join(dir, file);
    copyFileSync(join(root, file), target);
    return target;
  });
  if (!hasZip) return { dir, zip: null };
  const zip = join(root, 'release', `mind-mapper-${version}.zip`);
  rmSync(zip, { force: true });
  runZip(zip, files);
  return { dir, zip };
}

/** @param {string} path @returns {{ version: string }} */
function readVersion(path) {
  return /** @type {{ version: string }} */ (JSON.parse(readFileSync(path, 'utf8')));
}

function main() {
  const { version } = readVersion('manifest.json');
  const packageVersion = readVersion('package.json').version;
  if (version !== packageVersion) {
    throw new Error(
      `manifest.json version ${version} differs from package.json version ${packageVersion}`,
    );
  }
  const hasZip = spawnSync('zip', ['-v'], { stdio: 'ignore' }).status === 0;
  const result = packageRelease({
    root: process.cwd(),
    version,
    hasZip,
    runZip: (zip, files) => execFileSync('zip', ['-j', zip, ...files], { stdio: 'inherit' }),
  });
  console.log(`Release assets for tag ${version}: ${result.dir}`);
  console.log(result.zip ? `Zip: ${result.zip}` : 'No `zip` command found: zip skipped.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
