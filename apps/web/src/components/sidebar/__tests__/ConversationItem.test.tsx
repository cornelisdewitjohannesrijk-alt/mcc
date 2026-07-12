import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConversationItem } from '../ConversationItem'

function makeConv(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    platform: 'whatsapp' as const,
    unreadCount: 0,
    lastMessageAt: '2024-06-01T10:00:00.000Z',
    lastMessagePreview: 'See you tomorrow',
    customer: {
      id: 'cust-1',
      name: 'Maria Santos',
      avatarUrl: null,
      whatsappPhone: '+5511999998888',
      messengerPsid: null,
    },
    ...overrides,
  }
}

describe('ConversationItem', () => {
  it('renders the customer name', () => {
    render(<ConversationItem conversation={makeConv()} isActive={false} onClick={() => {}} />)
    expect(screen.getByText('Maria Santos')).toBeInTheDocument()
  })

  it('renders the message preview', () => {
    render(<ConversationItem conversation={makeConv()} isActive={false} onClick={() => {}} />)
    expect(screen.getByText('See you tomorrow')).toBeInTheDocument()
  })

  it('shows unread badge when unreadCount > 0', () => {
    render(
      <ConversationItem
        conversation={makeConv({ unreadCount: 3 })}
        isActive={false}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('does not show unread badge when unreadCount is 0', () => {
    render(<ConversationItem conversation={makeConv({ unreadCount: 0 })} isActive={false} onClick={() => {}} />)
    // No badge element with just a number
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows 99+ for very high unread counts', () => {
    render(
      <ConversationItem
        conversation={makeConv({ unreadCount: 150 })}
        isActive={false}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<ConversationItem conversation={makeConv()} isActive={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('uses phone number as display name when customer name is null', () => {
    render(
      <ConversationItem
        conversation={makeConv({ customer: { id: 'c1', name: null, avatarUrl: null, whatsappPhone: '+5511999997777', messengerPsid: null } })}
        isActive={false}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText('+5511999997777')).toBeInTheDocument()
  })

  it('renders messenger platform badge for messenger conversations', () => {
    const { container } = render(
      <ConversationItem
        conversation={makeConv({ platform: 'messenger', customer: { id: 'c2', name: 'Bob', avatarUrl: null, whatsappPhone: null, messengerPsid: 'psid_123' } })}
        isActive={false}
        onClick={() => {}}
      />,
    )
    // Platform badge is a span with an SVG icon inside, nested in the avatar area
    // JSDOM converts #0084ff to rgb() so we query by structure instead of color
    const badge = container.querySelector('.absolute.-bottom-0\\.5.-right-0\\.5')
    expect(badge).toBeInTheDocument()
    // Should contain an SVG (the messenger icon)
    expect(badge?.querySelector('svg')).toBeInTheDocument()
  })

  it('uses bold name text when there are unread messages', () => {
    render(
      <ConversationItem
        conversation={makeConv({ unreadCount: 2 })}
        isActive={false}
        onClick={() => {}}
      />,
    )
    const nameEl = screen.getByText('Maria Santos')
    expect(nameEl).toHaveClass('font-semibold')
  })
})
