# Epic 02: Editor Core MVP

> **Status**: Planning
> **Created**: 2026-06-13

---

## 1. Summary

**Problem**: Notes are read-only. `ContentPane` renders raw text in a `<pre>` — the user cannot type into a note or persist changes through the app. Every downstream feature (tabs, search, checklists, WYSIWYG) depends on a working editor that doesn't exist yet. This is the M1 blocker.

**Vision**: Replace the read-only pane with a CodeMirror 6 **source-mode** markdown editor. Open a note → edit it → `Ctrl+S` saves to disk → reopening shows the persisted content. Markdown syntax is highlighted (markers stay visible — this is source mode, not WYSIWYG), code blocks get nested-language syntax highlighting, and the editor tracks unsaved (dirty) state with a visible indicator and a save/discard/cancel guard when switching notes.

**Key Deliverables**:
1. **CM6 `EditorHost`** — imperative `EditorView` wrapped in a React component; mounts on note select, swaps the document when the selection changes, tears down cleanly.
2. **Markdown + code-block highlighting** — `@codemirror/lang-markdown` with nested languages via `@codemirror/language-data` (lazy-loaded). `.txt` opens in plain mode.
3. **Save pipeline** — `Ctrl+S` → `vault:writeNote` (IPC already exists from E1, currently unused) → disk; dirty tracking in a Zustand store with a visible indicator.
4. **Dirty-switch guard** — switching away from a note with unsaved changes prompts Save / Discard / Cancel (reusing the `ConfirmDialog` pattern).

---

## 2. Exploration Findings

> Codebase exploration performed 2026-06-13 via /epic-create (direct inspection — author implemented E1).

### Relevant Components
- **`src/renderer/components/ContentPane.tsx`** — read-only `<pre>` view, reads `selectedPath` / `noteContent` / `noteError` from `vaultStore`. This is what the editor replaces. Its header comment already says "The real CodeMirror editor replaces this in Epic 02."
- **`src/renderer/stores/vaultStore.ts`** — owns `selectedPath`, `noteContent`, `loadSelectedContent` (reads via `vault:readNote`). No write/dirty state yet.
- **`src/renderer/editor/`** — empty (`.gitkeep` only). Greenfield for the CM6 setup.
- **`src/shared/ipc.ts` + `main/ipc/handlers.ts`** — `vault:writeNote` ({ path, content } → void) is fully wired through service → handler → preload → api but **has no renderer caller yet**. Save needs only a store action, not new IPC.
- **`src/main/services/VaultService.ts`** — `writeNote` uses atomic temp-then-rename; path-safety enforced. Save path is production-ready.

### Current Implementation
Reading works end-to-end (E1). Writing exists at every layer except the renderer UI/store. There is no editor, no dirty tracking, no save keybinding.

### Gaps Identified
- No text editor component; no CM6 wiring.
- No `workspaceStore` / dirty state; no save action calling `vault:writeNote`.
- No language selection by extension; no code-block highlighting.
- No unsaved-changes guard on note switch.

### Patterns to Follow
- **Renderer never imports Node APIs** — save goes through `api.vault.writeNote`.
- **Errors**: service throws → handler catches → renderer reads `result.ok`. The save action follows the same `IpcResult` destructuring as existing store actions.
- **Stores are Zustand**, components stay declarative. The CM6 `EditorView` is the one imperative island — isolate its lifecycle in `EditorHost`.
- Dependencies already present: `codemirror` ^6 (bundles state/view/commands/language + `basicSetup`), `@codemirror/lang-markdown`, `react-hotkeys-hook`. **To add: `@codemirror/language-data`.**

---

## 3. Architecture

### Current State
```
vaultStore (selectedPath, noteContent) ──► ContentPane ──► <pre> read-only text
                                                            (vault:writeNote unused)
```

### Target State
```
┌─ RENDERER ───────────────────────────────────────────────┐
│  vaultStore: selectedPath, noteContent (read)             │
│  editorStore (new): dirty, draft content, save(), ...     │
│         │                                                 │
│         ▼                                                 │
│  EditorHost (React)                                       │
│    ├─ creates one CM6 EditorView                          │
│    ├─ on selectedPath change → load content, swap doc     │
│    ├─ extensions: basicSetup, markdown({codeLanguages}),  │
│    │   history, keymap (Ctrl+S → save), updateListener    │
│    │   (sets dirty), theme                                │
│    └─ .txt → plain (no markdown extension)                │
│         │ Ctrl+S                                          │
│         ▼                                                 │
│  api.vault.writeNote({ path, content })  ── IPC (E1) ──►  │
└───────────────────────────────────────────────────────────┘
            │
            ▼  main: VaultService.writeNote (atomic, path-safe) → disk
```

