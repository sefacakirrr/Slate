# Current: Phase 05 — User Acceptance Testing

## What to Do

All implementation (Phases 00–04) is complete and the automated gate is green (38 tests). Phase 05 is **user-driven**: the user runs `npm run dev` and walks the scenarios in `phases/PHASE-05-UAT.md`, reporting results. Claude records pass/fail per scenario, helps debug failures (offering `/debug-start` for non-trivial ones), and only the **user** marks the phase complete via the Sign-Off line.

## Full E2 implementation state

- **CM6 source-mode editor** replaces the read-only `<pre>` (`editor/EditorHost.tsx`, `editor/setup.ts`).
- **Languages**: `.md`/`.markdown` → markdown with fenced code-block highlighting (`@codemirror/language-data`); `.txt` → plain (`editor/language.ts`).
- **Save**: `Ctrl+S` → `vault:writeNote`; dirty tracking + amber dot indicator (`stores/editorStore.ts`).
- **Dirty-switch guard**: Save / Discard / Cancel prompt when leaving an unsaved note (`ConfirmDialog` 3-action, gated in `vaultStore.requestSelectFile`, rendered in `App`).
- **Path display**: `ContentPane` header shows the full on-disk path.
- **Tests**: 38 total (language 6, editorStore 8, + E1's 24). Two real bugs were caught and fixed during phase reviews (save-during-typing race; stale-dirty after delete) and are now locked by tests / guards.

## How to Run UAT

1. Have the user run `npm run dev` (HMR may already be live).
2. Walk the 10 scenarios in `phases/PHASE-05-UAT.md` in order; record each result in the Status column.
3. On any failure: capture the exact symptom + console output. Confident one-pipe fix → offer inline; otherwise suggest `/debug-start`.

## Watch For

- **Scenario 3 (persist across restart)** is the core proof — edit, Ctrl+S, close, reopen, content present.
- **Scenario 7/8/9 (dirty-switch Save/Discard/Cancel)** — verify Discard does NOT write the abandoned note to disk, and Save aborts the switch if the write fails.
- **Scenario 10 (`- [ ]` checklist)** — the text must persist as markdown; a *clickable* checkbox is NOT expected (that's the deferred WYSIWYG slice / backlog item).
- **Ctrl+S only when the editor is focused** — known MVP limitation (global keymap is E7).
- **Closing the epic**: after sign-off, run `/epic-close` for the cross-phase audit + SUMMARY.md. Then the recommended next work is the **Vault Management** epic (rename + folder create, both in backlog).
- **No commits** — project directive.
