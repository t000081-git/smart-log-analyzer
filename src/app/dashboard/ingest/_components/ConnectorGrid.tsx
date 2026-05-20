'use client'

import type { ReactNode } from 'react'

export type ConnectorId =
  | 'file'
  | 'paste'
  | 'syslog'
  | 'webhook'
  | 's3'
  | 'splunk_hec'

export interface Connector {
  id: ConnectorId
  label: string
  hint: string
  icon: ReactNode
  status: 'ready' | 'soon'
}

export const CONNECTORS: Connector[] = [
  {
    id: 'file',
    label: 'File Upload',
    hint: 'Drop a .log / .json / .syslog',
    status: 'ready',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" strokeLinejoin="round" />
        <path d="M14 3v5h5" strokeLinejoin="round" />
        <path d="M9 14l3-3 3 3M12 11v6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'paste',
    label: 'Paste Buffer',
    hint: 'Ad-hoc lines · max 1 MB',
    status: 'ready',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 4h6v3H9z" />
        <path d="M9 12h6M9 16h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'syslog',
    label: 'Syslog Forwarder',
    hint: 'rsyslog · UDP 514',
    status: 'ready',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M4 12a8 8 0 0 1 16 0" />
        <path d="M7 12a5 5 0 0 1 10 0" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'webhook',
    label: 'REST Webhook',
    hint: 'POST /v1/ingest',
    status: 'ready',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M10 4a4 4 0 0 1 7.5 1.5l-3 5.5" strokeLinecap="round" />
        <path d="M20 14a4 4 0 0 1-5 4l-3-5" strokeLinecap="round" />
        <path d="M9 20a4 4 0 0 1-5-5l3-5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 's3',
    label: 'S3 Bucket',
    hint: 'Object polling · prefix scan',
    status: 'ready',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <ellipse cx="12" cy="6" rx="8" ry="2.5" />
        <path d="M4 6v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6M4 12v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6" />
      </svg>
    ),
  },
  {
    id: 'splunk_hec',
    label: 'Splunk HEC',
    hint: 'Token auth · /services/collector',
    status: 'ready',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M4 4h16v6H4z" />
        <path d="M4 14h10v6H4z" />
        <path d="M17 14l3 3-3 3M20 17h-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

interface Props {
  active: ConnectorId
  onSelect: (id: ConnectorId) => void
}

export default function ConnectorGrid({ active, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {CONNECTORS.map((c) => {
        const isActive = c.id === active
        const isReady = c.status === 'ready'
        return (
          <button
            key={c.id}
            type="button"
            disabled={!isReady}
            onClick={() => onSelect(c.id)}
            className={`group relative overflow-hidden rounded-xl border bg-zinc-950 p-4 text-left transition-all ${
              !isReady
                ? 'border-dashed border-zinc-800 opacity-60 cursor-not-allowed'
                : isActive
                  ? 'border-transparent'
                  : 'border-zinc-800 hover:border-zinc-700'
            }`}
            style={
              isActive && isReady
                ? {
                    boxShadow:
                      '0 0 0 1px var(--app-accent), 0 8px 20px -8px var(--app-glow)',
                  }
                : undefined
            }
          >
            {isActive && isReady && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    'radial-gradient(ellipse at top right, var(--app-glow), transparent 60%)',
                }}
              />
            )}
            <div className="relative flex items-start justify-between">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{
                  background: isActive && isReady ? 'var(--app-accent-dim)' : '#27272a',
                  color: isActive && isReady ? 'var(--app-accent)' : '#a1a1aa',
                }}
              >
                <span className="block h-5 w-5">{c.icon}</span>
              </div>

              {!isReady ? (
                <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                  soon
                </span>
              ) : isActive ? (
                <span className="flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                  style={{ background: 'var(--app-accent-dim)', color: 'var(--app-accent)' }}>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                      style={{ background: 'var(--app-accent)' }} />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full"
                      style={{ background: 'var(--app-accent)' }} />
                  </span>
                  selected
                </span>
              ) : (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
                  ready
                </span>
              )}
            </div>

            <div className="relative mt-3">
              <p className="text-sm font-medium text-zinc-100">{c.label}</p>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{c.hint}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
