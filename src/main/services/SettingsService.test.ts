import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
})
