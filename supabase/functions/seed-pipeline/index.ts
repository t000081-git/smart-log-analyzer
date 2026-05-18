// supabase/functions/seed-pipeline/index.ts
//
// Task 2 AI pipeline, deployed as a Supabase Edge Function (Deno runtime).
//
// Why this lives here, not as a Vercel API route: Vercel Hobby kills any
// serverless function at 10s. A full pipeline run (~200 events × 1 embedding
// batch + 1 LLM summary per cluster) routinely exceeds 10s end-to-end.
// Supabase Edge Functions have no comparable timeout for our payload size.
//
// Invoke:
//   curl -X POST https://<project-ref>.supabase.co/functions/v1/seed-pipeline \
//     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
//
// Required Supabase secrets (set via `supabase secrets set --project-ref <ref>`):
//   - OPENROUTER_API_KEY           (required; cloud AI provider)
//   - OPENROUTER_MODEL             (optional; defaults to openai/gpt-4o-mini)
//   - OPENROUTER_EMBEDDING_MODEL   (optional; defaults to openai/text-embedding-3-small)
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected by the runtime.
//
// Response on success:
//   { ok: true, log_events: N, log_clusters: M, cluster_summaries: M,
//     duration_ms: T, provider: 'openrouter', embedding_model: '...',
//     summary_model: '...', pipeline_version: 'seed-pipeline-v1' }
//
// Not yet idempotent: re-invoking inserts duplicate events. To re-run on
// the same project, first truncate via:
//   TRUNCATE log_cluster_members, log_clusters, cluster_summaries, log_events
//     RESTART IDENTITY CASCADE;
// (Alarms are auto-cleared via FK CASCADE on log_clusters.)

import { createClient } from 'npm:@supabase/supabase-js@2'

const PIPELINE_VERSION = 'seed-pipeline-v1'
const CLUSTERING_THRESHOLD = 0.65

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Severity = 'debug' | 'info' | 'warning' | 'error' | 'critical'
type SourceType = 'linux_syslog' | 'windows_event' | 'prtg' | 'generic_text'

