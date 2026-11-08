import { copyFileSync, mkdirSync, watch, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import esbuild from 'esbuild';
import { gitCommonDir, resolveDevPluginDir } from './scripts/dev-paths.mjs';

const production = process.argv[2] === 'production';
const devPluginDir = production ? '' : resolveDevPluginDir(process.env, gitCommonDir);

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
  outfile: production ? 'main.js' : `${devPluginDir}/main.js`,
  plugins: production ? [] : [devAssets],
});

if (production) {
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
