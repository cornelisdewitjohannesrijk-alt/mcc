import { Server as SocketIOServer } from 'socket.io'
import type { Server as HttpServer } from 'http'
import { redisSub, REDIS_CHANNELS } from '../redis/client'
import { config } from '../config'

let io: SocketIOServer | null = null

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.NODE_ENV === 'development' ? '*' : process.env.NEXT_PUBLIC_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })

  // ── Auth middleware ────────────────────────────────────────────────────────
  // For now, we accept any connection. In production, validate the JWT token
  // passed as a handshake auth parameter.
  io.use((socket, next) => {
    // const token = socket.handshake.auth.token
    // Validate JWT here when ready
    next()
  })

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`)

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`)
    })

    // Client can join a specific conversation room to receive targeted updates
    socket.on('join_conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`)
    })

    socket.on('leave_conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`)
    })
  })

  // ── Redis → Socket.IO bridge ──────────────────────────────────────────────
  // All webhook handlers publish to Redis. This bridge fans those events out
  // to all connected WebSocket clients.

  subscribeToRedisChannels()

  console.log('[Socket.IO] Server initialized')
  return io
}

function subscribeToRedisChannels() {
  const channels = Object.values(REDIS_CHANNELS)
  redisSub.subscribe(...channels, (err) => {
    if (err) console.error('[Redis] Subscription error:', err)
    else console.log(`[Redis] Subscribed to channels: ${channels.join(', ')}`)
  })

  redisSub.on('message', (channel, message) => {
    if (!io) return

    try {
      const data = JSON.parse(message)

      switch (channel) {
        case REDIS_CHANNELS.NEW_MESSAGE:
          // Broadcast to all connected clients (inbox update)
          io.emit('new_message', data)
          // Also send to the specific conversation room
          if (data.conversationId) {
            io.to(`conversation:${data.conversationId}`).emit('new_message', data)
          }
          break

        case REDIS_CHANNELS.MESSAGE_STATUS:
          io.emit('message_status', data)
          break

        case REDIS_CHANNELS.CONVERSATION_UPDATED:
          io.emit('conversation_updated', data)
          break
      }
    } catch (err) {
      console.error('[Socket.IO] Failed to parse Redis message:', err)
    }
  })
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized')
  return io
}
