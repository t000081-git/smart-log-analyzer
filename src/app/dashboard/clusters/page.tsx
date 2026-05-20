import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SeverityKey = 'debug' | 'info' | 'warning' | 'error' | 'critical'

const SEVERITY_ORDER: SeverityKey[] = ['critical', 'error', 'warning', 'info', 'debug']
const SEVERITY_COLORS: Record<SeverityKey, string> = {
  critical: 'bg-red-500/20 text-red-300 ring-red-500/30',
  error:    'bg-orange-500/20 text-orange-300 ring-orange-500/30',
  warning:  'bg-amber-500/20 text-amber-300 ring-amber-500/30',
  info:     'bg-sky-500/20 text-sky-300 ring-sky-500/30',
  debug:    'bg-zinc-500/20 text-zinc-300 ring-zinc-500/30',
}

interface ClusterRow {
  id: string
  label: string | null
  event_count: number
  first_seen: string | null
  last_seen: string | null
  severity_distribution: Partial<Record<SeverityKey, number>>
  source_types: string[]
  embedding_model_name: string
  clustered_at: string
}

interface SummaryRow {
  cluster_id: string
  summary_text: string
  summary_model_name: string
  generated_at: string
}

export default async function ClustersPage() {
  const supabase = await createClient()

  const { data: clusters, error: clusterErr } = await supabase
    .from('log_clusters')
    .select('id, label, event_count, first_seen, last_seen, severity_distribution, source_types, embedding_model_name, clustered_at')
    .order('event_count', { ascending: false })
    .order('clustered_at', { ascending: false })
    .limit(100)

  const ids = (clusters ?? []).map((c) => c.id)
  const { data: summaries } = ids.length
    ? await supabase
        .from('cluster_summaries')
        .select('cluster_id, summary_text, summary_model_name, generated_at')
        .in('cluster_id', ids)
        .order('generated_at', { ascending: false })
    : { data: [] as SummaryRow[] }

  const latestSummary = new Map<string, SummaryRow>()
  for (const s of (summaries ?? []) as SummaryRow[]) {
    if (!latestSummary.has(s.cluster_id)) latestSummary.set(s.cluster_id, s)
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Clusters</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Semantically-grouped log events with plain-English summaries.
          </p>
        </div>
        <span className="text-xs text-zinc-500">
          {clusters?.length ?? 0} cluster{clusters?.length === 1 ? '' : 's'}
        </span>
      </div>

      {clusterErr && (
        <div className="mb-4 rounded-md border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-300">
          Failed to load clusters: {clusterErr.message}
        </div>
      )}

      {clusters && clusters.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
          No clusters yet. Run <code className="text-zinc-300">npm run seed</code> to populate
          synthetic data, or wait for an ingestion run to produce real clusters.
        </div>
      )}

      <ul className="space-y-3">
        {(clusters as ClusterRow[] | null)?.map((c) => {
          const summary = latestSummary.get(c.id)
          const title = c.label?.trim() || deriveTitle(summary?.summary_text)
          return (
            <li key={c.id}>
              <Link
                href={`/dashboard/clusters/${c.id}`}
                className="block rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-700 hover:bg-zinc-900/80"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-medium text-white line-clamp-1">
                      {title}
                    </h2>
                    <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
                      {summary?.summary_text ?? 'No summary generated yet for this cluster.'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-2xl font-semibold text-white tabular-nums">
                      {c.event_count}
                    </div>
                    <div className="text-xs text-zinc-500">events</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <SeverityBadges distribution={c.severity_distribution} />
                  {c.source_types.length > 0 && (
                    <span className="text-zinc-500">
                      {c.source_types.length} source{c.source_types.length === 1 ? '' : 's'}
                    </span>
                  )}
                  <span className="text-zinc-500">{formatRange(c.first_seen, c.last_seen)}</span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function deriveTitle(text: string | undefined): string {
  if (!text) return 'Cluster'
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] ?? text
  return firstSentence.length > 100 ? firstSentence.slice(0, 97) + '…' : firstSentence
}

function SeverityBadges({
  distribution,
}: {
  distribution: Partial<Record<SeverityKey, number>>
}) {
  const present = SEVERITY_ORDER.filter((k) => (distribution[k] ?? 0) > 0)
  if (present.length === 0) {
    return <span className="text-zinc-500">no severity data</span>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map((k) => (
        <span
          key={k}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${SEVERITY_COLORS[k]}`}
        >
          {k} · {distribution[k]}
        </span>
      ))}
    </div>
  )
}

function formatRange(first: string | null, last: string | null): string {
  if (!first && !last) return 'no timestamps'
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + 'Z' : '—'
  if (first === last || !last) return fmt(first)
  return `${fmt(first)} → ${fmt(last)}`
}
