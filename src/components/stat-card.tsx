type Accent = 'sky' | 'violet' | 'amber' | 'emerald' | 'rose'

const ACCENT_STYLES: Record<Accent, { ring: string; dot: string; label: string; glow: string }> = {
  sky:     { ring: 'ring-sky-500/30',     dot: 'bg-sky-400',     label: 'text-sky-300',     glow: 'from-sky-500/10' },
  violet:  { ring: 'ring-violet-500/30',  dot: 'bg-violet-400',  label: 'text-violet-300',  glow: 'from-violet-500/10' },
  amber:   { ring: 'ring-amber-500/30',   dot: 'bg-amber-400',   label: 'text-amber-300',   glow: 'from-amber-500/10' },
  emerald: { ring: 'ring-emerald-500/30', dot: 'bg-emerald-400', label: 'text-emerald-300', glow: 'from-emerald-500/10' },
  rose:    { ring: 'ring-rose-500/30',    dot: 'bg-rose-400',    label: 'text-rose-300',    glow: 'from-rose-500/10' },
}

export function StatCard({
  label,
  value,
  note,
  accent = 'sky',
}: {
  label: string
  value: string | number
  note?: string
  accent?: Accent
}) {
  const a = ACCENT_STYLES[accent]
  return (
    <div className={`relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 ring-1 ${a.ring} transition-transform hover:-translate-y-0.5`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.glow} to-transparent`} />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot} shadow-[0_0_8px_currentColor]`} />
          <p className={`text-xs font-medium uppercase tracking-wide ${a.label}`}>{label}</p>
        </div>
        <p className="mt-2 text-3xl font-semibold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        {note && <p className="mt-1 text-xs text-zinc-500">{note}</p>}
      </div>
    </div>
  )
}
