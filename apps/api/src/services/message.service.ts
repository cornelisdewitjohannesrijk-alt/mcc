import crypto from 'crypto'
import type { NormalizedMessage, MessageStatus, SendMessagePayload } from '@mcc/shared'
import { Prisma } from '@prisma/client'
import prisma from '../db/prisma'
import { redis, REDIS_CHANNELS } from '../redis/client'
import { registry } from '../adapters/registry'
import { customerService } from './customer.service'
import { conversationService } from './conversation.service'
import { mediaService } from './media.service'
import { isWhatsAppMediaId } from '../adapters/whatsapp.adapter'
import type { OutgoingMessage } from '../adapters/types'

export class MessageService {
  /**
   * Main entry point for all incoming messages from any platform.
   * Called by webhook handlers after signature verification.
   */
  async handleIncoming(normalized: NormalizedMessage): Promise<void> {
    // 1. Find or create customer
    const customer = await customerService.findOrCreate({
      platformId: normalized.senderId,
      platform: normalized.platform,
      name: normalized.senderName,
      avatarUrl: normalized.senderAvatarUrl,
    })

    // 2. Find or create conversation
    const conversation = await conversationService.findOrCreate(customer.id, normalized.platform)

    // 3. Deduplicate by platformMessageId
    if (normalized.platformMessageId) {
      const exists = await prisma.message.findUnique({
        where: { platformMessageId: normalized.platformMessageId },
      })
      if (exists) return // Already processed
    }

    // 4. Resolve media URL
    // WhatsApp webhooks now include a direct URL in the payload (preferred).
    // Fall back to numeric ID resolution only when no URL is present.
    let resolvedMediaUrl = normalized.mediaUrl
    if (normalized.platform === 'whatsapp' && isWhatsAppMediaId(normalized.mediaUrl)) {
      // Old path: numeric ID — needs Graph API call to get URL
      try {
        resolvedMediaUrl = await mediaService.resolveWhatsAppMediaId(
          normalized.mediaUrl!,
          normalized.mediaType,
        )
      } catch (err) {
        console.error('[Media] Failed to resolve WhatsApp media ID:', err)
      }
    } else if (normalized.mediaUrl?.startsWith('http')) {
      // New path: webhook already included a URL — download and persist locally
      try {
        resolvedMediaUrl = await mediaService.persistMediaFromUrl(
          normalized.mediaUrl,
          normalized.mediaType,
          normalized.platform,
        )
      } catch (err) {
        console.error('[Media] Failed to persist media from URL:', err)
        // Keep the original URL as fallback
      }
    }

    // 5. Resolve reply context — look up the quoted message so the dashboard
    //    can render the WhatsApp-style quote block without a separate fetch.
    let replyToText: string | null = null
    let replyToSender: string | null = null
    if (normalized.replyToMessageId) {
      const quoted = await prisma.message.findUnique({
        where: { platformMessageId: normalized.replyToMessageId },
      })
      if (quoted) {
        replyToText = quoted.text ?? `[${quoted.contentType}]`
        replyToSender = quoted.direction === 'outbound'
          ? 'You'
          : (customer.name ?? normalized.senderId)
      }
    }

    // 6. Persist message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        platformMessageId: normalized.platformMessageId,
        direction: 'inbound',
        contentType: normalized.contentType,
        text: normalized.text,
        mediaUrl: resolvedMediaUrl,
        mediaType: normalized.mediaType,
        mediaFilename: normalized.mediaFilename,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        replyToMessageId: normalized.replyToMessageId,
        replyToText,
        replyToSender,
        timestamp: normalized.timestamp,
      },
    })

    // 7. Update conversation + customer timestamps
    const preview = normalized.text ?? `[${normalized.contentType}]`
    await Promise.all([
      conversationService.incrementUnread(conversation.id, normalized.timestamp, preview),
      conversationService.updateLastCustomerMessageAt(conversation.id, normalized.timestamp),
      customerService.updateLastMessageAt(customer.id, normalized.timestamp),
    ])

    // 8. Publish real-time event via Redis
    const event = {
      event: 'new_message',
      conversationId: conversation.id,
      message: {
        id: message.id,
        platformMessageId: message.platformMessageId,
        direction: 'inbound',
        contentType: message.contentType,
        text: message.text,
        mediaUrl: message.mediaUrl,
        mediaFilename: message.mediaFilename,
        replyToMessageId: message.replyToMessageId,
        replyToText: message.replyToText,
        replyToSender: message.replyToSender,
        timestamp: message.timestamp.toISOString(),
      },
      conversation: {
        id: conversation.id,
        platform: conversation.platform,
        unreadCount: (conversation.unreadCount ?? 0) + 1,
        customer: {
          id: customer.id,
          name: customer.name ?? normalized.senderId,
          avatarUrl: customer.avatarUrl,
        },
      },
    }

    await redis.publish(REDIS_CHANNELS.NEW_MESSAGE, JSON.stringify(event))
  }

  /**
   * Sends a message from the dashboard to the customer.
   */
  async sendOutgoing(payload: SendMessagePayload): Promise<void> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: payload.conversationId },
      include: { customer: true },
    })

    if (!conversation) throw new Error('Conversation not found')

    // Determine recipient ID based on platform
    const recipientId =
      conversation.platform === 'whatsapp'
        ? conversation.customer.whatsappPhone
        : conversation.customer.messengerPsid

    if (!recipientId) {
      throw new Error(`No ${conversation.platform} ID for this customer`)
    }

    // Check WhatsApp 24h window
    if (conversation.platform === 'whatsapp') {
      const isOpen = conversationService.isWhatsAppWindowOpen(
        conversation.lastCustomerMessageAt,
      )
      if (!isOpen) {
        throw new Error(
          'WhatsApp 24-hour window has expired. Use a message template to re-engage.',
        )
      }
    }

    // Send via platform adapter
    const adapter = registry.get(conversation.platform)
    const outgoing: OutgoingMessage = {
      contentType: payload.contentType,
      text: payload.text,
      mediaUrl: payload.mediaUrl,
      mediaType: payload.mediaType,
      mediaFilename: payload.mediaFilename,
      replyToMessageId: payload.replyToMessageId,
    }

    const platformMessageId = await adapter.sendMessage(recipientId, outgoing)

    // Persist the outgoing message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        platformMessageId: platformMessageId || null,
        direction: 'outbound',
        contentType: payload.contentType,
        text: payload.text,
        mediaUrl: payload.mediaUrl,
        mediaType: payload.mediaType,
        mediaFilename: payload.mediaFilename,
        replyToMessageId: payload.replyToMessageId,
        replyToText: payload.replyToText,
        replyToSender: payload.replyToSender,
        status: 'sent',
        timestamp: new Date(),
      },
    })

    const preview = payload.text ?? `[${payload.contentType}]`
    await conversationService.updateAfterOutbound(conversation.id, preview)

    // Publish to real-time layer
    const event = {
      event: 'new_message',
      conversationId: conversation.id,
      message: {
        id: message.id,
        platformMessageId: message.platformMessageId,
        direction: 'outbound',
        contentType: message.contentType,
        text: message.text,
        mediaUrl: message.mediaUrl,
        mediaFilename: message.mediaFilename,
        replyToMessageId: message.replyToMessageId,
        replyToText: message.replyToText,
        replyToSender: message.replyToSender,
        timestamp: message.timestamp.toISOString(),
        status: 'sent',
      },
      conversation: {
        id: conversation.id,
        platform: conversation.platform,
        unreadCount: 0,
        customer: {
          id: conversation.customer.id,
          name: conversation.customer.name ?? recipientId,
          avatarUrl: conversation.customer.avatarUrl,
        },
      },
    }

    await redis.publish(REDIS_CHANNELS.NEW_MESSAGE, JSON.stringify(event))
  }

  /**
   * Updates message delivery/read status from platform webhooks.
   */
  async updateStatus(
    platformMessageId: string,
    status: MessageStatus,
    timestamp: Date,
  ): Promise<void> {
    await prisma.message.updateMany({
      where: { platformMessageId },
      data: { status, statusUpdatedAt: timestamp },
    })

    const event = {
      event: 'message_status',
      platformMessageId,
      status,
      timestamp: timestamp.toISOString(),
    }

    await redis.publish(REDIS_CHANNELS.MESSAGE_STATUS, JSON.stringify(event))
  }

  /**
   * Fetches paginated message history for a conversation.
   */
  async listByConversation(
    conversationId: string,
    params: { page?: number; limit?: number; before?: string },
  ) {
    const { page = 1, limit = 50, before } = params

    const where: Prisma.MessageWhereInput = {
      conversationId,
    }

    if (before) {
      const cursor = await prisma.message.findUnique({ where: { id: before } })
      if (cursor) where.timestamp = { lt: cursor.timestamp }
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: before ? 0 : (page - 1) * limit,
      }),
      prisma.message.count({ where: { conversationId } }),
    ])

    return { messages: messages.reverse(), total, page, limit }
  }

  /**
   * Logs raw webhook payloads for debugging and idempotency checking.
   */
  async logWebhook(platform: 'whatsapp' | 'messenger', eventType: string, payload: unknown) {
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')

    return prisma.webhookLog.create({
      data: {
        platform,
        eventType,
        payloadHash,
        payload: payload as object,
        processed: false,
      },
    })
  }

  async markWebhookProcessed(logId: string, error?: string) {
    return prisma.webhookLog.update({
      where: { id: logId },
      data: { processed: true, error },
    })
  }
}

export const messageService = new MessageService()
