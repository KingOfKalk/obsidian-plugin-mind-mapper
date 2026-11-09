import type { Messages } from './en';

/** German UI strings, worded like Obsidian's German UI (du-form). */
export const de: Messages = {
  // Plugin: command, ribbon, file menu, notices
  openAsMindMap: 'Als Mindmap öffnen',
  openNoteFirst: 'Öffne zuerst eine Markdown-Notiz',
  couldNotOpenMap: 'Mind Mapper: Die Mindmap konnte nicht geöffnet werden',
  couldNotOpenNote: 'Die Notiz konnte nicht geöffnet werden',

  // View commands and map controls
  zoomIn: 'Vergrößern',
  zoomOut: 'Verkleinern',
  fitToView: 'An Ansicht anpassen',
  resetZoom: 'Vergrößerung auf 100 % zurücksetzen',
  // No-break space: German writes "100 %", the number and sign stay on one line.
  zoomPercent: '{percent}\u00a0%',
  collapseAll: 'Alle einklappen',
  expandAll: 'Alle ausklappen',
  backToRoot: 'Zurück zum Hauptthema',
  toggleFullScreen: 'Vollbild umschalten',
  exitFullScreen: 'Vollbild beenden',

  // Nodes
  collapseNode: 'Einklappen',
  expandNode: 'Ausklappen',
  showFullContent: 'Gesamten Inhalt anzeigen',

  // View
  viewTitle: 'Mindmap',
  noNoteSelected: 'Keine Notiz ausgewählt',
  noteNotFound: 'Notiz nicht gefunden: {path}',
  loading: 'Wird geladen…',
  couldNotReadNote: 'Die Notiz konnte nicht gelesen werden',
  noteDeleted: 'Die Notiz wurde gelöscht',
  noContentYet: 'Diese Notiz hat noch keinen Inhalt',

  // Frontmatter notices
  invalidLayout:
    'Mind Mapper: Unbekanntes mind-mapper-layout "{value}" in {path}, {layout} wird verwendet',
  invalidCollapsed:
    'Mind Mapper: mind-mapper-collapsed "{value}" in {path} ist nicht true oder false, {collapsed} wird verwendet',
  invalidTitle:
    'Mind Mapper: mind-mapper-title in {path} ist kein Text, der Standardtitel wird verwendet',
  invalidTheme:
    'Mind Mapper: Unbekanntes mind-mapper-theme "{value}" in {path}, {theme} wird verwendet',

  // Settings
  mapHeading: 'Mindmap',
  nodesHeading: 'Knoten',
  spacingHeading: 'Abstände',
  aboutHeading: 'Über',
  defaultLayoutName: 'Standard-Layout',
  defaultLayoutDesc: 'Für Notizen ohne mind-mapper-layout im Frontmatter.',
  startCollapsedName: 'Eingeklappt starten',
  startCollapsedDesc:
    'Mindmaps nur mit dem Hauptthema und der ersten Ebene öffnen, für Notizen ohne mind-mapper-collapsed im Frontmatter.',
  defaultThemeName: 'Standard-Farbschema',
  defaultThemeDesc:
    'Färbt jeden Hauptast und alles darunter in einer eigenen Farbe, für Notizen ohne mind-mapper-theme im Frontmatter.',
  themeNone: 'Keins',
  themeRainbow: 'Regenbogen',
  themeOcean: 'Ozean',
  themeForest: 'Wald',
  themeAccent: 'Akzentfarbe',
  maxNodeWidthName: 'Maximale Knotenbreite',
  maxNodeWidthDesc: 'Breiterer Inhalt wird abgeschnitten und ausgeblendet.',
  maxNodeHeightName: 'Maximale Knotenhöhe',
  maxNodeHeightDesc: 'Höherer Inhalt wird abgeschnitten und ausgeblendet.',
  siblingGapName: 'Geschwisterabstand',
  siblingGapDesc: 'Abstand zwischen benachbarten Zweigen.',
  levelGapName: 'Ebenenabstand',
  levelGapDesc: 'Abstand zwischen einem Knoten und seinen Kindknoten.',
  pixels: '{value} px',
  versionName: 'Version',
  sourceCodeName: 'Quellcode',
};
