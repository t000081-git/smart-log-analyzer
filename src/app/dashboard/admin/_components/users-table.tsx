'use client'

import { useState, useTransition } from 'react'
import { grantRole, setPermission } from '@/actions/admin'

const PERMISSIONS = [
  { key: 'delete_logs',   label: 'Delete logs' },
  { key: 'export_logs',   label: 'Export logs' },
  { key: 'clear_alarms',  label: 'Clear alarms' },
  { key: 'manage_roles',  label: 'Manage roles' },
]

type UserRow = {
  id: string
  email: string
  display_name: string | null
  role: string | null
  permissions: string[]
}

interface Props {
  users: UserRow[]
  isRoot: boolean
}

function RolePicker({ userId, current, isRoot }: { userId: string; current: string | null; isRoot: boolean }) {
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState('')

  const onChange = (role: string) => {
    startTransition(async () => {
      const res = await grantRole(userId, role as 'viewer' | 'admin' | 'root')
      if (res?.error) setErr(res.error)
    })
  }

  if (!isRoot) {
    return (
      <span className={`inline-flex items-center rounded-xl px-2 py-0.5 text-xs font-semibold ring-1 ${
        current === 'root'  ? 'bg-rose-900/50 text-rose-300 ring-rose-500/40 shadow-[0_0_8px_rgba(253,164,175,0.2)]' :
        current === 'admin' ? 'bg-sky-900/50 text-sky-300 ring-sky-500/40 shadow-[0_0_8px_rgba(125,211,252,0.2)]' :
        'bg-white/5 text-slate-400 ring-white/10'
      }`}>
        {current ?? 'viewer'}
      </span>
    )
  }

  return (
    <div>
      <select
        defaultValue={current ?? 'viewer'}
        onChange={e => onChange(e.target.value)}
        disabled={pending}
        className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-400/50 disabled:opacity-40 transition-all"
      >
        <option value="viewer">viewer</option>
        <option value="admin">admin</option>
        <option value="root">root</option>
      </select>
      {err && <p className="mt-1 text-xs text-rose-400">{err}</p>}
    </div>
  )
}

function PermissionCell({
  userId,
  permKey,
  checked,
  isRoot,
}: {
  userId: string
  permKey: string
  checked: boolean
  isRoot: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState(checked)

  const toggle = () => {
    const next = !state
    setState(next)
    startTransition(async () => {
      const res = await setPermission(userId, permKey, next)
      if (res?.error) setState(!next) // revert on error
    })
  }

  return (
    <input
      type="checkbox"
      checked={state}
      onChange={toggle}
      disabled={!isRoot || pending}
      className="accent-violet-500 disabled:opacity-40"
    />
  )
}

export function UsersTable({ users, isRoot }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 bg-white/[0.02]">
            <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">User</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">Role</th>
            {PERMISSIONS.map(p => (
              <th key={p.key} className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 whitespace-nowrap">{p.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {users.length === 0 ? (
            <tr><td colSpan={2 + PERMISSIONS.length} className="py-12 text-center text-sm text-slate-500">No users found</td></tr>
          ) : (
            users.map(u => (
              <tr key={u.id} className="hover:bg-white/[0.03] transition-colors duration-100">
                <td className="px-4 py-3">
                  <p className="text-xs text-slate-200">{u.email}</p>
                  {u.display_name && <p className="text-xs text-slate-600">{u.display_name}</p>}
                </td>
                <td className="px-4 py-3">
                  <RolePicker userId={u.id} current={u.role} isRoot={isRoot} />
                </td>
                {PERMISSIONS.map(p => (
                  <td key={p.key} className="px-3 py-3 text-center">
                    <PermissionCell
                      userId={u.id}
                      permKey={p.key}
                      checked={u.permissions.includes(p.key)}
                      isRoot={isRoot}
                    />
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
