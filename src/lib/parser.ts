// Generic line-oriented log parser used by the ingest action.
// Strategy:
//   1. If the buffer looks like syslog, delegate to the dedicated SyslogParser.
//   2. Otherwise parse line-by-line, trying JSON-lines → ISO+level → fallback.
//
// Output is a ParseResult of NormalizedLogEvent objects ready for batch insert.

import type { LogParser, ParseResult } from './ingestion/normalizer'
import { detectParser, normaliseSeverity } from './ingestion/normalizer'
import { SyslogParser } from './ingestion/parsers/syslog'
import type { NormalizedLogEvent, LogSeverity } from '@/types/database'

const ISO_TS = /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/
const LEVEL_TOKEN = /\b(EMERG|ALERT|CRIT(?:ICAL)?|FATAL|ERR(?:OR)?|WARN(?:ING)?|NOTICE|INFO|DEBUG|TRACE|VERBOSE)\b/i

const REGISTERED_PARSERS: LogParser[] = [new SyslogParser()]

export function parseLog(
  content: string,
  sourceId: string,
  filename = 'paste.log'
): ParseResult {
  const sample = content.slice(0, 2000)

  const adapter = detectParser(filename, sample, REGISTERED_PARSERS)
  if (adapter) return adapter.parse(content, sourceId)

  return parseGeneric(content, sourceId)
}

function parseGeneric(content: string, sourceId: string): ParseResult {
  const lines = content.split(/\r?\n/)
  const events: NormalizedLogEvent[] = []
  const parseErrors: ParseResult['parseErrors'] = []
  const fallbackTs = new Date()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line) continue

    const json = tryJsonLine(line, sourceId)
    if (json) {
      events.push(json)
      continue
    }

    const iso = tryIsoLevelLine(line, sourceId)
    if (iso) {
      events.push(iso)
      continue
    }

    events.push({
      timestamp: fallbackTs,
      source_type: 'generic_text',
      source_id: sourceId,
      hierarchy_level: 0,
      severity: 'info',
      message: line.slice(0, 4096),
      raw_message: line,
      metadata: { unparsed: true },
    })
  }

  return { events, parseErrors }
}

function tryJsonLine(line: string, sourceId: string): NormalizedLogEvent | null {
  if (!(line.startsWith('{') && line.endsWith('}'))) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }

  const tsRaw =
    (obj.timestamp as string) ??
    (obj.ts as string) ??
    (obj['@timestamp'] as string) ??
    (obj.time as string)
  const timestamp = tsRaw ? new Date(tsRaw) : new Date()
  const validTs = !Number.isNaN(timestamp.getTime()) ? timestamp : new Date()

  const levelRaw =
    (obj.level as string) ??
    (obj.severity as string) ??
    (obj.lvl as string) ??
    'info'
  const severity = normaliseSeverity(String(levelRaw))

  const message =
    (obj.message as string) ??
    (obj.msg as string) ??
    (obj.event as string) ??
    JSON.stringify(obj)

  return {
    timestamp: validTs,
    source_type: 'generic_text',
    source_id: (obj.host as string) ?? (obj.hostname as string) ?? sourceId,
    hierarchy_level: 0,
    severity,
    message: String(message).slice(0, 4096),
    raw_message: line,
    metadata: { format: 'json-lines', original: obj },
  }
}

function tryIsoLevelLine(line: string, sourceId: string): NormalizedLogEvent | null {
  const tsMatch = ISO_TS.exec(line)
  if (!tsMatch) return null

  const timestamp = new Date(tsMatch[1]!.replace(' ', 'T'))
  if (Number.isNaN(timestamp.getTime())) return null

  const levelMatch = LEVEL_TOKEN.exec(line)
  const severity: LogSeverity = levelMatch
    ? normaliseSeverity(levelMatch[1]!)
    : 'info'

  return {
    timestamp,
    source_type: 'generic_text',
    source_id: sourceId,
    hierarchy_level: 0,
    severity,
    message: line.slice(tsMatch[0].length).trim().slice(0, 4096) || line,
    raw_message: line,
    metadata: { format: 'iso-level' },
  }
}
