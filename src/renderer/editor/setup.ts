import { Compartment, EditorState } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { attachmentExtension } from '@renderer/editor/attachments'
import { checkboxWidgetExtension } from '@renderer/editor/checkboxWidget'
import { setAlignment, toggleFormat } from '@renderer/editor/formatting'
import { highlightExtension } from '@renderer/editor/highlight'
import { imageWidgetExtension } from '@renderer/editor/imageWidget'
import { languageExtension } from '@renderer/editor/language'
import { basicSetup, EditorView } from 'codemirror'

const darkTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: '#020617',
      color: '#cbd5e1',
      fontSize: '13px',
    },
    '.cm-content': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      padding: '12px 0',
      caretColor: '#c47dff',
    },
    '.cm-gutters': {
      backgroundColor: '#020617',
      color: '#475569',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: '#0f172a66' },
    '.cm-activeLineGutter': { backgroundColor: '#0f172a66', color: '#94a3b8' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#c47dff' },
    '.cm-selectionBackground': { backgroundColor: '#b14bf033' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: '#b14bf04d' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto' },
  },
  { dark: true },
)

const lightTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: '#ffffff',
      color: '#1e293b',
      fontSize: '13px',
    },
    '.cm-content': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      padding: '12px 0',
      caretColor: '#9a30dd',
    },
    '.cm-gutters': {
      backgroundColor: '#f8fafc',
      color: '#94a3b8',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: '#f1f5f922' },
    '.cm-activeLineGutter': { backgroundColor: '#f1f5f9', color: '#64748b' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#9a30dd' },
    '.cm-selectionBackground': { backgroundColor: '#b14bf020' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: '#b14bf030' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto' },
  },
  { dark: false },
)

export const themeCompartment = new Compartment()

export function getEditorTheme(resolved: 'dark' | 'light') {
  return resolved === 'dark' ? darkTheme : lightTheme
}

export type TabStateOptions = {
  path: string
  doc: string
  onDocChange: (text: string) => void
  onSave: () => void
}

export function createTabState(opts: TabStateOptions, resolved: 'dark' | 'light'): EditorState {
  return EditorState.create({
    doc: opts.doc,
    extensions: [
      basicSetup,
      themeCompartment.of(getEditorTheme(resolved)),
      languageExtension(opts.path),
      attachmentExtension(),
      imageWidgetExtension(),
      checkboxWidgetExtension(),
      highlightExtension,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) opts.onDocChange(update.state.doc.toString())
      }),
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            opts.onSave()
            return true
          },
        },
        {
          key: 'Mod-b',
          preventDefault: true,
          run: (v) => {
            toggleFormat(v, 'bold')
            return true
          },
        },
        {
          key: 'Mod-i',
          preventDefault: true,
          run: (v) => {
            toggleFormat(v, 'italic')
            return true
          },
        },
        {
          key: 'Mod-u',
          preventDefault: true,
          run: (v) => {
            toggleFormat(v, 'underline')
            return true
          },
        },
        {
          key: 'Mod-Shift-l',
          preventDefault: true,
          run: (v) => {
            setAlignment(v, 'left')
            return true
          },
        },
        {
          key: 'Mod-Shift-e',
          preventDefault: true,
          run: (v) => {
            setAlignment(v, 'center')
            return true
          },
        },
        {
          key: 'Mod-Shift-r',
          preventDefault: true,
          run: (v) => {
            setAlignment(v, 'right')
            return true
          },
        },
      ]),
    ],
  })
}
