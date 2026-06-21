# Current: Phase 05 — User Acceptance Testing

## What to Do

This is the final phase of Epic 01. All implementation (Phases 00–04) is complete and the automated gate is green. Phase 05 is **user-driven**: the user runs `npm run dev` and walks the 9 test scenarios in `phases/PHASE-05-UAT.md`, reporting results. Claude records pass/fail per scenario, helps debug any failure (offering `/debug-start` for non-trivial ones), and only the **user** marks the phase complete via the Sign-Off line.

## Context from Phases 00–04

- **Full E1 surface is live**: settings persistence + folder picker (Ph01), vault read + sidebar/content pane (Ph02), vault write/create/delete + confirm dialog (Ph03), unit tests + clean pipeline (Ph04).
- **8 IPC channels** all wired to real services. `notImplemented` stub fully removed.
- **20 unit tests pass**; `check`/`typecheck`/`test`/`build` all exit 0.
- **No watcher** — external file changes need the sidebar "Refresh" button (chokidar is Epic 02, by design).

## Decisions Carried Forward

- **No commits until the project is ready** — user directive. The epic completes without a git commit; PLANNING.md Commit column reads "uncommitted" throughout.
- **`window.api` name stays.** Extensions `.md`/`.markdown`/`.txt`.
- The prior phases' "user-facing verification" notes were never run by the user — Phase 05 is where they all get exercised together for the first time.

## How to Run UAT

1. Have the user run `npm run dev`.
2. For scenario 1 (fresh-launch EmptyState), the user must first delete `%APPDATA%\Slate\settings.json` (Windows `userData` path; `app.setName('Slate')` puts it under `...\Roaming\Slate\`). Offer the exact path.
3. Walk scenarios 1→9 in order; record each result in the phase file's Status column.
4. On any failure: capture the exact symptom + console output. If it's a confident one-pipe fix, offer to fix inline; otherwise suggest `/debug-start`.

## Watch For

- **Scenario 9** (`readNote('../something.md')`) must return `{ ok: false, error: 'path-outside-vault' }` — this is the security boundary, verify the exact behavior.
- **Scenario 8** (Refresh) proves the no-watcher decision is acceptable — externally-added file appears only after clicking Refresh.
- **EmptyState→shell flash**: there's a brief blank-screen guard while the first settings read resolves and during pick. If the user reports a flash, that's the known `loading && vaultPath === null` guard, not a bug.
- **Closing the epic**: after the user signs off, run `/epic-close` for the cross-phase audit and SUMMARY.md.
