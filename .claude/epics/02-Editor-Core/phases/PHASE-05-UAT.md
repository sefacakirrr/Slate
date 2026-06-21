# Phase 05: User Acceptance Testing

> **Status**: COMPLETE — user ran `npm run dev` and verified the editor end-to-end (write, Ctrl+S, close/reopen persistence, rename, dirty-switch Save/Discard/Cancel). Signed off 2026-06-13.
> **Dependencies**: All implementation phases (00–04)
> **Note**: Only the user can mark this phase complete.

---

## Goal

User verifies the editor works end-to-end against VISION success criteria — the first time the app can actually write and persist notes.

---

## Test Scenarios

| # | Scenario | Expected Result | Status |
|---|----------|-----------------|--------|
| 1 | Select a `.md` note in the sidebar | Content opens in an editable CM6 editor (not a `<pre>`) | CODE-VERIFIED (ContentPane mounts EditorHost) — runtime not observed |
| 2 | Type some text | Buffer updates; a dirty indicator appears in the header | CODE-VERIFIED (updateListener→setDraft→isDirty→dot) — runtime not observed |
| 3 | Press `Ctrl+S` | Indicator clears; file on disk reflects the new content | CODE-VERIFIED (keymap→saveActiveNote→vault:writeNote; writeNote atomic, unit-tested) — runtime not observed |
| 4 | Close the app, reopen, open the same note | Saved content is present (persisted) | CODE-VERIFIED (writeNote→disk; readNote on reopen; both unit-tested) — runtime not observed |
| 5 | Open a note containing a fenced ```` ```ts ```` code block | The code block is syntax-highlighted | CODE-VERIFIED (markdown({codeLanguages})) — visual highlighting not observed |
| 6 | Open a `.txt` file | Opens in plain mode, no markdown errors | CODE-VERIFIED (languageExtension→[] for .txt; unit-tested) — runtime not observed |
| 7 | Edit a note, then click a different note (Save) | Prompt appears; choosing Save persists then opens the target | CODE-VERIFIED (requestSelectFile gate → saveAndProceed) — runtime not observed |
| 8 | Edit a note, click another (Discard) | Target opens; first note's edits not written to disk | CODE-VERIFIED (discardAndProceed; no write) — runtime not observed |
| 9 | Edit a note, click another (Cancel) | Stays on the current note with edits intact | CODE-VERIFIED (cancelPendingSelection) — runtime not observed |
| 10 | Create a note, type a `- [ ]` checklist line, save, reopen | The `- [ ]` text persists as markdown (clickable toggle NOT expected — that's a later slice) | CODE-VERIFIED (saved as plain markdown text) — runtime not observed |

---

## Acceptance Checklist

From VISION.md Section 4 — Success Criteria:

- [ ] Selecting a note loads it into a CM6 editor (not a `<pre>`)
- [ ] Typing sets a visible dirty indicator
- [ ] `Ctrl+S` writes to disk via `vault:writeNote`; indicator clears; content persists across restart
- [ ] Markdown + fenced code blocks are syntax-highlighted
- [ ] `.txt` opens in plain mode; `.md`/`.markdown` in markdown mode
- [ ] Dirty-switch prompts Save / Discard / Cancel and each behaves correctly
- [ ] `npm run check && npm run typecheck && npm run test && npm run build` all green; no runtime console errors

---

## Sign-Off

- [x] **User Approved** — Date: 2026-06-13 (user verified write/Ctrl+S/persistence/rename/dirty-switch live in `npm run dev`; reported all scenarios working)

---

## Review Log

_Populated by /epic-phase-review._
