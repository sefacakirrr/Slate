import { resolve } from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

/**
 * Vitest runs in the default Node environment. Renderer-store tests stub
 * `@renderer/api` (which is `window.api`) via `vi.mock`, so no DOM is needed.
 * Aliases mirror the renderer build so `@renderer`/`@shared` imports resolve.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  // e2e/ holds Playwright specs (run via `npm run test:e2e`), not Vitest tests.
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
})
