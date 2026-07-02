# Epic 15 — Import & Migration: Progress

## Status: IMPLEMENTED — all phases reviewed & approved; manual UAT pending

## Review Log

### 2026-07-02 — Phase Review (Phases 1–3 + scope extension): APPROVED

**Tasks**: 14/14 genuinely complete (verified against code, not table status)
**Quality**: typecheck 0 errors, tests 304/304, lint has only the 4
pre-existing Sidebar a11y errors documented since Epic 13 (line numbers
shifted by unrelated edits; no new issues from this epic)
**Integration**: fully wired — `ImportService` constructed in
`handlers.ts:373-374` (scan/execute), progress via `import:progress` event,
`ImportWizard` mounted from SettingsPanel:355 and App.tsx:148 (first-run),
`reconcileIndex` + `broadcastFilesChanged` run after every execute
**Commits**: 32a7785, ebe1f91, 5d9d16e, cd08182 (scope extension), 8527e23

**Evidence highlights**:
- Task 12 (conflict handling) was implemented in Phase 1, not Phase 3 —
  `resolveConflictFree` with per-basename `-1`/`-2` suffixes; tested against
  an existing vault note (`note.md` kept, import lands as `note-1.md`).
- Task 13 (encoding): UTF-16 LE/BE BOM, Latin-1 fallback, UTF-8 BOM strip —
  each covered by a dedicated test with real bytes.
- Scope extension (user UAT feedback): capability-based acceptance
  (content-sniffing, binary blacklist), RTF importer, folder-structure
  preservation, Desktop default in pickers — 39 importer/service tests total.
- VISION success criteria: (1) 100-txt bulk import — engine loop is linear
  copy, integration-tested; timing needs UAT. (2) HTML→clean markdown —
  verified by turndown tests. (3) No data loss — originals never written,
  asserted by test.

**UAT ADVISORY** (dialogs/IPC not exercisable in tests):
- Settings > Import → pick a mixed Desktop folder → preview counts, import,
  verify folder structure under `Imported/` and search hits immediately.
- Notion zip end-to-end with images.
- First-run offer: pick a vault for the first time → wizard appears once.

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
| 12 | Filename conflict handling | done |
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
