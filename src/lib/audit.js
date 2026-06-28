import { getSupabase } from './supabase'

export async function logAudit({ action, targetType, targetId, targetLabel, metadata, ip }) {
  try {
    await getSupabase().from('admin_audit_log').insert({
      action,
      target_type: targetType ?? null,
      target_id: targetId ? String(targetId) : null,
      target_label: targetLabel ?? null,
      metadata: metadata ?? null,
      ip_address: ip ?? null,
    })
  } catch {
    // Never let audit logging break the main operation
  }
}
