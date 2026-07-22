import { defineConfig, devices } from '@playwright/test'

const TEST_SECRET = 'playwright-test-secret-32-chars-!!'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3099',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'next dev --port 3099',
    port: 3099,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      ADMIN_SESSION_SECRET: TEST_SECRET,
      ADMIN_EMAIL: 'test@example.com',
      ADMIN_PASSWORD: 'testpassword',
    },
  },
})
