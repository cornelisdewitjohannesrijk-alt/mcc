// ─── Platform ─────────────────────────────────────────────────────────────────

export type Platform = 'whatsapp' | 'messenger'

// ─── Message ──────────────────────────────────────────────────────────────────

export type MessageDirection = 'inbound' | 'outbound'

export type MessageContentType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'template'
  | 'unsupported'

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface NormalizedMessage {
  platformMessageId: string
  platform: Platform
  direction: MessageDirection
  contentType: MessageContentType
  text?: string
  mediaUrl?: string
  mediaType?: string
  mediaFilename?: string
  latitude?: number
  longitude?: number
  timestamp: Date
  // Sender info (for inbound)
  senderId: string        // WhatsApp phone or Messenger PSID
  senderName?: string
  senderAvatarUrl?: string
  // Recipient info (for outbound)
  recipientId?: string
  // Quoted reply context
  replyToMessageId?: string  // platformMessageId of the quoted message
  replyToText?: string       // text preview of the quoted message
  replyToSender?: string     // display name of quoted sender
}

// ─── Conversation ─────────────────────────────────────────────────────────────

export type ConversationStatus = 'open' | 'resolved' | 'pending'

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface NormalizedCustomerProfile {
  platformId: string      // WhatsApp phone number or Messenger PSID
  platform: Platform
  name?: string
  avatarUrl?: string
  phone?: string          // E.164 format, WhatsApp only
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export interface WsNewMessageEvent {
  event: 'new_message'
  conversationId: string
  message: {
    id: string
    direction: MessageDirection
    contentType: MessageContentType
    text?: string
    mediaUrl?: string
    timestamp: string
    status?: MessageStatus
  }
  conversation: {
    id: string
    platform: Platform
    unreadCount: number
    customer: {
      id: string
      name: string
      avatarUrl?: string
    }
  }
}

export interface WsMessageStatusEvent {
  event: 'message_status'
  platformMessageId: string
  status: MessageStatus
  timestamp: string
}

export interface WsConversationUpdatedEvent {
  event: 'conversation_updated'
  conversationId: string
  unreadCount: number
  lastMessageAt: string
}

export type WsEvent =
  | WsNewMessageEvent
  | WsMessageStatusEvent
  | WsConversationUpdatedEvent

// ─── API Payloads ─────────────────────────────────────────────────────────────

export interface SendMessagePayload {
  conversationId: string
  contentType: MessageContentType
  text?: string
  mediaUrl?: string
  mediaType?: string
  mediaFilename?: string
  replyToMessageId?: string
  replyToText?: string
  replyToSender?: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}
