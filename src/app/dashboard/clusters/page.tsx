import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LevelBadge } from '@/components/level-badge'

export const dynamic = 'force-dynamic'

type Severity = 'debug' | 'info' | 'warning' | 'error' | 'critical'

const SEV_ORDER: Severity[] = ['critical', 'error', 'warning', 'info', 'debug']

const SEV_COLORS: Record<Severity, string> = {
  critical: 'bg-red-400',
  error:    'bg-rose-400',
  warning:  'bg-amber-300',
  info:     'bg-sky-400',
  debug:    'bg-slate-500',
}

function SeverityBar({ dist }: { dist: Record<string, number> }) {
  const total = Object.values(dist).reduce((a, b) => a + b, 0)
  if (total === 0) return null
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
      {SEV_ORDER.map(sev => {
        const count = dist[sev] ?? 0
        if (count === 0) return null
        const pct = (count / total) * 100
        return (
          <div
            key={sev}
            className={`${SEV_COLORS[sev]} h-full opacity-80`}
            style={{ width: `${pct}%` }}
            title={`${sev}: ${count}`}
          />
        )
      })}
    </div>
  )
}

function fmtDate(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

export default async function ClustersPage() {
  const supabase = await createClient()

  const { data: clusters, error } = await supabase
    .from('log_clusters')
    .select('id, label, event_count, first_seen, last_seen, severity_distribution, source_types, hierarchy_level, clustered_at')
    .order('clustered_at', { ascending: false })

  const { data: summaries } = await supabase
    .from('cluster_summaries')
    .select('cluster_id, summary_text')

  const summaryMap = new Map((summaries ?? []).map(s => [s.cluster_id, s.summary_text]))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Clusters</h1>
        <span className="text-xs text-zinc-500">{clusters?.length ?? 0} AI-generated groups</span>
      </div>

      {error && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm text-red-300">
          Error loading clusters: {error.message}
        </p>
      )}

      {(!clusters || clusters.length === 0) && !error && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] py-16 text-center">
          <p className="text-slate-400">No clusters yet.</p>
          <p className="mt-1 text-xs text-slate-600">Run the AI pipeline (scripts/seed-pipeline.ts) to generate clusters.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(clusters ?? []).map(c => {
          const dist = (c.severity_distribution ?? {}) as Record<string, number>
          const topSev = SEV_ORDER.find(s => (dist[s] ?? 0) > 0) ?? 'info'
          const preview = summaryMap.get(c.id)

          return (
            <Link
              key={c.id}
              href={`/dashboard/clusters/${c.id}`}
              className="card-lift group relative flex flex-col gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-5 hover:border-violet-500/30 hover:bg-white/[0.05] backdrop-blur-sm overflow-hidden"
            >
              {/* Hover glow */}
              <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(167,139,250,0.06), transparent 60%)' }} />

              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-200 group-hover:text-white leading-snug line-clamp-2 transition-colors">
                  {c.label ?? 'Unlabelled cluster'}
                </h2>
                <LevelBadge level={topSev} />
              </div>

              <SeverityBar dist={dist} />

              {preview && (
                <p className="text-xs text-slate-500 group-hover:text-slate-400 line-clamp-2 leading-relaxed transition-colors">{preview}</p>
              )}

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium">{c.event_count.toLocaleString()} events</span>
                <span>{fmtDate(c.first_seen)} → {fmtDate(c.last_seen)}</span>
              </div>

              {(c.source_types as string[]).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(c.source_types as string[]).slice(0, 3).map(st => (
                    <span key={st} className="rounded-xl bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400/70 ring-1 ring-violet-500/20">{st}</span>
                  ))}
                  {(c.source_types as string[]).length > 3 && (
                    <span className="rounded-xl bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-600">+{(c.source_types as string[]).length - 3}</span>
                  )}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
