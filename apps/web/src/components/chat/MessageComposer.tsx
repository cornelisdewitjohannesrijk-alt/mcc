'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { IconEmoji, IconAttach, IconMic, IconMicStop, IconSend, IconClose, IconReply } from '@/components/icons'

interface SavedReply {
  id: string
  title: string
  shortcut: string
  text: string
  mediaUrl?: string | null
  mediaType?: string | null
  category?: string | null
}

interface FilePreview {
  file: File
  previewUrl: string | null // null for non-images
  preloadedUrl?: string    // already-uploaded URL (saved reply images); skip re-upload
}

interface ReplyContext {
  platformMessageId: string
  text: string | null
  sender: string | null
}

interface Props {
  onSend: (text: string, mediaUrl?: string, mediaType?: string, mediaFilename?: string, contentType?: string) => void
  replyTo?: ReplyContext | null
  onReplyCancel?: () => void
  disabled?: boolean
  placeholder?: string
}

export function MessageComposer({ onSend, replyTo, onReplyCancel, disabled, placeholder = 'Type a message' }: Props) {
  const [text, setText] = useState('')
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showReplies, setShowReplies] = useState(false)
  const [replySearch, setReplySearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Voice recording
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const repliesRef = useRef<HTMLDivElement>(null)

  const hasText = text.trim().length > 0
  const hasFile = filePreview !== null
  const canSend = (hasText || hasFile) && !disabled && !uploading

  // Fetch saved replies
  const { data: savedRepliesData } = useQuery<{ savedReplies: SavedReply[] }>({
    queryKey: ['saved-replies'],
    queryFn: () => api.get('/saved-replies').then((r) => r.data),
    staleTime: 60_000,
  })
  const savedReplies = savedRepliesData?.savedReplies ?? []

  // All unique categories
  const categories = Array.from(new Set(savedReplies.map((r) => r.category).filter(Boolean))) as string[]

  // Filter saved replies by search term (after the /) and active category
  const filteredReplies = savedReplies.filter((r) => {
    const matchesSearch = !replySearch || r.shortcut.includes(replySearch) || r.title.toLowerCase().includes(replySearch.toLowerCase())
    const matchesCategory = !activeCategory || r.category === activeCategory
    return matchesSearch && matchesCategory
  })

  const mediaReplies = filteredReplies.filter((r) => r.mediaUrl)
  const textReplies = filteredReplies.filter((r) => !r.mediaUrl)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 144) + 'px'
  }, [text])

  // Close saved replies popup on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (repliesRef.current && !repliesRef.current.contains(e.target as Node)) {
        setShowReplies(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setText(val)

    // Show saved replies popup when text starts with /
    if (val.startsWith('/')) {
      setReplySearch(val.slice(1))
      setShowReplies(true)
    } else {
      setShowReplies(false)
      setActiveCategory(null)
    }
  }

  function insertReply(reply: SavedReply) {
    setText(reply.text)
    // If saved reply has an image, fetch and set as file preview
    if (reply.mediaUrl && reply.mediaType) {
      // Create a synthetic file preview from the URL (no re-upload needed — URL is already stored)
      // We signal this via a special object so handleSend uses the URL directly
      setFilePreview({
        file: new File([], reply.mediaUrl, { type: reply.mediaType }),
        previewUrl: reply.mediaUrl,
        preloadedUrl: reply.mediaUrl,
      })
    }
    setShowReplies(false)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // WhatsApp limits: images 5MB, video 16MB, audio 16MB, documents 100MB
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    const isAudio = file.type.startsWith('audio/')
    const maxSize = isImage ? 5 * 1024 * 1024
      : (isVideo || isAudio) ? 16 * 1024 * 1024
      : 100 * 1024 * 1024

    if (file.size > maxSize) {
      const maxMb = maxSize / (1024 * 1024)
      toast.error(`File too large. WhatsApp limit for ${isImage ? 'images' : isVideo ? 'videos' : isAudio ? 'audio' : 'documents'} is ${maxMb}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`)
      e.target.value = ''
      return
    }

    const previewUrl = isImage ? URL.createObjectURL(file) : null
    setFilePreview({ file, previewUrl })

    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  function clearFile() {
    if (filePreview?.previewUrl) URL.revokeObjectURL(filePreview.previewUrl)
    setFilePreview(null)
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Pick the best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
        setRecordingSeconds(0)

        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        if (blob.size === 0) return

        const ext = mimeType.includes('ogg') ? 'ogg' : 'webm'
        const file = new File([blob], `voice-note.${ext}`, { type: mimeType })

        setUploading(true)
        try {
          const formData = new FormData()
          formData.append('file', file)
          const res = await api.post('/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          const { url, mimeType: uploadedMime, filename } = res.data
          onSend('', url, uploadedMime, filename, 'audio')
        } catch (err: unknown) {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed'
          toast.error(msg)
        } finally {
          setUploading(false)
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecordingSeconds(0)
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
    } catch {
      toast.error('Microphone access denied')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setRecording(false)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      mediaRecorderRef.current?.stop()
    }
  }, [])

  function formatRecordingTime(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const handleSend = useCallback(async () => {
    if (!canSend) return

    if (filePreview) {
      setUploading(true)
      try {
        let url: string, mimeType: string, filename: string
        if (filePreview.preloadedUrl) {
          // Already uploaded (saved reply) — use the stored URL directly
          url = filePreview.preloadedUrl
          mimeType = filePreview.file.type
          filename = filePreview.file.name
        } else {
          const formData = new FormData()
          formData.append('file', filePreview.file)
          const res = await api.post('/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          ;({ url, mimeType, filename } = res.data)
        }

        const contentType = mimeType.startsWith('image/') ? 'image'
          : mimeType.startsWith('video/') ? 'video'
          : mimeType.startsWith('audio/') ? 'audio'
          : 'document'

        onSend(text.trim(), url, mimeType, filename, contentType)
        setText('')
        clearFile()
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed'
        toast.error(msg)
      } finally {
        setUploading(false)
      }
    } else {
      onSend(text.trim())
      setText('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    }
  }, [canSend, filePreview, text, onSend])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') setShowReplies(false)
  }

  return (
    <div className="flex-shrink-0 relative" style={{ background: 'var(--wa-search-bg)', borderTop: '1px solid var(--wa-divider)' }}>

      {/* ── Reply-to bar ────────────────────────────────────────────────────── */}
      {replyTo && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-b"
          style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)' }}
        >
          <span style={{ color: 'var(--wa-header)', flexShrink: 0, display: 'flex' }}>
            <IconReply size={14} />
          </span>
          <div className="flex-1 min-w-0 border-l-2 pl-2" style={{ borderLeftColor: 'var(--wa-header)' }}>
            {replyTo.sender && (
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--wa-header)' }}>
                {replyTo.sender}
              </p>
            )}
            <p className="text-xs text-gray-500 truncate">{replyTo.text}</p>
          </div>
          <button
            className="flex-shrink-0 text-gray-400 hover:text-gray-600"
            onClick={onReplyCancel}
          >
            <IconClose size={16} />
          </button>
        </div>
      )}

      {/* ── Saved replies popup ─────────────────────────────────────────────── */}
      {showReplies && (
        <div
          ref={repliesRef}
          className="absolute bottom-full left-0 right-0 mx-3 mb-1 rounded-xl shadow-2xl z-10 flex flex-col"
          style={{ border: '1px solid var(--wa-divider)', background: 'var(--wa-panel-bg)', maxHeight: '420px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--wa-divider)' }}>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--wa-timestamp)' }}>
              Saved Replies {replySearch && <span style={{ color: 'var(--wa-header)' }}>· /{replySearch}</span>}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--wa-timestamp)' }}>{filteredReplies.length} result{filteredReplies.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Category tabs */}
          {categories.length > 0 && (
            <div className="flex gap-1.5 px-3 py-2 border-b overflow-x-auto flex-shrink-0 scrollbar-hide" style={{ borderColor: 'var(--wa-divider)' }}>
              <button
                onMouseDown={(e) => { e.preventDefault(); setActiveCategory(null) }}
                className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
                style={{
                  background: activeCategory === null ? 'var(--wa-header)' : 'var(--wa-search-bg)',
                  color: activeCategory === null ? 'white' : 'var(--wa-bubble-out-text)',
                }}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onMouseDown={(e) => { e.preventDefault(); setActiveCategory(activeCategory === cat ? null : cat) }}
                  className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
                  style={{
                    background: activeCategory === cat ? 'var(--wa-header)' : 'var(--wa-search-bg)',
                    color: activeCategory === cat ? 'white' : 'var(--wa-bubble-out-text)',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="overflow-y-auto flex-1">
            {filteredReplies.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--wa-timestamp)' }}>No saved replies found</p>
            ) : (
              <>
                {/* Media grid */}
                {mediaReplies.length > 0 && (
                  <div className="p-2">
                    {textReplies.length > 0 && (
                      <p className="text-[10px] font-semibold uppercase tracking-wide px-1 pb-1.5" style={{ color: 'var(--wa-timestamp)' }}>Media</p>
                    )}
                    <div className="grid grid-cols-3 gap-1.5">
                      {mediaReplies.map((reply) => (
                        <button
                          key={reply.id}
                          onMouseDown={(e) => { e.preventDefault(); insertReply(reply) }}
                          className="relative rounded-lg overflow-hidden aspect-square group"
                          style={{ background: 'var(--wa-search-bg)' }}
                          title={reply.title}
                        >
                          {reply.mediaType?.startsWith('image/') ? (
                            <img src={reply.mediaUrl!} alt={reply.title} className="w-full h-full object-cover" />
                          ) : reply.mediaType?.startsWith('video/') ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                              <span className="text-2xl">🎬</span>
                              <span className="text-[9px] font-medium px-1 text-center leading-tight" style={{ color: 'var(--wa-timestamp)' }}>
                                {reply.title}
                              </span>
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-2xl">📎</span>
                            </div>
                          )}
                          {/* Hover overlay */}
                          <div
                            className="absolute inset-0 flex flex-col items-center justify-end p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 60%)' }}
                          >
                            <p className="text-white text-[10px] font-medium text-center leading-tight truncate w-full">{reply.title}</p>
                            <p className="text-white/70 text-[9px]">/{reply.shortcut}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Text replies list */}
                {textReplies.length > 0 && (
                  <div className={mediaReplies.length > 0 ? 'border-t' : ''} style={{ borderColor: 'var(--wa-divider)' }}>
                    {mediaReplies.length > 0 && (
                      <p className="text-[10px] font-semibold uppercase tracking-wide px-3 pt-2 pb-1" style={{ color: 'var(--wa-timestamp)' }}>Text</p>
                    )}
                    {textReplies.map((reply) => (
                      <button
                        key={reply.id}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
                        style={{ borderBottom: '1px solid var(--wa-divider)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--wa-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        onMouseDown={(e) => { e.preventDefault(); insertReply(reply) }}
                      >
                        <span
                          className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--wa-header)', color: 'white', minWidth: '32px', textAlign: 'center' }}
                        >
                          /{reply.shortcut}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--wa-bubble-out-text)' }}>{reply.title}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--wa-timestamp)' }}>{reply.text}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── File preview ────────────────────────────────────────────────────── */}
      {filePreview && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
          {filePreview.previewUrl ? (
            <img
              src={filePreview.previewUrl}
              alt="Preview"
              className="h-14 w-14 rounded object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-14 w-14 rounded bg-blue-50 flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-blue-600 font-semibold text-center px-1 break-all leading-tight">
                {filePreview.file.name.split('.').pop()?.toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{filePreview.file.name}</p>
            <p className="text-xs text-gray-400">{(filePreview.file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            onClick={clearFile}
          >
            <IconClose size={18} />
          </button>
        </div>
      )}

      {/* ── Input row ───────────────────────────────────────────────────────── */}
      <div className="flex items-end gap-2 px-3 py-2">

        {/* Recording mode: show timer + cancel */}
        {recording ? (
          <>
            <div className="flex flex-1 items-center gap-3 rounded-lg bg-white shadow-sm px-4 py-2.5" style={{ border: '1px solid var(--wa-divider)' }}>
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-mono text-gray-700">{formatRecordingTime(recordingSeconds)}</span>
              <span className="text-xs text-gray-400 flex-1">Recording…</span>
              <button
                className="text-gray-400 hover:text-gray-600 text-xs"
                onClick={() => {
                  // Cancel: stop without uploading
                  mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop())
                  if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
                  audioChunksRef.current = []
                  mediaRecorderRef.current = null
                  setRecording(false)
                  setRecordingSeconds(0)
                }}
              >
                Cancel
              </button>
            </div>
            {/* Stop & send */}
            <button
              onClick={stopRecording}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white mb-0.5"
              style={{ background: '#ef4444' }}
              title="Stop recording"
            >
              <IconMicStop size={18} />
            </button>
          </>
        ) : (
          <>
            {/* Emoji button */}
            <button className="icon-btn flex-shrink-0 mb-0.5" style={{ color: 'var(--wa-icon-btn)' }} disabled={disabled}>
              <IconEmoji size={24} />
            </button>

            {/* Attach button */}
            <button
              className="icon-btn flex-shrink-0 mb-0.5"
              style={{ color: 'var(--wa-icon-btn)' }}
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
            >
              <IconAttach size={24} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/mp4,audio/mpeg,audio/ogg,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFileChange}
            />

            {/* Text input */}
            <div className="flex flex-1 items-end rounded-lg shadow-sm" style={{ border: '1px solid var(--wa-divider)', background: 'var(--wa-panel-bg)' }}>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder={filePreview ? 'Add a caption (optional)' : placeholder}
                rows={1}
                disabled={disabled}
                className="flex-1 resize-none bg-transparent px-4 py-2.5 text-sm outline-none leading-relaxed"
                style={{ maxHeight: '144px', overflowY: 'auto', color: 'var(--wa-bubble-out-text)' }}
              />
            </div>

            {/* Send / Mic button */}
            <button
              onClick={canSend ? handleSend : () => startRecording()}
              disabled={disabled || uploading}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white transition-all duration-150 disabled:opacity-50 mb-0.5"
              style={{ background: 'var(--wa-send-btn)' }}
              title={canSend ? (uploading ? 'Uploading…' : 'Send') : 'Record voice note'}
            >
              {uploading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : canSend ? (
                <IconSend size={20} />
              ) : (
                <IconMic size={20} />
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
