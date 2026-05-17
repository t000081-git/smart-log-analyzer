// Linux syslog parser — reference implementation of the LogParser interface.
// Handles both RFC 3164 (BSD syslog) and RFC 5424 (IETF syslog) formats,
// plus common systemd journal text exports.
// Use this file as the starting point for new adapters.

import type { LogParser, ParseResult } from '../normalizer'
import type { NormalizedLogEvent } from '@/types/database'

// RFC 3164: "Jan  1 00:00:00 hostname process[pid]: message"
const RFC3164 =
  /^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^:\[]+)(?:\[(\d+)\])?:\s(.+)$/

// RFC 5424: "<priority>version timestamp hostname app-name procid msgid message"
const RFC5424 =
  /^<(\d+)>\d+\s+(\S+)\s+(\S+)\s+(\S+)\s+\S+\s+\S+\s+(.+)$/

const PRIORITY_TO_SEVERITY: Record<number, NormalizedLogEvent['severity']> = {
  0: 'critical', 1: 'critical', 2: 'critical', // emerg, alert, crit
  3: 'error',                                    // err
  4: 'warning',                                  // warning
  5: 'info', 6: 'info',                         // notice, info
  7: 'debug',                                    // debug
}

export class SyslogParser implements LogParser {
  readonly sourceType = 'linux_syslog' as const

  canHandle(filename: string, contentSample?: string): boolean {
    if (/\.(log|syslog|messages)$/i.test(filename)) return true
    if (!contentSample) return false
    const firstLine = contentSample.split('\n')[0] ?? ''
    return RFC3164.test(firstLine) || RFC5424.test(firstLine)
  }

  parse(content: string, sourceId: string): ParseResult {
    const lines = content.split('\n')
    const events: NormalizedLogEvent[] = []
    const parseErrors: ParseResult['parseErrors'] = []
    const year = new Date().getFullYear()

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim()
      if (!line) continue

      const rfc5424Match = RFC5424.exec(line)
      if (rfc5424Match) {
        const [, priorityStr, tsStr, hostname, appName, msg] = rfc5424Match
        const priority = parseInt(priorityStr!, 10) % 8
        events.push({
          timestamp: new Date(tsStr!),
          source_type: 'linux_syslog',
          source_id: hostname ?? sourceId,
          hierarchy_level: 0,
          severity: PRIORITY_TO_SEVERITY[priority] ?? 'info',
          message: `${appName}: ${msg}`,
          raw_message: line,
          metadata: { app_name: appName, priority },
        })
        continue
      }

      const rfc3164Match = RFC3164.exec(line)
      if (rfc3164Match) {
        const [, tsStr, hostname, process_, pid, msg] = rfc3164Match
        events.push({
          timestamp: new Date(`${tsStr} ${year}`),
          source_type: 'linux_syslog',
          source_id: hostname ?? sourceId,
          hierarchy_level: 0,
          severity: 'info',
          message: msg!,
          raw_message: line,
          metadata: { process: process_?.trim(), pid: pid ? parseInt(pid) : null },
        })
        continue
      }

      parseErrors.push({ line: i + 1, raw: line, reason: 'no syslog pattern matched' })
    }

    return { events, parseErrors }
  }
}
