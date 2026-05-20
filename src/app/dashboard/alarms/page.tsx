import { createClient } from '@/lib/supabase/server'
import { AlarmTable } from './_components/alarm-table'

export const dynamic = 'force-dynamic'

export default async function AlarmsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Check if user has clear_alarms permission
  const { data: permRow } = await supabase
    .from('user_permissions')
    .select('id')
    .eq('user_id', user!.id)
    .eq('permission_key', 'clear_alarms')
    .maybeSingle()

  const canClear = !!permRow

  // Fetch alarms joined with cluster label
  const { data: alarms, error } = await supabase
    .from('alarms')
    .select('id, created_at, severity, status, notes, cleared_at, cluster_id, log_clusters(label)')
    .order('created_at', { ascending: false })

  const rows = (alarms ?? []).map(a => ({
    id:            a.id,
    created_at:    a.created_at,
    severity:      a.severity,
    status:        a.status,
    notes:         a.notes,
    cleared_at:    a.cleared_at,
    cluster_id:    a.cluster_id,
    cluster_label: (a.log_clusters as unknown as { label: string | null } | null)?.label ?? null,
  }))

  const openCount = rows.filter(r => r.status === 'open').length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Alarms</h1>
        {openCount > 0 && (
          <span className="rounded-full bg-amber-900/40 px-3 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-700/50">
            {openCount} open
          </span>
        )}
      </div>

      {!canClear && (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-xs text-zinc-500">
          You have read-only access. A root user must grant you the <code className="text-zinc-400">clear_alarms</code> permission to clear alarms.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm text-red-300">
          Error loading alarms: {error.message}
        </p>
      )}

      <AlarmTable rows={rows} canClear={canClear} />
    </div>
  )
}
