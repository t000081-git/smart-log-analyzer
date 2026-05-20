'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { LevelBadge } from '@/components/level-badge'
import { clearAlarm } from '@/actions/alarms'

type AlarmRow = {
  id: string
  created_at: string
  severity: string
  status: string
  notes: string | null
  cleared_at: string | null
  cluster_id: string | null
  cluster_label: string | null
}

interface Props {
  rows: AlarmRow[]
  canClear: boolean
}

function fmt(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })
}

function StatusBadge({ status }: { status: string }) {
  const s = status === 'open'
    ? 'bg-amber-900/50 text-amber-200 ring-amber-500/40 shadow-[0_0_8px_rgba(253,230,138,0.18)]'
    : 'bg-teal-900/40 text-teal-400 ring-teal-700/30'
  return (
    <span className={`inline-flex items-center rounded-xl px-2 py-0.5 text-xs font-semibold ring-1 ${s}`}>
      {status}
    </span>
  )
}

function ClearDialog({ alarmId, onClose }: { alarmId: string; onClose: () => void }) {
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState('')

  const submit = () => {
    startTransition(async () => {
      const res = await clearAlarm(alarmId, notes)
      if (res?.error) setErr(res.error)
      else onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="animate-slide-up w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1124] p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="mb-1 text-sm font-semibold text-slate-100">Clear alarm</h2>
        <p className="mb-4 text-xs text-slate-500">Optionally add a note before clearing.</p>

        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Resolution notes (optional)"
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-400/50 resize-none transition-all"
        />

        {err && <p className="mt-2 text-xs text-rose-400">{err}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-glow-rose rounded-xl border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="btn-glow-teal rounded-xl bg-teal-500/25 px-4 py-1.5 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/40 hover:bg-teal-500/35 disabled:opacity-40 transition-colors"
          >
            {pending ? 'Clearing…' : 'Clear alarm ✓'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AlarmTable({ rows, canClear }: Props) {
  const [clearingId, setClearingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'cleared'>('all')
  const [sevFilter, setSevFilter] = useState('')

  const filtered = rows.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (sevFilter && r.severity !== sevFilter) return false
    return true
  })

  const STATUS_STYLES: Record<string, string> = {
    all:     'bg-white/10 text-slate-200 ring-white/15',
    open:    'bg-amber-500/20 text-amber-200 ring-amber-400/30 shadow-[0_0_10px_rgba(253,230,138,0.2)]',
    cleared: 'bg-teal-500/20 text-teal-200 ring-teal-400/30',
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur-sm">
        <span className="text-xs font-medium text-slate-500">Status</span>
        {(['all', 'open', 'cleared'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={[
              'rounded-xl px-3 py-1 text-xs font-semibold ring-1 transition-all duration-150',
              statusFilter === s
                ? STATUS_STYLES[s]
                : 'text-slate-500 ring-transparent hover:text-slate-300 hover:bg-white/5',
            ].join(' ')}
          >
            {s}
          </button>
        ))}

        <div className="h-4 w-px bg-white/10" />

        <span className="text-xs font-medium text-slate-500">Severity</span>
        <select
          value={sevFilter}
          onChange={e => setSevFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-400/50 transition-all"
        >
          <option value="">All</option>
          {['critical', 'error', 'warning', 'info', 'debug'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <span className="ml-auto text-xs text-slate-600">{filtered.length} alarm{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">Created</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">Severity</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">Cluster</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">Status</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">Notes</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-14 text-center text-sm text-slate-500">No alarms match</td>
              </tr>
            ) : (
              filtered.map(alarm => (
                <tr key={alarm.id} className="hover:bg-white/[0.03] transition-colors duration-100">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-500">{fmt(alarm.created_at)}</td>
                  <td className="px-3 py-2.5"><LevelBadge level={alarm.severity} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {alarm.cluster_id ? (
                      <Link href={`/dashboard/clusters/${alarm.cluster_id}`} className="hover:text-violet-300 transition-colors">
                        {alarm.cluster_label ?? 'Cluster'}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={alarm.status} /></td>
                  <td className="px-3 py-2.5 max-w-[200px] truncate text-xs text-slate-500" title={alarm.notes ?? ''}>
                    {alarm.notes ?? (alarm.cleared_at ? `Cleared ${fmt(alarm.cleared_at)}` : '—')}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {alarm.status === 'open' && (
                      <button
                        onClick={() => setClearingId(alarm.id)}
                        disabled={!canClear}
                        className="btn-glow-amber rounded-xl border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title={canClear ? 'Clear alarm' : 'Requires clear_alarms permission'}
                      >
                        Clear
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {clearingId && (
        <ClearDialog alarmId={clearingId} onClose={() => setClearingId(null)} />
      )}
    </div>
  )
}
