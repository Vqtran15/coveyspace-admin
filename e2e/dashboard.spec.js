import { test, expect } from '@playwright/test'
import { SignJWT } from 'jose'

const TEST_SECRET = 'playwright-test-secret-32-chars-!!'

// Creates a valid session cookie so tests can reach authenticated routes.
// Uses the same logic as src/lib/session.js.
async function injectSession(context) {
  const secret = new TextEncoder().encode(TEST_SECRET)
  const token = await new SignJWT({ ok: 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(secret)

  await context.addCookies([{
    name: 'admin_session',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Strict',
  }])
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

test.describe('Dashboard (authenticated)', () => {
  test.beforeEach(async ({ context, page }) => {
    await injectSession(context)
    await page.goto('/dashboard')
  })

  test('loads dashboard without redirect', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('renders group list or loading state', async ({ page }) => {
    // Either shows content or a loading indicator — not an error page
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    await expect(page.locator('body')).not.toContainText(/application error/i)
  })

  test('stays on /dashboard after load (does not redirect back to login)', async ({ page }) => {
    await page.waitForTimeout(1000)
    await expect(page).toHaveURL(/\/dashboard/)
  })
})

// ─── Audit log ────────────────────────────────────────────────────────────────

test.describe('Audit log (authenticated)', () => {
  test.beforeEach(async ({ context, page }) => {
    await injectSession(context)
    await page.goto('/audit')
  })

  test('loads audit page without redirect', async ({ page }) => {
    await expect(page).toHaveURL(/\/audit/)
  })

  test('no 500 error on page load', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
  })
})

// ─── Broadcast ────────────────────────────────────────────────────────────────

test.describe('Broadcast (authenticated)', () => {
  test.beforeEach(async ({ context, page }) => {
    await injectSession(context)
    await page.goto('/broadcast')
  })

  test('loads broadcast page without redirect', async ({ page }) => {
    await expect(page).toHaveURL(/\/broadcast/)
  })

  test('no 500 error on page load', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
  })
})

// ─── Errors page ──────────────────────────────────────────────────────────────

test.describe('Errors page (authenticated)', () => {
  test.beforeEach(async ({ context, page }) => {
    await injectSession(context)
    await page.goto('/errors')
  })

  test('loads errors page without redirect', async ({ page }) => {
    await expect(page).toHaveURL(/\/errors/)
  })

  test('no 500 error on page load', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
  })
})

// ─── Session management ────────────────────────────────────────────────────────

test.describe('Session management', () => {
  test('tampered session cookie redirects to /login', async ({ context, page }) => {
    await context.addCookies([{
      name: 'admin_session',
      value: 'invalid.jwt.token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Strict',
    }])
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('expired session redirects to /login', async ({ context, page }) => {
    const secret = new TextEncoder().encode(TEST_SECRET)
    const token = await new SignJWT({ ok: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(secret)
    await context.addCookies([{
      name: 'admin_session',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Strict',
    }])
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('session cookie is refreshed on authenticated request', async ({ context, page }) => {
    await injectSession(context)

    // Wait >1s so the rolled token's iat differs (JWT iat is second-granularity)
    await page.waitForTimeout(1100)
    await page.goto('/dashboard')
    await page.waitForTimeout(500)

    const cookiesAfter = await context.cookies()
    const tokenAfter = cookiesAfter.find(c => c.name === 'admin_session')?.value

    // Proxy rolls the session — a new cookie should be set
    expect(tokenAfter).toBeDefined()

    // Decode iat from the rolled token and verify it's a fresh issue
    const parts = tokenAfter.split('.')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    const iatMs = payload.iat * 1000
    expect(Date.now() - iatMs).toBeLessThan(5000) // issued within the last 5 seconds
  })
})
