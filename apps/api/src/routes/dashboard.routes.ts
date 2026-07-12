import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { conversationService } from '../services/conversation.service'

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // ── GET /dashboard/stats ───────────────────────────────────────────────────
  app.get('/dashboard/stats', async (req, reply) => {
    const stats = await conversationService.getDashboardStats()
    return reply.send({ stats })
  })
}
