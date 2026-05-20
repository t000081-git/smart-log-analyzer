import Link from 'next/link'
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

interface LogEventRow {
  id: string
  timestamp: string
  severity: SeverityKey
  source_type: string
  source_id: string
  message: string
}

const PAGE_SIZE = 100

export default async function LogsPage() {
  const supabase = await createClient()

  const { count } = await supabase
    .from('log_events')
    .select('*', { count: 'exact', head: true })

  const { data: events, error } = await supabase
    .from('log_events')
    .select('id, timestamp, severity, source_type, source_id, message')
    .order('timestamp', { ascending: false })
    .limit(PAGE_SIZE)

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Logs</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Most recent log events across all sources.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            showing {events?.length ?? 0} of {count ?? 0}
          </span>
          <Link
            href="/dashboard/logs/upload"
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 transition-colors"
          >
            Upload logs
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-300">
          Failed to load logs: {error.message}
        </div>
      )}

      {events && events.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
          No log events yet. Run <code className="text-zinc-300">npm run seed</code> to populate
          synthetic data, or wait for an ingestion run.
        </div>
      )}

      {events && events.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          <ul className="divide-y divide-zinc-800">
            {(events as LogEventRow[]).map((e) => (
              <li key={e.id}>
                <Link
                  href={`/dashboard/logs/${e.id}`}
                  className="flex items-start gap-3 px-5 py-3 text-sm transition-colors hover:bg-zinc-800/50"
                >
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                      SEVERITY_BADGE[e.severity] ?? SEVERITY_BADGE.info
                    }`}
                  >
                    {e.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-zinc-200 break-words">{e.message}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      <span className="font-mono">
                        {new Date(e.timestamp).toISOString().replace('T', ' ').slice(0, 19)}Z
                      </span>
                      {' · '}
                      <span>{e.source_type}</span>
                      {' · '}
                      <span className="font-mono">{e.source_id}</span>
                    </p>
                  </div>
                  <span className="shrink-0 self-center text-[10px] text-zinc-600">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
