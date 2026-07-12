import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import axios from 'axios'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { config } from '../config'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

const GRAPH_API_VERSION = 'v20.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

// ─── S3/R2 client ────────────────────────────────────────────────────────────

let s3Client: S3Client | null = null

function getS3Client(): S3Client | null {
  if (!config.MEDIA_STORAGE_BUCKET) return null
  if (s3Client) return s3Client
  s3Client = new S3Client({
    endpoint: config.MEDIA_STORAGE_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: config.MEDIA_STORAGE_ACCESS_KEY ?? '',
      secretAccessKey: config.MEDIA_STORAGE_SECRET_KEY ?? '',
    },
  })
  return s3Client
}

// ─── Media Service ────────────────────────────────────────────────────────────

export class MediaService {
  /**
   * Resolves a WhatsApp media ID to a permanent URL.
   *
   * WhatsApp sends numeric media IDs in webhooks (e.g. "1234567890123456").
   * This method:
   *   1. Calls the Graph API to get the temporary download URL
   *   2. Downloads the binary
   *   3. Uploads to permanent storage (R2/S3) if configured
   *   4. Returns the permanent URL (or temp URL if storage not configured)
   */
  /**
   * Downloads a media URL (fbsbx or any HTTP URL) and saves it locally or to S3/R2.
   * Used for both inbound WhatsApp media (when webhook already includes a URL) and
   * Messenger attachments.
   */
  async persistMediaFromUrl(url: string, mimeType?: string, prefix = 'media'): Promise<string> {
    const contentType = mimeType ?? 'application/octet-stream'
    const client = getS3Client()

    const { data: binary } = await axios.get<Buffer>(url, {
      headers: config.WHATSAPP_ACCESS_TOKEN
        ? { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` }
        : {},
      responseType: 'arraybuffer',
    })
    const buffer = Buffer.from(binary)

    if (client && config.MEDIA_STORAGE_BUCKET) {
      const ext = this.extFromMime(contentType)
      const key = `${prefix}/${crypto.randomBytes(8).toString('hex')}${ext}`
      return this.uploadToStorage(client, buffer, key, contentType)
    }

    // Dev: save to local uploads folder, serve via static route
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })
    const ext = this.extFromMime(contentType)
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer)
    const baseUrl = config.PUBLIC_URL ?? config.API_URL
    return `${baseUrl}/uploads/${filename}`
  }

  async resolveWhatsAppMediaId(mediaId: string, mimeType?: string): Promise<string> {
    const accessToken = config.WHATSAPP_ACCESS_TOKEN
    if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN not set')

    // Step 1: Get the temporary download URL from Meta
    const { data: mediaInfo } = await axios.get<{ url: string; mime_type: string; file_size: number }>(
      `${GRAPH_API_BASE}/${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    const tempUrl: string = mediaInfo.url
    const contentType: string = mediaInfo.mime_type ?? mimeType ?? 'application/octet-stream'

    // Download and persist locally / to S3
    return this.persistMediaFromUrl(tempUrl, contentType, `whatsapp`)
  }

  /**
   * Downloads a Messenger attachment URL and uploads to permanent storage.
   * Messenger URLs don't expire immediately but aren't guaranteed to be permanent.
   */
  async persistMessengerMedia(url: string, mimeType?: string): Promise<string> {
    const client = getS3Client()
    if (!client || !config.MEDIA_STORAGE_BUCKET) {
      // In dev, just return the original URL
      return url
    }

    const contentType = mimeType ?? 'application/octet-stream'
    const { data: binary } = await axios.get<Buffer>(url, { responseType: 'arraybuffer' })

    // Derive a stable key from the URL
    const urlHash = Buffer.from(url).toString('base64url').slice(0, 32)
    const ext = this.extFromMime(contentType)
    const key = `messenger/${urlHash}${ext}`

    return this.uploadToStorage(client, Buffer.from(binary), key, contentType)
  }

  private async uploadToStorage(
    client: S3Client,
    body: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    await client.send(
      new PutObjectCommand({
        Bucket: config.MEDIA_STORAGE_BUCKET!,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )

    const baseUrl = config.MEDIA_STORAGE_PUBLIC_URL?.replace(/\/$/, '') ?? ''
    return `${baseUrl}/${key}`
  }

  private extFromMime(mime: string): string {
    const map: Record<string, string> = {
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
    return map[mime] ?? ''
  }
}

export const mediaService = new MediaService()
