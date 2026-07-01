# Epic 13 — Auto-Save

## Problem

Users must manually save (Ctrl+S) after editing. Forgetting to save loses work. Every modern notes app (Apple Notes, Notion, Obsidian) saves automatically — users expect it.

## Solution

A settings toggle ("Auto-save") that, when enabled, automatically persists the active note after a short debounce (e.g. 1 second of inactivity). Manual save (Ctrl+S) remains functional regardless of the toggle state.

## Scope

- **Settings toggle**: `autoSave: boolean` in SettingsService (default: `true` for new installs).
- **Debounced write**: on every editor content change, reset a debounce timer. On expiry, call the existing `writeNote` path.
- **Dirty indicator**: when auto-save is on, the "unsaved dot" still appears momentarily but clears on save. When off, behaves as today.
- **No conflict**: if the file changes on disk (chokidar event) while a debounced write is pending, cancel the pending write and reload.

## Non-goals

- Undo history persistence across sessions (separate feature).
- Conflict resolution UI for multi-device sync (out of scope — local-first single device).

## Success criteria

- With auto-save enabled, closing a note mid-edit and reopening it shows the latest content.
- No duplicate writes or write storms during fast typing.
- Ctrl+S still works as an immediate save regardless of toggle.
