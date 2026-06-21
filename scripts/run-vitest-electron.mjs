/**
 * Runs Vitest under Electron's Node runtime instead of the system Node.
 *
 * Why: `better-sqlite3` is a native module rebuilt against Electron's Node ABI
 * (so the app can use it). That same binary will NOT load under the system Node
 * (different NODE_MODULE_VERSION), which is what plain `vitest` uses — so any
 * test importing `better-sqlite3` (IndexService, SearchService) would fail to
 * load the module. Launching Electron with ELECTRON_RUN_AS_NODE=1 gives us a
 * Node process at Electron's ABI, where the one rebuilt binary loads cleanly.
 * The pure-logic / node:fs tests run fine under it too, so the whole suite stays
 * unified under a single `npm test`.
 *
 * This wrapper itself runs under the system Node and only spawns Electron — it
 * never imports the native module, so there's no ABI conflict here.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
// The `electron` package resolves to the executable path when required from Node.
const electronPath = require('electron')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vitestBin = resolve(root, 'node_modules/vitest/vitest.mjs')

const child = spawn(electronPath, [vitestBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})

child.on('exit', (code) => process.exit(code ?? 0))
child.on('error', (err) => {
  console.error('Failed to launch Electron for Vitest:', err)
  process.exit(1)
})
