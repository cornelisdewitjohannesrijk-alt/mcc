import type { FastifyRequest, FastifyReply } from 'fastify'

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}

// Extend FastifyRequest type to include the decoded JWT user
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string; role: string }
    user: { userId: string; email: string; role: string }
  }
}
