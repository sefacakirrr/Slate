# Phase 04: Tests & Polish

> **Status**: NOT STARTED
> **Dependencies**: Phase 03

---

## Goal

Lock the testable logic with unit tests, remove any debug scaffolding, and bring the full quality pipeline green before UAT.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 4.1 | Unit-test `languageExtension(path)` — `.md`/`.markdown` → markdown, `.txt` → plain, unknown → plain | done | `language.test.ts` — 6 tests covering md/markdown/txt/unknown/no-ext/case |
| 4.2 | Unit-test the dirty/save logic that is pure (dirty transitions, baseline reset, save-clears-dirty) — extract pure helpers from the store if needed | done | `editorStore.test.ts` — 8 tests (loadNote/setDraft dirty math, save success/failure/no-op/no-selection, save-during-typing race). `@renderer/api` mocked; needed `vitest.config.ts` aliases |
| 4.3 | Remove any debug logging / temporary scaffolding added during 00–03 | done | grep: no `console.log`/`debugger`; only intentional `console.error` on write/delete failures |
| 4.4 | Confirm no regressions in E1 unit tests (Settings/Vault) | done | SettingsService (9) + VaultService (15) still green within the 38-test suite |
| 4.5 | Full gate: `npm run check && npm run typecheck && npm run test && npm run build` all exit 0 | done | All green — check, typecheck, test (38), build |
| 4.6 | Show the active note's full on-disk path in the `ContentPane` header (vault root + vault-relative path), so the user can see where the file is saved | done | Header shows absolute path (`vaultPath` + OS-correct separator + relative); `truncate` + `title` for long paths |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/editor/language.test.ts` | Create | Cover `languageExtension` branches |
| `src/renderer/stores/editorStore.test.ts` (or helper test) | Create | Cover dirty/save logic |
| `src/renderer/components/ContentPane.tsx` | Modify | Show full on-disk path in the header (task 4.6) |
| (various) | Modify | Remove debug scaffolding |

---

## Verification

All four gate commands exit 0. New tests pass. No runtime console errors when launching `npm run dev` and editing/saving.

---

## Notes

- The CM6 `EditorView` itself is hard to unit-test without a DOM harness (jsdom is not configured for the renderer). Focus tests on **pure logic** — `languageExtension`, dirty/save reducers — not on the imperative view. Manual UAT (Phase 05) covers the view behavior.
- If the dirty/save logic is entangled in the store, extract pure functions so they're testable without mounting CM6.

---

## Review Log

### 2026-06-13 — Phase Review: APPROVED

**Tasks**: 6/6 genuinely complete (0 stubs, 0 partial)
**Quality**: PASS — check / typecheck / test (38, +14 this phase) / build all green
**Integration**: connected — `language.ts` ← `EditorHost`; `editorStore` ← `EditorHost` + `ContentPane`; path display in `ContentPane`. Test files are dev-only (not bundled — Vite input is `index.html`). Added `vitest.config.ts` (alias resolution for `@renderer`/`@shared`) to enable renderer-store tests in Node.
**Plan integrity**: OK (final implementation phase) — all 7 VISION success criteria are covered by phases 00–04; Phase 05 UAT verifies end-to-end. No coverage gaps.
**Commit**: uncommitted (project directive)

**Findings**:
- `language.test.ts` verifies branch *selection* (plain vs markdown language) as a proxy — actual syntax highlighting is CM6's responsibility, confirmed in UAT.
- `editorStore.test.ts` covers pure logic incl. the save-during-typing race; the CM6 view, `Ctrl+S` keymap, and dirty-switch orchestration are UAT-covered, not unit (no jsdom for the renderer — documented).
- `vitest.config.ts` is new test infra (beyond the phase's originally listed files) — needed because the renderer `api` is `window.api` (absent in Node) and modules use `@renderer/*` aliases; `@renderer/api` is mocked in the store test.

**Deferred**: None
