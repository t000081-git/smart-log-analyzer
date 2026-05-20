'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LevelBadge } from '@/components/level-badge'
import { Sparkles } from 'lucide-react'

type LogRow = {
  id: string
  timestamp: string | null
  source_type: string
  source_id: string
  severity: string
  message: string
  raw_message: string | null
  metadata: Record<string, unknown>
  created_at: string
}

interface Props {
  rows: LogRow[]
  page: number
  hasNext: boolean
  filterParams: string
}

function fmt(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })
}

export function LogTable({ rows, page, hasNext, filterParams }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<LogRow | null>(null)

  const displayRows = rows.slice(0, 50)

  const toggleAll = () => {
    setSelected(selected.size === displayRows.length ? new Set() : new Set(displayRows.map(r => r.id)))
  }

  const toggleRow = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const analyzeSelected = () => {
    router.push(`/dashboard/analysis/new?ids=${Array.from(selected).join(',')}`)
  }

  const navigate = (dir: 'prev' | 'next') => {
    const params = new URLSearchParams(filterParams)
    params.set('page', String(dir === 'next' ? page + 1 : page - 1))
    router.push(`/dashboard/logs?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="animate-slide-up flex items-center gap-3 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2.5 backdrop-blur-sm">
          <span className="text-sm font-medium text-violet-300">{selected.size} selected</span>
          <button
            onClick={analyzeSelected}
            className="btn-glow-violet flex items-center gap-2 rounded-xl bg-violet-500/30 px-3 py-1.5 text-xs font-semibold text-violet-200 ring-1 ring-violet-400/40 hover:bg-violet-500/40 transition-colors"
          >
            <Sparkles size={12} className="text-violet-300" />
            Analyze {selected.size} with AI
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-slate-500 hover:text-rose-300 transition-colors"
          >
            ✕ clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="w-8 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.size === displayRows.length && displayRows.length > 0}
                  onChange={toggleAll}
                  className="accent-violet-400"
                />
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">Timestamp</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">Level</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">Source</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-14 text-center text-sm text-slate-500">
                  No log events match — try widening filters
                </td>
              </tr>
            ) : (
              displayRows.map(row => (
                <tr
                  key={row.id}
                  onClick={() => setDetail(row)}
                  className={[
                    'cursor-pointer transition-colors duration-100',
                    selected.has(row.id)
                      ? 'bg-violet-500/[0.08] hover:bg-violet-500/[0.12]'
                      : 'hover:bg-white/[0.03]',
                  ].join(' ')}
                >
                  <td className="px-3 py-2.5" onClick={e => { e.stopPropagation(); toggleRow(row.id) }}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      className="accent-violet-400"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-500">{fmt(row.timestamp ?? row.created_at)}</td>
                  <td className="px-3 py-2.5"><LevelBadge level={row.severity} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-400 max-w-[140px] truncate" title={row.source_id}>{row.source_id}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-200 max-w-[400px] truncate">{row.message}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{displayRows.length} rows</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => navigate('prev')}
            className="btn-glow-sky rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sky-300 hover:bg-sky-500/15 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="px-2 text-slate-400">Page {page + 1}</span>
          <button
            disabled={!hasNext}
            onClick={() => navigate('next')}
            className="btn-glow-sky rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sky-300 hover:bg-sky-500/15 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Detail dialog */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setDetail(null)}>
          <div
            className="animate-slide-up w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#0f1124] p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <LevelBadge level={detail.severity} />
                <span className="font-mono text-xs text-slate-500">{fmt(detail.timestamp ?? detail.created_at)}</span>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-500 hover:text-rose-300 text-lg leading-none transition-colors">✕</button>
            </div>

            <div className="mb-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Message</p>
              <p className="rounded-xl bg-white/5 px-4 py-3 text-sm text-slate-200 leading-relaxed">{detail.message}</p>
            </div>

            {detail.raw_message && detail.raw_message !== detail.message && (
              <div className="mb-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Raw</p>
                <pre className="overflow-x-auto rounded-xl bg-white/5 px-4 py-3 text-xs text-slate-400 whitespace-pre-wrap break-all">{detail.raw_message}</pre>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs mt-4">
              <div className="rounded-xl bg-white/5 px-3 py-2.5">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Source ID</span>
                <p className="mt-1 text-slate-300 font-mono text-[11px]">{detail.source_id}</p>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2.5">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Source type</span>
                <p className="mt-1 text-slate-300">{detail.source_type}</p>
              </div>
            </div>

            {detail.metadata && Object.keys(detail.metadata).length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Metadata</p>
                <pre className="overflow-x-auto rounded-xl bg-white/5 px-4 py-3 text-xs text-slate-400">{JSON.stringify(detail.metadata, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
