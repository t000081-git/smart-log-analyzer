// Source-type palette — used by Timeline swimlanes and Dashboard widgets.
// Lifted out of TimelineGraph.tsx so server components can import safely.

export interface SourceTone {
  label: string
  color: string
  textColor: string
}

export const SOURCE_TONE: Record<string, SourceTone> = {
  linux_syslog: { label: 'Linux Syslog', color: '#0ea5e9', textColor: '#ffffff' },
  windows_event: { label: 'Windows', color: '#8b5cf6', textColor: '#ffffff' },
  prtg: { label: 'PRTG', color: '#10b981', textColor: '#ffffff' },
  dxt_netboss: { label: 'DXT · Netboss', color: '#f43f5e', textColor: '#ffffff' },
  ericsson_5g: { label: 'Ericsson 5G', color: '#f59e0b', textColor: '#0c0a09' },
  smart_log_analyzer_export: { label: 'SLA Export', color: '#d946ef', textColor: '#ffffff' },
  smart_log_analyzer_operational: { label: 'SLA Ops', color: '#06b6d4', textColor: '#0c0a09' },
  generic_text: { label: 'Generic', color: '#64748b', textColor: '#ffffff' },
}

export const UNKNOWN_TONE: SourceTone = {
  label: 'Other',
  color: '#52525b',
  textColor: '#ffffff',
}

export function toneFor(source_type: string): SourceTone {
  return SOURCE_TONE[source_type] ?? UNKNOWN_TONE
}
