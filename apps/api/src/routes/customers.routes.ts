import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { customerService } from '../services/customer.service'

export async function customerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // ── GET /customers ─────────────────────────────────────────────────────────
  app.get('/customers', async (req, reply) => {
    const schema = z.object({
      search: z.string().optional(),
      platform: z.enum(['whatsapp', 'messenger']).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    })

    const result = schema.safeParse(req.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query parameters' })
    }

    const data = await customerService.list(result.data)
    return reply.send(data)
  })

  // ── GET /customers/:id ─────────────────────────────────────────────────────
  app.get('/customers/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    const customer = await customerService.findById(id)
    if (!customer) return reply.code(404).send({ error: 'Customer not found' })

    return reply.send({ customer })
  })
}
