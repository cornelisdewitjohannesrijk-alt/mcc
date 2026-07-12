'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  contentType: string
  text: string | null
  mediaUrl: string | null
  timestamp: string
  status: string | null
}

interface Conversation {
  id: string
  platform: 'whatsapp' | 'messenger'
  unreadCount: number
  customer: {
    id: string
    name: string | null
    avatarUrl: string | null
    whatsappPhone: string | null
    messengerPsid: string | null
  }
}

export function ConversationView({ conversationId }: { conversationId: string }) {
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data: convData } = useQuery<{ conversation: Conversation & { messages: Message[] } }>({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.get(`/conversations/${conversationId}`).then((r) => r.data),
  })

  const conversation = convData?.conversation
  const messages = conversation?.messages ?? []

  // Mark as read when opened
  useEffect(() => {
    api.patch(`/conversations/${conversationId}/read`).catch(() => {})
  }, [conversationId])

  // Join Socket.IO room for this conversation
  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_conversation', conversationId)

    const handleNewMessage = (data: { conversationId: string; message: Message }) => {
      if (data.conversationId !== conversationId) return
      queryClient.setQueryData(
        ['conversation', conversationId],
        (old: { conversation: Conversation & { messages: Message[] } } | undefined) => {
          if (!old) return old
          const exists = old.conversation.messages.find((m) => m.id === data.message.id)
          if (exists) return old
          return {
            conversation: {
              ...old.conversation,
              messages: [...old.conversation.messages, data.message],
            },
          }
        },
      )
    }

    socket.on('new_message', handleNewMessage)
    return () => {
      socket.emit('leave_conversation', conversationId)
      socket.off('new_message', handleNewMessage)
    }
  }, [conversationId, queryClient])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const sendMutation = useMutation({
    mutationFn: (payload: { contentType: string; text: string }) =>
      api.post(`/conversations/${conversationId}/messages`, payload),
    onSuccess: () => setText(''),
  })

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    sendMutation.mutate({ contentType: 'text', text: text.trim() })
  }

  if (!conversation) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <div className="h-9 w-9 flex-shrink-0 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium">
          {conversation.customer.avatarUrl ? (
            <img src={conversation.customer.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            (conversation.customer.name?.[0] ?? '?').toUpperCase()
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {conversation.customer.name ?? conversation.customer.whatsappPhone ?? 'Unknown'}
          </p>
          <p className="text-xs capitalize text-gray-500">{conversation.platform}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 border-t border-gray-200 bg-white px-4 py-3"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend(e)
            }
          }}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 max-h-32"
        />
        <button
          type="submit"
          disabled={!text.trim() || sendMutation.isPending}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          {sendMutation.isPending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <SendIcon />
          )}
        </button>
      </form>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === 'outbound'

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
          isOutbound
            ? 'rounded-br-sm bg-brand-600 text-white'
            : 'rounded-bl-sm bg-white text-gray-900 shadow-sm border border-gray-100'
        }`}
      >
        {message.contentType === 'text' && <p className="whitespace-pre-wrap">{message.text}</p>}
        {message.contentType === 'image' && message.mediaUrl && (
          <img src={message.mediaUrl} alt="image" className="rounded-lg max-w-full" />
        )}
        {['audio', 'video', 'document'].includes(message.contentType) && (
          <a
            href={message.mediaUrl ?? '#'}
            target="_blank"
            rel="noreferrer"
            className={`text-xs underline ${isOutbound ? 'text-white' : 'text-brand-600'}`}
          >
            [{message.contentType}] Open attachment
          </a>
        )}
        {message.contentType === 'location' && <p className="text-xs italic">📍 Location shared</p>}
        {message.contentType === 'unsupported' && (
          <p className="text-xs italic opacity-70">{message.text ?? 'Unsupported message type'}</p>
        )}
        <p className={`mt-1 text-[10px] ${isOutbound ? 'text-brand-200' : 'text-gray-400'}`}>
          {format(new Date(message.timestamp), 'HH:mm')}
          {isOutbound && message.status && (
            <StatusTick status={message.status} />
          )}
        </p>
      </div>
    </div>
  )
}

function StatusTick({ status }: { status: string }) {
  const ticks: Record<string, string> = {
    sent: ' ✓',
    delivered: ' ✓✓',
    read: ' ✓✓',
    failed: ' ✗',
  }
  return <span className={status === 'read' ? 'text-blue-300' : ''}>{ticks[status] ?? ''}</span>
}

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  )
}
