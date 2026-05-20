'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useTransition, useState, Suspense } from 'react'
import { analyzeLogs } from '@/actions/analyze'

function AnalyzeForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const idsParam = searchParams.get('ids') ?? ''
  const ids = idsParam.split(',').filter(Boolean)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState('')

  const run = () => {
    setErr('')
    startTransition(async () => {
      const res = await analyzeLogs(ids)
      if (res?.error) setErr(res.error)
      // On success, analyzeLogs calls redirect() — navigation happens server-side
    })
  }

  if (!ids.length) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 py-16 text-center">
        <p className="text-zinc-400">No logs selected.</p>
        <button onClick={() => router.push('/dashboard/logs')} className="mt-3 text-xs text-violet-400 hover:text-violet-300">
          ← Go to Logs
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-8">
      <h2 className="text-base font-semibold text-zinc-100 mb-1">Ready to analyze</h2>
      <p className="text-sm text-zinc-400 mb-6">
        {ids.length} log event{ids.length !== 1 ? 's' : ''} selected. Claude will produce a summary, threat indicators, and recommendations.
      </p>

      <div className="rounded-lg bg-zinc-800 px-4 py-3 mb-6 text-xs text-zinc-500 space-y-1">
        <p>• Capped at 200 lines / 50 KB — larger batches are sampled evenly.</p>
        <p>• Uses your OpenRouter API key from Settings (or the shared fallback key).</p>
      </div>

      {err && (
        <p className="mb-4 rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-sm text-red-300">{err}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={run}
          disabled={pending}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Analyzing…' : 'Run Analysis'}
        </button>
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function AnalysisNewPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">AI Analysis</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <AnalyzeForm />
      </Suspense>
    </div>
  )
}
