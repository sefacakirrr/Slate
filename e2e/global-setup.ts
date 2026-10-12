import { existsSync } from 'node:fs'
import { MAIN_ENTRY } from './support/paths'

/** The suite runs against the built app; `npm run test:e2e` builds first. */
export default function globalSetup(): void {
  if (!existsSync(MAIN_ENTRY)) {
    throw new Error(
      `Built app not found at ${MAIN_ENTRY}. Run "npm run test:e2e" (builds first) or "npm run build".`,
    )
  }
}
