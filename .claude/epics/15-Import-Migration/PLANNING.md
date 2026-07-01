# Epic 15 — Import & Migration: Planning

## Phases

### Phase 1: Core Import Engine (Main Process)

| # | Task | File(s) | Estimate |
|---|------|---------|----------|
| 1 | Create `ImportService` — orchestrates scan, convert, copy | `src/main/services/ImportService.ts` | 45 min |
| 2 | Txt importer: rename `.txt` → `.md`, copy to vault | `src/main/services/importers/txt.ts` | 20 min |
| 3 | Markdown importer: copy `.md` files preserving names | `src/main/services/importers/md.ts` | 15 min |
| 4 | HTML importer: convert HTML → Markdown via turndown | `src/main/services/importers/html.ts` | 45 min |
| 5 | Notion zip importer: unzip, flatten, copy `.md` + attachments | `src/main/services/importers/notion.ts` | 60 min |
| 6 | Add `turndown` dependency | `package.json` | 5 min |

### Phase 2: IPC & UI

| # | Task | File(s) | Estimate |
|---|------|---------|----------|
| 7 | IPC channels: `import:scan`, `import:execute`, `import:progress` | `src/main/ipc/handlers.ts`, `src/shared/ipc.ts`, `src/preload/index.ts` | 30 min |
| 8 | Import wizard modal: source picker → preview → confirm → progress | `src/renderer/components/ImportWizard.tsx` | 90 min |
| 9 | Integrate into first-run flow (after vault folder selection) | `src/renderer/components/VaultSetup.tsx` or equivalent | 30 min |
| 10 | Add "Import notes" button in Settings panel | `src/renderer/components/SettingsPanel.tsx` | 15 min |

### Phase 3: Tests & Edge Cases

| # | Task | File(s) | Estimate |
|---|------|---------|----------|
| 11 | Unit tests for each importer (txt, md, html, notion) | `src/main/services/importers/*.test.ts` | 45 min |
| 12 | Handle filename conflicts (append `-1`, `-2`, etc.) | `src/main/services/ImportService.ts` | 20 min |
| 13 | Handle encoding (UTF-8, UTF-16, Latin-1 detection) | `src/main/services/ImportService.ts` | 20 min |
| 14 | Post-import reconcileIndex trigger | `src/main/ipc/handlers.ts` | 10 min |

## Key decisions

- **Subfolder**: imported notes go to `Imported/<source-name>/` by default; user can choose root.
- **No originals modified**: import is always a copy, never move.
- **Turndown config**: strip scripts/styles, preserve headings/lists/bold/italic/links/images.
- **Apple Notes**: users must export to HTML first (File > Export as PDF/HTML via third-party). We document this in the wizard.

## Dependencies

- New dependency: `turndown` (HTML → Markdown converter, ~20 KB).
- Existing: `VaultService.writeNote`, `reconcileIndex`.

## Risk

- Medium. HTML→Markdown conversion is lossy by nature — edge cases in Apple Notes formatting. Mitigated by using turndown (battle-tested library) and showing a preview before import.
