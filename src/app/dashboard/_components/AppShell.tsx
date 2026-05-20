'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X, Bell, Sparkles } from 'lucide-react'
import SidebarNav from './SidebarNav'

interface Props {
  email: string
  openAlarms: number
  onSignOut: () => Promise<void>
  themeStyle: React.CSSProperties
  themeId: string
  glowColor: string
  children: React.ReactNode
}

export default function AppShell({
  email,
  openAlarms,
  onSignOut,
  themeStyle,
  themeId,
  glowColor,
  children,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  return (
    <div
      className="flex h-screen bg-zinc-950 text-white"
      style={themeStyle}
      data-theme={themeId}
    >
      {/* ── Desktop sidebar (always visible ≥ md) ─────────── */}
      <div className="hidden md:flex">
        <SidebarNav email={email} openAlarms={openAlarms} onSignOut={onSignOut} />
      </div>

      {/* ── Mobile drawer overlay ──────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile drawer ─────────────────────────────────── */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-50 flex md:hidden',
          'transition-transform duration-300 ease-in-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <SidebarNav email={email} openAlarms={openAlarms} onSignOut={onSignOut} />
      </div>

      {/* ── Main area ─────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-white/5 bg-[#0f1124]/90 px-4 py-3 backdrop-blur-sm md:hidden">
          <button
            onClick={() => setDrawerOpen(o => !o)}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          >
            {drawerOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-violet-400" strokeWidth={1.75} />
            <span className="text-sm font-bold tracking-tight text-gradient">LogLens</span>
          </div>

          <div className="relative">
            <Bell size={18} className="text-slate-400" strokeWidth={1.75} />
            {openAlarms > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-[9px] font-bold text-slate-950 shadow-[0_0_8px_rgba(251,191,36,0.5)]">
                {openAlarms > 9 ? '9+' : openAlarms}
              </span>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="relative flex-1 overflow-y-auto">
          {/* Dot-grid background */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              maskImage: 'radial-gradient(ellipse at top, black 35%, transparent 85%)',
              WebkitMaskImage: 'radial-gradient(ellipse at top, black 35%, transparent 85%)',
            }}
          />
          {/* Top glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
            style={{ backgroundImage: `radial-gradient(ellipse at top, ${glowColor}, transparent 70%)` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-zinc-700/40 to-transparent"
          />
          <div className="relative p-4 sm:p-6 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
