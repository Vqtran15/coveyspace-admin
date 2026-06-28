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
  cookies().set(COOKIE, token, COOKIE_OPTS)
}

export function destroySession() {
  cookies().delete(COOKIE)
}

export async function requireAuth() {
  const token = cookies().get(COOKIE)?.value
  if (!token) redirect('/login')
  try {
    await jwtVerify(token, secret())
  } catch {
    redirect('/login')
  }
}
