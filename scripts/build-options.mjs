import { builtinModules } from 'node:module';

/**
 * esbuild options of the plugin bundle: one source for `esbuild.config.mjs` and the production
 * build test, so the test bundles exactly what `npm run build` ships.
 * @param {{ production: boolean, env: Record<string, string | undefined>, devPluginDir?: string, plugins?: import('esbuild').Plugin[] }} mode
 *   `env.MIND_MAPPER_DEV === '1'` keeps the dev-only code in a production build (`npm run ui:images`)
 * @returns {import('esbuild').BuildOptions}
 */
export function buildOptions({ production, env, devPluginDir = '', plugins = [] }) {
  /** Dev-only code (commands, element ID overlay). */
  const devCode = !production || env.MIND_MAPPER_DEV === '1';
  return {
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
    define: { __DEV__: JSON.stringify(devCode) },
    outfile: production ? 'main.js' : `${devPluginDir}/main.js`,
    plugins,
  };
}
