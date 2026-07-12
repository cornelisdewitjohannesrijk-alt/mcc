import crypto from 'crypto'
import axios from 'axios'
import type { FastifyRequest } from 'fastify'
import type { NormalizedMessage, NormalizedCustomerProfile } from '@mcc/shared'
import { config } from '../config'
import type { ChannelAdapter, OutgoingMessage, StatusUpdate } from './types'

const GRAPH_API_VERSION = 'v20.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

/**
 * WhatsApp webhooks send a numeric media ID instead of a real URL.
 * This detects that so the media service knows to resolve it.
 */
export function isWhatsAppMediaId(value: string | undefined): boolean {
  return !!value && /^\d+$/.test(value)
}

// ─── WhatsApp Raw Payload Types ───────────────────────────────────────────────

interface WAContact {
  profile: { name: string }
  wa_id: string
}

interface WAMessageBase {
  from: string
  id: string
  timestamp: string
  type: string
  context?: {
    from: string
    id: string   // platformMessageId of the quoted message
  }
}

interface WATextMessage extends WAMessageBase {
  type: 'text'
  text: { body: string }
}

interface WAMediaMessage extends WAMessageBase {
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  image?: { id: string; url?: string; mime_type: string; sha256: string; caption?: string }
  video?: { id: string; url?: string; mime_type: string; sha256: string; caption?: string }
  audio?: { id: string; url?: string; mime_type: string; sha256: string }
  document?: { id: string; url?: string; mime_type: string; sha256: string; filename?: string }
  sticker?: { id: string; url?: string; mime_type: string; sha256: string }
}

interface WALocationMessage extends WAMessageBase {
  type: 'location'
  location: { latitude: number; longitude: number; name?: string; address?: string }
}

type WAMessage = WATextMessage | WAMediaMessage | WALocationMessage

interface WAStatus {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
}

