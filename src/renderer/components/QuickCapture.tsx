import { useEffect, useRef, useState } from 'react'

const api = window.api
const mod = api.platform === 'darwin' ? '⌘' : 'Ctrl'

export function QuickCapture() {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  async function handleSave() {
    const trimmed = content.trim()
    if (!trimmed || saving) return
    setSaving(true)
    await api.capture.save({ content: trimmed })
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
        <span className="text-sm font-medium text-slate-300">Quick Capture</span>
        <button
          type="button"
          onClick={handleClose}
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
        onChange={(e) => setContent(e.target.value)}
        placeholder={`Type a quick note... (${mod}+S or ${mod}+Enter to save, Esc to close)`}
        className="flex-1 resize-none rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-accent-500"
      />

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!content.trim() || saving}
          className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
