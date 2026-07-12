'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { IconClose, IconAttach } from '@/components/icons'

export interface SavedReply {
  id: string
  title: string
  shortcut: string
  text: string
  mediaUrl?: string | null
  mediaType?: string | null
}

interface Props {
  onClose: () => void
}

export function SavedRepliesModal({ onClose }: Props) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [shortcut, setShortcut] = useState('')
  const [text, setText] = useState('')
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const { data } = useQuery<{ savedReplies: SavedReply[] }>({
    queryKey: ['saved-replies'],
    queryFn: () => api.get('/saved-replies').then((r) => r.data),
  })
  const replies = data?.savedReplies ?? []

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setMediaUrl(res.data.url)
      setMediaType(res.data.mimeType)
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const createMutation = useMutation({
    mutationFn: () => api.post('/saved-replies', { title, shortcut, text, mediaUrl, mediaType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-replies'] })
      setTitle(''); setShortcut(''); setText(''); setMediaUrl(null); setMediaType(null)
      toast.success('Saved reply created')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/saved-replies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-replies'] })
      toast.success('Deleted')
    },
  })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !shortcut.trim() || (!text.trim() && !mediaUrl)) return
    createMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--wa-panel-bg)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ background: 'var(--wa-header)' }}
        >
          <h2 className="text-white font-semibold text-[15px]">Saved Replies</h2>
          <button className="icon-btn icon-btn-white" onClick={onClose}>
            <IconClose size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Create form */}
          <form onSubmit={handleCreate} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--wa-timestamp)' }}>New Saved Reply</p>
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (e.g. Greeting)"
                className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-400"
                style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)', color: 'var(--wa-bubble-out-text)' }}
              />
              <div className="w-32 flex items-center rounded-lg border focus-within:border-blue-400" style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)' }}>
                <span className="pl-3 text-sm" style={{ color: 'var(--wa-timestamp)' }}>/</span>
                <input
                  value={shortcut}
                  onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="shortcut"
                  className="flex-1 rounded-lg px-1 py-2 text-sm outline-none bg-transparent"
                  style={{ color: 'var(--wa-bubble-out-text)' }}
                />
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Reply text… (optional if image attached)"
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
              style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)', color: 'var(--wa-bubble-out-text)' }}
            />

            {/* Image attachment */}
            {mediaUrl ? (
              <div className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)' }}>
                {mediaType?.startsWith('image/') && (
                  <img src={mediaUrl} alt="" className="h-12 w-12 rounded object-cover flex-shrink-0" />
                )}
                <span className="flex-1 text-xs truncate" style={{ color: 'var(--wa-bubble-out-text)' }}>Image attached</span>
                <button type="button" onClick={() => { setMediaUrl(null); setMediaType(null) }} className="text-gray-400 hover:text-red-400">
                  <IconClose size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--wa-divider)', color: 'var(--wa-timestamp)' }}
              >
                <IconAttach size={14} />
                {uploading ? 'Uploading…' : 'Attach image (optional)'}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            <button
              type="submit"
              disabled={!title.trim() || !shortcut.trim() || (!text.trim() && !mediaUrl) || createMutation.isPending}
              className="w-full py-2 rounded-lg text-white text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--wa-header)' }}
            >
              {createMutation.isPending ? 'Saving…' : 'Save Reply'}
            </button>
          </form>

          {/* List */}
          {replies.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--wa-timestamp)' }}>
                Your Replies ({replies.length})
              </p>
              {replies.map((reply) => (
                <div
                  key={reply.id}
                  className="flex items-start gap-3 p-3 rounded-lg border"
                  style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)' }}
                >
                  {reply.mediaUrl && reply.mediaType?.startsWith('image/') && (
                    <img src={reply.mediaUrl} alt="" className="h-12 w-12 rounded object-cover flex-shrink-0" />
                  )}
                  <span
                    className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded mt-0.5"
                    style={{ background: 'var(--wa-header)', color: 'white' }}
                  >
                    /{reply.shortcut}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--wa-bubble-out-text)' }}>{reply.title}</p>
                    {reply.text && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--wa-timestamp)' }}>{reply.text}</p>}
                    {reply.mediaUrl && !reply.text && <p className="text-xs mt-0.5" style={{ color: 'var(--wa-timestamp)' }}>📎 Image</p>}
                  </div>
                  <button
                    className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors mt-0.5"
                    onClick={() => deleteMutation.mutate(reply.id)}
                    title="Delete"
                  >
                    <IconClose size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {replies.length === 0 && (
            <div className="text-center py-8" style={{ color: 'var(--wa-timestamp)' }}>
              <p className="text-sm">No saved replies yet.</p>
              <p className="text-xs mt-1">Create one above, then type <strong>/</strong> in any chat to use it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
