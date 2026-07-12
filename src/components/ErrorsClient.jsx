'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { loadClientErrorsAction, resolveErrorAction, resolveAllErrorsAction } from '@/actions/admin'

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
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  return `${mo}mo ago`
}

export default function ErrorsClient({ initialErrors, initialError }) {
  const [errors, setErrors] = useState(initialErrors)
  const [fetchError, setFetchError] = useState(initialError)
  const [showResolved, setShowResolved] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [isPending, startTransition] = useTransition()

  const now = Date.now()
  const last24h = new Date(now - 86400000).toISOString()

  const uniqueMessages = new Set(errors.map(e => e.error_message)).size
  const affectedUsers  = new Set(errors.map(e => e.user_id).filter(Boolean)).size
  const recentCount    = errors.filter(e => e.created_at >= last24h).length

  function handleResolve(id) {
    // When showing resolved, mark in place; otherwise remove from list
    if (showResolved) {
      setErrors(prev => prev.map(e => e.id === id ? { ...e, resolved_at: new Date().toISOString() } : e))
    } else {
      setErrors(prev => prev.filter(e => e.id !== id))
    }
    startTransition(async () => {
      const res = await resolveErrorAction(id)
      if (res.error) {
        setFetchError(res.error)
        const result = await loadClientErrorsAction({ includeResolved: showResolved })
        if (!result.error) setErrors(result.data)
      }
    })
  }

  function handleResolveAll() {
    startTransition(async () => {
      const res = await resolveAllErrorsAction()
      if (res.error) { setFetchError(res.error); return }
      const result = await loadClientErrorsAction({ includeResolved: showResolved })
      if (!result.error) setErrors(result.data)
    })
  }

  function handleToggleResolved() {
    const next = !showResolved
    setShowResolved(next)
    startTransition(async () => {
      const result = await loadClientErrorsAction({ includeResolved: next })
      if (result.error) { setFetchError(result.error); return }
      setErrors(result.data)
    })
  }

  return (
    <div className="min-h-screen bg-sunrise-50 flex flex-col">
      <header className="bg-stone-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Error Monitor</h1>
          <p className="text-xs text-stone-400 mt-0.5">
            {showResolved ? 'All errors (including resolved)' : `${errors.length} open error${errors.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-stone-300 hover:text-white transition-colors">
          ← Dashboard
        </Link>
      </header>

      {fetchError && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-sm text-red-700">{fetchError}</div>
      )}

      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Scorecards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Open Errors',    value: errors.filter(e => !e.resolved_at).length },
              { label: 'Unique Types',   value: uniqueMessages },
              { label: 'Affected Users', value: affectedUsers },
              { label: 'Last 24h',       value: recentCount },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-2xl border border-stone-100 px-5 py-4 shadow-sm">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">{label}</p>
                <p className="text-3xl font-bold text-stone-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={handleToggleResolved}
                className="rounded border-stone-300 text-stone-800 focus:ring-stone-400"
              />
              Show resolved
            </label>
            {errors.some(e => !e.resolved_at) && (
              <button
                onClick={handleResolveAll}
                disabled={isPending}
                className="text-xs font-medium text-stone-500 hover:text-stone-800 border border-stone-200 hover:border-stone-400 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
              >
                Resolve all
              </button>
            )}
          </div>

          {/* Error list */}
          {errors.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-100 py-16 text-center text-stone-400">
              <p className="text-2xl mb-2">✓</p>
              <p className="text-sm">{showResolved ? 'No errors recorded yet' : 'No open errors'}</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden divide-y divide-stone-50">
              {errors.map(err => {
                const isExpanded = expandedId === err.id
                const isResolved = !!err.resolved_at
                return (
                  <div key={err.id} className={`${isResolved ? 'opacity-50' : ''}`}>
                    <div
                      className="px-5 py-3.5 flex items-start gap-4 cursor-pointer hover:bg-stone-50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : err.id)}
                    >
                      {/* Expand indicator */}
                      <span className="text-stone-300 text-xs mt-0.5 shrink-0">{isExpanded ? '▼' : '▶'}</span>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-800 truncate">{err.error_message}</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {err.route && (
                            <span className="text-xs text-stone-400 font-mono">{err.route}</span>
                          )}
                          {err.component && (
                            <span className="text-xs text-stone-400">{err.component}</span>
                          )}
                          {err.display_name && (
                            <span className="text-xs text-stone-500">{err.display_name}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-stone-400 whitespace-nowrap">{timeAgo(err.created_at)}</span>
                        {!isResolved && (
                          <button
                            onClick={e => { e.stopPropagation(); handleResolve(err.id) }}
                            className="text-xs font-medium text-stone-400 hover:text-stone-700 border border-stone-200 hover:border-stone-400 rounded-lg px-2.5 py-1 transition-colors"
                          >
                            Resolve
                          </button>
                        )}
                        {isResolved && (
                          <span className="text-xs text-green-600 font-medium">Resolved</span>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-4 space-y-3 border-t border-stone-50 bg-stone-50/50">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                          <div>
                            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-0.5">Time</p>
                            <p className="text-xs text-stone-600">{formatTime(err.created_at)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-0.5">Route</p>
                            <p className="text-xs text-stone-600 font-mono">{err.route || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-0.5">Component</p>
                            <p className="text-xs text-stone-600">{err.component || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-0.5">User</p>
                            <p className="text-xs text-stone-600">{err.display_name || err.user_id?.slice(0, 8) || 'Anonymous'}</p>
                          </div>
                        </div>

                        {err.error_stack && (
                          <div>
                            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-1">Stack trace</p>
                            <pre className="text-xs text-stone-600 bg-stone-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono">{err.error_stack}</pre>
                          </div>
                        )}

                        {err.metadata && (
                          <div>
                            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-1">Metadata</p>
                            <pre className="text-xs text-stone-600 bg-stone-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono">{JSON.stringify(err.metadata, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
