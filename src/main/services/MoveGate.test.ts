import { describe, expect, it } from 'vitest'
import { MoveGate } from './MoveGate'
import { createPathMapper } from './pathRemap'

const tick = () => new Promise((r) => setTimeout(r, 0))

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {}
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('MoveGate', () => {
  it('a write arriving during a move waits for the move to finish', async () => {
    const gate = new MoveGate()
    const log: string[] = []
    const move = deferred()
    const moving = gate.runMove(async () => {
      log.push('move:start')
      await move.promise
      log.push('move:end')
    })
    await tick()
    const writing = gate.runWrite(async () => {
      log.push('write')
    })
    await tick()
    expect(log).toEqual(['move:start'])
    move.resolve()
    await Promise.all([moving, writing])
    expect(log).toEqual(['move:start', 'move:end', 'write'])
  })

  it('a move waits for writes already in flight', async () => {
    const gate = new MoveGate()
    const log: string[] = []
    const write = deferred()
    const writing = gate.runWrite(async () => {
      log.push('write:start')
      await write.promise
      log.push('write:end')
    })
    await tick()
    const moving = gate.runMove(async () => {
      log.push('move')
    })
    await tick()
    expect(log).toEqual(['write:start'])
    write.resolve()
    await Promise.all([moving, writing])
    expect(log).toEqual(['write:start', 'write:end', 'move'])
  })

  it('moves run one at a time and writes do not block each other', async () => {
    const gate = new MoveGate()
    const log: string[] = []
    const first = deferred()
    const a = gate.runMove(async () => {
      log.push('a:start')
      await first.promise
      log.push('a:end')
    })
    const b = gate.runMove(async () => {
      log.push('b')
    })
    await tick()
    expect(log).toEqual(['a:start'])
    first.resolve()
    await Promise.all([a, b])
    expect(log).toEqual(['a:start', 'a:end', 'b'])

    const slow = deferred()
    const w1 = gate.runWrite(() => slow.promise)
    let w2done = false
    const w2 = gate.runWrite(async () => {
      w2done = true
    })
    await w2
    expect(w2done).toBe(true)
    slow.resolve()
    await w1
  })

  it('a failing move releases the gate', async () => {
    const gate = new MoveGate()
    await expect(
      gate.runMove(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    await expect(gate.runWrite(async () => 'ok')).resolves.toBe('ok')
  })

  it('redirects old paths through recorded moves, in order, until they expire', () => {
    let now = 1_000
    const gate = new MoveGate(() => now, 30_000)
    gate.recordMove(createPathMapper({ kind: 'folder', from: 'Box', to: 'Crate' }, true))
    gate.recordMove(createPathMapper({ kind: 'file', from: 'Crate/a.md', to: 'Crate/b.md' }, true))
    expect(gate.redirect('Box/a.md')).toBe('Crate/b.md')
    expect(gate.redirect('Box/x.md')).toBe('Crate/x.md')
    expect(gate.redirect('Boxes/a.md')).toBe('Boxes/a.md')
    now += 30_001
    expect(gate.redirect('Box/a.md')).toBe('Box/a.md')
  })
})
