import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const COOKIE = 'admin_session'
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 60 * 30, // 30 minutes
}

const PENDING_COOKIE = 'admin_pending'
const PENDING_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 60 * 10, // 10 minutes
}

function secret() {
  return new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET)
}

async function signToken() {
  return new SignJWT({ ok: 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(secret())
}

export async function createSession() {
  const token = await signToken()
  const cookieStore = await cookies()
  cookieStore.set(COOKIE, token, COOKIE_OPTS)
}

export async function destroySession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE)
}

export async function createPendingOtp(code) {
  const token = await new SignJWT({ code })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret())
  const cookieStore = await cookies()
  cookieStore.set(PENDING_COOKIE, token, PENDING_OPTS)
}

export async function verifyAndConsumePendingOtp(inputCode) {
  const cookieStore = await cookies()
  const token = cookieStore.get(PENDING_COOKIE)?.value
  if (!token) return { error: 'Session expired. Please log in again.' }
  try {
    const { payload } = await jwtVerify(token, secret())
    if (payload.code !== inputCode.trim()) return { error: 'Incorrect code.' }
    cookieStore.delete(PENDING_COOKIE)
    return { ok: true }
  } catch {
    return { error: 'Session expired. Please log in again.' }
  }
}

export async function clearPendingOtp() {
  const cookieStore = await cookies()
  cookieStore.delete(PENDING_COOKIE)
}

export async function requireAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE)?.value
  if (!token) redirect('/login')
  try {
    await jwtVerify(token, secret())
  } catch {
    redirect('/login')
  }
}
