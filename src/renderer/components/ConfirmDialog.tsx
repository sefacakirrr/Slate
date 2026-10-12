import { useT } from '@renderer/i18n'
import { useEffect, useRef } from 'react'

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
  /**
   * Which button takes focus (and so answers Enter) on open. Use `cancel` when
   * confirming loses data (e.g. quitting with unsaved changes).
   */
  initialFocus?: 'confirm' | 'cancel'
  discardLabel?: string
}

/**
 * Minimal modal. The confirm button takes focus on open, so Enter confirms;
 * Tab moves to the other buttons and Enter then activates *that* button (Enter
 * is not a window-level shortcut — it would fire Confirm whatever is focused,
 * and keystrokes would still reach the editor behind the modal). Escape
 * cancels; the backdrop click also cancels. Focus returns to where it was on
 * close. No focus trap for v1. Supports an optional third "discard" action.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmTone = 'danger',
  onConfirm,
  onCancel,
  onDiscard,
  discardLabel,
  initialFocus = 'confirm',
}: ConfirmDialogProps) {
  const t = useT()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ;(initialFocus === 'cancel' ? cancelRef : confirmRef).current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [open, initialFocus])

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

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
        aria-label={t('app.confirmDialog.cancel')}
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
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700"
          >
            {t('app.confirmDialog.cancel')}
          </button>
          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              className="rounded px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700"
            >
              {discardLabel ?? t('app.confirmDialog.discard')}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`rounded px-3 py-1.5 text-sm transition ${confirmClass}`}
          >
            {confirmLabel ?? t('app.confirmDialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
