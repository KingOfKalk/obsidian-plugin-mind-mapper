# Going public

The repository is public and Mind Mapper is released (1.0.0 and later, via release-please; BRAT works for friends). This file lists only what is still open.

## Open

- [ ] `manifest.json`: add `authorUrl` (and `fundingUrl` if wanted)
- [ ] `package.json`: add `repository`, `bugs` and `homepage`
- [ ] "Report an issue" row in the settings tab's About group, linking to the issue tracker (code change, own issue and PR)
- [ ] Social preview image (`docs/images/hero.png`) set in the repository settings (not checkable from the API)

## Community directory (postponed)

Not planned yet. Keep these for when the owner decides to submit.

- [ ] Re-check the plugin id and name are still free in [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) `community-plugins.json`
- [ ] Re-check `minAppVersion` against the newest public Obsidian at release time; update `versions.json`
- [ ] Bump the `obsidian` types to the matching version once published (1.15.x types were not on npm on 2026-11-09)
- [ ] Check the plugin against the [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) and the submission requirements
- [ ] Submit the plugin: PR to `obsidianmd/obsidian-releases` adding the entry to `community-plugins.json`; answer the review bot and reviewers
- [ ] README "Installation": change "Community directory: planned" to the real instructions once the plugin is listed
- [ ] Delete this file once everything is done
