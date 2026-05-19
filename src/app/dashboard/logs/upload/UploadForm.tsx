'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'

type Status = 'idle' | 'uploading' | 'done' | 'error'

interface IngestResult {
  ok: boolean
  inserted: number
  detectedFormat: string
  parseErrors: number
  wasCapped: boolean
  totalParsed: number
  clusteringQueued: boolean
}

const FORMAT_LABELS: Record<string, string> = {
  linux_syslog: 'Linux syslog (RFC 3164 / RFC 5424)',
  prtg: 'PRTG CSV export',
  generic_text: 'Generic text (line-per-event)',
}

export default function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<IngestResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function pickFile(f: File) {
    setFile(f)
    setStatus('idle')
    setResult(null)
    setErrorMsg(null)
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) pickFile(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }

  async function upload() {
    if (!file) return
    setStatus('uploading')
    setErrorMsg(null)

    const fd = new FormData()
    fd.append('file', file)

    try {
      const res = await fetch('/api/ingest', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setStatus('error')
        setErrorMsg(json.error ?? `HTTP ${res.status}`)
      } else {
        setStatus('done')
        setResult(json as IngestResult)
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Network error')
    }
  }

  const sizeLabel = file
    ? file.size < 1024
      ? `${file.size} B`
      : file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(1)} KB`
        : `${(file.size / 1024 / 1024).toFixed(1)} MB`
    : null

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-14 text-center transition-colors ${
          dragging
            ? 'border-sky-500 bg-sky-950/20'
            : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".log,.txt,.csv,.syslog,.messages,.out"
          className="sr-only"
          onChange={onFileInput}
        />

        {file ? (
          <>
            <div className="mb-2 text-3xl">📄</div>
            <p className="text-sm font-medium text-white">{file.name}</p>
            <p className="mt-1 text-xs text-zinc-400">{sizeLabel}</p>
            <p className="mt-3 text-xs text-zinc-500">Click or drop to replace</p>
          </>
        ) : (
          <>
            <div className="mb-3 text-4xl">↑</div>
            <p className="text-sm font-medium text-zinc-300">Drop a log file here</p>
            <p className="mt-1 text-xs text-zinc-500">or click to browse</p>
            <p className="mt-4 text-[11px] text-zinc-600">
              Supports: Linux syslog · PRTG CSV · generic text · max 4 MB
            </p>
          </>
        )}
      </div>

      {/* Action button */}
      {file && status !== 'done' && (
        <button
          onClick={upload}
          disabled={status === 'uploading'}
          className="w-full rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'uploading' ? 'Uploading & parsing…' : 'Upload & Ingest'}
        </button>
      )}

      {/* Error */}
      {status === 'error' && errorMsg && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Success */}
      {status === 'done' && result && (
        <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-5 py-4 space-y-3">
          <p className="text-sm font-semibold text-emerald-300">
            {result.inserted.toLocaleString()} events ingested
          </p>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-400">
            <dt>Format detected</dt>
            <dd className="text-zinc-200">
              {FORMAT_LABELS[result.detectedFormat] ?? result.detectedFormat}
            </dd>

            {result.parseErrors > 0 && (
              <>
                <dt>Parse errors</dt>
                <dd className="text-amber-300">{result.parseErrors} lines skipped</dd>
              </>
            )}

            {result.wasCapped && (
              <>
                <dt>Truncated</dt>
                <dd className="text-amber-300">
                  first 2000 of {result.totalParsed.toLocaleString()} parsed lines
                </dd>
              </>
            )}

            <dt>Clustering</dt>
            <dd className="text-zinc-200">
              {result.clusteringQueued
                ? 'Queued — check Clusters in ~30 s'
                : 'Not triggered (env not configured)'}
            </dd>
          </dl>

          <div className="flex gap-3 pt-1">
            <Link
              href="/dashboard/logs"
              className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600 transition-colors"
            >
              View logs →
            </Link>
            <Link
              href="/dashboard/clusters"
              className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600 transition-colors"
            >
              View clusters →
            </Link>
            <button
              onClick={() => { setFile(null); setStatus('idle'); setResult(null) }}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Upload another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
