import { readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  test as base,
  type ElectronApplication,
  _electron as electron,
  type Page,
} from '@playwright/test'
import { MAIN_ENTRY, REPO_ROOT } from './support/paths'
import {
  listRecycleBin,
  purgeRecycleBin,
  type RecycleBinItem,
  waitForRecycleBinItem,
} from './support/recycleBin'
import { VaultFs } from './support/vaultFs'

export { type ElectronApplication, expect, type Locator, type Page } from '@playwright/test'
export type { RecycleBinItem } from './support/recycleBin'
export { VaultFs } from './support/vaultFs'

/**
 * Files to seed the fresh temp vault with: vault-relative path → content.
 * `{run}` in a path is replaced by the run id (use it for anything a test
 * sends to the Recycle Bin). A path ending in `/` creates an empty folder.
 */
export type VaultFiles = Record<string, string | Uint8Array>

/** Default vault: a root note and a folder with a nested note. */
export const DEFAULT_VAULT_FILES: VaultFiles = {
  'Welcome.md': '# Welcome\n\nSeeded by the E2E fixture.\n',
  'Projects/Plan.md': '# Plan\n\n- [ ] first task\n',
}

async function seedVault(vault: VaultFs, files: VaultFiles, runId: string): Promise<void> {
  for (const [rawPath, content] of Object.entries(files)) {
    const rel = rawPath.replaceAll('{run}', runId)
    if (rel.endsWith('/')) await vault.mkdir(rel.slice(0, -1))
    else await vault.write(rel, typeof content === 'string' ? content : Buffer.from(content))
  }
}

const APP_VERSION = (
  JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { version: string }
).version

/**
 * The app dir Electron is launched with. `electron <REPO_ROOT>` always runs
 * package.json `main` (out/), so for a `SLATE_E2E_OUT` build we drop a minimal
 * package.json (same name/version, `main` → that build's entry) into its dir.
 */
function appDir(): string {
  if (!process.env.SLATE_E2E_OUT) return REPO_ROOT
  const dir = join(MAIN_ENTRY, '..', '..')
  const pkg = { name: 'slate', productName: 'Slate', version: APP_VERSION, main: './main/index.js' }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
  return dir
}

type Launched = { app: ElectronApplication; page: Page }

/** A running Slate instance bound to a temp userData dir and temp vault. */
export type Slate = {
  app: ElectronApplication
  /** The main window. */
  page: Page
  vault: VaultFs
  userDataDir: string
  /** Unique id of this `playwright test` run (`slate-e2e-…`). */
  runId: string
  /** `${runId}-${name}`: a filename that is unique to this run (use for anything sent to the Recycle Bin). */
  uid: (name: string) => string
  /** Main-process stdout/stderr captured so far. */
  mainLog: () => string
  /** Quits the app (gracefully, then forcibly) and relaunches it on the same userData + vault. */
  restart: () => Promise<Page>
}

export type RecycleBin = {
  /** Recycle Bin items from this test run (name or deleted-from folder contains the run id). */
  list: () => Promise<RecycleBinItem[]>
  /** Polls until an item from this run named `name` (with or without extension) appears. */
  waitFor: (name: string, timeoutMs?: number) => Promise<RecycleBinItem>
  /** Removes this run's items from the Recycle Bin. Runs automatically after each test that uses this fixture. */
  purge: () => Promise<number>
}

type Options = {
  /** Vault contents. Override per file/describe: `test.use({ vaultFiles: { '{run}-a.md': 'body' } })`. */
  vaultFiles: VaultFiles
  /** Extra settings.json fields merged over the E2E defaults (e.g. `{ theme: 'light' }`). */
  settings: Record<string, unknown>
}

