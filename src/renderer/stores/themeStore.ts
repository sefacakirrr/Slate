import { api } from '@renderer/api'
import {
  BUILTIN_THEMES,
  type ColorTheme,
  validateImportedTheme,
} from '@renderer/editor/colorThemes'
import type { ThemeMode } from '@shared/types'
import { create } from 'zustand'

const CUSTOM_THEMES_KEY = 'slate:customThemes'
const COLOR_THEME_KEY = 'slate:colorThemeId'
const BG_IMAGE_KEY = 'slate:backgroundImage'
const BG_OPACITY_KEY = 'slate:backgroundOpacity'
const BG_POSITION_KEY = 'slate:backgroundPosition'
const BG_SCALE_KEY = 'slate:backgroundScale'

type ThemeState = {
  theme: ThemeMode
  resolved: 'dark' | 'light'
  colorThemeId: string
  customThemes: ColorTheme[]
  backgroundImage: string | null
  backgroundOpacity: number
  backgroundPosition: number
  backgroundScale: number
  fontSize: number
  loadTheme: () => Promise<void>
  setTheme: (theme: ThemeMode) => Promise<void>
  applyFromExternal: (theme: ThemeMode) => void
  setColorTheme: (id: string) => void
  importTheme: (json: unknown) => ColorTheme | null
  removeCustomTheme: (id: string) => void
  /** Returns false when the image could not be stored (applies for this session only). */
  setBackgroundImage: (dataUrl: string | null) => boolean
  setBackgroundOpacity: (opacity: number) => void
  setBackgroundPosition: (position: number) => void
  setBackgroundScale: (scale: number) => void
  setFontSize: (size: number) => void
  increaseFontSize: () => void
  decreaseFontSize: () => void
  /** Re-reads the colour theme choice another window stored (localStorage `storage` event). */
  syncFromStorage: () => void
  allThemes: () => ColorTheme[]
  getActiveColorTheme: () => ColorTheme
}

function resolveTheme(theme: ThemeMode): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function applyTheme(resolved: 'dark' | 'light'): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.classList.toggle('light', resolved === 'light')
}

function applyFontSize(size: number): void {
  document.documentElement.style.fontSize = `${size}px`
}

function loadCustomThemes(): ColorTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ColorTheme[]
  } catch {
    return []
  }
}

function saveCustomThemes(themes: ColorTheme[]): void {
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes))
}

