/**
 * Single entry point for renderer code to access the main-process API.
 * Renderer modules should always import from `@renderer/api`, never reference
 * `window.api` directly — that keeps the IPC surface narrow and swappable.
 */
export const api = window.api
