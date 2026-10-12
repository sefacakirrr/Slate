import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Language, ReminderRecord, ThemeMode } from '@shared/types'
import type { VaultSecret } from './EncryptionService'

/**
 * On-disk settings shape. Kept deliberately small — add fields as features need
 * them. No schema-validation library until the shape gets complex enough to
 * warrant one.
 */
/** Persisted workspace: which note tabs are open and which is active. */
export type WorkspaceData = {
  openTabs: string[]
  activeTab: string | null
}

/** A pinned sticky note: the vault-relative note path + its window geometry (Epic 11). */
export type StickyRecord = {
  path: string
  bounds: { x: number; y: number; width: number; height: number }
}

type SettingsData = {
  vaultPath: string | null
  /** Open tabs + active tab, restored on next launch. */
  workspace: WorkspaceData
  theme: ThemeMode
  /**
   * Vault-encryption material (Epic 10). Non-secret: the salt to derive the key
   * and a verifier to validate the password. `null` until the user sets a vault
   * password. The password/key itself is NEVER stored here — only in
   * EncryptionService memory for the session.
   */
  encryption: VaultSecret | null
  /** User-provided hint shown after a wrong password attempt. */
  passwordHint: string | null
  /** Pinned sticky notes with their window geometry (Epic 11). */
  stickies: StickyRecord[]
  /** Auto-save the active note after a short debounce (Epic 13). */
  autoSave: boolean
  /**
   * Custom sidebar ordering: folder path ('' = vault root) → child names in
   * display order. Levels absent here (and names not listed) fall back to the
   * default folders-first alphabetical sort. A UI preference, not vault data —
   * so it lives here, like workspace/stickies.
   */
  noteOrder: Record<string, string[]>
  /** Persisted reminders (Epic 16 — Calendar & Reminders). */
  reminders: ReminderRecord[]
  /** Editor / UI font size in pixels. */
  fontSize: number
  /** Register Slate as a login item (applied only in packaged builds). */
  launchAtLogin: boolean
  /** Closing the main window hides it to the tray instead of quitting. */
  closeToTray: boolean
  /**
   * Absolute paths of external (outside-vault) files open as tabs — the part of
   * main's read/write allowlist that survives a restart. Written by main only.
   */
  externalFiles: string[]
  /** UI language; null until the user picks one (main then follows the OS locale). */
  language: Language | null
}

const DEFAULTS: SettingsData = {
  vaultPath: null,
  workspace: { openTabs: [], activeTab: null },
  theme: 'dark',
  encryption: null,
  passwordHint: null,
  stickies: [],
  autoSave: true,
  noteOrder: {},
  reminders: [],
  fontSize: 14,
  launchAtLogin: true,
  closeToTray: true,
  externalFiles: [],
  language: null,
}

/**
 * Re-keys custom sidebar orders after a folder rename/move: `from` and every
 * `from/…` key move under `to`. Returns the same object when nothing changed.
 */
export function rekeyFolderOrder(
  order: Record<string, string[]>,
  from: string,
  to: string,
): Record<string, string[]> {
  if (from === to) return order
  const prefix = `${from}/`
  const keys = Object.keys(order).filter((k) => k === from || k.startsWith(prefix))
  if (keys.length === 0) return order
  const next: Record<string, string[]> = {}
  for (const [k, names] of Object.entries(order)) {
    if (!keys.includes(k)) next[k] = names
  }
  for (const k of keys) next[to + k.slice(from.length)] = order[k]
  return next
}

/**
 * Owns the persisted `settings.json` file. Pure Node — no Electron import — so
 * it can be unit-tested by passing a temp file path to the constructor. In
 * production, main wires it with `join(app.getPath('userData'), 'settings.json')`.
 *
 * Writes are atomic (temp file + rename) to avoid a half-written, corrupt JSON
 * file if the process dies mid-write. Settings are lazily loaded and cached on
 * first access.
 */
export class SettingsService {
  private readonly filePath: string
  private cache: SettingsData | null = null

  constructor(filePath: string) {
    this.filePath = filePath
  }

  /** Reads and caches the settings file. Missing/corrupt file → defaults. */
  private async load(): Promise<SettingsData> {
    if (this.cache !== null) return this.cache

    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<SettingsData>
      this.cache = { ...DEFAULTS, ...parsed }
    } catch {
      // First launch (no file) or unreadable/corrupt JSON — fall back to
      // defaults rather than throwing. A bad settings file should not brick
      // the app; the next successful write overwrites it.
      this.cache = { ...DEFAULTS }
    }

