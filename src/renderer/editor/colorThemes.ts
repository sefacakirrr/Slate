import { EditorView } from '@codemirror/view'

export type ColorTheme = {
  id: string
  name: string
  base: 'dark' | 'light'
  colors: {
    bg: string
    fg: string
    gutterBg: string
    gutterFg: string
    activeLine: string
    activeLineGutter: string
    cursor: string
    selection: string
    selectionFocused: string
  }
}

export const BUILTIN_THEMES: ColorTheme[] = [
  {
    id: 'default-dark',
    name: 'Default Dark',
    base: 'dark',
    colors: {
      bg: '#0a0e1a',
      fg: '#cbd5e1',
      gutterBg: '#0a0e1a',
      gutterFg: '#475569',
      activeLine: '#131a2b66',
      activeLineGutter: '#131a2b66',
      cursor: '#a78bfa',
      selection: '#8b5cf633',
      selectionFocused: '#8b5cf64d',
    },
  },
  {
    id: 'default-light',
    name: 'Default Light',
    base: 'light',
    colors: {
      bg: '#ffffff',
      fg: '#1e293b',
      gutterBg: '#f8fafc',
      gutterFg: '#94a3b8',
      activeLine: '#f1f5f922',
      activeLineGutter: '#f1f5f9',
      cursor: '#6d28d9',
      selection: '#8b5cf620',
      selectionFocused: '#8b5cf630',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    base: 'dark',
    colors: {
      bg: '#282a36',
      fg: '#f8f8f2',
      gutterBg: '#282a36',
      gutterFg: '#6272a4',
      activeLine: '#44475a66',
      activeLineGutter: '#44475a',
      cursor: '#f8f8f2',
      selection: '#44475a',
      selectionFocused: '#44475acc',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    base: 'dark',
    colors: {
      bg: '#2e3440',
      fg: '#d8dee9',
      gutterBg: '#2e3440',
      gutterFg: '#4c566a',
      activeLine: '#3b425266',
      activeLineGutter: '#3b4252',
      cursor: '#88c0d0',
      selection: '#434c5e',
      selectionFocused: '#434c5ecc',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    base: 'dark',
    colors: {
      bg: '#272822',
      fg: '#f8f8f2',
      gutterBg: '#272822',
      gutterFg: '#75715e',
      activeLine: '#3e3d3266',
      activeLineGutter: '#3e3d32',
      cursor: '#f8f8f0',
      selection: '#49483e',
      selectionFocused: '#49483ecc',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    base: 'dark',
    colors: {
      bg: '#002b36',
      fg: '#839496',
      gutterBg: '#002b36',
      gutterFg: '#586e75',
      activeLine: '#073642',
      activeLineGutter: '#073642',
      cursor: '#268bd2',
      selection: '#073642',
      selectionFocused: '#073642cc',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    base: 'light',
    colors: {
      bg: '#fdf6e3',
      fg: '#657b83',
      gutterBg: '#fdf6e3',
      gutterFg: '#93a1a1',
      activeLine: '#eee8d5',
      activeLineGutter: '#eee8d5',
      cursor: '#268bd2',
      selection: '#eee8d5',
      selectionFocused: '#eee8d5cc',
    },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    base: 'dark',
    colors: {
      bg: '#0d1117',
      fg: '#c9d1d9',
      gutterBg: '#0d1117',
      gutterFg: '#484f58',
      activeLine: '#161b2266',
      activeLineGutter: '#161b22',
      cursor: '#58a6ff',
      selection: '#264f78',
      selectionFocused: '#264f78cc',
    },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    base: 'dark',
    colors: {
      bg: '#282c34',
      fg: '#abb2bf',
      gutterBg: '#282c34',
      gutterFg: '#636d83',
      activeLine: '#2c313c',
      activeLineGutter: '#2c313c',
      cursor: '#528bff',
      selection: '#3e4451',
      selectionFocused: '#3e4451cc',
    },
  },
]

export function buildEditorTheme(theme: ColorTheme) {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: theme.colors.bg,
        color: theme.colors.fg,
        fontSize: '13px',
      },
      '.cm-content': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        padding: '12px 0',
        caretColor: theme.colors.cursor,
      },
      '.cm-gutters': {
        backgroundColor: theme.colors.gutterBg,
        color: theme.colors.gutterFg,
        border: 'none',
      },
      '.cm-activeLine': { backgroundColor: theme.colors.activeLine },
      '.cm-activeLineGutter': { backgroundColor: theme.colors.activeLineGutter, color: theme.colors.gutterFg },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: theme.colors.cursor },
      '.cm-selectionBackground': { backgroundColor: theme.colors.selection },
      '&.cm-focused .cm-selectionBackground': { backgroundColor: theme.colors.selectionFocused },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': { overflow: 'auto' },
    },
    { dark: theme.base === 'dark' },
  )
}

export function validateImportedTheme(json: unknown): ColorTheme | null {
  if (typeof json !== 'object' || json === null) return null
  const obj = json as Record<string, unknown>
  if (typeof obj.name !== 'string') return null
  if (obj.base !== 'dark' && obj.base !== 'light') return null
  if (typeof obj.colors !== 'object' || obj.colors === null) return null
  const colors = obj.colors as Record<string, unknown>
  const required = ['bg', 'fg', 'gutterBg', 'gutterFg', 'activeLine', 'activeLineGutter', 'cursor', 'selection', 'selectionFocused']
  for (const key of required) {
    if (typeof colors[key] !== 'string') return null
  }
  const id = typeof obj.id === 'string' ? obj.id : `custom-${Date.now()}`
  return { id, name: obj.name, base: obj.base, colors: colors as unknown as ColorTheme['colors'] }
}
