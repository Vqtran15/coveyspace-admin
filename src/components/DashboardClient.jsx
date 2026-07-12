'use client'

import { useState, useEffect, useTransition, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { UsersThree, Megaphone } from '@phosphor-icons/react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import Link from 'next/link'
import {
  loadMembers,
  loadGroupDetails,
  loadOrphanedUsers,
  deleteGroupAction,
  deleteUserAction,
  renameGroupAction,
  editDisplayNameAction,
  toggleRoleAction,
  resetPasswordAction,
  searchUsersGlobalAction,
  deleteAllEmptyGroupsAction,
  deleteAllOrphanedUsersAction,
  broadcastPushAction,
  loadAnnouncementsAction,
  publishAnnouncementAction,
  deactivateAnnouncementAction,
  loadMetricsAction,
  loadGroupMessagesAction,
  loadGroupActivityAction,
} from '@/actions/admin'
import AdminNav from '@/components/AdminNav'
import { loadGA4MetricsAction } from '@/actions/analytics'

const PT = 'America/Los_Angeles'

function DailyUsersChart({ data, id, color }) {
  if (!data?.length) return null
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
      <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-4">Daily Active Users</h4>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={`dau-grad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#a8a29e' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={d => { const [, m, day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}` }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 10, fill: '#a8a29e' }} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ fontSize: '12px', borderRadius: '12px', border: '1px solid #e7e5e4', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
            labelFormatter={d => { const [y, m, day] = d.split('-'); return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
            formatter={v => [v.toLocaleString(), 'Users']}
          />
          <Area type="monotone" dataKey="count" stroke={color} strokeWidth={2} fill={`url(#dau-grad-${id})`} dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: PT,
  })
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: PT })
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

function Badge({ role }) {
  if (role === 'admin') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-jade/10 text-jade border border-jade/20">
      Admin
    </span>
  )
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-500">
      Member
    </span>
  )
}

function useAnimatedMount(open, duration) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false) }
    else if (mounted) {
      setClosing(true)
      const t = setTimeout(() => { setMounted(false); setClosing(false) }, duration)
      return () => clearTimeout(t)
    }
  }, [open])
  return { mounted, closing }
}

