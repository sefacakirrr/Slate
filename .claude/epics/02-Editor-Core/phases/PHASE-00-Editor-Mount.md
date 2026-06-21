# Phase 00: Editor Mount & Doc Lifecycle

> **Status**: NOT STARTED
> **Dependencies**: None

---

## Goal

Replace the read-only `<pre>` in `ContentPane` with a live CodeMirror 6 `EditorView` that loads the selected note's content, swaps its document when the selection changes, and tears down cleanly — the highest-risk integration, validated before any save/highlighting logic.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 0.1 | Add `@codemirror/language-data` to dependencies (`npm install`) | done | In `devDependencies` (matches codemirror/lang-markdown; Vite bundles them). `dependencies` stays native-only |
| 0.2 | Create `src/renderer/editor/setup.ts` — base extensions factory (`basicSetup`, history, a dark theme matching the UI) returning an extension array | done | `baseExtensions()` + `languageCompartment` (empty in Ph00); no React imports |
| 0.3 | Create `src/renderer/editor/EditorHost.tsx` — owns one `EditorView`, mounts into a ref'd div on mount, destroys on unmount | done | One `EditorView`; created in `[]`-deps effect, `view.destroy()` in cleanup |
| 0.4 | Load content: when the host receives note content, set the editor doc to it | done | Content-driven effect seeds the doc on mount |
| 0.5 | Doc swap on selection change: replace the doc via a transaction when the active note changes (do not recreate the view) | done | `view.dispatch` swap on `content` change + cursor reset to top; view never recreated. NOTE: keyed on `content` not `path` (biome useExhaustiveDependencies); `path` identity returns in Ph02 (save target) |
| 0.6 | Mount `EditorHost` from `ContentPane` (preserve no-selection and read-error states as the surrounding shell) | done | `ContentPane` keeps no-selection + error shells; mounts `EditorHost` for loaded notes |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add `@codemirror/language-data` |
| `src/renderer/editor/setup.ts` | Create | Base CM6 extensions + theme |
| `src/renderer/editor/EditorHost.tsx` | Create | Imperative `EditorView` lifecycle wrapper |
| `src/renderer/components/ContentPane.tsx` | Modify | Mount `EditorHost` for loaded notes; keep state shells |

---

## Verification

`npm run check && npm run typecheck && npm run build` green. Manual: click a note → editor shows content; switch notes → content swaps; deselect/error states still render. No console errors; no duplicated editors after HMR/re-render.

---

## Notes

- One long-lived `EditorView`. Replace the document with `view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })`, not by recreating the view.
- The editor is editable in this phase, but edits are **not saved yet** (Phase 02) and **not tracked as dirty**. That's expected — this phase only proves the lifecycle.
- Keep `setup.ts` free of language/markdown concerns — those arrive in Phase 01 as an added extension.

---

## Review Log

### 2026-06-13 — Phase Review: APPROVED

**Tasks**: 6/6 genuinely complete (0 stubs, 0 partial)
**Quality**: PASS — check / typecheck / test (24) / build all green
**Integration**: connected — `EditorHost` ← `ContentPane` ← `App` (reachable from production)
**Plan integrity**: OK
**Commit**: uncommitted (project directive — "no commits until ready", as in E1)

**Findings**:
- `@codemirror/language-data` installed (devDependencies) but unexercised until Phase 01 — expected forward hook.
- `languageCompartment` exported; consumed internally as `.of([])`. Phase 01 reconfigures it; `EditorHost` will import it then.
- Editor is editable but edits are inert (no save/dirty) — explicitly Phase 02; documented, not a defect.
- Doc-swap keyed on `content` (not `path`) per biome `useExhaustiveDependencies`. Switching between two notes with identical content is a no-op (harmless). The dropped `path` prop is not needed for Phase 02 save — `vaultStore.selectedPath` is the save target.
- Runtime-visual behavior (editor fills the pane, content renders, swap on switch, dark theme) is not machine-verifiable; rolls up to UAT (Phase 05).
