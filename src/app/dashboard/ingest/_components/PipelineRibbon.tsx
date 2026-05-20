'use client'

interface Props {
  state: 'idle' | 'parsing' | 'inserting' | 'done' | 'error'
}

const STEPS = [
  { id: 'detect', label: 'Detect', detail: 'Format auto-detect' },
  { id: 'parse', label: 'Parse', detail: 'Adapter selection' },
  { id: 'normalize', label: 'Normalize', detail: 'Canonical event shape' },
  { id: 'rules', label: 'Rules', detail: 'Alarm signatures' },
  { id: 'store', label: 'Store', detail: 'Append-only insert' },
] as const

function activeIndex(state: Props['state']) {
  if (state === 'idle') return -1
  if (state === 'parsing') return 1
  if (state === 'inserting') return 4
  if (state === 'done') return STEPS.length
  return -1
}

export default function PipelineRibbon({ state }: Props) {
  const active = activeIndex(state)

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Pipeline
        </p>
        <p className="font-mono text-[10px] text-zinc-500">
          {state === 'idle' && '· awaiting input'}
          {state === 'parsing' && '· parsing'}
          {state === 'inserting' && '· writing to supabase'}
          {state === 'done' && '· complete'}
          {state === 'error' && '· error'}
        </p>
      </div>

      <div className="flex items-stretch gap-1">
        {STEPS.map((step, i) => {
          const isDone = state === 'done' || i < active
          const isActive = i === active
          return (
            <div key={step.id} className="flex flex-1 items-stretch gap-1">
              <div
                className={`relative flex-1 rounded-md border px-3 py-2 transition-colors ${
                  isActive
                    ? 'border-transparent'
                    : isDone
                      ? 'border-zinc-700 bg-zinc-900'
                      : 'border-zinc-800 bg-zinc-950'
                }`}
                style={
                  isActive
                    ? {
                        background: 'var(--app-accent-dim)',
                        boxShadow: '0 0 0 1px var(--app-accent)',
                      }
                    : undefined
                }
              >
                <p
                  className={`text-[11px] font-medium ${
                    isActive ? '' : isDone ? 'text-zinc-200' : 'text-zinc-500'
                  }`}
                  style={isActive ? { color: 'var(--app-accent)' } : undefined}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 font-mono text-[9px] text-zinc-500">{step.detail}</p>
                {isActive && (
                  <span className="absolute right-2 top-2 inline-flex h-1.5 w-1.5">
                    <span
                      className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                      style={{ background: 'var(--app-accent)' }}
                    />
                    <span
                      className="relative inline-flex h-1.5 w-1.5 rounded-full"
                      style={{ background: 'var(--app-accent)' }}
                    />
                  </span>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex w-3 items-center justify-center">
                  <svg viewBox="0 0 12 24" className="h-4 w-3" fill="none" stroke="#3f3f46" strokeWidth={1.5}>
                    <path d="M2 4l6 8-6 8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-zinc-800 bg-zinc-950/50 px-3 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-800 text-zinc-400">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.7}>
            <path d="M12 3l8 4v6c0 4.5-3.5 7.5-8 8-4.5-.5-8-3.5-8-8V7l8-4Z" strokeLinejoin="round" />
            <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="text-[11px] text-zinc-400">
          Handoff to <span className="font-mono text-zinc-300">edge:embed-cluster-summarize</span>
        </p>
        <span className="ml-auto rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
          async
        </span>
      </div>
    </div>
  )
}
