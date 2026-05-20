'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ScrollText,
  Layers,
  Bell,
  ShieldCheck,
  BrainCircuit,
  Activity,
  Upload,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard',   href: '/dashboard',              icon: LayoutDashboard, exact: true,  color: 'text-sky-300',     glow: 'rgba(125,211,252,0.35)' },
  { label: 'Ingest',      href: '/dashboard/ingest',       icon: Upload,          exact: false, color: 'text-emerald-300', glow: 'rgba(110,231,183,0.35)' },
  { label: 'Logs',        href: '/dashboard/logs',         icon: ScrollText,      exact: false, color: 'text-teal-300',    glow: 'rgba(94,234,212,0.35)' },
  { label: 'Clusters',    href: '/dashboard/clusters',     icon: Layers,          exact: false, color: 'text-violet-300',  glow: 'rgba(167,139,250,0.35)' },
  { label: 'Timeline',    href: '/dashboard/timeline',     icon: Activity,        exact: false, color: 'text-cyan-300',    glow: 'rgba(103,232,249,0.35)' },
  { label: 'Alarms',      href: '/dashboard/alarms',       icon: Bell,            exact: false, color: 'text-amber-300',   glow: 'rgba(253,230,138,0.35)' },
  { label: 'AI Analysis', href: '/dashboard/analysis/new', icon: BrainCircuit,    exact: false, color: 'text-pink-300',    glow: 'rgba(249,168,212,0.35)' },
  { label: 'Admin',       href: '/dashboard/admin',        icon: ShieldCheck,     exact: false, color: 'text-rose-300',    glow: 'rgba(253,164,175,0.35)' },
  { label: 'Settings',    href: '/dashboard/settings',     icon: Settings,        exact: false, color: 'text-slate-300',   glow: 'rgba(203,213,225,0.35)' },
]

interface Props {
  email: string
  openAlarms: number
  onSignOut: () => Promise<void>
}

export default function SidebarNav({ email, openAlarms, onSignOut }: Props) {
  const pathname = usePathname()

  return (
    <aside className="flex w-60 flex-col justify-between border-r border-white/5 bg-[#0f1124] px-3 py-6">
      <div className="flex flex-col gap-6">

        {/* Brand */}
        <div className="px-3 pb-1">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-violet-400 animate-float" strokeWidth={1.75} />
            <span className="text-sm font-bold tracking-tight text-gradient">LogLens</span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-600 tracking-widest uppercase pl-0.5">smart-log-analyzer</p>
        </div>

        {/* Main nav */}
        <nav className="space-y-0.5">
          {NAV_ITEMS.map(({ label, href, icon: Icon, exact, color, glow }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            const isAlarms = href === '/dashboard/alarms'

            return (
              <Link
                key={href}
                href={href}
                style={active ? { '--glow': glow } as React.CSSProperties : undefined}
                className={[
                  'group relative flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium',
                  'transition-all duration-200',
                  active
                    ? `nav-active-bar bg-white/5 ${color} shadow-[inset_0_0_20px_rgba(0,0,0,0.2)]`
                    : 'text-slate-400 hover:bg-white/5 hover:text-white',
                ].join(' ')}
              >
                {/* Hover/active glow layer */}
                {active && (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-xl opacity-20"
                    style={{ background: `radial-gradient(ellipse at 30% 50%, ${glow} 0%, transparent 70%)` }}
                  />
                )}

                <span className="relative flex items-center gap-3">
                  <Icon
                    size={15}
                    strokeWidth={1.75}
                    className={active ? color : `text-slate-600 group-hover:${color} transition-colors duration-200`}
                  />
                  {label}
                </span>

                {isAlarms && openAlarms > 0 && (
                  <span className="relative rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-950 shadow-[0_0_10px_rgba(251,191,36,0.5)]">
                    {openAlarms > 99 ? '99+' : openAlarms}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Footer */}
      <div className="space-y-2 px-1">
        <p className="truncate px-2 text-[11px] text-slate-600">{email}</p>
        <form action={onSignOut}>
          <button
            type="submit"
            className="btn-glow-rose group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 transition-colors duration-200"
          >
            <LogOut size={15} className="text-slate-600 group-hover:text-rose-400 transition-colors duration-200" strokeWidth={1.75} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
