'use client'

import { useState, useEffect, useTransition, useMemo, useRef } from 'react'
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
} from '@/actions/admin'
import { logoutAction } from '@/actions/auth'

const PT = 'America/Los_Angeles'

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
  const [groups, setGroups] = useState(initialGroups)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [groupDetails, setGroupDetails] = useState(null)

  const [orphanedUsers, setOrphanedUsers] = useState(null)
  const [loadingOrphans, setLoadingOrphans] = useState(false)
  const [showOrphans, setShowOrphans] = useState(false)

  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [globalQuery, setGlobalQuery] = useState('')
  const [globalResults, setGlobalResults] = useState(null)
  const [loadingGlobal, setLoadingGlobal] = useState(false)

  const [broadcastTarget, setBroadcastTarget] = useState(null) // null | 'all' | 'selected' | groupId string
  const [broadcastGroupName, setBroadcastGroupName] = useState('')
  const [showMenu, setShowMenu] = useState(false)
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
  const menuAnim        = useAnimatedMount(showMenu, 220)
  const groupMenuAnim   = useAnimatedMount(showGroupMenu, 110)

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
    setSelectedGroup(group)
    setSearch('')
    setGroupDetails(null)
    setLoadingMembers(true)
    setSelectedMemberIds(new Set())
    setShowGroupMenu(false)
    setEditingGroupHeader(false)
    const [membersResult, detailsResult] = await Promise.all([
      loadMembers(group.id),
      loadGroupDetails(group.id),
    ])
    setMembers(membersResult.data || [])
    setGroupDetails(detailsResult.data || null)
    setLoadingMembers(false)
  }

  async function handleSelectOrphans() {
    setSelectedGroup(null)
    setMembers([])
    setSearch('')
    setShowGlobalSearch(false)
    setShowOrphans(true)
    if (orphanedUsers !== null) return
    setLoadingOrphans(true)
    const { data, error } = await loadOrphanedUsers()
    if (error) showToast(error, 'error')
    else setOrphanedUsers(data || [])
    setLoadingOrphans(false)
  }

  function handleSelectGlobalSearch() {
    setSelectedGroup(null)
    setMembers([])
    setSearch('')
    setShowOrphans(false)
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

  // Stats
  const totalMembers = groups.reduce((s, g) => s + (g.member_count || 0), 0)
  const emptyGroups = groups.filter(g => (g.member_count || 0) === 0).length
  const adminCount = members.filter(m => m.role === 'admin').length

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
    <div className="h-screen bg-sunrise-50 flex flex-col overflow-hidden">
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

      {/* Slideout menu */}
      {menuAnim.mounted && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className={`absolute inset-0 bg-black/30 ${menuAnim.closing ? 'anim-overlay-out' : 'anim-overlay-in'}`} onClick={() => setShowMenu(false)} />
          <div className={`relative w-64 bg-stone-900 text-white flex flex-col shadow-2xl ${menuAnim.closing ? 'anim-slide-r-out' : 'anim-slide-r-in'}`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-700">
              <p className="text-sm font-semibold">Menu</p>
              <button onClick={() => setShowMenu(false)} className="text-stone-400 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>
            <div className="flex flex-col p-4 gap-1">
              <button
                onClick={() => { setShowMenu(false); setBroadcastGroupName(''); setBroadcastTarget('all') }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left hover:bg-stone-800 transition-colors"
              >
                <span>📣</span>
                <div>
                  <p className="font-medium">Broadcast to All</p>
                  <p className="text-xs text-stone-400 mt-0.5">Push notification to every group</p>
                </div>
              </button>
              <button
                onClick={() => { setShowMenu(false); handleSelectOrphans() }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left hover:bg-stone-800 transition-colors"
              >
                <span>👻</span>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Orphaned Users</p>
                  {orphanedUsers !== null && orphanedUsers.length > 0 && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                      {orphanedUsers.length}
                    </span>
                  )}
                </div>
              </button>
              <Link
                href="/audit"
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm hover:bg-stone-800 transition-colors"
              >
                <span>📋</span>
                <div>
                  <p className="font-medium">Audit Log</p>
                  <p className="text-xs text-stone-400 mt-0.5">View recent admin actions</p>
                </div>
              </Link>
            </div>
            <div className="mt-auto p-4 border-t border-stone-700">
              <button
                onClick={() => logoutAction()}
                className="w-full px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-stone-800 rounded-xl transition-colors text-left"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-stone-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Community Admin</h1>
          <p className="text-xs text-stone-400 mt-0.5">
            {groups.length} groups · {totalMembers} members
            {emptyGroups > 0 && ` · ${emptyGroups} empty`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSelectGlobalSearch}
            className={`p-1.5 rounded-lg transition-colors ${showGlobalSearch ? 'text-white bg-stone-700' : 'text-stone-400 hover:text-white hover:bg-stone-800'}`}
            aria-label="Global search"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="8.5" cy="8.5" r="5.5"/>
              <line x1="13" y1="13" x2="18" y2="18"/>
            </svg>
          </button>
          <button
            onClick={() => setShowMenu(true)}
            className="text-stone-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-stone-800"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect y="3" width="20" height="2" rx="1"/>
              <rect y="9" width="20" height="2" rx="1"/>
              <rect y="15" width="20" height="2" rx="1"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Stats bar */}
      <div className="bg-white border-b border-stone-100 px-6 py-3 flex gap-6 text-sm items-center shrink-0 flex-wrap">
        <span className="text-stone-500">Groups: <strong className="text-stone-800">{groups.length}</strong></span>
        <span className="text-stone-500">Members: <strong className="text-stone-800">{totalMembers}</strong></span>
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

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-white border-r border-stone-100 flex flex-col shrink-0 overflow-hidden">
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

        </aside>

        {/* Main panel */}
        <main className="flex-1 overflow-auto p-6">

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

          {/* — No selection — */}
          {!showOrphans && !showGlobalSearch && !selectedGroup && (
            <div className="flex items-center justify-center h-full text-stone-400">
              <p className="text-sm">Select a group to view members</p>
            </div>
          )}

          {/* — Loading members — */}
          {!showOrphans && !showGlobalSearch && selectedGroup && loadingMembers && (
            <div className="flex items-center justify-center h-full text-stone-400">
              <p className="text-sm">Loading…</p>
            </div>
          )}

          {/* — Group member view — */}
          {!showOrphans && !showGlobalSearch && selectedGroup && !loadingMembers && (
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
                            📣 Broadcast to all
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
                      📣 Broadcast
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
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
