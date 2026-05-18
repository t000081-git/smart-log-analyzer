// scripts/test-auth-probe.mjs
//
// Auth + route probe. Creates a test user via Supabase Admin
// API, signs in via @supabase/ssr (in-memory cookie store), probes each
// route under valid auth cookies, then deletes the test user.
//
// Why this exists: a single-shot end-to-end check of the Supabase Auth
// chain + Next.js route resolution. Originally written to diagnose a
// `Database error saving new user` signup failure (root cause: missing
// SET search_path on the handle_new_user trigger function); kept around
// because the shape of "signup or routing broke — narrow the cause in
// <60s" recurs.
//
// Use when:
//   - Signup/sign-in fails and you need to localise the cause (DB trigger,
//     RLS, env vars, Supabase project paused, etc.).
//   - Adding/renaming routes and you want a fast auth-cookie probe instead
//     of clicking through the UI.
//   - Smoke-checking a staging or production deployment by setting
//     DEV_BASE to the deployed URL.
//
// Run:
//   node --env-file=.env.local scripts/test-auth-probe.mjs
//
// Env vars consumed:
//   NEXT_PUBLIC_SUPABASE_URL       — required
//   NEXT_PUBLIC_SUPABASE_ANON_KEY  — required
//   SUPABASE_SERVICE_ROLE_KEY      — required (Admin API access)
//   DEV_BASE                       — optional, default http://localhost:3000
//   PROBE_EMAIL_DOMAIN             — optional, default example.com
//   PROBE_PASSWORD                 — optional, default ProbePass-2026-Solo!
//
// Side effects: creates one auth.users row + one public.profiles row
// (via the on_auth_user_created trigger), then deletes both via FK
// cascade. Net DB state is unchanged at exit.

import { createServerClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DEV_BASE = process.env.DEV_BASE ?? 'http://localhost:3000'
const EMAIL_DOMAIN = process.env.PROBE_EMAIL_DOMAIN ?? 'example.com'
const TEST_PASSWORD = process.env.PROBE_PASSWORD ?? 'ProbePass-2026-Solo!'

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('[probe ERR] missing required env vars. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Hint: run with `node --env-file=.env.local scripts/test-auth-probe.mjs`')
  process.exit(2)
}

const TEST_EMAIL = `sla-solo-probe-${Date.now()}@${EMAIL_DOMAIN}`

const log = (...a) => console.log('[probe]', ...a)
const err = (...a) => console.error('[probe ERR]', ...a)

// 1) Create + email_confirm the test user
log('Creating test user via Admin API:', TEST_EMAIL)
const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  }),
})
if (!createRes.ok) {
  err('Admin create failed:', createRes.status, await createRes.text())
  process.exit(1)
}
const created = await createRes.json()
const userId = created.id
log('Created user id:', userId)

// 2) Sign in via @supabase/ssr with an in-memory cookie store
const cookieStore = new Map()
const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
  cookies: {
    getAll: () => [...cookieStore.entries()].map(([name, value]) => ({ name, value })),
    setAll: (toSet) => {
      for (const { name, value } of toSet) {
        if (value === '') cookieStore.delete(name)
        else cookieStore.set(name, value)
      }
    },
  },
})

const { data: signin, error: signinErr } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
})
if (signinErr) {
  err('Sign-in failed:', signinErr)
  process.exit(1)
}
log('Sign-in OK. user:', signin.user.email, 'session expires_at:', signin.session.expires_at)
log('Cookies set:', [...cookieStore.keys()])

// 3) Build cookie header for browser-style requests
const cookieHeader = [...cookieStore.entries()]
  .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
  .join('; ')

// 4) Probe each route under auth
const paths = ['/', '/login', '/dashboard', '/dashboard/logs', '/api/health']
log('Probing dev server at', DEV_BASE)
for (const path of paths) {
  const res = await fetch(`${DEV_BASE}${path}`, {
    headers: { cookie: cookieHeader },
    redirect: 'manual',
  })
  const loc = res.headers.get('location') ?? ''
  const ctype = res.headers.get('content-type') ?? ''
  let bodySample = ''
  if (ctype.includes('text/html')) {
    const body = await res.text()
    const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/)
    const h1Match = body.match(/<h1[^>]*>([^<]*)<\/h1>/)
    const has404 = /not.found|404/i.test(body)
    bodySample = [
      titleMatch ? `title="${titleMatch[1]}"` : '',
      h1Match ? `h1="${h1Match[1]}"` : '',
      has404 ? '[contains 404/not-found marker]' : '',
    ].filter(Boolean).join(' ')
  } else if (ctype.includes('application/json')) {
    const body = await res.json()
    bodySample = JSON.stringify(body).slice(0, 120)
  }
  console.log(`  ${path.padEnd(20)} → ${res.status} ${loc ? `→ ${loc}` : ''} ${bodySample}`)
}

// 5) Clean up — delete the test user (cascades to profiles via FK)
log('Deleting test user', userId)
const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
  method: 'DELETE',
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  },
})
log('Delete status:', delRes.status)
