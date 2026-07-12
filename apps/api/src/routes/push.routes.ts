import type { FastifyInstance } from 'fastify'
import prisma from '../db/prisma'
import { requireAuth } from '../middleware/auth'

export async function pushRoutes(app: FastifyInstance) {
  // Save a push subscription (called when user grants notification permission)
  app.post('/push/subscribe', {
    schema: {
      body: {
        type: 'object',
        required: ['endpoint', 'keys'],
        properties: {
          endpoint: { type: 'string' },
          keys: {
            type: 'object',
            required: ['p256dh', 'auth'],
            properties: {
              p256dh: { type: 'string' },
              auth: { type: 'string' },
            },
          },
        },
      },
    },
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { endpoint, keys } = req.body as {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { p256dh: keys.p256dh, auth: keys.auth },
    })

    return reply.status(201).send({ ok: true })
  })

  // Remove subscription (called on logout or permission revoke)
  app.delete('/push/subscribe', {
    schema: {
      body: {
        type: 'object',
        required: ['endpoint'],
        properties: {
          endpoint: { type: 'string' },
        },
      },
    },
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { endpoint } = req.body as { endpoint: string }

    await prisma.pushSubscription.deleteMany({ where: { endpoint } })

    return reply.send({ ok: true })
  })
}
