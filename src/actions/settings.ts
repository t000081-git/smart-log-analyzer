'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateDisplayName(displayName: string): Promise<{
  ok: boolean
  message?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'unauthorized' }

  const trimmed = displayName.trim().slice(0, 80)
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed || null, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return { ok: false, message: error.message }
  revalidatePath('/dashboard/settings')
  return { ok: true }
}
