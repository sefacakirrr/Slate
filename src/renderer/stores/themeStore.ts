import { api } from '@renderer/api'
import { BUILTIN_THEMES, type ColorTheme, validateImportedTheme } from '@renderer/editor/colorThemes'
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
  setBackgroundImage: (dataUrl: string | null) => void
  setBackgroundOpacity: (opacity: number) => void
  setBackgroundPosition: (position: number) => void
  setBackgroundScale: (scale: number) => void
  setFontSize: (size: number) => void
  increaseFontSize: () => void
  decreaseFontSize: () => void
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

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark',
  resolved: 'dark',
  colorThemeId: localStorage.getItem(COLOR_THEME_KEY) || 'default-dark',
  customThemes: loadCustomThemes(),
  backgroundImage: localStorage.getItem(BG_IMAGE_KEY),
  backgroundOpacity: Number(localStorage.getItem(BG_OPACITY_KEY)) || 0.15,
  backgroundPosition: Number(localStorage.getItem(BG_POSITION_KEY)) || 50,
  backgroundScale: Number(localStorage.getItem(BG_SCALE_KEY)) || 100,
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

    if (theme === 'system') {
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
    const active = get().colorThemeId === id ? 'default-dark' : get().colorThemeId
    if (active !== get().colorThemeId) localStorage.setItem(COLOR_THEME_KEY, active)
    set({ customThemes: updated, colorThemeId: active })
  },

  setBackgroundImage: (dataUrl) => {
    if (dataUrl) localStorage.setItem(BG_IMAGE_KEY, dataUrl)
    else localStorage.removeItem(BG_IMAGE_KEY)
    set({ backgroundImage: dataUrl })
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

  allThemes: () => [...BUILTIN_THEMES, ...get().customThemes],

  getActiveColorTheme: () => {
    const id = get().colorThemeId
    const all = get().allThemes()
    return all.find((t) => t.id === id) || BUILTIN_THEMES[0]
  },
}))
