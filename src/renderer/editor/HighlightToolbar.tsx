import {
  applyTextColor,
  getLineAlignment,
  removeAllFormatting,
  removeTextColor,
  setAlignment,
  TEXT_COLORS,
  type TextColor,
  toggleChecklist,
  toggleFormat,
} from '@renderer/editor/formatting'
import type { Alignment } from '@renderer/editor/highlight'
import {
  applyHighlight,
  HIGHLIGHT_COLORS,
  type HighlightColor,
  removeHighlight,
} from '@renderer/editor/highlight'
import type { EditorView } from 'codemirror'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Eraser,
  Italic,
  ListChecks,
  Palette,
  Strikethrough,
  Type,
  Underline,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const mod = window.api.platform === 'darwin' ? '⌘' : 'Ctrl'

const BG_SWATCHES: Record<HighlightColor, string> = {
  yellow: '#facc15',
  orange: '#fb923c',
  red: '#f87171',
  pink: '#f472b6',
  purple: '#c084fc',
  blue: '#60a5fa',
  teal: '#2dd4bf',
  green: '#4ade80',
  gray: '#94a3b8',
}

const TEXT_SWATCHES: Record<TextColor, string> = {
  red: '#f87171',
  orange: '#fb923c',
  yellow: '#fbbf24',
  green: '#4ade80',
  teal: '#2dd4bf',
  blue: '#60a5fa',
  purple: '#c084fc',
  pink: '#f472b6',
  gray: '#94a3b8',
  white: '#f1f5f9',
}

type SubMenu = 'none' | 'bg' | 'text'

export function HighlightToolbar({ view }: { view: EditorView | null }) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [subMenu, setSubMenu] = useState<SubMenu>('none')
  const [currentAlign, setCurrentAlign] = useState<Alignment>('left')
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!view) return

    const checkSelection = () => {
      const { from, to } = view.state.selection.main
      if (from === to) {
        setVisible(false)
        setSubMenu('none')
        return
      }

      const coords = view.coordsAtPos(from)
      if (!coords) {
        setVisible(false)
        return
      }

      const editorRect = view.dom.getBoundingClientRect()
      const toolbarHeight = 40
      const spaceAbove = coords.top - editorRect.top

      let top: number
      if (spaceAbove >= toolbarHeight + 8) {
        top = coords.top - editorRect.top - toolbarHeight - 4
      } else {
        const lineHeight = 20
        top = coords.bottom - editorRect.top + lineHeight + 4
      }

      setPosition({
        top,
        left: Math.max(0, Math.min(coords.left - editorRect.left, editorRect.width - 340)),
      })
      setCurrentAlign(getLineAlignment(view))
      setVisible(true)
    }

    const dom = view.dom
    dom.addEventListener('mouseup', checkSelection)
    dom.addEventListener('keyup', checkSelection)

    return () => {
      dom.removeEventListener('mouseup', checkSelection)
      dom.removeEventListener('keyup', checkSelection)
    }
  }, [view])

  if (!visible || !view) return null

  const btnClass =
    'rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-100 dark:hover:bg-slate-700 light:hover:bg-slate-200 light:text-slate-600 light:hover:text-slate-900 transition'
  const btnActive =
    'rounded p-1.5 bg-slate-700 text-slate-100 light:bg-slate-200 light:text-slate-900 transition'

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      className="absolute z-50 flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900 light:border-slate-200 light:bg-white"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Main toolbar row */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title={`Bold (${mod}+B)`}
          onClick={() => {
            toggleFormat(view, 'bold')
            setVisible(false)
          }}
          className={btnClass}
        >
          <Bold className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title={`Italic (${mod}+I)`}
          onClick={() => {
            toggleFormat(view, 'italic')
            setVisible(false)
          }}
          className={btnClass}
        >
          <Italic className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title={`Underline (${mod}+U)`}
          onClick={() => {
            toggleFormat(view, 'underline')
            setVisible(false)
          }}
          className={btnClass}
        >
          <Underline className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Strikethrough"
          onClick={() => {
            toggleFormat(view, 'strikethrough')
            setVisible(false)
          }}
          className={btnClass}
        >
          <Strikethrough className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Inline code"
          onClick={() => {
            toggleFormat(view, 'code')
            setVisible(false)
          }}
          className={btnClass}
        >
          <Code className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Toggle checklist"
          onClick={() => {
            toggleChecklist(view)
            setVisible(false)
          }}
          className={btnClass}
        >
          <ListChecks className="size-3.5" aria-hidden="true" />
        </button>

        <div className="mx-0.5 h-4 w-px bg-slate-700 dark:bg-slate-700 light:bg-slate-200" />

        {/* Alignment buttons */}
        <button
          type="button"
          title={`Align left (${mod}+Shift+L)`}
          onClick={() => {
            setAlignment(view, 'left')
            setCurrentAlign('left')
          }}
          className={currentAlign === 'left' ? btnActive : btnClass}
        >
          <AlignLeft className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title={`Align center (${mod}+Shift+E)`}
          onClick={() => {
            setAlignment(view, 'center')
            setCurrentAlign('center')
          }}
          className={currentAlign === 'center' ? btnActive : btnClass}
        >
          <AlignCenter className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title={`Align right (${mod}+Shift+R)`}
          onClick={() => {
            setAlignment(view, 'right')
            setCurrentAlign('right')
          }}
          className={currentAlign === 'right' ? btnActive : btnClass}
        >
          <AlignRight className="size-3.5" aria-hidden="true" />
        </button>

        <div className="mx-0.5 h-4 w-px bg-slate-700 dark:bg-slate-700 light:bg-slate-200" />

        <button
          type="button"
          title="Text color"
          onClick={() => setSubMenu(subMenu === 'text' ? 'none' : 'text')}
          className={`${btnClass} ${subMenu === 'text' ? 'bg-slate-700 text-slate-100 light:bg-slate-200 light:text-slate-900' : ''}`}
        >
          <Type className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Background color"
          onClick={() => setSubMenu(subMenu === 'bg' ? 'none' : 'bg')}
          className={`${btnClass} ${subMenu === 'bg' ? 'bg-slate-700 text-slate-100 light:bg-slate-200 light:text-slate-900' : ''}`}
        >
          <Palette className="size-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          title="Remove all formatting"
          onClick={() => {
            removeHighlight(view)
            removeTextColor(view)
            removeAllFormatting(view)
            setVisible(false)
          }}
          className={btnClass}
        >
          <Eraser className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Sub-menu: background colors */}
      {subMenu === 'bg' && (
        <div className="flex items-center gap-1 px-1">
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={`Background: ${color}`}
              onClick={() => {
                applyHighlight(view, color)
                setVisible(false)
                setSubMenu('none')
              }}
              className="size-5 rounded-full border border-slate-600 transition hover:scale-110 dark:border-slate-600 light:border-slate-300"
              style={{ backgroundColor: BG_SWATCHES[color] }}
            >
              <span className="sr-only">Background {color}</span>
            </button>
          ))}
        </div>
      )}

      {/* Sub-menu: text colors */}
      {subMenu === 'text' && (
        <div className="flex items-center gap-1 px-1">
          {TEXT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={`Text: ${color}`}
              onClick={() => {
                applyTextColor(view, color)
                setVisible(false)
                setSubMenu('none')
              }}
              className="size-5 rounded-full border border-slate-600 transition hover:scale-110 dark:border-slate-600 light:border-slate-300"
              style={{ backgroundColor: TEXT_SWATCHES[color] }}
            >
              <span className="sr-only">Text color {color}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
