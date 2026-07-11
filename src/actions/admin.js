'use server'

import { requireAuth } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { headers } from 'next/headers'

function getIp() {
  const h = headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export async function loadGroups() {
  await requireAuth()
  const { data, error } = await getSupabase()
    .from('community_groups')
    .select('id, name, created_at, profiles(count)')
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }
  const mapped = (data ?? []).map(g => ({
    id: g.id,
    name: g.name,
    created_at: g.created_at,
    member_count: g.profiles?.[0]?.count ?? 0,
  }))
  return { data: mapped }
}

export async function loadMembers(groupId) {
  await requireAuth()
  const sb = getSupabase()
  const [{ data: profiles, error: pErr }, { data: authData, error: aErr }] = await Promise.all([
    sb.from('profiles').select('*').eq('community_group_id', groupId).order('created_at'),
    sb.auth.admin.listUsers({ perPage: 1000 }),
  ])
  if (pErr || aErr) return { error: (pErr || aErr).message }

  const authMap = Object.fromEntries((authData?.users ?? []).map(u => [u.id, u]))
  const userIds = (profiles ?? []).map(p => p.user_id)

  const { data: sessionData } = await sb.rpc('admin_get_last_session', { user_ids: userIds })
  const sessionMap = Object.fromEntries((sessionData ?? []).map(s => [s.user_id, s.last_active_at]))

  return {
    data: (profiles ?? []).map(p => ({
      id: p.user_id,
      display_name: p.display_name,
      role: p.role,
      created_at: p.created_at,
      community_group_id: p.community_group_id,
      email: authMap[p.user_id]?.email ?? '',
      last_sign_in_at: authMap[p.user_id]?.last_sign_in_at ?? null,
      last_active_at: sessionMap[p.user_id] ?? null,
    })),
  }
}

