import 'dotenv/config'
import path from 'path'
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyMultipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { config } from './config'
import { connectRedis } from './redis/client'
import { initSocketIO } from './realtime/socket'

// ─── Routes ───────────────────────────────────────────────────────────────────
import { authRoutes } from './routes/auth.routes'
import { conversationRoutes } from './routes/conversations.routes'
import { customerRoutes } from './routes/customers.routes'
import { dashboardRoutes } from './routes/dashboard.routes'
import { uploadRoutes } from './routes/upload.routes'
import { savedRepliesRoutes } from './routes/saved-replies.routes'

// ─── Webhooks ─────────────────────────────────────────────────────────────────
import { whatsappWebhookRoutes } from './webhooks/whatsapp.webhook'
import { messengerWebhookRoutes } from './webhooks/messenger.webhook'

// Extend FastifyRequest to carry the raw body buffer for webhook signature verification
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

async function bootstrap() {
  const app = Fastify({
    logger: {
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

  // ── Raw body capture (needed for HMAC webhook signature verification) ─────
  // Fastify parses JSON before routes run. We intercept the raw bytes here
  // and attach them to the request so signature verification uses the exact
  // bytes Meta signed — not a re-serialized version.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body as Buffer
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  // ── Plugins ──────────────────────────────────────────────────────────────

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
    // Allow cross-origin loading of uploaded media (images, docs) from the frontend
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })

  await app.register(fastifyCors, {
    origin:
      config.NODE_ENV === 'development'
        ? ['http://localhost:3000', 'http://localhost:4000']
        : (origin, cb) => {
            // Allow all vercel.app subdomains + any custom domains set via env
            const allowed = [
              /\.vercel\.app$/,
              /^https:\/\/mcc/,
            ]
            // CORS_ORIGINS: comma-separated list of additional allowed origins
            const extraOrigins = (process.env.CORS_ORIGINS ?? process.env.NEXT_PUBLIC_URL ?? '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
            if (
              !origin ||
              allowed.some((r) => r.test(origin)) ||
              extraOrigins.includes(origin)
            ) {
              cb(null, true)
            } else {
              cb(new Error('Not allowed by CORS'), false)
            }
          },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  })

  await app.register(fastifyCookie)

  await app.register(fastifyMultipart, {
    limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
  })

  // Serve local uploads only in dev — in production files live in R2/S3
  if (!process.env.MEDIA_STORAGE_BUCKET) {
    const uploadsDir = path.join(process.cwd(), 'uploads')
    if (!require('fs').existsSync(uploadsDir)) require('fs').mkdirSync(uploadsDir, { recursive: true })
    await app.register(fastifyStatic, {
      root: uploadsDir,
      prefix: '/uploads/',
      decorateReply: false,
    })
  }

  await app.register(fastifyRateLimit, {
    max: 200,
    timeWindow: '1 minute',
    // Exclude webhook endpoints from rate limiting
    skipOnError: true,
    keyGenerator: (req) => {
      if (req.url?.startsWith('/webhook')) return 'meta-webhooks'
      return req.ip
    },
  })

  // ── Routes ───────────────────────────────────────────────────────────────

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // API routes (versioned)
  await app.register(
    async (api) => {
      await api.register(authRoutes)
      await api.register(conversationRoutes)
      await api.register(customerRoutes)
      await api.register(dashboardRoutes)
      await api.register(uploadRoutes)
      await api.register(savedRepliesRoutes)
    },
    { prefix: '/api/v1' },
  )

  // Webhook routes (no versioning — Meta URLs are configured manually)
  await app.register(whatsappWebhookRoutes)
  await app.register(messengerWebhookRoutes)

  // ── Redis ─────────────────────────────────────────────────────────────────

  await connectRedis()

  // ── Start server ──────────────────────────────────────────────────────────

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  console.log(`\n  API server running at http://localhost:${config.PORT}`)
  console.log(`  Webhook endpoints:`)
  console.log(`    WhatsApp : http://localhost:${config.PORT}/webhook/whatsapp`)
  console.log(`    Messenger: http://localhost:${config.PORT}/webhook/messenger\n`)

  // ── Socket.IO ─────────────────────────────────────────────────────────────
  // Must be initialized after app.listen()

  const httpServer = app.server
  initSocketIO(httpServer)
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