interface CorpusEvent {
  ts: Date
  source_type: SourceType
  source_id: string
  hierarchy_level: number
  severity: Severity
  message: string
  metadata: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Timestamp helpers — synthetic events spread across 7 days, anchored to
// 14 distinct incident windows. Deterministic per index, no RNG.
// ---------------------------------------------------------------------------
const DAY = 86_400_000
const HOUR = 3_600_000
const MIN = 60_000
const NOW = Date.now()

const INC = {
  disk:    NOW - 6 * DAY,
  auth:    NOW - 5 * DAY,
  kernel:  NOW - 5 * DAY + 6 * HOUR,
  memory:  NOW - 4 * DAY,
  db:      NOW - 4 * DAY + 3 * HOUR,
  network: NOW - 3 * DAY,
  ups:     NOW - 3 * DAY + 4 * HOUR,
  tls:     NOW - 2 * DAY,
  ntp:     NOW - 2 * DAY + 6 * HOUR,
  backup:  NOW - 1 * DAY,
  thermal: NOW - 1 * DAY + 8 * HOUR,
  dns:     NOW - 1 * DAY + 12 * HOUR,
  service: NOW - 18 * HOUR,
  routine: NOW - 7 * DAY,
}

function ts(incidentBase: number, offsetMinutes: number, idx = 0): Date {
  return new Date(incidentBase + offsetMinutes * MIN + (idx * 17) % (2 * MIN))
}

// ---------------------------------------------------------------------------
// Synthetic corpus — ~200 events across 13 incident themes, designed to
// produce semantically meaningful clusters at threshold 0.65. Themes mix:
//   - Intra-theme variation (same root cause, different phrasings)
//   - Cross-source events (same incident visible in syslog + prtg + windows)
//   - Cascading failures (disk error → fs corruption → app failure → backup)
//   - Singletons (one-off events that should stay unclustered)
// ---------------------------------------------------------------------------

const CORPUS: CorpusEvent[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 1: DISK FAILURE + RAID CASCADE
  // 24 events — same root cause, 4 different phases, cross-source (syslog+prtg)
  // Expected clusters: ~2-3 (early SMART/I/O, RAID degradation, EXT4/app impact)
  // ══════════════════════════════════════════════════════════════════════════

  // Phase 1a: SMART predictive warnings (early signs, different phrasings)
  { ts: ts(INC.disk, 0, 0),  source_type: 'linux_syslog', source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'SMART: drive /dev/sdb reporting 47 reallocated sectors — predictive failure likely', metadata: { disk: '/dev/sdb' } },
  { ts: ts(INC.disk, 2, 1),  source_type: 'linux_syslog', source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'smartctl: 197 Current Pending Sector Count = 23 (threshold: 0)', metadata: { disk: '/dev/sdb' } },
  { ts: ts(INC.disk, 4, 2),  source_type: 'prtg',         source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'PRTG SMART sensor: nas01:/dev/sdb — reallocated sector count exceeded threshold', metadata: { sensor: 'SMART' } },
  { ts: ts(INC.disk, 6, 3),  source_type: 'linux_syslog', source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'kernel: sdb: Spinning up disk…timeout waiting for drive ready', metadata: { disk: '/dev/sdb' } },

  // Phase 1b: Actual I/O errors (drive failing hard)
  { ts: ts(INC.disk, 30, 4),  source_type: 'linux_syslog', source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'error', message: 'Buffer I/O error on device sdb1, logical block 2048576', metadata: {} },
  { ts: ts(INC.disk, 31, 5),  source_type: 'linux_syslog', source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'error', message: 'I/O error: dev sdb, sector 4097152 op 0x0:(READ) flags 0x0', metadata: {} },
  { ts: ts(INC.disk, 32, 6),  source_type: 'linux_syslog', source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'error', message: 'EXT4-fs error (device sdb1): ext4_find_entry:1455: inode #131073: comm cp: reading directory lblock 0', metadata: {} },
  { ts: ts(INC.disk, 33, 7),  source_type: 'linux_syslog', source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'error', message: 'SCSI error: return code = 0x08000002 — lost I/O to disk', metadata: {} },
  { ts: ts(INC.disk, 35, 8),  source_type: 'linux_syslog', source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'error', message: 'I/O error on /dev/sda reading from filesystem — check hardware', metadata: {} },
  { ts: ts(INC.disk, 36, 9),  source_type: 'prtg',         source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'error', message: 'PRTG: Disk Read Errors sensor — 412 errors in last 5 minutes on nas01', metadata: { sensor: 'DiskErrors' } },

  // Phase 1c: RAID array responds to drive failure
  { ts: ts(INC.disk, 60, 10), source_type: 'linux_syslog', source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'error',    message: 'md: sdb1 failed. Removing it from the RAID array md0', metadata: { array: 'md0' } },
  { ts: ts(INC.disk, 61, 11), source_type: 'linux_syslog', source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'critical', message: 'mdadm: array /dev/md0 degraded — lost drive sdb1 (1/2 drives remaining)', metadata: { array: 'md0' } },
  { ts: ts(INC.disk, 62, 12), source_type: 'generic_text', source_id: 'mdadm-monitor',    hierarchy_level: 0, severity: 'critical', message: 'RAID ALERT: /dev/md0 on nas01 is now in DEGRADED state — immediate attention required', metadata: {} },
  { ts: ts(INC.disk, 90, 13), source_type: 'linux_syslog', source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'info',     message: 'md: sdc1 added as hot spare to /dev/md0, recovery starting', metadata: { array: 'md0' } },
  { ts: ts(INC.disk, 92, 14), source_type: 'linux_syslog', source_id: 'nas01.lab.local',  hierarchy_level: 0, severity: 'info',     message: 'md0: resync of RAID array started at sector 0', metadata: { array: 'md0' } },

  // Phase 1d: Downstream impact — filesystem/app cascade
  { ts: ts(INC.disk, 35, 15), source_type: 'linux_syslog', source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'error', message: 'EXT4-fs error: journal commit failed on sda1 — filesystem may be inconsistent', metadata: {} },
  { ts: ts(INC.disk, 36, 16), source_type: 'linux_syslog', source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'error', message: 'Application write failure: unable to write to /data/logs — filesystem read-only', metadata: {} },
  { ts: ts(INC.disk, 40, 17), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'error', message: "Backup job 'nightly-nas' failed: snapshot creation on degraded md0 timed out after 20 min", metadata: {} },
  { ts: ts(INC.disk, 41, 18), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'error', message: 'Veeam: Cannot read backup source — I/O errors on nas01:/data', metadata: {} },

  // SMART additional — different host, same symptom (should AI recognize?)
  { ts: ts(INC.disk, 3, 19),  source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'SMART check: /dev/sda uncorrectable sector count increased to 12', metadata: { disk: '/dev/sda' } },
  { ts: ts(INC.disk, 5, 20),  source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'kernel: end_request: I/O error, dev sda, sector 1048576 — read failure', metadata: { disk: '/dev/sda' } },
  { ts: ts(INC.disk, 34, 21), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'error',   message: 'blk_update_request: I/O error, dev sda, sector 3145728 — disk hardware fault', metadata: {} },
  { ts: ts(INC.disk, 63, 22), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'critical',message: 'XFS: metadata I/O error in "xfs_trans_read_buf_map" — filesystem unmounting', metadata: {} },
  { ts: ts(INC.disk,120, 23), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'info',    message: 'fsck.ext4: /dev/sda1 completed — 47 inodes recovered, 0 errors', metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 2: BRUTE FORCE / CREDENTIAL STUFFING ATTACK
  // 22 events — cross-source (linux auth.log, windows_event, IDS/firewall)
  // Expected clusters: ~2 (SSH brute force, Windows credential stuffing)
  // ══════════════════════════════════════════════════════════════════════════

  // SSH auth failures (auth.log style)
  { ts: ts(INC.auth,  0, 0),  source_type: 'linux_syslog', source_id: 'bastion.lab.local', hierarchy_level: 0, severity: 'warning', message: 'sshd: Failed password for invalid user admin from 185.220.101.45 port 52381 ssh2', metadata: { src_ip: '185.220.101.45' } },
  { ts: ts(INC.auth,  0, 1),  source_type: 'linux_syslog', source_id: 'bastion.lab.local', hierarchy_level: 0, severity: 'warning', message: 'sshd: Invalid user root from 185.220.101.45 port 52382', metadata: { src_ip: '185.220.101.45' } },
  { ts: ts(INC.auth,  1, 2),  source_type: 'linux_syslog', source_id: 'bastion.lab.local', hierarchy_level: 0, severity: 'warning', message: 'sshd: Failed password for root from 185.220.101.45 port 52390 ssh2', metadata: { src_ip: '185.220.101.45' } },
  { ts: ts(INC.auth,  1, 3),  source_type: 'linux_syslog', source_id: 'bastion.lab.local', hierarchy_level: 0, severity: 'warning', message: 'sshd: Failed password for nobody from 5.188.86.33 port 41234 ssh2', metadata: { src_ip: '5.188.86.33' } },
  { ts: ts(INC.auth,  2, 4),  source_type: 'linux_syslog', source_id: 'bastion.lab.local', hierarchy_level: 0, severity: 'warning', message: 'sshd: Invalid user pi from 194.165.16.88 — possible credential stuffing', metadata: { src_ip: '194.165.16.88' } },
  { ts: ts(INC.auth,  2, 5),  source_type: 'linux_syslog', source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'sshd: authentication failure; logname= uid=0 euid=0 tty=ssh ruser= rhost=185.220.101.45 user=www-data', metadata: { src_ip: '185.220.101.45' } },
  { ts: ts(INC.auth,  3, 6),  source_type: 'linux_syslog', source_id: 'bastion.lab.local', hierarchy_level: 0, severity: 'error',   message: 'sshd: Connection closed by authenticating user admin 185.220.101.45 port 52411 [preauth] — max retries exceeded', metadata: { src_ip: '185.220.101.45' } },
  { ts: ts(INC.auth,  5, 7),  source_type: 'generic_text', source_id: 'fail2ban',           hierarchy_level: 0, severity: 'warning', message: 'fail2ban: Ban 185.220.101.45 — 10 failed SSH logins in 120 seconds (jail: sshd)', metadata: { src_ip: '185.220.101.45' } },
  { ts: ts(INC.auth,  5, 8),  source_type: 'generic_text', source_id: 'fail2ban',           hierarchy_level: 0, severity: 'warning', message: 'fail2ban: Ban 5.188.86.33 — brute force threshold reached on sshd jail', metadata: { src_ip: '5.188.86.33' } },

  // Windows credential stuffing (same attack wave hitting Windows hosts)
  { ts: ts(INC.auth, 10, 9),  source_type: 'windows_event', source_id: 'win-dc01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'Event 4625: An account failed to log on. Account: administrator. Src: 185.220.101.45', metadata: { event_id: 4625, src_ip: '185.220.101.45' } },
  { ts: ts(INC.auth, 10, 10), source_type: 'windows_event', source_id: 'win-dc01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'Event 4625: Logon failure — unknown user admin from 185.220.101.45 (logon type 3)', metadata: { event_id: 4625, logon_type: 3 } },
  { ts: ts(INC.auth, 11, 11), source_type: 'windows_event', source_id: 'win-app01.lab.local', hierarchy_level: 0, severity: 'warning', message: "Event 4625: Failed RDP login for 'sysadmin' from 185.220.101.45:53012", metadata: { event_id: 4625, src_ip: '185.220.101.45' } },
  { ts: ts(INC.auth, 11, 12), source_type: 'windows_event', source_id: 'win-app01.lab.local', hierarchy_level: 0, severity: 'warning', message: "Event 4625: Network logon failure user='vagrant' from 5.188.86.33 — bad password", metadata: { event_id: 4625, src_ip: '5.188.86.33' } },
  { ts: ts(INC.auth, 12, 13), source_type: 'windows_event', source_id: 'win-dc01.lab.local',  hierarchy_level: 0, severity: 'warning', message: "Event 4625: Logon failed for 'service_account' — password expired (sub-status 0xC0000071)", metadata: { event_id: 4625 } },
  { ts: ts(INC.auth, 15, 14), source_type: 'windows_event', source_id: 'win-dc01.lab.local',  hierarchy_level: 0, severity: 'error',   message: "Event 4740: Account 'administrator' locked out after 5 failed attempts — caller: win-app01", metadata: { event_id: 4740 } },
  { ts: ts(INC.auth, 15, 15), source_type: 'windows_event', source_id: 'win-dc01.lab.local',  hierarchy_level: 0, severity: 'error',   message: "Event 4740: Account 'svc_backup' automatically locked out — 5 failed network logons from 185.220.101.45", metadata: { event_id: 4740, src_ip: '185.220.101.45' } },

  // IDS/firewall correlation (same attacker seen from security layer)
  { ts: ts(INC.auth,  4, 16), source_type: 'generic_text', source_id: 'suricata-ids',       hierarchy_level: 0, severity: 'warning', message: 'Suricata ET SCAN: SSH Brute Force attack from 185.220.101.45 — rule 2001219 fired 47 times', metadata: { src_ip: '185.220.101.45' } },
  { ts: ts(INC.auth, 12, 17), source_type: 'generic_text', source_id: 'suricata-ids',       hierarchy_level: 0, severity: 'error',   message: 'Suricata ET POLICY: Possible credential stuffing — 15 distinct username attempts from 185.220.101.45 in 600s', metadata: { src_ip: '185.220.101.45' } },
  { ts: ts(INC.auth, 16, 18), source_type: 'generic_text', source_id: 'pfsense.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'pfSense firewall: blocking 185.220.101.45 — added to blocklist after brute force detection', metadata: { src_ip: '185.220.101.45' } },

  // Successful logins (same user, same host — NOT part of attack cluster)
  { ts: ts(INC.auth, 20, 19), source_type: 'linux_syslog',  source_id: 'bastion.lab.local', hierarchy_level: 0, severity: 'info', message: "sshd: Accepted publickey for charles from 10.0.0.5 port 51234 ssh2: RSA SHA256:abc123", metadata: {} },
  { ts: ts(INC.auth, 25, 20), source_type: 'windows_event', source_id: 'win-dc01.lab.local', hierarchy_level: 0, severity: 'info', message: "Event 4624: Account 'charles' successfully logged on — logon type 2 (interactive)", metadata: { event_id: 4624 } },
  { ts: ts(INC.auth,120, 21), source_type: 'generic_text',  source_id: 'fail2ban',           hierarchy_level: 0, severity: 'info', message: 'fail2ban: Unban 185.220.101.45 after 7200s ban expiry (sshd jail)', metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 3: MEMORY PRESSURE → OOM → DB CASCADE
  // 20 events — 3 phases, will AI find causal chain or multiple clusters?
  // ══════════════════════════════════════════════════════════════════════════

  // Phase 3a: Early memory pressure (different ways of saying "low memory")
  { ts: ts(INC.memory,  0, 0), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'low memory: swap usage at 87%, free memory below 200MB', metadata: {} },
  { ts: ts(INC.memory,  2, 1), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'kswapd0: 4 tries to free memory, giving up — memory fragmentation severe', metadata: {} },
  { ts: ts(INC.memory,  3, 2), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'MemAvailable: 87612 kB — system under memory pressure, consider adding swap', metadata: {} },
  { ts: ts(INC.memory,  5, 3), source_type: 'prtg',         source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'PRTG Memory Sensor: db01 — physical memory 94% utilized (15.1 GB / 16 GB)', metadata: { sensor: 'Memory' } },
  { ts: ts(INC.memory,  8, 4), source_type: 'linux_syslog', source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'page allocation failure: order:3, mode:0x40cc0(GFP_KERNEL|__GFP_COMP) — application memory exhausted', metadata: {} },

  // Phase 3b: OOM killer activations (different processes, same host)
  { ts: ts(INC.memory, 15, 5), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'error',   message: 'Out of memory: Kill process 8423 (mysqld) score 862 or sacrifice child', metadata: { pid: 8423, process: 'mysqld' } },
  { ts: ts(INC.memory, 15, 6), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'error',   message: 'Killed process 8423 (mysqld) total-vm:8389632kB, anon-rss:7929728kB, file-rss:0kB', metadata: { pid: 8423 } },
  { ts: ts(INC.memory, 20, 7), source_type: 'linux_syslog', source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'error',   message: 'OOM killer invoked: killing java (pid 3102) — insufficient contiguous memory', metadata: { pid: 3102, process: 'java' } },
  { ts: ts(INC.memory, 22, 8), source_type: 'linux_syslog', source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'error',   message: 'oom_reaper: reaping virtual memory with task 3102', metadata: { pid: 3102 } },
  { ts: ts(INC.memory, 25, 9), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'critical',message: 'OOM: system memory critical — cannot reclaim memory, kernel will reboot soon', metadata: {} },

  // Phase 3c: DB connection pool exhaustion (downstream of MySQL OOM kill)
  { ts: ts(INC.db,  0, 0),    source_type: 'linux_syslog',  source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'error',   message: "Can't connect to MySQL server on 'db01.lab.local:3306' (111 Connection refused)", metadata: {} },
  { ts: ts(INC.db,  1, 1),    source_type: 'generic_text',  source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'error',   message: 'HikariPool-1 — Connection is not available, request timed out after 30000ms', metadata: { pool: 'HikariPool-1' } },
  { ts: ts(INC.db,  2, 2),    source_type: 'generic_text',  source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'error',   message: 'FATAL: database connection pool exhausted — all 50 connections in use, requests queuing', metadata: {} },
  { ts: ts(INC.db,  3, 3),    source_type: 'linux_syslog',  source_id: 'app02.lab.local',  hierarchy_level: 0, severity: 'error',   message: 'Caused by: com.mysql.jdbc.exceptions.jdbc4.CommunicationsException: Communications link failure — db01 unreachable', metadata: {} },
  { ts: ts(INC.db,  5, 4),    source_type: 'generic_text',  source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'error',   message: 'Too many connections: MySQL max_connections=151 exceeded, rejecting new connections from app01', metadata: {} },
  { ts: ts(INC.db, 10, 5),    source_type: 'generic_text',  source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'error',   message: 'Deadlock found when trying to get lock — transaction rolled back (innodb_lock_wait_timeout)', metadata: {} },
  { ts: ts(INC.db, 20, 6),    source_type: 'linux_syslog',  source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'info',    message: 'systemd: mysqld.service started — MySQL server resumed after OOM recovery', metadata: {} },
  { ts: ts(INC.db, 25, 7),    source_type: 'generic_text',  source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'info',    message: 'HikariPool-1 — Connection pool reestablished to db01.lab.local:3306 (15 connections active)', metadata: {} },

  // False-positive trap: CPU pressure (sounds like memory pressure but isn't)
  { ts: ts(INC.memory, 1, 10), source_type: 'linux_syslog', source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'CPU load average 14.2 15.7 13.1 — system heavily loaded (16 cores)', metadata: {} },
  { ts: ts(INC.memory, 6, 11), source_type: 'prtg',         source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'PRTG CPU Sensor: web01 — processor usage 97% for last 15 minutes', metadata: { sensor: 'CPU' } },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 4: NETWORK LINK FLAPPING + STP RECONVERGENCE
  // 14 events — cross-source (syslog + prtg), cascading (link → STP → VLAN)
  // ══════════════════════════════════════════════════════════════════════════

  { ts: ts(INC.network,  0, 0), source_type: 'linux_syslog', source_id: 'core-sw-01',       hierarchy_level: 0, severity: 'warning', message: 'kernel: eth0: NIC link is Down (carrier lost)', metadata: { interface: 'eth0' } },
  { ts: ts(INC.network,  0, 1), source_type: 'prtg',         source_id: 'core-sw-01',       hierarchy_level: 0, severity: 'error',   message: 'PRTG: Interface GigabitEthernet0/1 on core-sw-01 changed state to DOWN', metadata: { port: 'Gi0/1' } },
  { ts: ts(INC.network,  1, 2), source_type: 'linux_syslog', source_id: 'core-sw-01',       hierarchy_level: 0, severity: 'warning', message: '%LINEPROTO-5-UPDOWN: Line protocol on Interface Gi0/1 changed to down', metadata: {} },
  { ts: ts(INC.network,  1, 3), source_type: 'linux_syslog', source_id: 'access-sw-01',     hierarchy_level: 0, severity: 'warning', message: 'STP: topology change detected on VLAN 10 — port Fa0/24 transitioned to blocking', metadata: { vlan: 10 } },
  { ts: ts(INC.network,  2, 4), source_type: 'linux_syslog', source_id: 'core-sw-01',       hierarchy_level: 0, severity: 'warning', message: 'STP: root bridge election in progress on VLAN 20 — network convergence may take 30s', metadata: { vlan: 20 } },
  { ts: ts(INC.network,  3, 5), source_type: 'prtg',         source_id: 'core-sw-01',       hierarchy_level: 0, severity: 'warning', message: 'PRTG: port 4 flapping — 3 state changes in 60 seconds on core-sw-01', metadata: { port: '4' } },
  { ts: ts(INC.network,  3, 6), source_type: 'linux_syslog', source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'network unreachable: ping to 10.0.0.1 (gateway) timed out — possible uplink issue', metadata: {} },
  { ts: ts(INC.network,  4, 7), source_type: 'linux_syslog', source_id: 'core-sw-01',       hierarchy_level: 0, severity: 'warning', message: '%LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to up after link flap', metadata: {} },
  { ts: ts(INC.network,  5, 8), source_type: 'linux_syslog', source_id: 'access-sw-01',     hierarchy_level: 0, severity: 'warning', message: 'STP reconvergence on VLAN 10 — traffic disruption approximately 45 seconds', metadata: { vlan: 10 } },
  { ts: ts(INC.network, 10, 9), source_type: 'prtg',         source_id: 'core-sw-01',       hierarchy_level: 0, severity: 'info',    message: 'PRTG: Interface GigabitEthernet0/1 on core-sw-01 restored to UP state at 1Gbps', metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 5: UPS / POWER EVENT
  // 13 events — prtg + syslog, UPS switchover and recovery
  // ══════════════════════════════════════════════════════════════════════════

  { ts: ts(INC.ups,  0, 0),  source_type: 'prtg',         source_id: 'ups-rack01',        hierarchy_level: 0, severity: 'warning', message: 'PRTG UPS Sensor: input voltage dropped to 211V (nominal 230V) on rack01 circuit-A', metadata: { circuit: 'A' } },
  { ts: ts(INC.ups,  1, 1),  source_type: 'prtg',         source_id: 'ups-rack01',        hierarchy_level: 0, severity: 'error',   message: 'PRTG: UPS rack01 — AC input lost, switching to battery backup (battery: 98%)', metadata: { circuit: 'A' } },
  { ts: ts(INC.ups,  1, 2),  source_type: 'linux_syslog', source_id: 'nas01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'apcupsd: Power failure detected — running on UPS battery, estimated runtime 22 min', metadata: {} },
  { ts: ts(INC.ups,  2, 3),  source_type: 'prtg',         source_id: 'ups-rack02',        hierarchy_level: 0, severity: 'error',   message: 'PRTG: UPS rack02 — mains power lost, on battery. Load: 68%', metadata: { circuit: 'B' } },
  { ts: ts(INC.ups,  2, 4),  source_type: 'linux_syslog', source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'upsd: on battery — time remaining 18m30s, battery charge 95%', metadata: {} },
  { ts: ts(INC.ups,  5, 5),  source_type: 'prtg',         source_id: 'ups-rack01',        hierarchy_level: 0, severity: 'warning', message: 'PRTG: UPS battery runtime estimate now 14 minutes — brownout duration extended', metadata: { circuit: 'A' } },
  { ts: ts(INC.ups, 10, 6),  source_type: 'prtg',         source_id: 'ups-rack01',        hierarchy_level: 0, severity: 'warning', message: 'PRTG: UPS rack01 battery capacity at 72% — mains power still unavailable', metadata: {} },
  { ts: ts(INC.ups, 12, 7),  source_type: 'prtg',         source_id: 'ups-rack01',        hierarchy_level: 0, severity: 'info',    message: 'PRTG: UPS rack01 — mains power restored, switching from battery to AC input', metadata: { circuit: 'A' } },
  { ts: ts(INC.ups, 12, 8),  source_type: 'linux_syslog', source_id: 'nas01.lab.local',   hierarchy_level: 0, severity: 'info',    message: 'apcupsd: Power restored to UPS rack01 — returning to AC mains (on battery 12m)', metadata: {} },
  { ts: ts(INC.ups, 13, 9),  source_type: 'prtg',         source_id: 'ups-rack02',        hierarchy_level: 0, severity: 'info',    message: 'PRTG: UPS rack02 mains power restored — battery recharge commenced (at 68%)', metadata: { circuit: 'B' } },

  // UPS battery self-test failures (separate event, should cluster with UPS theme?)
  { ts: ts(INC.ups, -240, 10), source_type: 'prtg',       source_id: 'ups-rack01',        hierarchy_level: 0, severity: 'warning', message: 'PRTG: UPS scheduled battery self-test FAILED — battery capacity 67% (threshold: 80%)', metadata: {} },
  { ts: ts(INC.ups, -238, 11), source_type: 'linux_syslog', source_id: 'nas01.lab.local', hierarchy_level: 0, severity: 'warning', message: 'apcupsd: battery health check failed — replace battery within 2 weeks (current runtime: 18 min)', metadata: {} },
  { ts: ts(INC.ups, -120, 12), source_type: 'prtg',       source_id: 'ups-rack02',        hierarchy_level: 0, severity: 'warning', message: 'PRTG UPS Battery Age sensor: rack02 battery age 4.2 years — manufacturer recommends replacement at 3 years', metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 6: TLS / SSL CERTIFICATE EXPIRY CHAIN
  // 12 events — escalating warnings over days, then actual failures
  // ══════════════════════════════════════════════════════════════════════════

  { ts: ts(INC.tls,  -7 * 24 * 60, 0), source_type: 'generic_text', source_id: 'cert-monitor',    hierarchy_level: 0, severity: 'warning', message: 'Certificate expiry warning: app.lab.local — expires in 30 days (2026-06-17)', metadata: { domain: 'app.lab.local', days_remaining: 30 } },
  { ts: ts(INC.tls,  -3 * 24 * 60, 1), source_type: 'generic_text', source_id: 'cert-monitor',    hierarchy_level: 0, severity: 'warning', message: 'Certificate expiry warning: app.lab.local — 14 days remaining, auto-renewal pending', metadata: { domain: 'app.lab.local', days_remaining: 14 } },
  { ts: ts(INC.tls,  -7 * 24 * 60, 2), source_type: 'prtg',         source_id: 'prtg-cert-sensor', hierarchy_level: 0, severity: 'warning', message: 'PRTG SSL Certificate sensor: app.lab.local certificate valid for 30 more days', metadata: {} },
  { ts: ts(INC.tls,   0, 3),           source_type: 'generic_text', source_id: 'cert-monitor',    hierarchy_level: 0, severity: 'error',   message: 'TLS certificate for api.lab.local EXPIRED at 00:00:00 UTC — HTTPS requests will fail', metadata: { domain: 'api.lab.local' } },
  { ts: ts(INC.tls,   5, 4),           source_type: 'linux_syslog', source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'error',   message: "nginx: SSL_do_handshake() failed (SSL: error:0A000418:SSL routines::tlsv1 alert unknown ca) — certificate chain invalid", metadata: {} },
  { ts: ts(INC.tls,    8, 5),          source_type: 'generic_text', source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'error',   message: 'HTTPS connection to api.lab.local failed: certificate verify failed (depth=0, subject=api.lab.local)', metadata: { domain: 'api.lab.local' } },
  { ts: ts(INC.tls,  10, 6),           source_type: 'linux_syslog', source_id: 'haproxy.lab.local',hierarchy_level: 0, severity: 'error',   message: 'HAProxy: SSL handshake failure — certificate expired for backend api.lab.local:443', metadata: {} },
  { ts: ts(INC.tls,  12, 7),           source_type: 'generic_text', source_id: 'monitoring',       hierarchy_level: 0, severity: 'critical',message: 'Health check CRITICAL: api.lab.local returns SSL_ERROR_RX_RECORD_TOO_LONG — cert expired', metadata: {} },
  { ts: ts(INC.tls,  30, 8),           source_type: 'generic_text', source_id: 'certbot',          hierarchy_level: 0, severity: 'info',    message: 'certbot: Successfully renewed certificate for api.lab.local — valid until 2026-09-17', metadata: {} },
  { ts: ts(INC.tls,  35, 9),           source_type: 'linux_syslog', source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'info',    message: 'nginx: reloaded after TLS certificate renewal — new cert loaded for api.lab.local', metadata: {} },

  // Related: internal self-signed cert issues (may cluster with above or not)
  { ts: ts(INC.tls,  6, 10), source_type: 'linux_syslog', source_id: 'app02.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'SSL certificate verification failed: self-signed certificate in chain for internal-api.lab.local', metadata: {} },
  { ts: ts(INC.tls,  7, 11), source_type: 'generic_text', source_id: 'monitoring',       hierarchy_level: 0, severity: 'warning', message: 'TLS probe: internal-api.lab.local — untrusted cert (SHA-1 signature, deprecated)', metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 7: SERVICE CRASHES / WATCHDOG KILLS
  // 13 events — various phrasings for "process died unexpectedly"
  // ══════════════════════════════════════════════════════════════════════════

  { ts: ts(INC.service,  0, 0), source_type: 'linux_syslog', source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'error',    message: 'systemd[1]: nginx.service: Main process exited, code=killed, status=11/SEGV', metadata: { service: 'nginx' } },
  { ts: ts(INC.service,  1, 1), source_type: 'linux_syslog', source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'error',    message: 'systemd[1]: nginx.service: Failed with result signal:killed', metadata: { service: 'nginx' } },
  { ts: ts(INC.service,  1, 2), source_type: 'linux_syslog', source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'info',     message: 'systemd[1]: nginx.service: Scheduled restart job, restart counter is at 1', metadata: { service: 'nginx' } },
  { ts: ts(INC.service,  5, 3), source_type: 'linux_syslog', source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'critical', message: 'Process tomcat9 (pid 5512) terminated abnormally — core dump written to /var/crash/tomcat9.5512', metadata: { pid: 5512 } },
  { ts: ts(INC.service,  8, 4), source_type: 'linux_syslog', source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'error',    message: 'watchdog: process java 5512 exceeded memory limit 4GB — sending SIGKILL', metadata: { pid: 5512 } },
  { ts: ts(INC.service, 10, 5), source_type: 'windows_event', source_id: 'win-app01.lab.local', hierarchy_level: 0, severity: 'error', message: 'Event 1000: Application Error — IIS Application Pool crashed: w3wp.exe (fault module: ucrtbase.dll)', metadata: { event_id: 1000 } },
  { ts: ts(INC.service, 12, 6), source_type: 'windows_event', source_id: 'win-app01.lab.local', hierarchy_level: 0, severity: 'error', message: 'Event 7034: The IIS Application Pool service terminated unexpectedly (3rd time this hour)', metadata: { event_id: 7034 } },
  { ts: ts(INC.service, 15, 7), source_type: 'linux_syslog', source_id: 'web02.lab.local',  hierarchy_level: 0, severity: 'error',    message: 'apache2: child pid 9321 exit signal Segmentation fault (11), possible core dump to /tmp', metadata: { pid: 9321 } },
  { ts: ts(INC.service, 18, 8), source_type: 'linux_syslog', source_id: 'web02.lab.local',  hierarchy_level: 0, severity: 'warning',  message: 'systemd: Unit apache2.service entered failed state — restart attempt 2/3', metadata: { service: 'apache2' } },
  { ts: ts(INC.service, 20, 9), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'critical', message: 'postgres: server process (pid 2233) was terminated by signal 6: Aborted — database integrity may be compromised', metadata: { pid: 2233 } },
  { ts: ts(INC.service, 22,10), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'error',    message: 'systemd: postgresql@14-main.service: main process exited, code=killed — restarting in 5s', metadata: {} },
  { ts: ts(INC.service, 30,11), source_type: 'prtg',         source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'error',    message: 'PRTG HTTP sensor: web01 — service returned 502 Bad Gateway (nginx upstream connection refused)', metadata: {} },
  { ts: ts(INC.service, 35,12), source_type: 'prtg',         source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'info',     message: 'PRTG HTTP sensor: web01 — service returned 200 OK after nginx restart', metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 8: BACKUP FAILURES
  // 12 events — various backup software/scenarios
  // ══════════════════════════════════════════════════════════════════════════

  { ts: ts(INC.backup,  0, 0), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'error', message: "Veeam Backup job 'Lab-Daily' failed: target repository /mnt/backup-nfs has insufficient space (2% free)", metadata: {} },
  { ts: ts(INC.backup,  5, 1), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'error', message: "rsync: backup of db01:/var/lib/mysql to bkp01 failed — ssh: connect to host bkp01.lab.local port 22: Connection refused", metadata: {} },
  { ts: ts(INC.backup, 10, 2), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'error', message: "Backup verification failed: checksum mismatch on archive daily-db01-2026-05-17.tar.gz (expected: a3f8c2, got: b7d91e)", metadata: {} },
  { ts: ts(INC.backup, 15, 3), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'error', message: 'bacula: Job backup-web01 exited with errors — Fatal error: append_file(): /mnt/backup full', metadata: {} },
  { ts: ts(INC.backup, 20, 4), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'error', message: 'borgbackup: repository locked by another process — backup aborted after 30 min timeout', metadata: {} },
  { ts: ts(INC.backup, 25, 5), source_type: 'windows_event', source_id: 'win-bkp01.lab.local', hierarchy_level: 0, severity: 'error', message: 'Windows Server Backup event 517: Backup failed because the backup location is not accessible', metadata: { event_id: 517 } },
  { ts: ts(INC.backup, 30, 6), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'Backup retention policy: unable to delete old backups from NAS — permission denied on /mnt/backup-nfs/older', metadata: {} },
  { ts: ts(INC.backup, 35, 7), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'warning', message: 'amanda: backup of web01:/home missed schedule — network connection to bkp01 timed out at 02:30', metadata: {} },
  { ts: ts(INC.backup, 40, 8), source_type: 'prtg',         source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'error',   message: 'PRTG Disk sensor: /mnt/backup-nfs is 98% full — backup storage critically low', metadata: {} },
  { ts: ts(INC.backup, 45, 9), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'error',   message: "Veeam: Cannot perform incremental backup — previous backup chain corrupted, full backup required", metadata: {} },
  { ts: ts(INC.backup,120,10), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'info',    message: '30 GB of old backups purged from /mnt/backup-nfs — free space now 18%', metadata: {} },
  { ts: ts(INC.backup,125,11), source_type: 'generic_text', source_id: 'bkp01.lab.local',  hierarchy_level: 0, severity: 'info',    message: "Veeam Backup job 'Lab-Daily' completed successfully after storage was freed", metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 9: KERNEL / HARDWARE ERRORS
  // 10 events — kernel oops, MCE, hardware fault messages
  // ══════════════════════════════════════════════════════════════════════════

  { ts: ts(INC.kernel,  0, 0), source_type: 'linux_syslog', source_id: 'web02.lab.local',  hierarchy_level: 0, severity: 'critical', message: 'kernel: BUG: unable to handle kernel paging request at ffffffffc0a18000', metadata: {} },
  { ts: ts(INC.kernel,  1, 1), source_type: 'linux_syslog', source_id: 'web02.lab.local',  hierarchy_level: 0, severity: 'critical', message: 'kernel: Oops: general protection fault, sig:11 code:0 — kernel panic imminent', metadata: {} },
  { ts: ts(INC.kernel,  5, 2), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'error',    message: 'kernel: mce: [Hardware Error]: Machine check: uncorrected hardware memory error in DRAM ECC page', metadata: {} },
  { ts: ts(INC.kernel,  6, 3), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'error',    message: 'kernel: EDAC mc0: 1 CE page frame at 0x00000001 3840c000, address 0x113840c000, grain 8, syndrome 0x0', metadata: {} },
  { ts: ts(INC.kernel, 10, 4), source_type: 'linux_syslog', source_id: 'web01.lab.local',  hierarchy_level: 0, severity: 'error',    message: 'kernel: WARN_ON(PageSlab(page)) — kernel memory corruption suspected, check dmesg', metadata: {} },
  { ts: ts(INC.kernel, 15, 5), source_type: 'linux_syslog', source_id: 'app01.lab.local',  hierarchy_level: 0, severity: 'error',    message: 'kernel: INFO: soft lockup – CPU#3 stuck for 23s! [kworker/3:2:4521]', metadata: {} },
  { ts: ts(INC.kernel, 20, 6), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'critical', message: 'kernel: Kernel panic — not syncing: Fatal exception in interrupt, system halted', metadata: {} },
  { ts: ts(INC.kernel, 25, 7), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'info',     message: 'kernel: Kernel command line: BOOT_IMAGE=/vmlinuz-5.15.0-92 (recovery mode after panic)', metadata: {} },
  { ts: ts(INC.kernel, 60, 8), source_type: 'linux_syslog', source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'warning',  message: 'kernel: ECC error corrected (DIMM slot A1) — memory module may need replacement', metadata: {} },
  { ts: ts(INC.kernel, 65, 9), source_type: 'prtg',         source_id: 'db01.lab.local',   hierarchy_level: 0, severity: 'error',    message: 'PRTG: db01 — host unreachable after kernel panic (last seen 6 minutes ago)', metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 10: NTP / TIME SYNC ISSUES
  // 9 events — time drift warnings, peer failures, clock adjustments
  // ══════════════════════════════════════════════════════════════════════════

  { ts: ts(INC.ntp,  0, 0), source_type: 'linux_syslog', source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'ntpd: time correction of 1.234s exceeds step threshold (0.128s) — stepping clock', metadata: {} },
  { ts: ts(INC.ntp,  2, 1), source_type: 'linux_syslog', source_id: 'web02.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'chronyd: Clock is 2.7 seconds slow — large adjustment applied', metadata: {} },
  { ts: ts(INC.ntp,  5, 2), source_type: 'linux_syslog', source_id: 'db01.lab.local',    hierarchy_level: 0, severity: 'error',   message: 'ntpd: no peers found — all configured NTP servers unreachable', metadata: {} },
  { ts: ts(INC.ntp,  6, 3), source_type: 'linux_syslog', source_id: 'app01.lab.local',   hierarchy_level: 0, severity: 'error',   message: 'ntpq: NTP peer pool.ntp.org is not reachable (stratum 16, no sync)', metadata: {} },
  { ts: ts(INC.ntp, 10, 4), source_type: 'linux_syslog', source_id: 'bastion.lab.local', hierarchy_level: 0, severity: 'warning', message: 'chrony: clock drift rate 8.3 ppm exceeds acceptable bounds — time accuracy degraded', metadata: {} },
  { ts: ts(INC.ntp, 12, 5), source_type: 'generic_text', source_id: 'monitoring',        hierarchy_level: 0, severity: 'warning', message: 'Nagios: NTP offset check CRITICAL on db01 — 3142ms offset (threshold: 500ms)', metadata: {} },
  { ts: ts(INC.ntp, 15, 6), source_type: 'linux_syslog', source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'systemd-timesyncd: Failed to synchronize time with ntp1.lab.local — connection timeout', metadata: {} },
  { ts: ts(INC.ntp, 30, 7), source_type: 'linux_syslog', source_id: 'db01.lab.local',    hierarchy_level: 0, severity: 'info',    message: 'ntpd: synchronized to 192.168.1.1 stratum 2 after 3 failed peers', metadata: {} },
  { ts: ts(INC.ntp, 35, 8), source_type: 'linux_syslog', source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'info',    message: 'chronyd: NTP synchronization established — offset -0.001s, drift 1.2 ppm', metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 11: THERMAL / FAN ALERTS
  // 9 events — temperature warnings, CPU throttling, fan failures
  // ══════════════════════════════════════════════════════════════════════════

  { ts: ts(INC.thermal,  0, 0), source_type: 'prtg',         source_id: 'nas01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'PRTG Temperature sensor: nas01 chassis temp 54°C — warning threshold (50°C) exceeded', metadata: { sensor: 'Temperature' } },
  { ts: ts(INC.thermal,  2, 1), source_type: 'linux_syslog', source_id: 'nas01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'kernel: acpitz temperature: 58°C — above threshold, initiating thermal throttling', metadata: {} },
  { ts: ts(INC.thermal,  3, 2), source_type: 'prtg',         source_id: 'db01.lab.local',    hierarchy_level: 0, severity: 'warning', message: 'PRTG Fan sensor: db01 — fan CPU_FAN1 speed 0 RPM (stalled or disconnected)', metadata: { sensor: 'Fan' } },
  { ts: ts(INC.thermal,  5, 3), source_type: 'linux_syslog', source_id: 'db01.lab.local',    hierarchy_level: 0, severity: 'error',   message: 'CPU0: Core temperature above threshold, cpu clock throttled (factor: 10%)', metadata: {} },
  { ts: ts(INC.thermal,  8, 4), source_type: 'linux_syslog', source_id: 'db01.lab.local',    hierarchy_level: 0, severity: 'error',   message: 'Thermal: CPU1 temperature 82°C — critical threshold approaching, performance degraded', metadata: {} },
  { ts: ts(INC.thermal, 10, 5), source_type: 'prtg',         source_id: 'db01.lab.local',    hierarchy_level: 0, severity: 'error',   message: 'PRTG: db01 CPU temperature 85°C — CRITICAL threshold exceeded, hardware may be at risk', metadata: {} },
  { ts: ts(INC.thermal, 12, 6), source_type: 'linux_syslog', source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'sensors: coretemp-isa-0000 Core 2: +76.0°C (high = +80°C, crit = +96°C)', metadata: {} },
  { ts: ts(INC.thermal, 20, 7), source_type: 'prtg',         source_id: 'nas01.lab.local',   hierarchy_level: 0, severity: 'info',    message: 'PRTG Temperature sensor: nas01 chassis temp returned to 42°C after fan replacement', metadata: {} },
  { ts: ts(INC.thermal, 22, 8), source_type: 'linux_syslog', source_id: 'db01.lab.local',    hierarchy_level: 0, severity: 'info',    message: 'CPU thermal throttling cleared — temperature normalised to 62°C after airflow improved', metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 12: DNS FAILURES
  // 9 events — resolver failures, zone issues, propagation errors
  // ══════════════════════════════════════════════════════════════════════════

  { ts: ts(INC.dns,  0, 0), source_type: 'linux_syslog', source_id: 'dns01.lab.local',   hierarchy_level: 0, severity: 'error',   message: 'named: network unreachable resolving lab.local — all upstream forwarders unreachable', metadata: {} },
  { ts: ts(INC.dns,  2, 1), source_type: 'linux_syslog', source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'error',   message: "resolver: DNS query for db01.lab.local timed out after 5s — no response from 192.168.1.53", metadata: {} },
  { ts: ts(INC.dns,  3, 2), source_type: 'linux_syslog', source_id: 'app01.lab.local',   hierarchy_level: 0, severity: 'error',   message: "getaddrinfo: Name or service not known — DNS resolution failed for 'api.lab.local'", metadata: {} },
  { ts: ts(INC.dns,  5, 3), source_type: 'generic_text', source_id: 'dns01.lab.local',   hierarchy_level: 0, severity: 'error',   message: 'BIND: zone lab.local/IN: AXFR transfer from 192.168.1.1 failed: connection refused', metadata: {} },
  { ts: ts(INC.dns,  8, 4), source_type: 'linux_syslog', source_id: 'dns01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'named: client 192.168.1.100 query (cache) denied — SERVFAIL response sent', metadata: {} },
  { ts: ts(INC.dns, 10, 5), source_type: 'prtg',         source_id: 'dns01.lab.local',   hierarchy_level: 0, severity: 'error',   message: 'PRTG DNS sensor: dns01 — resolution of lab.local failed (query timeout 5000ms)', metadata: {} },
  { ts: ts(INC.dns, 12, 6), source_type: 'linux_syslog', source_id: 'app02.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'nscd: host cache flush failed — DNS negative cache timeout may cause resolution delays', metadata: {} },
  { ts: ts(INC.dns, 20, 7), source_type: 'linux_syslog', source_id: 'dns01.lab.local',   hierarchy_level: 0, severity: 'info',    message: 'named: zone lab.local loaded serial 2026051801 — DNS service restored', metadata: {} },
  { ts: ts(INC.dns, 25, 8), source_type: 'generic_text', source_id: 'monitoring',        hierarchy_level: 0, severity: 'info',    message: 'DNS health check RECOVERED: dns01.lab.local responding to queries for lab.local', metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // THEME 13: DISK SPACE / INODE EXHAUSTION (different from disk I/O failure)
  // 8 events — full filesystem, inode exhaustion, /tmp overflow
  // FALSE-POSITIVE TEST vs Theme 1: same disk topic but completely different root cause
  // ══════════════════════════════════════════════════════════════════════════

  { ts: ts(INC.service, 3, 13), source_type: 'linux_syslog', source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'error',   message: 'kernel: ext4 filesystem on sda1 reached maximum number of inodes — cannot create new files', metadata: {} },
  { ts: ts(INC.service, 4, 14), source_type: 'linux_syslog', source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'error',   message: 'cron: No space left on device — unable to write /var/log/syslog (filesystem full)', metadata: {} },
  { ts: ts(INC.service, 5, 15), source_type: 'linux_syslog', source_id: 'db01.lab.local',    hierarchy_level: 0, severity: 'error',   message: 'postgres: could not write to file "pg_wal/00000001000000000000001": No space left on device', metadata: {} },
  { ts: ts(INC.service, 6, 16), source_type: 'prtg',         source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'error',   message: 'PRTG Disk Free sensor: web01:/var — 0% free space (filesystem full)', metadata: { sensor: 'DiskFree' } },
  { ts: ts(INC.service, 7, 17), source_type: 'linux_syslog', source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'error',   message: '/tmp is full: df shows 100% utilisation — tmpfs overflow, applications writing to /tmp will fail', metadata: {} },
  { ts: ts(INC.service, 8, 18), source_type: 'generic_text', source_id: 'monitoring',        hierarchy_level: 0, severity: 'warning', message: 'Nagios DISK WARNING: /var/log on web01 is 98% full — 142 MB free, logs rotating improperly', metadata: {} },
  { ts: ts(INC.service, 9, 19), source_type: 'linux_syslog', source_id: 'app01.lab.local',   hierarchy_level: 0, severity: 'warning', message: 'logrotate: /var/log/app.log could not be rotated — destination /var/log/archive full', metadata: {} },
  { ts: ts(INC.service,10, 20), source_type: 'linux_syslog', source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'info',    message: 'find: 14GB of core dumps deleted from /var/crash — disk usage returned to 45%', metadata: {} },

  // ══════════════════════════════════════════════════════════════════════════
  // ROUTINE / INFORMATIONAL EVENTS (singletons — should NOT cluster with incidents)
  // 20 events across all 7 days
  // ══════════════════════════════════════════════════════════════════════════

  { ts: ts(INC.routine,  0 * 24 * 60, 0),  source_type: 'linux_syslog',  source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'info',  message: 'System rebooted normally after scheduled maintenance window (2026-05-12 03:00 UTC)', metadata: {} },
  { ts: ts(INC.routine,  1 * 24 * 60, 1),  source_type: 'linux_syslog',  source_id: 'web02.lab.local',   hierarchy_level: 0, severity: 'info',  message: 'Apache HTTPD configuration reload completed successfully (graceful restart)', metadata: {} },
  { ts: ts(INC.routine,  1 * 24 * 60 + 60, 2), source_type: 'generic_text',  source_id: 'patch-mgr',    hierarchy_level: 0, severity: 'info',  message: 'Unattended-upgrades: 12 security packages installed on web01 (kernel update pending reboot)', metadata: {} },
  { ts: ts(INC.routine,  2 * 24 * 60, 3),  source_type: 'linux_syslog',  source_id: 'db01.lab.local',    hierarchy_level: 0, severity: 'info',  message: 'PostgreSQL autovacuum: table "logs" vacuumed (index scans: 1) in 3.42s', metadata: {} },
  { ts: ts(INC.routine,  2 * 24 * 60 + 30, 4), source_type: 'linux_syslog', source_id: 'db01.lab.local', hierarchy_level: 0, severity: 'debug', message: 'PostgreSQL checkpoint: 4821 buffers written, sync 0.018s, total 0.091s', metadata: {} },
  { ts: ts(INC.routine,  3 * 24 * 60, 5),  source_type: 'windows_event', source_id: 'win-dc01.lab.local', hierarchy_level: 0, severity: 'info', message: "Event 4624: User 'charles' logged on interactively (logon type 2) from WORKSTATION-01", metadata: { event_id: 4624 } },
  { ts: ts(INC.routine,  3 * 24 * 60 + 90, 6), source_type: 'linux_syslog', source_id: 'web01.lab.local', hierarchy_level: 0, severity: 'info', message: "Let's Encrypt: certificate renewed for web01.lab.local — valid for 90 days", metadata: {} },
  { ts: ts(INC.routine,  4 * 24 * 60, 7),  source_type: 'generic_text',  source_id: 'maint-scheduler',  hierarchy_level: 0, severity: 'info',  message: 'Maintenance window started 03:00 UTC — all PRTG alerts paused for 2 hours on lab hosts', metadata: {} },
  { ts: ts(INC.routine,  4 * 24 * 60 + 120, 8), source_type: 'generic_text', source_id: 'maint-scheduler', hierarchy_level: 0, severity: 'info', message: 'Maintenance window closed 05:00 UTC — PRTG alerting re-enabled for all hosts', metadata: {} },
  { ts: ts(INC.routine,  4 * 24 * 60 + 60, 9), source_type: 'linux_syslog', source_id: 'dns01.lab.local', hierarchy_level: 0, severity: 'info', message: 'named: zone lab.local updated — 3 new A records added for new VM hosts', metadata: {} },
  { ts: ts(INC.routine,  5 * 24 * 60, 10), source_type: 'linux_syslog',  source_id: 'web01.lab.local',   hierarchy_level: 0, severity: 'info',  message: "Cron job 'log-archive-weekly' completed — 4.2 GB archived to /mnt/archive in 47s", metadata: {} },
  { ts: ts(INC.routine,  5 * 24 * 60 + 30, 11), source_type: 'linux_syslog', source_id: 'app01.lab.local', hierarchy_level: 0, severity: 'info', message: 'Nginx access log: 127.0.0.1 GET /health HTTP/1.1 200 — health check passed', metadata: {} },
  { ts: ts(INC.routine,  5 * 24 * 60 + 60, 12), source_type: 'generic_text', source_id: 'reports',        hierarchy_level: 0, severity: 'info', message: 'Weekly capacity report generated: storage at 62%, memory avg 71%, CPU avg 38%', metadata: {} },
  { ts: ts(INC.routine,  6 * 24 * 60, 13), source_type: 'linux_syslog',  source_id: 'web02.lab.local',   hierarchy_level: 0, severity: 'info',  message: 'Kernel 5.15.0-104-generic installed — reboot required to activate new kernel', metadata: {} },
  { ts: ts(INC.routine,  6 * 24 * 60 + 30, 14), source_type: 'linux_syslog', source_id: 'app01.lab.local', hierarchy_level: 0, severity: 'debug', message: 'NTP: clock offset 0.00027s, frequency error -1.2 ppm — excellent sync quality', metadata: {} },
  { ts: ts(INC.routine,  6 * 24 * 60 + 60, 15), source_type: 'windows_event', source_id: 'win-dc01.lab.local', hierarchy_level: 0, severity: 'info', message: 'Event 1074: Domain controller rebooted by administrator after Windows Update installation', metadata: { event_id: 1074 } },
  { ts: ts(INC.routine,  6 * 24 * 60 + 90, 16), source_type: 'generic_text', source_id: 'patch-mgr',     hierarchy_level: 0, severity: 'info',  message: 'Patch compliance: 14/14 lab hosts fully patched — no outstanding CVEs (severity ≥ HIGH)', metadata: {} },
  { ts: ts(INC.routine,  6 * 24 * 60 + 120, 17), source_type: 'linux_syslog', source_id: 'db01.lab.local', hierarchy_level: 0, severity: 'info', message: 'pg_dump: backup of database "production" completed in 8m42s — 23.4 GB compressed', metadata: {} },
  { ts: ts(INC.routine,  6 * 24 * 60 + 150, 18), source_type: 'linux_syslog', source_id: 'nas01.lab.local', hierarchy_level: 0, severity: 'info', message: 'smartmontools: scheduled SMART short self-test passed on all drives', metadata: {} },
  { ts: ts(INC.routine,  6 * 24 * 60 + 180, 19), source_type: 'generic_text', source_id: 'monitoring',     hierarchy_level: 0, severity: 'info', message: 'All service checks GREEN: 47 hosts, 312 services — uptime 99.91% this week', metadata: {} },
]

// ---------------------------------------------------------------------------
// OpenRouter — raw fetch. Avoids the openai SDK (not Deno-native).
// ---------------------------------------------------------------------------
const OPENROUTER_URL = 'https://openrouter.ai/api/v1'

async function openrouterEmbeddings(
  inputs: string[],
  apiKey: string,
  model: string,
): Promise<number[][]> {
  const res = await fetch(`${OPENROUTER_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: inputs }),
  })
  if (!res.ok) {
    throw new Error(`OpenRouter embeddings failed: ${res.status} ${await res.text()}`)
  }
  const body = await res.json()
  return body.data
    .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((d: { embedding: number[] }) => d.embedding)
}

async function openrouterChat(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })
  if (!res.ok) {
    throw new Error(`OpenRouter chat failed: ${res.status} ${await res.text()}`)
  }
  const body = await res.json()
  return body.choices?.[0]?.message?.content ?? ''
}

// ---------------------------------------------------------------------------
// Clustering — greedy single-pass cosine similarity above threshold.
// ---------------------------------------------------------------------------
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

function clusterByThreshold(embeddings: number[][], threshold: number): number[] {
  const labels = new Array<number>(embeddings.length).fill(-1)
  let next = 0
  for (let i = 0; i < embeddings.length; i++) {
    if (labels[i] !== -1) continue
    labels[i] = next
    for (let j = i + 1; j < embeddings.length; j++) {
      if (labels[j] !== -1) continue
      if (cosine(embeddings[i], embeddings[j]) >= threshold) labels[j] = next
    }
    next++
  }
  return labels
}

// ---------------------------------------------------------------------------
// Entry — Deno.serve handler
// ---------------------------------------------------------------------------
Deno.serve(async (_req) => {
  const started = Date.now()
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
    const EMBEDDING_MODEL = Deno.env.get('OPENROUTER_EMBEDDING_MODEL') ?? 'openai/text-embedding-3-small'
    const SUMMARY_MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'openai/gpt-4o-mini'

    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: 'OPENROUTER_API_KEY not set in function secrets' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // 1) INSERT log_events from corpus
    const eventRows = CORPUS.map((e) => ({
      timestamp: e.ts.toISOString(),
      source_type: e.source_type,
      source_id: e.source_id,
      hierarchy_level: e.hierarchy_level,
      severity: e.severity,
      message: e.message,
      raw_message: null,
      metadata: e.metadata,
    }))
    const insertEvents = await supabase
      .from('log_events')
      .insert(eventRows)
      .select('id, message')
    if (insertEvents.error) {
      throw new Error(`log_events INSERT failed: ${insertEvents.error.message}`)
    }
    const inserted = insertEvents.data ?? []
    if (inserted.length !== CORPUS.length) {
      throw new Error(`expected ${CORPUS.length} inserted rows, got ${inserted.length}`)
    }

    // 2) Embeddings
    const embeddings = await openrouterEmbeddings(
      inserted.map((r: { message: string }) => r.message),
      OPENROUTER_API_KEY,
      EMBEDDING_MODEL,
    )

    // 3) Cluster
    const labels = clusterByThreshold(embeddings, CLUSTERING_THRESHOLD)
    const clusterCount = Math.max(...labels) + 1

    // 4) Per-cluster: INSERT log_clusters + log_cluster_members + cluster_summaries
    for (let label = 0; label < clusterCount; label++) {
      const memberIndices: number[] = []
      for (let i = 0; i < labels.length; i++) if (labels[i] === label) memberIndices.push(i)

      const memberEvents = memberIndices.map((i) => CORPUS[i])
      const memberDbRows = memberIndices.map((i) => inserted[i])

      const times = memberEvents.map((e) => e.ts.getTime())
      const firstSeen = new Date(Math.min(...times))
      const lastSeen = new Date(Math.max(...times))
      const sevDist: Record<Severity, number> = {
        debug: 0, info: 0, warning: 0, error: 0, critical: 0,
      }
      for (const e of memberEvents) sevDist[e.severity]++
      const sourceTypes = Array.from(new Set(memberEvents.map((e) => e.source_type)))

      const insertCluster = await supabase
        .from('log_clusters')
        .insert({
          label: null,
          event_count: memberEvents.length,
          first_seen: firstSeen.toISOString(),
          last_seen: lastSeen.toISOString(),
          severity_distribution: sevDist,
          source_types: sourceTypes,
          hierarchy_level: 0,
          embedding_model_provider: 'openrouter',
          embedding_model_name: EMBEDDING_MODEL,
          pipeline_version: PIPELINE_VERSION,
        })
        .select('id')
        .single()
      if (insertCluster.error || !insertCluster.data) {
        throw new Error(`log_clusters INSERT failed: ${insertCluster.error?.message}`)
      }
      const clusterId: string = insertCluster.data.id

      const refEmbedding = embeddings[memberIndices[0]]
      const memberRows = memberIndices.map((idx, i) => ({
        cluster_id: clusterId,
        log_event_id: memberDbRows[i].id,
        similarity_score: cosine(refEmbedding, embeddings[idx]),
      }))
      const insertMembers = await supabase
        .from('log_cluster_members')
        .insert(memberRows)
      if (insertMembers.error) {
        throw new Error(`log_cluster_members INSERT failed: ${insertMembers.error.message}`)
      }

      const summaryPrompt = `Summarise this cluster of ${memberEvents.length} log events for a solo sysadmin. 2-3 sentences. Focus on what the pattern means and what action might be warranted. Be concrete, not generic.

Events (showing up to 10):
${memberEvents.slice(0, 10).map((e) => `[${e.severity}] ${e.source_id}: ${e.message}`).join('\n')}${memberEvents.length > 10 ? `\n... and ${memberEvents.length - 10} more` : ''}

Severity distribution: ${JSON.stringify(sevDist)}
Source types: ${sourceTypes.join(', ')}
Time range: ${firstSeen.toISOString()} → ${lastSeen.toISOString()}`

      const summaryText = await openrouterChat(
        'You are an assistant helping solo sysadmins triage log clusters. Be terse and actionable.',
        summaryPrompt,
        OPENROUTER_API_KEY,
        SUMMARY_MODEL,
      )

      const insertSummary = await supabase.from('cluster_summaries').insert({
        cluster_id: clusterId,
        summary_text: summaryText,
        summary_model_provider: 'openrouter',
        summary_model_name: SUMMARY_MODEL,
        pipeline_version: PIPELINE_VERSION,
        period_start: firstSeen.toISOString(),
        period_end: lastSeen.toISOString(),
      })
      if (insertSummary.error) {
        throw new Error(`cluster_summaries INSERT failed: ${insertSummary.error.message}`)
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        log_events: inserted.length,
        log_clusters: clusterCount,
        cluster_summaries: clusterCount,
        duration_ms: Date.now() - started,
        provider: 'openrouter',
        embedding_model: EMBEDDING_MODEL,
        summary_model: SUMMARY_MODEL,
        pipeline_version: PIPELINE_VERSION,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ ok: false, error: message, duration_ms: Date.now() - started }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
