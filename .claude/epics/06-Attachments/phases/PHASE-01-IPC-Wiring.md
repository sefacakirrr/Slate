# Phase 01: IPC & Wiring

> **Status**: NOT STARTED
> **Dependencies**: Phase 00

---

## Goal

Wire AttachmentService to the renderer via the typed IPC contract — add the channel, handler, preload method, and renderer API surface.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 1.1 | Add `attachment:store` command to `shared/ipc.ts` with request/response types | pending | Types compile, request = `{ data: string; name: string }`, response = `{ relativePath: string }` |
| 1.2 | Add handler in `main/ipc/handlers.ts` — decode base64, call AttachmentService.store() | pending | Handler registered, base64 → Buffer → service → IpcResult |
| 1.3 | Instantiate AttachmentService in `main/index.ts`, pass to handler deps | pending | Service created with vault path getter, injected into registerIpcHandlers |
| 1.4 | Add `attachment.store()` to preload bridge and renderer API type | pending | `window.api.attachment.store(req)` callable from renderer |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/shared/ipc.ts` | Modify | Add `attachment:store` command type |
| `src/main/ipc/handlers.ts` | Modify | Add handler with base64 decode |
| `src/main/index.ts` | Modify | Instantiate AttachmentService |
| `src/preload/index.ts` | Modify | Expose `attachment.store()` |
| `src/renderer/api/window.d.ts` | Modify | Update Api type (if separate from ipc.ts) |

---

## Verification

- `npm run typecheck` — both projects pass
- `npm run check` — Biome clean
- Manual: from renderer console, `await window.api.attachment.store({ data: btoa('test'), name: 'test.txt' })` returns `{ ok: true, data: { relativePath: '_attachments/<hash>.txt' } }`

---

## Notes

- `data` field is base64-encoded binary content
- `name` field is the original filename (for extension extraction)
- Handler catches AttachmentService errors (size limit, no vault) and returns `{ ok: false, error: '...' }`

---

## Review Log

_Populated by /epic-phase-review._
