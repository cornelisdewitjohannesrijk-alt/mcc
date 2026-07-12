import { format } from 'date-fns'
import { IconCheck, IconCheckSingle, IconReply } from '@/components/icons'

// In dev, media URLs are stored as ngrok/PUBLIC_URL paths which the browser
// can't load directly (ngrok shows an interstitial). Rewrite /uploads/ paths
// to localhost so images load. In production, files are on R2 and the URL
// is already a public CDN URL — no rewriting needed.
function displayUrl(url: string | null): string | null {
  if (!url) return null
  // Only rewrite if it's a local uploads path (dev mode)
  if (url.includes('/uploads/') && !url.includes('r2.') && !url.includes('amazonaws.com')) {
    const filename = url.split('/uploads/')[1]
    return `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/uploads/${filename}`
  }
  return url
}

export interface Message {
  id: string
  platformMessageId?: string | null
  direction: 'inbound' | 'outbound'
  contentType: string
  text: string | null
  mediaUrl: string | null
  mediaFilename?: string | null
  latitude?: number | null
  longitude?: number | null
  replyToMessageId?: string | null
  replyToText?: string | null
  replyToSender?: string | null
  timestamp: string
  status: string | null
}

interface Props {
  message: Message
  isFirst: boolean // first in consecutive group from same sender → show tail
  isLast: boolean  // last in group → show sender name? (for group chats, future)
  onReply?: (message: Message) => void
}

function TickIcon({ status }: { status: string | null }) {
  if (!status || status === 'failed') return null
  if (status === 'sent') return <IconCheckSingle size={14} className="inline" />
  return (
    <span style={{ color: status === 'read' ? 'var(--wa-tick-read)' : undefined }}>
      <IconCheck size={14} className="inline" />
    </span>
  )
}

export function MessageBubble({ message, isFirst, onReply }: Props) {
  const isOut = message.direction === 'outbound'
  const time = format(new Date(message.timestamp), 'HH:mm')

  const bubbleClass = isOut
    ? isFirst ? 'bubble-out' : 'bubble-out-tail-none'
    : isFirst ? 'bubble-in' : 'bubble-in-tail-none'

  return (
    <div className={`group flex ${isOut ? 'justify-end' : 'justify-start'} px-4 ${isFirst ? 'mt-2' : 'mt-0.5'} items-end gap-1`}>
      {/* Reply button — shown on hover, left of bubble for inbound, right side via order for outbound */}
      {onReply && (
        <button
          className={`opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-gray-400 hover:text-gray-600 mb-1 ${isOut ? 'order-first' : 'order-last'}`}
          onClick={() => onReply(message)}
          title="Reply"
        >
          <IconReply size={16} />
        </button>
      )}
      <div
        className={`${bubbleClass} relative max-w-[65%] min-w-[80px] shadow-sm`}
        style={{
          background: isOut ? 'var(--wa-bubble-out)' : 'var(--wa-bubble-in)',
        }}
      >
        {/* Quoted reply preview */}
        {message.replyToText != null && (
          <div
            className="mx-2 mt-1.5 rounded px-2 py-1 text-xs border-l-2"
            style={{
              background: isOut ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.05)',
              borderLeftColor: 'var(--wa-header)',
            }}
          >
            {message.replyToSender && (
              <p className="font-semibold truncate" style={{ color: 'var(--wa-header)' }}>
                {message.replyToSender}
              </p>
            )}
            <p className="text-gray-600 truncate">{message.replyToText}</p>
          </div>
        )}

        {/* Content */}
        <div className="px-2 pt-1.5 pb-1">
          {/* Text */}
          {message.contentType === 'text' && (
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap break-words"
              style={{ color: 'var(--wa-bubble-out-text)' }}
            >
              {message.text}
              {/* Invisible spacer so timestamp doesn't overlap text */}
              <span className="inline-block w-14" aria-hidden />
            </p>
          )}

          {/* Image */}
          {message.contentType === 'image' && message.mediaUrl && (
            <div className="overflow-hidden rounded-md">
              <img
                src={displayUrl(message.mediaUrl)!}
                alt="image"
                className="max-w-full max-h-72 object-contain rounded-md"
              />
              {message.text && (
                <p className="mt-1 text-sm" style={{ color: 'var(--wa-bubble-out-text)' }}>
                  {message.text}
                  <span className="inline-block w-14" aria-hidden />
                </p>
              )}
            </div>
          )}

          {/* Video */}
          {message.contentType === 'video' && message.mediaUrl && (
            <video
              src={displayUrl(message.mediaUrl)!}
              controls
              className="max-w-full max-h-72 rounded-md"
            />
          )}

          {/* Audio */}
          {message.contentType === 'audio' && message.mediaUrl && (
            <audio src={displayUrl(message.mediaUrl)!} controls className="w-52" />
          )}

          {/* Document */}
          {message.contentType === 'document' && (
            <a
              href={displayUrl(message.mediaUrl) ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md p-2 hover:opacity-80"
              style={{ background: isOut ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.04)' }}
            >
              <div
                className="h-9 w-9 flex-shrink-0 rounded flex items-center justify-center text-white text-xs font-bold"
                style={{ background: 'var(--wa-header)' }}
              >
                DOC
              </div>
              <span className="text-xs text-gray-700 truncate max-w-[150px]">
                {message.mediaFilename ?? 'Document'}
              </span>
              <span className="inline-block w-8" aria-hidden />
            </a>
          )}

          {/* Location */}
          {message.contentType === 'location' && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>📍</span>
              <span>{message.text ?? 'Location'}</span>
              <span className="inline-block w-10" aria-hidden />
            </div>
          )}

          {/* Unsupported */}
          {message.contentType === 'unsupported' && (
            <p className="text-xs italic text-gray-400">
              {message.text ?? 'Unsupported message type'}
              <span className="inline-block w-10" aria-hidden />
            </p>
          )}
        </div>

        {/* Timestamp + status — absolutely positioned bottom-right of bubble */}
        <div
          className="absolute bottom-1 right-2 flex items-center gap-0.5 select-none"
          style={{ color: 'var(--wa-timestamp)' }}
        >
          <span className="text-[10px]">{time}</span>
          {isOut && <TickIcon status={message.status} />}
        </div>
      </div>
    </div>
  )
}
