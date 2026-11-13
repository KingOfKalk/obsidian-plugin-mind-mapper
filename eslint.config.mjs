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
    // TEMP diagnostics (issue 62)
    'e2e/helpers.ts',
    'e2e/specs/alignment*.e2e.ts',
    'src/view/MindMapView.ts',
    'src/view/animation.ts',
  ]),
  ...obsidianmd.configs.recommended,
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
