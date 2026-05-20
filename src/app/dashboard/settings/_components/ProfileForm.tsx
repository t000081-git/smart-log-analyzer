'use client'

import { useState, useTransition } from 'react'
import { updateDisplayName } from '@/actions/settings'

export default function ProfileForm({ initialDisplayName }: { initialDisplayName: string }) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('idle')
    setError(null)
    startTransition(async () => {
      const res = await updateDisplayName(displayName)
      if (res.ok) {
        setStatus('saved')
      } else {
        setStatus('error')
        setError(res.message ?? 'Update failed')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Display name
        </span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value)
            setStatus('idle')
          }}
          maxLength={80}
          placeholder="How you want to be addressed"
          className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:outline-none"
        />
      </label>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs">
          {status === 'saved' && <span className="text-emerald-400">Saved.</span>}
          {status === 'error' && error && <span className="text-rose-400">{error}</span>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-sky-500/90 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
