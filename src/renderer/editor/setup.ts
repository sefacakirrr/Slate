import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { lintKeymap } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import { BUILTIN_THEMES, type ColorTheme, buildEditorTheme } from '@renderer/editor/colorThemes'
import { attachmentExtension } from '@renderer/editor/attachments'
import { checkboxWidgetExtension } from '@renderer/editor/checkboxWidget'
import { setAlignment, toggleFormat } from '@renderer/editor/formatting'
import { highlightExtension } from '@renderer/editor/highlight'
import { imageWidgetExtension } from '@renderer/editor/imageWidget'
import { languageExtension } from '@renderer/editor/language'
import { lineFoldExtension } from '@renderer/editor/lineFold'
import { EditorView } from 'codemirror'

/**
 * Same as codemirror's basicSetup but WITHOUT foldGutter and foldKeymap.
 * We use our own line-collapse mechanism instead.
 */
const editorSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
]

const defaultDark = BUILTIN_THEMES.find((t) => t.id === 'default-dark')!
const defaultLight = BUILTIN_THEMES.find((t) => t.id === 'default-light')!

export const themeCompartment = new Compartment()

export function getEditorTheme(resolved: 'dark' | 'light', colorTheme?: ColorTheme) {
  if (colorTheme) return buildEditorTheme(colorTheme)
  return resolved === 'dark' ? buildEditorTheme(defaultDark) : buildEditorTheme(defaultLight)
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
      editorSetup,
      EditorView.lineWrapping,
      themeCompartment.of(getEditorTheme(resolved)),
      languageExtension(opts.path),
      attachmentExtension(),
      imageWidgetExtension(),
      checkboxWidgetExtension(),
      lineFoldExtension(),
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
