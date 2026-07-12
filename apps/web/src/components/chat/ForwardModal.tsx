'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { IconClose, IconSearch, IconWhatsApp, IconMessenger } from '@/components/icons'
import { useInboxStore } from '@/store/inbox.store'
import type { Message } from './MessageBubble'

interface Props {
  message: Message
  conversationId: string
  onClose: () => void
}

export function ForwardModal({ message, conversationId, onClose }: Props) {
  const [search, setSearch] = useState('')
  const { conversations } = useInboxStore()

  const forwardMutation = useMutation({
    mutationFn: (targetConversationId: string) =>
      api.post(`/conversations/${conversationId}/messages/${message.id}/forward`, {
        targetConversationId,
      }),
    onSuccess: () => {
      toast.success('Message forwarded')
      onClose()
    },
    onError: () => toast.error('Failed to forward message'),
  })

  const filtered = conversations.filter((c) => {
    if (c.id === conversationId) return false // don't forward to same chat
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (c.customer.name ?? '').toLowerCase().includes(q) ||
      (c.customer.whatsappPhone ?? '').includes(q)
    )
  })

  const preview = message.text ?? `[${message.contentType}]`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--wa-panel-bg)', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: 'var(--wa-header)' }}
        >
          <h2 className="text-white font-semibold text-[15px]">Forward message</h2>
          <button className="icon-btn icon-btn-white" onClick={onClose}>
            <IconClose size={18} />
          </button>
        </div>

        {/* Message preview */}
        <div className="px-4 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--wa-divider)' }}>
          <p className="text-xs" style={{ color: 'var(--wa-timestamp)' }}>Forwarding:</p>
          <p className="text-sm truncate mt-0.5" style={{ color: 'var(--wa-bubble-out-text)' }}>{preview}</p>
        </div>

        {/* Search */}
        <div className="px-3 py-2 flex-shrink-0" style={{ background: 'var(--wa-search-bg)' }}>
          <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: 'var(--wa-panel-bg)' }}>
            <IconSearch size={14} className="text-gray-400 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats…"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--wa-bubble-out-text)' }}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: 'var(--wa-timestamp)' }}>No chats found</p>
          ) : (
            filtered.map((conv) => {
              const name = conv.customer.name ?? conv.customer.whatsappPhone ?? conv.customer.messengerPsid ?? 'Unknown'
              return (
                <button
                  key={conv.id}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:opacity-80"
                  style={{ background: 'var(--wa-panel-bg)', borderBottom: '1px solid var(--wa-divider)' }}
                  onClick={() => forwardMutation.mutate(conv.id)}
                  disabled={forwardMutation.isPending}
                >
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center text-white font-medium flex-shrink-0 text-sm"
                    style={{ background: 'var(--wa-header)' }}
                  >
                    {name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--wa-bubble-out-text)' }}>{name}</p>
                    <p className="text-xs flex items-center gap-1" style={{ color: 'var(--wa-timestamp)' }}>
                      {conv.platform === 'whatsapp'
                        ? <><IconWhatsApp size={10} className="text-green-500" /> WhatsApp</>
                        : <><IconMessenger size={10} className="text-blue-400" /> Messenger</>
                      }
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
