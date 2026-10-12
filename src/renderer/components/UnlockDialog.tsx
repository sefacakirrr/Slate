import { api } from '@renderer/api'
import { useT } from '@renderer/i18n'
import { useEncryptionStore } from '@renderer/stores/encryptionStore'
import { useEffect, useRef, useState } from 'react'

/**
 * Vault password modal, driven by `encryptionStore.prompt`. Two modes:
 * - `unlock`: enter the existing password; a wrong password shows the hint.
 * - `set`: first-time password with optional hint, gated behind a no-recovery ack.
 */
export function UnlockDialog() {
  const prompt = useEncryptionStore((s) => s.prompt)
  const promptError = useEncryptionStore((s) => s.promptError)
  const busy = useEncryptionStore((s) => s.busy)
  const submitPassword = useEncryptionStore((s) => s.submitPassword)
  const cancelPrompt = useEncryptionStore((s) => s.cancelPrompt)
  const t = useT()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [hint, setHint] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [showHint, setShowHint] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isSet = prompt?.mode === 'set'

  useEffect(() => {
    if (prompt) {
      setPassword('')
      setConfirm('')
      setHint('')
      setAcknowledged(false)
      setShowHint(null)
      inputRef.current?.focus()
    }
  }, [prompt])

  // When there's an error in unlock mode, fetch and show the hint
  useEffect(() => {
    if (promptError && !isSet) {
      void api.vault.getPasswordHint().then((result) => {
        if (result.ok && result.data) setShowHint(result.data)
      })
    }
  }, [promptError, isSet])

  if (prompt === null) return null

  const mismatch = isSet && confirm.length > 0 && password !== confirm
  const canSubmit =
    !busy && password.length > 0 && (!isSet || (acknowledged && password === confirm))

  const submit = () => {
    if (!canSubmit) return
    if (isSet) {
      void submitPassword(password, hint || undefined)
    } else {
      void submitPassword(password)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label={t('app.unlock.cancel')}
        onClick={cancelPrompt}
        className="absolute inset-0 size-full cursor-default bg-slate-950/70 backdrop-blur-sm"
      />
      <div
        className="relative mx-4 w-full max-w-sm rounded-xl border border-slate-700/80 bg-slate-800 p-5 shadow-2xl shadow-black/50"
        role="dialog"
        aria-modal="true"
        aria-label={isSet ? t('app.unlock.ariaSet') : t('app.unlock.ariaUnlock')}
      >
        <h2 className="text-base font-medium text-slate-100">
          {isSet ? t('app.unlock.headingSet') : t('app.unlock.headingUnlock')}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          {isSet ? t('app.unlock.introSet') : t('app.unlock.introUnlock')}
        </p>

        {isSet && (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
            <strong className="font-semibold">{t('app.unlock.noRecoveryStrong')}</strong>{' '}
            {t('app.unlock.noRecoveryBody')}
          </div>
        )}

        <input
          ref={inputRef}
          type="password"
          value={password}
          placeholder={t('app.unlock.passwordPlaceholder')}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              cancelPrompt()
            }
          }}
          className="mt-3 w-full rounded bg-slate-900 px-3 py-2 text-sm text-slate-100 outline outline-1 outline-slate-600 placeholder:text-slate-500 focus:outline-accent-500"
        />

        {isSet && (
          <>
            <input
              type="password"
              value={confirm}
              placeholder={t('app.unlock.confirmPlaceholder')}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                } else if (e.key === 'Escape') {
                  cancelPrompt()
                }
              }}
              className="mt-2 w-full rounded bg-slate-900 px-3 py-2 text-sm text-slate-100 outline outline-1 outline-slate-600 placeholder:text-slate-500 focus:outline-accent-500"
            />
            <input
              type="text"
              value={hint}
              placeholder={t('app.unlock.hintPlaceholder')}
              onChange={(e) => setHint(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelPrompt()
              }}
              className="mt-2 w-full rounded bg-slate-900 px-3 py-2 text-sm text-slate-100 outline outline-1 outline-slate-600 placeholder:text-slate-500 focus:outline-accent-500"
            />
          </>
        )}

        {mismatch && <p className="mt-2 text-xs text-red-400">{t('app.unlock.mismatch')}</p>}
        {promptError !== null && <p className="mt-2 text-xs text-red-400">{promptError}</p>}

        {showHint && !isSet && (
          <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-300">
            <strong className="font-semibold">{t('app.unlock.hintLabel')}</strong> {showHint}
          </div>
        )}

        {isSet && (
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            <span>{t('app.unlock.acknowledge')}</span>
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelPrompt}
            className="rounded px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700"
          >
            {t('app.unlock.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500 disabled:opacity-50"
          >
            {busy
              ? t('app.unlock.working')
              : isSet
                ? t('app.unlock.setPassword')
                : t('app.unlock.unlock')}
          </button>
        </div>
      </div>
    </div>
  )
}
