import { useEffect } from 'react'

type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  /** Visual tone of the confirm button. `danger` (default) = red; `primary` = slate. */
  confirmTone?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
  /**
   * Optional third action between Cancel and Confirm (e.g. "Discard"). When
   * provided, the dialog becomes a three-way choice; otherwise it stays a
   * simple confirm/cancel modal.
   */
  onDiscard?: () => void
  discardLabel?: string
}

/**
 * Minimal modal. Escape cancels, Enter confirms. No focus trap for v1
 * (acceptable rough edge) — the backdrop click also cancels. Supports an
 * optional third "discard" action for save/discard/cancel flows.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  confirmTone = 'danger',
  onConfirm,
  onCancel,
  onDiscard,
  discardLabel = 'Discard',
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onConfirm, onCancel])

  if (!open) return null

  const confirmClass =
    confirmTone === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-500'
      : 'bg-accent-600 text-white shadow-sm shadow-accent-500/30 hover:bg-accent-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Click-to-dismiss backdrop. A button (not a div) so keyboard + a11y
          come for free; Escape is also wired at the window level above. */}
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 size-full cursor-default bg-slate-950/70 backdrop-blur-sm"
      />
      <div
        className="relative mx-4 w-full max-w-sm rounded-xl border border-slate-700/80 bg-slate-800 p-5 shadow-2xl shadow-black/50"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="text-base font-medium text-slate-100">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700"
          >
            Cancel
          </button>
          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              className="rounded px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700"
            >
              {discardLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded px-3 py-1.5 text-sm transition ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
