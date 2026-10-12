import type { Language } from '@shared/types'

/**
 * Main-process strings (tray, app menu, native dialogs, notifications). The
 * renderer has its own, much larger dictionary in `src/renderer/i18n`; main only
 * needs the handful of strings it shows itself. Pure TS (no Electron import) so
 * it can be unit-tested; `index.ts` seeds the language from settings / the OS
 * locale and `settings:setLanguage` updates it.
 */
const en = {
  tray: {
    tooltip: 'Slate',
    open: 'Open Slate',
    quit: 'Quit Slate',
  },
  menu: {
    edit: 'Edit',
    view: 'View',
    window: 'Window',
    about: 'About Slate',
    hide: 'Hide Slate',
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    quit: 'Quit Slate',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    reload: 'Reload',
    toggleDevTools: 'Toggle Developer Tools',
    minimize: 'Minimize',
    zoom: 'Zoom',
    close: 'Close Window',
  },
  dialog: {
    pickVault: 'Choose a folder for your notes',
    pickImportFolder: 'Choose a folder to import',
    pickImportZip: 'Choose a Notion export (.zip)',
    notionExport: 'Notion export',
  },
  notification: {
    reminderTitle: 'Reminder',
    /** electron-updater fills {appName} and {version} itself. */
    updateReadyTitle: 'An update is ready to install',
    updateReadyBody: '{appName} {version} has been downloaded and will be installed when you quit.',
  },
}

export type MainDict = typeof en

const tr: MainDict = {
  tray: {
    tooltip: 'Slate',
    open: "Slate'i Aç",
    quit: "Slate'ten Çık",
  },
  menu: {
    edit: 'Düzen',
    view: 'Görünüm',
    window: 'Pencere',
    about: 'Slate Hakkında',
    hide: "Slate'i Gizle",
    hideOthers: 'Diğerlerini Gizle',
    unhide: 'Tümünü Göster',
    quit: "Slate'ten Çık",
    cut: 'Kes',
    copy: 'Kopyala',
    paste: 'Yapıştır',
    selectAll: 'Tümünü Seç',
    reload: 'Yeniden Yükle',
    toggleDevTools: 'Geliştirici Araçlarını Aç/Kapat',
    minimize: 'Simge Durumuna Küçült',
    zoom: 'Büyüt',
    close: 'Pencereyi Kapat',
  },
  dialog: {
    pickVault: 'Notların için bir klasör seç',
    pickImportFolder: 'İçe aktarılacak klasörü seç',
    pickImportZip: 'Notion dışa aktarımını seç (.zip)',
    notionExport: 'Notion dışa aktarımı',
  },
  notification: {
    reminderTitle: 'Hatırlatıcı',
    updateReadyTitle: 'Güncelleme yüklenmeye hazır',
    updateReadyBody: '{appName} {version} indirildi; uygulamadan çıktığında yüklenecek.',
  },
}

export const MAIN_DICTS: Record<Language, MainDict> = { en, tr }

type Section = keyof MainDict
export type MainKey = { [S in Section]: `${S}.${keyof MainDict[S] & string}` }[Section]

let current: Language = 'en'

/** 'tr', 'tr-TR', … → Turkish; any other locale → English. */
export function languageFromLocale(locale: string): Language {
  return /^tr(?:[-_]|$)/i.test(locale.trim()) ? 'tr' : 'en'
}

export function getMainLanguage(): Language {
  return current
}

export function setMainLanguage(language: Language): void {
  current = language
}

/** Looks up a main-process string in the active language. */
export function tm(key: MainKey, language: Language = current): string {
  const [section, name] = key.split('.') as [Section, string]
  const group = MAIN_DICTS[language][section] as Record<string, string>
  return group[name] ?? (en[section] as Record<string, string>)[name] ?? key
}
