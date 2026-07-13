import { memo, useState } from 'react'
import { format } from 'date-fns'
import { IconCheck, IconCheckSingle, IconReply, IconStar, IconForward, IconClose } from '@/components/icons'

function displayUrl(url: string | null): string | null {
  if (!url) return null
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
  starred?: boolean
}

interface Props {
  message: Message
  isFirst: boolean
  isLast: boolean
  onReply?: (message: Message) => void
  onForward?: (message: Message) => void
  onStar?: (id: string, starred: boolean) => void
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

export const MessageBubble = memo(function MessageBubble({ message, isFirst, onReply, onForward, onStar }: Props) {
  const isOut = message.direction === 'outbound'
  const time = format(new Date(message.timestamp), 'HH:mm')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const bubbleClass = isOut
    ? isFirst ? 'bubble-out' : 'bubble-out-tail-none'
    : isFirst ? 'bubble-in' : 'bubble-in-tail-none'

  return (
    <>
      {/* ── Image lightbox ─────────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10"
            onClick={() => setLightboxUrl(null)}
          >
            <IconClose size={24} />
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-full object-contain select-none"
            style={{ maxWidth: '95vw', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div
        className={`group flex ${isOut ? 'justify-end' : 'justify-start'} px-4 ${isFirst ? 'mt-2' : 'mt-0.5'} items-end gap-1 relative`}
      >
        {/* Action buttons — show on hover */}
        <div
          className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mb-1 flex-shrink-0 ${isOut ? 'order-first' : 'order-last'}`}
        >
          {onReply && (
            <button
              className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-black/5"
              onClick={() => onReply(message)}
              title="Reply"
            >
              <IconReply size={15} />
            </button>
          )}
          {onStar && (
            <button
              className={`p-1 rounded-full hover:bg-black/5 ${message.starred ? 'text-yellow-400' : 'text-gray-400 hover:text-yellow-400'}`}
              onClick={() => onStar(message.id, !message.starred)}
              title={message.starred ? 'Unstar' : 'Star'}
            >
              <IconStar size={15} filled={!!message.starred} />
            </button>
          )}
          {onForward && (
            <button
              className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-black/5"
              onClick={() => onForward(message)}
              title="Forward"
            >
              <IconForward size={15} />
            </button>
          )}
        </div>

        <div
          className={`${bubbleClass} relative max-w-[65%] min-w-[80px] shadow-sm`}
          style={{ background: isOut ? 'var(--wa-bubble-out)' : 'var(--wa-bubble-in)' }}
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
              <p className="truncate" style={{ color: 'var(--wa-timestamp)' }}>{message.replyToText}</p>
            </div>
          )}

          {/* Content */}
          <div className="px-2 pt-1.5 pb-1">
            {message.contentType === 'text' && (
              <p
                className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                style={{ color: 'var(--wa-bubble-out-text)' }}
              >
                {message.text}
                <span className="inline-block w-14" aria-hidden />
              </p>
            )}

            {message.contentType === 'image' && message.mediaUrl && (
              <div className="overflow-hidden rounded-md">
                <img
                  src={displayUrl(message.mediaUrl)!}
                  alt="image"
                  className="max-w-full max-h-72 object-contain rounded-md cursor-zoom-in"
                  onClick={(e) => { e.stopPropagation(); setLightboxUrl(displayUrl(message.mediaUrl)!) }}
                />
                {message.text && (
                  <p className="mt-1 text-sm" style={{ color: 'var(--wa-bubble-out-text)' }}>
                    {message.text}
                    <span className="inline-block w-14" aria-hidden />
                  </p>
                )}
              </div>
            )}

            {message.contentType === 'video' && message.mediaUrl && (
              <video src={displayUrl(message.mediaUrl)!} controls className="max-w-full max-h-72 rounded-md" />
            )}

            {message.contentType === 'audio' && message.mediaUrl && (
              <audio src={displayUrl(message.mediaUrl)!} controls className="w-52" />
            )}

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
                <span className="text-xs truncate max-w-[150px]" style={{ color: 'var(--wa-bubble-out-text)' }}>
                  {message.mediaFilename ?? 'Document'}
                </span>
                <span className="inline-block w-8" aria-hidden />
              </a>
            )}

            {message.contentType === 'location' && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--wa-bubble-out-text)' }}>
                <span>📍</span>
                <span>{message.text ?? 'Location'}</span>
                <span className="inline-block w-10" aria-hidden />
              </div>
            )}

            {message.contentType === 'unsupported' && (
              <p className="text-xs italic" style={{ color: 'var(--wa-timestamp)' }}>
                {message.text ?? 'Unsupported message type'}
                <span className="inline-block w-10" aria-hidden />
              </p>
            )}
          </div>

          {/* Timestamp + status */}
          <div
            className="absolute bottom-1 right-2 flex items-center gap-0.5 select-none"
            style={{ color: 'var(--wa-timestamp)' }}
          >
            {message.starred && <IconStar size={10} filled className="text-yellow-400 mr-0.5" />}
            <span className="text-[10px]">{time}</span>
            {isOut && <TickIcon status={message.status} />}
          </div>
        </div>
      </div>
    </>
  )
})
