'use server'

import { createSession, destroySession, createPendingOtp, verifyAndConsumePendingOtp, clearPendingOtp } from '@/lib/session'
import { checkRateLimit, recordFailedAttempt, clearAttempts } from '@/lib/rateLimit'
import { logAudit } from '@/lib/audit'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

async function getIp() {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim()
    || h.get('x-real-ip')
    || 'unknown'
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function sendOtpEmail(code) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Covey Space Admin <hello@coveyspace.com>',
      to: [process.env.ADMIN_EMAIL],
      subject: `Your login code: ${code}`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 8px;font-size:18px;color:#1c1917">Covey Space Admin</h2>
          <p style="margin:0 0 24px;color:#78716c;font-size:14px">Your verification code is:</p>
          <div style="background:#f5f5f4;border-radius:12px;padding:20px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:700;color:#1c1917">
            ${code}
          </div>
          <p style="margin:16px 0 0;color:#a8a29e;font-size:12px">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
        </div>
      `,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to send verification email (${res.status}): ${body}`)
  }
}

export async function loginAction(email, password) {
  const ip = await getIp()

  const { locked } = await checkRateLimit(ip)
  if (locked) {
    return { error: 'Too many failed attempts. Try again in 15 minutes.' }
  }

  if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
    const { remaining } = await recordFailedAttempt(ip)
    if (remaining <= 0) {
      await logAudit({ action: 'login_locked', ip })
      return { error: 'Too many failed attempts. Try again in 15 minutes.' }
    }
    return { error: `Incorrect email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` }
  }

  await clearAttempts(ip)

  const code = generateCode()
  try {
    await sendOtpEmail(code)
  } catch (e) {
    return { error: 'Could not send verification email. Please try again.' }
  }
  await createPendingOtp(code)

  redirect('/login/verify')
}

export async function verifyOtpAction(code) {
  const ip = await getIp()
  const result = await verifyAndConsumePendingOtp(code)
  if (result.error) return { error: result.error }
  await createSession()
  await logAudit({ action: 'login', ip })
  redirect('/dashboard')
}

export async function resendOtpAction() {
  const code = generateCode()
  try {
    await sendOtpEmail(code)
  } catch (e) {
    return { error: 'Could not send verification email. Please try again.' }
  }
  await clearPendingOtp()
  await createPendingOtp(code)
  return { ok: true }
}

export async function logoutAction() {
  const ip = await getIp()
  await logAudit({ action: 'logout', ip })
  await destroySession()
  redirect('/login')
}
