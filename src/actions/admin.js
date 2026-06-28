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
    await Promise.all(userIds.map(id => sb.auth.admin.deleteUser(id)))
    await sb.from('community_groups').delete().eq('id', groupId)

    await logAudit({ action: 'delete_group', targetType: 'group', targetId: groupId, targetLabel: groupName, ip })
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
    await sb.from('reactions').delete().eq('user_id', userId)
    await sb.from('messages').delete().eq('user_id', userId)
    await sb.auth.admin.deleteUser(userId)
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
