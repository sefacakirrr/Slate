# Phase 00: AttachmentService

> **Status**: NOT STARTED
> **Dependencies**: None

---

## Goal

Create the main-process service that stores binary files in `_attachments/` with content-hash filenames, supporting deduplication.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 0.1 | Create `AttachmentService` class with constructor accepting vault path getter | pending | Class instantiable, gets vault path dynamically |
| 0.2 | Implement `store(buffer: Buffer, originalName: string): { relativePath: string; hash: string }` | pending | Writes file to `_attachments/<sha256>.<ext>`, returns relative path |
| 0.3 | Implement dedup logic — skip write if hash file already exists | pending | Second call with same content returns same path without writing |
| 0.4 | Implement file size validation (reject > 10MB) | pending | Throws descriptive error for oversized files |
| 0.5 | Implement extension extraction from original filename with fallback | pending | Correct ext derived from name; unknown → `.bin` fallback |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/AttachmentService.ts` | Create | Service class with store/hash/dedup logic |
| `src/main/services/AttachmentService.test.ts` | Create | Unit tests for hash, dedup, size limit, ext extraction |

---

## Verification

- `npm run test` — AttachmentService tests pass
- `npm run typecheck:node` — no type errors
- `npm run check` — Biome clean

---

## Notes

- Uses `node:crypto` `createHash('sha256')` for content hashing
- Atomic write pattern: write to temp → rename (same as VaultService)
- Constructor takes a `getVaultPath: () => string | null` function, not a static path — vault can change at runtime
- `_attachments/` directory created on demand (first store call)
- Extension derived from `originalName` parameter — the renderer passes the file's original name

---

## Review Log

_Populated by /epic-phase-review._
