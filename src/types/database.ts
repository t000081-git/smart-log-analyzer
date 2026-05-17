// Core domain types for smart-log-analyzer.
// NormalizedLogEvent is the lingua franca across the entire system —
// raw server logs, meta-log exports, and the app's own operational
// events all use this shape (hierarchy_level distinguishes the tier).

export type UserRole = 'viewer' | 'admin' | 'root'
export type LogSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical'
export type LogSourceType =
  | 'windows_event'
  | 'linux_syslog'
  | 'prtg'
  | 'dxt_netboss'
  | 'ericsson_5g'
  | 'smart_log_analyzer_export'
  | 'smart_log_analyzer_operational'
  | 'generic_text'

// The canonical normalized event — every log record in the system,
// regardless of source or hierarchy level, maps to this shape.
export interface NormalizedLogEvent {
  timestamp: Date
  source_type: LogSourceType
  // Identifies the originating device/server/instance.
  source_id: string
  // 0 = raw server log; 1 = first-level analyzer export; 2 = second-level, etc.
  hierarchy_level: number
  severity: LogSeverity
  message: string
  raw_message?: string
  metadata: Record<string, unknown>
  // FK to log_events(id) — append-only correction: new row, not an UPDATE.
  supersedes_id?: string
}

export interface LogCluster {
  id: string
  label: string | null
  event_count: number
  first_seen: Date | null
  last_seen: Date | null
  severity_distribution: Record<LogSeverity, number>
  source_types: LogSourceType[]
  hierarchy_level: number
  created_at: Date
}

export interface ClusterSummary {
  id: string
  cluster_id: string
  summary_text: string
  model_used: string | null
  ai_backend: 'openrouter' | 'ollama' | null
  period_start: Date | null
  period_end: Date | null
  generated_at: Date
}
