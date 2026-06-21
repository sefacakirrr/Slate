# Phase 03: Vault Write

> **Status**: COMPLETE
> **Dependencies**: Phase 02

---

## Goal

Add write/create/delete operations to `VaultService` with atomic write-temp-rename semantics. Wire the three remaining IPC handlers. Add "New Note" and "Delete" UI affordances in the sidebar with a confirm dialog for deletion.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|---|---|---|
| 03.1 | Implement `VaultService.writeNote(relPath, content)` — path safety; write to `<resolved>.tmp-<random>`; `fsync` the temp file; `fs.promises.rename` to the final path | done | Writing a note creates the canonical file; an interrupted write (test by throwing between temp write and rename) leaves the original intact |
| 03.2 | Implement `VaultService.createNote(relPath)` — path safety; rejects if file already exists; creates an empty `.md` file via the same atomic flow | done | First call creates the file; second call with the same path returns an error |
| 03.3 | Implement `VaultService.deleteNote(relPath)` — path safety; `fs.promises.unlink`; tolerates "file already gone" (returns success) | done | Deleting an existing file removes it; deleting a missing file returns success without throwing |
| 03.4 | Wire `vault:writeNote`, `vault:createNote`, `vault:deleteNote` handlers — same lazy-service pattern as Phase 02 | done | All three commands callable from DevTools; returned `IpcResult<void>` reflects success/failure |
| 03.5 | Extend `vaultStore` with actions `createNote(name?)` (defaults to `untitled-<timestamp>.md`), `deleteNote(path)`; both optimistically update `fileList`, then call IPC, then revert on failure | done | UI updates feel instant; failure logs to console and reverts the list |
| 03.6 | Create `src/renderer/components/ConfirmDialog.tsx` — generic confirm modal accepting `{ open, title, message, onConfirm, onCancel }`; Tailwind styled; Escape cancels, Enter confirms | done | Dialog renders; keyboard works; focus trap not required for v1 (acceptable rough edge) |
| 03.7 | Add a "+ New Note" button at the top of `Sidebar.tsx` — calls `vaultStore.createNote()` then `selectFile(newPath)` so the empty file is immediately selected | done | Clicking the button creates a new file with a unique name; file appears in tree and is selected; content pane shows empty content |
| 03.8 | Add a delete affordance per tree item — a trash icon (Lucide `Trash2`) shown on hover; clicking opens `ConfirmDialog`; confirm calls `vaultStore.deleteNote(path)` | done | Hover reveals icon; click opens dialog; confirm deletes file from tree and disk; cancel closes dialog with no effect |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/main/services/VaultService.ts` | Modify | Add write/create/delete methods with atomic semantics |
| `src/main/ipc/handlers.ts` | Modify | Wire 3 write handlers |
| `src/renderer/stores/vaultStore.ts` | Modify | Add createNote, deleteNote actions with optimistic update + revert |
| `src/renderer/components/Sidebar.tsx` | Modify | + New Note button; per-item hover trash icon |
| `src/renderer/components/ConfirmDialog.tsx` | Create | Reusable confirm modal |

---

## Verification

Consult `.claude/CLAUDE.md` for the standard commands.

Phase-specific manual checks:
- Click "+ New Note" → file appears named `untitled-<timestamp>.md` and is selected → confirm on disk that the file exists and is empty
- Click "+ New Note" rapidly 3 times → 3 distinct files created (timestamps differ)
- Hover a file → trash icon appears → click → ConfirmDialog opens → confirm → file is gone from tree AND from disk
- Click trash → ConfirmDialog opens → press Escape → dialog closes, file remains
- Pre-create a `untitled-foo.md`; manually call `api.vault.createNote('untitled-foo.md')` from DevTools → `{ ok: false, error: 'file-exists' }` (or similar)
- Crash test for atomic write: temporarily add `throw new Error('test')` between temp write and rename in `writeNote`; call the IPC; observe the temp file may exist but the canonical file is untouched. Remove the throw.

---

## Notes

- **`fsync` cost on Windows is small but not zero.** Worth doing for write — settings file already uses the same pattern.
- **`.tmp-<random>` cleanup**: not in scope. Stray temp files from interrupted writes are acceptable for v1. A sweep can come in a later epic.
- **No rename / move operations** in this phase — pushed to a later epic.
- **Optimistic UI update**: keep the implementation simple — update the store immediately, fire IPC, revert + log on error. No animation, no transition states beyond a simple boolean.
- **The "+ New Note" name**: `untitled-${Date.now()}.md` is fine. Inline rename or prompting for a name is a Phase 03+ luxury we're explicitly skipping.

---

## Review Log

### 2026-06-12 — Phase Review: APPROVED (informal, uncommitted)

**Tasks**: 8/8 genuinely complete, 0 stubs, 0 partial
**Quality**: PASS — `npm run typecheck`, `npm run check`, `npm run build` all green
**Integration**: connected — all three `vault:*` write channels delegate to the path-keyed cached `VaultService`; `vaultStore` create/delete are optimistic with revert; `Sidebar` wires "+ New Note" and per-item trash → `ConfirmDialog`
**Plan integrity**: OK — full read+write IPC surface now live; `notImplemented` stub fully removed
**Commit**: none (user directive)

**Findings**:
- `writeNote` is atomic: temp file → `writeFile` → `handle.sync()` (fsync) → `close` → `rename`. Parent dir `mkdir({recursive})` first for robustness.
- **Deliberate divergence on `createNote`**: phase note said "same atomic temp-rename flow", but temp-rename would *overwrite* an existing file and defeat the reject-if-exists rule, and a check-then-create has a TOCTOU race. Used exclusive-create `open(abs, 'wx')` instead — single atomic syscall that both creates and rejects (`EEXIST` → `file-exists`). Documented in the code. This is the correct primitive for empty-file creation; the note's wording was slightly off for this case.
- `deleteNote` treats `ENOENT` as success (double-delete / externally-removed file tolerated).
- Store actions log failures via `console.error` (not `console.log`) on the revert path — legitimate error reporting, not debug noise, kept pending a real toast system.
- `ConfirmDialog` backdrop is a `<button>` (not a div+onClick) to satisfy Biome a11y rules and get keyboard/focus for free; Escape/Enter wired at window level.

**User-facing verification (not yet run by user — non-blocking)**:
- "+ New Note" → `untitled-<ts>.md` created + selected + empty on disk
- Hover → trash → confirm → gone from tree and disk; Escape → remains
- `createNote` on an existing path → `file-exists`
