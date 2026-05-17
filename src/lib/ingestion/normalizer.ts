// Log ingestion normalizer — the LogParser interface and NormalizedLogEvent
// are the contract between source-specific adapters and the AI pipeline.
// Each adapter (syslog, EVTX, PRTG, etc.) implements LogParser and emits
// NormalizedLogEvent objects. The pipeline never sees raw format details.

import type { NormalizedLogEvent, LogSourceType } from '@/types/database'

export type { NormalizedLogEvent }

export interface ParseResult {
  events: NormalizedLogEvent[]
  parseErrors: Array<{ line: number; raw: string; reason: string }>
}

// Every source-specific adapter implements this interface.
export interface LogParser {
  readonly sourceType: LogSourceType
  // Parse a complete file buffer. For large files, call parseStream instead.
  parse(content: string, sourceId: string): ParseResult
  // Returns true if this parser can handle the given filename/content hint.
  canHandle(filename: string, contentSample?: string): boolean
}

// Select the appropriate parser for a given file. Returns null if no
// parser recognises the file — caller falls back to GenericTextParser.
export function detectParser(
  filename: string,
  contentSample: string,
  parsers: LogParser[]
): LogParser | null {
  return parsers.find((p) => p.canHandle(filename, contentSample)) ?? null
}

// Severity normalisation helpers — parsers use these to map
// source-specific severity strings to the canonical enum.
export function normaliseSeverity(
  raw: string
): NormalizedLogEvent['severity'] {
  const s = raw.toLowerCase().trim()
  if (['emerg', 'alert', 'crit', 'critical', 'fatal'].includes(s)) return 'critical'
  if (['err', 'error'].includes(s)) return 'error'
  if (['warn', 'warning'].includes(s)) return 'warning'
  if (['notice', 'info', 'information', 'informational'].includes(s)) return 'info'
  if (['debug', 'trace', 'verbose'].includes(s)) return 'debug'
  return 'info'
}
