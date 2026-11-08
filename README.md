# Obsidian Mind Mapper

Obsidian plugin that renders a Markdown note as a mind map.

- Spec: [docs/mvp.md](docs/mvp.md)
- License: [GPL-3.0](LICENSE)

## Commands

| Command | Default hotkey |
|---|---|
| Open as mind map | none (assign your own in Settings > Hotkeys) |

## Development

- Requirements: Node.js and npm (the devcontainer has both)
- `npm install`
- `npm run dev`: watch build into the main checkout's `test-vault/.obsidian/plugins/mind-mapper/` (also copies `manifest.json`, `styles.css` and writes `.hotreload`)
  - Git worktrees build into the same vault, so the setup below is needed only once
  - `MIND_MAPPER_PLUGIN_DIR=<vault>/.obsidian/plugins/mind-mapper npm run dev` targets another vault
- Test vault, one-time setup on the host:
  - Open `test-vault/` of the main checkout as a vault in Obsidian
  - Enable community plugins
  - Install [Hot Reload](https://github.com/pjeby/hot-reload) into the test vault and enable it
  - Enable Mind Mapper
- `npm run check`: format check, lint, typecheck, unit tests, production build; must pass before merging into `main`
- `npm test` / `npm run test:watch`: unit tests (Vitest, `obsidian` is mocked in `tests/mocks/obsidian.ts`)

## Release (local)

- `npm version <patch|minor|major>`: bumps `package.json`, syncs `manifest.json` and `versions.json`, commits and tags
- `npm run release`: runs `npm run check`, then writes `release/mind-mapper-<version>.zip` with `main.js`, `manifest.json`, `styles.css`
