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

const SEVERITY_COLOR: Record<SeverityKey, string> = {
  critical: 'text-red-300',
  error:    'text-orange-300',
  warning:  'text-amber-300',
  info:     'text-sky-300',
  debug:    'text-zinc-400',
}

export default async function LogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: event, error } = await supabase
    .from('log_events')
    .select('id, timestamp, severity, source_type, source_id, message, raw_message, metadata, hierarchy_level, created_at, supersedes_id')
    .eq('id', id)
    .maybeSingle()

  if (error || !event) notFound()

  // Cluster membership — which cluster contains this event (if any)
  const { data: membership } = await supabase
    .from('log_cluster_members')
    .select('cluster_id, similarity_score, log_clusters ( id, label, event_count, pipeline_version )')
    .eq('log_event_id', id)
    .maybeSingle()

  type ClusterRef = { id: string; label: string | null; event_count: number; pipeline_version: string }
  const cluster = membership
    ? (membership.log_clusters as unknown as ClusterRef | null)
    : null

  const sev = event.severity as SeverityKey

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/dashboard/logs" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← All logs
        </Link>
      </div>

      <header className="mb-6 flex items-start gap-4">
        <span
          className={`mt-1 inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
            SEVERITY_BADGE[sev] ?? SEVERITY_BADGE.info
          }`}
        >
          {event.severity}
        </span>
        <div>
          <p className={`text-lg font-medium leading-snug ${SEVERITY_COLOR[sev] ?? 'text-zinc-200'}`}>
            {event.message}
          </p>
          <p className="mt-1 font-mono text-xs text-zinc-500">{event.id}</p>
        </div>
      </header>

      {/* Core fields */}
      <section className="mb-6 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-medium text-zinc-300">Event details</h2>
        </div>
        <dl className="divide-y divide-zinc-800">
          <Row label="Timestamp"    value={new Date(event.timestamp).toISOString().replace('T', ' ').slice(0, 23) + 'Z'} mono />
          <Row label="Source type"  value={event.source_type} />
          <Row label="Source ID"    value={event.source_id} mono />
          <Row label="Hierarchy"    value={`level ${event.hierarchy_level}`} />
          <Row label="Ingested at"  value={new Date(event.created_at).toISOString().replace('T', ' ').slice(0, 19) + 'Z'} mono />
          {event.supersedes_id && (
            <Row label="Supersedes" value={event.supersedes_id} mono />
          )}
        </dl>
      </section>

      {/* Raw message if different */}
      {event.raw_message && event.raw_message !== event.message && (
        <section className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-2 text-sm font-medium text-zinc-300">Raw message</h2>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-zinc-400 leading-relaxed">
            {event.raw_message}
          </pre>
        </section>
      )}

      {/* Metadata */}
      {event.metadata && Object.keys(event.metadata).length > 0 && (
        <section className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-2 text-sm font-medium text-zinc-300">Metadata</h2>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-zinc-400 leading-relaxed">
            {JSON.stringify(event.metadata, null, 2)}
          </pre>
        </section>
      )}

      {/* Cluster membership */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-medium text-zinc-300">Cluster membership</h2>
        </div>
        {cluster ? (
          <div className="px-5 py-4">
            <Link
              href={`/dashboard/clusters/${cluster.id}`}
              className="group flex items-start justify-between gap-4 rounded-md transition-colors hover:bg-zinc-800/50 -mx-2 px-2 py-2"
            >
              <div>
                <p className="text-sm text-zinc-200 group-hover:text-white transition-colors">
                  {cluster.label ?? <span className="italic text-zinc-500">Unlabelled cluster</span>}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {cluster.event_count} events · pipeline {cluster.pipeline_version}
                  {membership?.similarity_score !== null && membership?.similarity_score !== undefined && (
                    <> · sim {membership.similarity_score.toFixed(3)}</>
                  )}
                </p>
              </div>
              <span className="shrink-0 text-xs text-zinc-500 group-hover:text-zinc-300">
                View cluster →
              </span>
            </Link>
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-zinc-500">
            This event has not been assigned to a cluster yet.
          </p>
        )}
      </section>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-4 px-5 py-3">
      <dt className="w-32 shrink-0 text-xs font-medium text-zinc-500">{label}</dt>
      <dd className={`min-w-0 break-all text-xs text-zinc-200 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
