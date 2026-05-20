// Theme palette — drives the app's accent color and ambient glow.
// Stored as a cookie ('app-theme'); read by the dashboard layout
// server-side so first paint already has the right color (no flash).

export type ThemeId = 'midnight' | 'aurora' | 'nebula' | 'carbon' | 'slate' | 'crimson'

export interface Theme {
  id: ThemeId
  label: string
  description: string
  accent: string
  accentDim: string
  glow: string
}

export const THEMES: Theme[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Dark zinc base · sky blue accent',
    accent: '#38bdf8',
    accentDim: 'rgba(56,189,248,0.10)',
    glow: 'rgba(56,189,248,0.18)',
  },
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Violet-cyan gradients · soft glow',
    accent: '#a78bfa',
    accentDim: 'rgba(167,139,250,0.10)',
    glow: 'rgba(167,139,250,0.20)',
  },
  {
    id: 'nebula',
    label: 'Nebula',
    description: 'Deep space · magenta highlights',
    accent: '#e879f9',
    accentDim: 'rgba(232,121,249,0.10)',
    glow: 'rgba(232,121,249,0.20)',
  },
  {
    id: 'carbon',
    label: 'Carbon',
    description: 'Pure black · emerald accent',
    accent: '#34d399',
    accentDim: 'rgba(52,211,153,0.10)',
    glow: 'rgba(52,211,153,0.18)',
  },
  {
    id: 'slate',
    label: 'Slate',
    description: 'Steel grey · amber warmth',
    accent: '#fbbf24',
    accentDim: 'rgba(251,191,36,0.10)',
    glow: 'rgba(251,191,36,0.18)',
  },
  {
    id: 'crimson',
    label: 'Crimson',
    description: 'SOC night-shift · rose alerts',
    accent: '#fb7185',
    accentDim: 'rgba(251,113,133,0.10)',
    glow: 'rgba(251,113,133,0.20)',
  },
]

export const DEFAULT_THEME: ThemeId = 'midnight'

export function getTheme(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!
}

export const THEME_COOKIE = 'app-theme'
