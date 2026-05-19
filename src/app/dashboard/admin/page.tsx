import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { setUserRole } from './actions'

export const dynamic = 'force-dynamic'

type UserRole = 'viewer' | 'admin' | 'root'

interface RoleRow {
  user_id: string
  role: UserRole
  granted_at: string
  granted_by: string | null
}

const ROLE_ORDER: Record<UserRole, number> = { viewer: 0, admin: 1, root: 2 }

const BADGE: Record<UserRole, string> = {
  viewer: 'bg-zinc-700 text-zinc-300',
  admin:  'bg-blue-900 text-blue-200',
  root:   'bg-amber-900 text-amber-200',
}

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Use admin client to bypass RLS for the full user list and role table.
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch current user's role.
  const { data: myRoleRow } = await adminSupabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle<{ role: UserRole }>()

  const myRole: UserRole = myRoleRow?.role ?? 'viewer'

  // Only admin and root may view this page.
  if (myRole === 'viewer') redirect('/dashboard')

  // Parallel: all auth users + all role rows.
  const [usersRes, rolesRes] = await Promise.all([
    adminSupabase.auth.admin.listUsers(),
    adminSupabase.from('user_roles').select('user_id, role, granted_at, granted_by'),
  ])

  const users = usersRes.data?.users ?? []
  const roleRows = (rolesRes.data as RoleRow[] | null) ?? []

  // Build map: user_id → highest role row (a user could theoretically have >1 row).
  const roleMap = new Map<string, RoleRow>()
  for (const r of roleRows) {
    const existing = roleMap.get(r.user_id)
    if (!existing || ROLE_ORDER[r.role] > ROLE_ORDER[existing.role]) {
      roleMap.set(r.user_id, r)
    }
  }

  const isRoot = myRole === 'root'

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Admin — User Management</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Your role:{' '}
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${BADGE[myRole]}`}>
            {myRole}
          </span>
          {!isRoot && (
            <span className="ml-2 text-zinc-500">
              · Role changes require root
            </span>
          )}
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-medium text-zinc-300">
            Users ({users.length})
          </h2>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Granted</th>
              {isRoot && <th className="px-5 py-3">Change role</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {users.map((u) => {
              const roleRow = roleMap.get(u.id)
              const role: UserRole = roleRow?.role ?? 'viewer'
              const isSelf = u.id === user.id
              return (
                <tr key={u.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-5 py-3 text-zinc-200 font-mono text-xs">
                    {u.email ?? u.id}
                    {isSelf && (
                      <span className="ml-2 text-zinc-500 font-sans">(you)</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${BADGE[role]}`}>
                      {role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-500 font-mono text-xs">
                    {roleRow?.granted_at
                      ? new Date(roleRow.granted_at).toISOString().slice(0, 10)
                      : '—'}
                  </td>
                  {isRoot && (
                    <td className="px-5 py-3">
                      {isSelf ? (
                        <span className="text-xs text-zinc-600">locked (self)</span>
                      ) : (
                        <form action={setUserRole} className="flex items-center gap-2">
                          <input type="hidden" name="user_id" value={u.id} />
                          <select
                            name="role"
                            defaultValue={role}
                            className="rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                          >
                            <option value="viewer">viewer</option>
                            <option value="admin">admin</option>
                            <option value="root">root</option>
                          </select>
                          <button
                            type="submit"
                            className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors"
                          >
                            Set
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <p className="px-5 py-6 text-sm text-zinc-400">No users found.</p>
        )}
      </div>
    </div>
  )
}
