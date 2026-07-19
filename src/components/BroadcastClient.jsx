'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Smiley } from '@phosphor-icons/react'
import { broadcastPushAction, loadBroadcastHistoryAction } from '@/actions/admin'

const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false })

const PT = 'America/Los_Angeles'

function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: PT,
  })
}

function timeAgo(iso) {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function getMessage(entry) {
  return entry.metadata?.body ?? entry.target_label?.replace(/^\[All\] /, '') ?? ''
}

export default function BroadcastClient({ initialHistory }) {
  const [history, setHistory] = useState(initialHistory)
  const [title, setTitle] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)
  const [isPending, startTransition] = useTransition()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [emojiData, setEmojiData] = useState(null)

  const titleRef = useRef(null)
  const bodyRef = useRef(null)
  // Tracks which field was focused last so emoji is inserted there
  const activeFieldRef = useRef('body')
  const pickerContainerRef = useRef(null)

  // Load emoji data lazily when picker is first opened
  useEffect(() => {
    if (pickerOpen && !emojiData) {
      import('@emoji-mart/data').then(m => setEmojiData(m.default))
    }
  }, [pickerOpen, emojiData])

  // Close picker when clicking outside
  useEffect(() => {
    if (!pickerOpen) return
    function handleClick(e) {
      if (!pickerContainerRef.current?.contains(e.target)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [pickerOpen])

  function insertEmoji(emoji) {
    const native = emoji.native
    const isTitle = activeFieldRef.current === 'title'
    const el = isTitle ? titleRef.current : bodyRef.current
    const setValue = isTitle ? setTitle : setDraft

    if (el) {
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      const newVal = el.value.slice(0, start) + native + el.value.slice(end)
      setValue(newVal)
      // Restore cursor after React re-render
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(start + native.length, start + native.length)
      })
    } else {
      setValue(prev => prev + native)
    }
    setPickerOpen(false)
  }

  function handleSend() {
    if (!draft.trim()) return
    startTransition(async () => {
      setError(null)
      const r = await broadcastPushAction({ title: title.trim() || undefined, body: draft.trim() })
      if (r.error) { setError(r.error); return }
      setTitle('')
      setDraft('')
      const result = await loadBroadcastHistoryAction()
      if (!result.error) setHistory(result.data)
    })
  }

  const titleLen = title.trim().length
  const bodyLen = draft.trim().length
  const canSend = bodyLen > 0 && bodyLen <= 200 && titleLen <= 50 && !isPending

  return (
    <div className="h-full flex flex-col bg-sunrise-50">
      <div className="bg-white border-b border-stone-100 px-6 py-4 shrink-0">
        <h1 className="text-base font-semibold text-stone-800">Broadcast to All</h1>
        <p className="text-xs text-stone-400 mt-0.5">Send a push notification to every subscribed user across all groups</p>
      </div>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* Compose */}
          <div>
            <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider">Title</label>
                  <span className={`text-xs ${titleLen > 50 ? 'text-red-500' : 'text-stone-400'}`}>{titleLen}/50</span>
                </div>
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onFocus={() => { activeFieldRef.current = 'title' }}
                  placeholder="e.g. What's New"
                  className="w-full text-sm text-stone-800 border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-jade transition-colors"
                />
                <p className="text-xs text-stone-400 mt-1">Optional — defaults to "Covey Space" if left blank</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider">Message</label>
                  <span className={`text-xs ${bodyLen > 200 ? 'text-red-500' : 'text-stone-400'}`}>{bodyLen}/200</span>
                </div>
                <textarea
                  ref={bodyRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onFocus={() => { activeFieldRef.current = 'body' }}
                  placeholder="e.g. Reminder: this week's meetup is at 7 PM — see you there!"
                  rows={4}
                  className="w-full text-sm text-stone-800 border border-stone-200 rounded-xl px-3 py-2.5 resize-none outline-none focus:border-jade transition-colors"
                />
              </div>
              <div className="flex items-center justify-between">
                {/* Emoji picker */}
                <div className="relative" ref={pickerContainerRef}>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-500 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors"
                  >
                    <Smiley size={16} />
                    Emoji
                  </button>
                  {pickerOpen && (
                    <div className="absolute bottom-full mb-2 left-0 z-50 shadow-xl rounded-2xl overflow-hidden">
                      {emojiData
                        ? <EmojiPicker data={emojiData} onEmojiSelect={insertEmoji} theme="light" previewPosition="none" skinTonePosition="none" />
                        : <div className="w-[352px] h-[400px] bg-white flex items-center justify-center text-sm text-stone-400">Loading…</div>
                      }
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className="px-4 py-2 text-sm font-semibold bg-jade text-white rounded-xl hover:opacity-90 transition-colors disabled:opacity-40"
                >
                  {isPending ? 'Sending…' : 'Send Push'}
                </button>
              </div>
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          {/* History */}
          <div>
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Recent Broadcasts</h3>
            {history.length === 0 ? (
              <div className="bg-white rounded-2xl border border-stone-100 py-10 text-center text-stone-400">
                <p className="text-sm">No broadcasts sent yet</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map(entry => (
                  <div key={entry.id} className="bg-white rounded-2xl border border-stone-200 px-5 py-4">
                    {entry.metadata?.title && (
                      <p className="text-xs font-semibold text-stone-500 mb-0.5">{entry.metadata.title}</p>
                    )}
                    <p className="text-sm text-stone-800 leading-snug">{getMessage(entry)}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-stone-400">{formatTime(entry.performed_at)}</span>
                      <span className="text-stone-200">·</span>
                      <span className="text-xs text-stone-400">{timeAgo(entry.performed_at)}</span>
                      {entry.metadata?.sent != null && (
                        <>
                          <span className="text-stone-200">·</span>
                          <span className="text-xs text-stone-500">
                            {entry.metadata.sent} delivered
                            {entry.metadata.stale > 0 && `, ${entry.metadata.stale} stale`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
