import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UsersTable } from './_components/users-table'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Gate: admin or root only
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const myRole = roleRow?.role ?? 'viewer'
  if (myRole !== 'admin' && myRole !== 'root') redirect('/dashboard')

  const isRoot = myRole === 'root'

  // Fetch all profiles (RLS allows admin/root to see all)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')

  // Fetch all role assignments
  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, role')

  // Fetch all permission grants
  const { data: perms } = await supabase
    .from('user_permissions')
    .select('user_id, permission_key')

  // Fetch auth user emails via service client (profiles don't store email)
  const { createServiceClient } = await import('@/lib/supabase/server')
  const service = createServiceClient()
  const { data: authUsers } = await service.auth.admin.listUsers()

  const emailMap = new Map((authUsers?.users ?? []).map((u: { id: string; email?: string }) => [u.id, u.email ?? '']))
  const rolesMap = new Map((roles ?? []).map(r => [r.user_id, r.role]))
  const permsMap = new Map<string, string[]>()
  for (const p of (perms ?? [])) {
    if (!permsMap.has(p.user_id)) permsMap.set(p.user_id, [])
    permsMap.get(p.user_id)!.push(p.permission_key)
  }

  const users = (profiles ?? []).map(p => ({
    id:           p.id,
    email:        emailMap.get(p.id) ?? p.id,
    display_name: p.display_name,
    role:         rolesMap.get(p.id) ?? null,
    permissions:  permsMap.get(p.id) ?? [],
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ring-1 ${
          isRoot
            ? 'bg-rose-900/40 text-rose-300 ring-rose-700/50'
            : 'bg-sky-900/40 text-sky-300 ring-sky-700/50'
        }`}>
          You are {myRole}
        </span>
      </div>

      {!isRoot && (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-xs text-zinc-500">
          Admin view is read-only. Only <strong className="text-zinc-300">root</strong> can change roles and permissions.
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Users &amp; Roles</h2>
        <UsersTable users={users} isRoot={isRoot} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">System</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-xs text-zinc-500 space-y-1">
          <p>Total users: <span className="text-zinc-300">{users.length}</span></p>
          <p>Root users: <span className="text-zinc-300">{users.filter(u => u.role === 'root').length}</span></p>
          <p>Admin users: <span className="text-zinc-300">{users.filter(u => u.role === 'admin').length}</span></p>
        </div>
      </section>
    </div>
  )
}
