import { createClient } from '@/lib/supabase/server'
import TimelineCharts, { type EventRow, type ClusterRow } from './TimelineCharts'

export const dynamic = 'force-dynamic'

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { highlight } = await searchParams
  const highlightId = Array.isArray(highlight) ? highlight[0] : highlight

  const supabase = await createClient()
  const [eventsRes, clustersRes] = await Promise.all([
    supabase
      .from('log_events')
      .select('id, timestamp, severity, source_type, source_id, message, log_cluster_members(cluster_id)')
      .order('timestamp', { ascending: true })
      .limit(1000),
    supabase
      .from('log_clusters')
      .select('id, label, first_seen, last_seen, severity_distribution, event_count')
      .not('first_seen', 'is', null)
      .order('first_seen', { ascending: true }),
  ])

  const events = (eventsRes.data ?? []) as EventRow[]
  const clusters = (clustersRes.data ?? []) as ClusterRow[]

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Timeline</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Date-time scatter of log events and cluster spans, by severity.
          </p>
        </div>
        <span className="text-xs text-zinc-500">
          {events.length} event{events.length === 1 ? '' : 's'} · {clusters.length} cluster{clusters.length === 1 ? '' : 's'}
        </span>
      </div>

      {eventsRes.error && (
        <div className="mb-4 rounded-md border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-300">
          Failed to load events: {eventsRes.error.message}
        </div>
      )}

      <TimelineCharts events={events} clusters={clusters} highlightId={highlightId} />
    </div>
  )
}
