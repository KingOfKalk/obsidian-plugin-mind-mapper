import { resolveDevTargets } from '../../scripts/dev-paths.mjs';

const commonDir = () => '/repo/.git';

test('defaults to the dev vault of the main checkout (shared by all worktrees)', () => {
  expect(resolveDevTargets({}, commonDir)).toEqual({
    vaultDir: '/repo/dev-vault',
    pluginDir: '/repo/dev-vault/.obsidian/plugins/mind-mapper',
  });
});

test('MIND_MAPPER_PLUGIN_DIR targets another vault without note sync and without git', () => {
  const noGit = vi.fn(() => {
    throw new Error('not a git repository');
  });
  expect(resolveDevTargets({ MIND_MAPPER_PLUGIN_DIR: '/vault/plugins/mm' }, noGit)).toEqual({
    vaultDir: null,
    pluginDir: '/vault/plugins/mm',
  });
  expect(noGit).not.toHaveBeenCalled();
});

test('empty MIND_MAPPER_PLUGIN_DIR is ignored', () => {
  expect(resolveDevTargets({ MIND_MAPPER_PLUGIN_DIR: '' }, commonDir).vaultDir).toBe(
    '/repo/dev-vault',
  );
});
