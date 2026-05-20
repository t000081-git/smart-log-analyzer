'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function assertRoot(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'root')
    .maybeSingle()
  return !!data
}

export async function grantRole(targetUserId: string, role: 'viewer' | 'admin' | 'root') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }
  if (!(await assertRoot(supabase, user.id))) return { error: 'Only root can grant roles' }

  // Remove existing role rows for user first (one role per user)
  await supabase.from('user_roles').delete().eq('user_id', targetUserId)

  const { error } = await supabase.from('user_roles').insert({
    user_id:    targetUserId,
    role,
    granted_by: user.id,
  })

  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function setPermission(targetUserId: string, permKey: string, grant: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }
  if (!(await assertRoot(supabase, user.id))) return { error: 'Only root can manage permissions' }

  if (grant) {
    const { error } = await supabase.from('user_permissions').upsert({
      user_id:        targetUserId,
      permission_key: permKey,
      granted_by:     user.id,
    }, { onConflict: 'user_id,permission_key' })
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', targetUserId)
      .eq('permission_key', permKey)
    if (error) return { error: error.message }
  }

  revalidatePath('/dashboard/admin')
  return { success: true }
}
