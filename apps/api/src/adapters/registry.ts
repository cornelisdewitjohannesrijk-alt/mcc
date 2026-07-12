import type { Platform } from '@mcc/shared'
import type { ChannelAdapter } from './types'
import { WhatsAppAdapter } from './whatsapp.adapter'
import { MessengerAdapter } from './messenger.adapter'

// ─── Adapter Registry ─────────────────────────────────────────────────────────
// Single source of truth for all registered channel adapters.
// To add a new channel: implement ChannelAdapter and register it here.

class AdapterRegistry {
  private adapters = new Map<Platform, ChannelAdapter>()

  register(adapter: ChannelAdapter) {
    this.adapters.set(adapter.platform, adapter)
  }

  get(platform: Platform): ChannelAdapter {
    const adapter = this.adapters.get(platform)
    if (!adapter) throw new Error(`No adapter registered for platform: ${platform}`)
    return adapter
  }

  getAll(): ChannelAdapter[] {
    return Array.from(this.adapters.values())
  }

  has(platform: Platform): boolean {
    return this.adapters.has(platform)
  }
}

export const registry = new AdapterRegistry()

// Register built-in adapters
registry.register(new WhatsAppAdapter())
registry.register(new MessengerAdapter())
