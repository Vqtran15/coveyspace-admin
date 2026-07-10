'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import {
  loadMembers,
  loadOrphanedUsers,
  deleteGroupAction,
  deleteUserAction,
  renameGroupAction,
  editDisplayNameAction,
  toggleRoleAction,
  resetPasswordAction,
} from '@/actions/admin'
import { logoutAction } from '@/actions/auth'

function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
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

function ConfirmModal({ message, onConfirm, onCancel, danger = false }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <p className="text-sm text-stone-700 mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
          >
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

export default function DashboardClient({ initialGroups }) {
  const [groups, setGroups] = useState(initialGroups)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [orphanedUsers, setOrphanedUsers] = useState(null) // null = not yet loaded
  const [loadingOrphans, setLoadingOrphans] = useState(false)
  const [showOrphans, setShowOrphans] = useState(false)
  const [search, setSearch] = useState('')
  const [confirm, setConfirm] = useState(null) // { message, onConfirm, danger }
  const [toast, setToast] = useState(null)
  const [isPending, startTransition] = useTransition()

  // Inline editing state
  const [editingName, setEditingName] = useState(null) // { id, value, type: 'group'|'user' }
  const [renaming, setRenaming] = useState(false)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function selectGroup(group) {
    setShowOrphans(false)
    setSelectedGroup(group)
    setSearch('')
    setLoadingMembers(true)
    const { data } = await loadMembers(group.id)
    setMembers(data || [])
    setLoadingMembers(false)
  }

  async function handleSelectOrphans() {
    setSelectedGroup(null)
    setMembers([])
    setSearch('')
    setShowOrphans(true)
    if (orphanedUsers !== null) return
    setLoadingOrphans(true)
    const { data, error } = await loadOrphanedUsers()
    if (error) showToast(error, 'error')
    else setOrphanedUsers(data || [])
    setLoadingOrphans(false)
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

  function ask(message, onConfirm, danger = false) {
    setConfirm({ message, onConfirm, danger })
  }

  // Stats
  const totalMembers = groups.reduce((s, g) => s + (g.member_count || 0), 0)
  const emptyGroups = groups.filter(g => (g.member_count || 0) === 0).length
  const adminCount = members.filter(m => m.role === 'admin').length

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!search) return groups
    const q = search.toLowerCase()
    return groups.filter(g => g.name?.toLowerCase().includes(q))
  }, [groups, search, selectedGroup])

  // Filtered members
  const filteredMembers = useMemo(() => {
    if (!search || selectedGroup) return members
    return members
  }, [members, search])

  const displayedMembers = useMemo(() => {
    if (!search) return members
    const q = search.toLowerCase()
    return members.filter(m =>
      m.display_name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q)
    )
  }, [members, search])

  // --- Actions ---
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
          showToast(`Deleted group "${group.name}"`)
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
    <div className="min-h-screen bg-sunrise-50 flex flex-col">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-jade'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Confirm modal */}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
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
        <div className="flex items-center gap-3">
          <Link href="/audit" className="text-sm text-stone-300 hover:text-white transition-colors">
            Audit log
          </Link>
          <button
            onClick={() => logoutAction()}
            className="text-sm bg-stone-800 hover:bg-stone-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Stats bar */}
      <div className="bg-white border-b border-stone-100 px-6 py-3 flex gap-6 text-sm shrink-0">
        <span className="text-stone-500">Groups: <strong className="text-stone-800">{groups.length}</strong></span>
        <span className="text-stone-500">Members: <strong className="text-stone-800">{totalMembers}</strong></span>
        {emptyGroups > 0 && (
          <span className="text-amber-600">Empty groups: <strong>{emptyGroups}</strong></span>
        )}
        {selectedGroup && (
          <>
            <span className="text-stone-300">|</span>
            <span className="text-stone-500">
              Viewing: <strong className="text-jade">{selectedGroup.name}</strong>
              {' · '}Admins: <strong className="text-stone-800">{adminCount}</strong>
            </span>
          </>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — groups */}
        <aside className="w-72 bg-white border-r border-stone-100 flex flex-col shrink-0 overflow-hidden">
          <div className="p-3 border-b border-stone-100">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search groups or members…"
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
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); startRename(group.id, group.name, 'group') }}
                    className="px-2 py-0.5 rounded-md text-xs font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors"
                  >Rename</button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteGroup(group) }}
                    className="px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                  >Delete</button>
                </div>
              </div>
            ))}
          </div>

          {/* Orphaned users entry */}
          <div className="border-t border-stone-100 p-3 shrink-0">
            <button
              onClick={handleSelectOrphans}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                showOrphans ? 'bg-amber-50 text-amber-700' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              <span className="font-medium">Orphaned Users</span>
              {orphanedUsers !== null && (
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                  orphanedUsers.length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-stone-100 text-stone-400'
                }`}>
                  {orphanedUsers.length}
                </span>
              )}
            </button>
          </div>
        </aside>

        {/* Main — members / orphans */}
        <main className="flex-1 overflow-auto p-6">
          {showOrphans ? (
            <div className="max-w-6xl mx-auto">
              <div className="mb-4">
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
          ) : !selectedGroup ? (
            <div className="flex items-center justify-center h-full text-stone-400">
              <p className="text-sm">Select a group to view members</p>
            </div>
          ) : loadingMembers ? (
            <div className="flex items-center justify-center h-full text-stone-400">
              <p className="text-sm">Loading…</p>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-stone-800">
                  {selectedGroup.name}
                  <span className="ml-2 text-sm font-normal text-stone-400">
                    {members.length} member{members.length !== 1 ? 's' : ''}
                  </span>
                </h2>
              </div>

              {displayedMembers.length === 0 ? (
                <div className="bg-white rounded-2xl border border-stone-100 py-12 text-center text-stone-400">
                  <p className="text-sm">{search ? 'No matching members' : 'No members in this group'}</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b border-stone-100 bg-stone-50">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Name</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Email</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Role</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Last Activity</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Last Logged In</th>
                        <th className="px-5 py-3 w-56"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {displayedMembers.map(member => (
                        <tr key={member.id} className="hover:bg-stone-50 transition-colors group">
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
                          <td className="px-5 py-3">
                            <Badge role={member.role} />
                          </td>
                          <td className="px-5 py-3 text-xs text-stone-400 whitespace-nowrap">
                            {formatTime(member.last_active_at)}
                          </td>
                          <td className="px-5 py-3 text-xs text-stone-400 whitespace-nowrap">
                            {formatTime(member.last_sign_in_at)}
                          </td>
                          <td className="px-5 py-3 w-56">
                            <div className="flex flex-nowrap items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleToggleRole(member)}
                                className="px-2 py-0.5 rounded-md text-xs font-medium bg-jade/10 text-jade hover:bg-jade/20 transition-colors"
                              >
                                {member.role === 'admin' ? 'Demote' : 'Promote'}
                              </button>
                              <button
                                onClick={() => handlePasswordReset(member)}
                                className="px-2 py-0.5 rounded-md text-xs font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors"
                              >
                                Reset
                              </button>
                              <button
                                onClick={() => handleDeleteUser(member)}
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
        </main>
      </div>
    </div>
  )
}
