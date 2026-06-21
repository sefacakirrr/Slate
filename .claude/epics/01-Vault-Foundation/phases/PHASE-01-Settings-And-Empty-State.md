# Phase 01: Settings & Empty State

> **Status**: COMPLETE
> **Dependencies**: Phase 00

---

## Goal

Wire `SettingsService` so the chosen vault path persists to disk; render an empty-state "Choose vault folder" view when no vault is configured; integrate the native folder picker; transition to a "vault loaded" placeholder shell after a folder is selected.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|---|---|---|
| 01.1 | Implement `SettingsService` in `src/main/services/SettingsService.ts` — class owning a `settings.json` file under `app.getPath('userData')`, methods `getVaultPath()` and `setVaultPath(path)`, atomic JSON write (temp + rename), lazy load on first call | done | Service can be unit-tested standalone (constructor accepts an override path for tests); reads/writes round-trip |
| 01.2 | Wire `settings:getVaultPath` and `settings:setVaultPath` handlers in `ipc/handlers.ts` to delegate to `SettingsService` | done | Calling `api.settings.setVaultPath('C:/path')` from renderer DevTools followed by `api.settings.getVaultPath()` returns the same path |
| 01.3 | Wire `dialog:pickFolder` handler — calls Electron `dialog.showOpenDialog` with `{ properties: ['openDirectory'] }`; returns chosen path or `null` if cancelled | done | Calling `api.dialog.pickFolder()` from renderer opens native picker; selection returns the path; cancel returns null |
| 01.4 | Create `src/renderer/stores/vaultStore.ts` with state `{ vaultPath: string \| null, loading: boolean }` and actions `loadVaultPath()`, `pickAndSetVault()` | done | Store wired with Zustand; calling `pickAndSetVault()` opens picker, persists choice, updates store state |
| 01.5 | Create `src/renderer/components/EmptyState.tsx` — centered "No vault selected" message + "Choose Folder" button that calls `pickAndSetVault()` | done | Component renders cleanly with Tailwind dark background; button is keyboard-focusable |
| 01.6 | Update `src/renderer/App.tsx` — on mount, call `vaultStore.loadVaultPath()`; if `vaultPath === null` render `<EmptyState />`, else render a placeholder shell that displays `"Vault: {vaultPath}"` for now (the real Sidebar/ContentPane arrive in Phase 02) | done | Fresh launch (no settings) → EmptyState. After picking a folder → placeholder shell with the path. Restart app → placeholder shell still shown with the same path. |
| 01.7 | Remove the temporary debug button added in Phase 00 only if Phase 04 hasn't reached yet; otherwise leave it for Phase 04 cleanup | done | DECISION: removed now. App.tsx was fully restructured for the EmptyState/shell conditional render, leaving no place for the debug button. Its purpose (prove the IPC pipe) is superseded by real `settings:*` and `dialog:pickFolder` usage. No `console.log` noise existed. The `// TODO PHASE-04: remove` marker is gone with it. |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/main/services/SettingsService.ts` | Create | Persistent vault path storage |
| `src/main/ipc/handlers.ts` | Modify | Wire 3 handlers to SettingsService and dialog |
| `src/renderer/stores/vaultStore.ts` | Create | Renderer-side vault state + actions |
| `src/renderer/components/EmptyState.tsx` | Create | First-launch view |
| `src/renderer/App.tsx` | Modify | Conditional render: EmptyState vs loaded shell |

---

## Verification

Consult `.claude/CLAUDE.md` for the standard commands.

Phase-specific checks:
- Delete `%APPDATA%/Slate/settings.json` (or wherever `userData` resolves on this machine) → launch → see EmptyState
- Pick a folder via the button → restart `npm run dev` → see the placeholder shell with the same path
- Open `settings.json` on disk and confirm the path is the one chosen
- `npm run typecheck && npm run check` green

---

## Notes

- **`userData` path on Windows**: `C:\Users\<user>\AppData\Roaming\Slate\` after `app.setName('Slate')` (which Electron derives from the package name `slate` by default — confirm during implementation that the app name is correct).
- **Settings file format**: simple JSON, e.g. `{ "vaultPath": "C:/Users/.../notes" }`. Don't over-engineer with schema validation libraries — add validation when shapes get complex.
- **Atomic write for settings**: same pattern as VaultService's write — temp file + rename. Avoids half-written corrupt JSON on a crash mid-write.
- **No vault contents loaded yet.** Phase 01 only proves "we know which folder to use." Phase 02 is when we read it.

---

## Review Log

### 2026-06-12 — Phase Review: APPROVED (informal, uncommitted)

**Tasks**: 7/7 genuinely complete, 0 stubs, 0 partial
**Quality**: PASS — `npm run typecheck`, `npm run check` green (`build` green prior to two trivial type/import fixes)
**Integration**: connected — `settings:*` + `dialog:pickFolder` handlers delegate to `SettingsService`/`dialog`; renderer reaches them through `vaultStore` → `@renderer/api`; `App.tsx` renders `EmptyState` vs shell off store state
**Plan integrity**: OK — no contract signature changes; `vault:*` left as `notImplemented` for Phases 02–03
**Commit**: none (user directive: no commit/push until project is ready)

**Findings**:
- `SettingsService` is pure Node (no Electron import), constructor takes the file path → unit-testable in Phase 04. Atomic write via temp + rename; missing/corrupt file falls back to defaults rather than throwing.
- Handler wiring refactored to dependency injection: `registerIpcHandlers(ipc, { settings, getMainWindow })`. Main constructs the service with `join(app.getPath('userData'), 'settings.json')` after `app.setName('Slate')`.
- `settings:setVaultPath` handler returns `undefined` explicitly (contract response is `undefined`, not `void`) — Biome's `noConfusingVoidType` constraint respected.
- Task 01.7: debug button **removed** (App.tsx restructured for conditional render; purpose superseded by real IPC). `// TODO PHASE-04: remove` marker gone with it.

**User-facing verification (not yet run by user — non-blocking)**:
- Fresh launch (no `settings.json`) → EmptyState
- Pick folder → `Vault: <path>` shell → restart → same path persists
- `%APPDATA%/Slate/settings.json` contains the chosen path
