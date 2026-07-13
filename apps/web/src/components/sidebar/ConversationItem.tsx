'use client'

import { format, isToday, isYesterday } from 'date-fns'
import { IconCheck, IconWhatsApp, IconMessenger } from '@/components/icons'
import React from 'react'

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

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'dd/MM/yyyy')
}

function getInitials(name: string | null, fallback: string | null): string {
  if (name) return name[0].toUpperCase()
  if (fallback) return fallback[0].toUpperCase()
  return '?'
}

const AVATAR_COLORS = [
  '#fe9b2d', '#fe2d6b', '#b65ede', '#5e87de',
  '#32c5d2', '#56be6e', '#f4841d', '#e53935',
]
function avatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function ConversationItem({
  conversation: conv,
  isActive,
  onClick,
}: {
  conversation: Conversation
  isActive: boolean
  onClick: () => void
}) {
  const displayName =
    conv.customer.name ??
    conv.customer.whatsappPhone ??
    conv.customer.messengerPsid ??
    'Unknown'

  const preview = conv.lastMessagePreview ?? ''
  const hasUnread = conv.unreadCount > 0

  return (
    <div
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer"
      style={{ background: isActive ? 'var(--wa-active)' : 'var(--wa-panel-bg)' }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--wa-hover)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = isActive ? 'var(--wa-active)' : 'var(--wa-panel-bg)'
      }}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {conv.customer.avatarUrl ? (
          <img src={conv.customer.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div
            className="h-12 w-12 rounded-full flex items-center justify-center text-white font-medium text-lg"
            style={{ background: avatarColor(conv.customer.name) }}
          >
            {getInitials(conv.customer.name, conv.customer.whatsappPhone ?? conv.customer.messengerPsid)}
          </div>
        )}
        {/* Platform badge */}
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-white"
          style={{ background: conv.platform === 'whatsapp' ? '#25d366' : '#0084ff' }}
        >
          {conv.platform === 'whatsapp' ? <IconWhatsApp size={9} /> : <IconMessenger size={9} />}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1" style={{ borderBottom: '1px solid var(--wa-divider)', paddingBottom: '10px', paddingTop: '2px' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <span
              className={`truncate text-[15px] ${hasUnread ? 'font-semibold' : 'font-normal'}`}
              style={{ color: hasUnread ? 'var(--wa-bubble-out-text)' : 'var(--wa-bubble-out-text)' }}
            >
              {displayName}
            </span>
          </div>
          <span
            className="flex-shrink-0 text-xs"
            style={{ color: hasUnread ? 'var(--wa-unread-bg)' : 'var(--wa-timestamp)' }}
          >
            {formatTime(conv.lastMessageAt)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <span className="flex-shrink-0" style={{ color: 'var(--wa-tick-read)' }}>
              <IconCheck size={14} />
            </span>
            <p className="truncate text-sm" style={{ color: hasUnread ? 'var(--wa-bubble-out-text)' : 'var(--wa-timestamp)' }}>
              {preview}
            </p>
          </div>
          {hasUnread && (
            <span
              className="flex-shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium"
              style={{ background: 'var(--wa-unread-bg)', color: 'var(--wa-unread-text)' }}
            >
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>

    </div>
  )
}
