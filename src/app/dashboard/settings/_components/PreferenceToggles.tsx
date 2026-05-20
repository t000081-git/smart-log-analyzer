'use client'

import { useEffect, useState } from 'react'
import SettingRow from './SettingRow'
import Toggle from './Toggle'

interface Prefs {
  reduceMotion: boolean
  monoTimestamps: boolean
  compactDensity: boolean
  alarmSound: boolean
}

const DEFAULT_PREFS: Prefs = {
  reduceMotion: false,
  monoTimestamps: true,
  compactDensity: false,
  alarmSound: false,
}

const STORAGE_KEY = 'sla.prefs.v1'

function readPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_PREFS
  }
}

export default function PreferenceToggles() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setPrefs(readPrefs())
    setHydrated(true)
  }, [])

  function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore quota / private mode
    }
  }

  const disabled = !hydrated

  return (
    <>
      <SettingRow
        first
        label="Reduce motion"
        description="Disable pulse/ping animations across the app"
        icon={
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}>
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6 6l1.5 1.5M16.5 16.5L18 18M6 18l1.5-1.5M16.5 7.5L18 6" strokeLinecap="round" />
          </svg>
        }
        control={
          <Toggle
            checked={prefs.reduceMotion}
            onChange={(v) => update('reduceMotion', v)}
            disabled={disabled}
            ariaLabel="Reduce motion"
          />
        }
      />
      <SettingRow
        label="Compact density"
        description="Tighter row spacing in lists and tables"
        icon={
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}>
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        }
        control={
          <Toggle
            checked={prefs.compactDensity}
            onChange={(v) => update('compactDensity', v)}
            disabled={disabled}
            ariaLabel="Compact density"
          />
        }
      />
      <SettingRow
        label="Mono timestamps"
        description="Show timestamps in a monospaced font"
        icon={
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
        }
        control={
          <Toggle
            checked={prefs.monoTimestamps}
            onChange={(v) => update('monoTimestamps', v)}
            disabled={disabled}
            ariaLabel="Mono timestamps"
          />
        }
      />
      <SettingRow
        label="Alarm sound"
        description="Audible alert on new critical alarms — coming soon"
        icon={
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}>
            <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
            <path d="M10 19a2 2 0 0 0 4 0" />
          </svg>
        }
        control={
          <Toggle
            checked={prefs.alarmSound}
            onChange={(v) => update('alarmSound', v)}
            disabled={disabled}
            ariaLabel="Alarm sound"
          />
        }
      />
    </>
  )
}
