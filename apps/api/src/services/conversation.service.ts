import type { Platform, ConversationStatus } from '@mcc/shared'
import { Prisma } from '@prisma/client'
import prisma from '../db/prisma'

export class ConversationService {
  /**
   * Finds the conversation for a customer+platform pair, or creates one.
   * This is called on every incoming message.
   */
  async findOrCreate(customerId: string, platform: Platform) {
    const existing = await prisma.conversation.findUnique({
      where: { customerId_platform: { customerId, platform } },
    })

    if (existing) return existing

    return prisma.conversation.create({
      data: { customerId, platform },
    })
  }

  async findById(id: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { customer: true },
    })
    if (!conversation) return null

    // Fetch 51 to detect whether there are older messages beyond the initial page
    const raw = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { timestamp: 'desc' },
      take: 51,
    })

    const hasMoreMessages = raw.length > 50
    const messages = raw.slice(0, 50).reverse() // chronological order for display

    return { ...conversation, messages, hasMoreMessages }
  }

  async list(params: {
    platform?: Platform
    status?: ConversationStatus
    unreadOnly?: boolean
    search?: string
    page?: number
    limit?: number
  }) {
    const { platform, status, unreadOnly, search, page = 1, limit = 30 } = params
    const skip = (page - 1) * limit

    const where: Prisma.ConversationWhereInput = {}

    if (platform) where.platform = platform
    if (status) where.status = status
    if (unreadOnly) where.unreadCount = { gt: 0 }

    if (search) {
      where.customer = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { whatsappPhone: { contains: search } },
        ],
      }
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          customer: true,
          messages: { orderBy: { timestamp: 'desc' }, take: 1 },
        },
      }),
      prisma.conversation.count({ where }),
    ])

    return { conversations, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async incrementUnread(conversationId: string, lastMessageAt: Date, preview: string) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: {
        unreadCount: { increment: 1 },
        lastMessageAt,
        lastMessagePreview: preview.slice(0, 100),
      },
    })
  }

  async markRead(conversationId: string) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    })
  }

  async updateStatus(conversationId: string, status: ConversationStatus) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { status },
    })
  }

  async updateLastCustomerMessageAt(conversationId: string, timestamp: Date) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { lastCustomerMessageAt: timestamp, lastMessageAt: timestamp },
    })
  }

  async updateAfterOutbound(conversationId: string, preview: string) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: preview.slice(0, 100),
      },
    })
  }

  /**
   * Checks whether the WhatsApp 24-hour customer service window is open.
   * Replies are only allowed within 24 hours of the last customer message.
   */
  isWhatsAppWindowOpen(lastCustomerMessageAt: Date | null): boolean {
    if (!lastCustomerMessageAt) return false
    const hoursSinceLastMessage =
      (Date.now() - lastCustomerMessageAt.getTime()) / (1000 * 60 * 60)
    return hoursSinceLastMessage < 24
  }

  async getDashboardStats() {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
      totalConversations,
      totalUnread,
      receivedToday,
      sentToday,
    ] = await Promise.all([
      prisma.conversation.count(),
      prisma.conversation.count({ where: { unreadCount: { gt: 0 } } }),
      prisma.message.count({
        where: { direction: 'inbound', createdAt: { gte: todayStart } },
      }),
      prisma.message.count({
        where: { direction: 'outbound', createdAt: { gte: todayStart } },
      }),
    ])

    return { totalConversations, totalUnread, receivedToday, sentToday }
  }
}

export const conversationService = new ConversationService()
