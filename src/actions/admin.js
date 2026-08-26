'use server'

import { requireAuth } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { headers } from 'next/headers'

async function getIp() {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

async function listAllUsers(sb) {
  const users = []
  let page = 1
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return { users: null, error }
    users.push(...(data.users ?? []))
    if (!data.nextPage) break
    page = data.nextPage
  }
  return { users, error: null }
}

export async function loadGroups() {
  await requireAuth()
  const { data, error } = await getSupabase()
    .from('community_groups')
    .select('id, name, created_at, scheduled_delete_at, group_memberships(count)')
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }
  const mapped = (data ?? []).map(g => ({
    id: g.id,
    name: g.name,
    created_at: g.created_at,
    member_count: g.group_memberships?.[0]?.count ?? 0,
    scheduledDeleteAt: g.scheduled_delete_at ?? null,
  }))
  return { data: mapped }
}

export async function loadMembers(groupId) {
  await requireAuth()
  const sb = getSupabase()

  // Use group_memberships as the source of truth for who belongs to a group.
  // profiles.community_group_id only reflects the user's active group, so it
  // misses users who joined this group but haven't switched to it yet, and
  // incorrectly hides users who have since switched their active group away.
  const [{ data: memberships, error: mErr }, { users: authUsers, error: aErr }, { data: pushSubs }] = await Promise.all([
    sb.from('group_memberships').select('user_id, role, joined_at').eq('community_group_id', groupId).order('joined_at'),
    listAllUsers(sb),
    sb.from('push_subscriptions').select('user_id').eq('community_group_id', groupId),
  ])
  if (mErr || aErr) return { error: (mErr || aErr).message }

  const userIds = (memberships ?? []).map(m => m.user_id)
  if (!userIds.length) return { data: [] }

  const { data: profiles } = await sb.from('profiles').select('*').in('user_id', userIds)

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]))
  const membershipMap = Object.fromEntries((memberships ?? []).map(m => [m.user_id, m]))
  const authMap = Object.fromEntries((authUsers ?? []).map(u => [u.id, u]))
  const pushSubSet = new Set((pushSubs ?? []).map(s => s.user_id))

  const { data: sessionData } = await sb.rpc('admin_get_last_session', { user_ids: userIds })
  const sessionMap = Object.fromEntries((sessionData ?? []).map(s => [s.user_id, s.last_active_at]))

  return {
    data: userIds.map(userId => {
      const p = profileMap[userId] ?? {}
      const m = membershipMap[userId] ?? {}
      return {
        id: userId,
        display_name: p.display_name,
        role: m.role,  // role for THIS group, not the user's current active group
        created_at: m.joined_at,
        community_group_id: groupId,
        email: authMap[userId]?.email ?? '',
        last_sign_in_at: authMap[userId]?.last_sign_in_at ?? null,
        last_active_at: sessionMap[userId] ?? null,
        push_subscribed: pushSubSet.has(userId),
        is_pwa: p.is_pwa ?? false,
        scheduled_delete_at: p.scheduled_delete_at ?? null,
      }
    }),
  }
}

