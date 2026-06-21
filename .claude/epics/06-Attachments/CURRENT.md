# Current: Phase 00 — AttachmentService

## What to Do

Work through the tasks in `phases/PHASE-00-AttachmentService.md`.

## Context

- VaultService already has the atomic write pattern (temp → rename) — follow it
- `node:crypto` already imported in VaultService — use `createHash('sha256')`
- Constructor takes `getVaultPath: () => string | null` — vault path is dynamic
- `_attachments/` directory must be created on first write (mkdir -p equivalent)

## Watch For

- Don't import VaultService itself — just receive the vault path getter function to avoid circular deps
- Atomic write: write to temp file in `_attachments/` then rename (same-directory rename is atomic on all platforms)
- Extension extraction: handle files with no extension, multiple dots, edge cases
- Size check must happen BEFORE reading full buffer into memory (caller responsibility) — but service should still validate as defense-in-depth
