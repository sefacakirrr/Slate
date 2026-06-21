# Phase 05: User Acceptance Testing

> **Status**: COMPLETE
> **Dependencies**: All implementation phases (00–04)
> **Note**: Only the user can mark this phase complete.

---

## Goal

User verifies full-text search end-to-end against the VISION success criteria.

---

## Test Scenarios

| # | Scenario | Expected Result | Status |
|---|----------|-----------------|--------|
| 1 | Press `Ctrl+Shift+F`, type a word you know is in several notes | Panel opens; ranked results with highlighted snippets appear quickly | PASS |
| 2 | Click a result | That note opens as the active tab (focused, not duplicated if already open) | PASS |
| 3 | Edit a note, add a unique word, save (Ctrl+S), search that word | The note appears in results without restarting the app | PASS |
| 4 | Delete a note in-app, search a word that was only in it | It no longer appears in results | PASS |
| 5 | Rename an open note, search a word from its body | It appears under the new name | PASS |
| 6 | Edit a note's file **outside** the app, relaunch, search the new word | Reconciliation picks it up; the new content is searchable | PASS |
| 7 | Search a large-ish vault (aim ~500 notes); type a malformed query (`"` , `foo(`, `*`) | Results return in < 2s; malformed input shows no results / no crash, never an error | PASS |
| 8 | Inspect the vault folder and `userData` | `userData/index.db` exists; the vault contains only markdown (no index files) | PASS |
| 9 | Manual rebuild (no UI affordance in v1): open devtools console, run `await window.api.index.rebuild()`, then re-run a known query | Returns `{ ok: true }`; the same results as before the rebuild (index reconstructed from disk identically) | PASS |
| 10 | Fresh-vault-pick gap (known limitation): pick a *different* vault with existing notes mid-session, then search a word from those notes — without relaunching | KNOWN GAP: results are empty until you relaunch the app (`setVaultPath` doesn't trigger reconciliation). After relaunch, the same query finds them. Confirm this matches accepted v1 behavior, or pull the backlog fix forward | ACCEPTED (known gap, v1) |

---

## Acceptance Checklist

From VISION.md Section 4 — Success Criteria:

- [x] Query returns ranked results with snippets in < 2s on a ~500-note corpus
- [x] Clicking a result opens that note in a tab (E3 workspace)
- [x] In-app save/create/delete/rename updates results without restart
- [x] External change reflected after relaunch (reconciliation)
- [x] Index lives in `userData`, not the vault; vault is clean markdown
- [x] Manual rebuild reconstructs the index with identical results (via devtools — no UI affordance in v1)
- [x] `npm run check && typecheck && test && build` green; no console errors

---

## Sign-Off

- [x] **User Approved** — Date: 2026-06-15

Scenarios 1–9 PASS. Scenario 10 (fresh-vault-pick) accepted as a known v1 limitation
(tracked in backlog). Criterion 6 (manual rebuild) verified via `window.api.index.rebuild()`
in devtools; a user-facing affordance is backlog ([feature] low).

---

## Review Log

_UAT phase — closed via /epic-close, not /epic-phase-review._
