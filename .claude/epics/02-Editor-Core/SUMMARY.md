# Epic 02: Editor Core MVP — Summary

> **Duration**: 2026-06-13 (single session)
> **Phases**: 5 completed (00–04 implementation + reviewed; 05 UAT user-signed)
> **Status**: COMPLETE

---

## Results

The read-only `<pre>` is gone — Slate now has a real editor and the app is usable for taking notes. User-verified end-to-end in `npm run dev`.

- **CM6 source-mode editor** (`editor/EditorHost.tsx`, `editor/setup.ts`) — one long-lived `EditorView`, doc swapped on note change, language reconfigured via a `Compartment`, dark theme matching the UI.
- **Markdown + code highlighting** (`editor/language.ts`) — `.md`/`.markdown` → markdown with fenced code blocks highlighted per language (`@codemirror/language-data`); `.txt` → plain.
- **Save pipeline** (`stores/editorStore.ts`) — `Ctrl+S` → `vault:writeNote` (the E1 IPC that had no caller); dirty tracking + amber-dot indicator; baseline advances on save.
- **Dirty-switch guard** — Save / Discard / Cancel prompt when leaving an unsaved note (3-action `ConfirmDialog`, gated in `vaultStore.requestSelectFile`, rendered in `App`).
- **Path display** — `ContentPane` header shows the full on-disk path of the active note.
- **Tests** — 44 total (added: 6 `languageExtension`, 8 `editorStore`; +`vitest.config.ts` for renderer-store testing).

### Success Criteria (VISION §4) — 7/7

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | `.md` loads in a CM6 editor (not `<pre>`) | PASS | Ph00; user-verified |
| 2 | Typing sets a dirty indicator | PASS | Ph02; user-verified |
| 3 | `Ctrl+S` persists; clears dirty; survives restart | PASS | Ph02; user-verified (write/close/reopen) |
| 4 | Markdown + fenced code highlighted | PASS | Ph01; code-verified + user general OK |
| 5 | `.txt` plain, `.md`/`.markdown` markdown | PASS | Ph01; unit-tested + user |
| 6 | Dirty-switch Save/Discard/Cancel | PASS | Ph03; user-verified all three |
| 7 | check/typecheck/test/build green | PASS | Ph04; 44 tests |

---

## Learnings

### What Worked
- **Isolating CM6's imperative `EditorView` lifecycle in Phase 00** before layering languages/save/guard kept the React↔CM6 boundary clean — no recreate-on-render bugs.
- **Reusing E1's `vault:writeNote`** meant save needed zero IPC/contract change — just a store caller. The locked-but-extensible contract paid off.
- **Adversarial phase reviews caught two real bugs** that the automated gate could not: the save-during-typing race (false-clean dirty state) and stale-dirty after deleting the active note (deadlocked Save prompt). Both fixed and locked with tests/guards.

### What Didn't Work
- **Renderer-store unit testing needed infra that didn't exist** — `@renderer/api` is `window.api` (absent in Node) and modules use `@renderer/*` aliases. Required adding `vitest.config.ts` + mocking `@renderer/api`. Worth doing once; future renderer tests now have a path.
- **`@codemirror/language-data` ballooned the main renderer chunk to ~1.8 MB** (parsers code-split into on-demand chunks). Acceptable for a local desktop app; flagged for a possible trim later.

### For Future Epics
- Add a runtime smoke check where feasible — the gate is blind to layout/behavior; both E1 (blank-screen) and E2 relied on manual UAT to catch user-facing issues.
- Keep challenging "rich text" requests against the markdown-on-disk vision (see Deferred) — bold/italic/highlight fit; font size/weight/color/alignment do not.
- The `Ctrl+S` keymap only fires when the editor is focused; a global app keymap is E7 territory.

---

## Deferred Items

| Item | Reason | Follow-up |
|------|--------|-----------|
| WYSIWYG live-preview (hide markers, inline render) + interactive checklists | Highest-risk slice; deliberately sequenced after source-mode | Backlog (interactive checklists) / future editor epic |
| Tabs / multi-note workspace | Out of E2 scope | **E3 — Tabs & Workspace** (roadmap) |
| Image / attachment insertion | Out of E2 scope | **E6 — Attachments** (roadmap) |
| Highlight color palette | Out of E2 scope | **E9** (roadmap) |
| Bold / italic toolbar + shortcuts | Markdown-native, not in MVP | Backlog (Editor Core) |
| Font weight / size / color / alignment | **DECLINED** — not representable in portable markdown; conflicts with the local-first vision the user affirmed | Backlog (declined); revisit only via `/project-revise` |
| Autosave | Out of E2 scope | **E8 — Settings** |

---

## Out-of-Band Work During This Epic

Two vault features were implemented **directly** (outside the epic flow) while E2 was in progress, because they were small, contained slices the user needed for daily use:
- **Restore last-opened note on launch** (SettingsService `lastNotePath` + store wiring).
- **Rename note** incl. extension change (`VaultService.renameNote`, `vault:renameNote` IPC, Sidebar pencil → inline rename, +6 tests).

The companion **folder-management** feature remains in the backlog for a future **Vault Management** epic.

---

## Note on Commits

Per standing project directive, Epic 02 closes **uncommitted** — all work remains in the working tree. The first commit awaits an explicit user request.
