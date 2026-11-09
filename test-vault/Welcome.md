---
mind-mapper-theme: rainbow
---

# Welcome to Mind Mapper

Mind Mapper shows a Markdown note as a live mind map.
Headings, lists and blocks become nodes; edit the note and the map follows.

## Open a map

- Command palette: "Mind Mapper: Open as mind map"
- Ribbon icon on the left edge
- File menu: right-click a note, "Open as mind map"

## Start here

- [[Feature tour]]: nearly every feature of the map in one note
- [[Simple note]]: a small everyday note, a good first map

## Folders

- `demo/`
  - Notes to look at and play with
- `fixtures/`
  - Parser test notes, one case each
  - Notes named "(warning expected)" trigger a warning notice on purpose
- `assets/`
  - Images used by the notes

## Frontmatter

- Four keys per note, all optional
  - `mind-mapper-title`: text for the root
  - `mind-mapper-layout`: `circle-clockwise`, `circle-counter-clockwise`, `left-to-right`, `right-to-left`, `top-to-bottom` or `bottom-to-top`
  - `mind-mapper-collapsed`: `true` or `false`
  - `mind-mapper-theme`: `none`, `rainbow`, `ocean`, `forest` or `accent`

```yaml
mind-mapper-title: My plan
mind-mapper-layout: top-to-bottom
mind-mapper-collapsed: true
mind-mapper-theme: ocean
```

## Docs

- [[User manual]]: every feature, layout and theme
- [[Developer guide]]: tests, screenshots, dev vault
- In the repository: `docs/user-manual.md`
