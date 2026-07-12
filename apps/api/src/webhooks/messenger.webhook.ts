import type { FastifyInstance } from 'fastify'
import { registry } from '../adapters/registry'
import { messageService } from '../services/message.service'

export async function messengerWebhookRoutes(app: FastifyInstance) {
  const adapter = registry.get('messenger')

  // ── Verification Challenge ─────────────────────────────────────────────────
  app.get('/webhook/messenger', async (req, reply) => {
    const challenge = adapter.handleVerificationChallenge(req)
    if (challenge) {
      return reply.code(200).send(challenge)
    }
    return reply.code(403).send({ error: 'Invalid verification token' })
  })

  // ── Incoming Events ────────────────────────────────────────────────────────
  app.post('/webhook/messenger', async (req, reply) => {
    // Respond 200 immediately
    reply.code(200).send({ status: 'ok' })

    if (!adapter.verifyWebhookSignature(req)) {
      app.log.warn('[Messenger] Invalid webhook signature — ignoring')
      return
    }

    const log = await messageService.logWebhook('messenger', 'message', req.body)

    try {
      const messages = adapter.normalizeIncoming(req.body)
      for (const msg of messages) {
        await messageService.handleIncoming(msg)
      }

      await messageService.markWebhookProcessed(log.id)
    } catch (err) {
      app.log.error({ err }, '[Messenger] Error processing webhook')
      await messageService.markWebhookProcessed(log.id, String(err))
    }
  })
}
