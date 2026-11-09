# Going public

Ordered plan to make the repository public and ship Mind Mapper 1.0.0. Tick items off in the PR or session that does them.

Decisions taken:

- The repository becomes public at https://github.com/KingOfKalk/obsidian-plugin-mind-mapper.
- The first release is `1.0.0`. Tags have no `v` prefix.
- Releases run through release-please.
- The plugin is not submitted to Obsidian's community directory yet. The owner and friends install it via [BRAT](https://github.com/TfTHacker/obsidian42-brat) for a while.

## Phase A: prepare (before anything leaves the machine)

- [ ] Branch `docs/public-workflow`: issue and pull request templates, `CONTRIBUTING.md`, `AGENTS.md`, README installation and "Report an issue", internal plans removed, `gh` in the devcontainer, this plan
- [ ] Branch for CI and release: GitHub Actions (`npm ci`, `npm run check`), release-please config and workflow, release assets (`main.js`, `manifest.json`, `styles.css`) attached to the GitHub release, Dependabot, "Release" section of `docs/developer.md`
- [ ] Both branches reviewed and merged into `main` locally (nothing is pushed yet)
- [ ] Rebuild the devcontainer so `gh` is installed, then `gh auth login` (the login persists in `~/.config/gh`)
- [ ] `package.json`: add `repository`, `bugs` and `homepage`
- [ ] `manifest.json`: add `authorUrl` (and `fundingUrl` if wanted)
- [ ] Repository description, topics (`obsidian`, `obsidian-plugin`, `mind-map`) and social preview image (`docs/images/hero.png`) written down for phase C
- [ ] README hero image and user manual images are current (`npm run readme:images`, `npm run manual:images`), and looked at
- [ ] `docs/mvp.md`: the "local only" notes in the milestone sections are history; leave or trim

## Phase B: privacy check (orchestrator, before the first push)

- [ ] Commit author and committer emails over the whole history: only the GitHub noreply address (or accepted ones)
- [ ] Secrets scan over the whole history (tokens, `.env`, keys), for example `gitleaks`
- [ ] Personal content: `tests/vault/` (e.g. the `Notizen` folder), `test-vault/` fixtures, `e2e/screenshots/`, images in `docs/images/`
- [ ] Internal files: no `.superpowers/` reports or other local-only files tracked (`git ls-files`)
- [ ] File names and paths that leak local details (home directory, machine names) in tracked files and screenshots

## Phase C: GitHub (needs the owner's OK for every step)

- [ ] Push `main` and the tags to `origin` (first push of the repo)
- [ ] Make the repository public
- [ ] Settings > Actions > General > Workflow permissions: allow GitHub Actions to create and approve pull requests (release-please needs it)
- [ ] Settings > General: squash merging only, delete branch on merge, default squash commit message from the PR title
- [ ] Branch protection (ruleset) for `main`: pull request required, required status checks (the CI check job), no force pushes, no deletion
- [ ] Repository description, topics and social preview image
- [ ] Labels: `bug`, `enhancement`, `documentation`, `good first issue` (the issue forms set `bug` and `enhancement`)
- [ ] Enable private vulnerability reporting (Settings > Code security), or add a security note to the README
- [ ] Open the first issues for the follow-ups below and check the issue forms and the PR template render
- [ ] "Report an issue" row in the settings tab's About group, linking to the issue tracker (code change, own issue and PR)

## Phase D: first release 1.0.0

The whole local history is pushed at once. release-please must not turn it into the changelog (it contains pre-release `BREAKING CHANGE` commits). Two release-please features handle this:

- `bootstrap-sha` in `release-please-config.json`: on the first run release-please only reads commits after this SHA (exclusive). It is ignored once a release PR has been merged.
- A `Release-As: 1.0.0` footer in the commit body: forces exactly this version, only for this release.

Extra Conventional Commit paragraphs at the bottom of the same commit body become extra changelog entries: these are the hand-written release notes.

Not used: `release-as` in the config (it pins every later release to 1.0.0 until removed); only editing the release PR (release-please rewrites it on every push to `main`).

Steps:

1. Repo settings first: Actions may create and approve pull requests; squash merging with "Pull request title"; auto-merge allowed; CodeQL default setup off. Branch protection or rulesets on a private repo need a paid plan, so they come right after the repo is public.
2. On the local `main`, with everything else for going public merged: `git rev-parse HEAD` (full SHA).
3. A commit on `main` (squash from a branch) adds `"bootstrap-sha": "<full sha>",` as a top-level key in `release-please-config.json`, with this message (`Release-As` right after the subject, no `!` or `BREAKING CHANGE`):

       feat: first public release

       Release-As: 1.0.0

       feat: show any Markdown note as a live mind map that follows the note while you write

       feat: headings, lists and blocks become nodes, rendered like reading view

       ...

   Each `feat:` paragraph becomes one bullet under "Features".
4. `git push -u origin main`. The Release workflow opens "chore(main): release 1.0.0": it bumps `package.json`, `package-lock.json`, `manifest.json` and `.release-please-manifest.json` and adds `CHANGELOG.md` with only these entries; a second job adds `"1.0.0": "1.15.0"` to `versions.json` on the PR branch.
5. Review the PR. Wording fixes: a new commit on `main` with the same `Release-As: 1.0.0` footer and the new entries, or edit the PR body/`CHANGELOG.md` and push nothing to `main` until it is merged.
6. Squash-merge the release PR (title `chore(main): release 1.0.0`). Without the `RELEASE_PLEASE_TOKEN` secret, CI does not run on this PR: merge as admin.
7. The Release workflow tags `1.0.0`, creates the release "1.0.0" and uploads `main.js`, `manifest.json`, `styles.css`, `versions.json` and `mind-mapper-1.0.0.zip`. Check: tag equals `manifest.json` `version`, no `v`; the zip contains `mind-mapper/{main.js,manifest.json,styles.css}`; the notes are the hand-written ones.
8. Later, in a normal PR: `chore: remove release-please bootstrap-sha`.

If the release PR shows a wrong version or the whole history: close it, fix the config or the commit on `main` (`bootstrap-sha` must be the full 40-character SHA of the commit just before step 3), and push again.

- [ ] Run the full gates on `main`: `npm run check`, `npm run test:e2e`, `npm run screenshots:e2e` (look at the PNGs)
- [ ] The release PR from release-please is merged and the GitHub release `1.0.0` exists with `main.js`, `manifest.json` and `styles.css`
- [ ] The tag is `1.0.0` (no `v`) and equals `version` in `manifest.json`; `versions.json` maps `1.0.0` to `minAppVersion`
- [ ] Install via BRAT in a clean vault (`KingOfKalk/obsidian-plugin-mind-mapper`), open a note as a map, check the About group shows `1.0.0`
- [ ] Install manually from the release files in a clean vault
- [ ] Release notes read well; the changelog is not empty

## Phase E: community directory (postponed)

Not planned yet. Keep these for when the owner decides to submit.

- [ ] Re-check the plugin id and name are still free in [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) `community-plugins.json`
- [ ] Re-check `minAppVersion` against the newest public Obsidian at release time; update `versions.json`
- [ ] Bump the `obsidian` types to the matching version once published (1.15.x types were not on npm on 2026-11-09)
- [ ] Check the plugin against the [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) and the submission requirements
- [ ] Submit the plugin: PR to `obsidianmd/obsidian-releases` adding the entry to `community-plugins.json`; answer the review bot and reviewers
- [ ] README "Installation": change "Community directory: planned" to the real instructions once the plugin is listed
- [ ] `docs/going-public.md`: remove this file or archive it once everything is done
