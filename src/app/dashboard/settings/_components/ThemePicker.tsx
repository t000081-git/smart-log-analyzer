'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { THEMES, type ThemeId } from '@/lib/themes'
import { setTheme } from '@/actions/theme'

export default function ThemePicker({ active }: { active: ThemeId }) {
  const router = useRouter()
  const [selected, setSelected] = useState<ThemeId>(active)
  const [pending, startTransition] = useTransition()

  function pick(id: ThemeId) {
    if (id === selected || pending) return
    setSelected(id)
    startTransition(async () => {
      await setTheme(id)
      router.refresh()
    })
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {THEMES.map((t) => {
        const isActive = t.id === selected
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t.id)}
            disabled={pending}
            className={`group relative overflow-hidden rounded-xl border bg-zinc-950 p-4 text-left transition-all ${
              isActive
                ? 'border-transparent ring-2'
                : 'border-zinc-800 hover:border-zinc-700'
            } ${pending ? 'opacity-70' : ''}`}
            style={{
              ...(isActive
                ? {
                    boxShadow: `0 0 0 1px ${t.accent}, 0 8px 24px -8px ${t.glow}`,
                  }
                : {}),
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(ellipse at top right, ${t.glow}, transparent 60%)`,
              }}
            />

            <div className="relative flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="relative inline-flex h-6 w-6 items-center justify-center rounded-full"
                  style={{
                    background: `radial-gradient(circle at 30% 30%, ${t.accent}, ${t.accentDim})`,
                    boxShadow: `0 0 18px ${t.glow}`,
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: '#ffffff', opacity: 0.85 }}
                  />
                </span>
                <p className="text-sm font-medium text-zinc-100">{t.label}</p>
              </div>

              {isActive && (
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ background: t.accent }}
                >
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="white" strokeWidth={2.4}>
                    <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </div>

            <p className="relative mt-2 text-[11px] leading-snug text-zinc-500">
              {t.description}
            </p>

            <div className="relative mt-3 flex h-6 gap-1">
              <span className="flex-1 rounded-sm bg-zinc-800" />
              <span
                className="flex-[2] rounded-sm"
                style={{ background: t.accent, opacity: 0.85 }}
              />
              <span
                className="flex-1 rounded-sm"
                style={{ background: t.accent, opacity: 0.4 }}
              />
              <span className="flex-1 rounded-sm bg-zinc-800" />
            </div>
          </button>
        )
      })}
    </div>
  )
}
