# Backlog Tasks

Unprocessed work items. Run `/backlog-plan` to group into sprint/epic suggestions, or `/epic-create` directly when ready to start one.

---

## Initial work items (added 2026-05-18 by /project-roadmap)

### CRITICAL — M1 Foundation

- [ ] **E1 — Vault Foundation** *(epic)*
  - Stream: Vault & File System → Milestone M1
  - VaultService in main with `listNotes`, `readNote`, `writeNote`, `createNote`, `deleteNote`, atomic write-temp-then-rename, path safety
  - chokidar watcher on the vault folder; debounce; ignore self-writes
  - Vault folder picker (first-launch flow + settings re-pick)
  - SettingsService MVP (persists vault path)
  - Sidebar file tree component (recursive listing of `.md` files)
  - `vaultStore` (Zustand) mirroring the file list; subscribes to watcher events via IPC
  - First slice of typed IPC contract in `src/shared/ipc.ts`
  - Acceptance: launch app → pick a folder → see existing `.md` files in sidebar → click one → file content appears as raw text (no editor yet)

- [ ] **E2 — Editor Core MVP** *(epic)*
  - Stream: Editor Core → Milestone M1
  - CodeMirror 6 setup in `src/renderer/editor/`: state + view + history + keymap
  - `@codemirror/lang-markdown` for parsing
  - Code-block syntax highlighting via CM6's nested language support
  - Save on Ctrl+S; `workspaceStore` tracks dirty state
  - Mount/unmount lifecycle inside an `EditorHost` component
  - Acceptance: opening a `.md` file from the sidebar (E1) loads it into CM6 → edit → Ctrl+S writes back to disk → reopening shows persisted content

### HIGH — M2 Daily Driver MVP

- [x] **E3 — Tabs & Workspace** *(epic — DONE 2026-06-14; see `.claude/epics/03-Tabs-Workspace/SUMMARY.md`)*
  - Stream: Workspace → Milestone M2
  - Multi-note tab bar; switch between tabs; close-with-dirty-prompt
  - `workspaceStore` owns tab list, active tab, dirty flags
  - Tab persistence across launches (restore last session)
  - `react-resizable-panels` between sidebar and editor area
  - Acceptance: open 3 notes, edit two, restart app, see all 3 tabs + dirty/clean states restored

- [ ] **E4 — Search & Indexing** *(epic — prerequisite RESOLVED 2026-06-14)*
  - Stream: Search & Indexing → Milestone M2
  - Pre-req DONE: VS Build Tools 2022 (C++) installed; `npm run rebuild` succeeds. Note: `better-sqlite3` ships Electron-ABI prebuilds, so rebuild *downloads* the binary rather than compiling — the `build/Release/*.node` mtime/size looks unchanged. Verify functionally, not by timestamp: `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe -e "require('better-sqlite3')(':memory:')"` loads clean under ABI 130 (Electron 33).
  - IndexService: SQLite schema, incremental indexing on save and watcher events, reconciliation scan at launch, manual rebuild
  - SearchService: FTS5 queries with ranked results, snippets, simple filters
  - Search panel UI (Cmd/Ctrl+F or palette-triggered)
  - Acceptance: type a query → results appear in <2s on a 500-note corpus; click a result opens that note

- [ ] **E5 — Tags & Hashtags** *(epic)*
  - Stream: Search & Indexing → Milestone M2 (extends E4)
  - Inline `#tag` parsing on save; tags column in SQLite index
  - Tag-filter chip in search panel; sidebar section listing all tags with counts
  - Acceptance: add `#javascript` to a note → tag appears in sidebar tag list → clicking it filters search to that tag

- [ ] **E6 — Attachments** *(epic)*
  - Stream: Attachments → Milestone M2
  - AttachmentService in main: hash-name files into `vault/_attachments/<hash>.<ext>`
  - Paste image from clipboard inside the editor → write attachment → insert relative markdown image link
  - Drag-and-drop files onto the editor → same path
  - Acceptance: paste a screenshot into a note → image renders inline in editor → `_attachments/` contains the file → markdown source has a relative link

