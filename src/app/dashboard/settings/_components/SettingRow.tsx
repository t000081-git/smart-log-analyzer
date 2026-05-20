'use client'

import type { ReactNode } from 'react'

interface Props {
  label: string
  description?: string
  icon?: ReactNode
  control: ReactNode
  first?: boolean
}

export default function SettingRow({ label, description, icon, control, first }: Props) {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-4 ${
        first ? '' : 'border-t border-zinc-800/70'
      }`}
    >
      {icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800/60 text-zinc-300">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100">{label}</p>
        {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}
