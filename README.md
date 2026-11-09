# Mind Mapper

Show any Markdown note as a live mind map in Obsidian. Headings, paragraphs, lists and blocks become nodes, rendered the way reading view renders them, and the map follows the note while you write.

Full guide: [docs/user-manual.md](docs/user-manual.md)

![Obsidian with the file explorer and a note shown as a balanced mind map: a table, math, code, an image, a quote, a callout and tasks as nodes, dashed link lines, a divider and a collapsed branch](docs/images/hero.png)

## Features

- **Live companion:** open the map next to the note; edits show up in the map after Obsidian saves the note (about 2 s), and pan, zoom, selection and collapsed branches are kept
- **Real content:** code with highlighting, tables, math, callouts, Mermaid diagrams, task checkboxes (read-only) and image thumbnails, rendered by Obsidian itself
- **Balanced layouts:** a balanced circle layout by default, plus left-to-right, right-to-left, top-to-bottom and bottom-to-top; per note via frontmatter
- **Navigation:** double click a node to jump to its line, links open like in Obsidian with page preview, links to headings and blocks in the same note are drawn as dashed lines
- **Collapse, full screen, back to root,** and smooth panning on notes with thousands of nodes
- **Languages:** English and German; follows Obsidian's language setting (Settings → General → Language)

## How a note becomes a map

- The root is the note's single H1 (if nothing comes before it), else the file name; `mind-mapper-title` overrides it
- Every heading is a branch, nested by level (skipped levels attach to the nearest heading above)
- Every paragraph, list item and block (code, table, math, quote, callout) is a node under its heading; nested list items nest their nodes
- Frontmatter, comments (`%% %%`), HTML blocks and footnote definitions are left out
- Horizontal rules (`---`, `***`, `___`) are not nodes: they show as a dashed line in a wider gap between the two branches they separate, also before a heading (e.g. `---` between two `##` sections); one before the first or after the last node of a section is not shown
- Large nodes are capped at the max node size (default 320 × 240 px) with a fade; the expand icon shows all of it
- Image embeds show a thumbnail; other embeds become plain links (no transclusion)

## Opening a map

- Command palette: "Open as mind map" (while a Markdown note is active)
- File menu of a note: "Open as mind map"
- Ribbon icon "Open as mind map": opens the active note

The map opens in a split next to the note and stays pinned to that note (also after a rename).

## Commands

No command has a default hotkey (Obsidian plugin guidelines); assign your own in Settings > Hotkeys. Avoid `Ctrl/Cmd + =`, `Ctrl/Cmd + -` and `Ctrl/Cmd + 0`: Obsidian uses them to zoom the whole app.

| Command | Available | Suggested hotkey |
|---|---|---|
| Open as mind map | a Markdown note is active | |
| Zoom in | a mind map is active | `Ctrl/Cmd + Shift + =` |
| Zoom out | a mind map is active | `Ctrl/Cmd + Shift + -` |
| Fit to view | a mind map is active | `Shift + 1` |
| Reset zoom to 100% | a mind map is active | `Shift + 0` |
| Collapse all | a mind map is active | `Ctrl/Cmd + Shift + [` |
| Expand all | a mind map is active | `Ctrl/Cmd + Shift + ]` |
| Back to root | a mind map is active | `Shift + H` |
| Toggle full screen | a mind map is active | `Ctrl/Cmd + Shift + F11` |

## Map navigation