interface WAWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: { display_phone_number: string; phone_number_id: string }
        contacts?: WAContact[]
        messages?: WAMessage[]
        statuses?: WAStatus[]
      }
      field: string
    }>
  }>
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class WhatsAppAdapter implements ChannelAdapter {
  readonly platform = 'whatsapp' as const

  // ── Webhook verification ──────────────────────────────────────────────────

  verifyWebhookSignature(req: FastifyRequest): boolean {
    // BUG FIX: must use App Secret, NOT the access token.
    // Access token is for calling the API; App Secret is for verifying webhooks.
    const appSecret = config.WHATSAPP_APP_SECRET
    if (!appSecret) {
      console.warn('[WhatsApp] WHATSAPP_APP_SECRET not set — skipping signature check (dev only)')
      return true // Allow in dev when secret not yet configured
    }

    const signature = (req.headers['x-hub-signature-256'] as string) ?? ''
    // Use the raw body bytes captured before JSON parsing — re-serializing with
    // JSON.stringify can produce different bytes and fail the HMAC check.
    const rawBody = (req as FastifyRequest & { rawBody?: Buffer }).rawBody
    const body = rawBody ?? Buffer.from(JSON.stringify(req.body))
    const expectedSig =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(body).digest('hex')

    // timingSafeEqual requires equal-length buffers — wrap so a short/malformed
    // signature returns false instead of throwing ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH
    try {
      const a = Buffer.from(signature)
      const b = Buffer.from(expectedSig)
      if (a.length !== b.length) return false
      return crypto.timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  handleVerificationChallenge(req: FastifyRequest): string | null {
    const query = req.query as Record<string, string>

    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    ) {
      return query['hub.challenge'] ?? null
    }

    return null
  }

  // ── Incoming normalization ────────────────────────────────────────────────

  normalizeIncoming(payload: unknown): NormalizedMessage[] {
    const data = payload as WAWebhookPayload
    const messages: NormalizedMessage[] = []

    for (const entry of data.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const { messages: rawMessages = [], contacts = [] } = change.value
        const contactMap = new Map(contacts.map((c) => [c.wa_id, c]))

        for (const msg of rawMessages) {
          const contact = contactMap.get(msg.from)
          const normalized = this.normalizeMessage(msg, contact)
          if (normalized) messages.push(normalized)
        }
      }
    }

    return messages
  }

  private normalizeMessage(
    msg: WAMessage,
    contact?: WAContact,
  ): NormalizedMessage | null {
    const base: Omit<NormalizedMessage, 'contentType'> = {
      platformMessageId: msg.id,
      platform: 'whatsapp',
      direction: 'inbound',
      senderId: msg.from,
      senderName: contact?.profile?.name,
      timestamp: new Date(parseInt(msg.timestamp) * 1000),
      replyToMessageId: msg.context?.id,
    }

    switch (msg.type) {
      case 'text':
        return { ...base, contentType: 'text', text: (msg as WATextMessage).text.body }

      case 'image': {
        const m = msg as WAMediaMessage
        return {
          ...base,
          contentType: 'image',
          mediaUrl: m.image?.url ?? m.image?.id, // prefer webhook URL, fall back to ID
          mediaType: m.image?.mime_type,
          text: m.image?.caption,
        }
      }

      case 'video': {
        const m = msg as WAMediaMessage
        return {
          ...base,
          contentType: 'video',
          mediaUrl: m.video?.url ?? m.video?.id,
          mediaType: m.video?.mime_type,
          text: m.video?.caption,
        }
      }

      case 'audio': {
        const m = msg as WAMediaMessage
        return { ...base, contentType: 'audio', mediaUrl: m.audio?.url ?? m.audio?.id, mediaType: m.audio?.mime_type }
      }

      case 'document': {
        const m = msg as WAMediaMessage
        return {
          ...base,
          contentType: 'document',
          mediaUrl: m.document?.url ?? m.document?.id,
          mediaType: m.document?.mime_type,
          mediaFilename: m.document?.filename,
        }
      }

      case 'sticker': {
        const m = msg as WAMediaMessage
        return { ...base, contentType: 'sticker', mediaUrl: m.sticker?.url ?? m.sticker?.id, mediaType: m.sticker?.mime_type }
      }

      case 'location': {
        const m = msg as WALocationMessage
        return {
          ...base,
          contentType: 'location',
          latitude: m.location.latitude,
          longitude: m.location.longitude,
          text: m.location.name,
        }
      }

      default:
        return { ...base, contentType: 'unsupported', text: `Unsupported message type: ${(msg as WAMessageBase).type}` }
    }
  }

  // ── Status updates ────────────────────────────────────────────────────────

  extractStatusUpdates(payload: unknown): StatusUpdate[] {
    const data = payload as WAWebhookPayload
    const updates: StatusUpdate[] = []

    for (const entry of data.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value.statuses ?? []) {
          updates.push({
            platformMessageId: status.id,
            status: status.status,
            timestamp: new Date(parseInt(status.timestamp) * 1000),
          })
        }
      }
    }

    return updates
  }

  // ── Outgoing messages ─────────────────────────────────────────────────────

  async sendMessage(recipientPhone: string, message: OutgoingMessage): Promise<string> {
    const phoneNumberId = config.WHATSAPP_PHONE_NUMBER_ID
    const accessToken = config.WHATSAPP_ACCESS_TOKEN

    if (!phoneNumberId || !accessToken) {
      throw new Error('WhatsApp credentials not configured')
    }

    const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`
    const body = this.buildOutgoingPayload(recipientPhone, message)

    let response
    try {
      response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        // Surface Meta's actual error message (code + message) for easier debugging
        const meta = err.response.data?.error
        const detail = meta
          ? `Meta error ${meta.code}: ${meta.message} (${meta.error_subcode ?? ''})`
          : JSON.stringify(err.response.data)
        throw new Error(`WhatsApp API ${err.response.status}: ${detail}`)
      }
      throw err
    }

    return response.data.messages?.[0]?.id ?? ''
  }

  private buildOutgoingPayload(to: string, message: OutgoingMessage): object {
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to }
    const context = message.replyToMessageId
      ? { context: { message_id: message.replyToMessageId } }
      : {}

    switch (message.contentType) {
      case 'text':
        return { ...base, ...context, type: 'text', text: { body: message.text, preview_url: true } }

      case 'image':
        return { ...base, ...context, type: 'image', image: { link: message.mediaUrl, caption: message.text } }

      case 'video':
        return { ...base, ...context, type: 'video', video: { link: message.mediaUrl, caption: message.text } }

      case 'audio':
        return { ...base, ...context, type: 'audio', audio: { link: message.mediaUrl } }

      case 'document':
        return {
          ...base,
          ...context,
          type: 'document',
          document: { link: message.mediaUrl, filename: message.mediaFilename, caption: message.text },
        }

      case 'location':
        return {
          ...base,
          ...context,
          type: 'location',
          location: { latitude: message.latitude, longitude: message.longitude },
        }

      default:
        throw new Error(`Cannot send message of type: ${message.contentType}`)
    }
  }

  // ── Customer profile ──────────────────────────────────────────────────────

  async getProfile(phone: string): Promise<NormalizedCustomerProfile> {
    // WhatsApp Cloud API does not provide a separate profile lookup endpoint.
    // Name is included in the webhook contact object at message receipt time.
    // We return what we know — the name gets filled in when the first message arrives.
    return {
      platformId: phone,
      platform: 'whatsapp',
      phone,
    }
  }

  // ── Media resolution ──────────────────────────────────────────────────────
  // WhatsApp gives a media ID in the webhook, not a URL. This method resolves it.

  async resolveMediaUrl(mediaId: string): Promise<string> {
    const accessToken = config.WHATSAPP_ACCESS_TOKEN
    if (!accessToken) throw new Error('WhatsApp credentials not configured')

    const response = await axios.get(`${GRAPH_API_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    return response.data.url as string
  }
}
