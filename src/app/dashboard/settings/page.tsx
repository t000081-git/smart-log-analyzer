import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import ProfileForm from './_components/ProfileForm'
import ThemePicker from './_components/ThemePicker'
import PreferenceToggles from './_components/PreferenceToggles'
import SettingRow from './_components/SettingRow'
import { THEME_COOKIE, getTheme } from '@/lib/themes'

export const dynamic = 'force-dynamic'

interface LogSourceRow {
  id: string
  name: string
  source_type: string
  created_at: string
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const cookieStore = await cookies()
  const activeTheme = getTheme(cookieStore.get(THEME_COOKIE)?.value)

  const [profileRes, roleRes, sourcesRes] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('log_sources')
      .select('id, name, source_type, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const displayName = profileRes.data?.display_name ?? ''
  const role: string = roleRes.data?.role ?? 'viewer'
  const sources: LogSourceRow[] = sourcesRes.data ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          /dashboard/settings
        </span>
        <h1 className="mt-1 text-3xl font-semibold text-white tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Personalise the workspace and manage your account.
        </p>
      </header>

      <Section
        kicker="Appearance"
        title="Theme"
        subtitle="Pick an accent palette. Affects ambient glow, toggles, and active states."
      >
        <div className="px-5 pb-5 pt-1">
          <ThemePicker active={activeTheme.id} />
        </div>
      </Section>

      <Section kicker="Preferences" title="Behaviour" subtitle="Local-only — stored in this browser.">
        <PreferenceToggles />
      </Section>

      <Section kicker="Account" title="Profile" subtitle="Identity and role for this workspace.">
        <SettingRow
          first
          label="Email"
          description="Linked Supabase auth identity"
          icon={
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}>
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          control={<span className="font-mono text-xs text-zinc-300">{user.email}</span>}
        />
        <SettingRow
          label="Role"
          description="Capability tier — change via Admin module"
          icon={
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}>
              <path d="M12 3l8 4v6c0 4.5-3.5 7.5-8 8-4.5-.5-8-3.5-8-8V7l8-4Z" strokeLinejoin="round" />
            </svg>
          }
          control={<RoleBadge role={role} />}
        />
        <SettingRow
          label="User ID"
          description="Stable identifier in auth.users"
          icon={
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}>
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
            </svg>
          }
          control={
            <span className="font-mono text-[10px] text-zinc-500 truncate max-w-[180px] inline-block align-middle">
              {user.id}
            </span>
          }
        />
        <div className="border-t border-zinc-800/70 px-5 py-5">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Display name</p>
          <p className="mt-1 text-xs text-zinc-500">How other users see you in shared views.</p>
          <div className="mt-3">
            <ProfileForm initialDisplayName={displayName} />
          </div>
        </div>
      </Section>

      <Section
        kicker="Data"
        title="Log sources"
        subtitle={
          role === 'viewer'
            ? 'Read-only — admin or root configures ingestion sources.'
            : 'Configure via the Admin module or Supabase dashboard.'
        }
      >
        {sources.length === 0 ? (
          <div className="px-5 py-6">
            <p className="text-xs text-zinc-500">No sources configured yet.</p>
          </div>
        ) : (
          sources.map((s, i) => (
            <SettingRow
              key={s.id}
              first={i === 0}
              label={s.name}
              description={`${s.source_type} · added ${new Date(s.created_at).toLocaleDateString()}`}
              icon={
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: 'var(--app-accent)' }}
                />
              }
              control={
                <span className="font-mono text-[10px] text-zinc-600">
                  {s.id.slice(0, 8)}
                </span>
              }
            />
          ))
        )}
      </Section>

      <Section
        kicker="AI"
        title="Backend"
        subtitle="Embedding + summarisation provider used by the cluster pipeline."
      >
        <SettingRow
          first
          label="Active backend"
          description="Set via AI_BACKEND environment variable"
          icon={
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" strokeLinecap="round" />
            </svg>
          }
          control={
            <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-300">
              {process.env.AI_BACKEND ?? 'openrouter'}
            </span>
          }
        />
        <div className="border-t border-zinc-800/70 px-5 py-4">
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/60 p-4">
            <p className="text-sm text-zinc-300">Per-user API key storage is pending.</p>
            <p className="mt-1 text-xs text-zinc-500">
              Requires a <code className="font-mono text-zinc-400">user_settings</code> table not yet migrated.
              Until then, OpenRouter / Ollama credentials are read from server env. Coordinate with user-zahid.
            </p>
          </div>
        </div>
      </Section>
    </div>
  )
}

function Section({
  kicker,
  title,
  subtitle,
  children,
}: {
  kicker: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          {kicker}
        </span>
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
      </div>
      {subtitle && <p className="mb-3 text-xs text-zinc-500">{subtitle}</p>}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm">
        {children}
      </div>
    </section>
  )
}

function RoleBadge({ role }: { role: string }) {
  const accent =
    role === 'root'
      ? 'border-rose-500/30 bg-rose-500/5 text-rose-300'
      : role === 'admin'
        ? 'border-violet-500/30 bg-violet-500/5 text-violet-300'
        : 'border-zinc-700 bg-zinc-800/40 text-zinc-300'
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${accent}`}
    >
      {role}
    </span>
  )
}
