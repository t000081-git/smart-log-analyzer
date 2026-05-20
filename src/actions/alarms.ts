'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function clearAlarm(id: string, notes: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }

  const { error } = await supabase
    .from('alarms')
    .update({
      status:     'cleared',
      cleared_by: user.id,
      cleared_at: new Date().toISOString(),
      notes:      notes || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/alarms')
  revalidatePath('/dashboard')
  return { success: true }
}
