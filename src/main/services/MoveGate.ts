import type { PathMapper } from './pathRemap'

/**
 * Orders note writes against path moves (rename, folder move, lock/unlock) in
 * main. A move is exclusive: it waits for in-flight writes to finish, and writes
 * that arrive while it runs wait for it. Writes don't block each other.
 *
 * Moves are recorded for a short while so a write that was already on its way
 * for the old path (a sticky autosave sent before the window learned the new
 * path) can be redirected instead of recreating the old file or folder.
 */
export class MoveGate {
  private moving: Promise<void> | null = null
  private writes = 0
  private idleWaiters: Array<() => void> = []
  private recent: Array<{ map: PathMapper; at: number }> = []

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 30_000,
  ) {}

  async runWrite<T>(fn: () => Promise<T>): Promise<T> {
    while (this.moving) await this.moving
    this.writes++
    try {
      return await fn()
    } finally {
      this.writes--
      if (this.writes === 0) for (const wake of this.idleWaiters.splice(0)) wake()
    }
  }

  async runMove<T>(fn: () => Promise<T>): Promise<T> {
    while (this.moving) await this.moving
    let release = () => {}
    this.moving = new Promise<void>((r) => {
      release = r
    })
    try {
      if (this.writes > 0) await new Promise<void>((r) => this.idleWaiters.push(r))
      return await fn()
    } finally {
      this.moving = null
      release()
    }
  }

  /** Remembers a completed move for `redirect`. */
  recordMove(map: PathMapper): void {
    this.prune()
    this.recent.push({ map, at: this.now() })
  }

  /** Where `path` lives after the recently recorded moves (oldest first); itself if none apply. */
  redirect(path: string): string {
    this.prune()
    let p = path
    for (const { map } of this.recent) p = map(p) ?? p
    return p
  }

  private prune(): void {
    const cutoff = this.now() - this.ttlMs
    this.recent = this.recent.filter((m) => m.at >= cutoff)
  }
}
