import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EncryptionService } from './EncryptionService'
import { SettingsService } from './SettingsService'

let dir: string
let filePath: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'slate-settings-'))
  filePath = join(dir, 'settings.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('SettingsService', () => {
  it('returns null when no settings file exists yet', async () => {
    const settings = new SettingsService(filePath)
    expect(await settings.getVaultPath()).toBeNull()
  })

  it('persists and reads back the vault path', async () => {
    const settings = new SettingsService(filePath)
    await settings.setVaultPath('C:/notes')
    expect(await settings.getVaultPath()).toBe('C:/notes')
  })

  it('persists across instances (survives a fresh read from disk)', async () => {
    await new SettingsService(filePath).setVaultPath('C:/vault-one')
    const reopened = new SettingsService(filePath)
    expect(await reopened.getVaultPath()).toBe('C:/vault-one')
  })

  it('overwrites a previously stored path cleanly', async () => {
    const settings = new SettingsService(filePath)
    await settings.setVaultPath('C:/first')
    await settings.setVaultPath('C:/second')
    expect(await settings.getVaultPath()).toBe('C:/second')
    expect(await new SettingsService(filePath).getVaultPath()).toBe('C:/second')
  })

  it('falls back to null on a corrupt settings file', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(filePath, '{ not valid json', 'utf-8')
    expect(await new SettingsService(filePath).getVaultPath()).toBeNull()
  })

  it('returns an empty workspace when none has been set', async () => {
    expect(await new SettingsService(filePath).getWorkspace()).toEqual({
      openTabs: [],
      activeTab: null,
    })
  })

  it('persists and reads back the workspace across instances', async () => {
    await new SettingsService(filePath).setWorkspace({
      openTabs: ['a.md', 'sub/b.md'],
      activeTab: 'sub/b.md',
    })
    expect(await new SettingsService(filePath).getWorkspace()).toEqual({
      openTabs: ['a.md', 'sub/b.md'],
      activeTab: 'sub/b.md',
    })
  })

  it('keeps vault path and workspace independent', async () => {
    const settings = new SettingsService(filePath)
    await settings.setVaultPath('C:/vault')
    await settings.setWorkspace({ openTabs: ['note.md'], activeTab: 'note.md' })
    const reopened = new SettingsService(filePath)
    expect(await reopened.getVaultPath()).toBe('C:/vault')
    expect(await reopened.getWorkspace()).toEqual({ openTabs: ['note.md'], activeTab: 'note.md' })
  })

  it('falls back to an empty workspace for a pre-existing file without the key', async () => {
    const { writeFile } = await import('node:fs/promises')
    // Old-shape settings.json (e.g. a leftover `lastNotePath`) — no `workspace`.
    await writeFile(filePath, JSON.stringify({ vaultPath: 'C:/v', lastNotePath: 'x.md' }), 'utf-8')
    const settings = new SettingsService(filePath)
    expect(await settings.getVaultPath()).toBe('C:/v')
    expect(await settings.getWorkspace()).toEqual({ openTabs: [], activeTab: null })
  })

  describe('encryption material (Epic 10)', () => {
    it('returns null when no vault password has been set', async () => {
      expect(await new SettingsService(filePath).getEncryption()).toBeNull()
    })

    it('persists and reads back salt + verifier across instances', async () => {
      const secret = { salt: 'c2FsdA==', verifier: 'dmVyaWZpZXI=' }
      await new SettingsService(filePath).setEncryption(secret)
      expect(await new SettingsService(filePath).getEncryption()).toEqual(secret)
    })

    it('never writes the password to disk — only salt + verifier land in the file', async () => {
      // Mirror the handler flow: derive the secret from a password, store it.
      const password = 'super-secret-vault-pw-42'
      const secret = new EncryptionService().initPassword(password)
      await new SettingsService(filePath).setEncryption(secret)

      const raw = await readFile(filePath, 'utf-8')
      expect(raw).not.toContain(password)
      expect(raw).toContain(secret.salt)
      expect(raw).toContain(secret.verifier)
    })
  })

  describe('stickies (Epic 11)', () => {
    const bounds = { x: 10, y: 20, width: 320, height: 300 }

    it('returns [] when none are set', async () => {
      expect(await new SettingsService(filePath).getStickies()).toEqual([])
    })

    it('persists and reads back the sticky set across instances', async () => {
      await new SettingsService(filePath).setStickies([{ path: 'a.md', bounds }])
      expect(await new SettingsService(filePath).getStickies()).toEqual([{ path: 'a.md', bounds }])
    })

    it('updateStickyGeometry inserts a new sticky and updates an existing one', async () => {
      const s = new SettingsService(filePath)
      await s.updateStickyGeometry('a.md', bounds)
      expect(await s.getStickies()).toEqual([{ path: 'a.md', bounds }])

      const moved = { x: 99, y: 99, width: 400, height: 400 }
      await s.updateStickyGeometry('a.md', moved)
      expect(await new SettingsService(filePath).getStickies()).toEqual([
        { path: 'a.md', bounds: moved },
      ])
    })

    it('removeSticky drops one entry, leaving the rest', async () => {
      const s = new SettingsService(filePath)
      await s.setStickies([
        { path: 'a.md', bounds },
        { path: 'b.md', bounds },
      ])
      await s.removeSticky('a.md')
      expect(await new SettingsService(filePath).getStickies()).toEqual([{ path: 'b.md', bounds }])
    })

    it('keeps stickies independent of vault path and workspace', async () => {
      const s = new SettingsService(filePath)
      await s.setVaultPath('C:/vault')
      await s.setStickies([{ path: 'note.md', bounds }])
      const reopened = new SettingsService(filePath)
      expect(await reopened.getVaultPath()).toBe('C:/vault')
      expect(await reopened.getStickies()).toEqual([{ path: 'note.md', bounds }])
    })
  })
})
