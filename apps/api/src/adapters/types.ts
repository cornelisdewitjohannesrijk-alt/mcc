import type { FastifyRequest } from 'fastify'
import type {
  NormalizedMessage,
  NormalizedCustomerProfile,
  Platform,
  MessageContentType,
} from '@mcc/shared'

// ─── Outgoing Message ─────────────────────────────────────────────────────────

export interface OutgoingMessage {
  contentType: MessageContentType
  text?: string
  mediaUrl?: string
  mediaType?: string
  mediaFilename?: string
  latitude?: number
  longitude?: number
  replyToMessageId?: string  // platform message ID to quote
}

// ─── Channel Adapter Interface ────────────────────────────────────────────────
// Every new channel (Instagram, Live Chat, etc.) must implement this interface.
// The rest of the application only interacts with this contract.

export interface ChannelAdapter {
  readonly platform: Platform

  /**
   * Verifies that an incoming webhook request is genuinely from Meta.
   * Returns true if the signature is valid.
   */
  verifyWebhookSignature(req: FastifyRequest): boolean

  /**
   * Handles the initial GET request Meta sends to verify the webhook endpoint.
   * Returns the hub.challenge string to send back, or null if invalid.
   */
  handleVerificationChallenge(req: FastifyRequest): string | null

  /**
   * Transforms the raw platform payload into a list of normalized messages.
   * One webhook event can contain multiple messages.
   */
  normalizeIncoming(payload: unknown): NormalizedMessage[]

  /**
   * Sends a message to the customer through this platform.
   */
  sendMessage(recipientId: string, message: OutgoingMessage): Promise<string>

  /**
   * Fetches the customer's profile from the platform.
   */
  getProfile(platformId: string): Promise<NormalizedCustomerProfile>

  /**
   * Checks if a delivery receipt / status update is included in the payload.
   * Returns status updates to apply, or empty array.
   */
  extractStatusUpdates(payload: unknown): StatusUpdate[]
}

export interface StatusUpdate {
  platformMessageId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: Date
}