    return this.cache
  }

  /** Atomically persists the current cache to disk (temp + rename). */
  private async persist(data: SettingsData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
    await rename(tmp, this.filePath)
    this.cache = data
  }

  /** Tail of the write queue: every mutator runs its read-modify-write here. */
  private writeQueue: Promise<unknown> = Promise.resolve()

  /**
   * Runs one read-modify-write after every earlier one has finished, so two
   * concurrent mutators (even of different fields) can't persist stale
   * snapshots over each other or share the temp file. Queued bodies must use
   * `load`/`persist` directly, never another public mutator (that would wait
   * on itself and deadlock). A failed write doesn't block later ones.
   */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(fn, fn)
    this.writeQueue = run.catch(() => {})
    return run
  }

  async getVaultPath(): Promise<string | null> {
    const data = await this.load()
    return data.vaultPath
  }

  getVaultPathSync(): string | null {
    return this.cache?.vaultPath ?? null
  }

  setVaultPath(vaultPath: string): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, vaultPath })
    })
  }

  async getWorkspace(): Promise<WorkspaceData> {
    const data = await this.load()
    // A pre-existing settings.json (e.g. with the old `lastNotePath` key) has no
    // `workspace` field — fall back to an empty workspace rather than crashing.
    return data.workspace ?? DEFAULTS.workspace
  }

  setWorkspace(workspace: WorkspaceData): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, workspace })
    })
  }

  async getTheme(): Promise<ThemeMode> {
    const data = await this.load()
    return data.theme ?? DEFAULTS.theme
  }

  setTheme(theme: ThemeMode): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, theme })
    })
  }

  /** The stored vault-encryption material, or null if no password is set. */
  async getEncryption(): Promise<VaultSecret | null> {
    const data = await this.load()
    return data.encryption ?? null
  }

  /** Persists the (non-secret) salt + verifier. Never receives the password. */
  setEncryption(encryption: VaultSecret): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, encryption })
    })
  }

  async getPasswordHint(): Promise<string | null> {
    const data = await this.load()
    return data.passwordHint ?? null
  }

  setPasswordHint(hint: string | null): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, passwordHint: hint })
    })
  }

  /** The pinned sticky notes (path + geometry), or [] if none. */
  async getStickies(): Promise<StickyRecord[]> {
    const data = await this.load()
    return data.stickies ?? []
  }

  /** Replaces the full set of pinned stickies. */
  setStickies(stickies: StickyRecord[]): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, stickies })
    })
  }

  /**
   * Upserts one sticky's geometry (adds it if not present). Used both when a
   * sticky is opened and when it is moved/resized.
   */
  updateStickyGeometry(path: string, bounds: StickyRecord['bounds']): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      const stickies = data.stickies ?? []
      const idx = stickies.findIndex((s) => s.path === path)
      const next =
        idx === -1
          ? [...stickies, { path, bounds }]
          : stickies.map((s) => (s.path === path ? { path, bounds } : s))
      await this.persist({ ...data, stickies: next })
    })
  }

  /** Whether auto-save is enabled (Epic 13). Pre-existing settings files → default true. */
  async getAutoSave(): Promise<boolean> {
    const data = await this.load()
    return data.autoSave ?? DEFAULTS.autoSave
  }

  setAutoSave(autoSave: boolean): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, autoSave })
    })
  }

  /** Custom sidebar order map (folder path → child names). {} if never set. */
  async getNoteOrder(): Promise<Record<string, string[]>> {
    const data = await this.load()
    return data.noteOrder ?? {}
  }

  /** Replaces one level's custom order, keeping the rest of the map. */
  setNoteOrder(folder: string, names: string[]): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      const noteOrder = { ...(data.noteOrder ?? {}), [folder]: names }
      await this.persist({ ...data, noteOrder })
    })
  }

  /** A folder was renamed/moved: its (and its subfolders') custom orders follow it. */
  moveNoteOrderFolder(from: string, to: string): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      const current = data.noteOrder ?? {}
      const noteOrder = rekeyFolderOrder(current, from, to)
      if (noteOrder === current) return
      await this.persist({ ...data, noteOrder })
    })
  }

  /** Removes one sticky from the persisted set (on close). */
  removeSticky(path: string): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      const stickies = (data.stickies ?? []).filter((s) => s.path !== path)
      await this.persist({ ...data, stickies })
    })
  }

  async getFontSize(): Promise<number> {
    const data = await this.load()
    return data.fontSize ?? 14
  }

  setFontSize(fontSize: number): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, fontSize })
    })
  }

  async getLaunchAtLogin(): Promise<boolean> {
    const data = await this.load()
    return data.launchAtLogin ?? DEFAULTS.launchAtLogin
  }

  setLaunchAtLogin(launchAtLogin: boolean): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, launchAtLogin })
    })
  }

  async getCloseToTray(): Promise<boolean> {
    const data = await this.load()
    return data.closeToTray ?? DEFAULTS.closeToTray
  }

  setCloseToTray(closeToTray: boolean): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, closeToTray })
    })
  }

  /** The chosen UI language, or null if never chosen (the caller falls back to the OS locale). */
  async getLanguage(): Promise<Language | null> {
    const data = await this.load()
    return data.language === 'en' || data.language === 'tr' ? data.language : null
  }

  setLanguage(language: Language): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, language })
    })
  }

  async getExternalFiles(): Promise<string[]> {
    const data = await this.load()
    return Array.isArray(data.externalFiles) ? data.externalFiles : []
  }

  /** Persists the external-file allowlist; skips the write when unchanged. */
  setExternalFiles(externalFiles: string[]): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      const current = Array.isArray(data.externalFiles) ? data.externalFiles : []
      const same =
        current.length === externalFiles.length && current.every((p, i) => p === externalFiles[i])
      if (same) return
      await this.persist({ ...data, externalFiles })
    })
  }

  async getReminders(): Promise<ReminderRecord[]> {
    const data = await this.load()
    return data.reminders ?? []
  }

  setReminders(reminders: ReminderRecord[]): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, reminders })
    })
  }

  addReminder(reminder: ReminderRecord): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, reminders: [...(data.reminders ?? []), reminder] })
    })
  }

  removeReminder(id: string): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      await this.persist({ ...data, reminders: (data.reminders ?? []).filter((r) => r.id !== id) })
    })
  }

  markReminderFired(id: string): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      const reminders = (data.reminders ?? []).map((r) => (r.id === id ? { ...r, fired: true } : r))
      await this.persist({ ...data, reminders })
    })
  }

  updateReminder(reminder: ReminderRecord): Promise<void> {
    return this.serialize(async () => {
      const data = await this.load()
      const reminders = (data.reminders ?? []).map((r) => (r.id === reminder.id ? reminder : r))
      await this.persist({ ...data, reminders })
    })
  }
}
