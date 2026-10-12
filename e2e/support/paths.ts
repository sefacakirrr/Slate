import { join, resolve } from 'node:path'

/** Repo root (the Electron app dir: package.json `main` points at out/main/index.js). */
export const REPO_ROOT = resolve(__dirname, '..', '..')

/**
 * Built main-process entry; must exist before the suite runs. `SLATE_E2E_OUT`
 * selects another build dir (`electron-vite build --outDir <dir>`) so parallel
 * test runs don't overwrite each other's build.
 */
export const MAIN_ENTRY = join(REPO_ROOT, process.env.SLATE_E2E_OUT ?? 'out', 'main', 'index.js')
