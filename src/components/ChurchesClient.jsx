'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Church, Plus, X, UserPlus, Trash, Buildings, UsersThree, Link, LinkBreak } from '@phosphor-icons/react'
import {
  createChurchAction,
  assignChurchAdminAction,
  removeChurchAdminAction,
  linkGroupToChurchAction,
  searchUsersForChurchAction,
  loadUnaffiliatedGroupsAction,
} from '@/actions/admin'
import { formatDate } from '@/lib/format'

function useAnimatedMount(open, duration) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  useState(() => {})
  if (open && !mounted) { setMounted(true); setClosing(false) }
  return { mounted, closing, open: (v) => { setMounted(true); setClosing(false) }, close: () => { setClosing(true); setTimeout(() => { setMounted(false); setClosing(false) }, duration) } }
}

export default function ChurchesClient({ initialChurches }) {
  const [churches, setChurches] = useState(initialChurches ?? [])
  const [selectedChurch, setSelectedChurch] = useState(null)
  const [toast, setToast] = useState(null)
  const [isPending, startTransition] = useTransition()

  // Create church
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)

  // Assign admin
  const [showAssignAdmin, setShowAssignAdmin] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminSearch, setAdminSearch] = useState([])
  const [adminSearching, setAdminSearching] = useState(false)
  const [assigning, setAssigning] = useState(false)

  // Link group
  const [showLinkGroup, setShowLinkGroup] = useState(false)
  const [allGroups, setAllGroups] = useState(null)
  const [loadingGroups, setLoadingGroups] = useState(false)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleCreateChurch() {
    if (!createName.trim()) return
    setCreating(true)
    const r = await createChurchAction(createName)
    setCreating(false)
    if (r.error) { showToast(r.error, 'error'); return }
    setChurches(prev => [{ ...r.data, groups: [], admins: [] }, ...prev])
    setCreateName('')
    setShowCreate(false)
    showToast(`Church "${r.data.name}" created`)
  }

  async function handleAdminEmailChange(val) {
    setAdminEmail(val)
    if (val.trim().length < 3) { setAdminSearch([]); return }
    setAdminSearching(true)
    const r = await searchUsersForChurchAction(val)
    setAdminSearching(false)
    if (!r.error) setAdminSearch(r.data ?? [])
  }

  async function handleAssignAdmin(user) {
    if (!selectedChurch) return
    setAssigning(true)
    const r = await assignChurchAdminAction(selectedChurch.id, user.email)
    setAssigning(false)
    if (r.error) { showToast(r.error, 'error'); return }
    const newAdmin = { userId: r.data.userId, email: r.data.email, displayName: r.data.displayName, churchId: selectedChurch.id, role: 'admin' }
    setChurches(prev => prev.map(c => c.id === selectedChurch.id
      ? { ...c, admins: c.admins.some(a => a.userId === newAdmin.userId) ? c.admins : [...c.admins, newAdmin] }
      : c
    ))
    setSelectedChurch(prev => prev ? { ...prev, admins: prev.admins.some(a => a.userId === newAdmin.userId) ? prev.admins : [...prev.admins, newAdmin] } : prev)
    setAdminEmail('')
    setAdminSearch([])
    setShowAssignAdmin(false)
    showToast(`${r.data.displayName} assigned as church admin`)
  }

  async function handleRemoveAdmin(admin) {
    startTransition(async () => {
      const r = await removeChurchAdminAction(selectedChurch.id, admin.userId)
      if (r.error) { showToast(r.error, 'error'); return }
      setChurches(prev => prev.map(c => c.id === selectedChurch.id
        ? { ...c, admins: c.admins.filter(a => a.userId !== admin.userId) }
        : c
      ))
      setSelectedChurch(prev => prev ? { ...prev, admins: prev.admins.filter(a => a.userId !== admin.userId) } : prev)
      showToast(`Removed church admin`)
    })
  }

  async function openLinkGroups() {
    setShowLinkGroup(true)
    if (allGroups !== null) return
    setLoadingGroups(true)
    const r = await loadUnaffiliatedGroupsAction()
    setLoadingGroups(false)
    if (r.error) { showToast(r.error, 'error'); return }
    setAllGroups(r.data ?? [])
  }

  async function handleLinkGroup(group, churchId) {
    startTransition(async () => {
      const r = await linkGroupToChurchAction(group.id, churchId)
      if (r.error) { showToast(r.error, 'error'); return }
      // Update allGroups list to reflect new church affiliation
      setAllGroups(prev => prev?.map(g => g.id === group.id ? { ...g, churchId: churchId || null } : g) ?? prev)
      // Update churches list
      if (churchId) {
        setChurches(prev => prev.map(c => {
          if (c.id === churchId) return { ...c, groups: [...c.groups, { id: group.id, name: group.name, memberCount: group.memberCount }] }
          // Remove from previous church if any
          return { ...c, groups: c.groups.filter(g => g.id !== group.id) }
        }))
        if (selectedChurch?.id === churchId) {
          setSelectedChurch(prev => prev ? { ...prev, groups: [...prev.groups, { id: group.id, name: group.name, memberCount: group.memberCount }] } : prev)
        }
      } else {
        setChurches(prev => prev.map(c => ({ ...c, groups: c.groups.filter(g => g.id !== group.id) })))
        if (selectedChurch) setSelectedChurch(prev => prev ? { ...prev, groups: prev.groups.filter(g => g.id !== group.id) } : prev)
      }
      showToast(churchId ? `"${group.name}" linked to church` : `"${group.name}" unlinked`)
    })
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === 'error' ? 'bg-red-500' : 'bg-jade'}`}>
          {toast.msg}
        </div>
      )}

      {/* Sidebar — church list */}
      <aside className="w-72 bg-white border-r border-stone-100 flex flex-col shrink-0 overflow-hidden">
        <div className="p-3 border-b border-stone-100 flex items-center gap-2">
          <p className="text-sm font-semibold text-stone-700 flex-1">Churches</p>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-jade/10 text-jade hover:bg-jade/20 transition-colors"
            title="Create church"
          >
            <Plus size={16} weight="bold" />
          </button>
        </div>

        {/* Create form */}
        <AnimatePresence initial={false}>
          {showCreate && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-3 border-b border-stone-100 bg-stone-50">
                <input
                  autoFocus
                  type="text"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateChurch(); if (e.key === 'Escape') { setShowCreate(false); setCreateName('') } }}
                  placeholder="Church name…"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade/50 mb-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateChurch}
                    disabled={!createName.trim() || creating}
                    className="flex-1 py-1.5 rounded-lg bg-jade text-white text-xs font-semibold disabled:opacity-40"
                  >
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                  <button onClick={() => { setShowCreate(false); setCreateName('') }} className="px-3 py-1.5 rounded-lg text-xs text-stone-500 hover:text-stone-700">
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Church list */}
        <div className="overflow-y-auto flex-1">
          {churches.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-stone-400">
              <Church size={32} weight="thin" className="mb-2 text-stone-300" />
              <p className="text-sm">No churches yet</p>
            </div>
          )}
          {churches.map(church => (
            <div
              key={church.id}
              onClick={() => setSelectedChurch(church)}
              className={`px-4 py-3 cursor-pointer border-b border-stone-50 transition-colors ${
                selectedChurch?.id === church.id
                  ? 'bg-sunrise-50 border-l-2 border-l-jade'
                  : 'hover:bg-stone-50'
              }`}
            >
              <p className="text-sm font-medium text-stone-800 truncate">{church.name}</p>
              <p className="text-xs text-stone-400 mt-0.5">
                {church.groups.length} group{church.groups.length !== 1 ? 's' : ''}
                {' · '}{church.admins.length} admin{church.admins.length !== 1 ? 's' : ''}
                {' · '}{formatDate(church.created_at)}
              </p>
            </div>
          ))}
        </div>
      </aside>

      {/* Main panel */}
      <main className="flex-1 overflow-auto p-6">
        {!selectedChurch ? (
          <div className="flex items-center justify-center h-full text-stone-400">
            <div className="text-center">
              <Church size={40} weight="thin" className="mx-auto mb-3 text-stone-300" />
              <p className="text-sm">Select a church to manage it</p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-stone-800">{selectedChurch.name}</h2>
                <p className="text-xs text-stone-400 mt-0.5">Created {formatDate(selectedChurch.created_at)}</p>
              </div>
            </div>

            {/* Church Admins */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Church Admins</h3>
                <button
                  onClick={() => { setShowAssignAdmin(v => !v); setAdminEmail(''); setAdminSearch([]) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-jade/10 text-jade text-xs font-semibold hover:bg-jade/20 transition-colors"
                >
                  <UserPlus size={14} weight="bold" />
                  Assign Admin
                </button>
              </div>

              <AnimatePresence initial={false}>
                {showAssignAdmin && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden mb-3"
                  >
                    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4">
                      <label className="block text-xs font-semibold text-stone-500 mb-2">Search by email</label>
                      <input
                        autoFocus
                        type="email"
                        value={adminEmail}
                        onChange={e => handleAdminEmailChange(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade/50"
                      />
                      {adminSearching && <p className="text-xs text-stone-400 mt-2">Searching…</p>}
                      {adminSearch.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {adminSearch.map(u => (
                            <button
                              key={u.id}
                              onClick={() => handleAssignAdmin(u)}
                              disabled={assigning}
                              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white border border-transparent hover:border-stone-200 transition-colors text-left"
                            >
                              <div>
                                <p className="text-sm font-medium text-stone-800">{u.displayName}</p>
                                <p className="text-xs text-stone-400">{u.email}</p>
                              </div>
                              <span className="text-xs text-jade font-semibold">Assign</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {selectedChurch.admins.length === 0 ? (
                <div className="bg-white rounded-2xl border border-stone-100 py-8 text-center text-stone-400">
                  <p className="text-sm">No admins assigned yet</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden divide-y divide-stone-50">
                  {selectedChurch.admins.map(admin => (
                    <div key={admin.userId} className="flex items-center justify-between px-5 py-3.5 group">
                      <div>
                        <p className="text-sm font-medium text-stone-800">{admin.displayName}</p>
                        <p className="text-xs text-stone-400">{admin.email}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveAdmin(admin)}
                        disabled={isPending}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        title="Remove admin"
                      >
                        <Trash size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Affiliated Groups */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Affiliated Groups</h3>
                <button
                  onClick={openLinkGroups}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 text-xs font-semibold hover:bg-stone-200 transition-colors"
                >
                  <Link size={14} weight="bold" />
                  Manage Groups
                </button>
              </div>

              {selectedChurch.groups.length === 0 ? (
                <div className="bg-white rounded-2xl border border-stone-100 py-8 text-center text-stone-400">
                  <p className="text-sm">No groups affiliated yet</p>
                  <p className="text-xs mt-1">Click "Manage Groups" to link existing groups to this church</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden divide-y divide-stone-50">
                  {selectedChurch.groups.map(group => (
                    <div key={group.id} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-stone-800">{group.name}</p>
                        <p className="text-xs text-stone-400">{group.memberCount} member{group.memberCount !== 1 ? 's' : ''}</p>
                      </div>
                      <UsersThree size={16} className="text-stone-300" />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Manage Groups sheet */}
      <AnimatePresence>
        {showLinkGroup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center"
            onClick={() => setShowLinkGroup(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100">
                <h3 className="text-base font-bold text-stone-800">Manage Groups for {selectedChurch?.name}</h3>
                <button onClick={() => setShowLinkGroup(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors">
                  <X size={16} weight="bold" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-4">
                {loadingGroups && <p className="text-sm text-stone-400 text-center py-8">Loading groups…</p>}
                {!loadingGroups && allGroups?.length === 0 && <p className="text-sm text-stone-400 text-center py-8">No groups found</p>}
                {!loadingGroups && allGroups?.map(group => {
                  const isLinkedToThis = group.churchId === selectedChurch?.id
                  const isLinkedElsewhere = group.churchId && group.churchId !== selectedChurch?.id
                  const linkedChurchName = isLinkedElsewhere ? churches.find(c => c.id === group.churchId)?.name : null
                  return (
                    <div key={group.id} className="flex items-center justify-between py-3 border-b border-stone-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-stone-800">{group.name}</p>
                        <p className="text-xs text-stone-400">
                          {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
                          {isLinkedElsewhere && linkedChurchName && <span className="ml-1 text-amber-600">· linked to {linkedChurchName}</span>}
                        </p>
                      </div>
                      <button
                        onClick={() => handleLinkGroup(group, isLinkedToThis ? null : selectedChurch?.id)}
                        disabled={isPending}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                          isLinkedToThis
                            ? 'bg-red-50 text-red-500 hover:bg-red-100'
                            : 'bg-jade/10 text-jade hover:bg-jade/20'
                        }`}
                      >
                        {isLinkedToThis ? <><LinkBreak size={13} />Unlink</> : <><Link size={13} />Link</>}
                      </button>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
