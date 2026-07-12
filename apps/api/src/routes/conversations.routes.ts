import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { conversationService } from '../services/conversation.service'
import { messageService } from '../services/message.service'
import prisma from '../db/prisma'

export async function conversationRoutes(app: FastifyInstance) {
  // All routes require auth
  app.addHook('preHandler', requireAuth)

  // ── GET /conversations ─────────────────────────────────────────────────────
  app.get('/conversations', async (req, reply) => {
    const schema = z.object({
      platform: z.enum(['whatsapp', 'messenger']).optional(),
      status: z.enum(['open', 'resolved', 'pending']).optional(),
      unreadOnly: z.coerce.boolean().optional(),
      search: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(30),
    })

    const result = schema.safeParse(req.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query parameters' })
    }

    const data = await conversationService.list(result.data)
    return reply.send(data)
  })

  // ── GET /conversations/:id ─────────────────────────────────────────────────
  app.get('/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    const conversation = await conversationService.findById(id)
    if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })

    return reply.send({ conversation })
  })

  // ── GET /conversations/:id/messages ───────────────────────────────────────
  app.get('/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string }

    const schema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(50),
      before: z.string().optional(), // cursor-based pagination
    })

    const result = schema.safeParse(req.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query parameters' })
    }

    const data = await messageService.listByConversation(id, result.data)
    return reply.send(data)
  })

  // ── POST /conversations/:id/messages ──────────────────────────────────────
  app.post('/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string }

    const schema = z.object({
      contentType: z.enum(['text', 'image', 'video', 'audio', 'document', 'location']),
      text: z.string().optional(),
      mediaUrl: z.string().url().optional(),
      mediaType: z.string().optional(),
      mediaFilename: z.string().optional(),
      replyToMessageId: z.string().optional(),
      replyToText: z.string().optional(),
      replyToSender: z.string().optional(),
    })

    const result = schema.safeParse(req.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid message payload', details: result.error.flatten() })
    }

    try {
      await messageService.sendOutgoing({ conversationId: id, ...result.data })
      return reply.code(201).send({ message: 'Message sent' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message'

      // Surface the WhatsApp 24h window error as a 422
      if (message.includes('24-hour')) {
        return reply.code(422).send({ error: message })
      }

      app.log.error({ err }, 'Failed to send message')
      return reply.code(500).send({ error: message })
    }
  })

  // ── PATCH /conversations/:id/messages/:msgId/star ─────────────────────────
  app.patch('/conversations/:id/messages/:msgId/star', async (req, reply) => {
    const { msgId } = req.params as { id: string; msgId: string }
    const { starred } = req.body as { starred: boolean }
    const message = await prisma.message.update({
      where: { id: msgId },
      data: { starred },
    })
    return reply.send({ message })
  })

  // ── PATCH /conversations/:id/messages/:msgId/pin ──────────────────────────
  app.patch('/conversations/:id/messages/:msgId/pin', async (req, reply) => {
    const { msgId } = req.params as { id: string; msgId: string }
    const { pinned } = req.body as { pinned: boolean }
    const message = await prisma.message.update({
      where: { id: msgId },
      data: { pinnedAt: pinned ? new Date() : null },
    })
    return reply.send({ message })
  })

  // ── POST /conversations/:id/messages/:msgId/forward ───────────────────────
  app.post('/conversations/:id/messages/:msgId/forward', async (req, reply) => {
    const { msgId } = req.params as { id: string; msgId: string }
    const { targetConversationId } = req.body as { targetConversationId: string }

    const source = await prisma.message.findUnique({ where: { id: msgId } })
    if (!source) return reply.code(404).send({ error: 'Message not found' })

    await messageService.sendOutgoing({
      conversationId: targetConversationId,
      contentType: source.contentType as 'text' | 'image' | 'video' | 'audio' | 'document',
      text: source.text ?? undefined,
      mediaUrl: source.mediaUrl ?? undefined,
      mediaType: source.mediaType ?? undefined,
      mediaFilename: source.mediaFilename ?? undefined,
    })

    return reply.code(201).send({ ok: true })
  })

  // ── PATCH /conversations/:id/read ─────────────────────────────────────────
  app.patch('/conversations/:id/read', async (req, reply) => {
    const { id } = req.params as { id: string }
    await conversationService.markRead(id)
    return reply.send({ message: 'Marked as read' })
  })

  // ── PATCH /conversations/:id/status ───────────────────────────────────────
  app.patch('/conversations/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string }

    const schema = z.object({
      status: z.enum(['open', 'resolved', 'pending']),
    })

    const result = schema.safeParse(req.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid status' })
    }

    const conversation = await conversationService.updateStatus(id, result.data.status)
    return reply.send({ conversation })
  })
}
