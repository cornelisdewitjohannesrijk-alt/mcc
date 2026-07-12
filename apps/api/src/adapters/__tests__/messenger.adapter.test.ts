import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import { MessengerAdapter } from '../messenger.adapter'

vi.mock('../../config', () => ({
  config: {
    MESSENGER_APP_SECRET: 'test-messenger-secret-abcdef1234567890',
    MESSENGER_PAGE_ACCESS_TOKEN: 'test-page-access-token',
    MESSENGER_PAGE_ID: '111222333',
    MESSENGER_WEBHOOK_VERIFY_TOKEN: 'messenger-verify-token',
  },
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const textMessagePayload = {
  object: 'page',
  entry: [{
    id: '111222333',
    time: 1700000000000,
    messaging: [{
      sender: { id: 'PSID_123456' },
      recipient: { id: '111222333' },
      timestamp: 1700000000000,
      message: {
        mid: 'm_abc123',
        text: 'Hey, I need help!',
      },
    }],
  }],
}

const imagePayload = {
  object: 'page',
  entry: [{
    id: '111222333',
    time: 1700000060000,
    messaging: [{
      sender: { id: 'PSID_789012' },
      recipient: { id: '111222333' },
      timestamp: 1700000060000,
      message: {
        mid: 'm_img789',
        attachments: [{
          type: 'image',
          payload: { url: 'https://cdn.example.com/photo.jpg' },
        }],
      },
    }],
  }],
}

const echoPayload = {
  object: 'page',
  entry: [{
    id: '111222333',
    time: 1700000000000,
    messaging: [{
      sender: { id: '111222333' },
      recipient: { id: 'PSID_123456' },
      timestamp: 1700000000000,
      message: {
        mid: 'm_echo_001',
        text: 'Echo: our reply',
        is_echo: true,
      },
    }],
  }],
}

const locationPayload = {
  object: 'page',
  entry: [{
    id: '111222333',
    time: 1700000000000,
    messaging: [{
      sender: { id: 'PSID_loc' },
      recipient: { id: '111222333' },
      timestamp: 1700000000000,
      message: {
        mid: 'm_loc001',
        attachments: [{
          type: 'location',
          payload: { coordinates: { lat: 40.7128, long: -74.006 } },
        }],
      },
    }],
  }],
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MessengerAdapter', () => {
  let adapter: MessengerAdapter

  beforeEach(() => {
    adapter = new MessengerAdapter()
  })

  // ── normalizeIncoming ────────────────────────────────────────────────────

  describe('normalizeIncoming', () => {
    it('normalizes a text message', () => {
      const result = adapter.normalizeIncoming(textMessagePayload)

      expect(result).toHaveLength(1)
      const msg = result[0]
      expect(msg.platform).toBe('messenger')
      expect(msg.direction).toBe('inbound')
      expect(msg.contentType).toBe('text')
      expect(msg.text).toBe('Hey, I need help!')
      expect(msg.platformMessageId).toBe('m_abc123')
      expect(msg.senderId).toBe('PSID_123456')
      expect(msg.timestamp).toEqual(new Date(1700000000000))
    })

    it('normalizes an image attachment', () => {
      const result = adapter.normalizeIncoming(imagePayload)

      expect(result).toHaveLength(1)
      const msg = result[0]
      expect(msg.contentType).toBe('image')
      expect(msg.mediaUrl).toBe('https://cdn.example.com/photo.jpg')
      expect(msg.senderId).toBe('PSID_789012')
    })

    it('normalizes a location attachment', () => {
      const result = adapter.normalizeIncoming(locationPayload)

      expect(result).toHaveLength(1)
      const msg = result[0]
      expect(msg.contentType).toBe('location')
      expect(msg.latitude).toBe(40.7128)
      expect(msg.longitude).toBe(-74.006)
    })

    it('skips echo messages (sent by the page itself)', () => {
      const result = adapter.normalizeIncoming(echoPayload)
      expect(result).toHaveLength(0)
    })

    it('skips events without a message field (read receipts, delivery)', () => {
      const readReceiptPayload = {
        object: 'page',
        entry: [{
          id: '111222333',
          time: 1700000000000,
          messaging: [{
            sender: { id: 'PSID_123456' },
            recipient: { id: '111222333' },
            timestamp: 1700000000000,
            read: { watermark: 1700000000000 },
          }],
        }],
      }
      const result = adapter.normalizeIncoming(readReceiptPayload)
      expect(result).toHaveLength(0)
    })

    it('handles multiple messages in a single payload', () => {
      const multiPayload = {
        object: 'page',
        entry: [{
          id: '111222333',
          time: 1700000000000,
          messaging: [
            {
              sender: { id: 'PSID_A' },
              recipient: { id: '111222333' },
              timestamp: 1700000000000,
              message: { mid: 'm_1', text: 'First' },
            },
            {
              sender: { id: 'PSID_B' },
              recipient: { id: '111222333' },
              timestamp: 1700000001000,
              message: { mid: 'm_2', text: 'Second' },
            },
          ],
        }],
      }
      const result = adapter.normalizeIncoming(multiPayload)
      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('First')
      expect(result[1].text).toBe('Second')
    })
  })

  // ── extractStatusUpdates ─────────────────────────────────────────────────

  describe('extractStatusUpdates', () => {
    it('returns empty array (Messenger uses watermarks, not per-message IDs)', () => {
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
          'hub.verify_token': 'messenger-verify-token',
          'hub.challenge': '98765',
        },
      } as never

      expect(adapter.handleVerificationChallenge(req)).toBe('98765')
    })

    it('returns null for wrong token', () => {
      const req = {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'bad-token',
          'hub.challenge': '98765',
        },
      } as never

      expect(adapter.handleVerificationChallenge(req)).toBeNull()
    })
  })

  // ── verifyWebhookSignature ───────────────────────────────────────────────

  describe('verifyWebhookSignature', () => {
    it('returns true for a valid HMAC-SHA256 signature', () => {
      const secret = 'test-messenger-secret-abcdef1234567890'
      const body = JSON.stringify(textMessagePayload)
      const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')

      const req = {
        headers: { 'x-hub-signature-256': sig },
        body: textMessagePayload,
      } as never

      expect(adapter.verifyWebhookSignature(req)).toBe(true)
    })

    it('returns false for tampered payload', () => {
      const req = {
        headers: { 'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000' },
        body: textMessagePayload,
      } as never

      expect(adapter.verifyWebhookSignature(req)).toBe(false)
    })
  })
})
