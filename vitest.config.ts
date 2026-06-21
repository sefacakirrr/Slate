import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

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
})
