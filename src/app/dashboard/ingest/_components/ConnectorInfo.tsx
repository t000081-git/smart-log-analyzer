'use client'

import type { ConnectorId } from './ConnectorGrid'

interface ConnectorConfig {
  title: string
  subtitle: string
  rows: Array<[label: string, value: string]>
  sourceId: string
  placeholder: string
  sample: string
}

const CONFIGS: Partial<Record<ConnectorId, ConnectorConfig>> = {
  syslog: {
    title: 'Syslog Forwarder',
    subtitle: 'Receive RFC 3164 / 5424 syslog over UDP. Paste payload below to ingest a buffered batch.',
    rows: [
      ['Endpoint', 'udp://0.0.0.0:514'],
      ['Format', 'RFC 3164 · RFC 5424'],
      ['Default source_type', 'linux_syslog'],
    ],
    sourceId: 'syslog-forwarder-01',
    placeholder: 'May 20 02:01:14 srv-01 sshd[12345]: Accepted password for admin from 192.168.1.10\nMay 20 02:03:30 srv-01 kernel: CIFS: Server connection lost',
    sample: `May 20 02:01:14 srv-01 sshd[12345]: Accepted password for admin from 192.168.1.10 port 54321 ssh2
May 20 02:03:30 srv-01 kernel: CIFS: Server connection lost, retrying
May 20 02:05:02 srv-01 cron[6789]: (admin) CMD (/usr/local/bin/backup.sh)
May 20 02:07:45 srv-01 sshd[12350]: Failed password for invalid user attacker from 10.0.0.99 port 22 ssh2
May 20 02:11:30 srv-01 sudo[6800]: admin : TTY=pts/0 ; PWD=/home/admin ; USER=root ; COMMAND=/usr/bin/apt update
May 20 02:14:18 srv-01 kernel: EXT4-fs error (device sda1): inode #12345: rec_len is smaller than minimal
May 20 02:15:00 srv-01 systemd[1]: nginx.service: Main process exited, code=killed, status=11/SEGV`,
  },
  webhook: {
    title: 'REST Webhook',
    subtitle: 'Accept JSON / NDJSON over HTTPS POST. Paste payload below — same parser path as live POSTs.',
    rows: [
      ['Endpoint', 'POST /api/v1/ingest'],
      ['Auth', 'Bearer <token>'],
      ['Content-Type', 'application/x-ndjson'],
    ],
    sourceId: 'webhook-ingress',
    placeholder: '{"timestamp":"2026-05-20T02:00:00Z","level":"info","message":"webhook event"}',
    sample: `{"timestamp":"2026-05-20T02:01:00Z","level":"info","host":"api-edge-01","message":"order_placed user_id=8472 amount=42.50"}
{"timestamp":"2026-05-20T02:02:14Z","level":"warning","host":"api-edge-01","message":"rate_limit_exceeded ip=192.168.1.50 endpoint=/checkout"}
{"timestamp":"2026-05-20T02:03:05Z","level":"error","host":"api-edge-01","message":"payment_timeout vendor=stripe ms=5234 order=4881"}
{"timestamp":"2026-05-20T02:05:30Z","level":"info","host":"api-edge-02","message":"signup_complete user_id=8473 method=oauth"}
{"timestamp":"2026-05-20T02:06:50Z","level":"critical","host":"api-edge-02","message":"db_connection_pool_exhausted available=0 max=20"}`,
  },
  s3: {
    title: 'S3 Bucket',
    subtitle: 'Poll an object store for new log files. Paste object contents below — emulates a poll cycle.',
    rows: [
      ['Bucket', 's3://logs-archive'],
      ['Prefix', '2026/05/20/'],
      ['Poll interval', '60s'],
    ],
    sourceId: 's3-archive-poller',
    placeholder: '{"@timestamp":"2026-05-20T02:00:00Z","severity":"INFO","message":"object body"}',
    sample: `{"@timestamp":"2026-05-20T02:01:00Z","severity":"INFO","host":"backup-svc","message":"daily snapshot complete size=1.2GB target=s3://backups/srv-01"}
{"@timestamp":"2026-05-20T02:05:14Z","severity":"WARN","host":"web-01","message":"high cpu load avg=0.87 over 5m"}
{"@timestamp":"2026-05-20T02:09:30Z","severity":"ERROR","host":"db-primary","message":"disk space critical /var/log 95% full"}
{"@timestamp":"2026-05-20T02:14:00Z","severity":"INFO","host":"web-01","message":"deploy initiated revision=v2.18.0"}
{"@timestamp":"2026-05-20T02:18:45Z","severity":"WARN","host":"db-primary","message":"slow query detected duration=4200ms"}`,
  },
  splunk_hec: {
    title: 'Splunk HEC',
    subtitle: 'Splunk Enterprise 8.x+ HTTP Event Collector compatible. Paste HEC payload below.',
    rows: [
      ['Endpoint', '/services/collector'],
      ['Token', 'hec-xxxxxxxx (configure in env)'],
      ['Format', 'JSON event envelope'],
    ],
    sourceId: 'hec-collector-01',
    placeholder: '{"time":"2026-05-20T02:00:00Z","source":"firewall","message":"event"}',
    sample: `{"time":"2026-05-20T02:01:00Z","source":"firewall","host":"fw-edge","level":"info","message":"connection allowed 10.0.0.1 -> 8.8.8.8 dport=443"}
{"time":"2026-05-20T02:03:30Z","source":"firewall","host":"fw-edge","level":"warning","message":"connection denied attempt 10.0.0.99 -> 198.51.100.4 dport=22"}
{"time":"2026-05-20T02:05:14Z","source":"firewall","host":"fw-edge","level":"error","message":"intrusion signature matched id=ET-2024-9912 src=203.0.113.50"}
{"time":"2026-05-20T02:09:00Z","source":"ids","host":"snort-01","level":"critical","message":"backdoor traffic detected src=203.0.113.50 sig=BD-OUTBOUND-9912"}
{"time":"2026-05-20T02:12:45Z","source":"firewall","host":"fw-edge","level":"info","message":"connection allowed 10.0.0.15 -> 1.1.1.1 dport=53"}`,
  },
}

interface Props {
  id: ConnectorId
  onLoadSample: (content: string, sourceId: string) => void
}

export default function ConnectorInfo({ id, onLoadSample }: Props) {
  const cfg = CONFIGS[id]
  if (!cfg) return null

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="relative flex h-2 w-2"
              aria-hidden
            >
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                style={{ background: 'var(--app-accent)' }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: 'var(--app-accent)' }}
              />
            </span>
            <p className="text-sm font-medium text-zinc-100">{cfg.title}</p>
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
              style={{
                background: 'var(--app-accent-dim)',
                color: 'var(--app-accent)',
              }}
            >
              live
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">{cfg.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => onLoadSample(cfg.sample, cfg.sourceId)}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-200 hover:border-zinc-600 transition-colors"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M4 8h8M8 4v8" strokeLinecap="round" />
          </svg>
          Load sample
        </button>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-zinc-800">
        {cfg.rows.map(([label, value]) => (
          <div key={label} className="px-4 py-2.5">
            <dt className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              {label}
            </dt>
            <dd className="mt-0.5 font-mono text-[11px] text-zinc-300 truncate" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function getConnectorSourceId(id: ConnectorId): string {
  return CONFIGS[id]?.sourceId ?? ''
}

export function getConnectorPlaceholder(id: ConnectorId): string | undefined {
  return CONFIGS[id]?.placeholder
}
