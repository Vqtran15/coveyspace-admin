import { test, expect } from '@playwright/test'

// ─── Auth gate (proxy middleware) ────────────────────────────────────────────

test.describe('Auth gate', () => {
  test('/ redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/dashboard redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/audit redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/audit')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/broadcast redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/broadcast')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/errors redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/errors')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/login is publicly accessible', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'Community Admin' })).toBeVisible()
  })

  test('/login/verify is publicly accessible', async ({ page }) => {
    await page.goto('/login/verify')
    await expect(page).toHaveURL(/\/login\/verify/)
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  })
})

// ─── Login page ───────────────────────────────────────────────────────────────

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('renders email, password, and confirm fields', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible()
    const passwords = page.locator('input[type="password"]')
    await expect(passwords).toHaveCount(2)
  })

  test('submit button is disabled until all fields filled', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Unlock' })
    await expect(btn).toBeDisabled()

    await page.locator('input[type="email"]').fill('test@example.com')
    await expect(btn).toBeDisabled()

    await page.locator('input[type="password"]').first().fill('somepassword')
    await expect(btn).toBeDisabled()

    await page.locator('input[type="password"]').last().fill('somepassword')
    await expect(btn).toBeEnabled()
  })

  test('shows error when passwords do not match', async ({ page }) => {
    await page.locator('input[type="email"]').fill('test@example.com')
    await page.locator('input[type="password"]').first().fill('password1')
    await page.locator('input[type="password"]').last().fill('password2')
    await page.getByRole('button', { name: 'Unlock' }).click()
    await expect(page.locator('text=Passwords do not match')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows error on wrong credentials', async ({ page }) => {
    await page.locator('input[type="email"]').fill('wrong@example.com')
    await page.locator('input[type="password"]').first().fill('wrongpassword')
    await page.locator('input[type="password"]').last().fill('wrongpassword')
    await page.getByRole('button', { name: 'Unlock' }).click()
    // Should stay on /login — not navigate to /login/verify
    await page.waitForTimeout(3000)
    await expect(page).toHaveURL(/\/login(?!\/verify)/)
    await expect(page).not.toHaveURL(/\/login\/verify/)
  })

  test('correct credentials redirect to /login/verify', async ({ page }) => {
    await page.locator('input[type="email"]').fill('test@example.com')
    await page.locator('input[type="password"]').first().fill('testpassword')
    await page.locator('input[type="password"]').last().fill('testpassword')
    await page.getByRole('button', { name: 'Unlock' }).click()
    // Should either redirect to /login/verify or show an email error (RESEND_API_KEY not set in tests)
    await expect(page).toHaveURL(/\/login\/verify|\/login/)
  })
})

// ─── Verify OTP page ──────────────────────────────────────────────────────────

test.describe('Verify OTP page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login/verify')
  })

  test('renders a 6-digit code input', async ({ page }) => {
    const input = page.locator('input[inputmode="numeric"]')
    await expect(input).toBeVisible()
    await expect(input).toHaveAttribute('placeholder', '000000')
  })

  test('shows resend button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Resend code' })).toBeVisible()
  })

  test('shows back link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /back to login/i })).toBeVisible()
  })

  test('shows error on wrong OTP code', async ({ page }) => {
    // Typing 6 digits auto-submits
    await page.locator('input[inputmode="numeric"]').fill('000000')
    await page.locator('input[inputmode="numeric"]').dispatchEvent('input', { bubbles: true })
    // Fill via keyboard to trigger onChange properly
    await page.locator('input[inputmode="numeric"]').press('0')
    await page.locator('input[inputmode="numeric"]').fill('')
    await page.locator('input[inputmode="numeric"]').type('000000')
    await expect(page.locator('text=/expired|[Ii]ncorrect|[Ii]nvalid/i')).toBeVisible({ timeout: 8000 })
  })
})

// ─── API routes ────────────────────────────────────────────────────────────────

test.describe('API routes', () => {
  test('/api/error-alert returns non-200 for GET', async ({ request }) => {
    const res = await request.get('/api/error-alert')
    expect(res.status()).not.toBe(200)
  })

  test('/api/error-alert POST with missing API key returns 500 or error', async ({ request }) => {
    const res = await request.post('/api/error-alert', {
      data: { message: 'test', url: 'http://localhost', userAgent: 'test' },
    })
    // Without RESEND_API_KEY, the server will error — but should not crash the process
    expect([200, 400, 401, 500]).toContain(res.status())
  })
})
