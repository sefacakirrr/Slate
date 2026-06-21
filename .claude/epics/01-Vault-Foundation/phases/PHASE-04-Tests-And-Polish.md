# Phase 04: Tests & Polish

> **Status**: COMPLETE
> **Dependencies**: Phase 03

---

## Goal

Add Vitest unit coverage for `VaultService` and `SettingsService`. Remove any debug code left from earlier phases. Run the full quality pipeline (`check`, `typecheck`, `build`) and ensure it's green. Document any conventions that emerged.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|---|---|---|
| 04.1 | Set up Vitest for main-process code — confirm `vitest` config picks up `src/**/*.test.ts`; add a `tests/` convention or co-locate `.test.ts` alongside service files (decide which during implementation, document) | done | `npm run test` discovers and runs at least one test |
| 04.2 | Write `VaultService.test.ts` — listing filter rules (`.md`/`.markdown`/`.txt` allowed; `_*` and `.*` excluded; nested folders walked); seeded via a temp-folder fixture | done | All listing cases pass; tests use `fs.mkdtemp` for isolation; cleanup after each test |
| 04.3 | Add path-safety tests — `..` traversal, absolute path outside the vault, valid relative path with `./` prefix — all behaviors covered | done | Each invalid case throws/returns error; valid case succeeds |
| 04.4 | Add atomic-write tests — successful write produces canonical file with expected content; simulated failure (mock `rename` to throw) leaves canonical file untouched; write-then-read returns matching bytes | done | All three cases pass |
| 04.5 | Write `SettingsService.test.ts` — persists vault path; reads back the same value; missing settings.json returns `null` from `getVaultPath`; overwrites cleanly | done | All cases pass against a temp `userData` override path |
| 04.6 | Remove the temporary debug button from `App.tsx` (the `// TODO PHASE-04: remove` marker from Phase 00) and any leftover `console.log` calls in store actions used for debugging | done | `grep -r "TODO PHASE-04" src/` returns nothing; no stray `console.log` in production paths (debug button was already removed in Phase 01/01.7) |
| 04.7 | Run the full quality pipeline and fix anything red: `npm run check && npm run typecheck && npm run test && npm run build` | done | All four commands exit 0; `out/` builds cleanly; 20 tests pass; lint+format clean; types pass |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/main/services/VaultService.test.ts` | Create | Listing + path safety + atomic write unit tests |
| `src/main/services/SettingsService.test.ts` | Create | Persistence unit tests |
| `src/renderer/App.tsx` | Modify | Remove debug button |
| `src/renderer/stores/vaultStore.ts` | Modify | Remove debug logs (if any) |
| (vitest config) | Maybe modify | Only if Vitest needs additional include paths for main-process tests |

---

## Verification

Consult `.claude/CLAUDE.md` for the standard commands. All of these must be green before Phase 04 can be marked COMPLETE:

- `npm run check` — Biome lint + format, zero issues
- `npm run typecheck` — both `node` and `web` configs green
- `npm run test` — Vitest run, all unit tests pass
- `npm run build` — production build succeeds in `out/`
- `npm run dev` — app launches; no console errors; no leftover debug button

---

## Notes

- **Test layout decision** (co-located vs `tests/` folder): if co-located, ensure `.test.ts` files are excluded from the production build's rollup input. With electron-vite's default config they shouldn't be picked up unless referenced from an entry — verify by inspecting `out/` after build.
- **Vitest target environment**: services use Node APIs, so the test environment should be Node (Vitest default). No JSDOM needed for these tests.
- **Coverage target**: not enforced. Aim for "the service's public surface has at least one happy-path test and one obvious-failure test." Don't chase a coverage number.
- **No renderer tests in this epic.** UI tests are a different shape (RTL, JSDOM) and aren't worth setting up just for E01's tree component. Defer to a later epic that introduces them properly.

---

## Review Log

### 2026-06-12 — Phase Review: APPROVED (informal, uncommitted)

**Tasks**: 7/7 genuinely complete
**Quality**: PASS — `npm run check`, `npm run typecheck`, `npm run test` (20 passed, 2 files), `npm run build` all green
**Integration**: tests exercise the real service surfaces against `fs.mkdtemp` temp dirs; no mocks except the controlled `rename` injection
**Plan integrity**: OK — implementation phases 00–04 complete; only Phase 05 (UAT) remains
**Commit**: none (user directive)

**Findings**:
- **Test layout decision**: co-located `*.test.ts` next to the service files; no separate `vitest.config` needed (Vitest defaults: Node env, `**/*.test.ts` glob). Verified test files do NOT leak into `out/` — electron-vite uses explicit rollup inputs (`index.ts`/`index.html`).
- **Atomic-write failure injection**: `vi.spyOn` on `node:fs/promises` `rename` fails ("Cannot redefine property" — non-configurable builtin export). Switched to `vi.mock` factory + `vi.hoisted` control flag that wraps the real `rename` and rejects only when toggled. Other `writeNote` tests use the real rename. This pattern is the reusable way to fault-inject node builtins in this project.
- **04.6 was already satisfied**: debug button removed back in Phase 01 (task 01.7); `grep "TODO PHASE-04"` and `grep "console.log"` over `src/` both empty. Store `console.error` calls are failure-path reporting, intentionally kept.

**Coverage**: VaultService — listing filter/exclusion/nesting/sort, path safety (`..`, absolute-outside, `./` prefix), atomic write (round-trip, full overwrite, rename-failure integrity), createNote `file-exists`, deleteNote missing-tolerance. SettingsService — persist/read-back, cross-instance persistence, overwrite, missing→null, corrupt→null.
