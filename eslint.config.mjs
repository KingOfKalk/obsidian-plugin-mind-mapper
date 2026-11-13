import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

const SENTENCE_CASE = { brands: ['Mind Mapper', 'Markdown', 'Obsidian'] };

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
  // `recommended` plus sentence case for the English strings in `src/i18n/en.ts`.
  ...obsidianmd.configs.recommendedWithLocalesEn,
  // Sentence case also for UI text written directly in code (dev notices), as errors so that
  // `npm run check` fails on it. `brands` replaces the rule's built-in list, so it names every
  // brand our UI text uses; the plugin name "Mind Mapper" keeps its capitals.
  {
    files: ['src/**/*.ts'],
    rules: {
      'obsidianmd/ui/sentence-case': ['error', SENTENCE_CASE],
      'obsidianmd/ui/sentence-case-locale-module': ['error', SENTENCE_CASE],
    },
  },
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
