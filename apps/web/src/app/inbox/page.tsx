'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { connectSocket } from '@/lib/socket'
import { useInboxStore } from '@/store/inbox.store'
import { useNotifications } from '@/hooks/useNotifications'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { WelcomeScreen } from '@/components/chat/WelcomeScreen'

export default function InboxPage() {
  const { setConversations, handleWsEvent, activeConversationId } = useInboxStore()
  const { permission, requestPermission, notify } = useNotifications()

  // Fetch initial conversations
  const { data } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get('/conversations').then((r) => r.data),
  })

  useEffect(() => {
    if (data?.conversations) setConversations(data.conversations)
  }, [data, setConversations])

  // Request notification permission once on mount
  useEffect(() => {
    if (permission === 'default') {
      // Small delay so the browser doesn't block the prompt as untrusted
      const t = setTimeout(() => requestPermission(), 3000)
      return () => clearTimeout(t)
    }
  }, [permission, requestPermission])

  // WebSocket — wire up notifications for non-active conversations
  useEffect(() => {
    const disconnect = connectSocket((event) => {
      handleWsEvent(event)

      if (
        event.event === 'new_message' &&
        event.message.direction === 'inbound' &&
        event.conversationId !== activeConversationId
      ) {
        notify(event.conversation.customer.name ?? 'New message', {
          body: event.message.text ?? `[${event.message.contentType}]`,
          tag: event.conversationId, // collapse multiple notifications per convo
          onClick: () => useInboxStore.getState().setActiveConversation(event.conversationId),
        })
      }
    })

    return disconnect
  }, [handleWsEvent, notify, activeConversationId])

  const showSidebar = !activeConversationId  // mobile: hide sidebar when chat open
  const showChat = !!activeConversationId     // mobile: show chat when selected

  return (
    /*
     * Layout strategy:
     *  Mobile  (< md): stack — show sidebar OR chat, full width
     *  Desktop (≥ md): side-by-side — sidebar 400px + chat flex-1
     *
     * We use dvh (dynamic viewport height) so the layout shrinks correctly
     * when the mobile keyboard appears.
     */
    <div className="flex h-[100dvh] overflow-hidden bg-gray-200">
      {/* ── Sidebar ── */}
      <div
        className={[
          // Mobile: full width, hidden when chat is open
          'w-full flex-shrink-0 h-full',
          showSidebar ? 'flex' : 'hidden',
          // Desktop: always visible, fixed width
          'md:flex md:w-[400px]',
        ].join(' ')}
      >
        <div className="w-full h-full">
          <Sidebar />
        </div>
      </div>

      {/* ── Chat panel ── */}
      <div
        className={[
          // Mobile: full width, only shown when a conversation is active
          'flex-1 h-full overflow-hidden',
          showChat ? 'flex flex-col' : 'hidden',
          // Desktop: always visible (shows welcome screen if no conversation)
          'md:flex md:flex-col',
        ].join(' ')}
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
