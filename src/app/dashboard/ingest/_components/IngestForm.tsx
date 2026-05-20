'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ingestText, type IngestResult } from '@/actions/ingest'
import ConnectorGrid, { type ConnectorId } from './ConnectorGrid'
import PipelineRibbon from './PipelineRibbon'
import LivePreview from './LivePreview'

const UPLOAD_MAX = 5 * 1024 * 1024
const PASTE_MAX = 1 * 1024 * 1024

type PipelineState = 'idle' | 'parsing' | 'inserting' | 'done' | 'error'

export default function IngestForm() {
  const [connector, setConnector] = useState<ConnectorId>('file')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [content, setContent] = useState('')
  const [filename, setFilename] = useState<string>('')
  const [sourceId, setSourceId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<IngestResult | null>(null)
  const [pipelineState, setPipelineState] = useState<PipelineState>('idle')
  const [pending, startTransition] = useTransition()

  async function handleFile(f: File | null) {
    setError(null)
    setResult(null)
    setPipelineState('idle')
    if (!f) {
      setFile(null)
      setContent('')
      setFilename('')
      return
    }
    if (f.size > UPLOAD_MAX) {
      setError(`File exceeds 5 MB limit (got ${(f.size / 1024 / 1024).toFixed(1)} MB)`)
      setFile(null)
      setContent('')
      return
    }
    setFile(f)
    setFilename(f.name)
    try {
      const txt = await f.text()
      setContent(txt)
    } catch {
      setError('Could not read file.')
    }
  }

  function handlePaste(value: string) {
    setText(value)
    setContent(value)
    setFilename('paste.log')
    setError(null)
    setResult(null)
    setPipelineState('idle')
  }

  function reset() {
    setFile(null)
    setText('')
    setContent('')
    setFilename('')
    setSourceId('')
    setError(null)
    setResult(null)
    setPipelineState('idle')
  }

  function submit() {
    setError(null)
    setResult(null)

    if (connector === 'file' && !file) {
      setError('Choose a file first.')
      return
    }
    if (connector === 'paste') {
      if (!text.trim()) {
        setError('Paste some log content first.')
        return
      }
      if (new Blob([text]).size > PASTE_MAX) {
        setError('Pasted content exceeds 1 MB. Use the file connector instead.')
        return
      }
    }

    startTransition(async () => {
      setPipelineState('parsing')
      const payload = connector === 'file' ? content : text
      const fname = connector === 'file' ? filename : 'paste.log'
      setPipelineState('inserting')
      const res = await ingestText({
        content: payload,
        source_id: sourceId.trim() || fname.replace(/\.[^.]+$/, ''),
        filename: fname,
      })
      setResult(res)
      if (!res.ok && res.message) setError(res.message)
      setPipelineState(res.ok ? 'done' : 'error')
    })
  }

  const canSubmit =
    !pending &&
    ((connector === 'file' && Boolean(file)) || (connector === 'paste' && text.trim().length > 0))

  return (
    <div className="space-y-6">
      <section>
        <header className="mb-3 flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Connector
          </span>
          <h2 className="text-sm font-semibold text-zinc-100">Choose a source</h2>
        </header>
        <ConnectorGrid active={connector} onSelect={setConnector} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            {connector === 'file' ? (
              <FileInput file={file} onChange={handleFile} />
            ) : (
              <PasteInput value={text} onChange={handlePaste} />
            )}

            <div className="mt-5 border-t border-zinc-800 pt-5">
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Source ID <span className="text-zinc-600">(optional)</span>
              </label>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md"
                  style={{ background: 'var(--app-accent-dim)', color: 'var(--app-accent)' }}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}>
                    <rect x="3" y="6" width="18" height="12" rx="2" />
                    <path d="M7 10h.01M11 10h.01M7 14h6" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  placeholder="hostname-or-tag (defaults to filename)"
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-[var(--app-accent)] focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-3">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                </svg>
                <p className="text-sm text-rose-300">{error}</p>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] text-zinc-500">
                append-only · service-role insert · rls bypass
              </p>
              <div className="flex items-center gap-2">
                {(content || result) && (
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background: canSubmit ? 'var(--app-accent)' : '#3f3f46',
                    boxShadow: canSubmit ? '0 8px 24px -10px var(--app-glow)' : undefined,
                  }}
                >
                  {pending && (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="9" opacity={0.25} />
                      <path d="M21 12a9 9 0 0 1-9 9" strokeLinecap="round" />
                    </svg>
                  )}
                  {pending ? 'Ingesting' : 'Ingest payload'}
                </button>
              </div>
            </div>
          </div>

          <PipelineRibbon state={pipelineState} />

          {result && result.ok && <ResultCard result={result} />}
        </div>

        <div className="lg:col-span-2">
          <LivePreview content={content} filename={filename} sourceId={sourceId} />
        </div>
      </section>
    </div>
  )
}

