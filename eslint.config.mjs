import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  globalIgnores([
    'node_modules',
    'main.js',
    'release',
    'tests/vault',
    'sandbox-vault',
    '.superpowers',
    '.worktrees',
    'esbuild.config.mjs',
    'wdio.conf.mts',
    '.obsidian-cache',
  ]),
  ...obsidianmd.configs.recommended,
  // Module boundaries (issue #49): parser < layout < render < view; `view`, `main` and commands sit
  // on top. Shared names (themes, leaf recency) live in neutral top-level modules. The core rule is
  // off in the Obsidian config (it uses the TS variant for its own list), so enabling it here adds
  // to that list instead of replacing it; it also reports `import type`.
  layerBoundary('src/parser/**', ['layout', 'render', 'view']),
  layerBoundary('src/layout/**', ['render', 'view']),
  layerBoundary('src/render/**', ['view']),
  layerBoundary('src/i18n/**', ['render', 'view']),
  layerBoundary('src/settings.ts', ['render', 'view']),
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.*'],
        },
      },
    },
  },
]);

/** Files matching `files` must not import from the sibling top-level folders `src/<layer>`. */
function layerBoundary(files, layers) {
  return {
    files: [files],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^(\\.\\.?/)+(${layers.join('|')})(/|$)`,
              message: `Module boundary (issue #49): no imports from ${layers.join(', ')} here.`,
            },
          ],
        },
      ],
    },
  };
}
