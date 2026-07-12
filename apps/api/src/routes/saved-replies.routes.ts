import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import prisma from '../db/prisma'

export async function savedRepliesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // ── GET /saved-replies ─────────────────────────────────────────────────────
  app.get('/saved-replies', async (_req, reply) => {
    const replies = await prisma.savedReply.findMany({
      orderBy: { shortcut: 'asc' },
    })
    return reply.send({ savedReplies: replies })
  })

  // ── POST /saved-replies ────────────────────────────────────────────────────
  app.post('/saved-replies', async (req, reply) => {
    const schema = z.object({
      title: z.string().min(1).max(100),
      shortcut: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, 'Shortcut must be lowercase letters, numbers, hyphens or underscores'),
      text: z.string().max(4096).default(''),
      mediaUrl: z.string().url().optional(),
      mediaType: z.string().optional(),
    })

    const result = schema.safeParse(req.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid input', details: result.error.flatten() })
    }

    try {
      const savedReply = await prisma.savedReply.create({ data: result.data })
      return reply.code(201).send({ savedReply })
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        return reply.code(409).send({ error: `Shortcut "/${result.data.shortcut}" is already taken` })
      }
      throw err
    }
  })

  // ── PATCH /saved-replies/:id ───────────────────────────────────────────────
  app.patch('/saved-replies/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    const schema = z.object({
      title: z.string().min(1).max(100).optional(),
      shortcut: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/).optional(),
      text: z.string().max(4096).optional(),
      mediaUrl: z.string().url().optional().nullable(),
      mediaType: z.string().optional().nullable(),
    })

    const result = schema.safeParse(req.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid input', details: result.error.flatten() })
    }

    try {
      const savedReply = await prisma.savedReply.update({
        where: { id },
        data: result.data,
      })
      return reply.send({ savedReply })
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2025') {
        return reply.code(404).send({ error: 'Saved reply not found' })
      }
      if ((err as { code?: string })?.code === 'P2002') {
        return reply.code(409).send({ error: 'Shortcut already taken' })
      }
      throw err
    }
  })

  // ── DELETE /saved-replies/:id ──────────────────────────────────────────────
  app.delete('/saved-replies/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    try {
      await prisma.savedReply.delete({ where: { id } })
      return reply.code(204).send()
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2025') {
        return reply.code(404).send({ error: 'Saved reply not found' })
      }
      throw err
    }
  })
}
