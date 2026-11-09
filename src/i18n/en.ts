/** English UI strings: the source of truth for the keys. `{name}` marks a placeholder for `t`. */
export const en = {
  // Plugin: command, ribbon, file menu, notices
  openAsMindMap: 'Open as mind map',
  openNoteFirst: 'Open a markdown note first',
  couldNotOpenMap: 'Mind Mapper: could not open the mind map',
  couldNotOpenNote: 'Could not open the note',

  // View commands and map controls
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitToView: 'Fit to view',
  resetZoom: 'Reset zoom to 100%',
  zoomPercent: '{percent}%',
  collapseAll: 'Collapse all',
  expandAll: 'Expand all',
  backToRoot: 'Back to root',
  toggleFullScreen: 'Toggle full screen',
  exitFullScreen: 'Exit full screen',

  // Nodes
  collapseNode: 'Collapse',
  expandNode: 'Expand',
  showFullContent: 'Show full content',

  // View
  viewTitle: 'Mind map',
  noNoteSelected: 'No note selected',
  noteNotFound: 'Note not found: {path}',
  loading: 'Loading…',
  couldNotReadNote: 'Could not read note',
  noteDeleted: 'Note was deleted',
  noContentYet: 'This note has no content yet',

  // Frontmatter notices
  invalidLayout: 'Mind Mapper: unknown mind-mapper-layout "{value}" in {path}, using {layout}',
  invalidCollapsed:
    'Mind Mapper: mind-mapper-collapsed "{value}" in {path} is not true or false, using {collapsed}',
  invalidTitle: 'Mind Mapper: mind-mapper-title in {path} is not text, using the default title',
  invalidTheme: 'Mind Mapper: unknown mind-mapper-theme "{value}" in {path}, using {theme}',

  // Settings
  mapHeading: 'Map',
  nodesHeading: 'Nodes',
  spacingHeading: 'Spacing',
  aboutHeading: 'About',
  defaultLayoutName: 'Default layout',
  defaultLayoutDesc: 'For notes without mind-mapper-layout in their frontmatter.',
  startCollapsedName: 'Start collapsed',
  startCollapsedDesc:
    'Open maps with only the root and the first level visible, for notes without mind-mapper-collapsed in their frontmatter.',
  defaultThemeName: 'Default theme',
  defaultThemeDesc:
    'Colours each first-level branch and everything below it, for notes without mind-mapper-theme in their frontmatter.',
  themeNone: 'None',
  themeRainbow: 'Rainbow',
  themeOcean: 'Ocean',
  themeForest: 'Forest',
  themeAccent: 'Accent colour',
  maxNodeWidthName: 'Max node width',
  maxNodeWidthDesc: 'Wider content is clipped with a fade.',
  maxNodeHeightName: 'Max node height',
  maxNodeHeightDesc: 'Taller content is clipped with a fade.',
  siblingGapName: 'Sibling gap',
  siblingGapDesc: 'Space between neighbouring branches.',
  levelGapName: 'Level gap',
  levelGapDesc: 'Space between a node and its children.',
  pixels: '{value} px',
  versionName: 'Version',
  sourceCodeName: 'Source code',
};

export type MessageKey = keyof typeof en;
/** A translation: exactly the English keys (a missing or extra key fails to compile). */
export type Messages = Record<MessageKey, string>;
