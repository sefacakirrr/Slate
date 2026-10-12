import { useT } from '@renderer/i18n'
import { useEffect, useRef, useState } from 'react'

const api = window.api
const mod = api.platform === 'darwin' ? '⌘' : 'Ctrl'

/**
 * Unsaved capture text survives every way the window closes without saving (Esc,
 * Cancel, clicking another window): it is mirrored here on each keystroke and
 * restored on the next capture. Cleared once a save succeeds or the text is
 * emptied. Main closes the window on blur, so this must be written eagerly.
 */
const DRAFT_KEY = 'slate:captureDraft'

function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeDraft(text: string): void {
  try {
    if (text.trim() === '') localStorage.removeItem(DRAFT_KEY)
    else localStorage.setItem(DRAFT_KEY, text)
  } catch {
    // Storage unavailable: the draft just isn't kept.
  }
}

export function QuickCapture() {
  const [initialDraft] = useState(readDraft)
  const [content, setContent] = useState(initialDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const t = useT()

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  function handleChange(text: string) {
    setContent(text)
    writeDraft(text)
  }

  async function handleSave() {
    const trimmed = content.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    // Main closes this window as soon as the note is written, so clear the
    // draft first and put it back if the save fails.
    writeDraft('')
    const result = await api.capture.save({ content: trimmed })
    if (!result.ok) {
      writeDraft(content)
      setSaving(false)
      setError(result.error)
    }
  }

  function handleClose() {
    api.capture.close()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <div
      role="dialog"
      className="flex h-screen flex-col bg-slate-950 p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">
          {t('capture.quick.heading')}
          {initialDraft !== '' && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              {t('capture.quick.draftRestored')}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={handleClose}
          title={t('capture.quick.close')}
          className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M1 1l12 12M13 1L1 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t('capture.quick.placeholder', { mod })}
        className="flex-1 resize-none rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-accent-500"
      />

      <div className="mt-3 flex items-center justify-end gap-2">
        {error !== null && (
          <p role="alert" className="mr-auto truncate text-xs text-red-400">
            {t('capture.quick.saveFailed', { error })}
          </p>
        )}
        <button
          type="button"
          onClick={handleClose}
          className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          {t('capture.quick.cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!content.trim() || saving}
          className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? t('capture.quick.saving') : t('capture.quick.save')}
        </button>
      </div>
    </div>
  )
}
