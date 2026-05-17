import { NextResponse } from 'next/server'

// /api/health — deployment identity + Supabase reachability probe.
//
// Pre-empts the alias-drift loop (PCP-dev #verify-line-artifact-identity-extension
// candidate, surfaced 2026-05-16 from the BookingApp debugging session): when a
// deployed artifact and its expected source-of-truth drift apart but old
// references still resolve, debugging the "why doesn't my fix work?" loop can
// take hours. This endpoint surfaces the deployed commit SHA directly so a
// caller can verify the running build matches what they pushed.
//
// Verify shape: `curl https://<staging>/api/health | jq '.commit.sha'` should
// match `git rev-parse HEAD` of the build that was deployed.
//
// This route is exempted from the auth middleware redirect (see middleware.ts)
// so it remains reachable even when Supabase env vars are wrong — which is
// exactly the case it's designed to diagnose.

export const dynamic = 'force-dynamic'

export async function GET() {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local-dev'
  const commitShort = commitSha.slice(0, 7)
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? null
  const env = process.env.VERCEL_ENV ?? 'local'
  const region = process.env.VERCEL_REGION ?? null

  // Supabase reachability — ping the public auth health endpoint.
  // This validates: (a) NEXT_PUBLIC_SUPABASE_URL is correct,
  // (b) anon key is non-empty, (c) network egress works, (d) project isn't paused.
  let supabaseReachable: boolean | null = null
  let supabaseError: string | null = null
  let supabaseLatencyMs: number | null = null

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      supabaseReachable = false
      supabaseError = 'env vars missing (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY)'
    } else {
      const start = Date.now()
      const res = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: key },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      })
      supabaseLatencyMs = Date.now() - start
      supabaseReachable = res.ok
      if (!res.ok) supabaseError = `${res.status} ${res.statusText}`
    }
  } catch (e) {
    supabaseReachable = false
    supabaseError = e instanceof Error ? e.message : 'unknown error'
  }

  const overallOk = supabaseReachable !== false

  return NextResponse.json(
    {
      ok: overallOk,
      timestamp: new Date().toISOString(),
      commit: { sha: commitSha, short: commitShort, branch },
      env,
      region,
      supabase: {
        reachable: supabaseReachable,
        error: supabaseError,
        latency_ms: supabaseLatencyMs,
      },
    },
    { status: overallOk ? 200 : 503 }
  )
}