type Fixtures = {
  slate: Slate
  /** The main window (alias of `slate.page`). Replaces Playwright's browser page. */
  page: Page
  /** The temp vault on disk (alias of `slate.vault`). */
  vault: VaultFs
  /** Windows Recycle Bin helper scoped to this run. Skips the test on non-Windows. */
  recycleBin: RecycleBin
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function launch(
  userDataDir: string,
  vaultRoot: string | null,
  log: string[],
): Promise<Launched> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  env.SLATE_E2E_USER_DATA = userDataDir
  // null: no forced vault — the app uses settings.json (empty state when unset).
  if (vaultRoot !== null) env.SLATE_E2E_VAULT = vaultRoot

  const app = await electron.launch({ args: [appDir()], env, timeout: 60_000 })
  const proc = app.process()
  proc.stdout?.on('data', (d: Buffer) => log.push(d.toString()))
  proc.stderr?.on('data', (d: Buffer) => log.push(d.toString()))

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // Suppress the first-run patch-notes modal: mark this version as seen, reload.
  await page.evaluate((v) => localStorage.setItem('slate:lastSeenVersion', v), APP_VERSION)
  await page.reload()
  // English names, or the Turkish ones when a spec switched the language (i18n.spec).
  await page
    .getByRole('button', { name: /^(New note|Choose Folder|Yeni not|Klasör seç)$/ })
    .first()
    .waitFor({ timeout: 30_000 })
  return { app, page }
}

async function shutdown(app: ElectronApplication): Promise<void> {
  // `process()` throws once the app has exited on its own (e.g. a test quit it).
  const proc = (() => {
    try {
      return app.process()
    } catch {
      return null
    }
  })()
  if (proc !== null && proc.exitCode === null && proc.signalCode === null) {
    const exited = new Promise<boolean>((r) => proc.once('exit', () => r(true)))
    const waitExit = (ms: number) => Promise.race([exited, sleep(ms).then(() => false)])
    // Graceful first (flushes settings, closes the index DB). An unsaved-changes
    // prompt or anything else that holds the quit up falls through to exit(0).
    await app.evaluate(({ app: a }) => a.quit()).catch(() => undefined)
    if (!(await waitExit(5_000))) {
      await app.evaluate(({ app: a }) => setImmediate(() => a.exit(0))).catch(() => undefined)
      if (!(await waitExit(5_000))) proc.kill()
    }
  }
  await app.close().catch(() => undefined)
}

export const test = base.extend<Fixtures & Options>({
  vaultFiles: [DEFAULT_VAULT_FILES, { option: true }],
  settings: [{}, { option: true }],

  slate: async ({ vaultFiles, settings }, use, testInfo) => {
    const runId = process.env.SLATE_E2E_RUN_ID ?? `slate-e2e-${Date.now().toString(36)}`
    const tmp = await mkdtemp(join(tmpdir(), `${runId}-`))
    const userDataDir = join(tmp, 'userData')
    const vault = new VaultFs(join(tmp, 'vault'))
    await vault.mkdir('')
    await seedVault(vault, vaultFiles, runId)
    await vault.mkdir('../userData')
    await writeFile(
      join(userDataDir, 'settings.json'),
      JSON.stringify({
        vaultPath: vault.root,
        closeToTray: false,
        launchAtLogin: false,
        // Specs locate elements by their English names; the i18n spec overrides this.
        language: 'en',
        ...settings,
      }),
    )

    // `settings: { vaultPath: null }` launches with no vault configured (empty state).
    const forcedVault = settings.vaultPath === null ? null : vault.root
    const log: string[] = []
    let current = await launch(userDataDir, forcedVault, log)
    const slate: Slate = {
      get app() {
        return current.app
      },
      get page() {
        return current.page
      },
      vault,
      userDataDir,
      runId,
      uid: (name) => `${runId}-${name}`,
      mainLog: () => log.join(''),
      restart: async () => {
        await shutdown(current.app)
        current = await launch(userDataDir, forcedVault, log)
        return current.page
      },
    }

    await use(slate)

    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('main-process.log', { body: log.join(''), contentType: 'text/plain' })
    }
    await shutdown(current.app)
    await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch((err) =>
      console.warn(`[e2e] could not remove ${tmp}:`, err),
    )
  },

  page: async ({ slate }, use) => {
    await use(slate.page)
  },

  vault: async ({ slate }, use) => {
    await use(slate.vault)
  },

  recycleBin: async ({ slate }, use) => {
    test.skip(process.platform !== 'win32', 'Recycle Bin assertions are Windows-only')
    const bin: RecycleBin = {
      list: () => listRecycleBin(slate.runId),
      waitFor: (name, timeoutMs) =>
        waitForRecycleBinItem(
          slate.runId,
          (i) => i.name === name || i.name === name.replace(/\.[^.]+$/, ''),
          timeoutMs,
        ),
      purge: () => purgeRecycleBin(slate.runId),
    }
    await use(bin)
    await bin.purge()
  },
})
