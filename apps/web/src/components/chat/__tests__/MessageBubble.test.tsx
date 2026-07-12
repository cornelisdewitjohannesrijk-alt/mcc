import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageBubble } from '../MessageBubble'

function makeMessage(overrides: Partial<Parameters<typeof MessageBubble>[0]['message']> = {}) {
  return {
    id: 'msg-1',
    direction: 'inbound' as const,
    contentType: 'text',
    text: 'Hello!',
    mediaUrl: null,
    mediaFilename: null,
    timestamp: '2024-01-15T10:30:00.000Z',
    status: null,
    ...overrides,
  }
}

describe('MessageBubble', () => {
  it('renders text content', () => {
    render(<MessageBubble message={makeMessage({ text: 'Hey there' })} isFirst isLast />)
    expect(screen.getByText('Hey there')).toBeInTheDocument()
  })

  it('renders the timestamp in HH:mm format', () => {
    render(<MessageBubble message={makeMessage({ timestamp: '2024-06-01T14:35:00.000Z' })} isFirst isLast />)
    // Match HH:mm pattern — exact hour depends on test runner timezone
    const timestampEl = document.querySelector('.text-\\[10px\\]')
    expect(timestampEl?.textContent).toMatch(/^\d{2}:\d{2}$/)
  })

  it('applies outbound bubble class for outgoing messages', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ direction: 'outbound' })} isFirst isLast />,
    )
    // Outbound messages are right-aligned
    expect(container.firstChild).toHaveClass('justify-end')
  })

  it('applies inbound bubble alignment for incoming messages', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ direction: 'inbound' })} isFirst isLast />,
    )
    expect(container.firstChild).toHaveClass('justify-start')
  })

  it('renders a document attachment with filename', () => {
    render(
      <MessageBubble
        message={makeMessage({
          contentType: 'document',
          mediaUrl: 'https://example.com/file.pdf',
          mediaFilename: 'invoice.pdf',
          text: null,
        })}
        isFirst
        isLast
      />,
    )
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
  })

  it('renders unsupported message type gracefully', () => {
    render(
      <MessageBubble
        message={makeMessage({
          contentType: 'unsupported',
          text: 'Unsupported message type: interactive',
        })}
        isFirst
        isLast
      />,
    )
    expect(screen.getByText(/Unsupported message type/)).toBeInTheDocument()
  })

  it('renders a location message', () => {
    render(
      <MessageBubble
        message={makeMessage({ contentType: 'location', text: 'My office' })}
        isFirst
        isLast
      />,
    )
    expect(screen.getByText(/My office/)).toBeInTheDocument()
  })

  it('shows single tick for sent status', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({ direction: 'outbound', status: 'sent' })}
        isFirst
        isLast
      />,
    )
    // Single tick SVG is present
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('does not show ticks for inbound messages', () => {
    const { container } = render(
      <MessageBubble message={makeMessage({ direction: 'inbound', status: null })} isFirst isLast />,
    )
    // Timestamp area has no SVG tick for inbound
    const timestampEl = container.querySelector('.text-\\[10px\\]')
    expect(timestampEl?.querySelector('svg')).toBeNull()
  })
})
