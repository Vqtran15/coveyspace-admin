'use client'

import { useState, useTransition } from 'react'
import { broadcastPushAction, loadBroadcastHistoryAction } from '@/actions/admin'

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
  return entry.target_label?.replace(/^\[All\] /, '') ?? ''
}

export default function BroadcastClient({ initialHistory }) {
  const [history, setHistory] = useState(initialHistory)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)
  const [isPending, startTransition] = useTransition()

  function handleSend() {
    if (!draft.trim()) return
    startTransition(async () => {
      setError(null)
      const r = await broadcastPushAction({ body: draft.trim() })
      if (r.error) { setError(r.error); return }
      setDraft('')
      const result = await loadBroadcastHistoryAction()
      if (!result.error) setHistory(result.data)
    })
  }

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
            <div className="bg-white rounded-2xl border border-stone-200 p-5">
              <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Message</label>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="e.g. Reminder: this week's meetup is at 7 PM — see you there!"
                rows={4}
                className="w-full text-sm text-stone-800 border border-stone-200 rounded-xl px-3 py-2.5 resize-none outline-none focus:border-jade transition-colors"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-stone-400">{draft.trim().length}/200 characters</span>
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || draft.trim().length > 200 || isPending}
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
