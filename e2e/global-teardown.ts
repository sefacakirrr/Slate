import { purgeRecycleBin } from './support/recycleBin'

/** Safety net: remove anything this run left in the OS Recycle Bin. */
export default async function globalTeardown(): Promise<void> {
  const runId = process.env.SLATE_E2E_RUN_ID
  if (process.platform !== 'win32' || !runId) return
  const removed = await purgeRecycleBin(runId)
  if (removed > 0) console.log(`[e2e] removed ${removed} leftover Recycle Bin item(s) for ${runId}`)
}
