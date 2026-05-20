import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SidebarNav from './_components/SidebarNav'
import { getTheme, THEME_COOKIE } from '@/lib/themes'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const theme = getTheme(cookieStore.get(THEME_COOKIE)?.value)

  // Open-alarm count for sidebar badge — degrades to 0 if table missing/RLS-blocked
  const { count: openAlarms } = await supabase
    .from('alarms')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div
      className="flex h-screen bg-zinc-950 text-white"
      style={
        {
          '--app-accent': theme.accent,
          '--app-accent-dim': theme.accentDim,
          '--app-glow': theme.glow,
        } as React.CSSProperties
      }
      data-theme={theme.id}
    >
      <SidebarNav email={user.email ?? ''} openAlarms={openAlarms ?? 0} onSignOut={signOut} />
      <main className="relative flex-1 overflow-y-auto">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage:
              'radial-gradient(ellipse at top, black 35%, transparent 85%)',
            WebkitMaskImage:
              'radial-gradient(ellipse at top, black 35%, transparent 85%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{
            backgroundImage: `radial-gradient(ellipse at top, ${theme.glow}, transparent 70%)`,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-zinc-700/40 to-transparent"
        />
        <div className="relative p-8">{children}</div>
      </main>
    </div>
  )
}
