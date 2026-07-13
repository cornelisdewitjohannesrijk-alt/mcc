import { create } from 'zustand'
import type { WsEvent } from '@mcc/shared'

interface Conversation {
  id: string
  platform: 'whatsapp' | 'messenger'
  unreadCount: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  pinnedAt: string | null
  customer: {
    id: string
    name: string | null
    avatarUrl: string | null
    whatsappPhone: string | null
    messengerPsid: string | null
  }
}

interface InboxStore {
  conversations: Conversation[]
  activeConversationId: string | null
  setConversations: (conversations: Conversation[]) => void
  setActiveConversation: (id: string | null) => void
  handleWsEvent: (event: WsEvent) => void
}

export const useInboxStore = create<InboxStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,

  setConversations: (conversations) => set({ conversations }),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  handleWsEvent: (event) => {
    if (event.event === 'new_message') {
      set((state) => {
        const exists = state.conversations.find((c) => c.id === event.conversationId)

        if (exists) {
          // Move to top and update unread count
          const updated = state.conversations
            .map((c) =>
              c.id === event.conversationId
                ? {
                    ...c,
                    unreadCount:
                      event.message.direction === 'inbound' &&
                      state.activeConversationId !== c.id
                        ? event.conversation.unreadCount
                        : 0,
                    lastMessagePreview: event.message.text ?? `[${event.message.contentType}]`,
                    lastMessageAt: event.message.timestamp,
                  }
                : c,
            )
            .sort((a, b) => {
              // Pinned always float to top
              if (a.pinnedAt && !b.pinnedAt) return -1
              if (!a.pinnedAt && b.pinnedAt) return 1
              return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')
            })

          return { conversations: updated }
        }

        // New conversation — prepend it
        const newConv: Conversation = {
          id: event.conversationId,
          platform: event.conversation.platform,
          unreadCount: event.conversation.unreadCount,
          lastMessageAt: event.message.timestamp,
          lastMessagePreview: event.message.text ?? `[${event.message.contentType}]`,
          pinnedAt: null,
          customer: {
            id: event.conversation.customer.id,
            name: event.conversation.customer.name,
            avatarUrl: event.conversation.customer.avatarUrl ?? null,
            whatsappPhone: null,
            messengerPsid: null,
          },
        }

        return { conversations: [newConv, ...state.conversations] }
      })
    }
  },
}))
