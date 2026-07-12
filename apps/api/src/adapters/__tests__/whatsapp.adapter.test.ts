import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import { WhatsAppAdapter, isWhatsAppMediaId } from '../whatsapp.adapter'

// Mock config so tests don't need a .env file
vi.mock('../../config', () => ({
  config: {
    WHATSAPP_APP_SECRET: 'test-app-secret-1234567890abcdef',
    WHATSAPP_ACCESS_TOKEN: 'test-access-token',
    WHATSAPP_PHONE_NUMBER_ID: '111111111111',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'my-verify-token',
  },
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const textMessagePayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15550001111', phone_number_id: '111111111111' },
        contacts: [{ profile: { name: 'John Doe' }, wa_id: '15559999999' }],
        messages: [{
          from: '15559999999',
          id: 'wamid.abc123',
          timestamp: '1700000000',
          type: 'text',
          text: { body: 'Hello there!' },
        }],
      },
    }],
  }],
}

const imageMessagePayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15550001111', phone_number_id: '111111111111' },
        contacts: [{ profile: { name: 'Jane' }, wa_id: '15558888888' }],
        messages: [{
          from: '15558888888',
          id: 'wamid.img456',
          timestamp: '1700000060',
          type: 'image',
          image: { id: '987654321098765', mime_type: 'image/jpeg', sha256: 'abc', caption: 'Check this out' },
        }],
      },
    }],
  }],
}

const statusPayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15550001111', phone_number_id: '111111111111' },
        statuses: [
          { id: 'wamid.abc123', status: 'delivered', timestamp: '1700000010', recipient_id: '15559999999' },
          { id: 'wamid.abc123', status: 'read',      timestamp: '1700000020', recipient_id: '15559999999' },
        ],
      },
    }],
  }],
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WhatsAppAdapter', () => {
  let adapter: WhatsAppAdapter

  beforeEach(() => {
    adapter = new WhatsAppAdapter()
  })

  // ── normalizeIncoming ────────────────────────────────────────────────────

  describe('normalizeIncoming', () => {
    it('normalizes a text message', () => {
      const result = adapter.normalizeIncoming(textMessagePayload)

      expect(result).toHaveLength(1)
      const msg = result[0]
      expect(msg.platform).toBe('whatsapp')
      expect(msg.direction).toBe('inbound')
      expect(msg.contentType).toBe('text')
      expect(msg.text).toBe('Hello there!')
      expect(msg.platformMessageId).toBe('wamid.abc123')
      expect(msg.senderId).toBe('15559999999')
      expect(msg.senderName).toBe('John Doe')
      expect(msg.timestamp).toEqual(new Date(1700000000 * 1000))
    })

    it('normalizes an image message and preserves media ID', () => {
      const result = adapter.normalizeIncoming(imageMessagePayload)

      expect(result).toHaveLength(1)
      const msg = result[0]
      expect(msg.contentType).toBe('image')
      expect(msg.mediaUrl).toBe('987654321098765') // raw ID, not a URL yet
      expect(msg.mediaType).toBe('image/jpeg')
      expect(msg.text).toBe('Check this out') // caption
      expect(msg.senderId).toBe('15558888888')
      expect(msg.senderName).toBe('Jane')
    })

    it('returns empty array for non-message changes (e.g. status only)', () => {
      const result = adapter.normalizeIncoming(statusPayload)
      expect(result).toHaveLength(0)
    })

    it('returns empty array for empty payload', () => {
      const result = adapter.normalizeIncoming({ object: 'whatsapp_business_account', entry: [] })
      expect(result).toHaveLength(0)
    })

    it('marks unsupported message types', () => {
      const payload = {
        ...textMessagePayload,
        entry: [{
          ...textMessagePayload.entry[0],
          changes: [{
            field: 'messages',
            value: {
              ...textMessagePayload.entry[0].changes[0].value,
              messages: [{
                from: '15559999999',
                id: 'wamid.xyz',
                timestamp: '1700000000',
                type: 'interactive', // not supported
              }],
            },
          }],
        }],
      }
      const result = adapter.normalizeIncoming(payload)
      expect(result[0].contentType).toBe('unsupported')
    })
  })

  // ── extractStatusUpdates ─────────────────────────────────────────────────

  describe('extractStatusUpdates', () => {
    it('extracts delivered and read status updates', () => {
      const updates = adapter.extractStatusUpdates(statusPayload)

      expect(updates).toHaveLength(2)
      expect(updates[0]).toEqual({
        platformMessageId: 'wamid.abc123',
        status: 'delivered',
        timestamp: new Date(1700000010 * 1000),
      })
      expect(updates[1]).toEqual({
        platformMessageId: 'wamid.abc123',
        status: 'read',
        timestamp: new Date(1700000020 * 1000),
      })
    })

    it('returns empty array when no statuses in payload', () => {
      const updates = adapter.extractStatusUpdates(textMessagePayload)
      expect(updates).toHaveLength(0)
    })
  })

  // ── handleVerificationChallenge ──────────────────────────────────────────

  describe('handleVerificationChallenge', () => {
    it('returns challenge when token matches', () => {
      const req = {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'my-verify-token',
          'hub.challenge': '12345',
        },
      } as never

      const result = adapter.handleVerificationChallenge(req)
      expect(result).toBe('12345')
    })

    it('returns null when token does not match', () => {
      const req = {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': '12345',
        },
      } as never

      const result = adapter.handleVerificationChallenge(req)
      expect(result).toBeNull()
    })

    it('returns null when mode is not subscribe', () => {
      const req = {
        query: {
          'hub.mode': 'unsubscribe',
          'hub.verify_token': 'my-verify-token',
          'hub.challenge': '12345',
        },
      } as never

      const result = adapter.handleVerificationChallenge(req)
      expect(result).toBeNull()
    })
  })

  // ── verifyWebhookSignature ───────────────────────────────────────────────

  describe('verifyWebhookSignature', () => {
    it('returns true for a valid HMAC-SHA256 signature', () => {
      const secret = 'test-app-secret-1234567890abcdef'
      const body = JSON.stringify(textMessagePayload)
      const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')

      const req = {
        headers: { 'x-hub-signature-256': sig },
        body: textMessagePayload,
      } as never

      expect(adapter.verifyWebhookSignature(req)).toBe(true)
    })

    it('returns false for an invalid signature', () => {
      const req = {
        headers: { 'x-hub-signature-256': 'sha256=invalidsignature1234567890abcdef12345678' },
        body: textMessagePayload,
      } as never

      expect(adapter.verifyWebhookSignature(req)).toBe(false)
    })
  })
})

// ─── isWhatsAppMediaId ────────────────────────────────────────────────────────

describe('isWhatsAppMediaId', () => {
  it('returns true for numeric strings (media IDs)', () => {
    expect(isWhatsAppMediaId('987654321098765')).toBe(true)
    expect(isWhatsAppMediaId('1234567890')).toBe(true)
  })

  it('returns false for real URLs', () => {
    expect(isWhatsAppMediaId('https://lookaside.fbsbx.com/whatsapp/foo.jpg')).toBe(false)
    expect(isWhatsAppMediaId('https://example.com/file.pdf')).toBe(false)
  })

  it('returns false for undefined or empty', () => {
    expect(isWhatsAppMediaId(undefined)).toBe(false)
    expect(isWhatsAppMediaId('')).toBe(false)
  })
})
