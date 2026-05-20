import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LevelBadge } from '@/components/level-badge'
import type { ThreatItem } from '@/lib/openrouter'

export const dynamic = 'force-dynamic'

function fmt(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function AnalysisResultPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: analysis } = await supabase
    .from('ai_analyses')
    .select('id, model, log_ids, summary, threats, recommendations, created_at')
    .eq('id', id)
    .single()

  if (!analysis) notFound()

  const threats = (analysis.threats ?? []) as ThreatItem[]
  const recs = (analysis.recommendations ?? '').split('\n').filter(Boolean)

  const isFailed = analysis.summary?.startsWith('AI call failed:')

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <Link href="/dashboard/logs" className="text-xs text-zinc-500 hover:text-zinc-300">← Logs</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Analysis Result</h1>
        <p className="mt-1 text-xs text-zinc-500">
          {analysis.log_ids.length} logs · {analysis.model} · {fmt(analysis.created_at)}
        </p>
      </div>

      {isFailed ? (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-5">
          <p className="text-sm font-medium text-red-300 mb-1">Analysis failed</p>
          <p className="text-sm text-red-400">{analysis.summary?.replace('AI call failed: ', '')}</p>
          <Link href="/dashboard/settings" className="mt-3 inline-block text-xs text-zinc-400 hover:text-zinc-300">
            Check your OpenRouter API key in Settings →
          </Link>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="rounded-xl border border-violet-500/20 bg-violet-900/10 p-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-violet-400">Summary</p>
            <p className="text-sm text-zinc-200 leading-relaxed">{analysis.summary}</p>
          </div>

          {/* Threats */}
          {threats.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-zinc-300">Threat Indicators <span className="text-zinc-600">({threats.length})</span></h2>
              <div className="flex flex-col gap-3">
                {threats.map((t, i) => (
                  <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <LevelBadge level={t.severity} />
                      <span className="text-sm font-medium text-zinc-200">{t.title}</span>
                    </div>
                    {t.evidence && (
                      <p className="font-mono text-xs text-zinc-500 bg-zinc-800 rounded-lg px-2 py-1 leading-relaxed">
                        {t.evidence}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {recs.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <h2 className="mb-3 text-sm font-medium text-zinc-300">Recommendations</h2>
              <ul className="space-y-1.5">
                {recs.map((r: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-400">
                    <span className="text-zinc-600 mt-0.5">•</span>
                    <span>{r.replace(/^[•\-*]\s*/, '')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="flex gap-3 pt-2">
        <Link
          href="/dashboard/logs"
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 transition-colors"
        >
          ← Back to Logs
        </Link>
        <Link
          href="/dashboard/analysis/new"
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          New Analysis
        </Link>
      </div>
    </div>
  )
}
