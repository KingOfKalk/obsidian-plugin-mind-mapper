import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageRelease } from '../../scripts/release.mjs';

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'mm-release-'));
  for (const file of ['main.js', 'manifest.json', 'styles.css']) {
    writeFileSync(join(root, file), `content of ${file}`);
  }
  return root;
}

test('release assets are copied into release/<version>/', () => {
  const root = project();
  const runZip = vi.fn();
  const result = packageRelease({ root, version: '1.2.3', hasZip: false, runZip });
  const dir = join(root, 'release', '1.2.3');
  expect(result).toEqual({ dir, zip: null });
  for (const file of ['main.js', 'manifest.json', 'styles.css']) {
    expect(readFileSync(join(dir, file), 'utf8')).toBe(`content of ${file}`);
  }
  // without a zip binary the zip is skipped
  expect(runZip).not.toHaveBeenCalled();
});

test('with zip available a zip of the three assets is written as well', () => {
  const root = project();
  const runZip = vi.fn();
  const result = packageRelease({ root, version: '1.2.3', hasZip: true, runZip });
  const zip = join(root, 'release', 'mind-mapper-1.2.3.zip');
  expect(result.zip).toBe(zip);
  expect(runZip).toHaveBeenCalledWith(zip, [
    join(root, 'release', '1.2.3', 'main.js'),
    join(root, 'release', '1.2.3', 'manifest.json'),
    join(root, 'release', '1.2.3', 'styles.css'),
  ]);
  expect(existsSync(join(root, 'release', '1.2.3', 'main.js'))).toBe(true);
});
