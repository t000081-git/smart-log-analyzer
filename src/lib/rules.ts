// Rule-based alarm detection over normalized log events.
// Each rule that matches an event produces an AlarmCandidate which the
// ingest server action persists to the alarms table.
//
// Severity maps to the canonical log_severity enum (no 'high'/'medium' —
// high → 'error', medium → 'warning').

import type { NormalizedLogEvent, LogSeverity } from '@/types/database'

export interface AlarmCandidate {
  rule: string
  severity: LogSeverity
  match: string
  event_index: number
}

interface Rule {
  name: string
  severity: LogSeverity
  test: (event: NormalizedLogEvent) => string | null
}

const RULES: Rule[] = [
  {
    name: 'failed_login',
    severity: 'error',
    test: (e) => {
      const m = /failed.{0,15}(login|auth|password)/i.exec(e.message)
      return m ? m[0] : null
    },
  },
  {
    name: 'error_or_critical',
    severity: 'warning',
    test: (e) =>
      e.severity === 'error' || e.severity === 'critical' ? e.severity : null,
  },
  {
    name: 'suspicious_keyword',
    severity: 'error',
    test: (e) => {
      const m = /\b(malware|injection|sudo|root|backdoor|exploit)\b/i.exec(
        e.message
      )
      return m ? m[0] : null
    },
  },
]

export function evaluateRules(events: NormalizedLogEvent[]): AlarmCandidate[] {
  const candidates: AlarmCandidate[] = []
  for (let i = 0; i < events.length; i++) {
    const event = events[i]!
    for (const rule of RULES) {
      const match = rule.test(event)
      if (match) {
        candidates.push({
          rule: rule.name,
          severity: rule.severity,
          match,
          event_index: i,
        })
      }
    }
  }
  return candidates
}
