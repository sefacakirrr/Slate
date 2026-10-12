import { api } from '@renderer/api'
import type { Language } from '@shared/types'
import { applyLanguage } from './index'

let subscribed = false

/**
 * Loads the language from main (saved choice, else the OS locale) and follows
 * switches made in any window. Called once per renderer root before the first
 * render, so no window flashes the wrong language.
 */
export async function initLanguage(): Promise<void> {
  if (!subscribed) {
    subscribed = true
    api.settings.onLanguageChanged((language) => applyLanguage(language))
  }
  const result = await api.settings.getLanguage()
  if (result.ok) applyLanguage(result.data)
}

/** Switches the language: applies it here at once, persists it, and main broadcasts it. */
export async function setLanguage(language: Language): Promise<void> {
  applyLanguage(language)
  await api.settings.setLanguage(language)
}