function FileInput({
  file,
  onChange,
}: {
  file: File | null
  onChange: (f: File | null) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
        Log file payload
      </label>
      <label
        htmlFor="ingest-file"
        className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-8 text-center transition-colors hover:border-zinc-700"
      >
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: 'var(--app-accent-dim)', color: 'var(--app-accent)' }}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M12 4v12m0 0-4-4m4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 20h16" strokeLinecap="round" />
          </svg>
        </span>
        <p className="mt-3 text-sm text-zinc-200">
          {file ? file.name : 'Drop or browse · .log · .json · .syslog'}
        </p>
        <p className="mt-1 font-mono text-[10px] text-zinc-500">
          {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Max 5 MB · UTF-8'}
        </p>
        <input
          id="ingest-file"
          type="file"
          accept=".log,.txt,.json,.syslog,.messages"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
      </label>
    </div>
  )
}

function PasteInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
        Paste log payload
      </label>
      <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950 focus-within:border-[var(--app-accent)]">
        <div className="flex items-center gap-1.5 border-b border-zinc-800 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500/60" />
          <span className="h-2 w-2 rounded-full bg-amber-500/60" />
          <span className="h-2 w-2 rounded-full bg-emerald-500/60" />
          <span className="ml-2 font-mono text-[10px] text-zinc-500">stdin · live</span>
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={11}
          className="w-full resize-y bg-transparent px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          placeholder={'2026-05-20T10:00:00Z ERROR failed login for user admin\n2026-05-20T10:01:00Z WARN  disk io slow sda1\n{"ts":"2026-05-20T10:02:00Z","level":"critical","msg":"raid degraded"}'}
        />
      </div>
      <p className="mt-2 font-mono text-[10px] text-zinc-500">Max 1 MB · ISO 8601, JSON-lines, or syslog</p>
    </div>
  )
}

function ResultCard({ result }: { result: IngestResult }) {
  return (
    <div className="overflow-hidden rounded-xl border border-emerald-500/20 bg-zinc-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at top right, rgba(16,185,129,0.10), transparent 60%)',
        }}
      />
      <div className="relative flex items-center justify-between border-b border-emerald-500/10 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="text-sm font-medium text-emerald-200">Ingest complete</p>
        </div>
        <Link
          href="/dashboard/timeline"
          className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-xs text-zinc-200 hover:border-zinc-600 transition-colors"
        >
          View on timeline
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
      <div className="relative grid grid-cols-3 divide-x divide-zinc-800">
        <Metric label="Events stored" value={result.inserted} accent="accent" />
        <Metric label="Alarms raised" value={result.alarms} accent={result.alarms > 0 ? 'rose' : 'zinc'} />
        <Metric label="Parse errors" value={result.parseErrors} accent={result.parseErrors > 0 ? 'amber' : 'zinc'} />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: 'accent' | 'rose' | 'amber' | 'zinc'
}) {
  const color =
    accent === 'rose'
      ? '#fda4af'
      : accent === 'amber'
        ? '#fcd34d'
        : accent === 'accent'
          ? 'var(--app-accent)'
          : '#e4e4e7'
  return (
    <div className="px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums" style={{ color }}>
        {value.toLocaleString()}
      </p>
    </div>
  )
}
