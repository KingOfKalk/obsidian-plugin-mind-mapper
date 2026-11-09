# Contributing

This repo is developed locally. There is no forge workflow yet: no issues, no pull requests, nothing is pushed to `origin` until the owner decides. This doc defines the branch, commit, merge and release workflow.

## Before You Start

- Read [AGENTS.md](AGENTS.md) (rules) and [docs/mvp.md](docs/mvp.md) (binding spec).
- Set up and run things as described in [docs/developer.md](docs/developer.md).
- Do not push to `origin`. Do not open issues or pull requests.

## Branching

- One branch per change.
- Naming: `<type>/<slug>`, e.g. `feat/dashed-dividers`, `fix/collapse-all`. Once issues exist: `<type>/<issue-number>-<slug>`.
- `<type>` is the dominant Conventional Commit type of the change; `<slug>` is a short kebab-case description.
- Each branch lives in its own git worktree at `.worktrees/<branch>` in the repo root, with `/` in the branch name replaced by `-`:
  - `git worktree add -b docs/project-docs .worktrees/docs-project-docs`
  - `.worktrees/` is listed in `.git/info/exclude`.
  - Keep the main checkout on `main`.
  - Remove the worktree after the branch is merged or abandoned.
- Never commit directly to `main`.

## Commits

- Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
- Format: `<type>[optional scope][!]: <description>`, e.g. `fix(view): keep new branches collapsed`.
- Types:
  - `feat`: new feature
  - `fix`: bug fix
  - `docs`: documentation only
  - `style`: formatting, no code change
  - `refactor`: code change that neither fixes a bug nor adds a feature
  - `perf`: performance improvement
  - `test`: add or fix tests
  - `build`: build system or dependencies
  - `ci`: CI configuration
  - `chore`: maintenance, no production code change
  - `revert`: revert a previous commit
- Scope: optional, lowercase, names the logical area (e.g. `parser`, `layout`, `render`, `view`), not a file path. Omit for cross-cutting changes.
- Description: imperative mood, lowercase, no trailing period.
- Breaking changes: add `!` after type/scope and a `BREAKING CHANGE: <details>` footer.
- Atomic: one logical concern per commit. Do not mix unrelated changes.
- No AI attribution: no `Co-Authored-By` trailers, no "generated with" lines.
- Format with Prettier before committing (`npm run format`); `*.md` files are ignored by Prettier.

## Merging

- Work is merged locally, not through pull requests.
- Squash-merge into `main` only what is tested and working. The squash commit message is a Conventional Commit.
- Gates, all must pass before the merge:
  - `npm run check` (format, lint, typecheck, unit tests, build)
  - `npm run test:e2e` (real headless Obsidian)
  - UI changes: `npm run screenshots:e2e`, then look at the PNGs in `e2e/screenshots/`
  - Review of the diff
- After every merge, run `npm run dev:build` so `sandbox-vault/` has the new build.
- Keep scope tight: unrelated work goes on a separate branch.

## Releases

- Local only for now. Push and GitHub release only when the owner decides.
- Bump the version: `npm version <x.y.z>` (or `patch|minor|major`).
  - Runs `scripts/version-bump.mjs`: syncs `manifest.json` and `versions.json`.
  - Commits `chore: release <x.y.z>` and tags `<x.y.z>`. The tag has no `v` prefix (`.npmrc`): Obsidian needs the tag to equal the manifest version.
- Package: `npm run release` runs `npm run check`, then `scripts/release.mjs` writes `main.js`, `manifest.json` and `styles.css` to `release/<x.y.z>/` (and `release/mind-mapper-<x.y.z>.zip` when `zip` is installed).
- Do not edit `manifest.json` / `versions.json` versions by hand.
