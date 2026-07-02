import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ThemeMode } from '@shared/types'
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
  /** Pinned sticky notes with their window geometry (Epic 11). */
  stickies: StickyRecord[]
  /** Auto-save the active note after a short debounce (Epic 13). */
  autoSave: boolean
}

const DEFAULTS: SettingsData = {
  vaultPath: null,
  workspace: { openTabs: [], activeTab: null },
  theme: 'dark',
  encryption: null,
  stickies: [],
  autoSave: true,
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

  async getVaultPath(): Promise<string | null> {
    const data = await this.load()
    return data.vaultPath
  }

  getVaultPathSync(): string | null {
    return this.cache?.vaultPath ?? null
  }

  async setVaultPath(vaultPath: string): Promise<void> {
    const data = await this.load()
    await this.persist({ ...data, vaultPath })
  }

  async getWorkspace(): Promise<WorkspaceData> {
    const data = await this.load()
    // A pre-existing settings.json (e.g. with the old `lastNotePath` key) has no
    // `workspace` field — fall back to an empty workspace rather than crashing.
    return data.workspace ?? DEFAULTS.workspace
  }

  async setWorkspace(workspace: WorkspaceData): Promise<void> {
    const data = await this.load()
    await this.persist({ ...data, workspace })
  }

  async getTheme(): Promise<ThemeMode> {
    const data = await this.load()
    return data.theme ?? DEFAULTS.theme
  }

  async setTheme(theme: ThemeMode): Promise<void> {
    const data = await this.load()
    await this.persist({ ...data, theme })
  }

  /** The stored vault-encryption material, or null if no password is set. */
  async getEncryption(): Promise<VaultSecret | null> {
    const data = await this.load()
    return data.encryption ?? null
  }

  /** Persists the (non-secret) salt + verifier. Never receives the password. */
  async setEncryption(encryption: VaultSecret): Promise<void> {
    const data = await this.load()
    await this.persist({ ...data, encryption })
  }

  /** The pinned sticky notes (path + geometry), or [] if none. */
  async getStickies(): Promise<StickyRecord[]> {
    const data = await this.load()
    return data.stickies ?? []
  }

  /** Replaces the full set of pinned stickies. */
  async setStickies(stickies: StickyRecord[]): Promise<void> {
    const data = await this.load()
    await this.persist({ ...data, stickies })
  }

  /**
   * Upserts one sticky's geometry (adds it if not present). Used both when a
   * sticky is opened and when it is moved/resized.
   */
  async updateStickyGeometry(path: string, bounds: StickyRecord['bounds']): Promise<void> {
    const data = await this.load()
    const stickies = data.stickies ?? []
    const idx = stickies.findIndex((s) => s.path === path)
    const next =
      idx === -1
        ? [...stickies, { path, bounds }]
        : stickies.map((s) => (s.path === path ? { path, bounds } : s))
    await this.persist({ ...data, stickies: next })
  }

  /** Whether auto-save is enabled (Epic 13). Pre-existing settings files → default true. */
  async getAutoSave(): Promise<boolean> {
    const data = await this.load()
    return data.autoSave ?? DEFAULTS.autoSave
  }

  async setAutoSave(autoSave: boolean): Promise<void> {
    const data = await this.load()
    await this.persist({ ...data, autoSave })
  }

  /** Removes one sticky from the persisted set (on close). */
  async removeSticky(path: string): Promise<void> {
    const data = await this.load()
    const stickies = (data.stickies ?? []).filter((s) => s.path !== path)
    await this.persist({ ...data, stickies })
  }
}
