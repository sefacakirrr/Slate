# Phase 03: Near-Live Multi-Window Sync

> **Status**: COMPLETE (reviewed 2026-07-01; visual confirmation in P04 UAT)
> **Dependencies**: Phase 02
> **Added**: 2026-07-01 (user request — expand E11 with content sync)

---

## Goal

A note saved in one window shows up in any other window displaying it, when that other window isn't dirty; stickies autosave (debounced) so typing propagates without a manual save. Both directions (sticky ↔ main). No per-keystroke streaming — reload happens on save / after the autosave debounce.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 3.1 | Add a `vault:noteChanged` event carrying the changed path; `WindowManager.broadcastNoteChanged(path)` sends it to all windows. Fire it from the content-writing handlers (`writeNote`, `lockNote`, `unlockNote`, `capture:save`) alongside the existing `filesChanged` | done | Saving note X sends `vault:noteChanged` with X's path to every window |
| 3.2 | Preload: expose `window.api.window.onNoteChanged(cb: (path) => void)` (listener + unsubscribe), mirroring `onFilesChanged` | done | Renderer windows can subscribe to per-note change events |
| 3.3 | `stickyStore`: debounced autosave (~800ms) on `setDraft` — typing persists without Cmd/Ctrl+S. Cancel the pending timer on manual save / unmount | done | Typing in a sticky writes to disk ~0.8s after the last keystroke; no save storm |
| 3.4 | `stickyStore.reloadFromDisk()` + `StickyNote` subscription: on `noteChanged(path===mine)` **and not dirty**, re-read the file and replace the editor doc (preserve as much cursor/scroll as reasonable). If dirty, skip (keep the user's edits) | done | Editing+saving the note in the main window updates the sticky's text when the sticky has no unsaved edits; a dirty sticky is left alone |
| 3.5 | Main window reload-on-external-change: `workspaceStore.reloadTab(path)` (re-read, update baseline+draft if not dirty) + `EditorHost` applies the new doc to the live view / cached `EditorState`; wired to `onNoteChanged` | done | Saving the note in a sticky updates the main window's open tab when that tab isn't dirty; a dirty tab is left alone |
| 3.6 | Self-change no-op: a window reloading from its own save is harmless (content equals draft) — verify no cursor jump / dirty flip on the window that just saved | done | Saving in a window doesn't disrupt that same window's editor |
| 3.7 | Tests: `stickyStore` reload updates baseline/draft when clean and skips when dirty; autosave debounce fires once after rapid edits (fake timers) | done | `npm run test` green with the new store tests |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/windows/WindowManager.ts` | Modify | `broadcastNoteChanged(path)` |
| `src/main/ipc/handlers.ts` | Modify | fire `noteChanged` from write/lock/unlock/capture |
| `src/shared/ipc.ts` | Modify | `onNoteChanged` in the `Api.window` type |
| `src/preload/index.ts` | Modify | `onNoteChanged` listener |
| `src/renderer/stores/stickyStore.ts` | Modify | debounced autosave + `reloadFromDisk` |
| `src/renderer/components/StickyNote.tsx` | Modify | subscribe + push reloaded doc into the view |
| `src/renderer/stores/workspaceStore.ts` | Modify | `reloadTab(path)` (reload-if-not-dirty) |
| `src/renderer/editor/EditorHost.tsx` | Modify | apply an external doc reload to the live/cached editor state |
| `src/renderer/stores/stickyStore.test.ts` | Create | reload + autosave-debounce tests |

*(9 files — at the limit; the main-window editor reload, 3.5, is the trickiest and may warrant care.)*

---

## Verification

- `npm run test` green (new store tests); `npm run typecheck` + `npm run build` clean.
- Manual (`npm run dev`):
  - Pin note A; edit A in the sticky → main window's A tab updates (when not dirty) within ~1s.
  - Edit A in the main window + Ctrl+S → the sticky updates.
  - Make BOTH dirty, save one → the other is NOT clobbered (keeps its edits).
  - Saving in a window doesn't jump its own cursor.

---

## Notes

- **Dirty is the guard.** Never reload a window that has unsaved edits — that's the only rule keeping this from silently destroying work. Everything else is best-effort convenience.
- Reloading a CM6 doc: dispatch a transaction replacing the whole doc (`changes: { from: 0, to: state.doc.length, insert: text }`); try to keep selection in-bounds. A perfect cursor-preserving merge is out of scope — good-enough is fine.
- Main-window autosave stays OUT (deliberate) — only stickies autosave; main→sticky propagates on the main's manual save.
- `vault:noteChanged` is separate from `vault:filesChanged` (list vs content); keep both.
- Renderer editor reload can't be unit-tested (no CM/DOM harness here) — cover the store logic; verify the editor visuals in UAT.

---

## Review Log

### 2026-07-01 — Phase Review: APPROVED

**Tasks**: 7/7 genuinely complete — traced end to end: `vault:noteChanged{path}` broadcast from both `writeNote` branches; `onNoteChanged` in preload + `Api`; sticky debounced autosave (~800ms, cancel on save); `reloadFromDisk`/`reloadTab` reload-if-not-dirty; StickyNote + EditorHost apply the reloaded doc to the live view or cached `EditorState`.
**Quality**: PASS — full suite 223/223 (+5 sticky-store tests: autosave debounce w/ fake timers, reload-if-clean, dirty-guard skip, self-save no-op); typecheck (node+web) clean; `npm run build` clean; the 9 changed files biome-clean (the 4 infos are pre-existing handlers `useTemplate` baseline).
**Integration**: broadcast → every window; EditorHost (main) + StickyNote (sticky) both subscribe and apply; `reloadTab`/`reloadFromDisk` reached from the event handlers. Early-returns mean a window without the note open does no disk read.
**Plan integrity**: OK — only P04 (UAT) remains; scenarios updated with the 3 sync checks. No gaps.
**Commit**: none (user directive: skip commits this session)

**Adversarial audit — verified the risky interactions (no defect found)**:
- **Self-save causes no cursor jump**: after a window saves, its own `noteChanged` triggers reload, but disk === baseline/draft → `reloadTab`/`reloadFromDisk` return null → no dispatch. (Covered by the "own save / no change" test.)
- **Dirty guard holds**: a window with unsaved edits is never reloaded (returns null); background (non-active) dirty tabs are preserved too.
- **Non-active tab**: reload updates the cached `EditorState` (not just the live view), so the next tab switch shows fresh content.
- **No wasteful I/O**: `reloadTab` returns before `readNote` when the note isn't open; StickyNote filters on `changedPath === notePath`.

**Findings (non-blocking, minor)**:
- After an external reload, the sticky's programmatic doc-dispatch runs through `onDocChange → setDraft`, which schedules one idle autosave timer that no-ops (not dirty). Harmless; not worth distinguishing programmatic vs user edits.
- Reloading the *active* tab/sticky while the user is only viewing it can shift selection/scroll slightly (full-doc replace). Inherent to live-reload; acceptable.
- Main-window autosave intentionally NOT added — main stays manual-save; main→sticky propagates on the main's Ctrl+S (documented decision).
