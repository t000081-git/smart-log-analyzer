'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { callOpenRouter } from '@/lib/openrouter'

const MAX_LINES = 200
const MAX_BYTES = 50 * 1024 // 50 KB

function sampleEvenly<T>(arr: T[], maxLen: number): T[] {
  if (arr.length <= maxLen) return arr
  const step = arr.length / maxLen
  return Array.from({ length: maxLen }, (_, i) => arr[Math.floor(i * step)])
}

export async function analyzeLogs(logIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }

  if (!logIds.length) return { error: 'No log IDs provided' }

  // Fetch logs (RLS-scoped; user only sees what they're allowed to see)
  const { data: logs, error: fetchErr } = await supabase
    .from('log_events')
    .select('id, timestamp, severity, message, source_id, source_type')
    .in('id', logIds)

  if (fetchErr) return { error: fetchErr.message }
  if (!logs?.length) return { error: 'No logs found for provided IDs' }

  // Get user's OpenRouter key (fallback to env)
  const { data: settings } = await supabase
    .from('user_settings')
    .select('openrouter_key, preferred_model')
    .eq('user_id', user.id)
    .maybeSingle()

  const apiKey = settings?.openrouter_key || process.env.OPENROUTER_FALLBACK_KEY
  if (!apiKey) return { error: 'No OpenRouter API key configured. Add one in Settings.' }

  const model = settings?.preferred_model ?? 'anthropic/claude-3.5-sonnet'

  // Build log lines for the prompt
  let lines = logs.map(l =>
    `[${l.timestamp ?? 'no-ts'}] [${l.severity}] ${l.source_id} — ${l.message}`
  )

  // Cap by line count and byte size
  lines = sampleEvenly(lines, MAX_LINES)
  let combined = lines.join('\n')
  if (combined.length > MAX_BYTES) {
    // Trim evenly again
    while (combined.length > MAX_BYTES && lines.length > 10) {
      lines = sampleEvenly(lines, Math.floor(lines.length * 0.8))
      combined = lines.join('\n')
    }
  }

  let result
  try {
    result = await callOpenRouter(lines, apiKey, model)
  } catch (e) {
    result = {
      summary: `AI call failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
      threats: [],
      recommendations: '',
    }
  }

  // Store analysis
  const { data: analysis, error: insertErr } = await supabase
    .from('ai_analyses')
    .insert({
      user_id:         user.id,
      model,
      log_ids:         logIds,
      summary:         result.summary,
      threats:         result.threats,
      recommendations: result.recommendations,
    })
    .select('id')
    .single()

  if (insertErr) return { error: insertErr.message }

  redirect(`/dashboard/analysis/${analysis.id}`)
}
