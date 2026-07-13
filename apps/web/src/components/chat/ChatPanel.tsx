'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { isSameDay } from 'date-fns'
import toast from 'react-hot-toast'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string
  platform: 'whatsapp' | 'messenger'
  status: string
  lastCustomerMessageAt: string | null
  hasMoreMessages?: boolean
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
  sender: string | null
}

type ChatItem =
  | { kind: 'date'; key: string; date: Date }
  | { kind: 'message'; key: string; msg: Message; isFirst: boolean; isLast: boolean }

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#fe9b2d','#fe2d6b','#b65ede','#5e87de','#32c5d2','#56be6e']
function avatarColor(name: string | null) {
  if (!name) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function buildItems(messages: Message[]): ChatItem[] {
  const items: ChatItem[] = []
  let prevDate: Date | null = null
  let prevDir: string | null = null

  messages.forEach((msg, i) => {
    const d = new Date(msg.timestamp)
    if (!prevDate || !isSameDay(prevDate, d)) {
      items.push({ kind: 'date', key: `date-${msg.id}`, date: d })
      prevDate = d
      prevDir = null
    }
    const isFirst = prevDir !== msg.direction
    prevDir = msg.direction
    const next = messages[i + 1]
    const isLast = !next || next.direction !== msg.direction
    items.push({ kind: 'message', key: msg.id, msg, isFirst, isLast })
  })

  return items
}

// Large starting index so prepending items doesn't hit 0
const ITEM_START = 1_000_000

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatPanel({ conversationId }: { conversationId: string }) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const setActiveConversation = useInboxStore((s) => s.setActiveConversation)
  const conversations = useInboxStore((s) => s.conversations)
  const setConversations = useInboxStore((s) => s.setConversations)

  // ── Local message state ────────────────────────────────────────────────────
  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [firstItemIndex, setFirstItemIndex] = useState(ITEM_START)
  const scrolledToBottomRef = useRef(false)

  // ── Other UI state ─────────────────────────────────────────────────────────
  const [windowWarning, setWindowWarning] = useState(false)
  const [windowExpired, setWindowExpired] = useState(false)
  const [replyTo, setReplyTo] = useState<ReplyContext | null>(null)
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  // ── Fetch conversation metadata + initial messages ─────────────────────────
  const { data, isLoading } = useQuery<{ conversation: Conversation }>({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.get(`/conversations/${conversationId}`).then((r) => r.data),
    staleTime: 30_000, // don't refetch if we opened this chat in the last 30s
    refetchOnWindowFocus: false,
  })

  const conversation = data?.conversation

  // Populate local messages when conversation data arrives
  // conversation?.id as dep: fires once per conversation load (cache or network)
  useEffect(() => {
    if (!conversation) return
    setLocalMessages(conversation.messages)
    setHasMore(conversation.hasMoreMessages ?? false)
    setFirstItemIndex(ITEM_START)
    scrolledToBottomRef.current = false // arm the scroll-to-bottom
  }, [conversation?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark read ─────────────────────────────────────────────────────────────
  useEffect(() => {
    api.patch(`/conversations/${conversationId}/read`).catch(() => {})
  }, [conversationId])

  // ── WhatsApp 24h window ────────────────────────────────────────────────────
  useEffect(() => {
    if (!conversation) return
    if (conversation.platform !== 'whatsapp') {
      setWindowWarning(false); setWindowExpired(false); return
    }
    const last = conversation.lastCustomerMessageAt
    if (!last) { setWindowWarning(false); setWindowExpired(false); return }
    const hours = (Date.now() - new Date(last).getTime()) / 3_600_000
    setWindowExpired(hours >= 24)
    setWindowWarning(hours >= 22 && hours < 24)
  }, [conversation])

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_conversation', conversationId)

    const onNewMessage = (data: { conversationId: string; message: Message }) => {
      if (data.conversationId !== conversationId) return
      setLocalMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev
        return [...prev, data.message]
      })
    }

    const onStatus = (data: { platformMessageId: string; status: string }) => {
      setLocalMessages((prev) =>
        prev.map((m) =>
          m.platformMessageId === data.platformMessageId ? { ...m, status: data.status } : m,
        ),
      )
    }

    socket.on('new_message', onNewMessage)
    socket.on('message_status', onStatus)
    return () => {
      socket.emit('leave_conversation', conversationId)
      socket.off('new_message', onNewMessage)
      socket.off('message_status', onStatus)
    }
  }, [conversationId])

  // ── Load older messages (scroll to top) ───────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || localMessages.length === 0) return
    setLoadingMore(true)
    try {
      const oldest = localMessages[0]
      const res = await api.get(`/conversations/${conversationId}/messages`, {
        params: { before: oldest.id, limit: 50 },
      })
      const older: Message[] = res.data.messages
      if (older.length === 0) { setHasMore(false); return }
      const olderItems = buildItems(older)
      setFirstItemIndex((prev) => prev - olderItems.length)
      setLocalMessages((prev) => [...older, ...prev])
      setHasMore(older.length === 50)
    } catch {
      // silently ignore — user can scroll up again
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, localMessages, conversationId])

  // ── Star handler ──────────────────────────────────────────────────────────
  const handleStar = useCallback((msgId: string, starred: boolean) => {
    setLocalMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, starred } : m))
    api.patch(`/conversations/${conversationId}/messages/${msgId}/star`, { starred }).catch(() => {})
  }, [conversationId])

  // ── Reply handler ─────────────────────────────────────────────────────────
  const handleReply = useCallback((m: Message) => {
    if (!m.platformMessageId) return
    setReplyTo({
      platformMessageId: m.platformMessageId,
      text: m.text ?? `[${m.contentType}]`,
      sender: m.direction === 'outbound' ? 'You' : (conversation?.customer.name ?? 'Customer'),
    })
  }, [conversation?.customer.name])

  // ── Build virtuoso items ───────────────────────────────────────────────────
  const items = useMemo(() => buildItems(localMessages), [localMessages])

  // ── Scroll to bottom once after initial items are rendered ─────────────────
  useEffect(() => {
    if (scrolledToBottomRef.current || items.length === 0) return
    scrolledToBottomRef.current = true
    // Double rAF: first tick for React state flush, second for Virtuoso render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'instant' })
      })
    })
  }, [items.length])

  // ── Rename mutation ────────────────────────────────────────────────────────
  const renameMutation = useMutation({
    mutationFn: (name: string) =>
      api.patch(`/customers/${conversation?.customer.id}`, { name }),
    onSuccess: (res) => {
      const newName = res.data.customer.name
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
    if (!trimmed || trimmed === conversation?.customer.name) { setEditingName(false); return }
    renameMutation.mutate(trimmed)
  }

  // ── Send mutation ─────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: ({
      text, mediaUrl, mediaType, mediaFilename, contentType,
      replyToMessageId, replyToText, replyToSender,
    }: {
      text: string; mediaUrl?: string; mediaType?: string; mediaFilename?: string
      contentType?: string; replyToMessageId?: string; replyToText?: string; replyToSender?: string
    }) =>
      api.post(`/conversations/${conversationId}/messages`, {
        contentType: contentType ?? 'text',
        text: text || undefined,
        mediaUrl, mediaType, mediaFilename,
        replyToMessageId,
        replyToText: replyToText ?? undefined,
        replyToSender: replyToSender ?? undefined,
      }).then((r) => r.data.message as Message),
    onSuccess: (sentMessage) => {
      setReplyTo(null)
      // Add the sent message immediately — don't wait for the socket event
      if (sentMessage?.id) {
        setLocalMessages((prev) => {
          if (prev.some((m) => m.id === sentMessage.id)) return prev
          return [...prev, sentMessage]
        })
        // Scroll to the new message
        requestAnimationFrame(() => {
          virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' })
        })
      }
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to send'
      toast.error(msg)
    },
  })

  // ── Loading state ─────────────────────────────────────────────────────────
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
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-2 py-2 flex-shrink-0"
        style={{ background: 'var(--wa-search-bg)', borderBottom: '1px solid var(--wa-divider)' }}
      >
        <div className="flex items-center gap-1">
          <button className="icon-btn md:hidden" onClick={() => setActiveConversation(null)} aria-label="Back">
            <IconBack size={22} />
          </button>
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
              {customer.whatsappPhone && <span className="ml-1">{customer.whatsappPhone}</span>}
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

      {/* ── Window warnings ────────────────────────────────────────────────── */}
      {windowExpired && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs flex-shrink-0" style={{ background: '#fde8e8', color: '#9b1c1c' }}>
          <span>🚫</span>
          <span>WhatsApp 24-hour window has expired. The customer must message you first to reopen it.</span>
        </div>
      )}
      {windowWarning && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs flex-shrink-0" style={{ background: '#fff3cd', color: '#856404' }}>
          <span>⚠</span>
          <span>WhatsApp messaging window closes in under 2 hours. Reply soon or wait for the customer to message again.</span>
        </div>
      )}

      {/* ── Virtualized message list ───────────────────────────────────────── */}
      <Virtuoso
        ref={virtuosoRef}
        className="flex-1 chat-bg"
        data={items}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={items.length > 0 ? items.length - 1 : 0}
        followOutput="auto"
        alignToBottom
        startReached={loadMore}
        components={{
          Header: () => loadingMore ? (
            <div className="flex justify-center py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            </div>
          ) : hasMore ? (
            <div className="flex justify-center py-2">
              <button
                className="text-xs px-3 py-1 rounded-full"
                style={{ color: 'var(--wa-header)', background: 'var(--wa-search-bg)' }}
                onClick={loadMore}
              >
                Load older messages
              </button>
            </div>
          ) : null,
        }}
        itemContent={(_, item) => {
          if (item.kind === 'date') return <DateDivider key={item.key} date={item.date} />
          return (
            <MessageBubble
              key={item.key}
              message={item.msg}
              isFirst={item.isFirst}
              isLast={item.isLast}
              onReply={handleReply}
              onForward={(m) => setForwardMsg(m)}
              onStar={handleStar}
            />
          )
        }}
      />

      {/* ── Composer ──────────────────────────────────────────────────────── */}
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
            text, mediaUrl, mediaType, mediaFilename, contentType,
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
