import crypto from 'crypto'
import axios from 'axios'
import type { FastifyRequest } from 'fastify'
import type { NormalizedMessage, NormalizedCustomerProfile } from '@mcc/shared'
import { config } from '../config'
import type { ChannelAdapter, OutgoingMessage, StatusUpdate } from './types'

const GRAPH_API_VERSION = 'v20.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

// ─── Messenger Raw Payload Types ──────────────────────────────────────────────

interface MessengerAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'location' | 'fallback'
  payload: {
    url?: string
    coordinates?: { lat: number; long: number }
    title?: string
  }
}

interface MessengerMessage {
  mid: string
  text?: string
  attachments?: MessengerAttachment[]
  is_echo?: boolean
}

interface MessengerRead {
  watermark: number
}

interface MessengerDelivery {
  watermark: number
  mids?: string[]
}

interface MessengerEntry {
  id: string
  time: number
  messaging: Array<{
    sender: { id: string }
    recipient: { id: string }
    timestamp: number
    message?: MessengerMessage
    read?: MessengerRead
    delivery?: MessengerDelivery
  }>
}

interface MessengerWebhookPayload {
  object: string
  entry: MessengerEntry[]
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class MessengerAdapter implements ChannelAdapter {
  readonly platform = 'messenger' as const

  // ── Webhook verification ──────────────────────────────────────────────────

  verifyWebhookSignature(req: FastifyRequest): boolean {
    const appSecret = config.MESSENGER_APP_SECRET
    if (!appSecret) return false

    const signature = (req.headers['x-hub-signature-256'] as string) ?? ''
    const body = JSON.stringify(req.body)
    const expectedSig =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(body).digest('hex')

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSig),
      )
    } catch {
      return false
    }
  }

  handleVerificationChallenge(req: FastifyRequest): string | null {
    const query = req.query as Record<string, string>

    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === config.MESSENGER_WEBHOOK_VERIFY_TOKEN
    ) {
      return query['hub.challenge'] ?? null
    }

    return null
  }

  // ── Incoming normalization ────────────────────────────────────────────────

  normalizeIncoming(payload: unknown): NormalizedMessage[] {
    const data = payload as MessengerWebhookPayload
    const messages: NormalizedMessage[] = []

    for (const entry of data.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        // Skip echo messages (messages sent by the page itself)
        if (event.message?.is_echo) continue
        // Only process message events (not read receipts, delivery, etc.)
        if (!event.message) continue

        const normalized = this.normalizeMessage(event)
        if (normalized) messages.push(normalized)
      }
    }

    return messages
  }

  private normalizeMessage(
    event: MessengerEntry['messaging'][number],
  ): NormalizedMessage | null {
    const msg = event.message!
    const base: Omit<NormalizedMessage, 'contentType'> = {
      platformMessageId: msg.mid,
      platform: 'messenger',
      direction: 'inbound',
      senderId: event.sender.id,
      timestamp: new Date(event.timestamp),
    }

    // Text message
    if (msg.text && !msg.attachments) {
      return { ...base, contentType: 'text', text: msg.text }
    }

    // Attachment messages
    const attachment = msg.attachments?.[0]
    if (!attachment) return { ...base, contentType: 'unsupported' }

    switch (attachment.type) {
      case 'image':
        return { ...base, contentType: 'image', mediaUrl: attachment.payload.url }

      case 'video':
        return { ...base, contentType: 'video', mediaUrl: attachment.payload.url }

      case 'audio':
        return { ...base, contentType: 'audio', mediaUrl: attachment.payload.url }

      case 'file':
        return { ...base, contentType: 'document', mediaUrl: attachment.payload.url }

      case 'location':
        return {
          ...base,
          contentType: 'location',
          latitude: attachment.payload.coordinates?.lat,
          longitude: attachment.payload.coordinates?.long,
        }

      default:
        return { ...base, contentType: 'unsupported', text: `Unsupported: ${attachment.type}` }
    }
  }

  // ── Status updates ────────────────────────────────────────────────────────
  // Messenger uses watermarks rather than per-message IDs for delivery/read receipts

  extractStatusUpdates(payload: unknown): StatusUpdate[] {
    // Messenger doesn't give us per-message delivery IDs via watermarks.
    // We handle this at a conversation level instead.
    return []
  }

  // ── Outgoing messages ─────────────────────────────────────────────────────

  async sendMessage(recipientPsid: string, message: OutgoingMessage): Promise<string> {
    const pageAccessToken = config.MESSENGER_PAGE_ACCESS_TOKEN
    if (!pageAccessToken) throw new Error('Messenger credentials not configured')

    const url = `${GRAPH_API_BASE}/me/messages?access_token=${pageAccessToken}`
    const body = this.buildOutgoingPayload(recipientPsid, message)

    const response = await axios.post(url, body)
    return response.data.message_id ?? ''
  }

  private buildOutgoingPayload(recipientPsid: string, message: OutgoingMessage): object {
    const recipient = { id: recipientPsid }

    switch (message.contentType) {
      case 'text':
        return { recipient, message: { text: message.text } }

      case 'image':
        return {
          recipient,
          message: { attachment: { type: 'image', payload: { url: message.mediaUrl, is_reusable: true } } },
        }

      case 'video':
        return {
          recipient,
          message: { attachment: { type: 'video', payload: { url: message.mediaUrl, is_reusable: true } } },
        }

      case 'audio':
        return {
          recipient,
          message: { attachment: { type: 'audio', payload: { url: message.mediaUrl, is_reusable: true } } },
        }

      case 'document':
        return {
          recipient,
          message: { attachment: { type: 'file', payload: { url: message.mediaUrl, is_reusable: true } } },
        }

      default:
        throw new Error(`Cannot send message type "${message.contentType}" via Messenger`)
    }
  }

  // ── Customer profile ──────────────────────────────────────────────────────

  async getProfile(psid: string): Promise<NormalizedCustomerProfile> {
    const pageAccessToken = config.MESSENGER_PAGE_ACCESS_TOKEN
    if (!pageAccessToken) throw new Error('Messenger credentials not configured')

    try {
      const response = await axios.get(
        `${GRAPH_API_BASE}/${psid}?fields=name,profile_pic&access_token=${pageAccessToken}`,
      )

      return {
        platformId: psid,
        platform: 'messenger',
        name: response.data.name,
        avatarUrl: response.data.profile_pic,
      }
    } catch {
      return { platformId: psid, platform: 'messenger' }
    }
  }
}
