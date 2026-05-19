import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering — the stat cards query Supabase at request time,
// not at build time. Without this, Next.js can statically generate the page
// with stale (build-time) counts.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Stat-card counts — three independent COUNT queries in parallel.
  // Using { count: 'exact', head: true } returns the count without
  // fetching row data (efficient). Each query has its own error path;
  // a missing or RLS-blocked table degrades to 0 rather than breaking
  // the whole page.
  const [events, clusters, alarms] = await Promise.all([
    supabase.from('log_events').select('id', { count: 'exact', head: true }),
    supabase.from('log_clusters').select('id', { count: 'exact', head: true }),
    supabase
      .from('alarms')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
  ])

  const eventCount   = events.error   ? 0 : (events.count   ?? 0)
  const clusterCount = clusters.error ? 0 : (clusters.count ?? 0)
  const alarmCount   = alarms.error   ? 0 : (alarms.count   ?? 0)

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Welcome back{user?.email ? `, ${user.email}` : ''}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Log Events"
          value={eventCount.toLocaleString()}
          note="Total events ingested"
        />
        <StatCard
          label="Clusters"
          value={clusterCount.toLocaleString()}
          note="AI pipeline — Task 2 (done)"
        />
        <StatCard
          label="Active Alarms"
          value={alarmCount.toLocaleString()}
          note="Alarm Waitlist — Task 4"
        />
      </div>

      <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-sm font-medium text-zinc-300 mb-2">Phase 1 capstone — in progress</h2>
        <p className="text-sm text-zinc-400 mb-3">
          Log analysis tool for solo sysadmins and small IT teams: ingests logs from Linux,
          Windows, PRTG, and generic sources, clusters semantically-related events using
          embeddings, and generates plain-English summaries with an LLM.
        </p>
        <ol className="space-y-2 text-sm text-zinc-400 list-decimal list-inside">
          <li>Task 1 — Foundation: auth, scaffold, deploy chain end-to-end (done)</li>
          <li>Task 2 — AI pipeline: embeddings → cosine clustering → LLM summaries (done)</li>
          <li>Task 3 — Core UI: log viewer, cluster view, timeline graph</li>
          <li>Task 4 — Admin features, Alarm Waitlist, PRTG parser</li>
          <li>Task 5 — Polish, CI, staging deploy review</li>
        </ol>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{note}</p>
    </div>
  )
}
