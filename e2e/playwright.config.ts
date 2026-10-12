import { randomBytes } from 'node:crypto'
import { defineConfig } from '@playwright/test'

// One id per `playwright test` run. Set here (the config is evaluated in the
// runner before workers start, and workers inherit the env) so every worker and
// the global teardown agree on it. Test files that touch the OS Recycle Bin put
// it in their filenames; teardown only ever removes Recycle Bin items carrying it.
process.env.SLATE_E2E_RUN_ID ??= `slate-e2e-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: './.results',
  // Electron app per test, one at a time: specs share the desktop session and
  // the OS Recycle Bin, so parallel runs would race.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
