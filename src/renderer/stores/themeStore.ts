import { api } from '@renderer/api'
import type { ThemeMode } from '@shared/types'
import { create } from 'zustand'

type ThemeState = {
  theme: ThemeMode
  resolved: 'dark' | 'light'
  loadTheme: () => Promise<void>
  setTheme: (theme: ThemeMode) => Promise<void>
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

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark',
  resolved: 'dark',

  loadTheme: async () => {
    const result = await api.settings.getTheme()
    const theme = result.ok ? result.data : 'dark'
    const resolved = resolveTheme(theme)
    applyTheme(resolved)
    set({ theme, resolved })

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
}))