/** A stored number, or `fallback` when absent/invalid. `Number(x) || d` turned a saved 0 into d. */
function storedNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  if (raw === null || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/** The two built-in defaults follow the light/dark mode; any other pick is kept as chosen. */
const DEFAULT_THEME_IDS: Record<'dark' | 'light', string> = {
  dark: 'default-dark',
  light: 'default-light',
}

/**
 * One OS colour-scheme listener per renderer, installed on first load whatever
 * the mode: it acts only while the mode is System, so switching to System later
 * in the session still follows the OS.
 */
let systemListenerInstalled = false

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark',
  resolved: 'dark',
  colorThemeId: localStorage.getItem(COLOR_THEME_KEY) || 'default-dark',
  customThemes: loadCustomThemes(),
  backgroundImage: localStorage.getItem(BG_IMAGE_KEY),
  backgroundOpacity: storedNumber(BG_OPACITY_KEY, 0.15),
  backgroundPosition: storedNumber(BG_POSITION_KEY, 50),
  backgroundScale: storedNumber(BG_SCALE_KEY, 100),
  fontSize: 14,

  loadTheme: async () => {
    const result = await api.settings.getTheme()
    const theme = result.ok ? result.data : 'dark'
    const resolved = resolveTheme(theme)
    applyTheme(resolved)
    set({ theme, resolved })

    const fsResult = await api.settings.getFontSize()
    if (fsResult.ok) {
      const fs = fsResult.data
      set({ fontSize: fs })
      applyFontSize(fs)
    }

    if (!systemListenerInstalled) {
      systemListenerInstalled = true
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', () => {
        const current = get().theme
        if (current === 'system') {
          const r = resolveTheme('system')
          applyTheme(r)
          set({ resolved: r })
        }
      })
    }
  },

  setTheme: async (theme) => {
    const resolved = resolveTheme(theme)
    applyTheme(resolved)
    set({ theme, resolved })
    await api.settings.setTheme(theme)
  },

  applyFromExternal: (theme) => {
    const resolved = resolveTheme(theme)
    applyTheme(resolved)
    set({ theme, resolved })
  },

  setColorTheme: (id) => {
    localStorage.setItem(COLOR_THEME_KEY, id)
    set({ colorThemeId: id })
  },

  importTheme: (json) => {
    const theme = validateImportedTheme(json)
    if (!theme) return null
    const existing = get().customThemes
    const updated = [...existing.filter((t) => t.id !== theme.id), theme]
    saveCustomThemes(updated)
    set({ customThemes: updated, colorThemeId: theme.id })
    localStorage.setItem(COLOR_THEME_KEY, theme.id)
    return theme
  },

  removeCustomTheme: (id) => {
    const updated = get().customThemes.filter((t) => t.id !== id)
    saveCustomThemes(updated)
    // Removing the active theme falls back to the default for the current mode
    // (getActiveColorTheme keeps either default id following light/dark).
    const active =
      get().colorThemeId === id ? DEFAULT_THEME_IDS[get().resolved] : get().colorThemeId
    if (active !== get().colorThemeId) localStorage.setItem(COLOR_THEME_KEY, active)
    set({ customThemes: updated, colorThemeId: active })
  },

  setBackgroundImage: (dataUrl) => {
    // Applied for this session either way; false = too large for localStorage
    // (quota), so it won't survive a restart and the caller should say so.
    let persisted = true
    try {
      if (dataUrl) localStorage.setItem(BG_IMAGE_KEY, dataUrl)
      else localStorage.removeItem(BG_IMAGE_KEY)
    } catch (err) {
      console.error('background image not stored:', err)
      localStorage.removeItem(BG_IMAGE_KEY)
      persisted = false
    }
    set({ backgroundImage: dataUrl })
    return persisted
  },

  setBackgroundOpacity: (opacity) => {
    localStorage.setItem(BG_OPACITY_KEY, String(opacity))
    set({ backgroundOpacity: opacity })
  },

  setBackgroundPosition: (position) => {
    localStorage.setItem(BG_POSITION_KEY, String(position))
    set({ backgroundPosition: position })
  },

  setBackgroundScale: (scale) => {
    localStorage.setItem(BG_SCALE_KEY, String(scale))
    set({ backgroundScale: scale })
  },

  setFontSize: (size) => {
    const clamped = Math.min(24, Math.max(11, size))
    set({ fontSize: clamped })
    applyFontSize(clamped)
    void api.settings.setFontSize(clamped)
  },

  increaseFontSize: () => {
    get().setFontSize(get().fontSize + 1)
  },

  decreaseFontSize: () => {
    get().setFontSize(get().fontSize - 1)
  },

  syncFromStorage: () => {
    set({
      colorThemeId: localStorage.getItem(COLOR_THEME_KEY) || 'default-dark',
      customThemes: loadCustomThemes(),
    })
  },

  allThemes: () => [...BUILTIN_THEMES, ...get().customThemes],

  getActiveColorTheme: () => {
    let id = get().colorThemeId
    // Still on a built-in default: use the one matching the current mode, so
    // Light mode doesn't keep the dark editor colours.
    if (id === DEFAULT_THEME_IDS.dark || id === DEFAULT_THEME_IDS.light) {
      id = DEFAULT_THEME_IDS[get().resolved]
    }
    const all = get().allThemes()
    return all.find((t) => t.id === id) || BUILTIN_THEMES[0]
  },
}))
