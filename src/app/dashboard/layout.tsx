import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from './_components/AppShell'
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
    <AppShell
      email={user.email ?? ''}
      openAlarms={openAlarms ?? 0}
      onSignOut={signOut}
      themeStyle={{
        '--app-accent': theme.accent,
        '--app-accent-dim': theme.accentDim,
        '--app-glow': theme.glow,
      } as React.CSSProperties}
      themeId={theme.id}
      glowColor={theme.glow}
    >
      {children}
    </AppShell>
  )
}
