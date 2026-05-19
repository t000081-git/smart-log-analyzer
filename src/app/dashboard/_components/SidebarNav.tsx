'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Dashboard',  href: '/dashboard' },
  { label: 'Logs',       href: '/dashboard/logs' },
  { label: 'Clusters',   href: '/dashboard/clusters' },
  { label: 'Timeline',   href: '/dashboard/timeline' },
  { label: 'Alarms',     href: '/dashboard/alarms' },
  { label: 'Admin',      href: '/dashboard/admin' },
]

interface Props {
  email: string
  onSignOut: () => Promise<void>
}

export default function SidebarNav({ email, onSignOut }: Props) {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 flex-col justify-between border-r border-zinc-800 bg-zinc-900 px-3 py-6">
      <div>
        <div className="mb-8 px-2">
          <span className="text-sm font-semibold text-white tracking-tight">
            smart-log-analyzer
          </span>
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map(({ label, href }) => {
            const active =
              href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="space-y-3 px-2">
        <p className="truncate text-xs text-zinc-500">{email}</p>
        <form action={onSignOut}>
          <button
            type="submit"
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
