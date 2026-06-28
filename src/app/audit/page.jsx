import { requireAuth } from '@/lib/session'
import { loadAuditLog } from '@/actions/admin'
import Link from 'next/link'

function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const ACTION_LABELS = {
  login:            'Logged in',
  logout:           'Logged out',
  login_locked:     'Account locked (too many attempts)',
  delete_group:     'Deleted group',
  delete_user:      'Deleted user',
  rename_group:     'Renamed group',
  edit_display_name:'Edited display name',
  toggle_role:      'Changed role',
  password_reset:   'Sent password reset',
}

const ACTION_COLORS = {
  delete_group:   'text-red-600',
  delete_user:    'text-red-600',
  login_locked:   'text-amber-600',
  toggle_role:    'text-jade',
  password_reset: 'text-lagoon-600',
}

export default async function AuditPage() {
  await requireAuth()
  const { data: entries = [], error } = await loadAuditLog()

  return (
    <div className="min-h-screen bg-sunrise-50 flex flex-col">
      <header className="bg-stone-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Audit Log</h1>
          <p className="text-xs text-stone-400 mt-0.5">Last {entries.length} admin actions</p>
        </div>
        <Link href="/dashboard" className="text-sm text-stone-300 hover:text-white transition-colors">
          ← Dashboard
        </Link>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-sm text-red-700">{error}</div>
      )}

      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto">
          {entries.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <p className="text-sm">No audit entries yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Action</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Target</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">IP</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {entries.map(entry => (
                    <tr key={entry.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-5 py-3">
                        <span className={`text-sm font-medium ${ACTION_COLORS[entry.action] || 'text-stone-700'}`}>
                          {ACTION_LABELS[entry.action] || entry.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-stone-500 text-sm">{entry.target_label || '—'}</td>
                      <td className="px-5 py-3 text-stone-400 font-mono text-xs">{entry.ip_address || '—'}</td>
                      <td className="px-5 py-3 text-stone-400 text-xs whitespace-nowrap">{formatTime(entry.performed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
