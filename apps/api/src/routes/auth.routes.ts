import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import prisma from '../db/prisma'
import { requireAuth } from '../middleware/auth'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  // ── POST /auth/login ───────────────────────────────────────────────────────
  app.post('/auth/login', async (req, reply) => {
    const result = loginSchema.safeParse(req.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid input', details: result.error.flatten() })
    }

    const { email, password } = result.data

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash)
    if (!passwordValid) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const token = app.jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
    )

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    })
  })

  // ── GET /auth/me ───────────────────────────────────────────────────────────
  app.get('/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, name: true, role: true, avatarUrl: true, createdAt: true },
    })

    if (!user) return reply.code(404).send({ error: 'User not found' })

    return reply.send({ user })
  })

  // ── POST /auth/change-password ─────────────────────────────────────────────
  app.post('/auth/change-password', { preHandler: requireAuth }, async (req, reply) => {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    })

    const result = schema.safeParse(req.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    const { currentPassword, newPassword } = result.data

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return reply.code(404).send({ error: 'User not found' })

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Current password is incorrect' })

    const newHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    })

    return reply.send({ message: 'Password updated successfully' })
  })
}
