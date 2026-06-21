import { globalShortcut } from 'electron'

export interface ShortcutBinding {
  accelerator: string
  handler: () => void
}

export class ShortcutManager {
  private bindings: Map<string, ShortcutBinding> = new Map()

  register(id: string, accelerator: string, handler: () => void): boolean {
    this.unregister(id)
    const success = globalShortcut.register(accelerator, handler)
    if (success) {
      this.bindings.set(id, { accelerator, handler })
    }
    return success
  }

  unregister(id: string): void {
    const binding = this.bindings.get(id)
    if (binding) {
      globalShortcut.unregister(binding.accelerator)
      this.bindings.delete(id)
    }
  }

  unregisterAll(): void {
    for (const [id] of this.bindings) {
      this.unregister(id)
    }
  }

  isRegistered(id: string): boolean {
    return this.bindings.has(id)
  }

  rebind(id: string, newAccelerator: string): boolean {
    const binding = this.bindings.get(id)
    if (!binding) return false
    return this.register(id, newAccelerator, binding.handler)
  }
}
