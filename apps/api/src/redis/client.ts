import Redis from 'ioredis'
import { config } from '../config'

// ─── Publisher ────────────────────────────────────────────────────────────────
// Used to publish real-time events to Socket.IO
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
})

// ─── Subscriber ───────────────────────────────────────────────────────────────
// Dedicated connection for subscriptions (Redis requires separate connections)
export const redisSub = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
})

redis.on('connect', () => console.log('[Redis] Publisher connected'))
redis.on('error', (err) => console.error('[Redis] Publisher error:', err))

redisSub.on('connect', () => console.log('[Redis] Subscriber connected'))
redisSub.on('error', (err) => console.error('[Redis] Subscriber error:', err))

// ─── Channel Names ────────────────────────────────────────────────────────────

export const REDIS_CHANNELS = {
  NEW_MESSAGE: 'mcc:new_message',
  MESSAGE_STATUS: 'mcc:message_status',
  CONVERSATION_UPDATED: 'mcc:conversation_updated',
} as const

export async function connectRedis() {
  await Promise.all([redis.connect(), redisSub.connect()])
}
