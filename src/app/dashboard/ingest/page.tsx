import { GitMerge } from 'lucide-react'

export default function IngestPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ingest</h1>
      <div className="max-w-lg rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-8">
        <div className="mb-4 flex items-center gap-2">
          <GitMerge size={18} className="text-zinc-500" />
          <span className="text-sm font-medium text-zinc-400">Pending merge</span>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">
          The <strong className="text-zinc-200">Ingest</strong> module is being built by{' '}
          <strong className="text-zinc-200">user-mohamad</strong> on the{' '}
          <code className="rounded-lg bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">mohamad</code>{' '}
          branch.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Once Mohamad opens a PR to <code className="rounded-lg bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">staging</code>,
          this page will be replaced by the real implementation.
        </p>
        <div className="mt-5 rounded-lg bg-zinc-800/60 px-4 py-3 text-xs text-zinc-500 space-y-1">
          <p className="font-medium text-zinc-400">Expected in this module:</p>
          <ul className="mt-1 space-y-0.5 list-disc list-inside">
            <li>File upload (.log, .txt, .json, .csv — max 5 MB)</li>
            <li>Paste raw text tab</li>
            <li>Format auto-detection (plain, JSON-lines, CSV)</li>
            <li>Progress feedback + inserted / error counts</li>
          </ul>
        </div>
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-xs text-zinc-500">
          <p className="font-medium text-zinc-400 mb-1">Temporary workaround</p>
          <p>Use the seed script to populate logs for testing:</p>
          <code className="mt-1 block text-zinc-400">pnpm seed:logs</code>
        </div>
      </div>
    </div>
  )
}