### Key Design Points (from /epic-create dialogue)
- **Source mode, not WYSIWYG.** Markdown markers stay visible and syntax-highlighted. Live-preview/marker-hiding is the highest-risk piece (per ROADMAP) and is deliberately deferred to a later slice. The user can still type valid markdown (incl. `- [ ]` task lists) and it saves as-is.
- **Manual save (`Ctrl+S`) + dirty indicator.** No autosave (that's E8). Dirty flag set by CM6 `updateListener` on doc change, cleared on successful write.
- **Dirty-switch → Save / Discard / Cancel prompt.** Reuse `ConfirmDialog` (extend it to 3 actions or add a sibling). Prevents silent data loss; user stays in control.
- **Code-block highlighting via `@codemirror/language-data`** — lazy-loaded `codeLanguages` passed to `markdown()`.

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Selecting a `.md` note loads its content into a CM6 editor (not a `<pre>`) | Manual: click a note; see an editable editor with the file's text |
| 2 | Typing edits the buffer and sets a visible dirty indicator | Manual: type; observe unsaved marker appear |
| 3 | `Ctrl+S` writes the buffer to disk via `vault:writeNote`; dirty indicator clears | Manual: edit, Ctrl+S, confirm file on disk changed; reopen shows new content |
| 4 | Markdown syntax is highlighted; fenced code blocks get language syntax highlighting | Manual: open a note with a ```` ```ts ```` block; verify highlighting |
| 5 | `.txt` opens in plain mode (no markdown parsing errors); `.md`/`.markdown` use markdown mode | Manual: open one of each |
| 6 | Switching away from a dirty note prompts Save / Discard / Cancel and behaves correctly for each | Manual: edit, click another note, exercise all three choices |
| 7 | `npm run check && npm run typecheck && npm run test && npm run build` all green; no runtime console errors | Automated gate |

---

## 5. Scope

### In Scope
- CM6 `EditorHost` component replacing `ContentPane`'s body (mount/swap/teardown lifecycle)
- `@codemirror/lang-markdown` markdown mode; `@codemirror/language-data` for code-block languages
- Plain mode for `.txt`
- Save on `Ctrl+S` → `vault:writeNote`; dirty tracking + visible indicator (new `editorStore` or extend `vaultStore`)
- Save / Discard / Cancel guard on note switch
- Editor theme consistent with the current dark UI

### Out of Scope (deferred — captured in backlog)
- **WYSIWYG live-preview** (hiding markdown markers, inline rendering) — separate slice; highest risk, not a prerequisite for writing.
- **Interactive checklists** (clickable `- [ ]` toggle widgets, Apple Notes style) — depends on the WYSIWYG decoration layer; **backlog item 2026-06-13**. In E2 source mode, `- [ ]` is editable/saveable as plain markdown text.
- **Notes-list view** (Apple Notes-style title+snippet+date column) — Workspace/UX work, independent of the editor; **backlog item 2026-06-13**.
- **Folder management** (create/rename/delete folders) — Vault & File System stream; **backlog item 2026-06-13**.
- **chokidar watcher / external-change reconciliation** — separate concern; manual Refresh (E1) remains the escape hatch. Decided OUT of E2 in dialogue.
- **Autosave** — E8 (Settings). **Tabs / multi-note** — E3. **Find/replace** — deferred. **Highlight color palette** — E9.

### Vision note
Storage stays **markdown files on disk** (confirmed in dialogue) — the local-first / no-lock-in principle is unchanged. The new feature requests (folder management, interactive checklists, notes-list view) are additive features on top of the markdown model, not a storage change. Because they extend a deliberately-locked Tier-1 scope, recommend running `/project-revise` to record them in PROJECT-VISION/ROADMAP before they become their own epics.

---

## 6. Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Marrying CM6's imperative `EditorView` to React lifecycle (doc swap on note switch, external content load, dirty sync) | The single highest-risk integration; mishandling causes stale buffers, lost edits, or leaks | Isolate all imperative CM6 code in `EditorHost`; one long-lived `EditorView`, replace doc via a transaction on `selectedPath` change; never recreate per render. Start with the simplest setup, add features incrementally |
| `@codemirror/language-data` lazy-loads languages async | Code highlighting may flash unstyled then restyle; bundle size grows | Acceptable for personal use; lazy load is the standard pattern. Verify the markdown `codeLanguages` async resolution doesn't error on unknown fences |
| Dirty-switch race: selection changes before the prompt resolves | Wrong note saved, or edits lost | Gate the actual `selectedPath` change behind the prompt's resolution; don't load the new note until Save/Discard/Cancel returns |
| `Ctrl+S` may collide with browser/Electron defaults | Save doesn't fire or triggers a page save | Bind via CM6 keymap with `preventDefault`; verify in the Electron renderer specifically |
| Large note performance in CM6 | Lag on very large files | `basicSetup` handles typical note sizes; defer virtualization concerns — single-user personal notes |
| `ContentPane` currently shows read errors / empty states | Editor must preserve the no-selection and read-error states | Keep `ContentPane` as the shell (selection/error states) and mount `EditorHost` only when a note is successfully loaded |
