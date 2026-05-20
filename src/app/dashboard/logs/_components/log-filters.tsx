'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { LevelBadge } from '@/components/level-badge'

const SEVERITY_LEVELS = ['debug', 'info', 'warning', 'error', 'critical'] as const
const DATE_RANGES = [
  { label: 'Last 1h',  value: '1h' },
  { label: 'Last 24h', value: '24h' },
  { label: 'Last 7d',  value: '7d' },
  { label: 'All time', value: 'all' },
]

interface Props {
  severity: string[]
  sourceType: string
  range: string
  search: string
  sources: { id: string; name: string; source_type: string }[]
}

export function LogFilters({ severity, sourceType, range, search, sources }: Props) {
  const router = useRouter()

  const push = useCallback((overrides: Record<string, string | string[]>) => {
    const params = new URLSearchParams()
    const merged = {
      severity: severity.join(','),
      source_type: sourceType,
      range,
      search,
      page: '0',
      ...Object.fromEntries(
        Object.entries(overrides).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
      ),
    }
    Object.entries(merged).forEach(([k, v]) => { if (v) params.set(k, v) })
    router.push(`/dashboard/logs?${params.toString()}`)
  }, [severity, sourceType, range, search, router])

  const toggleSeverity = (level: string) => {
    const next = severity.includes(level)
      ? severity.filter(s => s !== level)
      : [...severity, level]
    push({ severity: next.join(','), page: '0' })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center">

      {/* Severity toggles */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-slate-500 mr-1">Level</span>
        {SEVERITY_LEVELS.map(lvl => (
          <button
            key={lvl}
            onClick={() => toggleSeverity(lvl)}
            className={[
              'rounded-xl transition-all duration-150',
              severity.includes(lvl)
                ? 'scale-105 ring-2 ring-white/20 shadow-[0_0_12px_rgba(167,139,250,0.3)]'
                : 'opacity-35 hover:opacity-75 hover:scale-105',
            ].join(' ')}
          >
            <LevelBadge level={lvl} />
          </button>
        ))}
        {severity.length > 0 && (
          <button
            onClick={() => push({ severity: '', page: '0' })}
            className="ml-1 rounded-xl px-1.5 py-0.5 text-xs text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors duration-150"
          >
            ✕ clear
          </button>
        )}
      </div>

      <div className="h-4 w-px bg-white/10" />

      {/* Source */}
      {sources.length > 0 && (
        <select
          value={sourceType}
          onChange={e => push({ source_type: e.target.value, page: '0' })}
          className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-400/50 transition-all"
        >
          <option value="">All sources</option>
          {sources.map(s => (
            <option key={s.id} value={s.source_type}>{s.name}</option>
          ))}
        </select>
      )}

      {/* Date range */}
      <select
        value={range}
        onChange={e => push({ range: e.target.value, page: '0' })}
        className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-400/50 transition-all"
      >
        {DATE_RANGES.map(r => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>

      {/* Search */}
      <form
        onSubmit={e => {
          e.preventDefault()
          const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value
          push({ search: q, page: '0' })
        }}
        className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto"
      >
        <input
          name="q"
          defaultValue={search}
          placeholder="Search messages…"
          className="w-full sm:w-52 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-400/50 focus:border-sky-500/40 transition-all"
        />
        <button
          type="submit"
          className="btn-glow-sky rounded-xl bg-sky-500/20 px-3 py-1.5 text-xs font-medium text-sky-300 ring-1 ring-sky-500/30 hover:bg-sky-500/30 transition-colors"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => push({ search: '', page: '0' })}
            className="text-xs text-slate-500 hover:text-rose-300 transition-colors"
          >
            ✕
          </button>
        )}
      </form>
    </div>
  )
}
