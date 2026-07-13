'use client'

import { useRef, useState, useMemo } from 'react'
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
  category?: string | null
}

interface Props {
  onClose: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeShortcut(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}

function stripExt(filename: string) {
  return filename.replace(/\.[^/.]+$/, '')
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SavedRepliesModal({ onClose }: Props) {
  const queryClient = useQueryClient()

  // Single reply form
  const singleFileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [shortcut, setShortcut] = useState('')
  const [text, setText] = useState('')
  const [category, setCategory] = useState('')
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Bulk upload state
  const bulkFileRef = useRef<HTMLInputElement>(null)
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  // Filter
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [tab, setTab] = useState<'list' | 'add' | 'bulk'>('list')

  const { data } = useQuery<{ savedReplies: SavedReply[] }>({
    queryKey: ['saved-replies'],
    queryFn: () => api.get('/saved-replies').then((r) => r.data),
  })
  const replies = data?.savedReplies ?? []

  // Derive categories from existing replies
  const categories = useMemo(() => {
    const cats = new Set(replies.map((r) => r.category).filter(Boolean) as string[])
    return Array.from(cats).sort()
  }, [replies])

  const filtered = useMemo(() =>
    activeCategory === 'all' ? replies : replies.filter((r) => r.category === activeCategory),
    [replies, activeCategory]
  )

  // ── Single file upload ────────────────────────────────────────────────────
  async function handleSingleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setMediaUrl(res.data.url)
      setMediaType(res.data.mimeType)
    } catch { toast.error('Upload failed') }
    finally { setUploading(false); e.target.value = '' }
  }

  // ── Bulk upload ───────────────────────────────────────────────────────────
  async function handleBulkFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    if (!bulkCategory.trim()) { toast.error('Set a category first'); return }

    setBulkProgress({ done: 0, total: files.length })
    let done = 0
    const cat = bulkCategory.trim()

    for (const file of files) {
      try {
        // 1. Upload file
        const form = new FormData()
        form.append('file', file)
        const uploadRes = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
        const { url, mimeType } = uploadRes.data

        // 2. Create saved reply
        const name = stripExt(file.name)
        const base = sanitizeShortcut(cat)
        const sc = `${base}-${done + 1}`
        await api.post('/saved-replies', {
          title: name,
          shortcut: sc,
          text: '',
          mediaUrl: url,
          mediaType: mimeType,
          category: cat,
        })
      } catch {
        // Skip duplicates / errors silently — show count at end
      }
      done++
      setBulkProgress({ done, total: files.length })
    }

