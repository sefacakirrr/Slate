/** editor strings (English source). */
export const editor = {
  /** Floating formatting toolbar shown over a selection. `{shortcut}` is e.g. "Ctrl+B". */
  toolbar: {
    bold: 'Bold ({shortcut})',
    italic: 'Italic ({shortcut})',
    underline: 'Underline ({shortcut})',
    strikethrough: 'Strikethrough',
    inlineCode: 'Inline code',
    toggleChecklist: 'Toggle checklist',
    alignLeft: 'Align left ({shortcut})',
    alignCenter: 'Align center ({shortcut})',
    alignRight: 'Align right ({shortcut})',
    textColor: 'Text color',
    backgroundColor: 'Background color',
    fontSize: 'Font size',
    clearFormatting: 'Remove all formatting',
    backgroundSwatch: 'Background: {color}',
    textSwatch: 'Text: {color}',
    /** Screen-reader names of the swatch buttons. */
    backgroundSwatchLabel: 'Background {color}',
    textSwatchLabel: 'Text color {color}',
  },
  /** Colour names used in the swatch tooltips. */
  colors: {
    yellow: 'yellow',
    orange: 'orange',
    red: 'red',
    pink: 'pink',
    purple: 'purple',
    blue: 'blue',
    teal: 'teal',
    green: 'green',
    gray: 'gray',
    white: 'white',
  },
  attachments: {
    pastedFile: 'Pasted file',
    tooLarge: '"{name}" is over the 10 MB attachment limit.',
    attachFailed: 'Couldn\'t attach "{name}".',
  },
  image: {
    notFound: 'Image not found: {name}',
    fallbackName: 'attachment',
    resizeHandle: 'Drag to resize — double-click image to reset',
  },
  /** Built-in colour theme names (brand-like names such as "Dracula" are not translated). */
  themes: {
    defaultDark: 'Default Dark',
    defaultLight: 'Default Light',
  },
}
