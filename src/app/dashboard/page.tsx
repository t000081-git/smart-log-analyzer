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
        <h2 className="text-sm font-medium text-zinc-300 mb-2">Getting started (solo)</h2>
        <ol className="space-y-2 text-sm text-zinc-400 list-decimal list-inside">
          <li>Create a solo Supabase project (separate from the team&rsquo;s) and apply the migration in <code className="text-zinc-300">supabase/migrations/</code></li>
          <li>Copy <code className="text-zinc-300">.env.example</code> → <code className="text-zinc-300">.env.local</code> and fill in your Supabase keys</li>
          <li>Hit <code className="text-zinc-300">/api/health</code> to confirm the deployed commit SHA + Supabase reachability</li>
          <li>Sign in above to confirm auth works end-to-end</li>
          <li>Task 2: run <code className="text-zinc-300">npx tsx scripts/seed-pipeline.ts</code> to validate the AI pipeline</li>
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
