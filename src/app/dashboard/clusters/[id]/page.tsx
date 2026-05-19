import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SeverityKey = 'debug' | 'info' | 'warning' | 'error' | 'critical'

const SEVERITY_BADGE: Record<SeverityKey, string> = {
  critical: 'bg-red-500/20 text-red-300 ring-red-500/30',
  error:    'bg-orange-500/20 text-orange-300 ring-orange-500/30',
  warning:  'bg-amber-500/20 text-amber-300 ring-amber-500/30',
  info:     'bg-sky-500/20 text-sky-300 ring-sky-500/30',
  debug:    'bg-zinc-500/20 text-zinc-300 ring-zinc-500/30',
}

interface MemberEvent {
  similarity_score: number | null
  log_events: {
    id: string
    timestamp: string
    severity: SeverityKey
    source_type: string
    source_id: string
    message: string
  } | null
}

export default async function ClusterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cluster, error: clusterErr } = await supabase
    .from('log_clusters')
    .select('id, label, event_count, first_seen, last_seen, severity_distribution, source_types, embedding_model_provider, embedding_model_name, pipeline_version, clustered_at')
    .eq('id', id)
    .maybeSingle()

  if (clusterErr || !cluster) notFound()

  const { data: summary } = await supabase
    .from('cluster_summaries')
    .select('summary_text, summary_model_provider, summary_model_name, pipeline_version, generated_at')
    .eq('cluster_id', id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: members } = await supabase
    .from('log_cluster_members')
    .select('similarity_score, log_events ( id, timestamp, severity, source_type, source_id, message )')
    .eq('cluster_id', id)
    .order('similarity_score', { ascending: false, nullsFirst: false })
    .limit(200)

  const memberList = ((members ?? []) as unknown as MemberEvent[]).filter(
    (m): m is MemberEvent & { log_events: NonNullable<MemberEvent['log_events']> } =>
      m.log_events !== null
  )

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <Link
          href="/dashboard/clusters"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← All clusters
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-white">
          {cluster.label?.trim() || 'Cluster'}
        </h1>
        <p className="mt-1 font-mono text-xs text-zinc-500">{cluster.id}</p>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Events" value={String(cluster.event_count)} />
        <Stat
          label="First seen"
          value={cluster.first_seen ? formatTs(cluster.first_seen) : '—'}
        />
        <Stat
          label="Last seen"
          value={cluster.last_seen ? formatTs(cluster.last_seen) : '—'}
        />
      </div>

      <section className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-300">AI summary</h2>
          {summary && (
            <span className="text-[10px] text-zinc-500">
              {summary.summary_model_provider}/{summary.summary_model_name} ·{' '}
              {formatTs(summary.generated_at)}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-zinc-200">
          {summary?.summary_text ?? (
            <span className="italic text-zinc-500">
              No summary generated yet for this cluster.
            </span>
          )}
        </p>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-medium text-zinc-300">Member events</h2>
          <span className="text-xs text-zinc-500">
            showing {memberList.length} of {cluster.event_count}
          </span>
        </div>

        {memberList.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500">No member events found.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {memberList.map((m) => {
              const e = m.log_events
              return (
                <li key={e.id}>
                  <Link
                    href={`/dashboard/timeline?highlight=${e.id}`}
                    className="flex items-start gap-3 px-5 py-3 text-sm transition-colors hover:bg-zinc-800/50"
                    title="Click to highlight this event on the Timeline"
                  >
                    <span
                      className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                        SEVERITY_BADGE[e.severity] ?? SEVERITY_BADGE.info
                      }`}
                    >
                      {e.severity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-200 break-words">{e.message}</p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        <span className="font-mono">{formatTs(e.timestamp)}</span>
                        {' · '}
                        <span>{e.source_type}</span>
                        {' · '}
                        <span className="font-mono">{e.source_id}</span>
                        {m.similarity_score !== null && (
                          <>
                            {' · '}
                            <span title="cosine similarity to cluster centroid">
                              sim {m.similarity_score.toFixed(3)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 self-center text-[10px] text-zinc-600 group-hover:text-zinc-400">
                      ↗ timeline
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-[11px] text-zinc-500">
        <p>
          Embedding: <span className="font-mono text-zinc-400">{cluster.embedding_model_provider}/{cluster.embedding_model_name}</span>
          {' · '}Pipeline: <span className="font-mono text-zinc-400">{cluster.pipeline_version}</span>
          {' · '}Clustered: <span className="font-mono text-zinc-400">{formatTs(cluster.clustered_at)}</span>
        </p>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white tabular-nums">{value}</p>
    </div>
  )
}

function formatTs(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + 'Z'
}
