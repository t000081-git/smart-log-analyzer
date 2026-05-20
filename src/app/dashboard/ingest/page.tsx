import IngestForm from './_components/IngestForm'

export const dynamic = 'force-dynamic'

export default function IngestPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            /dashboard/ingest
          </span>
          <h1 className="mt-1 text-3xl font-semibold text-white tracking-tight">
            Ingest console
          </h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Drop logs into the SIEM pipeline. Events are parsed, normalised, scored against
            alarm signatures, then handed off to the AI cluster engine.
          </p>
        </div>

        <div
          className="flex items-center gap-2 rounded-full border px-3 py-1.5"
          style={{
            borderColor: 'var(--app-accent-dim)',
            background: 'var(--app-accent-dim)',
          }}
        >
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
          <span
            className="font-mono text-xs"
            style={{ color: 'var(--app-accent)' }}
          >
            pipeline online
          </span>
        </div>
      </header>

      <IngestForm />
    </div>
  )
}
