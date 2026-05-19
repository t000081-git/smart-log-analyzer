'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type UserRole = 'viewer' | 'admin' | 'root'

// Replace a user's role. Callers must be root — enforced at both app and RLS layer.
// Throws on any error so Next.js surfaces it via error.tsx.
export async function setUserRole(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const targetUserId = formData.get('user_id') as string
  const newRole = formData.get('role') as UserRole

  if (!targetUserId || !['viewer', 'admin', 'root'].includes(newRole)) {
    throw new Error('Invalid input')
  }

  // Prevent self-demotion (root removing their own root row loses admin access).
  if (targetUserId === user.id) throw new Error('Cannot change your own role')

  // Delete any existing role row for the target user, then insert the new one.
  // RLS enforces root-only: if current user is not root both operations fail.
  const { error: delErr } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', targetUserId)

  if (delErr) throw new Error(delErr.message)

  if (newRole !== 'viewer') {
    // viewer means "no row" — already handled by delete above.
    const { error: insErr } = await supabase
      .from('user_roles')
      .insert({ user_id: targetUserId, role: newRole, granted_by: user.id })

    if (insErr) throw new Error(insErr.message)
  }

  revalidatePath('/dashboard/admin')
}
