import { test, expect } from '@playwright/test'
import { SignJWT } from 'jose'

const TEST_SECRET = 'playwright-test-secret-32-chars-!!'

// Same helper as dashboard.spec.js — signs a valid admin_session cookie.
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

// ─── Broadcast to Admins page ─────────────────────────────────────────────────

test.describe('Broadcast to Admins (authenticated)', () => {
  test.beforeEach(async ({ context, page }) => {
    await injectSession(context)
    await page.goto('/broadcast-admins')
  })

  test('loads /broadcast-admins without error', async ({ page }) => {
    await expect(page).toHaveURL(/\/broadcast-admins/)
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    await expect(page.locator('body')).not.toContainText(/application error/i)
  })

  test('page has "Broadcast to Admins" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Broadcast to Admins' })).toBeVisible()
  })

  test('page has "Admins only" badge', async ({ page }) => {
    await expect(page.locator('text=Admins only')).toBeVisible()
  })

  test('send button is disabled when message is empty', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: /Send to Admins/i })
    await expect(sendBtn).toBeDisabled()
  })

  test('send button enables when message is typed', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: /Send to Admins/i })
    await expect(sendBtn).toBeDisabled()

    await page.locator('textarea').fill('Hello admins!')
    await expect(sendBtn).toBeEnabled()
  })

  test('character count increments as user types', async ({ page }) => {
    const textarea = page.locator('textarea')
    // Initially shows 0/200
    await expect(page.locator('text=0/200')).toBeVisible()

    await textarea.fill('Hello')
    // "Hello" is 5 characters
    await expect(page.locator('text=5/200')).toBeVisible()

    await textarea.fill('Hello admins')
    // "Hello admins" is 12 characters
    await expect(page.locator('text=12/200')).toBeVisible()
  })

  test('send button is disabled when message exceeds 200 chars', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: /Send to Admins/i })
    const longMessage = 'a'.repeat(201)
    await page.locator('textarea').fill(longMessage)
    await expect(sendBtn).toBeDisabled()
  })

  test('history section has "Recent Admin Broadcasts" label', async ({ page }) => {
    await expect(page.locator('text=Recent Admin Broadcasts')).toBeVisible()
  })

})

// ─── Unauthenticated redirect ──────────────────────────────────────────────────
// Runs outside the authenticated describe block so no session cookie is present.

test('unauthenticated access to /broadcast-admins redirects to /login', async ({ browser }) => {
  // Create a completely fresh context with no cookies
  const freshCtx = await browser.newContext()
  const freshPage = await freshCtx.newPage()
  try {
    await freshPage.goto('/broadcast-admins')
    await expect(freshPage).toHaveURL(/\/login/)
  } finally {
    await freshCtx.close()
  }
})

// ─── Nav item ─────────────────────────────────────────────────────────────────

test.describe('AdminNav — Broadcast to Admins link', () => {
  test.beforeEach(async ({ context, page }) => {
    await injectSession(context)
    // Load dashboard so the nav is rendered
    await page.goto('/dashboard')
  })

  test('nav shows "Broadcast to Admins" link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Broadcast to Admins/i })).toBeVisible()
  })

  test('"Broadcast to Admins" nav link points to /broadcast-admins', async ({ page }) => {
    const link = page.getByRole('link', { name: /Broadcast to Admins/i })
    await expect(link).toHaveAttribute('href', '/broadcast-admins')
  })

  test('"Broadcast to Admins" nav link navigates to the page', async ({ page }) => {
    await page.getByRole('link', { name: /Broadcast to Admins/i }).click()
    await expect(page).toHaveURL(/\/broadcast-admins/)
  })
})

// ─── Broadcast to All regression ─────────────────────────────────────────────

test.describe('Broadcast to All — regression (authenticated)', () => {
  test.beforeEach(async ({ context, page }) => {
    await injectSession(context)
    await page.goto('/broadcast')
  })

  test('loads /broadcast without error', async ({ page }) => {
    await expect(page).toHaveURL(/\/broadcast/)
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    await expect(page.locator('body')).not.toContainText(/application error/i)
  })

  test('"Broadcast to All" heading is present', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Broadcast to All' })).toBeVisible()
  })

  test('"Send Push" button is disabled when message is empty', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: /Send Push/i })
    await expect(sendBtn).toBeDisabled()
  })

  test('"Send Push" button enables when message is typed', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: /Send Push/i })
    await page.locator('textarea').fill('Test broadcast message')
    await expect(sendBtn).toBeEnabled()
  })

  test('does NOT show "Admins only" badge', async ({ page }) => {
    await expect(page.locator('text=Admins only')).not.toBeVisible()
  })
})
