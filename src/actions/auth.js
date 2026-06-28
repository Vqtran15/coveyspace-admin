'use server'

import { createSession, destroySession } from '@/lib/session'
import { checkRateLimit, recordFailedAttempt, clearAttempts } from '@/lib/rateLimit'
import { logAudit } from '@/lib/audit'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

function getIp() {
  const h = headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim()
    || h.get('x-real-ip')
    || 'unknown'
}

export async function loginAction(password) {
  const ip = getIp()

  const { locked } = await checkRateLimit(ip)
  if (locked) {
    return { error: 'Too many failed attempts. Try again in 15 minutes.' }
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    const { remaining } = await recordFailedAttempt(ip)
    if (remaining <= 0) {
      await logAudit({ action: 'login_locked', ip })
      return { error: 'Too many failed attempts. Try again in 15 minutes.' }
    }
    return { error: `Incorrect password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` }
  }

  await clearAttempts(ip)
  await createSession()
  await logAudit({ action: 'login', ip })
  redirect('/dashboard')
}

export async function logoutAction() {
  const ip = getIp()
  await logAudit({ action: 'logout', ip })
  destroySession()
  redirect('/login')
}
