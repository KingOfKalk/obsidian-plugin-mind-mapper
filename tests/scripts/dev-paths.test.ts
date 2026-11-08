import { resolveDevPluginDir } from '../../scripts/dev-paths.mjs';

const commonDir = () => '/repo/.git';

test('defaults to the test vault of the main checkout (shared by all worktrees)', () => {
  expect(resolveDevPluginDir({}, commonDir)).toBe('/repo/test-vault/.obsidian/plugins/mind-mapper');
});

test('MIND_MAPPER_PLUGIN_DIR overrides the default without asking git', () => {
  const noGit = vi.fn(() => {
    throw new Error('not a git repository');
  });
  expect(resolveDevPluginDir({ MIND_MAPPER_PLUGIN_DIR: '/vault/plugins/mm' }, noGit)).toBe(
    '/vault/plugins/mm',
  );
  expect(noGit).not.toHaveBeenCalled();
});

test('empty MIND_MAPPER_PLUGIN_DIR is ignored', () => {
  expect(resolveDevPluginDir({ MIND_MAPPER_PLUGIN_DIR: '' }, commonDir)).toBe(
    '/repo/test-vault/.obsidian/plugins/mind-mapper',
  );
});
