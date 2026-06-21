# Project Roadmap

> **Project**: Slate
> **Created**: 2026-05-18
> **Last updated**: 2026-06-15

---

## Current State

**M1 (Foundation) and M2 (Daily Driver MVP) are both complete.** Slate is a fully functional daily-driver note app: vault picker, file tree, multi-tab CM6 editor with markdown + code highlighting, full-text search (Ctrl+Shift+F), #hashtag sidebar, attachments (paste/drop + inline rendering + file chips), global quick-capture hotkey (Ctrl+Shift+N), and settings panel with dark/light/system theme toggle. 179 tests green. Next up: **M3 — v1.0** (highlight palette, NSIS installer, polish). Nothing is committed to git yet (standing project directive).

---

## Milestones

| Milestone | Definition | Status | Progress |
|---|---|---|---|
| **M1 — Foundation** | User picks a vault folder, sees `.md` files listed, opens one, edits, saves, changes persist. Proves IPC + VaultService + editor + file I/O end-to-end. | COMPLETE | 2/2 streams (E1 vault + E2 editor done; user-verified end-to-end) |
| **M2 — Daily Driver MVP** | All Tier-1 vision features at minimum quality: tabs, full-text search, tags, attachments, quick-capture hotkey, dark mode. User can start dogfooding daily. | COMPLETE | 6/6 streams (E3 tabs + E4 search + E5 tags + E6 attachments + E7 capture + E8 settings all done) |
| **M3 — v1.0** | Highlight color palette working. NSIS installer ships. Search <2s, quick-capture <5s, dogfooded 30+ days without falling back to other tools. Polish-complete. | NOT STARTED | 0/8 streams |

---

## Work Streams

| Stream | Components | Status | Epic/Sprint | Milestone |
|---|---|---|---|---|
| **Vault & File System** | VaultService, chokidar watcher, file-tree sidebar, vault folder picker | IN PROGRESS | E1 + rename (done); watcher & folder-create → backlog/Vault Management | M1 (basics) → M2 (external change reconciliation) |
| **Editor Core** | CodeMirror 6 module, markdown live-preview, code-block syntax highlighting | IN PROGRESS | E2 (source-mode editor + save + code highlight done; live-preview/WYSIWYG → later) | M1 (basics) → M3 (highlight palette) |
| **Workspace** | Tabs, workspaceStore, dirty/save coordination, tab persistence | COMPLETE | E3 (done) | M2 |
| **Search & Indexing** | IndexService (SQLite FTS5), SearchService, search panel UI, tag extraction | COMPLETE (search) | E4 (done; tag extraction → E5) | M2 |
| **Attachments** | AttachmentService, paste/drag handlers, hash-named `_attachments/`, inline image widget, file chip widget | COMPLETE | E6 (done) | M2 |
| **Capture & Shortcuts** | ShortcutManager, quick-capture window, in-app keymap | COMPLETE | E7 (done) | M2 |
| **Settings & UX Polish** | SettingsService, settings UI, dark/light/system theme, vault config, custom hotkey binding | COMPLETE (basic) | E8 (done — settings panel + theme toggle; custom hotkey rebind → M3) | M2 (dark mode + vault config) → M3 (full polish) |
| **Packaging & Distribution** | electron-builder NSIS installer, native module rebuild docs, version handling | NOT STARTED | — | M3 |

**Status values**: NOT STARTED → IN PROGRESS → COMPLETE

---

## Completed Work

| # | Type | Name | Date | Stream |
|---|---|---|---|---|
| — | scaffold | Project scaffold (vision, techstack, architecture, build infra) | 2026-05-18 | (infrastructure, not a stream) |
| E1 | epic | Vault Foundation — IPC contract + Settings/VaultService + renderer shell (read/create/delete) | 2026-06-13 | Vault & File System |
| E2 | epic | Editor Core MVP — CM6 source-mode editor, markdown + code highlighting, Ctrl+S save, dirty tracking, dirty-switch guard (user-verified) | 2026-06-13 | Editor Core |
| — | feature | Note rename (incl. extension) + last-note restore — implemented directly | 2026-06-13 | Vault & File System |
| E3 | epic | Tabs & Workspace — multi-tab workspace, per-tab CM6 EditorState, close-with-dirty prompt, tab persistence (user-verified) | 2026-06-14 | Workspace |
| E4 | epic | Search & Indexing — SQLite FTS5 index, ranked search + snippets, Ctrl+Shift+F panel, incremental + launch reconciliation (user-verified) | 2026-06-15 | Search & Indexing |
| E5 | epic | Tags & Hashtags — extractTags, tags+note_tags tables, tag sidebar, tag click → results (user-verified) | 2026-06-19 | Search & Indexing |
| E6 | epic | Attachments — paste/drop → hash storage, inline image widget, file chip widget, open-in-app, delete button (user-verified) | 2026-06-19 | Attachments |
| E7 | epic | Capture & Shortcuts — WindowManager, ShortcutManager, Ctrl+Shift+N global hotkey, quick-capture popup (user-verified) | 2026-06-19 | Capture & Shortcuts |
| E8 | epic | Settings UI & Theme — Settings panel, dark/light/system toggle, CM6 theme switching, vault path display (user-verified) | 2026-06-19 | Settings & UX Polish |

Vision, TECHSTACK.md, ARCHITECTURE.md authored; Electron+React+Tailwind+CodeMirror scaffold built and verified end-to-end (`npm run build`, `npm run check`, `npm run typecheck` all green; `npm run dev` launches an empty shell). Pre-feature state.

---

## Vision Alignment

**Aligned — no feature work done yet.**

PROJECT-VISION.md non-goals are encoded as architectural constraints (no sync, no plugins, no AI, no mobile/web). The architecture supports every Tier-1 capability listed in the vision. No drift to flag.

---

## Known Risks

- **VS Build Tools dependency.** Search/indexing (M2) cannot ship until `better-sqlite3` is rebuilt against Electron's Node ABI, which requires Visual Studio Build Tools 2022 (Desktop development with C++) on the dev machine. Mitigation: M1 work has zero dependency on SQLite, so it can proceed in parallel with the tooling install.
- **CodeMirror 6 WYSIWYG complexity.** Live-preview decorations are the single highest-risk piece of the editor work. Mitigation: start E2 with the simplest possible CM6 + markdown setup; add live-preview decorations as a second slice, not a prerequisite.
- **Vision Tier-2 creep.** The vision explicitly defers backlinks, daily notes, templates, outlines. Risk: implementing one of them pre-emptively "while we're here." Mitigation: ROADMAP.md does not list any of those streams; if a Tier-2 feature gets added later, it must come via `/project-revise`.
