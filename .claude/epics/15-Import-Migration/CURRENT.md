# Epic 15 — Import & Migration: Progress

## Status: IN PROGRESS

## Current phase: Phase 3 — Tests & Edge Cases (complete) — awaiting review + UAT

| # | Task | Status |
|---|------|--------|
| 1 | ImportService orchestrator | done |
| 2 | Txt importer | done |
| 3 | Markdown importer | done |
| 4 | HTML importer (turndown) | done |
| 5 | Notion zip importer | done |
| 6 | Add turndown dependency | done |
| 7 | IPC channels | done |
| 8 | Import wizard modal | done |
| 9 | First-run flow integration | done |
| 10 | Settings panel entry | done |
| 11 | Unit tests | done |
| 12 | Filename conflict handling | pending |
| 13 | Encoding detection | done |
| 14 | Post-import reconcile trigger | done |

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

## Notes (Phase 2)

- IPC: `import:pickSource` (native dialog: folder or .zip with filter),
  `import:scan`, `import:execute`; progress pushed via `import:progress`
  event (same pattern as `update:state`). Task 14 (reconcile) landed inside
  `import:execute` — reconcileIndex + broadcastFilesChanged after the copy.
- `ImportWizard.tsx`: modal with pick → scanning → preview (+destination
  radio: `Imported/<source>/` default or root) → progress bar → done/error.
  Escape/backdrop close disabled mid-import.
- Settings entry: "Import" section in SettingsPanel (button disabled without
  a vault). First-run: `vaultStore.offerFirstRunImport` set when the FIRST
  vault is picked (vaultPath was null); App renders the wizard once,
  dismissed via `dismissFirstRunImport`. No design system existed
  (`.claude/designs/` absent) — wizard follows ConfirmDialog/SettingsPanel
  visual conventions.
## Notes (Phase 3)

- `importers/importers.test.ts` (17 tests): txt rename edge cases, md
  passthrough, html conversion (headings/emphasis/lists, script/style strip,
  link+image preservation), Notion zip (id strip, flattening, collision
  suffixes, asset extraction + link rewrite, external URLs untouched, CSV
  skip, asset dedup).
- `ImportService.test.ts` (12 tests, real temp dirs): recursive scan with
  hidden/underscore exclusion, unsupported source rejection, subfolder/root
  destinations, originals untouched, conflict `-1` suffix vs existing vault
  note, progress events (0..total), html→md end-to-end, encoding (UTF-16 LE
  BOM, Latin-1 fallback, UTF-8 BOM strip).
- Suite: 282/282 green. Wizard UI + first-run flow need manual UAT
  (dialogs/IPC not exercisable in the Node test env).

## Scope extension (user feedback, 2026-07-02)

User UAT feedback: extension-whitelist import was too narrow — Sublime Text
scratch files (extension-less), code/config/log files, and Mac RTF notes
could not be imported, and flattening lost the user's folder organization.

- **Capability-based acceptance**: known formats (md/markdown, txt, html/htm,
  rtf) route to dedicated importers; every other file is content-sniffed
  (first 8 KB: null bytes / control-char ratio) and imported as plain text
  when readable. A binary-extension blacklist (media, archives, executables,
  office docs) skips obvious non-notes without reading. >10 MB files skipped.
- **Generic text importer** (`importers/text.ts`): appends `.md` to the FULL
  name (`app.js` → `app.js.md`) so source type stays visible and siblings
  (`app.js`/`app.py`) can't collide.
- **RTF importer** (`importers/rtf.ts`): hand-rolled RTF→text (no new dep) —
  destination-group skipping (fonttbl/colortbl/info/pict…), \par/\line/\tab,
  \'hh cp1252 hex escapes, \uN unicode words. Covers TextEdit/WordPad notes.
- **Folder structure preserved**: source-relative dirs are mirrored in the
  vault (`work/projects/plan.md` → `Imported/<src>/work/projects/plan.md`);
  conflict suffix applies to the basename only.
- **Picker default**: import dialogs open at the user's Desktop.
- Tests: 295/295 (13 new — sniffing, structure preservation, code files,
  RTF conversion incl. Turkish chars, binary skip).
