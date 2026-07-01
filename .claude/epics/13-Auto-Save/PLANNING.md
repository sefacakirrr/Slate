# Epic 13 — Auto-Save: Planning

## Phases

### Phase 1: Settings & Core Logic

| # | Task | File(s) | Estimate |
|---|------|---------|----------|
| 1 | Add `autoSave` boolean to SettingsService schema (default `true`) | `src/main/services/SettingsService.ts` | 15 min |
| 2 | Expose `autoSave` via IPC (get/set) | `src/main/ipc/handlers.ts`, `src/shared/ipc.ts`, `src/preload/index.ts` | 20 min |
| 3 | Add auto-save toggle in SettingsPanel UI | `src/renderer/components/SettingsPanel.tsx` | 20 min |
| 4 | Implement debounced save in editor store | `src/renderer/stores/noteStore.ts` (or new `useAutoSave` hook) | 30 min |
| 5 | Cancel pending save on file-changed event (chokidar reconcile) | `src/renderer/stores/noteStore.ts` | 15 min |

### Phase 2: Polish & Tests

| # | Task | File(s) | Estimate |
|---|------|---------|----------|
| 6 | Dirty indicator clears after auto-save fires | `src/renderer/components/` (title bar or tab) | 15 min |
| 7 | Ctrl+S flushes pending debounce immediately | `src/renderer/stores/noteStore.ts` | 10 min |
| 8 | Unit tests for debounce logic | `src/renderer/stores/noteStore.test.ts` | 20 min |
| 9 | Integration smoke test (write → verify file on disk) | `src/main/services/` test | 20 min |

## Key decisions

- **Debounce interval**: 1000 ms. Not configurable in Phase 1 — keep settings surface small.
- **Default on**: new installs get `autoSave: true`. Existing installs get `true` as well (additive, non-breaking).
- **No conflict resolution**: if chokidar fires while debounce is pending, cancel the write and reload from disk. This is the simple, correct behavior for single-device local-first.

## Dependencies

- None. Self-contained — uses existing `writeNote` IPC and SettingsService.

## Risk

- Low. The debounce + cancel-on-external-change pattern is well-understood.
