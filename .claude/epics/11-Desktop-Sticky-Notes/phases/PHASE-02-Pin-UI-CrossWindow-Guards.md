# Phase 02: Pin UI + Cross-Window + Guards

> **Status**: COMPLETE (reviewed 2026-07-01; visual confirmation in P03 UAT)
> **Dependencies**: Phase 01
> **Design status**: informal — pin icon mirrors the E10 lock-icon pattern on sidebar rows.

---

## Goal

The user can pin a note from the main window; locked notes are excluded; all windows keep their file lists fresh; and a sticky closes gracefully when its note is deleted or becomes locked elsewhere.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 2.1 | Sidebar: add a pin action (icon) on plaintext note rows → `window.api.window.sticky.open(path)` (mirrors the E10 lock/unlock row-action pattern) | done | Hovering a note shows a pin button; clicking opens a sticky for that note |
| 2.2 | Exclude locked notes: no pin action on `.md.enc` rows, AND the `window:sticky:open` handler rejects a locked path (`isEncryptedPath`) as defense in depth | done | Locked rows have no pin button; calling open on a `.enc` path is a no-op/rejected |
| 2.3 | Broadcast `vault:filesChanged` to ALL windows (`BrowserWindow.getAllWindows()`), not just the main window — from the write/create/delete/rename/capture paths (add a `WindowManager.broadcastFilesChanged()` helper) | done | A note created/renamed in one window refreshes the sidebar list in every open window |
| 2.4 | `stickyStore`/`StickyNote`: on `vault:filesChanged`, verify the sticky's file still exists and is not locked; if it's gone or now `.md.enc`, close the sticky (`window.api.window.sticky.close(path)`) | done | Deleting a stuck note (or locking it) from the main window closes its sticky without a crash or save error |
| 2.5 | `restoreStickies()` guard (confirm from P00): a persisted sticky whose note no longer exists or is now locked is skipped on launch | done | Relaunch after deleting/locking a stuck note does not reopen a broken sticky |
| 2.6 | Optional pin-state affordance: opening a note that's already stuck focuses the existing sticky (handled in `WindowManager.openSticky`); the sidebar pin button stays a simple "open/focus" action (no live stuck-state indicator in v1) | done | Clicking pin on an already-stuck note focuses its window instead of duplicating |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/components/Sidebar.tsx` | Modify | pin action on note rows, excluded on locked |
| `src/main/ipc/handlers.ts` | Modify | reject locked in `window:sticky:open`; broadcast filesChanged to all windows |
| `src/main/windows/WindowManager.ts` | Modify | `broadcastFilesChanged()` helper; focus-if-open (confirm from P00) |
| `src/renderer/stores/stickyStore.ts` | Modify | filesChanged subscription → close on missing/locked |
| `src/renderer/components/StickyNote.tsx` | Modify | wire the filesChanged/close-on-invalid behavior |

---

## Verification

- `npm run typecheck` + `npm run build` clean; `npm run test` green.
- Manual (`npm run dev`):
  - Pin icon opens a sticky; locked note has no pin.
  - Create/rename a note in the main window → other windows' lists refresh.
  - Delete a stuck note → its sticky closes cleanly.
  - Lock a stuck note (E10) from the main window → its sticky closes cleanly.
  - Pinning an already-stuck note focuses the existing window.

---

## Notes

- Reuse the exact row-action pattern added in E10 (the lock/unlock buttons in `Sidebar.tsx` TreeRow) — a `Pin` icon (lucide `Pin`) next to them.
- Today `vault:filesChanged` is sent only to the main window (`handlers.ts` capture:save). Broadcasting to all windows is required for multi-window list freshness; keep it best-effort (skip destroyed windows).
- v1 does NOT live-reload an open note's editor content across windows (last-write-wins) — 2.4 only closes on delete/lock, it does not sync edits.
- A rename is observed by the sticky as "my file no longer exists" → it closes (v1 behavior; re-pin under the new name). Documented in VISION scope.

---

## Review Log

### 2026-07-01 — Phase Review: APPROVED

**Tasks**: 6/6 genuinely complete — verified against real code: Sidebar pin button (non-locked rows) → `sticky.open`; `window:sticky:open` rejects `.enc` (defense in depth) + UI hides it; `broadcastFilesChanged()` wired into all 10 mutation sites (writeNote×2, create/delete/deleteFolder/rename/renameFolder, lockNote, unlockNote, capture:save); `stickyStore.stillValid` + `StickyNote` filesChanged subscription close the sticky on delete/rename/lock; restore-skip-invalid and focus-if-open carried from P00.
**Quality**: PASS — full suite 218/218; typecheck (node+web) clean; `npm run build` clean; new files biome-clean; Sidebar has only its pre-existing 6 baseline findings (no new ones from the pin button).
**Integration**: pin action reaches `WindowManager.openSticky` end to end; broadcast reaches every window; sticky self-close reaches `WindowManager.closeSticky`. All new IPC has both a producer and consumer.
**Plan integrity**: OK — only P03 (UAT) remains; it covers all VISION success criteria. No coverage gaps, no invalidated assumptions.
**Commit**: none (user directive: skip commits this session)

**Findings (adversarial audit — accepted v1 limitations, not defects; already in VISION scope)**:
- **Renaming/locking a note from the main window closes its open sticky and drops that sticky's unsaved edits.** The programmatic close-on-invalid intentionally does NOT save first — the note's path no longer exists, so writing the sticky's stale draft to the old path would be wrong. Consistent with the accepted "rename = close; last-write-wins" scope. Documented.
- **Pinning a note that's dirty (unsaved) in the main window shows the on-disk (stale) content in the sticky.** Same last-write-wins limitation as opening a note in two places. Not data loss (the main window keeps its edits until it saves/discards). Accepted for v1.
- **`stillValid` walks the note list on every `vault:filesChanged`.** Minor overhead per sticky per vault change; negligible for a handful of stickies. Fine.

No blocking issues; the code is correct for the phase's stated (last-write-wins) scope.
