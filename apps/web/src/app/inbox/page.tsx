'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { connectSocket } from '@/lib/socket'
import { useInboxStore } from '@/store/inbox.store'
import { useNotifications } from '@/hooks/useNotifications'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { WelcomeScreen } from '@/components/chat/WelcomeScreen'

export default function InboxPage() {
  const { setConversations, handleWsEvent, activeConversationId, setActiveConversation } = useInboxStore()
  const { permission, requestPermission, notify } = useNotifications()
  const queryClient = useQueryClient()
  usePushNotifications()

  // ── Swipe-back gesture ────────────────────────────────────────────────────
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const isHorizontalSwipe = useRef<boolean | null>(null)
  const [dragX, setDragX] = useState(0)
  const isDragging = dragX > 0

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    isHorizontalSwipe.current = null
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!activeConversationId) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current

    // Determine dominant axis on first meaningful movement
    if (isHorizontalSwipe.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      isHorizontalSwipe.current = Math.abs(dx) > Math.abs(dy)
    }

    // Only track rightward swipes (going back to list)
    if (isHorizontalSwipe.current && dx > 0) {
      setDragX(Math.min(dx, window.innerWidth ?? 400))
    }
  }

  function onTouchEnd() {
    if (dragX > (window.innerWidth ?? 400) * 0.35) {
      setActiveConversation(null)
    }
    setDragX(0)
  }

  // Fetch initial conversations
  const { data } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get('/conversations').then((r) => r.data),
  })

  useEffect(() => {
    if (data?.conversations) setConversations(data.conversations)
  }, [data, setConversations])

  useEffect(() => {
    if (permission === 'default') {
      const t = setTimeout(() => requestPermission(), 3000)
      return () => clearTimeout(t)
    }
  }, [permission, requestPermission])

  useEffect(() => {
    const disconnect = connectSocket((event) => {
      handleWsEvent(event)

      if (event.event === 'new_message') {
        // Keep the conversation cache up-to-date for ALL conversations, not just
        // the open one. This means when the user taps a chat that received a new
        // message while they were elsewhere, it opens instantly with the latest
        // messages instead of showing stale data until the 30s staleTime expires.
        queryClient.setQueryData(
          ['conversation', event.conversationId],
          (old: { conversation: { messages: { id: string }[] } } | undefined) => {
            if (!old) return old // only update if the conversation was already cached
            if (old.conversation.messages.some((m) => m.id === event.message.id)) return old
            return {
              conversation: {
                ...old.conversation,
                messages: [...old.conversation.messages, event.message],
              },
            }
          },
        )

        // Push notification for inbound messages not in the active chat
        if (
          event.message.direction === 'inbound' &&
          event.conversationId !== activeConversationId
        ) {
          notify(event.conversation.customer.name ?? 'New message', {
            body: event.message.text ?? `[${event.message.contentType}]`,
            tag: event.conversationId,
            onClick: () => useInboxStore.getState().setActiveConversation(event.conversationId),
          })
        }
      }
    })

    return disconnect
  }, [handleWsEvent, notify, activeConversationId, queryClient])

  const chatOpen = !!activeConversationId
  // No transition during active finger drag — let it feel instantaneous
  const transition = isDragging ? 'none' : 'transform 300ms cubic-bezier(0.4,0,0.2,1)'
  // Sidebar parallax: moves at 30% speed so it feels like depth
  const sidebarDrag = dragX * 0.3
  // Dim overlay opacity decreases as you drag the chat panel away
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 400
  const overlayOpacity = chatOpen ? Math.max(0, 1 - dragX / screenW) * 0.45 : 0

  return (
    /*
     * Layout:
     *   Mobile  (< md): both panels always in DOM, slide with CSS transform.
     *     – Sidebar: translateX(-30%) when chat open (parallax peek left)
     *     – Chat:    translateX(100%) normally, translateX(0) when open
     *     – During swipe-back both track the finger
     *   Desktop (≥ md): side-by-side with md:static / md:relative overrides
     */
    <div className="relative flex h-[100dvh] overflow-hidden" style={{ background: 'var(--wa-panel-bg)' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-y-0 left-0 w-full h-full md:relative md:w-[400px] md:flex-shrink-0 md:!transform-none"
        style={{
          transform: chatOpen
            ? `translateX(calc(-30% + ${sidebarDrag}px))`
            : 'translateX(0)',
          transition,
          willChange: 'transform',
        }}
      >
        <Sidebar />
      </div>

      {/* ── Dim overlay (mobile only) ────────────────────────────────────────── */}
      <div
        className="absolute inset-0 md:hidden pointer-events-none"
        style={{
          background: `rgba(0,0,0,${overlayOpacity})`,
          transition: isDragging ? 'none' : 'background 300ms',
          zIndex: 15,
        }}
      />

      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-y-0 right-0 w-full h-full md:relative md:flex-1 md:!transform-none"
        style={{
          transform: chatOpen ? `translateX(${dragX}px)` : 'translateX(100%)',
          transition,
          willChange: 'transform',
          zIndex: 20,
          // Subtle shadow makes it feel like a card lifted above the sidebar
          boxShadow: chatOpen ? '-4px 0 20px rgba(0,0,0,0.15)' : 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {activeConversationId ? (
          <ChatPanel key={activeConversationId} conversationId={activeConversationId} />
        ) : (
          <WelcomeScreen />
        )}
      </div>

    </div>
  )
}
