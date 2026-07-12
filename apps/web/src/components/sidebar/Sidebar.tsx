'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { clearToken } from '@/lib/auth'
import { useInboxStore } from '@/store/inbox.store'
import { ConversationItem } from './ConversationItem'
import {
  IconSearch,
  IconNewChat,
  IconLogout,
  IconReplies,
  IconFilter,
  IconClose,
  IconMoon,
  IconSun,
} from '@/components/icons'
import { SavedRepliesModal } from '@/components/SavedRepliesModal'
import { useTheme } from '@/hooks/useTheme'

type Tab = 'all' | 'whatsapp' | 'messenger' | 'unread'

export function Sidebar() {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [showRepliesModal, setShowRepliesModal] = useState(false)
  const router = useRouter()
  const { theme, toggle: toggleTheme } = useTheme()

  const { conversations, activeConversationId, setActiveConversation } = useInboxStore()

  function handleLogout() {
    clearToken()
    router.push('/login')
  }

  // Stats query for unread count in tab badge
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/dashboard/stats').then((r) => r.data.stats),
    refetchInterval: 30_000,
  })

  const filtered = conversations.filter((c) => {
    if (tab === 'unread' && c.unreadCount === 0) return false
    if (tab === 'whatsapp' && c.platform !== 'whatsapp') return false
    if (tab === 'messenger' && c.platform !== 'messenger') return false
    if (search) {
      const q = search.toLowerCase()
      const name = (c.customer.name ?? '').toLowerCase()
      const phone = (c.customer.whatsappPhone ?? '')
      if (!name.includes(q) && !phone.includes(q)) return false
    }
    return true
  })

  return (
    <div className="flex h-full flex-col" style={{ borderRight: '1px solid var(--wa-divider)' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: 'var(--wa-header)' }}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-white font-semibold text-sm select-none">
            A
          </div>
          <span className="text-white font-semibold text-[15px]">MCC</span>
        </div>
        <div className="flex items-center">
          <button
            className="icon-btn icon-btn-white"
            title="Saved Replies"
            onClick={() => setShowRepliesModal(true)}
          >
            <IconReplies size={18} />
          </button>
          <button className="icon-btn icon-btn-white" title="New chat">
            <IconNewChat size={18} />
          </button>
          <button
            className="icon-btn icon-btn-white"
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
          <button
            className="icon-btn icon-btn-white"
            title="Log out"
            onClick={handleLogout}
          >
            <IconLogout size={18} />
          </button>
        </div>
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 flex-shrink-0" style={{ background: 'var(--wa-panel-bg)' }}>
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-1.5"
          style={{ background: 'var(--wa-search-bg)' }}
        >
          {searchOpen ? (
            <button
              className="text-blue-600 flex-shrink-0"
              onClick={() => { setSearch(''); setSearchOpen(false) }}
            >
              <IconClose size={18} />
            </button>
          ) : (
            <IconSearch size={16} className="text-gray-400 flex-shrink-0" />
          )}
          <input
            type="text"
            value={search}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or start new chat"
            className="flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
          />
          {!searchOpen && (
            <button className="flex-shrink-0 text-gray-400 hover:text-gray-600">
              <IconFilter size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter tabs ────────────────────────────────────────────────────── */}
      <div
        className="flex gap-2 overflow-x-auto px-3 pb-2 flex-shrink-0 no-scrollbar"
        style={{ background: 'var(--wa-panel-bg)' }}
      >
        {([
          { key: 'all', label: 'All' },
          { key: 'unread', label: `Unread${stats?.totalUnread ? ` ${stats.totalUnread}` : ''}` },
          { key: 'whatsapp', label: 'WhatsApp' },
          { key: 'messenger', label: 'Messenger' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-shrink-0 rounded-full px-3 py-0.5 text-xs font-medium transition-all ${
              tab === key
                ? 'text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            style={
              tab === key
                ? { background: 'var(--wa-header)' }
                : { background: 'var(--wa-search-bg)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Conversation list ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ background: 'var(--wa-panel-bg)' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
            <IconSearch size={32} />
            <p className="text-sm">No conversations found</p>
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={activeConversationId === conv.id}
              onClick={() => setActiveConversation(conv.id)}
            />
          ))
        )}
      </div>

      {/* ── Saved Replies Modal ─────────────────────────────────────────────── */}
      {showRepliesModal && (
        <SavedRepliesModal onClose={() => setShowRepliesModal(false)} />
      )}
    </div>
  )
}
