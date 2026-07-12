'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useInboxStore } from '@/store/inbox.store'

const PLATFORM_COLORS = {
  whatsapp: 'bg-green-100 text-green-700',
  messenger: 'bg-blue-100 text-blue-700',
}

const PLATFORM_LABELS = {
  whatsapp: 'WA',
  messenger: 'FB',
}

export function ConversationList({ loading }: { loading: boolean }) {
  const { conversations, activeConversationId, setActiveConversation } = useInboxStore()
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState<'all' | 'whatsapp' | 'messenger'>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const filtered = conversations.filter((c) => {
    if (unreadOnly && c.unreadCount === 0) return false
    if (platformFilter !== 'all' && c.platform !== platformFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = (c.customer.name ?? '').toLowerCase()
      const phone = (c.customer.whatsappPhone ?? '').toLowerCase()
      if (!name.includes(q) && !phone.includes(q)) return false
    }
    return true
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search + filters */}
      <div className="space-y-2 px-3 py-2 border-b border-gray-100">
        <input
          type="search"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        <div className="flex gap-1.5">
          {(['all', 'whatsapp', 'messenger'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${
                platformFilter === p
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setUnreadOnly(!unreadOnly)}
            className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              unreadOnly ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Unread
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <ConversationSkeletons />
        ) : filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No conversations</p>
        ) : (
          filtered.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveConversation(conv.id)}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                activeConversationId === conv.id ? 'bg-brand-50 hover:bg-brand-50' : ''
              }`}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                  {conv.customer.avatarUrl ? (
                    <img
                      src={conv.customer.avatarUrl}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    (conv.customer.name?.[0] ?? '?').toUpperCase()
                  )}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 rounded-full px-1 py-0 text-[10px] font-bold ${
                    PLATFORM_COLORS[conv.platform]
                  }`}
                >
                  {PLATFORM_LABELS[conv.platform]}
                </span>
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">
                    {conv.customer.name ?? conv.customer.whatsappPhone ?? conv.customer.messengerPsid ?? 'Unknown'}
                  </span>
                  {conv.lastMessageAt && (
                    <span className="flex-shrink-0 text-xs text-gray-400">
                      {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: false })}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="truncate text-xs text-gray-500">{conv.lastMessagePreview ?? ''}</p>
                  {conv.unreadCount > 0 && (
                    <span className="flex-shrink-0 h-4 min-w-4 rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white flex items-center justify-center">
                      {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function ConversationSkeletons() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-200 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 rounded bg-gray-200 animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-gray-200 animate-pulse" />
          </div>
        </div>
      ))}
    </>
  )
}
