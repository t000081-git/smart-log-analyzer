'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseLog } from '@/lib/parser'
import { evaluateRules } from '@/lib/rules'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB ingest limit (server-side enforcement)
const BATCH_SIZE = 500

// If the newest parsed timestamp is more than this distance from now (past
// or future), shift the whole batch so it ends at NOW. Keeps demo / sample
// logs (which often have year-less syslog dates) visible on the timeline.
const SHIFT_THRESHOLD_MS = 7 * 24 * 3600 * 1000

export interface IngestResult {
  ok: boolean
  inserted: number
  alarms: number
  parseErrors: number
  message?: string
  shifted?: {
    appliedMs: number
    originalOldest: string
    originalNewest: string
  }
}

export async function ingestText(input: {
  content: string
  source_id: string
  filename?: string
}): Promise<IngestResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, inserted: 0, alarms: 0, parseErrors: 0, message: 'unauthorized' }
  }

  const byteLen = Buffer.byteLength(input.content, 'utf8')
  if (byteLen === 0) {
    return { ok: false, inserted: 0, alarms: 0, parseErrors: 0, message: 'empty payload' }
  }
  if (byteLen > MAX_BYTES) {
    return {
      ok: false,
      inserted: 0,
      alarms: 0,
      parseErrors: 0,
      message: `payload exceeds ${MAX_BYTES} bytes`,
    }
  }

  const sourceId = (input.source_id || 'manual-upload').slice(0, 128)
  const filename = input.filename ?? 'paste.log'

  const { events, parseErrors } = parseLog(input.content, sourceId, filename)
  if (events.length === 0) {
    return {
      ok: false,
      inserted: 0,
      alarms: 0,
      parseErrors: parseErrors.length,
      message: 'no parseable events',
    }
  }

  // Sanitize: some adapters (notably RFC 3164 syslog with locale-edge formatting)
  // can emit Invalid Date timestamps. Calling toISOString() on those throws
  // RangeError. Replace with current time and flag for forensics — never
  // silently lose the row.
  const fallbackNow = new Date()
  let sanitized = 0
  for (const e of events) {
    if (!Number.isFinite(e.timestamp.getTime())) {
      e.metadata = {
        ...e.metadata,
        timestamp_was_invalid: true,
        timestamp_invalid_raw: e.raw_message ?? null,
      }
      e.timestamp = fallbackNow
      sanitized += 1
    }
  }

  // Auto-shift timestamps if the batch is far out of the recent window.
  // Common when ingesting sample / historical logs (e.g. RFC 3164 syslog
  // without a year stamps to the current year, which can be months in the
  // past or future). Shift preserves intra-event spacing.
  const now = Date.now()
  let newest = -Infinity
  let oldest = Infinity
  for (const e of events) {
    const t = e.timestamp.getTime()
    if (t > newest) newest = t
    if (t < oldest) oldest = t
  }

  let shifted: IngestResult['shifted']
  if (
    Number.isFinite(newest) &&
    Number.isFinite(oldest) &&
    Math.abs(now - newest) > SHIFT_THRESHOLD_MS
  ) {
    const appliedMs = now - newest
    const originalOldest = new Date(oldest).toISOString()
    const originalNewest = new Date(newest).toISOString()
    for (const e of events) {
      const original = e.timestamp.toISOString()
      e.timestamp = new Date(e.timestamp.getTime() + appliedMs)
      e.metadata = {
        ...e.metadata,
        original_timestamp: original,
        timestamp_shifted_ms: appliedMs,
      }
    }
    shifted = { appliedMs, originalOldest, originalNewest }
  }

  // Service-role client — bypasses RLS for INSERT. log_events has no
  // authenticated INSERT policy by design; only the pipeline writes.
  // SUPABASE_SERVICE_ROLE_KEY must be set in env (locally in .env.local
  // for dev; on Vercel under Settings → Environment Variables for
  // production — managed by user-charles per AGENTS.md).
  const svc = createServiceClient()

  let inserted = 0
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const slice = events.slice(i, i + BATCH_SIZE).map((e) => ({
      timestamp: e.timestamp.toISOString(),
      source_type: e.source_type,
      source_id: e.source_id,
      hierarchy_level: e.hierarchy_level,
      severity: e.severity,
      message: e.message,
      raw_message: e.raw_message ?? null,
      metadata: { ...e.metadata, ingested_by: user.id, ingested_at: new Date().toISOString() },
    }))
    const { error, count } = await svc
      .from('log_events')
      .insert(slice, { count: 'exact' })
    if (error) {
      return {
        ok: false,
        inserted,
        alarms: 0,
        parseErrors: parseErrors.length,
        message: `insert failed at batch ${i / BATCH_SIZE}: ${error.message}`,
      }
    }
    inserted += count ?? slice.length
  }

  const candidates = evaluateRules(events)
  let alarmsInserted = 0
  if (candidates.length > 0) {
    const alarmRows = candidates.map((c) => ({
      severity: c.severity,
      status: 'open' as const,
      cluster_id: null,
      notes: `rule:${c.rule} | event_index:${c.event_index} | match:${c.match.slice(0, 200)}`,
    }))
    const { error, count } = await svc
      .from('alarms')
      .insert(alarmRows, { count: 'exact' })
    if (error) {
      return {
        ok: true,
        inserted,
        alarms: 0,
        parseErrors: parseErrors.length,
        message: `events ok; alarm insert failed: ${error.message}`,
      }
    }
    alarmsInserted = count ?? alarmRows.length
  }

  return {
    ok: true,
    inserted,
    alarms: alarmsInserted,
    parseErrors: parseErrors.length,
    shifted,
  }
}
