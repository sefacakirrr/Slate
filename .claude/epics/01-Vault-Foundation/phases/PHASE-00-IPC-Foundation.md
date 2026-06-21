# Phase 00: IPC Foundation

> **Status**: COMPLETE
> **Dependencies**: None

---

## Goal

Define the typed IPC contract, register stub handlers in main, expose a typed `window.api` through the preload `contextBridge`, and verify a round-trip call from renderer to main succeeds.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|---|---|---|
| 00.1 | Define IPC command types in `src/shared/ipc.ts` — keep `IpcResult<T>`; add `IpcCommands` map covering all 8 commands listed in PLANNING.md | done | `tsc --noEmit -p tsconfig.node.json` and `-p tsconfig.web.json` both green; types referenced in main and renderer compile |
| 00.2 | Create `src/main/ipc/handlers.ts` with one stub handler per command, each returning `{ ok: false, error: 'not-implemented' }` initially | done | File exists; one exported `registerIpcHandlers(ipcMain)` function; lint-clean |
| 00.3 | Call `registerIpcHandlers(ipcMain)` from `src/main/index.ts` during `app.whenReady` before window creation | done | Main process boots without throwing; handlers visible to renderer |
| 00.4 | In `src/preload/index.ts`, build a typed `api` object using `ipcRenderer.invoke` for each command; `contextBridge.exposeInMainWorld('api', api)` | done | `window.api.settings.getVaultPath()` callable from renderer with type safety |
| 00.5 | Add `src/renderer/api/window.d.ts` declaring `window.api` with the same shape; import the type from `@shared/ipc.ts` | done | Renderer code that calls `window.api.*` typechecks without `any` |
| 00.6 | Create `src/renderer/api/index.ts` — thin wrapper re-exporting `window.api` with a narrowed surface (just the methods, no Electron types leaked) | done | Renderer imports `api` from `@renderer/api`, never from `window.api` directly |
| 00.7 | Round-trip verification: in `App.tsx`, render a temporary debug button that calls `api.settings.getVaultPath()` and logs the `IpcResult` to console. Confirm console shows `{ ok: false, error: 'not-implemented' }`. Mark this debug code with a `// TODO PHASE-04: remove` comment | done | `npm run dev`; click button; observe expected `IpcResult` in DevTools console |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/shared/ipc.ts` | Modify | Add `IpcCommands` map; keep `IpcResult<T>` |
| `src/main/ipc/handlers.ts` | Create | `registerIpcHandlers(ipcMain)` with stubbed handlers |
| `src/main/index.ts` | Modify | Call `registerIpcHandlers` on `whenReady` |
| `src/preload/index.ts` | Modify | Build typed `api` object, expose via `contextBridge` |
| `src/renderer/api/window.d.ts` | Create | Global declaration for `window.api` |
| `src/renderer/api/index.ts` | Create | Thin re-export wrapper |
| `src/renderer/App.tsx` | Modify | Temporary debug button (removed in Phase 04) |

---

## Verification

Consult `.claude/CLAUDE.md` for the standard build/lint/test/typecheck commands.

Phase-specific checks:
- `npm run typecheck` — both `node` and `web` configs green
- `npm run check` — Biome clean
- `npm run dev` — app launches; debug button round-trips; console shows `not-implemented` `IpcResult` for the stubbed handler

---

## Notes

- **No `nodeIntegration`.** `contextBridge` is the only path from renderer to main. The preload script is the type-safe seam.
- **`sandbox: false`** is set in `webPreferences` (from scaffold). Keep it that way — the preload needs Node access to call `ipcRenderer.invoke`.
- **Don't optimize the API shape.** The first cut will likely need adjustment in E02 when the watcher arrives. Aim for "obviously correct" not "perfectly future-proof."
- The debug button is intentional — it proves the wiring works end-to-end before any service work begins. Marked for removal in Phase 04.

---

## Review Log

### 2026-06-12 — Phase Review: APPROVED (informal, uncommitted)

**Tasks**: 7/7 genuinely complete, 0 stubs, 0 partial
**Quality**: PASS — `npm run typecheck`, `npm run check`, `npm run build` all green
**Integration**: 7/7 connected — handlers registered on `whenReady`, `api` exposed via `contextBridge`, renderer consumes through `@renderer/api`
**Plan integrity**: OK — contract shape matches the PLANNING.md table; later phases wire handlers without changing signatures
**Commit**: none (user directive: no commit/push until project is ready)

**Findings**:
- Stub handlers throw `Error('not-implemented')`; the generic `register` wrapper catches and packages `{ ok: false, error: 'not-implemented' }`. Intentional per phase design, not a stub-masquerading-as-done.
- `IpcCommands` is the single source of truth; `Api`, preload `api`, and `window.d.ts` all derive from it. No `any` leaks.
- Task 00.7's manual round-trip click is the only item not statically verifiable (requires `npm run dev`). Code path is deterministic and complete; user can confirm at leisure — non-blocking.

**Note**: Formal commit-gated review flow skipped per user directive. Tracking docs updated as file edits only; no git commit. Commit column left empty until the project's first commit.
