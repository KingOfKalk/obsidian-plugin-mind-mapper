import { copyFileSync, mkdirSync, watch, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import esbuild from 'esbuild';
import { gitCommonDir, resolveDevTargets } from './scripts/dev-paths.mjs';
import { docsMappings, enablePlugin, notesMappings, syncFiles } from './scripts/dev-vault.mjs';

const production = process.argv[2] === 'production';
/** `once`: one dev build into the dev vault, then exit (no watch). */
const once = process.argv[2] === 'once';
const dev = production ? null : resolveDevTargets(process.env, gitCommonDir);
const devPluginDir = dev?.pluginDir ?? '';

if (dev?.vaultDir) {
  // One sync (and one manifest) for the test notes and the docs, so pruning covers both.
  syncFiles(dev.vaultDir, [...notesMappings('tests/vault'), ...docsMappings('docs')]);
  enablePlugin(dev.vaultDir, 'mind-mapper');
  console.log(`Dev vault: ${dev.vaultDir}`);
}

/** Copies manifest and styles next to the dev build and touches `.hotreload` for the Hot Reload plugin. */
const devAssets = {
  name: 'dev-assets',
  setup(build) {
    build.onEnd(() => {
      mkdirSync(devPluginDir, { recursive: true });
      copyFileSync('manifest.json', `${devPluginDir}/manifest.json`);
      copyFileSync('styles.css', `${devPluginDir}/styles.css`);
      writeFileSync(`${devPluginDir}/.hotreload`, '');
    });
  },
};

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  target: 'es2022',
  platform: 'browser',
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', ...builtinModules],
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  minify: production,
  treeShaking: true,
  define: { __DEV__: JSON.stringify(!production) },
  outfile: production ? 'main.js' : `${devPluginDir}/main.js`,
  plugins: production ? [] : [devAssets],
});

if (production || once) {
  await context.rebuild();
  await context.dispose();
} else {
  // esbuild only watches imported files; re-trigger a rebuild when styles.css changes.
  // A failed rebuild is already logged by esbuild; swallow it so the watcher keeps running.
  await context.watch();
  watch('styles.css', () => {
    context.rebuild().catch(() => {});
  });
}