export async function executeGroupDeleteAction(groupId, groupName) {
  await requireAuth()
  const ip = await getIp()
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
      sb.from('prayer_requests').delete().eq('community_group_id', groupId),
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

export async function deleteGroupAction(groupId, groupName) {
  await requireAuth()
  const ip = await getIp()
  const sb = getSupabase()
  try {
    const scheduledAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    const { data, error } = await sb
      .from('community_groups')
      .update({ scheduled_delete_at: scheduledAt })
      .eq('id', groupId)
      .select('scheduled_delete_at')
      .single()
    if (error) return { error: error.message }
    await logAudit({ action: 'schedule_delete_group', targetType: 'group', targetId: groupId, targetLabel: groupName, ip })
    return { success: true, scheduled_delete_at: data.scheduled_delete_at }
  } catch (e) {
    return { error: e.message }
  }
}

export async function cancelGroupDeleteAction(groupId, groupName) {
  await requireAuth()
  const ip = await getIp()
  const sb = getSupabase()
  try {
    const { error } = await sb
      .from('community_groups')
      .update({ scheduled_delete_at: null })
      .eq('id', groupId)
    if (error) return { error: error.message }
    await logAudit({ action: 'cancel_delete_group', targetType: 'group', targetId: groupId, targetLabel: groupName, ip })
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}

export async function executeUserDeleteAction(userId, userName) {
  await requireAuth()
  const ip = await getIp()
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

export async function deleteUserAction(userId, userName) {
  await requireAuth()
  const ip = await getIp()
  const sb = getSupabase()
  try {
    const scheduledAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    const { data, error } = await sb
      .from('profiles')
      .update({ scheduled_delete_at: scheduledAt })
      .eq('user_id', userId)
      .select('scheduled_delete_at')
      .single()
    if (error) return { error: error.message }
    await logAudit({ action: 'schedule_delete_user', targetType: 'user', targetId: userId, targetLabel: userName, ip })
    return { success: true, scheduled_delete_at: data.scheduled_delete_at }
  } catch (e) {
    return { error: e.message }
  }
}

export async function cancelUserDeleteAction(userId, userName) {
  await requireAuth()
  const ip = await getIp()
  const sb = getSupabase()
  try {
    const { error } = await sb
      .from('profiles')
      .update({ scheduled_delete_at: null })
      .eq('user_id', userId)
    if (error) return { error: error.message }
    await logAudit({ action: 'cancel_delete_user', targetType: 'user', targetId: userId, targetLabel: userName, ip })
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}

export async function processPendingDeletionsAction() {
  await requireAuth()
  const sb = getSupabase()
  const now = new Date().toISOString()
  const results = []

  try {
    const [{ data: expiredGroups }, { data: expiredProfiles }] = await Promise.all([
      sb.from('community_groups').select('id, name').lt('scheduled_delete_at', now).not('scheduled_delete_at', 'is', null),
      sb.from('profiles').select('user_id, display_name').lt('scheduled_delete_at', now).not('scheduled_delete_at', 'is', null),
    ])

    for (const g of expiredGroups ?? []) {
      const r = await executeGroupDeleteAction(g.id, g.name)
      results.push({ type: 'group', id: g.id, name: g.name, ...r })
    }

    for (const p of expiredProfiles ?? []) {
      const r = await executeUserDeleteAction(p.user_id, p.display_name)
      results.push({ type: 'user', id: p.user_id, name: p.display_name, ...r })
    }
  } catch (e) {
    return { error: e.message, results }
  }

  return { results }
}

export async function renameGroupAction(groupId, oldName, newName) {
  await requireAuth()
  const ip = await getIp()
  const { error } = await getSupabase()
    .from('community_groups').update({ name: newName }).eq('id', groupId)
  if (error) return { error: error.message }
  await logAudit({ action: 'rename_group', targetType: 'group', targetId: groupId, targetLabel: `${oldName} → ${newName}`, ip })
  return { success: true }
}

export async function editDisplayNameAction(userId, newName, oldName) {
  await requireAuth()
  const ip = await getIp()
  const { error } = await getSupabase()
    .from('profiles').update({ display_name: newName }).eq('user_id', userId)
  if (error) return { error: error.message }
  await logAudit({ action: 'edit_display_name', targetType: 'user', targetId: userId, targetLabel: `${oldName} → ${newName}`, ip })
  return { success: true }
}

export async function toggleRoleAction(userId, userName, newRole) {
  await requireAuth()
  const ip = await getIp()
  const { error } = await getSupabase()
    .from('profiles').update({ role: newRole }).eq('user_id', userId)
  if (error) return { error: error.message }
  await logAudit({ action: 'toggle_role', targetType: 'user', targetId: userId, targetLabel: `${userName} → ${newRole}`, ip })
  return { success: true }
}

export async function resetPasswordAction(email, userName) {
  await requireAuth()
  const ip = await getIp()
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
      .select('meals_enabled, services_enabled, chat_enabled, prayer_enabled, birthdays_enabled, guide_enabled, giving_enabled')
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

  const [{ users: authUsers, error: aErr }, { data: profiles, error: pErr }, { data: groups }] = await Promise.all([
    listAllUsers(sb),
    sb.from('profiles').select('user_id, display_name, role, community_group_id, created_at'),
    sb.from('community_groups').select('id, name'),
  ])
  if (aErr || pErr) return { error: (aErr || pErr).message }

  const authMap = Object.fromEntries((authUsers ?? []).map(u => [u.id, u]))
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

export async function loadAllUsersGlobalAction() {
  await requireAuth()
  const sb = getSupabase()
  const [{ users: authUsers, error: aErr }, { data: profiles, error: pErr }, { data: groups }, { data: memberships }] = await Promise.all([
    listAllUsers(sb),
    sb.from('profiles').select('user_id, display_name, role, community_group_id, created_at'),
    sb.from('community_groups').select('id, name, church_id, churches(name)'),
    sb.from('group_memberships').select('user_id, community_group_id'),
  ])
  if (aErr || pErr) return { error: (aErr || pErr).message }
  const userIds = (profiles ?? []).map(p => p.user_id)
  const { data: sessionData } = await sb.rpc('admin_get_last_session', { user_ids: userIds })
  const sessionMap = Object.fromEntries((sessionData ?? []).map(s => [s.user_id, s.last_active_at]))
  const authMap = Object.fromEntries((authUsers ?? []).map(u => [u.id, u]))
  const groupMap = Object.fromEntries((groups ?? []).map(g => [g.id, { name: g.name, church_name: g.churches?.name ?? null }]))

  // Build per-user all-groups list from group_memberships (source of truth)
  const userGroupsMap = {}
  for (const m of memberships ?? []) {
    if (!userGroupsMap[m.user_id]) userGroupsMap[m.user_id] = []
    const info = groupMap[m.community_group_id]
    if (info) userGroupsMap[m.user_id].push({ group_id: m.community_group_id, group_name: info.name, church_name: info.church_name })
  }

  const results = (profiles ?? [])
    .map(p => {
      const activeInfo = groupMap[p.community_group_id]
      const allGroups = userGroupsMap[p.user_id] ?? (activeInfo ? [{ group_id: p.community_group_id, group_name: activeInfo.name, church_name: activeInfo.church_name }] : [])
      return {
        id: p.user_id,
        display_name: p.display_name,
        role: p.role,
        email: authMap[p.user_id]?.email ?? '',
        group_id: p.community_group_id,
        group_name: activeInfo?.name ?? 'Unknown',
        all_groups: allGroups,
        created_at: p.created_at,
        last_active_at: sessionMap[p.user_id] ?? null,
        last_sign_in_at: authMap[p.user_id]?.last_sign_in_at ?? null,
      }
    })
    .sort((a, b) => (a.group_name ?? '').localeCompare(b.group_name ?? ''))
  return { data: results }
}

export async function deleteAllEmptyGroupsAction() {
  await requireAuth()
  const ip = await getIp()
  const sb = getSupabase()
  try {
    const { data: groups } = await sb
      .from('community_groups')
      .select('id, name, group_memberships(count)')
    const empty = (groups ?? []).filter(g => (g.group_memberships?.[0]?.count ?? 0) === 0)
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
  const ip = await getIp()
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

export async function loadMetricsAction({ periodStart, periodEnd } = {}) {
  await requireAuth()
  const sb = getSupabase()
  const start = periodStart ?? new Date(Date.now() - 30 * 86400000).toISOString()
  const end   = periodEnd   ?? new Date().toISOString()

  const [
    { count: totalGroups },
    { count: totalMembers },
    { count: newGroupsInPeriod },
    { count: newMembersInPeriod },
    { count: messagesInPeriod },
    { data: groupsWithMembers },
    { data: convData },
    { data: profilesData },
    { data: prayerRequestsData },
    { data: prayerReactionsData },
    { data: signupsData },
    { data: mealPagesData },
    { data: servingSignupsData },
    { data: servingPagesData },
  ] = await Promise.all([
    sb.from('community_groups').select('*', { count: 'exact', head: true }),
    sb.from('profiles').select('*', { count: 'exact', head: true }),
    sb.from('community_groups').select('*', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end),
    sb.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end),
    sb.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end),
    sb.from('community_groups').select('id, name, created_at, scheduled_delete_at, group_memberships(count)').order('created_at', { ascending: false }),
    sb.from('conversations').select('community_group_id, updated_at, messages(count)'),
    sb.from('profiles').select('user_id, community_group_id, last_seen_at'),
    sb.from('prayer_requests').select('member_user_id, created_at'),
    sb.from('prayer_reactions').select('community_group_id, created_at'),
    sb.from('signups').select('meal_page_id, created_at'),
    sb.from('meal_pages').select('id, community_group_id'),
    sb.from('serving_signups').select('serving_page_id, created_at'),
    sb.from('serving_pages').select('id, community_group_id'),
  ])

  // Build per-group stats keyed by group id
  const statsMap = {}
  for (const g of groupsWithMembers ?? []) {
    statsMap[g.id] = {
      name: g.name,
      members: g.group_memberships?.[0]?.count ?? 0,
      messages: 0,
      lastActivity: null,
      lastSeen: null,
      activeMembers: 0,
      scheduledDeleteAt: g.scheduled_delete_at ?? null,
    }
  }

  const userGroupMap = Object.fromEntries((profilesData ?? []).map(p => [p.user_id, p.community_group_id]))
  const mealPageGroupMap = Object.fromEntries((mealPagesData ?? []).map(p => [p.id, p.community_group_id]))
  const servingPageGroupMap = Object.fromEntries((servingPagesData ?? []).map(p => [p.id, p.community_group_id]))

  function bumpActivity(s, ts) {
    if (s && ts && (!s.lastActivity || ts > s.lastActivity)) s.lastActivity = ts
  }

  for (const conv of convData ?? []) {
    const s = statsMap[conv.community_group_id]
    if (!s) continue
    s.messages += conv.messages?.[0]?.count ?? 0
    bumpActivity(s, conv.updated_at)
  }
  for (const pr of prayerRequestsData ?? []) {
    bumpActivity(statsMap[userGroupMap[pr.member_user_id]], pr.created_at)
  }
  for (const rx of prayerReactionsData ?? []) {
    bumpActivity(statsMap[rx.community_group_id], rx.created_at)
  }
  for (const su of signupsData ?? []) {
    bumpActivity(statsMap[mealPageGroupMap[su.meal_page_id]], su.created_at)
  }
  for (const su of servingSignupsData ?? []) {
    bumpActivity(statsMap[servingPageGroupMap[su.serving_page_id]], su.created_at)
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  for (const p of profilesData ?? []) {
    const s = statsMap[p.community_group_id]
    if (!s) continue
    if (p.last_seen_at) {
      if (!s.lastSeen || p.last_seen_at > s.lastSeen) s.lastSeen = p.last_seen_at
      if (p.last_seen_at >= thirtyDaysAgo) s.activeMembers++
    }
  }
  const groupStats = Object.values(statsMap)

  return {
    data: {
      totalGroups:        totalGroups        ?? 0,
      totalMembers:       totalMembers       ?? 0,
      newGroupsInPeriod:  newGroupsInPeriod  ?? 0,
      newMembersInPeriod: newMembersInPeriod ?? 0,
      messagesInPeriod:   messagesInPeriod   ?? 0,
      groupStats,
    }
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
  const ip = await getIp()
  const sb = getSupabase()
  await sb.from('announcements').update({ active: false }).eq('active', true)
  const { error } = await sb.from('announcements').insert({ message: message.trim() })
  if (error) return { error: error.message }
  await logAudit({ action: 'publish_announcement', targetType: 'all', targetLabel: message.slice(0, 80), ip })
  return { success: true }
}

export async function deactivateAnnouncementAction(id) {
  await requireAuth()
  const ip = await getIp()
  const sb = getSupabase()
  const { error } = await sb.from('announcements').update({ active: false }).eq('id', id)
  if (error) return { error: error.message }
  await logAudit({ action: 'deactivate_announcement', targetId: id, ip })
  return { success: true }
}

export async function broadcastPushAction({ groupId, userIds, title: rawTitle, body }) {
  const title = rawTitle?.trim() || 'Covey Space'
  await requireAuth()
  const ip = await getIp()
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
      metadata: { title: rawTitle?.trim() || null, body, sent: result.sent, stale: result.stale },
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
  const [{ users: authUsers, error: aErr }, { data: profiles, error: pErr }] = await Promise.all([
    listAllUsers(sb),
    sb.from('profiles').select('user_id'),
  ])
  if (aErr || pErr) return { error: (aErr || pErr).message }
  const profileSet = new Set((profiles ?? []).map(p => p.user_id))
  const orphans = (authUsers ?? [])
    .filter(u => !profileSet.has(u.id))
    .map(u => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return { data: orphans }
}

export async function loadGroupBroadcastHistoryAction(groupId, { limit = 50 } = {}) {
  await requireAuth()
  const { data, error } = await getSupabase()
    .from('admin_audit_log')
    .select('id, performed_at, target_label, metadata')
    .eq('action', 'broadcast_push')
    .eq('target_type', 'group')
    .eq('target_id', groupId)
    .order('performed_at', { ascending: false })
    .limit(limit)
  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
}

export async function loadBroadcastHistoryAction({ limit = 30 } = {}) {
  await requireAuth()
  const { data, error } = await getSupabase()
    .from('admin_audit_log')
    .select('id, performed_at, target_label, metadata')
    .eq('action', 'broadcast_push')
    .eq('target_type', 'all')
    .order('performed_at', { ascending: false })
    .limit(limit)
  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
}

export async function broadcastAdminsPushAction({ title: rawTitle, body }) {
  const title = rawTitle?.trim() || 'Covey Space'
  await requireAuth()
  const ip = await getIp()
  const sb = getSupabase()
  try {
    const { data: adminProfiles, error: pErr } = await sb
      .from('profiles')
      .select('user_id')
      .eq('role', 'admin')
    if (pErr) return { error: pErr.message }
    const userIds = (adminProfiles ?? []).map(p => p.user_id)
    if (!userIds.length) return { error: 'No admin users found' }

    const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/admin-broadcast-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ user_ids: userIds, title, body, url: '/' }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { error: `Function error (${res.status}): ${text}` }
    }
    const result = await res.json()
    await logAudit({
      action: 'broadcast_push',
      targetType: 'admins',
      targetLabel: `[Admins] ${body.slice(0, 80)}`,
      metadata: { title: rawTitle?.trim() || null, body, sent: result.sent, stale: result.stale, admin_count: userIds.length },
      ip,
    })
    return { success: true, sent: result.sent ?? 0, adminCount: userIds.length }
  } catch (e) {
    return { error: e.message }
  }
}

export async function loadAdminsBroadcastHistoryAction({ limit = 30 } = {}) {
  await requireAuth()
  const { data, error } = await getSupabase()
    .from('admin_audit_log')
    .select('id, performed_at, target_label, metadata')
    .eq('action', 'broadcast_push')
    .eq('target_type', 'admins')
    .order('performed_at', { ascending: false })
    .limit(limit)
  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
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

export async function loadGroupMessagesAction(groupId, { limit = 50, offset = 0 } = {}) {
  await requireAuth()
  const { data, error } = await getSupabase()
    .from('messages')
    .select('id, body, display_name, image_url, created_at')
    .eq('community_group_id', groupId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) return { error: error.message }
  return { data: data ?? [] }
}

export async function loadClientErrorsAction({ limit = 50, offset = 0, includeResolved = false } = {}) {
  await requireAuth()
  const sb = getSupabase()
  let q = sb
    .from('client_errors')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (!includeResolved) q = q.is('resolved_at', null)
  const { data, error, count } = await q
  if (error) return { error: error.message }
  return { data: data ?? [], total: count ?? 0 }
}

export async function resolveErrorAction(id) {
  await requireAuth()
  const { error } = await getSupabase()
    .from('client_errors')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function resolveAllErrorsAction() {
  await requireAuth()
  const { error } = await getSupabase()
    .from('client_errors')
    .update({ resolved_at: new Date().toISOString() })
    .is('resolved_at', null)
  if (error) return { error: error.message }
  return { success: true }
}

export async function loadGroupActivityAction(groupId) {
  await requireAuth()
  const sb = getSupabase()
  const [mealsRes, servicesRes, birthdaysRes, prayerRes] = await Promise.all([
    sb.from('meal_pages')
      .select('id, title, week_date, slot_dishes, slot_count, is_paused, created_at')
      .eq('community_group_id', groupId)
      .eq('is_sample', false)
      .order('week_date', { ascending: false })
      .limit(50),
    sb.from('serving_pages')
      .select('id, title, week_date, slot_dishes, slot_count, is_paused, created_at')
      .eq('community_group_id', groupId)
      .eq('is_sample', false)
      .order('week_date', { ascending: false })
      .limit(50),
    sb.from('birthdays')
      .select('id, name, birthday, created_at')
      .eq('community_group_id', groupId)
      .eq('is_sample', false)
      .order('birthday')
      .limit(100),
    sb.from('prayer_requests')
      .select('id, added_by, request, date, created_at')
      .eq('community_group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  return {
    data: {
      meals:     mealsRes.data    ?? [],
      services:  servicesRes.data ?? [],
      birthdays: birthdaysRes.data ?? [],
      prayers:   prayerRes.error ? [] : (prayerRes.data ?? []),
      prayerError: prayerRes.error?.message ?? null,
    },
  }
}

// ─── Church actions ───────────────────────────────────────────────────────────

export async function loadChurchesAction() {
  await requireAuth()
  const sb = getSupabase()
  const { data: churches, error } = await sb
    .from('churches')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }

  // For each church, get affiliated groups and assigned admins
  const churchIds = (churches ?? []).map(c => c.id)
  if (!churchIds.length) return { data: [] }

  const [{ data: groups }, { data: roles }, { users: authUsers }] = await Promise.all([
    sb.from('community_groups')
      .select('id, name, church_id, group_memberships(count)')
      .in('church_id', churchIds),
    sb.from('church_roles')
      .select('user_id, church_id, role'),
    listAllUsers(sb),
  ])

  const authMap = Object.fromEntries((authUsers ?? []).map(u => [u.id, u]))

  // Enrich admins with email/display name
  const adminUserIds = [...new Set((roles ?? []).map(r => r.user_id))]
  const { data: adminProfiles } = adminUserIds.length
    ? await sb.from('profiles').select('user_id, display_name, community_group_id').in('user_id', adminUserIds)
    : { data: [] }
  const profileMap = Object.fromEntries((adminProfiles ?? []).map(p => [p.user_id, p]))

  const enrichedAdmins = (roles ?? []).map(r => ({
    userId: r.user_id,
    churchId: r.church_id,
    role: r.role,
    displayName: profileMap[r.user_id]?.display_name ?? '—',
    email: authMap[r.user_id]?.email ?? '—',
  }))

  return {
    data: (churches ?? []).map(c => ({
      id: c.id,
      name: c.name,
      created_at: c.created_at,
      groups: (groups ?? [])
        .filter(g => g.church_id === c.id)
        .map(g => ({ id: g.id, name: g.name, memberCount: g.group_memberships?.[0]?.count ?? 0 })),
      admins: enrichedAdmins.filter(a => a.churchId === c.id),
    })),
  }
}

export async function createChurchAction(name) {
  await requireAuth()
  const ip = await getIp()
  const sb = getSupabase()
  const trimmed = name?.trim()
  if (!trimmed) return { error: 'Church name is required' }

  const { data, error } = await sb
    .from('churches')
    .insert({ name: trimmed })
    .select('id, name, created_at')
    .single()
  if (error) return { error: error.message }

  await logAudit({ action: 'create_church', targetType: 'church', targetId: data.id, targetLabel: trimmed, ip })
  return { data }
}

export async function assignChurchAdminAction(churchId, userEmail) {
  await requireAuth()
  const ip = await getIp()
  const sb = getSupabase()

  // Find user by email via auth admin API
  const { users, error: listErr } = await listAllUsers(sb)
  if (listErr) return { error: listErr.message }
  const user = users.find(u => u.email?.toLowerCase() === userEmail.trim().toLowerCase())
  if (!user) return { error: `No user found with email "${userEmail}"` }

  const { error } = await sb
    .from('church_roles')
    .upsert({ user_id: user.id, church_id: churchId, role: 'admin' }, { onConflict: 'user_id,church_id' })
  if (error) return { error: error.message }

  // Get display name for audit log
  const { data: profile } = await sb.from('profiles').select('display_name').eq('user_id', user.id).single()
  await logAudit({ action: 'assign_church_admin', targetType: 'church', targetId: churchId, targetLabel: profile?.display_name ?? userEmail, ip })
  return { data: { userId: user.id, email: user.email, displayName: profile?.display_name ?? '—' } }
}

export async function removeChurchAdminAction(churchId, userId) {
  await requireAuth()
  const ip = await getIp()
  const sb = getSupabase()

  const { error } = await sb
    .from('church_roles')
    .delete()
    .eq('church_id', churchId)
    .eq('user_id', userId)
  if (error) return { error: error.message }

  await logAudit({ action: 'remove_church_admin', targetType: 'church', targetId: churchId, targetLabel: userId, ip })
  return { success: true }
}

export async function linkGroupToChurchAction(groupId, churchId) {
  await requireAuth()
  const ip = await getIp()
  const sb = getSupabase()

  const { error } = await sb
    .from('community_groups')
    .update({ church_id: churchId || null })
    .eq('id', groupId)
  if (error) return { error: error.message }

  await logAudit({ action: churchId ? 'link_group_to_church' : 'unlink_group_from_church', targetType: 'group', targetId: groupId, targetLabel: groupId, ip })
  return { success: true }
}

export async function searchUsersForChurchAction(query) {
  await requireAuth()
  const sb = getSupabase()
  const { users, error } = await listAllUsers(sb)
  if (error) return { error: error.message }

  const q = query.trim().toLowerCase()
  if (!q) return { data: [] }

  const matched = users.filter(u =>
    u.email?.toLowerCase().includes(q)
  ).slice(0, 10)

  const matchedIds = matched.map(u => u.id)
  const { data: profiles } = matchedIds.length
    ? await sb.from('profiles').select('user_id, display_name').in('user_id', matchedIds)
    : { data: [] }
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]))

  return {
    data: matched.map(u => ({
      id: u.id,
      email: u.email,
      displayName: profileMap[u.id]?.display_name ?? '—',
    })),
  }
}

export async function loadUnaffiliatedGroupsAction() {
  await requireAuth()
  const sb = getSupabase()
  const { data, error } = await sb
    .from('community_groups')
    .select('id, name, church_id, group_memberships(count)')
    .order('name')
  if (error) return { error: error.message }
  return {
    data: (data ?? []).map(g => ({
      id: g.id,
      name: g.name,
      churchId: g.church_id ?? null,
      memberCount: g.group_memberships?.[0]?.count ?? 0,
    })),
  }
}
