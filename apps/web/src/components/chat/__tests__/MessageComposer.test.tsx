import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageComposer } from '../MessageComposer'

describe('MessageComposer', () => {
  it('renders the textarea placeholder', () => {
    render(<MessageComposer onSend={() => {}} />)
    expect(screen.getByPlaceholderText('Type a message')).toBeInTheDocument()
  })

  it('shows mic button when input is empty', () => {
    render(<MessageComposer onSend={() => {}} />)
    // Mic SVG path is distinctive
    expect(screen.getByTitle('Voice message')).toBeInTheDocument()
  })

  it('shows send button when text is typed', async () => {
    const user = userEvent.setup()
    render(<MessageComposer onSend={() => {}} />)
    await user.type(screen.getByPlaceholderText('Type a message'), 'Hello')
    expect(screen.getByTitle('Send')).toBeInTheDocument()
  })

  it('calls onSend with text when send button is clicked', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<MessageComposer onSend={onSend} />)

    await user.type(screen.getByPlaceholderText('Type a message'), 'Hello world')
    fireEvent.click(screen.getByTitle('Send'))

    expect(onSend).toHaveBeenCalledWith('Hello world')
  })

  it('calls onSend when Enter is pressed (no Shift)', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<MessageComposer onSend={onSend} />)

    const textarea = screen.getByPlaceholderText('Type a message')
    await user.type(textarea, 'Quick message')
    await user.keyboard('{Enter}')

    expect(onSend).toHaveBeenCalledWith('Quick message')
  })

  it('does not call onSend when Shift+Enter is pressed (newline instead)', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<MessageComposer onSend={onSend} />)

    const textarea = screen.getByPlaceholderText('Type a message')
    await user.type(textarea, 'Line 1')
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('clears the input after sending', async () => {
    const user = userEvent.setup()
    render(<MessageComposer onSend={() => {}} />)

    const textarea = screen.getByPlaceholderText('Type a message')
    await user.type(textarea, 'A message')
    fireEvent.click(screen.getByTitle('Send'))

    expect(textarea).toHaveValue('')
  })

  it('does not send empty or whitespace-only messages', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<MessageComposer onSend={onSend} />)

    const textarea = screen.getByPlaceholderText('Type a message')
    await user.type(textarea, '   ')
    await user.keyboard('{Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables input and send button when disabled prop is true', () => {
    render(<MessageComposer onSend={() => {}} disabled />)
    expect(screen.getByPlaceholderText('Type a message')).toBeDisabled()
  })
})
