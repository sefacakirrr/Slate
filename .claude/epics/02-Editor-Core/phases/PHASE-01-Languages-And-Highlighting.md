# Phase 01: Language Modes & Code Highlighting

> **Status**: NOT STARTED
> **Dependencies**: Phase 00

---

## Goal

Give the editor markdown awareness: `.md`/`.markdown` open in markdown mode with fenced code blocks syntax-highlighted by language; `.txt` opens in plain mode.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 1.1 | Create `src/renderer/editor/language.ts` — `languageExtension(path)` returning the right extension(s) by file extension | done | Pure fn: `.md`/`.markdown` → markdown, else `[]` (plain). Unit-testable; tested in Ph04 |
| 1.2 | Wire `@codemirror/lang-markdown` `markdown({ codeLanguages })` using `@codemirror/language-data`'s `languages` for fenced blocks | done | `markdown({ codeLanguages: languages })` in `language.ts` |
| 1.3 | Apply the per-path language extension in `EditorHost` (reconfigure on note switch via a compartment) | done | `[path]`-effect dispatches `languageCompartment.reconfigure(languageExtension(path))`; view not recreated. `path` prop now genuinely used (no biome dep complaint) |
| 1.4 | Confirm unknown/missing code-fence languages degrade gracefully (no thrown error) | done | lang-markdown leaves unrecognized fences as plain text; `codeLanguages` array match-or-skip, no throw |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/editor/language.ts` | Create | Map file path → CM6 language extension |
| `src/renderer/editor/setup.ts` | Modify | Expose a language compartment for reconfiguration |
| `src/renderer/editor/EditorHost.tsx` | Modify | Reconfigure language on note switch |

---

## Verification

`npm run check && npm run typecheck && npm run build` green. Manual: open a `.md` with a fenced code block → highlighted; open a `.txt` → plain, no errors; switch between them → mode updates.

---

## Notes

- Use a CM6 `Compartment` for the language so it can be reconfigured per note without tearing down the view.
- `@codemirror/language-data` lazy-loads language parsers — a brief unstyled flash before a code block restyles is acceptable.
- Keep highlighting source-mode: markdown markers (`#`, `**`, `- [ ]`) stay visible and styled, not hidden.

---

## Review Log

### 2026-06-13 — Phase Review: APPROVED

**Tasks**: 4/4 genuinely complete (0 stubs, 0 partial)
**Quality**: PASS — check / typecheck / test (24) / build all green
**Integration**: connected — `language.ts` → `EditorHost` (via `languageCompartment.reconfigure`) → `ContentPane` (`path={selectedPath}`) → `App`
**Plan integrity**: OK
**Commit**: uncommitted (project directive)

**Findings**:
- Renderer main chunk grew to ~1.8 MB; `@codemirror/language-data`'s per-language parsers are code-split into on-demand chunks (clojure, perl, sql, css, javascript, …) — they load only when a matching fence appears. Acceptable for a local-first desktop app (loads from disk, no network). Candidate for a later trim (curated language subset / `manualChunks`) only if startup latency ever becomes noticeable. The language-data choice was made deliberately in the /epic-create dialogue.
- Task 1.4 (unknown fence degrades gracefully) is a library-guaranteed property of `lang-markdown` (parser attached only on `codeLanguages` match, else plain text, no throw), not bespoke code — runtime confirmation rolls to UAT.
- `EditorHost` has no content-change callback yet; Phase 02 adds the `updateListener` + `Ctrl+S` keymap + store wiring. Expected, not a gap.
