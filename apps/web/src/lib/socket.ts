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

  s.on('new_message', (data) => onEvent({ event: 'new_message', ...data }))
  s.on('message_status', (data) => onEvent({ event: 'message_status', ...data }))
  s.on('conversation_updated', (data) => onEvent({ event: 'conversation_updated', ...data }))

  return () => {
    s.off('new_message')
    s.off('message_status')
    s.off('conversation_updated')
    s.disconnect()
  }
}