function ConfirmModal({ closing, message, onConfirm, onCancel, danger = false }) {
  return (
    <div className={`fixed inset-0 z-40 flex items-center justify-center bg-black/40 ${closing ? 'anim-overlay-out' : 'anim-overlay-in'}`}>
      <div className={`bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 ${closing ? 'anim-card-out' : 'anim-card-in'}`}>
        <p className="text-sm text-stone-700 mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-xl text-white transition-colors ${
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-jade hover:opacity-90'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

function BroadcastModal({ closing, target, groupName, selectedCount, onSend, onClose, isPending }) {
  const [body, setBody] = useState('')
  return (
    <div className={`fixed inset-0 z-40 flex items-center justify-center bg-black/40 ${closing ? 'anim-overlay-out' : 'anim-overlay-in'}`}>
      <div className={`bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 ${closing ? 'anim-card-out' : 'anim-card-in'}`}>
        <h3 className="text-sm font-semibold text-stone-800 mb-1">
          {target === 'all'
            ? 'Broadcast to All Groups'
            : target === 'selected'
            ? `Broadcast to ${selectedCount} selected member${selectedCount !== 1 ? 's' : ''}`
            : `Broadcast to "${groupName}"`}
        </h3>
        <p className="text-xs text-stone-400 mb-4">
          {target === 'all'
            ? 'Sends a push notification to every subscribed user across all groups.'
            : target === 'selected'
            ? 'Sends a push notification to the selected members only.'
            : 'Sends a push notification to all subscribed members of this group.'}
        </p>
        <textarea
          autoFocus
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Message…"
          rows={4}
          className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade/50 resize-none"
        />
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSend({ body })}
            disabled={!body.trim() || isPending}
            className="px-4 py-2 text-sm font-medium rounded-xl text-white bg-jade hover:opacity-90 transition-colors disabled:opacity-40"
          >
            {isPending ? 'Sending…' : 'Send Push'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FeatureFlags({ settings }) {
  if (!settings) return null
  const flags = [
    ['Meals', settings.meals_enabled],
    ['Services', settings.services_enabled],
    ['Chat', settings.chat_enabled],
    ['Prayer', settings.prayer_enabled],
    ['Birthdays', settings.birthdays_enabled],
    ['Guide', settings.guide_enabled],
  ]
  return (
    <div className="flex gap-1.5 flex-wrap">
      {flags.map(([label, enabled]) => (
        <span
          key={label}
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            enabled ? 'bg-jade/10 text-jade' : 'bg-stone-100 text-stone-400 line-through'
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  )
}

function ActivityList({ items, empty, renderRow }) {
  if (!items || items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-stone-100 py-12 text-center text-stone-400">
        <p className="text-sm">{empty}</p>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden divide-y divide-stone-50">
      {items.map((item, i) => {
        const { title, subtitle, body, date } = renderRow(item)
        return (
          <div key={item.id ?? i} className="px-5 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-stone-800 truncate">{title}</p>
                {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
                {body && <p className="text-sm text-stone-600 mt-1 leading-snug">{body}</p>}
              </div>
              <span className="text-xs text-stone-400 whitespace-nowrap shrink-0 mt-0.5">{
                date
                  ? new Date(date.length === 10 ? date + 'T12:00:00' : date)
                      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—'
              }</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function exportCSV(groupName, members) {
  const headers = ['Name', 'Email', 'Role', 'Last Activity', 'Last Logged In', 'Joined']
  const rows = members.map(m => [
    m.display_name ?? '',
    m.email ?? '',
    m.role ?? '',
    m.last_active_at ? new Date(m.last_active_at).toLocaleString() : '',
    m.last_sign_in_at ? new Date(m.last_sign_in_at).toLocaleString() : '',
    m.created_at ? new Date(m.created_at).toLocaleString() : '',
  ])
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${groupName.replace(/[^a-z0-9]/gi, '_')}_members.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function DashboardClient({ initialGroups }) {
  const searchParams = useSearchParams()
  const [groups, setGroups] = useState(initialGroups)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [groupDetails, setGroupDetails] = useState(null)

  const [orphanedUsers, setOrphanedUsers] = useState(null)
  const [loadingOrphans, setLoadingOrphans] = useState(false)
  const [showOrphans, setShowOrphans] = useState(false)

  const [metrics, setMetrics]           = useState(null)
  const [loadingMetrics, setLoadingMetrics] = useState(false)
  const [showMetrics, setShowMetrics]   = useState(true)
  const [groupSort, setGroupSort]       = useState({ col: 'lastActivity', dir: 'desc' })
  const [overviewTab, setOverviewTab]   = useState('overview')
  const [analyticsHost, setAnalyticsHost] = useState('app')
  const [dateRange, setDateRange]       = useState({ type: '30d' })
  const [customStart, setCustomStart]   = useState('')
  const [customEnd, setCustomEnd]       = useState('')
  const [ga4, setGa4]                   = useState(null)
  const [loadingGa4, setLoadingGa4]     = useState(false)

  const [groupDetailTab, setGroupDetailTab] = useState('members')
  const [groupMessages, setGroupMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messagesOffset, setMessagesOffset] = useState(0)
  const [messagesHasMore, setMessagesHasMore] = useState(false)
  const [groupActivity, setGroupActivity] = useState(null)
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [activityTab, setActivityTab] = useState('meals')

  const [showBanner, setShowBanner] = useState(false)
  const [announcements, setAnnouncements] = useState(null)
  const [bannerDraft, setBannerDraft] = useState('')
  const [bannerSending, setBannerSending] = useState(false)

  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [globalQuery, setGlobalQuery] = useState('')
  const [globalResults, setGlobalResults] = useState(null)
  const [loadingGlobal, setLoadingGlobal] = useState(false)

  const [broadcastTarget, setBroadcastTarget] = useState(null) // null | 'all' | 'selected' | groupId string
  const [broadcastGroupName, setBroadcastGroupName] = useState('')
  const [showGroups, setShowGroups] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState(new Set())
  const [showGroupMenu, setShowGroupMenu] = useState(false)
  const [editingGroupHeader, setEditingGroupHeader] = useState(false)
  const [groupNameDraft, setGroupNameDraft] = useState('')

  const [search, setSearch] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [toast, setToast] = useState(null)
  const [isPending, startTransition] = useTransition()

  const [editingName, setEditingName] = useState(null)
  const [renaming, setRenaming] = useState(false)

  const globalInputRef = useRef(null)

  const confirmAnim     = useAnimatedMount(!!confirm, 150)
  const broadcastAnim   = useAnimatedMount(!!broadcastTarget, 150)
  const groupMenuAnim   = useAnimatedMount(showGroupMenu, 110)

  function getQueryDates(range = dateRange) {
    if (range.type === '7d')  return { ga4Start: '7daysAgo',  ga4End: 'today', supaStart: new Date(Date.now() - 7  * 86400000).toISOString(), supaEnd: new Date().toISOString(), label: 'last 7 days' }
    if (range.type === '30d') return { ga4Start: '30daysAgo', ga4End: 'today', supaStart: new Date(Date.now() - 30 * 86400000).toISOString(), supaEnd: new Date().toISOString(), label: 'last 30 days' }
    return { ga4Start: range.start, ga4End: range.end, supaStart: new Date(range.start).toISOString(), supaEnd: new Date(range.end + 'T23:59:59').toISOString(), label: `${range.start} – ${range.end}` }
  }

  async function loadAllMetrics(range) {
    const { ga4Start, ga4End, supaStart, supaEnd } = getQueryDates(range)
    setLoadingMetrics(true)
    setLoadingGa4(true)
    const [{ data: mData, error: mErr }, { data: gData, error: gErr }] = await Promise.all([
      loadMetricsAction({ periodStart: supaStart, periodEnd: supaEnd }),
      loadGA4MetricsAction({ ga4Start, ga4End }),
    ])
    if (mErr) showToast(mErr, 'error'); else if (mData) setMetrics(mData)
    if (gErr) showToast('Analytics: ' + gErr, 'error'); else if (gData) setGa4(gData)
    setLoadingMetrics(false)
    setLoadingGa4(false)
  }

  const sortedGroupStats = useMemo(() => {
    if (!metrics?.groupStats) return []
    return [...metrics.groupStats].sort((a, b) => {
      const { col, dir } = groupSort
      const av = a[col], bv = b[col]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return dir === 'desc' ? -cmp : cmp
    })
  }, [metrics, groupSort])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function ask(message, onConfirm, danger = false) {
    setConfirm({ message, onConfirm, danger })
  }

  async function selectGroup(group) {
    setShowOrphans(false)
    setShowGlobalSearch(false)
    setShowBanner(false)
    setShowMetrics(false)
    setShowGroups(true)
    setSelectedGroup(group)
    setSearch('')
    setGroupDetails(null)
    setLoadingMembers(true)
    setSelectedMemberIds(new Set())
    setShowGroupMenu(false)
    setEditingGroupHeader(false)
    setGroupDetailTab('members')
    setGroupMessages([])
    setMessagesOffset(0)
    setMessagesHasMore(false)
    setGroupActivity(null)
    setActivityTab('meals')
    const [membersResult, detailsResult] = await Promise.all([
      loadMembers(group.id),
      loadGroupDetails(group.id),
    ])
    setMembers(membersResult.data || [])
    setGroupDetails(detailsResult.data || null)
    setLoadingMembers(false)
  }

  async function handleLoadMessages(groupId, offset = 0) {
    setLoadingMessages(true)
    const LIMIT = 50
    const { data, error } = await loadGroupMessagesAction(groupId, { limit: LIMIT + 1, offset })
    if (error) { showToast('Messages: ' + error, 'error'); setLoadingMessages(false); return }
    const hasMore = data.length > LIMIT
    const rows = hasMore ? data.slice(0, LIMIT) : data
    if (offset === 0) setGroupMessages(rows)
    else setGroupMessages(prev => [...prev, ...rows])
    setMessagesOffset(offset + rows.length)
    setMessagesHasMore(hasMore)
    setLoadingMessages(false)
  }

  async function handleLoadActivity(groupId) {
    setLoadingActivity(true)
    const { data, error } = await loadGroupActivityAction(groupId)
    if (error) showToast('Activity: ' + error, 'error')
    else setGroupActivity(data)
    setLoadingActivity(false)
  }

  async function handleSelectHome() {
    setSelectedGroup(null)
    setMembers([])
    setSearch('')
    setShowGlobalSearch(false)
    setShowOrphans(false)
    setShowBanner(false)
    setShowGroups(false)
    setShowMetrics(true)
    await loadAllMetrics(dateRange)
  }

  function handleSelectGroups() {
    setShowGlobalSearch(false)
    setShowOrphans(false)
    setShowBanner(false)
    setShowMetrics(false)
    setShowGroups(true)
  }

  async function handleSelectOrphans() {
    setSelectedGroup(null)
    setMembers([])
    setSearch('')
    setShowGlobalSearch(false)
    setShowBanner(false)
    setShowMetrics(false)
    setShowGroups(false)
    setShowOrphans(true)
    if (orphanedUsers !== null) return
    setLoadingOrphans(true)
    const { data, error } = await loadOrphanedUsers()
    if (error) showToast(error, 'error')
    else setOrphanedUsers(data || [])
    setLoadingOrphans(false)
  }

  async function handleSelectBanner() {
    setSelectedGroup(null)
    setMembers([])
    setSearch('')
    setShowGlobalSearch(false)
    setShowOrphans(false)
    setShowMetrics(false)
    setShowGroups(false)
    setShowBanner(true)
    if (announcements !== null) return
    const { data, error } = await loadAnnouncementsAction()
    if (error) showToast(error, 'error')
    else setAnnouncements(data)
  }

  async function handlePublishBanner() {
    if (!bannerDraft.trim()) return
    setBannerSending(true)
    const { error } = await publishAnnouncementAction(bannerDraft)
    setBannerSending(false)
    if (error) { showToast(error, 'error'); return }
    setBannerDraft('')
    const { data } = await loadAnnouncementsAction()
    setAnnouncements(data)
    showToast('Banner published')
  }

  async function handleDeactivateBanner(id) {
    const { error } = await deactivateAnnouncementAction(id)
    if (error) { showToast(error, 'error'); return }
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, active: false } : a))
    showToast('Banner deactivated')
  }

  function handleSelectGlobalSearch() {
    setSelectedGroup(null)
    setMembers([])
    setSearch('')
    setShowOrphans(false)
    setShowBanner(false)
    setShowMetrics(false)
    setShowGroups(false)
    setShowGlobalSearch(true)
    setGlobalResults(null)
    setGlobalQuery('')
    setTimeout(() => globalInputRef.current?.focus(), 50)
  }

  async function handleGlobalSearch() {
    if (!globalQuery.trim()) return
    setLoadingGlobal(true)
    const { data, error } = await searchUsersGlobalAction(globalQuery)
    if (error) showToast(error, 'error')
    else setGlobalResults(data || [])
    setLoadingGlobal(false)
  }

  async function handleDeleteOrphan(user) {
    ask(
      `Delete orphaned account "${user.email}"? This cannot be undone.`,
      async () => {
        setConfirm(null)
        startTransition(async () => {
          const r = await deleteUserAction(user.id, user.email)
          if (r.error) { showToast(r.error, 'error'); return }
          setOrphanedUsers(os => os.filter(o => o.id !== user.id))
          showToast(`Deleted ${user.email}`)
        })
      },
      true
    )
  }

  async function handleDeleteAllOrphans() {
    if (!orphanedUsers?.length) return
    ask(
      `Delete all ${orphanedUsers.length} orphaned accounts? This cannot be undone.`,
      async () => {
        setConfirm(null)
        startTransition(async () => {
          const ids = orphanedUsers.map(o => o.id)
          const r = await deleteAllOrphanedUsersAction(ids)
          if (r.failedCount > 0) {
            showToast(`${r.count} deleted, ${r.failedCount} failed: ${r.failedReason}`, 'error')
          } else {
            showToast(`Deleted ${r.count} orphaned account${r.count !== 1 ? 's' : ''}`)
          }
          // Refetch to confirm actual state
          setLoadingOrphans(true)
          const { data, error } = await loadOrphanedUsers()
          if (error) showToast(error, 'error')
          else setOrphanedUsers(data || [])
          setLoadingOrphans(false)
        })
      },
      true
    )
  }

  async function handleDeleteAllEmpty() {
    ask(
      `Delete all ${emptyGroups} empty group${emptyGroups !== 1 ? 's' : ''}? This cannot be undone.`,
      async () => {
        setConfirm(null)
        startTransition(async () => {
          const r = await deleteAllEmptyGroupsAction()
          if (r.error) { showToast(r.error, 'error'); return }
          setGroups(gs => gs.filter(g => (g.member_count || 0) > 0))
          if (selectedGroup && (selectedGroup.member_count || 0) === 0) {
            setSelectedGroup(null); setMembers([])
          }
          showToast(`Deleted ${r.count} empty group${r.count !== 1 ? 's' : ''}`)
        })
      },
      true
    )
  }

  async function handleBroadcast({ body }) {
    const isAll = broadcastTarget === 'all'
    const isSelected = broadcastTarget === 'selected'
    const groupId = (!isAll && !isSelected) ? broadcastTarget : null
    const userIds = isSelected ? [...selectedMemberIds] : null
    startTransition(async () => {
      const r = await broadcastPushAction({ groupId, userIds, body })
      setBroadcastTarget(null)
      if (isSelected) setSelectedMemberIds(new Set())
      if (r.error) { showToast(r.error, 'error'); return }
      showToast(`Sent to ${r.sent} member${r.sent !== 1 ? 's' : ''}`)
    })
  }

  function toggleSelectMember(id) {
    setSelectedMemberIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submitGroupRename() {
    const newName = groupNameDraft.trim()
    if (!newName || newName === selectedGroup.name) { setEditingGroupHeader(false); return }
    setRenaming(true)
    const r = await renameGroupAction(selectedGroup.id, selectedGroup.name, newName)
    if (r.error) { showToast(r.error, 'error') }
    else {
      setGroups(gs => gs.map(g => g.id === selectedGroup.id ? { ...g, name: newName } : g))
      setSelectedGroup(s => ({ ...s, name: newName }))
      showToast(`Renamed to "${newName}"`)
    }
    setEditingGroupHeader(false)
    setRenaming(false)
  }

  useEffect(() => {
    const view = searchParams.get('view')
    if (view === 'groups') handleSelectGroups()
    else if (view === 'orphans') handleSelectOrphans()
    else if (view === 'banner') handleSelectBanner()
    else handleSelectHome()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stats
  const totalMembers = groups.reduce((s, g) => s + (g.member_count || 0), 0)
  const emptyGroups = groups.filter(g => (g.member_count || 0) === 0).length
  const adminCount = members.filter(m => m.role === 'admin').length
  const viewKey = showGlobalSearch ? 'search' : showGroups ? 'groups' : showOrphans ? 'orphans' : showBanner ? 'banner' : 'overview'

  const groupLastActive = useMemo(() => {
    return members.reduce((latest, m) => {
      const t = m.last_active_at || m.last_sign_in_at
      if (!t) return latest
      return !latest || new Date(t) > new Date(latest) ? t : latest
    }, null)
  }, [members])

  const filteredGroups = useMemo(() => {
    if (!search) return groups
    const q = search.toLowerCase()
    return groups.filter(g => g.name?.toLowerCase().includes(q))
  }, [groups, search])

  const displayedMembers = useMemo(() => {
    if (!search) return members
    const q = search.toLowerCase()
    return members.filter(m =>
      m.display_name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q)
    )
  }, [members, search])

  // --- Group actions ---
  async function handleDeleteGroup(group) {
    ask(
      `Delete group "${group.name}" and all its members? This cannot be undone.`,
      async () => {
        setConfirm(null)
        startTransition(async () => {
          const r = await deleteGroupAction(group.id, group.name)
          if (r.error) { showToast(r.error, 'error'); return }
          setGroups(gs => gs.filter(g => g.id !== group.id))
          if (selectedGroup?.id === group.id) { setSelectedGroup(null); setMembers([]) }
          if (r.warning) { showToast(r.warning, 'error') }
          else { showToast(`Deleted group "${group.name}"`) }
        })
      },
      true
    )
  }

  async function handleDeleteUser(member) {
    ask(
      `Delete user "${member.display_name || member.email}"? This cannot be undone.`,
      async () => {
        setConfirm(null)
        startTransition(async () => {
          const r = await deleteUserAction(member.id, member.display_name || member.email)
          if (r.error) { showToast(r.error, 'error'); return }
          setMembers(ms => ms.filter(m => m.id !== member.id))
          setGroups(gs => gs.map(g =>
            g.id === selectedGroup.id ? { ...g, member_count: (g.member_count || 1) - 1 } : g
          ))
          showToast(`Deleted user "${member.display_name || member.email}"`)
        })
      },
      true
    )
  }

  async function handleToggleRole(member) {
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    ask(
      `Change "${member.display_name || member.email}" to ${newRole}?`,
      async () => {
        setConfirm(null)
        startTransition(async () => {
          const r = await toggleRoleAction(member.id, member.display_name || member.email, newRole)
          if (r.error) { showToast(r.error, 'error'); return }
          setMembers(ms => ms.map(m => m.id === member.id ? { ...m, role: newRole } : m))
          showToast(`Updated role to ${newRole}`)
        })
      }
    )
  }

  async function handlePasswordReset(member) {
    ask(
      `Send password reset email to "${member.email}"?`,
      async () => {
        setConfirm(null)
        startTransition(async () => {
          const r = await resetPasswordAction(member.email, member.display_name || member.email)
          if (r.error) { showToast(r.error, 'error'); return }
          showToast(`Reset email sent to ${member.email}`)
        })
      }
    )
  }

  function startRename(id, currentName, type) {
    setEditingName({ id, value: currentName, type })
  }

  async function submitRename() {
    if (!editingName) return
    const { id, value, type } = editingName
    if (!value.trim()) return
    setRenaming(true)
    if (type === 'group') {
      const oldName = selectedGroup?.name || groups.find(g => g.id === id)?.name
      const r = await renameGroupAction(id, oldName, value.trim())
      if (r.error) { showToast(r.error, 'error') }
      else {
        setGroups(gs => gs.map(g => g.id === id ? { ...g, name: value.trim() } : g))
        if (selectedGroup?.id === id) setSelectedGroup(s => ({ ...s, name: value.trim() }))
        showToast(`Renamed to "${value.trim()}"`)
      }
    } else {
      const oldName = members.find(m => m.id === id)?.display_name
      const r = await editDisplayNameAction(id, value.trim(), oldName)
      if (r.error) { showToast(r.error, 'error') }
      else {
        setMembers(ms => ms.map(m => m.id === id ? { ...m, display_name: value.trim() } : m))
        showToast(`Updated name to "${value.trim()}"`)
      }
    }
    setEditingName(null)
    setRenaming(false)
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-jade'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Confirm modal */}
      {confirmAnim.mounted && (
        <ConfirmModal
          closing={confirmAnim.closing}
          message={confirm?.message}
          danger={confirm?.danger}
          onConfirm={confirm?.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Broadcast modal */}
      {broadcastAnim.mounted && (
        <BroadcastModal
          closing={broadcastAnim.closing}
          target={broadcastTarget}
          groupName={broadcastGroupName}
          selectedCount={selectedMemberIds.size}
          onSend={handleBroadcast}
          onClose={() => setBroadcastTarget(null)}
          isPending={isPending}
        />
      )}

      <AdminNav
        onHome={handleSelectHome}
        onGroups={handleSelectGroups}
        onOrphans={handleSelectOrphans}
        onBanner={handleSelectBanner}
        orphanCount={orphanedUsers?.length ?? 0}
        activeView={showGroups ? 'groups' : showOrphans ? 'orphans' : showBanner ? 'banner' : 'overview'}
      />

      {/* Main content column */}
      <div className="flex-1 flex flex-col overflow-hidden bg-sunrise-50">

      {/* Stats bar */}
      <div className="bg-white border-b border-stone-100 px-6 py-3 flex gap-6 text-sm items-center shrink-0 flex-wrap justify-between">
        <div className="flex gap-6 items-center flex-wrap">
        {emptyGroups > 0 && (
          <span className="text-amber-600 flex items-center gap-2">
            Empty groups: <strong>{emptyGroups}</strong>
            <button
              onClick={handleDeleteAllEmpty}
              disabled={isPending}
              className="text-xs text-red-500 hover:text-red-600 underline underline-offset-2 transition-colors disabled:opacity-40"
            >
              Delete all
            </button>
          </span>
        )}
        {selectedGroup && (
          <>
            <span className="text-stone-300">|</span>
            <span className="text-stone-500">
              Viewing: <strong className="text-jade">{selectedGroup.name}</strong>
              {' · '}Admins: <strong className="text-stone-800">{adminCount}</strong>
            </span>
            {groupLastActive && (
              <span className="text-stone-400 text-xs">Last active: {formatTime(groupLastActive)}</span>
            )}
          </>
        )}
        </div>
        <button
          onClick={handleSelectGlobalSearch}
          className={`p-1.5 rounded-lg transition-colors shrink-0 ${showGlobalSearch ? 'text-stone-800 bg-stone-100' : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100'}`}
          aria-label="Global search"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="8.5" cy="8.5" r="5.5"/>
            <line x1="13" y1="13" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Groups sidebar — only visible in groups view */}
        {showGroups && <aside className="w-72 bg-white border-r border-stone-100 flex flex-col shrink-0 overflow-hidden">
          <div className="p-3 border-b border-stone-100">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter groups…"
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade/50"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredGroups.length === 0 && (
              <p className="text-xs text-stone-400 text-center py-6">No groups found</p>
            )}
            {filteredGroups.map(group => (
              <div
                key={group.id}
                onClick={() => selectGroup(group)}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer border-b border-stone-50 transition-colors group ${
                  selectedGroup?.id === group.id
                    ? 'bg-sunrise-50 border-l-2 border-l-jade'
                    : 'hover:bg-stone-50'
                } ${(group.member_count || 0) === 0 ? 'opacity-60' : ''}`}
              >
                <div className="min-w-0">
                  {editingName?.id === group.id && editingName.type === 'group' ? (
                    <input
                      autoFocus
                      value={editingName.value}
                      onChange={e => setEditingName(n => ({ ...n, value: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditingName(null) }}
                      onBlur={submitRename}
                      onClick={e => e.stopPropagation()}
                      disabled={renaming}
                      className="text-sm font-medium text-stone-800 border-b border-jade outline-none bg-transparent w-full"
                    />
                  ) : (
                    <p className="text-sm font-medium text-stone-800 truncate">{group.name}</p>
                  )}
                  <p className="text-xs text-stone-400 mt-0.5">
                    {group.member_count || 0} member{group.member_count !== 1 ? 's' : ''}
                    {(group.member_count || 0) === 0 && ' · Empty'}
                    {' · '}{formatDate(group.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>

        </aside>}

        {/* Main panel */}
        <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={viewKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="flex-1 overflow-auto p-6"
        >

          {/* Empty state — only in groups view when no group selected */}
          {showGroups && !selectedGroup && (
            <div className="flex items-center justify-center h-full text-stone-400">
              <div className="text-center">
                <UsersThree size={40} weight="thin" className="mx-auto mb-3 text-stone-300" />
                <p className="text-sm">Select a group to view details</p>
              </div>
            </div>
          )}

          {/* — Orphaned users — */}
          {showOrphans && (
            <div className="max-w-6xl mx-auto">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-stone-800">
                    Orphaned Users
                    {orphanedUsers && (
                      <span className="ml-2 text-sm font-normal text-stone-400">
                        {orphanedUsers.length} account{orphanedUsers.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-stone-400 mt-1">Auth accounts with no group membership — signup failed, invite code was invalid, or they were removed without deleting the auth account.</p>
                </div>
                {orphanedUsers?.length > 0 && (
                  <button
                    onClick={handleDeleteAllOrphans}
                    disabled={isPending}
                    className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40"
                  >
                    Delete All ({orphanedUsers.length})
                  </button>
                )}
              </div>
              {loadingOrphans ? (
                <div className="flex items-center justify-center py-16 text-stone-400">
                  <p className="text-sm">Loading…</p>
                </div>
              ) : orphanedUsers?.length === 0 ? (
                <div className="bg-white rounded-2xl border border-stone-100 py-12 text-center text-stone-400">
                  <p className="text-sm">No orphaned accounts found</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-100 bg-stone-50">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Email</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Signed Up</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Last Sign In</th>
                        <th className="px-5 py-3 w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {orphanedUsers.map(user => (
                        <tr key={user.id} className="hover:bg-stone-50 transition-colors group">
                          <td className="px-5 py-3 text-stone-700">{user.email}</td>
                          <td className="px-5 py-3 text-xs text-stone-400 whitespace-nowrap">{formatTime(user.created_at)}</td>
                          <td className="px-5 py-3 text-xs text-stone-400 whitespace-nowrap">{formatTime(user.last_sign_in_at)}</td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleDeleteOrphan(user)}
                                className="px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* — In-App Banner — */}
          {showBanner && (
            <div className="max-w-2xl mx-auto">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-stone-800">In-App Banner</h2>
                <p className="text-xs text-stone-400 mt-1">Publishes a dismissible banner to all users the next time they open the app. Only one banner is active at a time.</p>
              </div>

              {/* Compose */}
              <div className="bg-white rounded-2xl border border-stone-200 p-5 mb-6">
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Message</label>
                <textarea
                  value={bannerDraft}
                  onChange={e => setBannerDraft(e.target.value)}
                  placeholder="e.g. Chat now loads instantly — open any conversation to try it!"
                  rows={3}
                  className="w-full text-sm text-stone-800 border border-stone-200 rounded-xl px-3 py-2.5 resize-none outline-none focus:border-jade transition-colors"
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-stone-400">{bannerDraft.trim().length}/200 characters</span>
                  <button
                    onClick={handlePublishBanner}
                    disabled={!bannerDraft.trim() || bannerDraft.trim().length > 200 || bannerSending || isPending}
                    className="px-4 py-2 text-sm font-semibold bg-jade text-white rounded-xl hover:bg-jade-700 transition-colors disabled:opacity-40"
                  >
                    {bannerSending ? 'Publishing…' : 'Publish Banner'}
                  </button>
                </div>
              </div>

              {/* History */}
              <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Recent Banners</h3>
              {announcements === null ? (
                <p className="text-sm text-stone-400 py-6 text-center">Loading…</p>
              ) : announcements.length === 0 ? (
                <div className="bg-white rounded-2xl border border-stone-100 py-10 text-center text-stone-400">
                  <p className="text-sm">No banners sent yet</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {announcements.map(a => (
                    <div key={a.id} className="bg-white rounded-2xl border border-stone-200 px-5 py-4 flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-stone-800 leading-snug">{a.message}</p>
                        <p className="text-xs text-stone-400 mt-1">{formatTime(a.created_at)}</p>
                      </div>
                      {a.active ? (
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs font-semibold text-jade bg-jade/10 px-2 py-1 rounded-full">Active</span>
                          <button
                            onClick={() => handleDeactivateBanner(a.id)}
                            disabled={isPending}
                            className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
                          >
                            Deactivate
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-stone-400 shrink-0">Inactive</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* — Global search — */}
          {showGlobalSearch && (
            <div className="max-w-6xl mx-auto">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-stone-800 mb-3">Global Search</h2>
                <div className="flex gap-2">
                  <input
                    ref={globalInputRef}
                    type="text"
                    value={globalQuery}
                    onChange={e => setGlobalQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGlobalSearch()}
                    placeholder="Search by name or email across all groups…"
                    className="flex-1 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jade/50"
                  />
                  <button
                    onClick={handleGlobalSearch}
                    disabled={!globalQuery.trim() || loadingGlobal}
                    className="px-4 py-2.5 text-sm font-medium rounded-xl bg-jade text-white hover:opacity-90 transition-colors disabled:opacity-40"
                  >
                    {loadingGlobal ? 'Searching…' : 'Search'}
                  </button>
                </div>
              </div>

              {globalResults === null && !loadingGlobal && (
                <div className="bg-white rounded-2xl border border-stone-100 py-12 text-center text-stone-400">
                  <p className="text-sm">Enter a name or email to search</p>
                </div>
              )}

              {globalResults?.length === 0 && (
                <div className="bg-white rounded-2xl border border-stone-100 py-12 text-center text-stone-400">
                  <p className="text-sm">No matching users found</p>
                </div>
              )}

              {globalResults?.length > 0 && (
                <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
                  <div className="px-5 py-3 border-b border-stone-100 bg-stone-50">
                    <p className="text-xs text-stone-400">{globalResults.length} result{globalResults.length !== 1 ? 's' : ''}</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-100">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Name</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Email</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Group</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Role</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Last Sign In</th>
                        <th className="px-5 py-3 w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {globalResults.map(user => (
                        <tr key={user.id} className="hover:bg-stone-50 transition-colors">
                          <td className="px-5 py-3 font-medium text-stone-800">{user.display_name || <span className="text-stone-400 italic">No name</span>}</td>
                          <td className="px-5 py-3 text-stone-500">{user.email || '—'}</td>
                          <td className="px-5 py-3 text-stone-600">{user.group_name}</td>
                          <td className="px-5 py-3"><Badge role={user.role} /></td>
                          <td className="px-5 py-3 text-xs text-stone-400 whitespace-nowrap">{formatTime(user.last_sign_in_at)}</td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => {
                                const group = groups.find(g => g.id === user.group_id)
                                if (group) selectGroup(group)
                              }}
                              className="px-2 py-0.5 rounded-md text-xs font-medium bg-jade/10 text-jade hover:bg-jade/20 transition-colors whitespace-nowrap"
                            >
                              View Group
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* — Overview / Metrics — */}
          {showMetrics && (
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-wrap items-center gap-3 mb-6">
                {/* Tab selector */}
                <div className="flex gap-1">
                  {[{ id: 'overview', label: 'Overview' }, { id: 'analytics', label: 'Analytics' }].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setOverviewTab(t.id)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${overviewTab === t.id ? 'bg-stone-100 text-stone-800' : 'text-stone-400 hover:text-stone-600'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="w-px h-5 bg-stone-200 hidden sm:block" />

                {/* Time range selector */}
                <div className="flex items-center gap-1">
                  {['7d', '30d', 'custom'].map(t => (
                    <button
                      key={t}
                      onClick={() => { if (t !== 'custom') { setDateRange({ type: t }); loadAllMetrics({ type: t }) } else setDateRange({ type: 'custom', start: customStart, end: customEnd }) }}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${dateRange.type === t ? 'bg-stone-800 text-white' : 'text-stone-400 hover:text-stone-600'}`}
                    >
                      {t === '7d' ? '7 days' : t === '30d' ? '30 days' : 'Custom'}
                    </button>
                  ))}
                </div>

                {/* Custom date inputs */}
                {dateRange.type === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value)}
                      className="text-xs border border-stone-200 rounded-lg px-2 py-1 text-stone-700 focus:outline-none focus:border-stone-400"
                    />
                    <span className="text-xs text-stone-400">to</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value)}
                      className="text-xs border border-stone-200 rounded-lg px-2 py-1 text-stone-700 focus:outline-none focus:border-stone-400"
                    />
                    <button
                      onClick={() => { const r = { type: 'custom', start: customStart, end: customEnd }; setDateRange(r); loadAllMetrics(r) }}
                      disabled={!customStart || !customEnd}
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-stone-800 text-white disabled:opacity-40 transition-opacity"
                    >
                      Apply
                    </button>
                  </div>
                )}

                <div className="ml-auto">
                  <button
                    onClick={() => loadAllMetrics(dateRange)}
                    disabled={loadingMetrics || loadingGa4}
                    className="text-xs text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-40"
                  >
                    {(loadingMetrics || loadingGa4) ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
              </div>

              {loadingMetrics && !metrics ? (
                <div className="flex items-center justify-center py-24 text-stone-400">
                  <p className="text-sm">Loading…</p>
                </div>
              ) : metrics ? (
                <>
                  {overviewTab === 'overview' && (() => {
                    const { label: periodLabel } = getQueryDates()
                    return <>{/* Scorecard grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    {[
                      { label: 'Total Groups',   value: metrics.totalGroups,                           sub: null },
                      { label: 'Total Members',  value: metrics.totalMembers,                          sub: null },
                      { label: 'Messages',       value: metrics.messagesInPeriod.toLocaleString(),     sub: periodLabel },
                      { label: 'New Groups',     value: `+${metrics.newGroupsInPeriod}`,              sub: periodLabel },
                      { label: 'New Members',    value: `+${metrics.newMembersInPeriod}`,             sub: periodLabel },
                    ].map(({ label, value, sub }) => (
                      <div key={label} className="bg-white rounded-2xl border border-stone-100 px-5 py-4 shadow-sm">
                        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">{label}</p>
                        <p className="text-3xl font-bold text-stone-800">{value}</p>
                        {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
                      </div>
                    ))}
                  </div>

                  {/* Sortable group table */}
                  {sortedGroupStats.length > 0 && (() => {
                    const SortTh = ({ col, label, right = false }) => {
                      const active = groupSort.col === col
                      return (
                        <th
                          onClick={() => setGroupSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))}
                          className={`py-3 px-4 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors ${right ? 'text-right' : 'text-left'} ${active ? 'text-stone-700' : 'text-stone-400 hover:text-stone-600'}`}
                        >
                          {label}{active ? (groupSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                        </th>
                      )
                    }
                    return (
                      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-x-auto">
                        <table className="w-full">
                          <thead className="border-b border-stone-100">
                            <tr>
                              <SortTh col="name"         label="Group" />
                              <SortTh col="members"      label="Members"       right />
                              <SortTh col="messages"     label="Messages"      right />
                              <SortTh col="lastActivity" label="Last Activity" right />
                              <SortTh col="lastLogin"    label="Last Login"    right />
                            </tr>
                          </thead>
                          <tbody>
                            {sortedGroupStats.map((g, i) => (
                              <tr
                                key={i}
                                className="border-b border-stone-50 last:border-0 hover:bg-stone-50 transition-colors cursor-pointer"
                                onClick={() => {
                                  const match = groups.find(gr => gr.name === g.name)
                                  if (match) selectGroup(match)
                                }}
                              >
                                <td className="py-3 px-4 text-sm font-medium text-stone-800 max-w-[200px]">
                                  <span className="block truncate">{g.name}</span>
                                </td>
                                <td className="py-3 px-4 text-sm text-stone-600 text-right tabular-nums">{g.members}</td>
                                <td className="py-3 px-4 text-sm text-stone-600 text-right tabular-nums">{g.messages.toLocaleString()}</td>
                                <td className="py-3 px-4 text-sm text-stone-500 text-right whitespace-nowrap" title={formatTime(g.lastActivity)}>{timeAgo(g.lastActivity)}</td>
                                <td className="py-3 px-4 text-sm text-stone-500 text-right whitespace-nowrap" title={formatTime(g.lastLogin)}>{timeAgo(g.lastLogin)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()}</>})()}

                  {/* GA4 Analytics tab */}
                  {overviewTab === 'analytics' && (ga4 ? (
                    <div className="mt-2 space-y-6">

                      {/* Host selector + loading indicator */}
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {[
                            { id: 'app',     label: 'app.coveyspace.com' },
                            { id: 'landing', label: 'www.coveyspace.com' },
                          ].map(h => (
                            <button
                              key={h.id}
                              onClick={() => setAnalyticsHost(h.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${analyticsHost === h.id ? 'bg-stone-800 text-white' : 'text-stone-400 hover:text-stone-600 border border-stone-200'}`}
                            >
                              {h.label}
                            </button>
                          ))}
                        </div>
                        {loadingGa4 && (
                          <div className="flex items-center gap-1.5 text-stone-400">
                            <div className="w-3 h-3 rounded-full border-2 border-stone-200 border-t-stone-400 animate-spin" />
                            <span className="text-xs">Updating…</span>
                          </div>
                        )}
                      </div>

                      {/* ── app.coveyspace.com ── */}
                      {analyticsHost === 'app' && (() => {
                        const { label: periodLabel } = getQueryDates()
                        return (
                        <div className={`space-y-6 transition-opacity duration-200 ${loadingGa4 ? 'opacity-40 pointer-events-none' : ''}`}>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                              { label: 'Active Users',  value: ga4.app.activeUsers7d.toLocaleString(),  sub: periodLabel },
                              { label: 'New Sign-ups',  value: ga4.app.signups30d.toLocaleString(),     sub: periodLabel },
                              { label: 'Logins',        value: ga4.app.logins30d.toLocaleString(),      sub: periodLabel },
                              { label: 'Chat Messages', value: ga4.app.chatMessages30d.toLocaleString(), sub: periodLabel },
                            ].map(({ label, value, sub }) => (
                              <div key={label} className="bg-white rounded-2xl border border-stone-100 px-5 py-4 shadow-sm">
                                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">{label}</p>
                                <p className="text-3xl font-bold text-stone-800">{value}</p>
                                {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
                              </div>
                            ))}
                          </div>

                          <DailyUsersChart data={ga4.app.dailyUsers} id="app" color="#6366f1" />

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                              <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Feature Events</h4>
                              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                                {[
                                  { label: 'Chat Messages',     value: ga4.app.chatMessages30d },
                                  { label: 'Prayer Requests',   value: ga4.app.prayerRequests30d },
                                  { label: 'Schedule Sign-ups', value: ga4.app.scheduleSignups30d },
                                  { label: 'Push Opt-ins',      value: ga4.app.pushOptIns30d },
                                ].map(({ label, value }) => {
                                  const max = Math.max(ga4.app.chatMessages30d, ga4.app.prayerRequests30d, ga4.app.scheduleSignups30d, ga4.app.pushOptIns30d, 1)
                                  const pct = Math.round((value / max) * 100)
                                  return (
                                    <div key={label} className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
                                      <span className="text-sm text-stone-700 w-36 shrink-0">{label}</span>
                                      <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                                        <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className="text-xs text-stone-400 w-12 text-right tabular-nums">{value.toLocaleString()}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>

                            {ga4.app.tabs.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Tab Popularity</h4>
                                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                                  {ga4.app.tabs.map((t, i) => {
                                    const max = ga4.app.tabs[0].count || 1
                                    const pct = Math.round((t.count / max) * 100)
                                    return (
                                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
                                        <span className="text-sm text-stone-700 w-28 shrink-0 capitalize">{t.name}</span>
                                        <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                                          <div className="bg-violet-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-stone-400 w-12 text-right tabular-nums">{t.count.toLocaleString()}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {ga4.app.signupMethods.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Sign-up Method</h4>
                                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                                  {ga4.app.signupMethods.map((m, i) => {
                                    const max = ga4.app.signupMethods[0].count || 1
                                    const pct = Math.round((m.count / max) * 100)
                                    return (
                                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
                                        <span className="text-sm text-stone-700 w-20 shrink-0 capitalize">{m.name}</span>
                                        <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                                          <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-stone-400 w-10 text-right tabular-nums">{m.count.toLocaleString()}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {ga4.app.countries.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Users by Country</h4>
                                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                                  {ga4.app.countries.map((c, i) => {
                                    const max = ga4.app.countries[0].count || 1
                                    const pct = Math.round((c.count / max) * 100)
                                    return (
                                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
                                        <span className="text-sm text-stone-700 w-20 shrink-0">{c.name}</span>
                                        <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                                          <div className="bg-teal-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-stone-400 w-10 text-right tabular-nums">{c.count.toLocaleString()}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {ga4.app.cities.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Users by City</h4>
                                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                                  {ga4.app.cities.map((c, i) => {
                                    const max = ga4.app.cities[0].count || 1
                                    const pct = Math.round((c.count / max) * 100)
                                    return (
                                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
                                        <span className="text-sm text-stone-700 w-20 shrink-0">{c.name}</span>
                                        <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                                          <div className="bg-sky-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-stone-400 w-10 text-right tabular-nums">{c.count.toLocaleString()}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        )
                      })()}

                      {/* ── www.coveyspace.com ── */}
                      {analyticsHost === 'landing' && (() => {
                        const { label: periodLabel } = getQueryDates()
                        const ctaTotal = ga4.landing.ctaClicks.reduce((s, c) => s + c.count, 0)
                        const { ctaTotalSimple } = ga4.landing
                        const ctaDisplayValue = ctaTotal > 0 ? ctaTotal : ctaTotalSimple
                        const ctaNote = ctaTotal > 0
                          ? null
                          : ctaTotalSimple > 0
                          ? 'Event fires — custom params not registered in GA4'
                          : 'No cta_click events found'
                        return (
                        <div className={`space-y-6 transition-opacity duration-200 ${loadingGa4 ? 'opacity-40 pointer-events-none' : ''}`}>
                          {/* Scorecards */}
                          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="bg-white rounded-2xl border border-stone-100 px-5 py-4 shadow-sm">
                              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">Active Users</p>
                              <p className="text-3xl font-bold text-stone-800">{ga4.landing.activeUsers30d.toLocaleString()}</p>
                              <p className="text-xs text-stone-400 mt-0.5">{periodLabel}</p>
                            </div>
                            <div className="bg-white rounded-2xl border border-stone-100 px-5 py-4 shadow-sm">
                              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">CTA Clicks</p>
                              <p className={`text-3xl font-bold ${ctaDisplayValue === 0 ? 'text-stone-300' : 'text-stone-800'}`}>
                                {ctaDisplayValue.toLocaleString()}
                              </p>
                              {ctaNote
                                ? <p className="text-xs text-amber-500 mt-0.5">{ctaNote}</p>
                                : <p className="text-xs text-stone-400 mt-0.5">{periodLabel}</p>
                              }
                            </div>
                          </div>

                          {/* Daily Users Chart */}
                          <DailyUsersChart data={ga4.landing.dailyUsers} id="land" color="#10b981" />

                          {/* Marketing Channels */}
                          {ga4.landing.channels.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Traffic by Channel</h4>
                              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                                {ga4.landing.channels.map((ch, i) => {
                                  const max = ga4.landing.channels[0].count || 1
                                  const pct = Math.round((ch.count / max) * 100)
                                  return (
                                    <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
                                      <span className="text-sm text-stone-700 w-36 shrink-0">{ch.name}</span>
                                      <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                                        <div className="bg-violet-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className="text-xs text-stone-400 w-12 text-right tabular-nums">{ch.count.toLocaleString()}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* CTA by Page + CTA by Location */}
                          {(ga4.landing.ctaByPage.length > 0 || ga4.landing.ctaByLocation.length > 0) && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {ga4.landing.ctaByPage.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">CTA Clicks by Page Path</h4>
                                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                                    {ga4.landing.ctaByPage.map((c, i) => {
                                      const max = ga4.landing.ctaByPage[0].count || 1
                                      const pct = Math.round((c.count / max) * 100)
                                      return (
                                        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
                                          <span className="text-sm text-stone-700 w-24 shrink-0 capitalize">{c.name}</span>
                                          <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                                            <div className="bg-jade h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                          </div>
                                          <span className="text-xs text-stone-400 w-10 text-right tabular-nums">{c.count.toLocaleString()}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                              {ga4.landing.ctaByLocation.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">CTA Clicks by Button Text</h4>
                                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                                    {ga4.landing.ctaByLocation.map((c, i) => {
                                      const max = ga4.landing.ctaByLocation[0].count || 1
                                      const pct = Math.round((c.count / max) * 100)
                                      return (
                                        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
                                          <span className="text-sm text-stone-700 w-24 shrink-0 capitalize">{c.name}</span>
                                          <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                                            <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                          </div>
                                          <span className="text-xs text-stone-400 w-10 text-right tabular-nums">{c.count.toLocaleString()}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* All Landing Events — diagnostic; highlights anything CTA-related */}
                          {ga4.landing.allEvents.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
                                All Landing Events
                                {ctaTotal === 0 && <span className="ml-2 normal-case font-normal text-amber-500">— look for cta_click below</span>}
                              </h4>
                              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                                {ga4.landing.allEvents.map((ev, i) => {
                                  const max = ga4.landing.allEvents[0].count || 1
                                  const pct = Math.round((ev.count / max) * 100)
                                  const highlight = ev.name.toLowerCase().includes('cta') || ev.name.toLowerCase().includes('click')
                                  return (
                                    <div key={i} className={`flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0 ${highlight ? 'bg-amber-50' : ''}`}>
                                      <span className={`text-sm w-52 shrink-0 font-mono text-xs ${highlight ? 'text-amber-700 font-semibold' : 'text-stone-600'}`}>{ev.name}</span>
                                      <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                                        <div className={`h-1.5 rounded-full ${highlight ? 'bg-amber-400' : 'bg-stone-300'}`} style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className="text-xs text-stone-400 w-12 text-right tabular-nums">{ev.count.toLocaleString()}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Country + City */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {ga4.landing.countries.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Users by Country</h4>
                                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                                  {ga4.landing.countries.map((c, i) => {
                                    const max = ga4.landing.countries[0].count || 1
                                    const pct = Math.round((c.count / max) * 100)
                                    return (
                                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
                                        <span className="text-sm text-stone-700 w-24 shrink-0">{c.name}</span>
                                        <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                                          <div className="bg-teal-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-stone-400 w-10 text-right tabular-nums">{c.count.toLocaleString()}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                            {ga4.landing.cities.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Users by City</h4>
                                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                                  {ga4.landing.cities.map((c, i) => {
                                    const max = ga4.landing.cities[0].count || 1
                                    const pct = Math.round((c.count / max) * 100)
                                    return (
                                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
                                        <span className="text-sm text-stone-700 w-24 shrink-0">{c.name}</span>
                                        <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                                          <div className="bg-sky-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-stone-400 w-10 text-right tabular-nums">{c.count.toLocaleString()}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        )
                      })()}

                    </div>
                  ) : loadingGa4 ? (
                    <div className="flex items-center gap-2 text-stone-400 py-16 justify-center">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-stone-200 border-t-stone-400 animate-spin" />
                      <p className="text-sm">Loading analytics…</p>
                    </div>
                  ) : null)}
                </>
              ) : null}
            </div>
          )}

          {/* — Loading members — */}
          {selectedGroup && loadingMembers && (
            <div className="flex items-center justify-center h-full text-stone-400">
              <p className="text-sm">Loading…</p>
            </div>
          )}

          {/* — Group detail view — */}
          {selectedGroup && !loadingMembers && (
            <div className="max-w-6xl mx-auto">
              {/* Group header */}
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {editingGroupHeader ? (
                      <input
                        autoFocus
                        value={groupNameDraft}
                        onChange={e => setGroupNameDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') submitGroupRename(); if (e.key === 'Escape') setEditingGroupHeader(false) }}
                        onBlur={submitGroupRename}
                        disabled={renaming}
                        className="text-base font-semibold text-stone-800 border-b-2 border-jade outline-none bg-transparent"
                      />
                    ) : (
                      <h2 className="text-base font-semibold text-stone-800 truncate">
                        {selectedGroup.name}
                        <span className="ml-2 text-sm font-normal text-stone-400">
                          {members.length} member{members.length !== 1 ? 's' : ''}
                        </span>
                      </h2>
                    )}
                    {groupDetails?.invite_code && !editingGroupHeader && (
                      <span
                        className="shrink-0 text-xs font-mono font-bold tracking-widest text-stone-500 bg-stone-100 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-stone-200 transition-colors"
                        title="Click to copy invite link"
                        onClick={() => {
                          navigator.clipboard.writeText(`https://app.coveyspace.com/login?code=${groupDetails.invite_code}`)
                          showToast('Invite link copied!')
                        }}
                      >
                        {groupDetails.invite_code}
                      </span>
                    )}
                  </div>

                  {/* ⋯ group actions menu */}
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setShowGroupMenu(v => !v)}
                      className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors text-lg leading-none"
                    >
                      ⋯
                    </button>
                    {groupMenuAnim.mounted && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowGroupMenu(false)} />
                        <div className={`absolute right-0 top-full mt-1 z-20 w-48 bg-white rounded-xl shadow-xl border border-stone-100 py-1 overflow-hidden ${groupMenuAnim.closing ? 'anim-menu-out' : 'anim-menu-in'}`}>
                          <button
                            onClick={() => { setShowGroupMenu(false); setGroupNameDraft(selectedGroup.name); setEditingGroupHeader(true) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                          >
                            Rename group
                          </button>
                          <button
                            onClick={() => { setShowGroupMenu(false); setBroadcastGroupName(selectedGroup.name); setBroadcastTarget(selectedGroup.id) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                          >
                            <Megaphone size={14} className="inline mr-1.5 -mt-0.5" />Broadcast to all
                          </button>
                          <button
                            onClick={() => { setShowGroupMenu(false); exportCSV(selectedGroup.name, members) }}
                            disabled={members.length === 0}
                            className="w-full text-left px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-40"
                          >
                            Export CSV
                          </button>
                          <div className="border-t border-stone-100 mt-1 pt-1">
                            <button
                              onClick={() => { setShowGroupMenu(false); handleDeleteGroup(selectedGroup) }}
                              className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                            >
                              Delete group
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {groupDetails?.settings && (
                  <FeatureFlags settings={groupDetails.settings} />
                )}
              </div>

              {/* Tab bar */}
              <div className="flex gap-1 mb-4 border-b border-stone-100 pb-0">
                {[
                  { id: 'members',  label: 'Members' },
                  { id: 'messages', label: 'Messages' },
                  { id: 'activity', label: 'Activity' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setGroupDetailTab(t.id)
                      if (t.id === 'messages' && groupMessages.length === 0 && !loadingMessages) {
                        handleLoadMessages(selectedGroup.id, 0)
                      }
                      if (t.id === 'activity' && !groupActivity && !loadingActivity) {
                        handleLoadActivity(selectedGroup.id)
                      }
                    }}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                      groupDetailTab === t.id
                        ? 'border-stone-800 text-stone-800'
                        : 'border-transparent text-stone-400 hover:text-stone-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Members tab ── */}
              {groupDetailTab === 'members' && (
                <>
                  {/* Selection action bar */}
                  {selectedMemberIds.size > 0 && (() => {
                    const single = selectedMemberIds.size === 1
                      ? members.find(m => selectedMemberIds.has(m.id)) ?? null
                      : null
                    return (
                      <div className="mb-3 flex items-center gap-2 flex-wrap px-4 py-2.5 bg-jade/5 border border-jade/20 rounded-xl">
                        <span className="text-sm font-medium text-jade mr-1">
                          {selectedMemberIds.size} selected
                        </span>
                        <button
                          onClick={() => { setBroadcastGroupName(selectedGroup.name); setBroadcastTarget('selected') }}
                          className="px-3 py-1 text-xs font-medium rounded-lg bg-jade text-white hover:opacity-90 transition-colors"
                        >
                          <Megaphone size={13} weight="fill" className="inline mr-1 -mt-0.5" />Broadcast
                        </button>
                        {single && (
                          <>
                            <button
                              onClick={() => handleToggleRole(single)}
                              className="px-3 py-1 text-xs font-medium rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors"
                            >
                              {single.role === 'admin' ? 'Demote' : 'Promote'}
                            </button>
                            <button
                              onClick={() => handlePasswordReset(single)}
                              className="px-3 py-1 text-xs font-medium rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors"
                            >
                              Reset password
                            </button>
                            <button
                              onClick={() => handleDeleteUser(single)}
                              className="px-3 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                            >
                              Delete
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setSelectedMemberIds(new Set())}
                          className="ml-auto text-xs text-stone-400 hover:text-stone-600 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    )
                  })()}

                  {displayedMembers.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-stone-100 py-12 text-center text-stone-400">
                      <p className="text-sm">{search ? 'No matching members' : 'No members in this group'}</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead>
                          <tr className="border-b border-stone-100 bg-stone-50">
                            <th className="px-4 py-3 w-10">
                              <input
                                type="checkbox"
                                checked={displayedMembers.length > 0 && displayedMembers.every(m => selectedMemberIds.has(m.id))}
                                ref={el => { if (el) el.indeterminate = displayedMembers.some(m => selectedMemberIds.has(m.id)) && !displayedMembers.every(m => selectedMemberIds.has(m.id)) }}
                                onChange={() => {
                                  const allSelected = displayedMembers.every(m => selectedMemberIds.has(m.id))
                                  setSelectedMemberIds(allSelected ? new Set() : new Set(displayedMembers.map(m => m.id)))
                                }}
                                className="rounded border-stone-300 text-jade focus:ring-jade/50 cursor-pointer"
                              />
                            </th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Name</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Email</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Role</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Last Activity</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Last Logged In</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-50">
                          {displayedMembers.map(member => (
                            <tr
                              key={member.id}
                              className={`hover:bg-stone-50 transition-colors group ${selectedMemberIds.has(member.id) ? 'bg-jade/5' : ''}`}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedMemberIds.has(member.id)}
                                  onChange={() => toggleSelectMember(member.id)}
                                  className="rounded border-stone-300 text-jade focus:ring-jade/50 cursor-pointer"
                                />
                              </td>
                              <td className="px-5 py-3">
                                {editingName?.id === member.id && editingName.type === 'user' ? (
                                  <input
                                    autoFocus
                                    value={editingName.value}
                                    onChange={e => setEditingName(n => ({ ...n, value: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditingName(null) }}
                                    onBlur={submitRename}
                                    disabled={renaming}
                                    className="text-sm font-medium text-stone-800 border-b border-jade outline-none bg-transparent w-full"
                                  />
                                ) : (
                                  <span
                                    className="font-medium text-stone-800 cursor-pointer hover:text-jade transition-colors"
                                    onClick={() => startRename(member.id, member.display_name || '', 'user')}
                                    title="Click to edit name"
                                  >
                                    {member.display_name || <span className="text-stone-400 italic">No name</span>}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-stone-500">{member.email || '—'}</td>
                              <td className="px-5 py-3"><Badge role={member.role} /></td>
                              <td className="px-5 py-3 text-xs text-stone-400 whitespace-nowrap">{formatTime(member.last_active_at)}</td>
                              <td className="px-5 py-3 text-xs text-stone-400 whitespace-nowrap">{formatTime(member.last_sign_in_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* ── Messages tab ── */}
              {groupDetailTab === 'messages' && (
                <div>
                  {loadingMessages && groupMessages.length === 0 ? (
                    <div className="flex items-center justify-center py-16 text-stone-400">
                      <p className="text-sm">Loading messages…</p>
                    </div>
                  ) : groupMessages.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-stone-100 py-12 text-center text-stone-400">
                      <p className="text-sm">No messages yet</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                      <div className="px-5 py-3 border-b border-stone-100 bg-stone-50 flex items-center justify-between">
                        <p className="text-xs text-stone-500">{groupMessages.length} message{groupMessages.length !== 1 ? 's' : ''} — newest first</p>
                        <button
                          onClick={() => handleLoadMessages(selectedGroup.id, 0)}
                          disabled={loadingMessages}
                          className="text-xs text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-40"
                        >
                          Refresh
                        </button>
                      </div>
                      <div className="divide-y divide-stone-50">
                        {groupMessages.map((msg, i) => (
                          <div key={msg.id ?? i} className="px-5 py-3 flex gap-3">
                            <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-xs font-semibold text-stone-500">
                                {(msg.display_name || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 mb-0.5">
                                <span className="text-xs font-semibold text-stone-700">
                                  {msg.display_name || 'Unknown'}
                                </span>
                                <span className="text-xs text-stone-400">{formatTime(msg.created_at)}</span>
                              </div>
                              {msg.body && <p className="text-sm text-stone-700 break-words leading-snug">{msg.body}</p>}
                              {msg.image_url && (
                                <img src={msg.image_url} alt="" className="mt-1.5 max-w-[200px] rounded-lg border border-stone-100" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {messagesHasMore && (
                        <div className="px-5 py-3 border-t border-stone-100 text-center">
                          <button
                            onClick={() => handleLoadMessages(selectedGroup.id, messagesOffset)}
                            disabled={loadingMessages}
                            className="text-xs text-stone-500 hover:text-stone-700 transition-colors disabled:opacity-40"
                          >
                            {loadingMessages ? 'Loading…' : 'Load more'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Activity tab ── */}
              {groupDetailTab === 'activity' && (
                <div>
                  {loadingActivity && !groupActivity ? (
                    <div className="flex items-center justify-center py-16 text-stone-400">
                      <p className="text-sm">Loading activity…</p>
                    </div>
                  ) : groupActivity ? (
                    <>
                      {/* Activity sub-tabs */}
                      <div className="flex gap-1 mb-4">
                        {[
                          { id: 'meals',     label: `Meals (${groupActivity.meals.length})` },
                          { id: 'services',  label: `Services (${groupActivity.services.length})` },
                          { id: 'birthdays', label: `Birthdays (${groupActivity.birthdays.length})` },
                          { id: 'prayers',   label: `Prayer (${groupActivity.prayers.length})` },
                        ].map(t => (
                          <button
                            key={t.id}
                            onClick={() => setActivityTab(t.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activityTab === t.id ? 'bg-stone-800 text-white' : 'text-stone-400 hover:text-stone-600 border border-stone-200'}`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {/* Meals */}
                      {activityTab === 'meals' && (
                        <ActivityList
                          items={groupActivity.meals}
                          empty="No meals recorded"
                          renderRow={row => ({
                            title: row.title ?? '(untitled)',
                            subtitle: row.week_date
                              ? `Week of ${new Date(row.week_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${row.is_paused ? ' · Paused' : ''}`
                              : null,
                            body: Array.isArray(row.slot_dishes) && row.slot_dishes.filter(Boolean).length > 0
                              ? row.slot_dishes.filter(Boolean).join(' · ')
                              : null,
                            date: row.week_date ?? row.created_at,
                          })}
                        />
                      )}

                      {/* Services */}
                      {activityTab === 'services' && (
                        <ActivityList
                          items={groupActivity.services}
                          empty="No services recorded"
                          renderRow={row => ({
                            title: row.title ?? '(untitled)',
                            subtitle: row.week_date
                              ? `Week of ${new Date(row.week_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${row.is_paused ? ' · Paused' : ''}`
                              : null,
                            body: Array.isArray(row.slot_dishes) && row.slot_dishes.filter(Boolean).length > 0
                              ? row.slot_dishes.filter(Boolean).join(' · ')
                              : null,
                            date: row.week_date ?? row.created_at,
                          })}
                        />
                      )}

                      {/* Birthdays */}
                      {activityTab === 'birthdays' && (
                        <ActivityList
                          items={groupActivity.birthdays}
                          empty="No birthdays recorded"
                          renderRow={row => ({
                            title: row.name ?? '(unknown)',
                            subtitle: row.birthday
                              ? new Date(row.birthday + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                              : null,
                            body: null,
                            date: row.birthday ?? row.created_at,
                          })}
                        />
                      )}

                      {/* Prayer requests */}
                      {activityTab === 'prayers' && (
                        groupActivity.prayerError ? (
                          <div className="bg-white rounded-2xl border border-stone-100 py-12 text-center text-stone-400">
                            <p className="text-sm">Prayer requests unavailable</p>
                            <p className="text-xs mt-1 text-stone-300">{groupActivity.prayerError}</p>
                          </div>
                        ) : (
                          <ActivityList
                            items={groupActivity.prayers}
                            empty="No prayer requests"
                            renderRow={row => ({
                              title: row.added_by ?? 'Unknown',
                              subtitle: row.date
                                ? new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : null,
                              body: row.request ?? null,
                              date: row.created_at,
                            })}
                          />
                        )
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </motion.main>
        </AnimatePresence>
      </div>
      </div>
    </div>
  )
}
