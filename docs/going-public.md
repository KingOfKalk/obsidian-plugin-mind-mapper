# Going public

Checklist for the day the repository and the plugin go public. Collected while the project is local only; add items as they come up. Tick them off in the PR that does the switch.

## Decide first

- [ ] Version of the first public release (`0.x` as a beta, or `1.0.0`)
- [ ] Beta first via [BRAT](https://github.com/TfTHacker/obsidian42-brat), or straight to the community directory
- [ ] Release automation: keep `npm version` + `npm run release`, or switch to release-please like the dotfiles repo

## Repository

- [ ] Make https://github.com/KingOfKalk/obsidian-plugin-mind-mapper public
- [ ] Push `main` and the release tags to `origin`
- [ ] Protect `main` (no direct pushes, squash merges only)
- [ ] Repository description, topics (`obsidian`, `obsidian-plugin`, `mind-map`), social preview image (`docs/images/hero.png`)
- [ ] Add `repository`, `bugs` and `homepage` to `package.json`
- [ ] Add `authorUrl` (and `fundingUrl` if wanted) to `manifest.json`

## Agent and contributor docs

- [ ] `AGENTS.md`: drop "Build locally, no need for a forge like GitHub" and "Do not push to `origin` for now"; describe the issue and PR flow
- [ ] `CONTRIBUTING.md`: switch from the local workflow to issues and pull requests (open or claim an issue first, branch `<type>/<issue>-<slug>`, PR title as a Conventional Commit, PR template with issue link, summary and test plan, maintainers merge); keep the gates
- [ ] `docs/developer.md`: CI section once CI exists
- [ ] `docs/mvp.md`: the "local only" notes in the milestone sections are history; leave or trim

## Issues and pull requests

- [ ] Issue templates in `.github/ISSUE_TEMPLATE/`: bug report (Obsidian version, plugin version, OS, steps, the note's Markdown if possible), feature request
- [ ] Pull request template in `.github/pull_request_template.md`
- [ ] Labels (bug, enhancement, documentation, good first issue)
- [ ] "Report an issue" row in the settings tab's About group, linking to the issue tracker (deferred until public)
- [ ] README: "Report an issue" link next to Credits

## CI

- [ ] GitHub Actions on push and PR: `npm ci`, `npm run check`
- [ ] E2E in CI (`npm run test:e2e` under Xvfb, Obsidian cache keyed by version) — or keep E2E local and document why
- [ ] Release workflow: build on tag, attach `main.js`, `manifest.json`, `styles.css` to the GitHub release (tag without `v`, equal to the manifest version)

## Release and community directory

- [ ] Re-check the plugin id and name are still free in [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) `community-plugins.json`
- [ ] Re-check `minAppVersion` against the newest public Obsidian at release time; update `versions.json`
- [ ] Bump the `obsidian` types to the matching version once published (1.15.x types were not on npm on 2026-11-09)
- [ ] Run the full gates, `npm run readme:images`, look at the images
- [ ] `npm version <x.y.z>`, `npm run release`, push the tag, create the GitHub release with the three files and release notes
- [ ] Submit the plugin: PR to `obsidianmd/obsidian-releases` adding the entry to `community-plugins.json`; answer the review bot and reviewers
- [ ] README "Installation": confirm the community directory text once the plugin is listed

## Docs and content

- [ ] README hero image and user manual images are current (`npm run readme:images`, `npm run manual:images`)
- [ ] Changelog or release notes for the first release
- [ ] Check `test-vault/` for anything personal before it becomes public (e.g. the `Notizen` folder)
- [ ] Secrets check over the whole history (no tokens, no `.env`) before the first push
