import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { clearAlarm } from './actions'

export const dynamic = 'force-dynamic'

type SeverityKey = 'debug' | 'info' | 'warning' | 'error' | 'critical'
type AlarmStatus = 'open' | 'cleared'

const SEVERITY_BADGE: Record<SeverityKey, string> = {
  critical: 'bg-red-500/20 text-red-300 ring-red-500/30',
  error:    'bg-orange-500/20 text-orange-300 ring-orange-500/30',
  warning:  'bg-amber-500/20 text-amber-300 ring-amber-500/30',
  info:     'bg-sky-500/20 text-sky-300 ring-sky-500/30',
  debug:    'bg-zinc-500/20 text-zinc-300 ring-zinc-500/30',
}

interface AlarmRow {
  id: string
  created_at: string
  severity: SeverityKey
  status: AlarmStatus
  cleared_at: string | null
  notes: string | null
  cluster_id: string
  log_clusters: {
    id: string
    label: string | null
    event_count: number
    cluster_summaries: { summary_text: string }[] | null
  } | null
}

export default async function AlarmsPage() {
  const supabase = await createClient()

  // Get current user's role to decide whether to show Clear button.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user!.id)
    .maybeSingle()
  const canClear = roleRow?.role === 'admin' || roleRow?.role === 'root'

  const [openRes, clearedRes] = await Promise.all([
    supabase
      .from('alarms')
      .select('id, created_at, severity, status, cleared_at, notes, cluster_id, log_clusters ( id, label, event_count, cluster_summaries ( summary_text ) )')
      .eq('status', 'open')
      .order('created_at', { ascending: false }),
    supabase
      .from('alarms')
      .select('id, created_at, severity, status, cleared_at, notes, cluster_id, log_clusters ( id, label, event_count )')
      .eq('status', 'cleared')
      .order('cleared_at', { ascending: false })
      .limit(20),
  ])

  const open   = (openRes.data   ?? []) as unknown as AlarmRow[]
  const cleared = (clearedRes.data ?? []) as unknown as AlarmRow[]

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Alarms</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Auto-generated from clusters with error/critical events.
          </p>
        </div>
        <span className="text-xs text-zinc-500">
          {open.length} open · {cleared.length} recently cleared
        </span>
      </div>

      {/* Open alarms */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
          Open ({open.length})
        </h2>
        {open.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
            No open alarms. All clusters are within normal parameters.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
            <ul className="divide-y divide-zinc-800">
              {open.map((alarm) => {
                const cluster = alarm.log_clusters
                const summary = cluster?.cluster_summaries?.[0]?.summary_text
                return (
                  <li key={alarm.id} className="flex items-start gap-4 px-5 py-4">
                    <span
                      className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                        SEVERITY_BADGE[alarm.severity] ?? SEVERITY_BADGE.info
                      }`}
                    >
                      {alarm.severity}
                    </span>

                    <div className="min-w-0 flex-1">
                      {cluster ? (
                        <Link
                          href={`/dashboard/clusters/${cluster.id}`}
                          className="text-sm font-medium text-zinc-200 hover:text-white transition-colors"
                        >
                          {cluster.label?.trim() || `Cluster ${cluster.id.slice(0, 8)}`}
                        </Link>
                      ) : (
                        <p className="text-sm text-zinc-400 italic">Cluster deleted</p>
                      )}
                      {summary && (
                        <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{summary}</p>
                      )}
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {cluster && <>{cluster.event_count} events · </>}
                        raised {new Date(alarm.created_at).toISOString().replace('T', ' ').slice(0, 16)}Z
                      </p>
                    </div>

                    {canClear && (
                      <form action={clearAlarm} className="shrink-0 self-center">
                        <input type="hidden" name="alarm_id" value={alarm.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                        >
                          Clear
                        </button>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>

      {/* Cleared alarms */}
      {cleared.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-600">
            Recently cleared ({cleared.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50">
            <ul className="divide-y divide-zinc-800">
              {cleared.map((alarm) => {
                const cluster = alarm.log_clusters
                return (
                  <li key={alarm.id} className="flex items-center gap-4 px-5 py-3">
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset opacity-50 ${
                        SEVERITY_BADGE[alarm.severity] ?? SEVERITY_BADGE.info
                      }`}
                    >
                      {alarm.severity}
                    </span>
                    <div className="min-w-0 flex-1">
                      {cluster ? (
                        <Link
                          href={`/dashboard/clusters/${cluster.id}`}
                          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors line-through decoration-zinc-600"
                        >
                          {cluster.label?.trim() || `Cluster ${cluster.id.slice(0, 8)}`}
                        </Link>
                      ) : (
                        <span className="text-sm text-zinc-600 italic">Cluster deleted</span>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-zinc-600">
                      cleared {alarm.cleared_at
                        ? new Date(alarm.cleared_at).toISOString().replace('T', ' ').slice(0, 16) + 'Z'
                        : '—'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      {!canClear && (
        <p className="mt-6 text-[11px] text-zinc-600">
          Viewer role — clearing alarms requires admin or clear_alarms permission.
        </p>
      )}
    </div>
  )
}
