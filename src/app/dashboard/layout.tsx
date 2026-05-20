import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SidebarNav from './_components/SidebarNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

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
    <div className="flex h-screen bg-[#0b0d1a] text-white">
      <SidebarNav email={user.email ?? ''} onSignOut={signOut} openAlarms={openAlarms ?? 0} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  )
}
