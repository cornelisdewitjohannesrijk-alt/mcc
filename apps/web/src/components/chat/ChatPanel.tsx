'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isSameDay } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { MessageBubble, type Message } from './MessageBubble'
import { DateDivider } from './DateDivider'
import { MessageComposer } from './MessageComposer'
import { ForwardModal } from './ForwardModal'
import { useInboxStore } from '@/store/inbox.store'
import {
  IconSearch,
  IconVideo,
  IconPhone,
  IconMenu,
  IconBack,
  IconWhatsApp,
  IconMessenger,
} from '@/components/icons'

// Deterministic avatar color
const AVATAR_COLORS = ['#fe9b2d','#fe2d6b','#b65ede','#5e87de','#32c5d2','#56be6e']
function avatarColor(name: string | null) {
  if (!name) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

interface Conversation {
  id: string
  platform: 'whatsapp' | 'messenger'
  status: string
  lastCustomerMessageAt: string | null
  customer: {
    id: string
    name: string | null
    avatarUrl: string | null
    whatsappPhone: string | null
    messengerPsid: string | null
  }
  messages: Message[]
}

interface ReplyContext {
  platformMessageId: string
  text: string | null
  sender: string | null  // 'You' for outbound, customer name for inbound
}

export function ChatPanel({ conversationId }: { conversationId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [windowWarning, setWindowWarning] = useState(false)
  const [windowExpired, setWindowExpired] = useState(false)
  const [replyTo, setReplyTo] = useState<ReplyContext | null>(null)
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const setActiveConversation = useInboxStore((s) => s.setActiveConversation)
  const conversations = useInboxStore((s) => s.conversations)
  const setConversations = useInboxStore((s) => s.setConversations)

  const { data, isLoading } = useQuery<{ conversation: Conversation }>({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.get(`/conversations/${conversationId}`).then((r) => r.data),
    staleTime: 0,
  })

  const conversation = data?.conversation
  const messages = conversation?.messages ?? []

  // Mark read on open
  useEffect(() => {
    api.patch(`/conversations/${conversationId}/read`).catch(() => {})
  }, [conversationId])

  // Check WhatsApp 24h window
  useEffect(() => {
    if (!conversation) return
    if (conversation.platform !== 'whatsapp') {
      setWindowWarning(false)
      setWindowExpired(false)
      return
    }
    const last = conversation.lastCustomerMessageAt
    if (!last) { setWindowWarning(false); setWindowExpired(false); return }
    const hours = (Date.now() - new Date(last).getTime()) / 3_600_000
    setWindowExpired(hours >= 24)
    setWindowWarning(hours >= 22 && hours < 24)
  }, [conversation])

  // Socket: join room and handle incoming messages
  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_conversation', conversationId)

    const handler = (data: { conversationId: string; message: Message }) => {
      if (data.conversationId !== conversationId) return
      queryClient.setQueryData(
        ['conversation', conversationId],
        (old: { conversation: Conversation } | undefined) => {
          if (!old) return old
          const exists = old.conversation.messages.some((m) => m.id === data.message.id)
          if (exists) return old
          return { conversation: { ...old.conversation, messages: [...old.conversation.messages, data.message] } }
        },
      )
    }

    const statusHandler = (data: { platformMessageId: string; status: string }) => {
      queryClient.setQueryData(
        ['conversation', conversationId],
        (old: { conversation: Conversation } | undefined) => {
          if (!old) return old
          return {
            conversation: {
              ...old.conversation,
              messages: old.conversation.messages.map((m) =>
                m.id === data.platformMessageId ? { ...m, status: data.status } : m,
              ),
            },
          }
        },
      )
    }

    socket.on('new_message', handler)
    socket.on('message_status', statusHandler)
    return () => {
      socket.emit('leave_conversation', conversationId)
      socket.off('new_message', handler)
      socket.off('message_status', statusHandler)
    }
  }, [conversationId, queryClient])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const renameMutation = useMutation({
    mutationFn: (name: string) =>
      api.patch(`/customers/${conversation?.customer.id}`, { name }),
    onSuccess: (res) => {
      const newName = res.data.customer.name
      // Update the query cache for this conversation
      queryClient.setQueryData(
        ['conversation', conversationId],
        (old: { conversation: Conversation } | undefined) => {
          if (!old) return old
          return { conversation: { ...old.conversation, customer: { ...old.conversation.customer, name: newName } } }
        },
      )
      // Update sidebar list
      setConversations(
        conversations.map((c) =>
          c.id === conversationId ? { ...c, customer: { ...c.customer, name: newName } } : c,
        ),
      )
      setEditingName(false)
    },
    onError: () => toast.error('Failed to rename'),
  })

  const startEditing = useCallback(() => {
    setNameInput(conversation?.customer.name ?? '')
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.select(), 0)
  }, [conversation?.customer.name])

  function commitRename() {
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === conversation?.customer.name) {
      setEditingName(false)
      return
    }
    renameMutation.mutate(trimmed)
  }

  const sendMutation = useMutation({
    mutationFn: ({
      text,
      mediaUrl,
      mediaType,
      mediaFilename,
      contentType,
      replyToMessageId,
      replyToText,
      replyToSender,
    }: {
      text: string
      mediaUrl?: string
      mediaType?: string
      mediaFilename?: string
      contentType?: string
      replyToMessageId?: string
      replyToText?: string
      replyToSender?: string
    }) =>
      api.post(`/conversations/${conversationId}/messages`, {
        contentType: contentType ?? 'text',
        text: text || undefined,
        mediaUrl,
        mediaType,
        mediaFilename,
        replyToMessageId,
        replyToText: replyToText ?? undefined,
        replyToSender: replyToSender ?? undefined,
      }),
    onSuccess: () => {
      setReplyTo(null)
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Failed to send'
      toast.error(msg)
    },
  })

  // Build message list with date dividers
  const messageNodes = useMemo(() => {
    const nodes: React.ReactNode[] = []
    let prevDate: Date | null = null
    let prevDirection: string | null = null

    messages.forEach((msg, i) => {
      const d = new Date(msg.timestamp)
      if (!prevDate || !isSameDay(prevDate, d)) {
        nodes.push(<DateDivider key={`date-${msg.id}`} date={d} />)
        prevDate = d
        prevDirection = null
      }

      // "isFirst" = first message in a consecutive run from same sender
      const isFirst = prevDirection !== msg.direction
      prevDirection = msg.direction

      nodes.push(
        <MessageBubble
          key={msg.id}
          message={msg}
          conversationId={conversationId}
          isFirst={isFirst}
          isLast={i === messages.length - 1 || messages[i + 1]?.direction !== msg.direction}
          onReply={(m) => {
            if (!m.platformMessageId) return
            setReplyTo({
              platformMessageId: m.platformMessageId,
              text: m.text ?? `[${m.contentType}]`,
              sender: m.direction === 'outbound' ? 'You' : (conversation?.customer.name ?? 'Customer'),
            })
          }}
          onForward={(m) => setForwardMsg(m)}
        />,
      )
    })

    return nodes
  }, [messages])

  if (isLoading || !conversation) {
    return (
      <div className="flex h-full items-center justify-center chat-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  const { customer, platform } = conversation
  const displayName = customer.name ?? customer.whatsappPhone ?? customer.messengerPsid ?? 'Unknown'

  return (
    <div className="flex h-full flex-col">
      {/* ── Chat header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-2 py-2 flex-shrink-0"
        style={{ background: 'var(--wa-search-bg)', borderBottom: '1px solid var(--wa-divider)' }}
      >
        <div className="flex items-center gap-1">
          {/* Back button — only visible on mobile */}
          <button
            className="icon-btn md:hidden"
            onClick={() => setActiveConversation(null)}
            aria-label="Back to conversations"
          >
            <IconBack size={22} />
          </button>
          {/* Avatar */}
          <div className="relative">
            {customer.avatarUrl ? (
              <img src={customer.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-medium"
                style={{ background: avatarColor(customer.name) }}
              >
                {(displayName[0] ?? '?').toUpperCase()}
              </div>
            )}
          </div>
          <div>
            {editingName ? (
              <input
                ref={nameInputRef}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setEditingName(false)
                }}
                className="text-[15px] font-semibold rounded px-1 outline-none border-b w-40"
                style={{ background: 'var(--wa-search-bg)', color: 'var(--wa-bubble-out-text)', borderColor: 'var(--wa-header)' }}
                autoFocus
              />
            ) : (
              <button
                className="text-[15px] font-semibold leading-tight hover:underline text-left"
                style={{ color: 'var(--wa-bubble-out-text)' }}
                onClick={startEditing}
                title="Click to rename"
              >
                {displayName}
              </button>
            )}
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--wa-timestamp)' }}>
              {platform === 'whatsapp' ? (
                <><IconWhatsApp size={11} className="text-green-500" /> WhatsApp</>
              ) : (
                <><IconMessenger size={11} className="text-blue-500" /> Messenger</>
              )}
              {customer.whatsappPhone && (
                <span className="ml-1">{customer.whatsappPhone}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center">
          <button className="icon-btn" title="Video call"><IconVideo size={20} /></button>
          <button className="icon-btn" title="Voice call"><IconPhone size={20} /></button>
          <button className="icon-btn" title="Search"><IconSearch size={20} /></button>
          <button className="icon-btn" title="More options"><IconMenu size={20} /></button>
        </div>
      </div>

      {/* ── 24h window warning / expired ────────────────────────────────────── */}
      {windowExpired && (
        <div
          className="flex items-center justify-center gap-2 px-4 py-2 text-xs flex-shrink-0"
          style={{ background: '#fde8e8', color: '#9b1c1c' }}
        >
          <span>🚫</span>
          <span>
            WhatsApp 24-hour window has expired. The customer must message you first to reopen it.
          </span>
        </div>
      )}
      {windowWarning && (
        <div
          className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs flex-shrink-0"
          style={{ background: '#fff3cd', color: '#856404' }}
        >
          <span>⚠</span>
          <span>
            WhatsApp messaging window closes in under 2 hours. Reply soon or wait for the customer to message again.
          </span>
        </div>
      )}

      {/* ── Messages area ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto chat-bg py-2">
        {messageNodes}
        <div ref={bottomRef} className="h-2" />
      </div>

      {/* ── Composer ─────────────────────────────────────────────────────────── */}
      {forwardMsg && (
        <ForwardModal
          message={forwardMsg}
          conversationId={conversationId}
          onClose={() => setForwardMsg(null)}
        />
      )}

      <MessageComposer
        onSend={(text, mediaUrl, mediaType, mediaFilename, contentType) =>
          sendMutation.mutate({
            text,
            mediaUrl,
            mediaType,
            mediaFilename,
            contentType,
            replyToMessageId: replyTo?.platformMessageId,
            replyToText: replyTo?.text ?? undefined,
            replyToSender: replyTo?.sender ?? undefined,
          })
        }
        replyTo={replyTo}
        onReplyCancel={() => setReplyTo(null)}
        disabled={sendMutation.isPending || windowExpired}
      />
    </div>
  )
}
