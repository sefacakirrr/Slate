# Epic 15 — Import & Migration: Progress

## Status: IN PROGRESS

## Current phase: Phase 1 — Core Import Engine (complete) → Phase 2 next

| # | Task | Status |
|---|------|--------|
| 1 | ImportService orchestrator | done |
| 2 | Txt importer | done |
| 3 | Markdown importer | done |
| 4 | HTML importer (turndown) | done |
| 5 | Notion zip importer | done |
| 6 | Add turndown dependency | done |
| 7 | IPC channels | pending |
| 8 | Import wizard modal | pending |
| 9 | First-run flow integration | pending |
| 10 | Settings panel entry | pending |
| 11 | Unit tests | pending |
| 12 | Filename conflict handling | pending |
| 13 | Encoding detection | done |
| 14 | Post-import reconcile trigger | pending |

## Notes (Phase 1)

- `ImportService` (`src/main/services/ImportService.ts`): scan (read-only
  preview) + execute (convert → copy). Constructed with `VaultService`; all
  vault writes go through its atomic, path-safe methods. Pure Node — no
  Electron import — unit-testable against a temp vault.
- Importers in `src/main/services/importers/`: pure functions (`txtToNote`,
  `mdToNote`, `htmlToNote`, `notionZipToNotes`), no filesystem access.
- Notion zip: flattens pages, strips 32-hex Notion ids from names, extracts
  assets hash-named into `_attachments/` (AttachmentService convention),
  rewrites URL-encoded relative asset links in note content. CSV skipped.
- Tasks 12 (conflict `-1`/`-2` suffixes) and 13 (UTF-8/UTF-16 BOM/Latin-1
  detection) were pulled forward into Phase 1 — they live in the engine and
  the engine shouldn't ship without them.
- Dependencies added: `turndown` + `adm-zip` (+ types). adm-zip chosen for
  zip reading: pure JS, no native build, matches the no-native-addon policy
  in TECHSTACK.md. Both smoke-tested under the project's Node runtime.
