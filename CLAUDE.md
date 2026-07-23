# coveyspace-admin

Admin dashboard for the Covey Space community platform.

## Stack
- Next.js 16, React 19, Tailwind CSS
- Supabase (Postgres + Auth + Storage)
- Deployed on Vercel

## Branches & Deployment
- `origin/staging` → admin-staging.coveyspace.com (staging)
- `origin/main` → admin.coveyspace.com (prod)
- **Never push to `origin/main` without explicit "push to prod" from the user**

## Key Files
- `src/proxy.js` — auth middleware (Next.js 16 uses `proxy.js`, not `middleware.js`; `middleware.js` is deprecated)
- `src/lib/session.js` — JWT session logic (`admin_session` cookie, HS256)
- `src/lib/supabase.js` — Supabase client (server-side only, uses `SUPABASE_SERVICE_ROLE_KEY`)
- `src/actions/admin.js` — server actions for data fetching
- `src/components/DashboardClient.jsx` — main dashboard UI (Overview tab, skeleton loading, metrics)
- `src/app/globals.css` — global CSS including `.skeleton-shimmer` keyframe animation

## Known Quirks
- `.npmrc` has `legacy-peer-deps=true` — required because `@emoji-mart/react@1.1.1` declares peer dep on React `^16.8||^17||^18` but the project is on React 19. Do not remove this.
- `src/app/dashboard/page.jsx` wraps `loadGroups()` in `.catch(() => ({ data: [] }))` so the dashboard shell renders even when Supabase is unreachable.

## Testing
- Playwright tests in `e2e/`
- Run: `npx playwright test --reporter=list --timeout=45000`
- Test server runs on port 3099 with `ADMIN_SESSION_SECRET=playwright-test-secret-32-chars-!!`
- Auth is faked by injecting a signed JWT cookie (see `injectSession` helper in test files)
- Tests that require real Supabase credentials self-skip gracefully

## Self-Correction Rule
If Claude discovers that something in this file is wrong or outdated (e.g., a feature already exists, a file has moved, a constraint no longer applies), update this file immediately before continuing. Do not silently work around stale information.