- Mouse wheel / two-finger scroll: pan
- `Ctrl/Cmd` + wheel, trackpad pinch: zoom at the pointer
- Drag on empty canvas: pan
- Floating controls (bottom center): zoom out, current zoom (click resets to 100%), zoom in, fit to view, collapse all / expand all (one button: highlighted while anything is collapsed, then it expands all), back to root, full screen
- Click a node: select it; click the empty canvas: clear the selection
- Double click a node: jump to its line in the note (in the note's tab, else a split next to the map)
- Round button on a node's edge: collapse / expand its branch (shows the number of hidden nodes when collapsed)
- Links inside nodes behave like in Obsidian: click opens (`Ctrl/Cmd` + click: new tab), hover shows the page preview
- Links to a heading or block in the same note (`[[#Heading]]`, `[[#A#B]]`, `[[#^id]]`, `[[This note#Heading]]`) are drawn as dashed lines between the nodes; a collapsed end attaches to its nearest visible ancestor
- Full screen covers the whole Obsidian window (previews, menus and notices stay on top); `Esc` or the button top right exits and restores the previous view; the controls fade after 2 s without mouse movement

## Layouts

| Layout | Shape |
|---|---|
| `circle-clockwise` (default) | Balanced: the first half of the first-level branches on the right (top to bottom), the rest on the left (bottom to top) |
| `circle-counter-clockwise` | The same, mirrored |
| `left-to-right`, `right-to-left`, `top-to-bottom`, `bottom-to-top` | All branches grow in that direction |

## Frontmatter

| Key | Values | Default |
|---|---|---|
| `mind-mapper-title` | any text | the single H1, else the file name |
| `mind-mapper-layout` | one of the layouts above | the plugin setting |
| `mind-mapper-collapsed` | `true` or `false` (a checkbox in Properties) | the plugin setting "Start collapsed" |

`mind-mapper-collapsed: true` opens the map like after "Collapse all": root and first level visible, and branches added by later edits stay collapsed until "Expand all". Changing the value while the map is open collapses or expands all once; other edits keep what you expanded or collapsed.

An unknown layout, a title that is not text or a `mind-mapper-collapsed` that is not `true`/`false` falls back to the default and shows a notice once per note and value (per session).

## Settings

| Setting | Range | Default |
|---|---|---|
| Default layout | the layouts above | `circle-clockwise` |
| Start collapsed | on / off | off |
| Max node width | 160–800 px | 320 px |
| Max node height | 120–800 px | 240 px |
| Sibling gap | 0–200 px | 12 px |
| Level gap | 20–400 px | 60 px |

Content larger than the max node size is clipped with a fade; the expand icon shows all of it. Changes apply to open maps right away.

## Large notes

- Only nodes in and around the visible area are rendered; panning renders the rest as they come into view (at most 40 new nodes per frame, nearest first)
- Below 20 % zoom, maps with more than 60 nodes in view are drawn as outlines without text, and more than 300 nodes in view are outlines at any zoom; zoom in to read
- Edges and link lines are always complete
- Benchmark (`npm run perf:e2e`, headless): 1,000 nodes open in about 0.1 s and pan and zoom at 60 fps; 5,000 nodes open in about 0.25 s

## Known limits

- Desktop only
- The map is read-only: edit the note, not the map (checkboxes in nodes cannot be ticked)
- Embedded notes, PDFs and media are shown as links, not transcluded
- Dashed link lines only connect headings and blocks within the same note; lines are not routed around nodes
- The map updates when Obsidian saves the note (about 2 s after typing stops), not on every keystroke
- Collapsed branches are remembered while the map is open, not across restarts
- A `---` directly under a line of text turns that text into a heading (Markdown rule, same as reading view); leave a blank line above a divider, or use `***`
- A second `--- ... ---` block in the middle of a note is not frontmatter: its last line becomes a heading

## Installation

- From the community directory: once published, search for "Mind Mapper" in Settings > Community plugins
- Manually: download `main.js`, `manifest.json` and `styles.css` from a release into `<vault>/.obsidian/plugins/mind-mapper/`, then enable Mind Mapper in Settings > Community plugins
- Requires Obsidian 1.15.0 or later (desktop)

## Development

Development: see [docs/developer.md](docs/developer.md)

## Credits

- Built with the help of [obra/superpowers](https://github.com/obra/superpowers), skills for coding agents
