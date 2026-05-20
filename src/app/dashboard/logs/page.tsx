import { createClient } from '@/lib/supabase/server'
import { LogFilters } from './_components/log-filters'
import { LogTable } from './_components/log-table'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

function rangeToFrom(range: string): string | null {
  const now = Date.now()
  if (range === '1h')  return new Date(now - 60 * 60 * 1000).toISOString()
  if (range === '24h') return new Date(now - 24 * 60 * 60 * 1000).toISOString()
  if (range === '7d')  return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  return null
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>
}) {
  const params = await searchParams
  const severityParam = params.severity ?? ''
  const sourceType    = params.source_type ?? ''
  const range         = params.range ?? '24h'
  const search        = params.search ?? ''
  const page          = Math.max(0, parseInt(params.page ?? '0', 10))

  const severity = severityParam ? severityParam.split(',').filter(Boolean) : []

  const supabase = await createClient()

  // Sources list for the filter dropdown
  const { data: sources } = await supabase
    .from('log_sources')
    .select('id, name, source_type')
    .order('name')

  // Build log_events query
  let query = supabase
    .from('log_events')
    .select('id, timestamp, source_type, source_id, severity, message, raw_message, metadata, created_at')
    .order('timestamp', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)  // fetch PAGE_SIZE + 1

  if (severity.length > 0)  query = query.in('severity', severity)
  if (sourceType)            query = query.eq('source_type', sourceType)
  if (search)                query = query.ilike('message', `%${search}%`)

  const from = rangeToFrom(range)
  if (from) query = query.gte('timestamp', from)

  const { data: rows, error } = await query

  // Build filter params string for pagination links
  const filterParts: string[] = []
  if (severityParam) filterParts.push(`severity=${severityParam}`)
  if (sourceType)    filterParts.push(`source_type=${sourceType}`)
  if (range)         filterParts.push(`range=${range}`)
  if (search)        filterParts.push(`search=${encodeURIComponent(search)}`)
  const filterParams = filterParts.join('&')

  const displayRows = (rows ?? []).slice(0, PAGE_SIZE)
  const hasNext = (rows ?? []).length > PAGE_SIZE

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <span className="text-xs text-zinc-500">Select rows to analyze with AI</span>
      </div>

      <LogFilters
        severity={severity}
        sourceType={sourceType}
        range={range}
        search={search}
        sources={sources ?? []}
      />

      {error && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm text-red-300">
          Error loading logs: {error.message}
        </p>
      )}

      <LogTable
        rows={displayRows}
        page={page}
        hasNext={hasNext}
        filterParams={filterParams}
      />
    </div>
  )
}
