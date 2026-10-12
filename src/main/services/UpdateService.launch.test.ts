import type { UpdateState } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updater = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  return Object.assign(new EventEmitter(), {
    checkForUpdatesAndNotify: vi.fn(async () => null),
    checkForUpdates: vi.fn(async () => null),
  })
})

vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '1.0.0' },
  shell: { openExternal: vi.fn() },
}))
vi.mock('electron-updater', () => ({ autoUpdater: updater }))

import { UpdateService } from './UpdateService'

describe('UpdateService.checkOnLaunch', () => {
  beforeEach(() => {
    updater.removeAllListeners()
    vi.clearAllMocks()
  })

  it.skipIf(process.platform === 'darwin')(
    'feeds a launch-time download into the in-app update state (#18)',
    () => {
      const states: UpdateState[] = []
      new UpdateService((s) => states.push(s)).checkOnLaunch()
      expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1)

      updater.emit('update-available', { version: '2.0.0', releaseNotes: 'Fixes' })
      updater.emit('download-progress', { percent: 41.6 })
      updater.emit('update-downloaded', { version: '2.0.0', releaseNotes: null })
      expect(states.map((s) => s.status)).toEqual(['available', 'downloading', 'downloaded'])
      expect(states[1]).toMatchObject({ percent: 42 })
    },
  )

  it('a later manual check reuses the same listeners (no duplicate events)', () => {
    const states: UpdateState[] = []
    const svc = new UpdateService((s) => states.push(s))
    svc.checkOnLaunch()
    svc.check()
    expect(updater.listenerCount('update-downloaded')).toBeLessThanOrEqual(1)
  })
})
