# Phase 03: UI — Lock/Unlock Surface

> **Status**: COMPLETE (reviewed 2026-07-01; visual confirmation in P04 UAT)
> **Dependencies**: Phase 02
> **Design status**: informal — no DESIGN-HANDOVER.md; follow existing `ConfirmDialog` / `SettingsPanel` / `Sidebar` patterns.

---

## Goal

The user can, from the UI: set a vault password (with an unmistakable no-recovery warning), lock a note, unlock the vault to open a locked note, and lock the vault on demand — with a clear locked indicator in the sidebar/list.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 3.1 | Unlock modal (password input, masked) in the `ConfirmDialog` style — Enter submits, Esc cancels, wrong password shows an inline retry error | done | Entering the right password unlocks and proceeds; wrong password stays open with an error, no crash |
| 3.2 | Sidebar: show a lock indicator on `.md.enc` rows; add a row action "Lock" (on a plaintext note) and "Unlock note" (opens the unlock modal if the vault is locked) | done | Locked notes visually distinct; actions present and wired to `lockNote` / vault `unlock` |
| 3.3 | NotesList: locked rows render 🔒 + filename title + "[Locked]" snippet (no content) | done | Locked note shows the locked affordance, never plaintext |
| 3.4 | SettingsPanel "Vault Password" section: "Set vault password" (when none), status when set, and "Lock vault now" button | done | Set flow persists salt+verifier; "Lock now" clears the session (locked notes re-prompt) |
| 3.5 | First-lock / set-password warning: an unmistakable confirmation that there is **no password recovery** — content is unrecoverable if forgotten — required before the password is set | done | Password can't be set without acknowledging the no-recovery warning |
| 3.6 | workspaceStore: opening a locked note while the vault is locked triggers the unlock modal; on success the tab opens. Tab restore skips locked notes gracefully (handle `note-locked`) | done | Clicking a locked note prompts unlock; a locked note open at quit doesn't error on relaunch |
| 3.7 | Lock action flow: locking a note when no vault password exists yet routes through set-password (3.5) first, then `lockNote` | done | First-ever lock walks the user through setting the password with the warning, then locks |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/components/UnlockDialog.tsx` | Create | Password-entry modal (ConfirmDialog-derived) |
| `src/renderer/components/Sidebar.tsx` | Modify | Lock indicator + lock/unlock row actions |
| `src/renderer/components/NotesList.tsx` | Modify | Locked-row rendering (🔒, filename title, "[Locked]") |
| `src/renderer/components/SettingsPanel.tsx` | Modify | "Vault Password" section + "Lock vault now" |
| `src/renderer/stores/workspaceStore.ts` | Modify | Unlock-on-open flow; graceful locked-tab restore |
| `src/renderer/stores/vaultStore.ts` | Modify | Track/refresh locked state for rows |

---

## Verification

- `npm run typecheck` / `npm run check` clean; `npm run test` still green.
- Visual (via `/run` or `npm run dev`):
  - Locked note shows a clear lock indicator; no plaintext title/snippet leaks.
  - Set-password flow blocks until the no-recovery warning is acknowledged; input is masked.
  - Unlock modal opens on clicking a locked note; wrong password shows a retry error; right password opens it.
  - "Lock vault now" re-locks; a previously-open locked note then re-prompts.
- Accessibility: modal is keyboard-operable (Enter/Esc), focus lands on the password field.

---

## Notes

- Reuse `ConfirmDialog` styling for `UnlockDialog` to stay consistent (slate-800, accent-600 primary).
- The no-recovery warning is the single most important piece of copy in the epic — make it blunt, not reassuring.
- Unlock is **vault-level**: once unlocked, all locked notes open in-session until "Lock vault now" or quit. There is no per-note password prompt.
- Quick-capture stays plaintext (out of scope) — no encryption UI in the capture window.

---

## Review Log

### 2026-07-01 — Phase Review: APPROVED

**Tasks**: 7/7 genuinely complete — verified against real code (encryptionStore, UnlockDialog, Sidebar, NotesList, SettingsPanel, App wiring).
**Quality**: PASS — full suite 213/213; typecheck (node+web) clean; new/changed files biome-clean. Sidebar's remaining lint findings are the pre-existing baseline (useTemplate 197, noNonNullAssertion 595, a11y draggable divs) — same issues as before this epic, only line numbers shifted by added code; zero new findings from this phase.
**Integration**: `encryptionStore` wired into App (init + `<UnlockDialog/>`), Sidebar rows (lock/unlock/open), NotesList (locked open), SettingsPanel (set/lock/unlock). All backend IPC from P01/P02 now has a UI caller.
**Plan integrity**: OK — every VISION integration path has UI; P04 UAT covers all 8 success criteria + cross-platform. No coverage gaps, no invalidated assumptions.
**Commit**: none (user directive: skip commits this session)

**Finding (adversarial audit — REAL silent data loss, fixed inline)**:
- **Locking/unlocking a note with unsaved edits dropped the draft.** `lockNote`/`unlockNote` encrypt/decrypt the *on-disk* content, but an open dirty tab's edits live in the draft, not on disk — so locking a dirty note encrypted the stale disk version and lost the unsaved edits. Fixed: `encryptionStore.lockNote`/`unlockNote` now `await saveTab(path)` before the operation (no-op if the tab isn't open/dirty), so disk is current before encrypt/decrypt.

**Carried-forward items from P02 — both resolved this phase**:
- renameNote `.enc` rejection → fixed at the backend guard (`isNoteFile`), so locked-note move/rename works; rename button also hidden on locked rows.
- Tab path churn on lock/unlock → `encryptionStore` re-points the open tab via `renameTab` and refreshes the list.

**Notes (not blocking)**:
- **Cross-machine `.md.enc` without settings**: if a locked file is present but `settings.encryption` is absent (e.g. a vault copied without settings.json — off the no-sync happy path), opening it surfaces a cryptic `no-password` error rather than a friendly message. Acceptable edge; degrades to an error, no crash.
- UI has no automated tests (consistent with the project's renderer testing approach); behavior verified by typecheck + the store/handler/service tests underneath. Visual confirmation is P04 UAT.
