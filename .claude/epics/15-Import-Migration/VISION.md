# Epic 15 — Import & Migration

## Problem

Users switching from other apps (Apple Notes, plain .txt collections, Notion exports, other markdown editors) have no easy way to bring existing notes into Slate. They must manually copy-paste or move files. First-run experience should offer a migration path so adoption friction is minimal.

## Solution

An import system accessible from:
1. **First-run / vault setup**: after choosing a vault folder, offer to import notes from common sources.
2. **Settings > Import**: a permanent entry point for importing more notes later.

### Supported sources (Phase 1)

| Source | Format | Strategy |
|--------|--------|----------|
| Folder of `.txt` files | Plain text | Rename to `.md`, copy to vault |
| Folder of `.md` files | Markdown | Copy to vault (already compatible) |
| Apple Notes export | `.html` per note (via export or third-party tool) | Convert HTML → Markdown (turndown), save as `.md` |
| Notion export | `.md` + attachments in zip | Unzip, flatten or preserve structure, copy to vault |

### UX flow

1. User clicks "Import notes" → file/folder picker dialog.
2. Slate scans the selection, shows a preview: "Found N notes. Import?"
3. On confirm: converts + copies to vault under an `Imported/` subfolder (or root, user's choice).
4. Index reconciliation picks up new files automatically.

## Scope

- Import wizard UI (modal or dedicated panel).
- File conversion layer (txt→md trivial, html→md via turndown).
- Subfolder organization option.
- Progress indicator for large imports.
- Post-import: trigger reconcileIndex so imported notes appear in search immediately.

## Non-goals

- Live sync with Apple Notes or Notion (one-time import only).
- Preserving folder hierarchy from Notion (flatten by default, optional preserve).
- Importing binary-only formats (.doc, .pages).

## Success criteria

- A user with 100 .txt files can import them in under 10 seconds and find them via search immediately.
- Apple Notes HTML export converts to clean markdown (headings, lists, bold/italic preserved).
- No data loss — originals are never modified, only copied.
