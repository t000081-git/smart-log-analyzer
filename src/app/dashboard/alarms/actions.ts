'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function clearAlarm(formData: FormData): Promise<void> {
  const alarmId = formData.get('alarm_id') as string
  if (!alarmId) throw new Error('alarm_id required')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // RLS enforces has_permission(clear_alarms) OR is_admin_or_root.
  const { error } = await supabase
    .from('alarms')
    .update({
      status: 'cleared',
      cleared_by: user.id,
      cleared_at: new Date().toISOString(),
    })
    .eq('id', alarmId)
    .eq('status', 'open')  // idempotent — no-op if already cleared

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/alarms')
}
