'use client'

interface Props {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}

export default function Toggle({ checked, onChange, disabled, ariaLabel }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'shadow-[0_0_12px_var(--app-glow)]' : ''
      }`}
      style={{
        backgroundColor: checked ? 'var(--app-accent)' : '#3f3f46',
      }}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        } mt-0.5`}
      />
    </button>
  )
}
