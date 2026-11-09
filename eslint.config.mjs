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
