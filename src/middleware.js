import { NextResponse } from 'next/server'
import { jwtVerify, SignJWT } from 'jose'

const COOKIE = 'admin_session'

function secret() {
  return new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET)
}

async function freshToken() {
  return new SignJWT({ ok: 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(secret())
}

export async function middleware(request) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/login') || pathname.startsWith('/_next')) {
    return NextResponse.next()
  }

  const token = request.cookies.get(COOKIE)?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    await jwtVerify(token, secret())

    // Roll the session: issue a fresh 30-min token on every authenticated request
    const newToken = await freshToken()
    const res = NextResponse.next()
    res.cookies.set(COOKIE, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 30,
    })
    return res
  } catch {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete(COOKIE)
    return res
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
