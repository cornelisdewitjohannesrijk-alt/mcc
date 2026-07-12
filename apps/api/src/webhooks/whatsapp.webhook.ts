import type { FastifyInstance } from 'fastify'
import { registry } from '../adapters/registry'
import { messageService } from '../services/message.service'

export async function whatsappWebhookRoutes(app: FastifyInstance) {
  const adapter = registry.get('whatsapp')

  // ── Verification Challenge ─────────────────────────────────────────────────
  // Meta sends a GET request when you first configure the webhook URL.
  app.get('/webhook/whatsapp', async (req, reply) => {
    const challenge = adapter.handleVerificationChallenge(req)
    if (challenge) {
      return reply.code(200).send(challenge)
    }
    return reply.code(403).send({ error: 'Invalid verification token' })
  })

  // ── Incoming Events ────────────────────────────────────────────────────────
  app.post('/webhook/whatsapp', async (req, reply) => {
    // Always respond 200 immediately — Meta will retry if we don't
    reply.code(200).send({ status: 'ok' })

    // Verify the signature in the background
    if (!adapter.verifyWebhookSignature(req)) {
      app.log.warn('[WhatsApp] Invalid webhook signature — ignoring')
      return
    }

    // Log the raw payload
    const log = await messageService.logWebhook('whatsapp', 'message', req.body)

    try {
      // Extract and process status updates first (fast path)
      const statusUpdates = adapter.extractStatusUpdates(req.body)
      for (const update of statusUpdates) {
        await messageService.updateStatus(
          update.platformMessageId,
          update.status,
          update.timestamp,
        )
      }

      // Normalize and process incoming messages
      const messages = adapter.normalizeIncoming(req.body)
      for (const msg of messages) {
        await messageService.handleIncoming(msg)
      }

      await messageService.markWebhookProcessed(log.id)
    } catch (err) {
      app.log.error({ err }, '[WhatsApp] Error processing webhook')
      await messageService.markWebhookProcessed(log.id, String(err))
    }
  })
}
