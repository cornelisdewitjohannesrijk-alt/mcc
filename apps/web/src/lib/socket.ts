import { io, Socket } from 'socket.io-client'
import type { WsEvent } from '@mcc/shared'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000', {
      transports: ['websocket'],
      autoConnect: false,
    })
  }
  return socket
}

export function connectSocket(onEvent: (event: WsEvent) => void) {
  const s = getSocket()

  s.connect()

  // Keep named references so cleanup only removes THIS handler, not all handlers
  // (ChatPanel registers its own listeners on the same socket)
  const onNewMessage = (data: object) => onEvent({ event: 'new_message', ...(data as Record<string, unknown>) } as WsEvent)
  const onStatus = (data: object) => onEvent({ event: 'message_status', ...(data as Record<string, unknown>) } as WsEvent)
  const onConvUpdated = (data: object) => onEvent({ event: 'conversation_updated', ...(data as Record<string, unknown>) } as WsEvent)

  s.on('new_message', onNewMessage)
  s.on('message_status', onStatus)
  s.on('conversation_updated', onConvUpdated)

  return () => {
    s.off('new_message', onNewMessage)
    s.off('message_status', onStatus)
    s.off('conversation_updated', onConvUpdated)
    // Do NOT disconnect — the socket is shared with ChatPanel; keep it alive
  }
}
