import { describe, it, expect, vi } from 'vitest'

// Mock Prisma before importing the service — the method under test is pure
// logic and never touches the DB, but the module-level import would fail
// without a generated Prisma client.
vi.mock('../../db/prisma', () => ({ default: {} }))

import { ConversationService } from '../conversation.service'

// Pure logic tests — no DB needed for these

const service = new ConversationService()

describe('ConversationService.isWhatsAppWindowOpen', () => {
  it('returns false when lastCustomerMessageAt is null', () => {
    expect(service.isWhatsAppWindowOpen(null)).toBe(false)
  })

  it('returns true when last message was 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000)
    expect(service.isWhatsAppWindowOpen(oneHourAgo)).toBe(true)
  })

  it('returns true when last message was 23 hours ago', () => {
    const almostExpired = new Date(Date.now() - 23 * 60 * 60 * 1000)
    expect(service.isWhatsAppWindowOpen(almostExpired)).toBe(true)
  })

  it('returns false when last message was exactly 24 hours ago', () => {
    const expired = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(service.isWhatsAppWindowOpen(expired)).toBe(false)
  })

  it('returns false when last message was 2 days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
    expect(service.isWhatsAppWindowOpen(twoDaysAgo)).toBe(false)
  })

  it('returns true for a message received just now', () => {
    const justNow = new Date()
    expect(service.isWhatsAppWindowOpen(justNow)).toBe(true)
  })
})
