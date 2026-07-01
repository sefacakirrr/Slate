import { useEncryptionStore } from '@renderer/stores/encryptionStore'
import { useEffect, useRef, useState } from 'react'

/**
 * Vault password modal, driven by `encryptionStore.prompt`. Two modes:
 * - `unlock`: enter the existing password; a wrong password shows an inline retry.
 * - `set`: first-time password, gated behind an explicit no-recovery acknowledgment.
 *
 * The password never leaves the renderer as anything but an IPC argument to main,
 * which derives the key; it is not stored here beyond the input's lifetime.
 */
export function UnlockDialog() {
  const prompt = useEncryptionStore((s) => s.prompt)
  const promptError = useEncryptionStore((s) => s.promptError)
  const busy = useEncryptionStore((s) => s.busy)
  const submitPassword = useEncryptionStore((s) => s.submitPassword)
  const cancelPrompt = useEncryptionStore((s) => s.cancelPrompt)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isSet = prompt?.mode === 'set'

  // Reset transient input state whenever a prompt opens/closes.
  useEffect(() => {
    if (prompt) {
      setPassword('')
      setConfirm('')
      setAcknowledged(false)
      inputRef.current?.focus()
    }
  }, [prompt])

  if (prompt === null) return null

  const mismatch = isSet && confirm.length > 0 && password !== confirm
  const canSubmit =
    !busy && password.length > 0 && (!isSet || (acknowledged && password === confirm))

  const submit = () => {
    if (!canSubmit) return
    void submitPassword(password)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Cancel"
        onClick={cancelPrompt}
        className="absolute inset-0 size-full cursor-default bg-slate-950/70 backdrop-blur-sm"
      />
      <div
        className="relative mx-4 w-full max-w-sm rounded-xl border border-slate-700/80 bg-slate-800 p-5 shadow-2xl shadow-black/50"
        role="dialog"
        aria-modal="true"
        aria-label={isSet ? 'Set vault password' : 'Unlock vault'}
      >
        <h2 className="text-base font-medium text-slate-100">
          {isSet ? 'Set a vault password' : 'Unlock vault'}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          {isSet
            ? 'This password encrypts the notes you lock. It is never stored.'
            : 'Enter your vault password to open locked notes this session.'}
        </p>

        {isSet && (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
            <strong className="font-semibold">There is no recovery.</strong> If you forget this
            password, the notes you lock with it are gone for good — no reset, no backdoor.
          </div>
        )}

        <input
          ref={inputRef}
          type="password"
          value={password}
          placeholder="Vault password"
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
          <input
            type="password"
            value={confirm}
            placeholder="Confirm password"
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
        )}

        {mismatch && <p className="mt-2 text-xs text-red-400">Passwords don't match.</p>}
        {promptError !== null && <p className="mt-2 text-xs text-red-400">{promptError}</p>}

        {isSet && (
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            <span>I understand a forgotten password means my locked notes are unrecoverable.</span>
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelPrompt}
            className="rounded px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500 disabled:opacity-50"
          >
            {busy ? 'Working…' : isSet ? 'Set password' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  )
}
