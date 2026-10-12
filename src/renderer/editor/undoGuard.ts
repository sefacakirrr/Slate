import { redo, undo } from '@codemirror/commands'
import { Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

/**
 * Makes CodeMirror the sole owner of undo/redo.
 *
 * `historyKeymap`'s `undo` returns false when CM's history is empty (a fresh
 * tab, or after undoing everything). The keydown then falls through to
 * Chromium's native contenteditable undo — whose stack still holds DOM edits
 * from typing, possibly in *another* tab's document since all tabs share one
 * view via `view.setState`. Replaying those on CM's DOM corrupts it and hidden
 * formatting markers come back as raw text. So: always claim the keys, and
 * cancel any `historyUndo`/`historyRedo` beforeinput (menu/OS-triggered).
 */
export function undoGuardExtension() {
  const runUndo = (view: EditorView) => {
    undo(view)
    return true
  }
  const runRedo = (view: EditorView) => {
    redo(view)
    return true
  }
  return [
    Prec.highest(
      keymap.of([
        { key: 'Mod-z', run: runUndo, preventDefault: true },
        { key: 'Mod-y', run: runRedo, preventDefault: true },
        { key: 'Mod-Shift-z', run: runRedo, preventDefault: true },
      ]),
    ),
    Prec.highest(
      EditorView.domEventHandlers({
        beforeinput(event, view) {
          if (event.inputType === 'historyUndo') {
            event.preventDefault()
            undo(view)
            return true
          }
          if (event.inputType === 'historyRedo') {
            event.preventDefault()
            redo(view)
            return true
          }
          return false
        },
      }),
    ),
  ]
}