export async function deleteGroupAction(groupId, groupName) {
  await requireAuth()
  const ip = getIp()
  const sb = getSupabase()
  try {
    const { data: profiles } = await sb
      .from('profiles').select('user_id').eq('community_group_id', groupId)
    const userIds = (profiles ?? []).map(p => p.user_id)

    await sb.from('reactions').delete().eq('community_group_id', groupId)
    await sb.from('messages').delete().eq('community_group_id', groupId)
    await Promise.all([
      sb.from('signups').delete().eq('community_group_id', groupId),
      sb.from('serving_signups').delete().eq('community_group_id', groupId),
      sb.from('birthdays').delete().eq('community_group_id', groupId),
    ])
    await Promise.all([
      sb.from('meal_pages').delete().eq('community_group_id', groupId),
      sb.from('serving_pages').delete().eq('community_group_id', groupId),
      sb.from('profiles').delete().eq('community_group_id', groupId),
    ])
    const failedUserReasons = []
    for (const id of userIds) {
      const { error: delErr } = await sb.auth.admin.deleteUser(id)
      if (delErr) failedUserReasons.push(delErr.message)
    }
    await sb.from('community_groups').delete().eq('id', groupId)

    await logAudit({ action: 'delete_group', targetType: 'group', targetId: groupId, targetLabel: groupName, ip })
    if (failedUserReasons.length) {
      return { success: true, warning: `Group deleted but ${failedUserReasons.length} user(s) failed to delete: ${failedUserReasons[0]}` }
    }
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}

export async function deleteUserAction(userId, userName) {
  await requireAuth()
  const ip = getIp()
  const sb = getSupabase()
  try {
    // Delete data with no ON DELETE CASCADE before removing the auth user,
    // otherwise the FK constraints on these tables will block the deletion.
    await sb.from('reactions').delete().eq('user_id', userId)
    await sb.from('messages').delete().eq('user_id', userId)
    await sb.from('birthdays').delete().eq('user_id', userId)
    await sb.from('signups').delete().eq('user_id', userId)
    await sb.from('serving_signups').delete().eq('user_id', userId)
    await sb.from('prayer_reactions').delete().eq('user_id', userId)
    const { error: delErr } = await sb.auth.admin.deleteUser(userId)
    if (delErr) return { error: delErr.message }
    await logAudit({ action: 'delete_user', targetType: 'user', targetId: userId, targetLabel: userName, ip })
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}

export async function renameGroupAction(groupId, oldName, newName) {
  await requireAuth()
  const ip = getIp()
  const { error } = await getSupabase()
    .from('community_groups').update({ name: newName }).eq('id', groupId)
  if (error) return { error: error.message }
  await logAudit({ action: 'rename_group', targetType: 'group', targetId: groupId, targetLabel: `${oldName} → ${newName}`, ip })
  return { success: true }
}

export async function editDisplayNameAction(userId, newName, oldName) {
  await requireAuth()
  const ip = getIp()
  const { error } = await getSupabase()
    .from('profiles').update({ display_name: newName }).eq('user_id', userId)
  if (error) return { error: error.message }
  await logAudit({ action: 'edit_display_name', targetType: 'user', targetId: userId, targetLabel: `${oldName} → ${newName}`, ip })
  return { success: true }
}

export async function toggleRoleAction(userId, userName, newRole) {
  await requireAuth()
  const ip = getIp()
  const { error } = await getSupabase()
    .from('profiles').update({ role: newRole }).eq('user_id', userId)
  if (error) return { error: error.message }
  await logAudit({ action: 'toggle_role', targetType: 'user', targetId: userId, targetLabel: `${userName} → ${newRole}`, ip })
  return { success: true }
}

export async function resetPasswordAction(email, userName) {
  await requireAuth()
  const ip = getIp()
  const { error } = await getSupabase().auth.resetPasswordForEmail(email)
  if (error) return { error: error.message }
  await logAudit({ action: 'password_reset', targetType: 'user', targetLabel: userName, metadata: { email }, ip })
  return { success: true }
}

export async function loadGroupDetails(groupId) {
  await requireAuth()
  const sb = getSupabase()
  const [{ data: group, error: gErr }, { data: settings }] = await Promise.all([
    sb.from('community_groups').select('invite_code').eq('id', groupId).single(),
    sb.from('group_settings')
      .select('meals_enabled, services_enabled, chat_enabled, prayer_enabled, birthdays_enabled, guide_enabled')
      .eq('group_id', groupId)
      .maybeSingle(),
  ])
  if (gErr) return { error: gErr.message }
  return {
    data: {
      invite_code: group?.invite_code ?? null,
      settings: settings ?? null,
    },
  }
}

export async function searchUsersGlobalAction(query) {
  await requireAuth()
  const sb = getSupabase()
  const q = query.trim().toLowerCase()
  if (!q) return { data: [] }

  const [{ data: authData, error: aErr }, { data: profiles, error: pErr }, { data: groups }] = await Promise.all([
    sb.auth.admin.listUsers({ perPage: 1000 }),
    sb.from('profiles').select('user_id, display_name, role, community_group_id, created_at'),
    sb.from('community_groups').select('id, name'),
  ])
  if (aErr || pErr) return { error: (aErr || pErr).message }

  const authMap = Object.fromEntries((authData?.users ?? []).map(u => [u.id, u]))
  const groupMap = Object.fromEntries((groups ?? []).map(g => [g.id, g.name]))

  const results = (profiles ?? [])
    .filter(p => {
      const email = authMap[p.user_id]?.email ?? ''
      const name = p.display_name ?? ''
      return email.toLowerCase().includes(q) || name.toLowerCase().includes(q)
    })
    .map(p => ({
      id: p.user_id,
      display_name: p.display_name,
      role: p.role,
      email: authMap[p.user_id]?.email ?? '',
      group_id: p.community_group_id,
      group_name: groupMap[p.community_group_id] ?? 'Unknown',
      created_at: p.created_at,
      last_sign_in_at: authMap[p.user_id]?.last_sign_in_at ?? null,
    }))
    .sort((a, b) => (a.group_name ?? '').localeCompare(b.group_name ?? ''))
    .slice(0, 100)

  return { data: results }
}

export async function deleteAllEmptyGroupsAction() {
  await requireAuth()
  const ip = getIp()
  const sb = getSupabase()
  try {
    const { data: groups } = await sb
      .from('community_groups')
      .select('id, name, profiles(count)')
    const empty = (groups ?? []).filter(g => (g.profiles?.[0]?.count ?? 0) === 0)
    if (!empty.length) return { success: true, count: 0 }
    await Promise.all(empty.map(g => sb.from('community_groups').delete().eq('id', g.id)))
    await logAudit({
      action: 'delete_empty_groups',
      targetType: 'group',
      targetLabel: `Deleted ${empty.length} empty group${empty.length !== 1 ? 's' : ''}`,
      ip,
    })
    return { success: true, count: empty.length }
  } catch (e) {
    return { error: e.message }
  }
}

export async function deleteAllOrphanedUsersAction(orphanIds) {
  await requireAuth()
  const ip = getIp()
  const sb = getSupabase()

  const succeeded = []
  const failedReasons = []

  for (const id of orphanIds) {
    // Clean up any data rows that may exist before removing the auth user
    await Promise.all([
      sb.from('conversation_members').delete().eq('user_id', id),
      sb.from('reactions').delete().eq('user_id', id),
      sb.from('messages').delete().eq('user_id', id),
      sb.from('birthdays').delete().eq('user_id', id),
      sb.from('signups').delete().eq('user_id', id),
      sb.from('serving_signups').delete().eq('user_id', id),
      sb.from('prayer_reactions').delete().eq('user_id', id),
      sb.from('meal_pages').delete().eq('user_id', id),
      sb.from('serving_pages').delete().eq('user_id', id),
    ])
    const { error } = await sb.auth.admin.deleteUser(id)
    if (error) {
      console.error(`deleteUser failed for ${id}:`, JSON.stringify(error))
      failedReasons.push(error.message)
    } else {
      succeeded.push(id)
    }
  }

  if (succeeded.length) {
    await logAudit({
      action: 'delete_all_orphans',
      targetType: 'user',
      targetLabel: `Deleted ${succeeded.length} orphaned account${succeeded.length !== 1 ? 's' : ''}${failedReasons.length ? `, ${failedReasons.length} failed` : ''}`,
      ip,
    })
  }

  return {
    success: true,
    count: succeeded.length,
    failedCount: failedReasons.length,
    failedReason: failedReasons[0] ?? null,
  }
}

export async function loadMetricsAction() {
  await requireAuth()
  const sb = getSupabase()
  const d7  = new Date(Date.now() - 7  * 86400000).toISOString()
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString()

  const [
    { count: totalGroups },
    { count: totalMembers },
    { count: newGroups30d },
    { count: newMembers30d },
    { count: messages7d },
    { count: messages30d },
    { data: groupsWithMembers },
  ] = await Promise.all([
    sb.from('community_groups').select('*', { count: 'exact', head: true }),
    sb.from('profiles').select('*', { count: 'exact', head: true }),
    sb.from('community_groups').select('*', { count: 'exact', head: true }).gte('created_at', d30),
    sb.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', d30),
    sb.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', d7),
    sb.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', d30),
    sb.from('community_groups').select('name, created_at, profiles(count)').order('created_at', { ascending: false }),
  ])

  const topGroups = (groupsWithMembers ?? [])
    .map(g => ({ name: g.name, members: g.profiles?.[0]?.count ?? 0, created_at: g.created_at }))
    .sort((a, b) => b.members - a.members)
    .slice(0, 8)

  return {
    totalGroups:  totalGroups  ?? 0,
    totalMembers: totalMembers ?? 0,
    newGroups30d: newGroups30d ?? 0,
    newMembers30d: newMembers30d ?? 0,
    messages7d:  messages7d  ?? 0,
    messages30d: messages30d ?? 0,
    topGroups,
  }
}

export async function loadAnnouncementsAction() {
  await requireAuth()
  const { data } = await getSupabase()
    .from('announcements')
    .select('id, message, active, created_at')
    .order('created_at', { ascending: false })
    .limit(10)
  return { data: data ?? [] }
}

export async function publishAnnouncementAction(message) {
  await requireAuth()
  const ip = getIp()
  const sb = getSupabase()
  await sb.from('announcements').update({ active: false }).eq('active', true)
  const { error } = await sb.from('announcements').insert({ message: message.trim() })
  if (error) return { error: error.message }
  await logAudit({ action: 'publish_announcement', targetType: 'all', targetLabel: message.slice(0, 80), ip })
  return { success: true }
}

export async function deactivateAnnouncementAction(id) {
  await requireAuth()
  const ip = getIp()
  const sb = getSupabase()
  const { error } = await sb.from('announcements').update({ active: false }).eq('id', id)
  if (error) return { error: error.message }
  await logAudit({ action: 'deactivate_announcement', targetId: id, ip })
  return { success: true }
}

export async function broadcastPushAction({ groupId, userIds, body }) {
  const title = 'Covey Space'
  await requireAuth()
  const ip = getIp()
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/admin-broadcast-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ group_id: groupId ?? null, user_ids: userIds ?? null, title, body, url: '/' }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { error: `Function error (${res.status}): ${text}` }
    }
    const result = await res.json()
    await logAudit({
      action: 'broadcast_push',
      targetType: userIds ? 'selected' : groupId ? 'group' : 'all',
      targetId: groupId ?? null,
      targetLabel: userIds
        ? `[${userIds.length} selected] ${body.slice(0, 60)}`
        : groupId
        ? body.slice(0, 80)
        : `[All] ${body.slice(0, 80)}`,
      metadata: { sent: result.sent, stale: result.stale },
      ip,
    })
    return { success: true, sent: result.sent ?? 0 }
  } catch (e) {
    return { error: e.message }
  }
}

export async function loadOrphanedUsers() {
  await requireAuth()
  const sb = getSupabase()
  const [{ data: authData, error: aErr }, { data: profiles, error: pErr }] = await Promise.all([
    sb.auth.admin.listUsers({ perPage: 1000 }),
    sb.from('profiles').select('user_id'),
  ])
  if (aErr || pErr) return { error: (aErr || pErr).message }
  const profileSet = new Set((profiles ?? []).map(p => p.user_id))
  const orphans = (authData?.users ?? [])
    .filter(u => !profileSet.has(u.id))
    .map(u => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return { data: orphans }
}

export async function loadAuditLog() {
  await requireAuth()
  const { data, error } = await getSupabase()
    .from('admin_audit_log')
    .select('*')
    .order('performed_at', { ascending: false })
    .limit(200)
  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
}
