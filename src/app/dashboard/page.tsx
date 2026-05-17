import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Welcome back{user?.email ? `, ${user.email}` : ''}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Log Events" value="—" note="Connect Supabase to populate" />
        <StatCard label="Clusters"   value="—" note="AI pipeline — Task 2" />
        <StatCard label="Active Alarms" value="—" note="Alarm Waitlist — Task 4" />
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
          <li>Task 2 — AI pipeline: embeddings → cosine clustering → LLM summaries</li>
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
