import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EncryptionService } from './EncryptionService'
import { rekeyFolderOrder, SettingsService } from './SettingsService'

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

  describe('autoSave (Epic 13)', () => {
    it('defaults to true when never set', async () => {
      expect(await new SettingsService(filePath).getAutoSave()).toBe(true)
    })

    it('persists and reads back across instances', async () => {
      await new SettingsService(filePath).setAutoSave(false)
      expect(await new SettingsService(filePath).getAutoSave()).toBe(false)
      await new SettingsService(filePath).setAutoSave(true)
      expect(await new SettingsService(filePath).getAutoSave()).toBe(true)
    })

    it('defaults to true for a pre-existing settings file without the key', async () => {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(filePath, JSON.stringify({ vaultPath: 'C:/v' }), 'utf-8')
      const settings = new SettingsService(filePath)
      expect(await settings.getVaultPath()).toBe('C:/v')
      expect(await settings.getAutoSave()).toBe(true)
    })
  })

  describe('noteOrder (sidebar drag-to-reorder)', () => {
    it('defaults to {} when never set', async () => {
      expect(await new SettingsService(filePath).getNoteOrder()).toEqual({})
    })

    it('persists per-folder orders independently and reads back across instances', async () => {
      const s = new SettingsService(filePath)
      await s.setNoteOrder('', ['b.md', 'a.md'])
      await s.setNoteOrder('work', ['z.md', 'y.md'])
      const order = await new SettingsService(filePath).getNoteOrder()
      expect(order['']).toEqual(['b.md', 'a.md'])
      expect(order.work).toEqual(['z.md', 'y.md'])
    })

    it('replaces one level without touching others', async () => {
      const s = new SettingsService(filePath)
      await s.setNoteOrder('', ['b.md', 'a.md'])
      await s.setNoteOrder('', ['a.md', 'b.md'])
      const order = await s.getNoteOrder()
      expect(order['']).toEqual(['a.md', 'b.md'])
    })

    it('defaults to {} for a pre-existing settings file without the key', async () => {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(filePath, JSON.stringify({ vaultPath: 'C:/v' }), 'utf-8')
      expect(await new SettingsService(filePath).getNoteOrder()).toEqual({})
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

describe('rekeyFolderOrder (folder rename/move)', () => {
  it('moves the folder and its subfolders to the new path, leaving others alone', () => {
    const order = { '': ['r.md'], Box: ['b.md', 'a.md'], 'Box/Sub': ['d.md'], Boxer: ['x.md'] }
    expect(rekeyFolderOrder(order, 'Box', 'Crate')).toEqual({
      '': ['r.md'],
      Crate: ['b.md', 'a.md'],
      'Crate/Sub': ['d.md'],
      Boxer: ['x.md'],
    })
  })

  it('returns the same object when no key is affected', () => {
    const order = { A: ['a.md'] }
    expect(rekeyFolderOrder(order, 'B', 'C')).toBe(order)
  })
})

describe('SettingsService write serialization', () => {
  it('keeps every concurrent write from different methods (no lost updates)', async () => {
    const settings = new SettingsService(filePath)
    const reminder = {
      id: 'r1',
      title: 'T',
      notePath: 'a.md',
      fireAt: new Date(0).toISOString(),
      alertBefore: 0,
      recurrence: 'none' as const,
      fired: false,
      createdAt: 0,
    }
    // Fired without awaiting in between: each must see the previous one's write.
    await Promise.all([
      settings.setVaultPath('C:/v'),
      settings.setTheme('light'),
      settings.addReminder(reminder),
      settings.updateStickyGeometry('a.md', { x: 1, y: 2, width: 3, height: 4 }),
      settings.setNoteOrder('', ['b.md', 'a.md']),
      settings.setFontSize(18),
      settings.updateStickyGeometry('b.md', { x: 5, y: 6, width: 7, height: 8 }),
      settings.markReminderFired('r1'),
      settings.setAutoSave(false),
    ])
    const reopened = new SettingsService(filePath)
    expect(await reopened.getVaultPath()).toBe('C:/v')
    expect(await reopened.getTheme()).toBe('light')
    expect(await reopened.getReminders()).toEqual([{ ...reminder, fired: true }])
    expect((await reopened.getStickies()).map((s) => s.path)).toEqual(['a.md', 'b.md'])
    expect(await reopened.getNoteOrder()).toEqual({ '': ['b.md', 'a.md'] })
    expect(await reopened.getFontSize()).toBe(18)
    expect(await reopened.getAutoSave()).toBe(false)
  })

  it('a failed write does not block later writes', async () => {
    const settings = new SettingsService(filePath)
    // A directory where the file should be: the atomic rename fails.
    await mkdir(filePath)
    await expect(settings.setTheme('light')).rejects.toThrow()
    await rm(filePath, { recursive: true })
    await settings.setTheme('dark')
    expect(await new SettingsService(filePath).getTheme()).toBe('dark')
  })
})
