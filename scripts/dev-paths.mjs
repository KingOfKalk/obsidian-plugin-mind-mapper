import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

/**
 * Dev build target. Defaults to the main checkout's test vault, so every git worktree
 * builds into the one vault that is set up in Obsidian.
 * @param {Record<string, string | undefined>} env
 * @param {() => string} getGitCommonDir returns the absolute path of the repository's common `.git` directory; only called without override
 * @returns {string}
 */
export function resolveDevPluginDir(env, getGitCommonDir) {
  const override = env.MIND_MAPPER_PLUGIN_DIR;
  if (override) return override;
  return join(dirname(getGitCommonDir()), 'test-vault', '.obsidian', 'plugins', 'mind-mapper');
}

/** @returns {string} */
export function gitCommonDir() {
  return execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim();
}
