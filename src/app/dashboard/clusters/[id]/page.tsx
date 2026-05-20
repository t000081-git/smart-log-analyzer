import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LevelBadge } from '@/components/level-badge'

export const dynamic = 'force-dynamic'

function fmt(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })
}

type Severity = 'debug' | 'info' | 'warning' | 'error' | 'critical'
const SEV_ORDER: Severity[] = ['critical', 'error', 'warning', 'info', 'debug']

export default async function ClusterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: cluster }, { data: summaries }, { data: members }] = await Promise.all([
    supabase
      .from('log_clusters')
      .select('id, label, event_count, first_seen, last_seen, severity_distribution, source_types, embedding_model_provider, embedding_model_name, pipeline_version, clustered_at')
      .eq('id', id)
      .single(),
    supabase
      .from('cluster_summaries')
      .select('id, summary_text, summary_model_provider, summary_model_name, period_start, period_end, generated_at')
      .eq('cluster_id', id)
      .order('generated_at', { ascending: false }),
    supabase
      .from('log_cluster_members')
      .select('log_event_id, similarity_score, log_events(id, timestamp, severity, message, source_id, source_type, raw_message)')
      .eq('cluster_id', id)
      .order('similarity_score', { ascending: false })
      .limit(100),
  ])

  if (!cluster) notFound()

  const dist = (cluster.severity_distribution ?? {}) as Record<string, number>
  const total = Object.values(dist).reduce((a, b) => a + b, 0)
  const latestSummary = summaries?.[0] ?? null

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/clusters" className="text-xs text-zinc-500 hover:text-zinc-300">← Clusters</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{cluster.label ?? 'Unlabelled cluster'}</h1>
        <p className="mt-1 text-xs text-zinc-500">
          {cluster.event_count.toLocaleString()} events · {fmt(cluster.first_seen)} → {fmt(cluster.last_seen)}
        </p>
      </div>

      {/* AI Summary */}
      {latestSummary ? (
        <div className="rounded-xl border border-violet-500/20 bg-violet-900/10 p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-medium text-violet-300">AI Summary</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-600">{latestSummary.summary_model_provider}/{latestSummary.summary_model_name}</span>
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed">{latestSummary.summary_text}</p>
          <p className="mt-2 text-xs text-zinc-600">Generated {fmt(latestSummary.generated_at)}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-sm text-zinc-500">No AI summary available for this cluster yet.</p>
        </div>
      )}

      {/* Severity distribution */}
      {total > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Severity Distribution</h2>
          <div className="flex flex-wrap gap-3">
            {SEV_ORDER.map(sev => {
              const count = dist[sev] ?? 0
              if (count === 0) return null
              return (
                <div key={sev} className="flex items-center gap-1.5">
                  <LevelBadge level={sev} />
                  <span className="text-sm text-zinc-300">{count.toLocaleString()}</span>
                  <span className="text-xs text-zinc-600">({Math.round((count / total) * 100)}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Member events */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Member Events <span className="text-zinc-600">(top 100 by similarity)</span></h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">Timestamp</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">Level</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">Source</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">Message</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-zinc-500">Similarity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {(!members || members.length === 0) ? (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-zinc-500">No member events found</td></tr>
              ) : (
                members.map(m => {
                  const ev = m.log_events as unknown as {
                    id: string; timestamp: string | null; severity: string;
                    message: string; source_id: string; source_type: string
                  } | null
                  if (!ev) return null
                  return (
                    <tr key={m.log_event_id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-400">{fmt(ev.timestamp)}</td>
                      <td className="px-3 py-2"><LevelBadge level={ev.severity} /></td>
                      <td className="px-3 py-2 text-xs text-zinc-400 max-w-[120px] truncate">{ev.source_id}</td>
                      <td className="px-3 py-2 text-xs text-zinc-200 max-w-[360px] truncate">{ev.message}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-zinc-500">
                        {m.similarity_score != null ? m.similarity_score.toFixed(3) : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Technical metadata */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600">Pipeline Metadata</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-zinc-600">Embedding model</span><p className="text-zinc-400">{cluster.embedding_model_provider}/{cluster.embedding_model_name}</p></div>
          <div><span className="text-zinc-600">Pipeline version</span><p className="text-zinc-400">{cluster.pipeline_version}</p></div>
          <div><span className="text-zinc-600">Clustered at</span><p className="text-zinc-400">{fmt(cluster.clustered_at)}</p></div>
          <div><span className="text-zinc-600">Cluster ID</span><p className="font-mono text-[10px] text-zinc-600">{cluster.id}</p></div>
        </div>
      </div>
    </div>
  )
}
