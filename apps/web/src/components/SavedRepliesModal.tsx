'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { IconClose } from '@/components/icons'

interface SavedReply {
  id: string
  title: string
  shortcut: string
  text: string
}

interface Props {
  onClose: () => void
}

export function SavedRepliesModal({ onClose }: Props) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [shortcut, setShortcut] = useState('')
  const [text, setText] = useState('')

  const { data } = useQuery<{ savedReplies: SavedReply[] }>({
    queryKey: ['saved-replies'],
    queryFn: () => api.get('/saved-replies').then((r) => r.data),
  })
  const replies = data?.savedReplies ?? []

  const createMutation = useMutation({
    mutationFn: () => api.post('/saved-replies', { title, shortcut, text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-replies'] })
      setTitle(''); setShortcut(''); setText('')
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
    if (!title.trim() || !shortcut.trim() || !text.trim()) return
    createMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0 rounded-t-xl"
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Saved Reply</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title (e.g. Greeting)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="w-32">
                <div className="flex items-center rounded-lg border border-gray-200 focus-within:border-blue-400">
                  <span className="pl-3 text-gray-400 text-sm">/</span>
                  <input
                    value={shortcut}
                    onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="shortcut"
                    className="flex-1 rounded-lg px-1 py-2 text-sm outline-none"
                  />
                </div>
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Reply text…"
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none"
            />
            <button
              type="submit"
              disabled={!title.trim() || !shortcut.trim() || !text.trim() || createMutation.isPending}
              className="w-full py-2 rounded-lg text-white text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--wa-header)' }}
            >
              {createMutation.isPending ? 'Saving…' : 'Save Reply'}
            </button>
          </form>

          {/* List */}
          {replies.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Replies ({replies.length})</p>
              {replies.map((reply) => (
                <div key={reply.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
                  <span
                    className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded mt-0.5"
                    style={{ background: 'var(--wa-header)', color: 'white' }}
                  >
                    /{reply.shortcut}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{reply.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{reply.text}</p>
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
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">No saved replies yet.</p>
              <p className="text-xs mt-1">Create one above, then type <strong>/</strong> in any chat to use it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
