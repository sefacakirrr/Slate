# Phase 02: Vault Read

> **Status**: COMPLETE
> **Dependencies**: Phase 01

---

## Goal

Implement the read side of `VaultService` (`listNotes`, `readNote`) with path safety. Render the sidebar file tree and a read-only content pane. Selecting a file in the sidebar displays its raw text.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|---|---|---|
| 02.1 | Implement `VaultService` class in `src/main/services/VaultService.ts` — constructor takes `vaultRoot: string`; method `listNotes()` recursively lists files, filtering to extensions `.md`/`.markdown`/`.txt` and excluding any path segment starting with `_` or `.`; returns relative paths sorted alphabetically | done | Listing a vault with mixed file types returns only allowed extensions; `_attachments/foo.md` and `.git/config` are absent |
| 02.2 | Implement `readNote(relPath)` — resolves to absolute path; path safety check; reads as UTF-8 | done | Reading an existing note returns its content; reading a non-existent path throws |
| 02.3 | Implement private `resolveSafe(relPath)` helper — uses `path.resolve(vaultRoot, p)` and asserts the result starts with `vaultRoot + path.sep`; throws `Error('path-outside-vault')` otherwise | done | Inputs like `../foo` or absolute paths outside the vault throw |
| 02.4 | Wire `vault:listNotes` and `vault:readNote` IPC handlers — instantiate `VaultService` lazily using the current `SettingsService.getVaultPath()`; cache instance keyed by vault path; rebuild on path change | done | Switching vault path via `settings:setVaultPath` causes subsequent `vault:listNotes` calls to scan the new root |
| 02.5 | Extend `vaultStore` with state `{ fileList: string[], selectedPath: string \| null, treeLoading: boolean }` and actions `loadFiles()`, `selectFile(path)` | done | Calling `loadFiles()` populates `fileList` via IPC; calling `selectFile(path)` updates `selectedPath` and triggers a read |
| 02.6 | Add `noteContent` state and `loadSelectedContent()` action — runs when `selectedPath` changes, calls `vault:readNote`, stores the resulting string (or error) | done | Selecting a file updates `noteContent` to the file's bytes; switching files updates content |
| 02.7 | Create `src/renderer/components/Sidebar.tsx` — recursive renderer of `fileList` grouped by folder; each leaf is a button that calls `selectFile(path)`; current selection highlighted; "Refresh" button at top calls `loadFiles()` | done | Tree displays folders and files; clicking a file highlights it and triggers content load |
| 02.8 | Create `src/renderer/components/ContentPane.tsx` — renders `noteContent` inside a monospace `<pre>` block; shows an empty placeholder when nothing is selected; shows an error banner when the read failed | done | Selecting a file shows raw text; switching files updates immediately; deleted file shows an error banner |
| 02.9 | Update `App.tsx` to replace the Phase 01 placeholder shell with a `react-resizable-panels` horizontal split: `<Sidebar />` on the left, `<ContentPane />` on the right. On vault load, call `vaultStore.loadFiles()` | done | App shows real sidebar + content pane when vault loaded; resizing the split works; EmptyState still appears when no vault path |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/main/services/VaultService.ts` | Create | Read-side vault operations + path safety |
| `src/main/ipc/handlers.ts` | Modify | Wire 2 read handlers, lazy service instantiation |
| `src/renderer/stores/vaultStore.ts` | Modify | Extend with fileList, selectedPath, noteContent |
| `src/renderer/components/Sidebar.tsx` | Create | Recursive file tree |
| `src/renderer/components/ContentPane.tsx` | Create | Read-only raw text display |
| `src/renderer/App.tsx` | Modify | Replace placeholder shell with sidebar + content pane |

---

## Verification

Consult `.claude/CLAUDE.md` for the standard commands.

Phase-specific manual checks:
- Create a test vault folder with: a few `.md` files at the root, a subfolder with more `.md` files, a `_attachments/` folder with files inside, a `.hidden` file, a `.git/` folder, a `.txt` file, a `.markdown` file, and a `.png` file
- Pick the vault → tree should show only the `.md`/`.markdown`/`.txt` files (including those in the subfolder), hiding everything in `_attachments/`, `.git/`, the `.hidden` file, and the `.png`
- Click each visible file → content appears in the pane
- Click "Refresh" after externally adding a new file → it appears in the tree (proves manual refresh works since there's no watcher yet)
- Open DevTools and call `await window.api.vault.readNote('../outside.md')` → returns `{ ok: false, error: 'path-outside-vault' }` (or similar)

---

## Notes

- **Recursive listing performance**: `fs.promises.readdir(p, { withFileTypes: true, recursive: true })` is available in modern Node; or write a simple recursive walker. Don't pull in `globby` or similar — overkill for the v1 surface.
- **Symlinks**: not a concern for v1. If a symlink resolves outside the vault, the path safety check catches it on read; for listing, the simplest correct behavior is to follow symlinks and let path safety fail at read time. Document this in code if non-obvious.
- **Sort order**: alphabetical, case-insensitive, folders mixed with files for now. Folder-first ordering is a polish concern for a later epic.
- **Tree rendering**: build a nested object from the flat path list inside the component or a helper; don't store the tree shape in Zustand — keep the store's data shape flat for easy invalidation.
- **`react-resizable-panels`**: already in dependencies. Default split 25/75 sidebar/content; minimum sidebar width ~180px.

---

## Review Log

### 2026-06-12 — Phase Review: APPROVED (informal, uncommitted)

**Tasks**: 9/9 genuinely complete, 0 stubs, 0 partial
**Quality**: PASS — `npm run typecheck`, `npm run check`, `npm run build` all green
**Integration**: connected — `vault:listNotes`/`vault:readNote` delegate to a path-keyed cached `VaultService`; `vaultStore` consumes via `@renderer/api`; `Sidebar` + `ContentPane` mounted in a `react-resizable-panels` split inside `App.tsx`
**Plan integrity**: OK — `vault:writeNote`/`createNote`/`deleteNote` left as `notImplemented` for Phase 03; no contract changes
**Commit**: none (user directive)

**Findings**:
- `VaultService` is pure Node, constructor takes the absolute root → unit-testable in Phase 04. `resolveSafe` is the single security boundary: asserts the resolved path equals the root or starts with `root + sep`, throws `path-outside-vault`.
- `listNotes` uses `readdir(root, { withFileTypes, recursive })`, filters allowed extensions and excludes any segment starting with `_` or `.`; returns forward-slash relative paths sorted case-insensitively.
- Handler caches one `VaultService` keyed by current vault path, rebuilds on change; throws `no-vault` if path is null.
- Store data kept flat; `Sidebar` builds the nested tree (folders-first sort) in a `useMemo`. `ContentPane` handles empty/selected/error states.

**User-facing verification (not yet run by user — non-blocking)**:
- Mixed-content vault → only `.md`/`.markdown`/`.txt` visible; `_attachments/`, `.git/`, dotfiles, `.png` hidden
- Click file → raw content in pane; Refresh picks up externally-added files
- `vault.readNote('../outside.md')` → `path-outside-vault`
