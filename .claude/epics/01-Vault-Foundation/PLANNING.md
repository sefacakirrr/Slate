# Epic 01: Vault Foundation — Planning

> Phase structure, dependencies, and progress tracking.
>
> **Status**: COMPLETE
> **Closed**: 2026-06-13

---

## Phase Overview

| Phase | Name | Goal | Dependencies | Status | Progress | Reviewed | Commit |
|---|---|---|---|---|---|---|---|
| 00 | IPC Foundation | Define the typed IPC contract; wire preload `contextBridge`; round-trip a noop call | None | COMPLETE | 7/7 | ✓ | uncommitted |
| 01 | Settings & Empty State | `SettingsService` persists vault path; first-launch picker UX | Phase 00 | COMPLETE | 7/7 | ✓ | uncommitted |
| 02 | Vault Read | `VaultService` read paths (`listNotes`, `readNote`), path safety, sidebar tree, content pane | Phase 01 | COMPLETE | 9/9 | ✓ | uncommitted |
| 03 | Vault Write | `VaultService` write paths (`writeNote`, `createNote`, `deleteNote`) with atomic temp-rename; New/Delete UI | Phase 02 | COMPLETE | 8/8 | ✓ | uncommitted |
| 04 | Tests & Polish | Vitest coverage for `VaultService` and `SettingsService`; debug code removed; quality pipeline green | Phase 03 | COMPLETE | 7/7 | ✓ | uncommitted |
| 05 | User Acceptance Testing | User verifies the epic end-to-end against `VISION.md` success criteria | All phases | COMPLETE | 9/9 | ✓ | uncommitted |

**Status values**: NOT STARTED → IN PROGRESS → COMPLETE
**Reviewed**: Set only by `/epic-phase-review` (mandatory before COMPLETE)
**Commit**: Implementation commit hash (7 chars)

---

## Critical Path

```
Phase 00 (IPC Foundation)
   ↓
Phase 01 (Settings & Empty State)
   ↓
Phase 02 (Vault Read)
   ↓
Phase 03 (Vault Write)
   ↓
Phase 04 (Tests & Polish)
   ↓
Phase 05 (UAT)
```

Strictly linear — each phase depends on the previous. No parallel opportunities; the slice is too thin for them.

---

## IPC Contract (locked at end of Phase 00, may extend in later phases)

Phase 00 establishes the contract shape. Subsequent phases wire handlers to real services but do not change command signatures unless flagged. Refactoring is allowed in E02 (next epic) when the watcher arrives.

| Command | Request | Response | Phase wires the handler |
|---|---|---|---|
| `settings:getVaultPath` | — | `string \| null` | 01 |
| `settings:setVaultPath` | `string` | `void` | 01 |
| `dialog:pickFolder` | — | `string \| null` | 01 |
| `vault:listNotes` | — | `string[]` (relative paths) | 02 |
| `vault:readNote` | `string` | `string` | 02 |
| `vault:writeNote` | `{path: string, content: string}` | `void` | 03 |
| `vault:createNote` | `string` | `void` | 03 |
| `vault:deleteNote` | `string` | `void` | 03 |

Every response is delivered to the renderer as `IpcResult<T>`.

---

## Conventions Locked at Phase 00

- File layout: `src/main/services/`, `src/main/ipc/`, `src/preload/`, `src/renderer/api/`, `src/renderer/stores/`, `src/renderer/components/`
- Errors: services throw; IPC handlers catch and return `IpcResult.error`; renderer destructures `result.ok`
- Path aliases: `@shared/*`, `@renderer/*` (already configured in tsconfigs and electron-vite)
- Quality gate before any phase is marked COMPLETE: `npm run check && npm run typecheck && npm run build` all green
