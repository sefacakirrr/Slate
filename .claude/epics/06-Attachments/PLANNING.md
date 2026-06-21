# Epic 06: Attachments — Planning

> Phase structure, dependencies, and progress tracking.

---

## Phase Overview

| Phase | Name | Goal | Dependencies | Status | Progress | Reviewed | Commit |
|-------|------|------|-------------|--------|----------|----------|--------|
| 00 | AttachmentService | Hash-based binary storage in `_attachments/` | None | COMPLETE | 5/5 | | uncommitted |
| 01 | IPC & Wiring | `attachment:store` + `attachment:open` channels | Phase 00 | COMPLETE | 4/4 | | uncommitted |
| 02 | Paste & Drop Extension | CM6 extension intercepting paste/drop → store → insert link | Phase 01 | COMPLETE | 6/6 | | uncommitted |
| 03 | Image & File Widget | Inline image + file chip rendering via CM6 Decoration.replace | Phase 02 | COMPLETE | 6/6 | | uncommitted |
| 04 | Tests & Polish | Test suite, error handling, open-with-app, spinner UX | Phase 03 | COMPLETE | 5/5 | | uncommitted |
| 05 | User Acceptance Testing | User verifies epic end-to-end | All phases | COMPLETE | 8/8 | | uncommitted |

**Status values**: NOT STARTED → IN PROGRESS → COMPLETE
**Reviewed**: Set only by /epic-phase-review (mandatory before COMPLETE)
**Commit**: uncommitted (project directive)

---

## Critical Path

```
Phase 00 (AttachmentService) → Phase 01 (IPC) → Phase 02 (Paste/Drop) → Phase 03 (Image Widget) → Phase 04 (Tests) → Phase 05 (UAT)
```

---

## Design Notes

- **AttachmentService is a standalone class** (not methods on VaultService). It owns binary write logic, hash computation, and dedup. Depends on vault path from VaultService.
- **Base64 over IPC.** Binary data encoded as base64 string in renderer, decoded to Buffer in main. 10MB file limit keeps payloads manageable (~13MB base64 max).
- **Vault-root-relative paths.** All attachment links use `_attachments/hash.ext` — not relative to the note's directory. Simpler, doesn't break on note move.
- **ViewPlugin for image decorations.** Stateless — rebuilds decoration set from doc content on every change. No StateField needed. Lazy loading via IntersectionObserver prevents memory issues.
- **All file types accepted for storage.** Only inline rendering is image-specific. Non-image files get `[filename](path)` link syntax.
