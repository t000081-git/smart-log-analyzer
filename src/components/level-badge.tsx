import { cn } from '@/lib/utils'

type Severity = 'debug' | 'info' | 'warning' | 'error' | 'critical'

const STYLES: Record<Severity, string> = {
  debug:    'bg-slate-800/80  text-slate-400  ring-slate-600/40',
  info:     'bg-sky-900/50    text-sky-300    ring-sky-500/40    shadow-[0_0_8px_rgba(125,211,252,0.15)]',
  warning:  'bg-amber-900/50  text-amber-200  ring-amber-500/50  shadow-[0_0_8px_rgba(253,230,138,0.20)]',
  error:    'bg-rose-900/50   text-rose-300   ring-rose-500/40   shadow-[0_0_8px_rgba(253,164,175,0.20)]',
  critical: 'bg-red-900/60    text-red-200    ring-red-400/70    shadow-[0_0_12px_rgba(248,113,113,0.35)] ring-2 animate-glow-pulse',
}

export function LevelBadge({ level }: { level: string }) {
  const sev = (level ?? 'info').toLowerCase() as Severity
  const style = STYLES[sev] ?? STYLES.info
  return (
    <span className={cn('inline-flex items-center rounded-xl px-2 py-0.5 text-xs font-semibold tracking-wide ring-1', style)}>
      {sev}
    </span>
  )
}
