// smart-log-analyzer: post-seed verification
// 2026-05-19
//
// Run after `npm run seed` to confirm the pipeline landed cleanly.
//
// Checks:
//   1. Row counts present for log_events, log_clusters, cluster_summaries.
//   2. Cluster-to-summary coverage: every log_clusters row has a summary row.
//   3. No cluster_summaries with NULL or empty summary_text — that pattern
//      indicates a mid-batch OpenRouter rate-limit silently truncated some
//      LLM responses, leaving rows that look written but are content-less.
//
// Uses the same env vars as the seed script:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Run: `npm run verify`
// Exit 0 on all checks pass; exit 1 on any fail.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[verify] Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

async function main(): Promise<void> {
  console.log('[verify] querying row counts and integrity checks...')

  const [events, clusters, summaries, nullSummaries, emptySummaries] = await Promise.all([
    supabase.from('log_events').select('id', { count: 'exact', head: true }),
    supabase.from('log_clusters').select('id', { count: 'exact', head: true }),
    supabase.from('cluster_summaries').select('id', { count: 'exact', head: true }),
    supabase.from('cluster_summaries').select('id', { count: 'exact', head: true }).is('summary_text', null),
    supabase.from('cluster_summaries').select('id', { count: 'exact', head: true }).eq('summary_text', ''),
  ])

  const firstError = events.error ?? clusters.error ?? summaries.error ?? nullSummaries.error ?? emptySummaries.error
  if (firstError) {
    console.error('[verify] query error:', firstError.message)
    process.exit(1)
  }

  const eventCount       = events.count        ?? 0
  const clusterCount     = clusters.count      ?? 0
  const summaryCount     = summaries.count     ?? 0
  const nullSummaryCount = nullSummaries.count ?? 0
  const emptySummaryCount = emptySummaries.count ?? 0
  const blankSummaryCount = nullSummaryCount + emptySummaryCount

  console.log('[verify] ---------------------------------------')
  console.log(`[verify]   log_events:           ${eventCount}`)
  console.log(`[verify]   log_clusters:         ${clusterCount}`)
  console.log(`[verify]   cluster_summaries:    ${summaryCount}`)
  console.log(`[verify]   null  summaries:      ${nullSummaryCount}`)
  console.log(`[verify]   empty summaries:      ${emptySummaryCount}`)
  console.log(`[verify]   missing summary rows: ${Math.max(0, clusterCount - summaryCount)}`)
  console.log('[verify] ---------------------------------------')

  let ok = true

  if (eventCount === 0) {
    console.error('[verify] FAIL: log_events is empty — the seed did not run, or truncate ran but insert did not')
    ok = false
  }
  if (clusterCount === 0) {
    console.error('[verify] FAIL: log_clusters is empty — clustering stage produced no rows')
    ok = false
  }
  if (summaryCount === 0) {
    console.error('[verify] FAIL: cluster_summaries is empty — LLM stage produced no rows')
    ok = false
  }
  if (clusterCount > 0 && summaryCount < clusterCount) {
    console.error(`[verify] FAIL: ${clusterCount - summaryCount} clusters have NO summary row at all — LLM stage partially failed`)
    ok = false
  }
  if (blankSummaryCount > 0) {
    console.error(`[verify] FAIL: ${blankSummaryCount} cluster_summaries rows have NULL/empty summary_text`)
    console.error('[verify]       → likely an OpenRouter rate-limit (429) silently truncated mid-batch')
    console.error('[verify]       → affected clusters need to be re-summarized')
    ok = false
  }

  if (ok) {
    console.log('[verify] OK — all checks pass. Seed pipeline landed cleanly.')
    process.exit(0)
  } else {
    console.error('[verify] FAILED — see errors above.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[verify] unhandled error:', err)
  process.exit(1)
})
