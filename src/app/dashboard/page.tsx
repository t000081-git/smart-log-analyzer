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
        <h1 className="text-3xl font-semibold tracking-tight text-gradient">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Welcome back{user?.email ? `, ${user.email}` : ''}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Log Events"
          value={eventCount.toLocaleString()}
          note="Total events ingested"
          accent="sky"
        />
        <StatCard
          label="Clusters"
          value={clusterCount.toLocaleString()}
          note="AI pipeline — Task 2 (done)"
          accent="violet"
        />
        <StatCard
          label="Active Alarms"
          value={alarmCount.toLocaleString()}
          note="Alarm Waitlist — Task 4"
          accent="amber"
        />
      </div>

      <div className="mt-8 rounded-xl border border-violet-500/15 bg-white/[0.02] p-6 ring-1 ring-violet-400/10 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
          <h2 className="text-sm font-semibold text-violet-200">Phase 1 capstone — in progress</h2>
        </div>
        <p className="text-sm text-slate-400 mb-4 leading-relaxed">
          Log analysis tool for solo sysadmins and small IT teams: ingests logs from Linux,
          Windows, PRTG, and generic sources, clusters semantically-related events using
          embeddings, and generates plain-English summaries with an LLM.
        </p>
        <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
          <li><span className="text-teal-300 font-medium">Task 1</span> — Foundation: auth, scaffold, deploy chain end-to-end <span className="text-teal-400/80 text-xs">(done ✓)</span></li>
          <li><span className="text-teal-300 font-medium">Task 2</span> — AI pipeline: embeddings → cosine clustering → LLM summaries <span className="text-teal-400/80 text-xs">(done ✓)</span></li>
          <li><span className="text-sky-300 font-medium">Task 3</span> — Core UI: log viewer, cluster view, timeline graph</li>
          <li><span className="text-amber-300 font-medium">Task 4</span> — Admin features, Alarm Waitlist, PRTG parser</li>
          <li><span className="text-slate-400 font-medium">Task 5</span> — Polish, CI, staging deploy review</li>
        </ol>
      </div>
    </div>
  )
}

type Accent = 'sky' | 'violet' | 'amber' | 'emerald' | 'rose'

const ACCENT_STYLES: Record<Accent, {
  border: string; ring: string; dot: string; label: string
  radial: string; valueCls: string
}> = {
  sky:     { border: 'border-sky-500/25',     ring: 'ring-sky-400/20',     dot: 'bg-sky-300',     label: 'text-sky-300',     radial: 'rgba(125,211,252,0.12)', valueCls: 'text-sky-50'     },
  violet:  { border: 'border-violet-500/25',  ring: 'ring-violet-400/20',  dot: 'bg-violet-300',  label: 'text-violet-300',  radial: 'rgba(196,181,253,0.12)', valueCls: 'text-violet-50'  },
  amber:   { border: 'border-amber-500/25',   ring: 'ring-amber-400/20',   dot: 'bg-amber-300',   label: 'text-amber-300',   radial: 'rgba(253,230,138,0.12)', valueCls: 'text-amber-50'   },
  emerald: { border: 'border-emerald-500/25', ring: 'ring-emerald-400/20', dot: 'bg-emerald-300', label: 'text-emerald-300', radial: 'rgba(134,239,172,0.12)', valueCls: 'text-emerald-50' },
  rose:    { border: 'border-rose-500/25',    ring: 'ring-rose-400/20',    dot: 'bg-rose-300',    label: 'text-rose-300',    radial: 'rgba(253,164,175,0.12)', valueCls: 'text-rose-50'    },
}

function StatCard({
  label,
  value,
  note,
  accent = 'sky',
}: {
  label: string
  value: string
  note: string
  accent?: Accent
}) {
  const a = ACCENT_STYLES[accent]
  return (
    <div
      className={`card-lift relative overflow-hidden rounded-xl border ${a.border} bg-white/[0.03] p-5 ring-1 ${a.ring} backdrop-blur-sm`}
    >
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{ background: `radial-gradient(ellipse at 20% 20%, ${a.radial}, transparent 65%)` }}
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${a.dot} shadow-[0_0_10px_currentColor]`} />
          <p className={`text-xs font-semibold uppercase tracking-widest ${a.label}`}>{label}</p>
        </div>
        <p className={`mt-3 text-4xl font-bold ${a.valueCls} tabular-nums`}>{value}</p>
        <p className="mt-1.5 text-xs text-slate-500">{note}</p>
      </div>
    </div>
  )
}
