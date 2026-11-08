import { bumpVersion } from '../../scripts/version-bump.mjs';

test('bumpVersion sets manifest version and maps it to minAppVersion', () => {
  const result = bumpVersion(
    { version: '0.1.0', minAppVersion: '1.7.2' },
    { '0.1.0': '1.7.2' },
    '0.2.0',
  );
  expect(result.manifest).toEqual({ version: '0.2.0', minAppVersion: '1.7.2' });
  expect(result.versions).toEqual({ '0.1.0': '1.7.2', '0.2.0': '1.7.2' });
});

test('bumpVersion does not mutate inputs', () => {
  const manifest = { version: '0.1.0', minAppVersion: '1.7.2' };
  const versions = { '0.1.0': '1.7.2' };
  bumpVersion(manifest, versions, '0.2.0');
  expect(manifest).toEqual({ version: '0.1.0', minAppVersion: '1.7.2' });
  expect(versions).toEqual({ '0.1.0': '1.7.2' });
});
