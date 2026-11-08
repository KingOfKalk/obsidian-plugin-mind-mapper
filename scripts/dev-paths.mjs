import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

/**
 * Dev build targets. By default the plugin is built into `dev-vault/` of the main checkout,
 * one persistent vault shared by every git worktree, which also receives the test notes.
 * `MIND_MAPPER_PLUGIN_DIR` targets another vault's plugin folder; then no notes are synced.
 * @param {Record<string, string | undefined>} env
 * @param {() => string} getGitCommonDir absolute path of the repository's common `.git` directory; only called without override
 * @returns {{ vaultDir: string | null, pluginDir: string }}
 */
export function resolveDevTargets(env, getGitCommonDir) {
  const override = env.MIND_MAPPER_PLUGIN_DIR;
  if (override) return { vaultDir: null, pluginDir: override };
  const vaultDir = join(dirname(getGitCommonDir()), 'dev-vault');
  return { vaultDir, pluginDir: join(vaultDir, '.obsidian', 'plugins', 'mind-mapper') };
}

/** @returns {string} */
export function gitCommonDir() {
  return execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim();
}
