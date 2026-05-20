'use client'

import { useMemo } from 'react'
import { parseLog } from '@/lib/parser'
import type { LogSeverity, NormalizedLogEvent } from '@/types/database'

const SEVERITY_ORDER: LogSeverity[] = ['critical', 'error', 'warning', 'info', 'debug']
const SEVERITY_COLOR: Record<LogSeverity, string> = {
  critical: '#dc2626',
  error: '#f43f5e',
  warning: '#f59e0b',
  info: '#38bdf8',
  debug: '#71717a',
}

const PREVIEW_BYTES = 32 * 1024

export default function LivePreview({
  content,
  filename,
  sourceId,
}: {
  content: string
  filename?: string
  sourceId: string
}) {
  const stats = useMemo(() => {
    const sample = content.length > PREVIEW_BYTES ? content.slice(0, PREVIEW_BYTES) : content
    const sid = sourceId || (filename ? filename.replace(/\.[^.]+$/, '') : 'preview')
    const { events, parseErrors } = parseLog(sample, sid, filename ?? 'preview.log')
    const counts: Record<LogSeverity, number> = {
      critical: 0, error: 0, warning: 0, info: 0, debug: 0,
    }
    for (const e of events) counts[e.severity] += 1
    const total = events.length
    const lines = sample.split(/\r?\n/).filter((l) => l.trim().length > 0).length
    const sourceType = events[0]?.source_type ?? 'generic_text'
    return {
      lines,
      total,
      counts,
      first: events.slice(0, 4),
      truncated: content.length > PREVIEW_BYTES,
      sourceType,
      parseErrors: parseErrors.length,
    }
  }, [content, filename, sourceId])

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-10 text-center">
        <svg viewBox="0 0 48 48" className="h-8 w-8 text-zinc-700" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M8 12h32M8 24h32M8 36h32" strokeLinecap="round" />
        </svg>
        <p className="mt-3 text-sm text-zinc-400">No payload yet</p>
        <p className="mt-1 text-xs text-zinc-500">Select a file or paste lines to see a live parse preview.</p>
      </div>
    )
  }

  const maxCount = Math.max(...Object.values(stats.counts), 1)

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ background: 'var(--app-accent)' }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: 'var(--app-accent)' }}
            />
          </span>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            Live preview · {stats.sourceType}
          </p>
        </div>
        {stats.truncated && (
          <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-300">
            sampled {PREVIEW_BYTES / 1024}KB
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 divide-x divide-zinc-800 border-b border-zinc-800 text-center">
        <Tile label="Lines" value={stats.lines} accent="zinc" />
        <Tile label="Detected" value={stats.total} accent="accent" />
        <Tile label="Errors" value={stats.parseErrors} accent={stats.parseErrors > 0 ? 'rose' : 'zinc'} />
      </div>

      <div className="px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Severity composition</p>
        <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-zinc-900">
          {SEVERITY_ORDER.map((sev) => {
            const n = stats.counts[sev]
            if (n === 0) return null
            const pct = (n / Math.max(stats.total, 1)) * 100
            return (
              <div
                key={sev}
                style={{
                  width: `${pct}%`,
                  background: SEVERITY_COLOR[sev],
                  boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.2)`,
                }}
                title={`${sev}: ${n}`}
              />
            )
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          {SEVERITY_ORDER.map((sev) => {
            const n = stats.counts[sev]
            if (n === 0) return null
            const pct = Math.round((n / Math.max(stats.total, 1)) * 100)
            return (
              <span
                key={sev}
                className="inline-flex items-center gap-1 font-mono text-[10px]"
                style={{ color: SEVERITY_COLOR[sev] }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEVERITY_COLOR[sev] }} />
                {sev} · {n} ({pct}%)
              </span>
            )
          })}
        </div>
      </div>

      {stats.first.length > 0 && (
        <div className="border-t border-zinc-800 px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            First {stats.first.length} events
          </p>
          <ul className="mt-2 space-y-1.5">
            {stats.first.map((e, i) => (
              <PreviewLine key={i} event={e} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: 'zinc' | 'accent' | 'rose'
}) {
  const color =
    accent === 'rose'
      ? '#fda4af'
      : accent === 'accent'
        ? 'var(--app-accent)'
        : '#e4e4e7'
  return (
    <div className="px-3 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums" style={{ color }}>
        {value.toLocaleString()}
      </p>
    </div>
  )
}

function PreviewLine({ event }: { event: NormalizedLogEvent }) {
  return (
    <li className="flex items-start gap-2.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5">
      <span
        className="mt-0.5 inline-flex h-4 items-center rounded-sm px-1.5 font-mono text-[9px] uppercase tracking-wider"
        style={{
          background: SEVERITY_COLOR[event.severity] + '22',
          color: SEVERITY_COLOR[event.severity],
        }}
      >
        {event.severity}
      </span>
      <span className="font-mono text-[10px] text-zinc-600 shrink-0">
        {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-300">
        {event.message}
      </p>
    </li>
  )
}
