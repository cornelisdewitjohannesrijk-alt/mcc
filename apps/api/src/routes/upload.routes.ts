import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import type { FastifyInstance } from 'fastify'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { requireAuth } from '../middleware/auth'
import { config } from '../config'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/3gpp',
  'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/webm': '.webm',
  'application/pdf': '.pdf',
}

const MAX_SIZE = 16 * 1024 * 1024 // 16 MB

// Singleton S3/R2 client — created once when first upload arrives
let s3: S3Client | null = null

function getS3(): S3Client | null {
  if (!config.MEDIA_STORAGE_BUCKET) return null
  if (s3) return s3
  s3 = new S3Client({
    endpoint: config.MEDIA_STORAGE_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: config.MEDIA_STORAGE_ACCESS_KEY ?? '',
      secretAccessKey: config.MEDIA_STORAGE_SECRET_KEY ?? '',
    },
  })
  return s3
}

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // ── POST /upload ───────────────────────────────────────────────────────────
  app.post('/upload', async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.code(400).send({ error: 'No file provided' })

    const mimeType = data.mimetype
    if (!ALLOWED_TYPES.has(mimeType)) {
      return reply.code(400).send({ error: `File type not allowed: ${mimeType}` })
    }

    // Buffer the upload so we can check size before committing
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of data.file) {
      size += chunk.length
      if (size > MAX_SIZE) {
        return reply.code(413).send({ error: 'File too large (max 16 MB)' })
      }
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    const ext = EXT_MAP[mimeType] ?? path.extname(data.filename) ?? ''
    const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`

    const client = getS3()

    if (client && config.MEDIA_STORAGE_BUCKET) {
      // ── Production: upload to R2/S3 ──────────────────────────────────────
      const key = `uploads/${uniqueName}`
      await client.send(
        new PutObjectCommand({
          Bucket: config.MEDIA_STORAGE_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      )

      const baseUrl = config.MEDIA_STORAGE_PUBLIC_URL?.replace(/\/$/, '') ?? ''
      const url = `${baseUrl}/${key}`

      return reply.code(201).send({ url, filename: data.filename, mimeType, size })
    }

    // ── Development: save to local uploads/ folder ────────────────────────
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })
    fs.writeFileSync(path.join(UPLOADS_DIR, uniqueName), buffer)

    const baseUrl = config.PUBLIC_URL ?? config.API_URL
    const url = `${baseUrl}/uploads/${uniqueName}`

    return reply.code(201).send({ url, filename: data.filename, mimeType, size })
  })
}
