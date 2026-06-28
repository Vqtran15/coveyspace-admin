import { getSupabase } from './supabase'

const MAX_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

function windowStart() {
  return new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000).toISOString()
}

export async function checkRateLimit(ip) {
  const { count } = await getSupabase()
    .from('admin_login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .gte('attempted_at', windowStart())
  const attempts = count ?? 0
  return { locked: attempts >= MAX_ATTEMPTS, attempts }
}

export async function recordFailedAttempt(ip) {
  await getSupabase().from('admin_login_attempts').insert({ ip_address: ip })
  const { count } = await getSupabase()
    .from('admin_login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .gte('attempted_at', windowStart())
  const attempts = count ?? 0
  return { remaining: Math.max(0, MAX_ATTEMPTS - attempts) }
}

export async function clearAttempts(ip) {
  await getSupabase().from('admin_login_attempts').delete().eq('ip_address', ip)
}