- [ ] **E7 — Capture & Shortcuts** *(epic)*
  - Stream: Capture & Shortcuts → Milestone M2
  - ShortcutManager in main: register Electron `globalShortcut` (default Ctrl+Shift+N)
  - Quick-capture popup: small frameless BrowserWindow, minimal CM6, save-and-close
  - In-app keymap via `react-hotkeys-hook`: Ctrl+T new tab, Ctrl+W close tab, Ctrl+K palette
  - Acceptance: hit global hotkey from any app → capture window appears → type → save → new note in vault → main window picks it up via watcher

- [ ] **E8 — Dark Mode & Settings UI** *(epic)*
  - Stream: Settings & UX Polish → Milestone M2
  - Tailwind dark theme baseline; CM6 dark theme
  - Settings modal: vault folder, theme, hotkey binding, autosave debounce
  - SettingsService completes (was MVP'd in E1)
  - Acceptance: open settings → change vault path → file tree reloads from new folder; toggle theme; rebind global hotkey

### MEDIUM — M3 v1.0

- [ ] **E9 — Highlight Color Palette** *(epic)*
  - Stream: Editor Core → Milestone M3
  - Fixed 4–6 highlight colors, applied via CM6 decorations
  - Stored as a markdown extension (e.g., `==text==` with color hint) — design TBD in epic
  - Toolbar buttons + keyboard shortcuts to apply/clear
  - Acceptance: select text → toolbar shows colors → click yellow → text highlights → save → reopen → highlight persists → file remains valid markdown

- [ ] **E10 — Packaging & Distribution** *(epic or sprint)*
  - Stream: Packaging & Distribution → Milestone M3
  - Verify electron-builder NSIS installer produces a working install on a clean Windows machine
  - App icon (replace default)
  - Auto-rebuild documentation hardened
  - Acceptance: `npm run dist` produces `Slate-<version>-setup.exe` that installs and runs cleanly on a fresh Windows VM

## Added 2026-06-13 (UAT-driven feature requests)

- Folder management in vault: create new folder in-app (later rename/delete). E1 only renders existing folders; creation was deliberately deferred. Stream: Vault & File System. Needs vault:createFolder IPC + VaultService method + sidebar "New Folder" action with path safety. [feature] high — 2026-06-13
- Interactive checklists: render markdown task lists `- [ ]` / `- [x]` as clickable toggle widgets (Apple Notes-style round checkboxes); clicking rewrites the markdown source. Part of the WYSIWYG editor slice (post-E2 source-mode). Depends on E2. Stream: Editor Core. [feature] medium — 2026-06-13
- Notes-list view: Apple Notes-style middle-column listing (title + content snippet + modified date, sorted by recency) as an alternative/added sidebar mode to the current file tree. Needs file mtime + first-line/snippet from VaultService. Stream: Workspace/UX. [feature] medium — 2026-06-13
- ~~Rename note (incl. changing extension)~~ — DONE 2026-06-13, implemented directly outside the epic flow: `VaultService.renameNote` (path-safe, no-overwrite, extension-validated, +6 tests), `vault:renameNote` IPC, `vaultStore.renameNote`, Sidebar pencil icon → inline rename. Folder-management item above still pending for the Vault Management epic.
- Bold / italic formatting in the editor: toolbar buttons + keyboard shortcuts (Ctrl+B / Ctrl+I) that wrap the selection in markdown `**`/`*`. Markdown-native, portable. Stream: Editor Core. [feature] medium — 2026-06-13
- Quit-with-dirty guard: closing the whole app while a tab has unsaved edits currently discards them silently — no prompt, and on relaunch the tab reopens CLEAN with on-disk content (drafts aren't persisted). E3 UAT surfaced and the user accepted this for v1 (out of E3 scope: tab-close prompt exists, app-quit guard does not). Add a `before-quit`/window-`close` guard that prompts Save / Quit anyway / Cancel when any tab is dirty (renderer dirty check via IPC, `event.preventDefault()` in main). Larger alternative = persist drafts and restore dirty (Obsidian-style), a separate design call. Stream: Workspace/UX. [feature] high — 2026-06-14
- Manual "Rebuild index" UI affordance: the `index:rebuild` IPC + `api.index.rebuild` exist and are preload-exposed, but no renderer component triggers them — VISION (E4) criterion 6 "manual rebuild" is reachable only via `window.api.index.rebuild()` in devtools. Surfaced in E4 Phase 04 review (2026-06-15). Add a small affordance (e.g. a "Rebuild index" item in the search panel footer or a settings/maintenance menu) that calls `api.index.rebuild()` and surfaces success/failure. Stream: Search & Indexing / Settings & UX. [feature] low — 2026-06-15
- Reconcile the index on vault change, not only at launch: `settings:setVaultPath` rebuilds the cached `VaultService` but does not trigger `reconcileIndex`. A user who picks a vault for the **first time mid-session** (or switches vaults) gets no search results for that vault's existing notes until the next relaunch (or until each note is individually saved/created). Surfaced in E4 Phase 02 review (2026-06-15). Self-heals on relaunch; normal case (vault already set at launch) is unaffected. Fix = call `reconcileIndex(new VaultService(path), index)` after a successful `setVaultPath` (best-effort, non-blocking), mirroring the launch path. Stream: Search & Indexing. [feature] medium — 2026-06-15
- DECLINED (markdown-conflict): font weight / font size / text color / text alignment on selected text ("macbook-style" rich text). NOT representable in portable markdown — would require embedded HTML/CSS (`<span style>`, `<div align>`), breaking the local-first / clean-markdown vision the user affirmed. Bold/italic (above) and highlight (E9, `==text==`) are the markdown-compatible subset. Revisit only via /project-revise if the storage model is ever reconsidered. [tech-debt] low — 2026-06-13
- Verify note-encryption `.md.enc` round-trip across macOS ↔ Windows (E10 criterion 7, deferred at close 2026-07-01): the crypto is Node built-in scrypt+AES-256-GCM (deterministic, unit-tested), but the cross-machine open was only exercised on macOS this session. Copy a locked note + settings salt/verifier to a Windows build and confirm the same password opens it with identical content. Stream: Note Encryption. [test] medium — 2026-07-01
- Change vault password (E10 deferred, out of v1 scope): decrypt-all + re-encrypt-all every `.md.enc` under a new key. Its own phase/epic — needs progress UI and an atomic/rollback story so a mid-rekey crash can't strand notes across two keys. Stream: Note Encryption. [feature] low — 2026-07-01
- Friendlier error when a locked note is opened without its settings salt/verifier (E10 deferred): off the no-sync happy path (e.g. a vault copied without settings.json), opening a `.md.enc` surfaces a cryptic `no-password` error. Detect this case and show a clear "this vault has no password set / cannot open locked note here" message. Stream: Note Encryption. [feature] low — 2026-07-01
- In-app update feature (E12 candidate, agreed 2026-07-01): a "Check for updates" button in SettingsPanel that checks GitHub Releases via electron-updater and updates if outdated. Scope decision: **Windows = in-app download+install** (NSIS, works unsigned); **macOS = detect only → open the GitHub Releases page** (no signing needed). Needs: IPC to drive `autoUpdater.checkForUpdates()` + events (available/progress/downloaded/error/up-to-date), `quitAndInstall()` on Windows, `shell.openExternal(releasesUrl)` on mac; Settings"Updates" section with status. Infra already present: `electron-builder.yml` publish=github, CI `--publish always` (publishes latest.yml/latest-mac.yml), silent launch check in main/index.ts. **Caveat — full mac in-app install is OUT until the app is code-signed** (`mac.identity: null` today) + a `zip` mac target is added; Squirrel.Mac requires a signed app to install updates. Only works in packaged builds, never `npm run dev`. Stream: Packaging & Distribution. [feature] medium — 2026-07-01
- Verify desktop sticky notes (E11) on Windows (deferred at close 2026-07-01): stickies use only Electron window APIs (frameless/alwaysOnTop/skipTaskbar) + geometry persistence, verified on macOS only this session. Confirm on a Windows build: pin opens top-right, floats above apps, geometry persists/restores, close-on-delete, near-live sync. Stream: Desktop Sticky Notes. [test] low — 2026-07-01
