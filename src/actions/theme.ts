'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { THEME_COOKIE, type ThemeId, THEMES } from '@/lib/themes'

export async function setTheme(id: ThemeId): Promise<{ ok: boolean }> {
  const valid = THEMES.some((t) => t.id === id)
  if (!valid) return { ok: false }
  const store = await cookies()
  store.set(THEME_COOKIE, id, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  revalidatePath('/dashboard', 'layout')
  return { ok: true }
}