    queryClient.invalidateQueries({ queryKey: ['saved-replies'] })
    setBulkProgress(null)
    setBulkCategory('')
    toast.success(`${done} files added to "${cat}"`)
    setTab('list')
    setActiveCategory(bulkCategory.trim())
    e.target.value = ''
  }

  // ── Create single ─────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => api.post('/saved-replies', {
      title, shortcut, text,
      mediaUrl: mediaUrl ?? undefined,
      mediaType: mediaType ?? undefined,
      category: category.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-replies'] })
      setTitle(''); setShortcut(''); setText(''); setMediaUrl(null); setMediaType(null)
      toast.success('Saved reply created')
      setTab('list')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/saved-replies/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['saved-replies'] }); toast.success('Deleted') },
  })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !shortcut.trim() || (!text.trim() && !mediaUrl)) return
    createMutation.mutate()
  }

  // ── Media grid ─────────────────────────────────────────────────────────────
  const mediaReplies = filtered.filter((r) => r.mediaUrl)
  const textReplies = filtered.filter((r) => !r.mediaUrl)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div
        className="w-full max-w-2xl rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--wa-panel-bg)', maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ background: 'var(--wa-header)' }}>
          <h2 className="text-white font-semibold text-[15px]">Saved Replies</h2>
          <button className="icon-btn icon-btn-white" onClick={onClose}><IconClose size={20} /></button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b flex-shrink-0" style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)' }}>
          {(['list', 'add', 'bulk'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 text-sm font-medium transition-colors"
              style={{
                color: tab === t ? 'var(--wa-header)' : 'var(--wa-timestamp)',
                borderBottom: tab === t ? '2px solid var(--wa-header)' : '2px solid transparent',
              }}
            >
              {t === 'list' ? `Library (${replies.length})` : t === 'add' ? '+ Add One' : '⬆ Bulk Upload'}
            </button>
          ))}
        </div>

        {/* ── LIST TAB ─────────────────────────────────────────────────────── */}
        {tab === 'list' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Category filter pills */}
            {categories.length > 0 && (
              <div className="flex gap-2 px-4 py-2.5 overflow-x-auto flex-shrink-0 no-scrollbar" style={{ background: 'var(--wa-search-bg)' }}>
                {['all', ...categories].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className="flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all"
                    style={
                      activeCategory === cat
                        ? { background: 'var(--wa-header)', color: '#fff' }
                        : { background: 'var(--wa-panel-bg)', color: 'var(--wa-timestamp)', border: '1px solid var(--wa-divider)' }
                    }
                  >
                    {cat === 'all' ? `All (${replies.length})` : `${cat} (${replies.filter((r) => r.category === cat).length})`}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: 'var(--wa-timestamp)' }}>
                  <p className="text-sm">No saved replies yet.</p>
                  <p className="text-xs">Use "Add One" or "Bulk Upload" to get started.</p>
                </div>
              )}

              {/* Media grid */}
              {mediaReplies.length > 0 && (
                <div className="mb-4">
                  {textReplies.length > 0 && (
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--wa-timestamp)' }}>Media</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {mediaReplies.map((reply) => (
                      <div key={reply.id} className="group relative rounded-lg overflow-hidden border" style={{ borderColor: 'var(--wa-divider)', aspectRatio: '1' }}>
                        {reply.mediaType?.startsWith('image/') ? (
                          <img src={reply.mediaUrl!} alt={reply.title} className="w-full h-full object-cover" />
                        ) : reply.mediaType?.startsWith('video/') ? (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--wa-search-bg)' }}>
                            <span className="text-2xl">🎬</span>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--wa-search-bg)' }}>
                            <span className="text-2xl">📄</span>
                          </div>
                        )}
                        {/* Overlay on hover */}
                        <div className="absolute inset-0 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}>
                          <div className="p-1.5 flex items-end justify-between">
                            <p className="text-white text-[10px] truncate flex-1">{reply.title}</p>
                            <button
                              className="text-white/70 hover:text-red-400 ml-1 flex-shrink-0"
                              onClick={() => deleteMutation.mutate(reply.id)}
                            >
                              <IconClose size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="absolute top-1 left-1">
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.5)', color: 'white' }}>
                            /{reply.shortcut}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Text replies list */}
              {textReplies.length > 0 && (
                <div className="space-y-2">
                  {mediaReplies.length > 0 && (
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--wa-timestamp)' }}>Text Replies</p>
                  )}
                  {textReplies.map((reply) => (
                    <div key={reply.id} className="flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)' }}>
                      <span className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded mt-0.5" style={{ background: 'var(--wa-header)', color: 'white' }}>
                        /{reply.shortcut}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--wa-bubble-out-text)' }}>{reply.title}</p>
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--wa-timestamp)' }}>{reply.text}</p>
                      </div>
                      <button className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors mt-0.5" onClick={() => deleteMutation.mutate(reply.id)}>
                        <IconClose size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ADD ONE TAB ──────────────────────────────────────────────────── */}
        {tab === 'add' && (
          <div className="flex-1 overflow-y-auto p-5">
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="flex gap-2">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Product A)"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-400"
                  style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)', color: 'var(--wa-bubble-out-text)' }} />
                <div className="w-36 flex items-center rounded-lg border focus-within:border-blue-400" style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)' }}>
                  <span className="pl-3 text-sm" style={{ color: 'var(--wa-timestamp)' }}>/</span>
                  <input value={shortcut} onChange={(e) => setShortcut(sanitizeShortcut(e.target.value))} placeholder="shortcut"
                    className="flex-1 px-1 py-2 text-sm outline-none bg-transparent" style={{ color: 'var(--wa-bubble-out-text)' }} />
                </div>
              </div>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (e.g. Products, Videos) — optional"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-400"
                style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)', color: 'var(--wa-bubble-out-text)' }}
                list="existing-categories"
              />
              <datalist id="existing-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply text… (optional if image attached)"
                rows={2} className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none focus:border-blue-400"
                style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)', color: 'var(--wa-bubble-out-text)' }} />

              {mediaUrl ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)' }}>
                  {mediaType?.startsWith('image/') && <img src={mediaUrl} alt="" className="h-12 w-12 rounded object-cover flex-shrink-0" />}
                  <span className="flex-1 text-xs truncate" style={{ color: 'var(--wa-bubble-out-text)' }}>Media attached</span>
                  <button type="button" onClick={() => { setMediaUrl(null); setMediaType(null) }} className="text-gray-400 hover:text-red-400"><IconClose size={14} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => singleFileRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border hover:opacity-80 transition-opacity"
                  style={{ borderColor: 'var(--wa-divider)', color: 'var(--wa-timestamp)' }}>
                  <IconAttach size={14} /> {uploading ? 'Uploading…' : 'Attach image/video (optional)'}
                </button>
              )}
              <input ref={singleFileRef} type="file" accept="image/*,video/mp4" className="hidden" onChange={handleSingleFile} />

              <button type="submit"
                disabled={!title.trim() || !shortcut.trim() || (!text.trim() && !mediaUrl) || createMutation.isPending}
                className="w-full py-2 rounded-lg text-white text-sm font-medium transition-opacity disabled:opacity-50"
                style={{ background: 'var(--wa-header)' }}>
                {createMutation.isPending ? 'Saving…' : 'Save Reply'}
              </button>
            </form>
          </div>
        )}

        {/* ── BULK UPLOAD TAB ───────────────────────────────────────────────── */}
        {tab === 'bulk' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="rounded-lg border-2 border-dashed p-6 text-center space-y-3" style={{ borderColor: 'var(--wa-divider)' }}>
              <p className="text-3xl">📁</p>
              <p className="text-sm font-medium" style={{ color: 'var(--wa-bubble-out-text)' }}>Bulk upload photos & videos</p>
              <p className="text-xs" style={{ color: 'var(--wa-timestamp)' }}>Each file becomes its own saved reply entry. Select as many as you want.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--wa-timestamp)' }}>
                Category (required) *
              </label>
              <input
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                placeholder="e.g. Products, Portfolio, Videos"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-400"
                style={{ borderColor: 'var(--wa-divider)', background: 'var(--wa-search-bg)', color: 'var(--wa-bubble-out-text)' }}
                list="existing-categories-bulk"
              />
              <datalist id="existing-categories-bulk">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            {/* Progress bar */}
            {bulkProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs" style={{ color: 'var(--wa-timestamp)' }}>
                  <span>Uploading…</span>
                  <span>{bulkProgress.done} / {bulkProgress.total}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--wa-divider)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ background: 'var(--wa-header)', width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={() => {
                if (!bulkCategory.trim()) { toast.error('Enter a category first'); return }
                bulkFileRef.current?.click()
              }}
              disabled={!!bulkProgress}
              className="w-full py-3 rounded-lg text-white text-sm font-medium transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'var(--wa-header)' }}
            >
              <IconAttach size={16} />
              {bulkProgress ? `Uploading ${bulkProgress.done}/${bulkProgress.total}…` : 'Select Files'}
            </button>
            <input
              ref={bulkFileRef}
              type="file"
              accept="image/*,video/mp4"
              multiple
              className="hidden"
              onChange={handleBulkFiles}
            />

            <p className="text-xs text-center" style={{ color: 'var(--wa-timestamp)' }}>
              Files are named automatically from their filename. Shortcuts are generated as <strong>{bulkCategory ? sanitizeShortcut(bulkCategory) : 'category'}-1</strong>, <strong>-2</strong>, etc.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
