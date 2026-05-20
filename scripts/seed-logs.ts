// scripts/seed-logs.ts
// user-mufaddal
//
// Inserts realistic dummy log events from:
//   - Windows Server (Event Log format)
//   - Linux Server   (syslog format)
//   - Cisco IOS/IOS-XE switches (% facility format)
//   - Extreme Networks (ExtremeXOS format)
//   - Milestone XProtect VMS (event log format)
//
// Also seeds sample open alarms so the Alarms page has data.
//
// Run:
//   node --env-file=.env.local -r tsx/cjs scripts/seed-logs.ts
//   OR:
//   pnpm tsx --env-file=.env.local scripts/seed-logs.ts
//
// Does NOT delete existing rows — safe to re-run (events are additive).
// Does NOT run the AI pipeline (no embeddings/clusters/summaries).
// Run scripts/seed-pipeline.ts after this to cluster the new events.

import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Pre-flight
// ---------------------------------------------------------------------------
function preflight() {
  const missing: string[] = []
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)  missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) {
    console.error('[seed-logs] missing env vars:', missing.join(', '))
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------
const NOW  = Date.now()
const DAY  = 86_400_000
const HOUR = 3_600_000
const MIN  = 60_000

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString()
}

type SrcType =
  | 'windows_event'
  | 'linux_syslog'
  | 'generic_text'
  | 'prtg'

type Sev = 'debug' | 'info' | 'warning' | 'error' | 'critical'

interface Row {
  timestamp: string
  source_type: SrcType
  source_id: string
  hierarchy_level: 0
  severity: Sev
  message: string
  raw_message: string | null
  metadata: Record<string, unknown>
}

function ev(
  ts: number,
  type: SrcType,
  src: string,
  sev: Sev,
  msg: string,
  meta: Record<string, unknown> = {},
  raw?: string,
): Row {
  return {
    timestamp:       new Date(ts).toISOString(),
    source_type:     type,
    source_id:       src,
    hierarchy_level: 0,
    severity:        sev,
    message:         msg,
    raw_message:     raw ?? null,
    metadata:        meta,
  }
}

// ---------------------------------------------------------------------------
// ═══════════════════════════════════════════════════════════════════════════
//  WINDOWS SERVER
//  Host: WIN-SRV01 (domain controller), WIN-SRV02 (app server)
//  Format: "Event <ID>: <description>"
// ═══════════════════════════════════════════════════════════════════════════
const WIN_SRV01 = 'WIN-SRV01.corp.local'
const WIN_SRV02 = 'WIN-SRV02.corp.local'

const windowsEvents: Row[] = [
  // ── System startup / shutdown ──
  ev(NOW - 6*DAY,               'windows_event', WIN_SRV01, 'info',    'Event 6005: The Event log service was started — system boot after scheduled restart'),
  ev(NOW - 6*DAY + 2*MIN,       'windows_event', WIN_SRV01, 'info',    'Event 6009: Microsoft Windows 10.0.20348 Multiprocessor Free — system version at startup'),
  ev(NOW - 6*DAY + 5*MIN,       'windows_event', WIN_SRV01, 'info',    'Event 7036: Active Directory Domain Services service entered the running state'),
  ev(NOW - 6*DAY + 6*MIN,       'windows_event', WIN_SRV01, 'info',    'Event 7036: DNS Server service entered the running state'),
  ev(NOW - 6*DAY + 7*MIN,       'windows_event', WIN_SRV01, 'info',    'Event 7036: DHCP Server service entered the running state'),
  ev(NOW - 3*DAY - 4*HOUR,      'windows_event', WIN_SRV01, 'info',    'Event 6006: The Event log service was stopped — planned shutdown for Windows Update'),
  ev(NOW - 3*DAY - 3*HOUR - 58*MIN, 'windows_event', WIN_SRV01, 'info', 'Event 6005: The Event log service was started — system resumed after update reboot'),
  ev(NOW - 1*DAY,               'windows_event', WIN_SRV01, 'info',    'Event 1074: System shutdown initiated by NT AUTHORITY\\SYSTEM after installing KB5036909 (Windows Update)'),
  ev(NOW - 1*DAY + 12*MIN,      'windows_event', WIN_SRV01, 'info',    'Event 6005: The Event log service was started — system resumed after update reboot'),

  // ── Authentication events ──
  ev(NOW - 6*DAY + 30*MIN,      'windows_event', WIN_SRV01, 'info',    'Event 4624: Successful logon — Account: CORP\\administrator, Logon Type: 10 (RemoteInteractive), Src: 10.0.1.50'),
  ev(NOW - 5*DAY + 2*HOUR,      'windows_event', WIN_SRV01, 'warning', 'Event 4625: Logon failure — Account: CORP\\svc_monitor, Failure reason: Unknown username or bad password, Src: 10.0.1.100', { event_id: 4625 }),
  ev(NOW - 5*DAY + 2*HOUR + MIN, 'windows_event', WIN_SRV01, 'warning','Event 4625: Logon failure — Account: CORP\\svc_monitor, Failure reason: Unknown username or bad password, Src: 10.0.1.100', { event_id: 4625 }),
  ev(NOW - 5*DAY + 2*HOUR + 2*MIN, 'windows_event', WIN_SRV01, 'warning','Event 4625: Logon failure — Account: CORP\\svc_monitor, Failure reason: Unknown username or bad password, Src: 10.0.1.100', { event_id: 4625 }),
  ev(NOW - 5*DAY + 2*HOUR + 3*MIN, 'windows_event', WIN_SRV01, 'warning','Event 4625: Logon failure — Account: CORP\\svc_monitor, Failure reason: Unknown username or bad password, Src: 10.0.1.100', { event_id: 4625 }),
  ev(NOW - 5*DAY + 2*HOUR + 4*MIN, 'windows_event', WIN_SRV01, 'error', 'Event 4740: Account CORP\\svc_monitor locked out — 5 bad logon attempts, caller: WIN-APP01', { event_id: 4740 }),
  ev(NOW - 5*DAY + 2*HOUR + 5*MIN, 'windows_event', WIN_SRV01, 'warning','Event 4625: Logon failure — Account: CORP\\administrator, Failure: Wrong password, Src: 185.220.101.45 (external)', { event_id: 4625, src_ip: '185.220.101.45' }),
  ev(NOW - 5*DAY + 2*HOUR + 6*MIN, 'windows_event', WIN_SRV01, 'warning','Event 4625: Logon failure — Account: CORP\\administrator, Failure: Wrong password, Src: 185.220.101.45 (external)', { event_id: 4625, src_ip: '185.220.101.45' }),
  ev(NOW - 5*DAY + 2*HOUR + 7*MIN, 'windows_event', WIN_SRV01, 'warning','Event 4625: Logon failure — Account: CORP\\administrator, Failure: Wrong password, Src: 185.220.101.45 (external)', { event_id: 4625, src_ip: '185.220.101.45' }),
  ev(NOW - 5*DAY + 2*HOUR + 8*MIN, 'windows_event', WIN_SRV01, 'error', 'Event 4740: Account CORP\\administrator auto-locked after 3 external failed attempts from 185.220.101.45', { event_id: 4740, src_ip: '185.220.101.45' }),

  // ── Group Policy / AD ──
  ev(NOW - 4*DAY + 8*HOUR,      'windows_event', WIN_SRV01, 'warning', 'Event 1085: Group Policy processing failed — unable to connect to SYSVOL path \\\\WIN-SRV01\\SYSVOL', { event_id: 1085 }),
  ev(NOW - 4*DAY + 8*HOUR + MIN,'windows_event', WIN_SRV01, 'warning', 'Event 1129: The processing of Group Policy failed because of lack of network connectivity — retrying in background', { event_id: 1129 }),
  ev(NOW - 4*DAY + 9*HOUR,      'windows_event', WIN_SRV01, 'info',    'Event 1502: Group Policy processing succeeded after retry — all CSEs completed', { event_id: 1502 }),

  // ── DNS Server ──
  ev(NOW - 3*DAY + 6*HOUR,      'windows_event', WIN_SRV01, 'error',   'Event 4004: DNS Server has not found a DNS root hint resource record — root hints zone may be corrupt', { event_id: 4004 }),
  ev(NOW - 3*DAY + 6*HOUR + 2*MIN,'windows_event', WIN_SRV01, 'error', 'Event 4015: DNS Server has encountered a critical error from AD DS — cannot load zone from AD, check connectivity to domain controller', { event_id: 4015 }),
  ev(NOW - 3*DAY + 7*HOUR,      'windows_event', WIN_SRV01, 'info',    'Event 3: DNS Server has loaded zone corp.local from Active Directory — serial 2026051901', { event_id: 3 }),

  // ── DHCP ──
  ev(NOW - 2*DAY + 10*HOUR,     'windows_event', WIN_SRV01, 'warning', 'Event 1020: DHCP server scope 10.0.1.0/24 is 87% exhausted — 28 leases remain out of 220', { event_id: 1020 }),
  ev(NOW - 2*DAY + 11*HOUR,     'windows_event', WIN_SRV01, 'error',   'Event 1022: DHCP server scope 10.0.1.0/24 has reached 95% utilization — only 11 addresses available', { event_id: 1022 }),
  ev(NOW - 2*DAY + 12*HOUR,     'windows_event', WIN_SRV01, 'info',    'Event 1000: DHCP scope expanded — 10.0.1.0/24 range extended to 10.0.1.240', { event_id: 1000 }),

  // ── Application server (WIN-SRV02) ──
  ev(NOW - 5*DAY + HOUR,        'windows_event', WIN_SRV02, 'error',   'Event 1000: Application Error — w3wp.exe faulted, exception code 0xc0000005 (Access Violation), fault module: ucrtbase.dll', { event_id: 1000 }),
  ev(NOW - 5*DAY + HOUR + MIN,  'windows_event', WIN_SRV02, 'warning', 'Event 7031: IIS Worker Process W3SVC service terminated unexpectedly — 2nd time in 1 hour, restart attempted', { event_id: 7031 }),
  ev(NOW - 5*DAY + HOUR + 3*MIN,'windows_event', WIN_SRV02, 'error',   'Event 7034: IIS Application Pool DefaultAppPool terminated unexpectedly — restart limit reached (3 restarts)', { event_id: 7034 }),
  ev(NOW - 4*DAY + 3*HOUR,      'windows_event', WIN_SRV02, 'warning', 'Event 36874: TLS 1.0 connection request received from remote client — deprecated protocol, connection may be blocked', { event_id: 36874 }),
  ev(NOW - 4*DAY + 3*HOUR + MIN,'windows_event', WIN_SRV02, 'warning', 'Event 36888: Schannel fatal error — unexpected message from client, TLS handshake aborted, Src: 10.0.0.55', { event_id: 36888 }),
  ev(NOW - 2*DAY + 2*HOUR,      'windows_event', WIN_SRV02, 'error',   'Event 7045: New service installed — DisplayName: "svchost32_helper", ImagePath: C:\\Windows\\Temp\\svchost32.exe (suspicious service)', { event_id: 7045, severity_note: 'potentially suspicious' }),
  ev(NOW - 2*DAY + 2*HOUR + MIN,'windows_event', WIN_SRV02, 'warning', 'Event 4698: Scheduled task created — TaskName: \\Microsoft\\Update\\Updater, Created by: CORP\\svc_deploy, runs hourly', { event_id: 4698 }),

  // ── Windows Defender ──
  ev(NOW - 3*DAY + 2*HOUR,      'windows_event', WIN_SRV02, 'error',   'Event 1116: Microsoft Defender Antivirus has detected malware — Threat: Trojan:Win32/Powessere.G, File: C:\\Temp\\report.docx.exe, Action: Quarantined', { event_id: 1116, threat: 'Trojan:Win32/Powessere.G' }),
  ev(NOW - 3*DAY + 2*HOUR + 2*MIN,'windows_event', WIN_SRV02, 'warning','Event 1117: Microsoft Defender Antivirus took action on malware — Threat: Trojan:Win32/Powessere.G, Action: Quarantine Succeeded', { event_id: 1117 }),
  ev(NOW - 3*DAY + 2*HOUR + 5*MIN,'windows_event', WIN_SRV02, 'info',  'Event 2000: Defender signature update successful — version 1.409.812.0 installed from Microsoft Update', { event_id: 2000 }),

  // ── Disk ──
  ev(NOW - 1*DAY + 4*HOUR,      'windows_event', WIN_SRV02, 'warning', 'Event 2013: Volume C: is at 92% capacity — 8.4 GB free of 100 GB, consider cleanup', { event_id: 2013 }),
  ev(NOW - 18*HOUR,             'windows_event', WIN_SRV02, 'error',   'Event 7: Disk — The device \\Device\\Harddisk0\\DR0 has a bad block (CRC error, sector 14680064)', { event_id: 7 }),
]

// ---------------------------------------------------------------------------
// ═══════════════════════════════════════════════════════════════════════════
//  LINUX SERVER (various hosts)
// ═══════════════════════════════════════════════════════════════════════════
const linuxEvents: Row[] = [
  // ── web-srv01 ──
  ev(NOW - 7*DAY,               'linux_syslog', 'web-srv01.corp.local', 'info',    'systemd[1]: Starting NGINX HTTP Server...'),
  ev(NOW - 7*DAY + MIN,         'linux_syslog', 'web-srv01.corp.local', 'info',    'systemd[1]: nginx.service: Started NGINX HTTP Server'),
  ev(NOW - 6*DAY + 3*HOUR,      'linux_syslog', 'web-srv01.corp.local', 'warning', 'kernel: [UFW BLOCK] IN=eth0 OUT= SRC=45.128.232.130 DST=10.0.1.20 PROTO=TCP DPT=22 — blocked port scan attempt'),
  ev(NOW - 6*DAY + 3*HOUR + MIN,'linux_syslog', 'web-srv01.corp.local', 'warning', 'kernel: [UFW BLOCK] IN=eth0 OUT= SRC=45.128.232.130 DST=10.0.1.20 PROTO=TCP DPT=3389 — blocked RDP probe'),
  ev(NOW - 5*DAY + 6*HOUR,      'linux_syslog', 'web-srv01.corp.local', 'error',   'nginx: 2026/05/14 06:00:01 [error] 1234#1234: *8291 upstream timed out (110: Connection timed out) while reading response header from upstream, upstream: "http://app-srv01:8080/api/v1/health"'),
  ev(NOW - 5*DAY + 6*HOUR + 2*MIN,'linux_syslog', 'web-srv01.corp.local', 'error', 'nginx: 2026/05/14 06:02:01 [error] 1234#1234: *8299 connect() failed (111: Connection refused) while connecting to upstream, upstream: "http://app-srv01:8080"'),
  ev(NOW - 5*DAY + 7*HOUR,      'linux_syslog', 'web-srv01.corp.local', 'info',    'nginx: upstream app-srv01:8080 back online — connection restored after 58 minutes downtime'),
  ev(NOW - 4*DAY + 2*HOUR,      'linux_syslog', 'web-srv01.corp.local', 'info',    'sshd[5821]: Accepted publickey for deploy from 10.0.0.5 port 54312 ssh2: ED25519 SHA256:abc123xyz'),
  ev(NOW - 4*DAY + 2*HOUR + MIN,'linux_syslog', 'web-srv01.corp.local', 'info',    'sudo: deploy: TTY=pts/0; PWD=/var/www/html; USER=root; COMMAND=/usr/bin/systemctl reload nginx'),
  ev(NOW - 3*DAY + 11*HOUR,     'linux_syslog', 'web-srv01.corp.local', 'warning', 'kernel: Possible SYN flooding on port 443. Sending cookies. Check SNMP counters.'),
  ev(NOW - 3*DAY + 11*HOUR + 5*MIN,'linux_syslog','web-srv01.corp.local', 'warning','kernel: TCP: Possible SYN flood on port 80 — 3241 SYNs in 60s from 77.91.93.0/24'),

  // ── app-srv01 ──
  ev(NOW - 5*DAY + 5*HOUR + 50*MIN,'linux_syslog','app-srv01.corp.local', 'critical','systemd[1]: app-api.service: Main process exited, code=killed, status=9/KILL — OOM killer terminated the process'),
  ev(NOW - 5*DAY + 5*HOUR + 51*MIN,'linux_syslog','app-srv01.corp.local', 'critical','Out of memory: Kill process 14829 (java) score 904 or sacrifice child — 15.8 GB / 16 GB RAM consumed'),
  ev(NOW - 5*DAY + 5*HOUR + 52*MIN,'linux_syslog','app-srv01.corp.local', 'error',   'Killed process 14829 (java) total-vm:16384000kB, anon-rss:15729408kB — JVM heap exhausted'),
  ev(NOW - 5*DAY + 5*HOUR + 53*MIN,'linux_syslog','app-srv01.corp.local', 'warning', 'systemd: app-api.service scheduled restart (attempt 1 of 3) — restarting in 10 seconds'),
  ev(NOW - 5*DAY + 6*HOUR,         'linux_syslog','app-srv01.corp.local', 'info',    'systemd: app-api.service started — heap size set to 12G via -Xmx12g after OOM adjustment'),
  ev(NOW - 4*DAY + 8*HOUR,         'linux_syslog','app-srv01.corp.local', 'warning', 'kernel: cpu clock throttled — thermal throttle: core 0 at 83°C, reducing frequency to 1.4 GHz'),
  ev(NOW - 4*DAY + 8*HOUR + 10*MIN,'linux_syslog','app-srv01.corp.local', 'warning', 'kernel: cpu clock throttled — thermal throttle: core 2 at 81°C'),
  ev(NOW - 4*DAY + 9*HOUR,         'linux_syslog','app-srv01.corp.local', 'info',    'kernel: CPU thermal throttling cleared — temperature normalized to 64°C after fan curve adjustment'),
  ev(NOW - 2*DAY + 4*HOUR,         'linux_syslog','app-srv01.corp.local', 'error',   'postgresql: FATAL: remaining connection slots are reserved for non-replication superuser connections — max_connections=100 exceeded'),
  ev(NOW - 2*DAY + 4*HOUR + 2*MIN, 'linux_syslog','app-srv01.corp.local', 'error',   'postgresql: FATAL: sorry, too many clients already — connection pool exhausted (100/100 slots used)'),
  ev(NOW - 2*DAY + 4*HOUR + 5*MIN, 'linux_syslog','app-srv01.corp.local', 'info',    'pgbouncer: pool size increased from 100 to 150 after connection exhaustion event'),

  // ── db-srv01 ──
  ev(NOW - 3*DAY + HOUR,        'linux_syslog', 'db-srv01.corp.local', 'warning', 'mysqld: [Warning] InnoDB: High memory usage detected — buffer pool 95% full (14.4 GB / 15 GB), consider tuning innodb_buffer_pool_size'),
  ev(NOW - 3*DAY + HOUR + 5*MIN,'linux_syslog', 'db-srv01.corp.local', 'error',   'mysqld: [ERROR] InnoDB: Page [page id: space=18, page number=8192] log sequence number 5764607523 is in the future! — binary log corruption suspected'),
  ev(NOW - 3*DAY + HOUR + 10*MIN,'linux_syslog','db-srv01.corp.local', 'error',   'mysqld: [ERROR] Slave SQL: Error executing row event: Table has no definition in replication filter — slave stopped, errno 1677'),
  ev(NOW - 3*DAY + HOUR + 15*MIN,'linux_syslog','db-srv01.corp.local', 'critical','mysqld: [CRITICAL] Replication thread stopped — STOP SLAVE called due to error, manual intervention required on db-srv01'),
  ev(NOW - 3*DAY + 2*HOUR,      'linux_syslog', 'db-srv01.corp.local', 'info',    'mysqld: [Note] Slave SQL thread initialized, starting replication in log: binlog.000423 at position 14729108'),
  ev(NOW - 1*DAY + 3*HOUR,      'linux_syslog', 'db-srv01.corp.local', 'warning', 'logrotate: /var/log/mysql/mysql-slow.log is 4.2 GB — slow query log should be reviewed (2341 queries over 1s in last 24h)'),
  ev(NOW - 12*HOUR,             'linux_syslog', 'db-srv01.corp.local', 'info',    'mysql: slow query digest: avg=2.3s, max=47.2s query="SELECT * FROM events WHERE..." — full table scan on unindexed column'),

  // ── cron / maintenance ──
  ev(NOW - 2*DAY,               'linux_syslog', 'web-srv01.corp.local', 'info',    'cron[2001]: (root) CMD (/usr/local/bin/certbot renew --quiet)'),
  ev(NOW - 2*DAY + MIN,         'linux_syslog', 'web-srv01.corp.local', 'info',    'certbot: Certificate renewed for web01.corp.local — new cert valid until 2026-08-18'),
  ev(NOW - 7*HOUR,              'linux_syslog', 'app-srv01.corp.local', 'info',    'cron[3401]: (root) CMD (/usr/local/bin/logrotate /etc/logrotate.conf) — 8 files rotated'),
]

// ---------------------------------------------------------------------------
// ═══════════════════════════════════════════════════════════════════════════
//  CISCO IOS / IOS-XE SWITCHES
//  Format: "%FACILITY-SEVERITY-MNEMONIC: message"
//  Hosts: cisco-core-sw01 (Cisco Catalyst 9300), cisco-access-sw01
// ═══════════════════════════════════════════════════════════════════════════
const CISCO_CORE  = 'cisco-core-sw01'
const CISCO_ACC   = 'cisco-access-sw01'
const CISCO_RTR   = 'cisco-rtr01'

const ciscoEvents: Row[] = [
  // ── Boot / system ──
  ev(NOW - 7*DAY + 2*MIN,  'generic_text', CISCO_CORE, 'info',    '%SYS-5-RESTART: System restarted — Cisco IOS XE Software Version 17.9.4a, ROM: Bootstrap version 17.9.4a'),
  ev(NOW - 7*DAY + 3*MIN,  'generic_text', CISCO_CORE, 'info',    '%SYS-6-BOOTTIME: Time since last system restart 0 days, 0 hours, 0 minutes'),
  ev(NOW - 7*DAY + 5*MIN,  'generic_text', CISCO_CORE, 'info',    '%SYS-5-CONFIG_I: Configured from console by admin on vty0 (10.0.0.1)'),
  ev(NOW - 4*DAY + 3*MIN,  'generic_text', CISCO_CORE, 'info',    '%SYS-6-BOOTTIME: System uptime 3 days, 0 hours, 2 minutes — scheduled SNMP poll response'),

  // ── Interface up/down (port flapping on access switch) ──
  ev(NOW - 5*DAY + 4*HOUR,         'generic_text', CISCO_ACC, 'warning', '%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet1/0/12, changed state to down — carrier lost'),
  ev(NOW - 5*DAY + 4*HOUR + 30,    'generic_text', CISCO_ACC, 'info',    '%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet1/0/12, changed state to up'),
  ev(NOW - 5*DAY + 4*HOUR + 60,    'generic_text', CISCO_ACC, 'warning', '%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet1/0/12, changed state to down'),
  ev(NOW - 5*DAY + 4*HOUR + 90,    'generic_text', CISCO_ACC, 'info',    '%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet1/0/12, changed state to up'),
  ev(NOW - 5*DAY + 4*HOUR + 2*MIN, 'generic_text', CISCO_ACC, 'error',   '%LINK-3-UPDOWN: Interface GigabitEthernet1/0/12 flapping — error-disabled after 4 state changes in 120 seconds (errdisable: flap)', { port: 'Gi1/0/12' }),
  ev(NOW - 5*DAY + 4*HOUR + 3*MIN, 'generic_text', CISCO_ACC, 'warning', '%PM-4-ERR_DISABLE: flap error detected on Gi1/0/12, putting Gi1/0/12 in err-disable state'),

  // ── STP / spanning tree ──
  ev(NOW - 5*DAY + 4*HOUR + MIN,   'generic_text', CISCO_CORE, 'warning', '%SPANTREE-5-TOPOTRAP: Topology change notification (TCN) received from GigabitEthernet1/0/2 for VLAN 20 — reconvergence in progress'),
  ev(NOW - 5*DAY + 4*HOUR + 2*MIN, 'generic_text', CISCO_CORE, 'warning', '%SPANTREE-5-ROOTCHANGE: Root change on VLAN 20 — new root bridge MAC 0025.b5de.ad01 (was 0025.b5de.ac01)'),
  ev(NOW - 5*DAY + 4*HOUR + 3*MIN, 'generic_text', CISCO_CORE, 'info',    '%SPANTREE-5-TOPO_STABLE: Spanning tree topology for VLAN 20 stabilized — 45 seconds convergence time'),

  // ── Security: port security + DHCP snooping ──
  ev(NOW - 4*DAY + 6*HOUR,   'generic_text', CISCO_ACC, 'error',   '%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation on GigabitEthernet1/0/8 — MAC 00:0c:29:ab:cd:ef not in allowed list, port shut down', { src_mac: '00:0c:29:ab:cd:ef', port: 'Gi1/0/8' }),
  ev(NOW - 4*DAY + 6*HOUR + MIN, 'generic_text', CISCO_ACC, 'warning', '%PM-4-ERR_DISABLE: psecure-violation error detected on Gi1/0/8, putting Gi1/0/8 in err-disable state'),
  ev(NOW - 3*DAY + 8*HOUR,   'generic_text', CISCO_ACC, 'warning', '%DHCP_SNOOPING-4-DHCP_SNOOPING_ERRDISABLE_WARNING: DHCP Snooping received N untrusted replies on Gi1/0/5 — possible rogue DHCP server detected', { port: 'Gi1/0/5' }),
  ev(NOW - 3*DAY + 8*HOUR + MIN, 'generic_text', CISCO_ACC, 'error', '%DHCP_SNOOPING-4-DHCP_SNOOPING_DENY: Dropped DHCP reply from 10.0.1.254 on untrusted port Gi1/0/5 — rogue DHCP blocked'),

  // ── Login security ──
  ev(NOW - 3*DAY + 10*HOUR,  'generic_text', CISCO_CORE, 'warning', '%SEC_LOGIN-4-LOGIN_FAILED: Login failed [user: admin] [Source: 192.168.99.100] [localport: 22] at 10:00:00 UTC Sun May 16 2026', { src_ip: '192.168.99.100' }),
  ev(NOW - 3*DAY + 10*HOUR + MIN, 'generic_text', CISCO_CORE, 'warning', '%SEC_LOGIN-4-LOGIN_FAILED: Login failed [user: cisco] [Source: 192.168.99.100] [localport: 22] at 10:01:00 UTC', { src_ip: '192.168.99.100' }),
  ev(NOW - 3*DAY + 10*HOUR + 2*MIN, 'generic_text', CISCO_CORE, 'error', '%SEC_LOGIN-5-QUIET_MODE_ON: Still timeleft for watching failures is 60 secs, [user: admin/cisco] [Source: 192.168.99.100] [localport: 22] — quiet mode activated after 3 failures', { src_ip: '192.168.99.100' }),
  ev(NOW - 2*DAY + 9*HOUR,   'generic_text', CISCO_CORE, 'info',    '%SYS-5-PRIV_AUTH_PASS: Privilege level 15 granted to user admin from 10.0.0.5 on vty0 — configuration session started'),

  // ── Storm control / broadcast storm ──
  ev(NOW - 2*DAY + HOUR,      'generic_text', CISCO_CORE, 'error',   '%STORM_CONTROL-3-SHUTDOWN: A packet storm was detected on Gi1/0/24 — 85% broadcast traffic threshold exceeded, interface shutdown'),
  ev(NOW - 2*DAY + HOUR + MIN,'generic_text', CISCO_CORE, 'warning', '%STORM_CONTROL-3-FILTERED: A packet storm was detected on Gi1/0/22 — 73% broadcast, traffic rate-limited to 10%'),

  // ── OSPF routing ──
  ev(NOW - 4*DAY + 12*HOUR,  'generic_text', CISCO_RTR,  'warning', '%OSPF-5-ADJCHG: Process 1, Nbr 10.0.0.2 on GigabitEthernet0/0/0 from FULL to DOWN, Neighbor Down: Dead timer expired'),
  ev(NOW - 4*DAY + 12*HOUR + 2*MIN, 'generic_text', CISCO_RTR, 'warning', '%OSPF-5-ADJCHG: Process 1, Nbr 10.0.0.2 on GigabitEthernet0/0/0 from LOADING to FULL, Loading Done — adjacency restored'),
  ev(NOW - 4*DAY + 12*HOUR + MIN, 'generic_text', CISCO_RTR, 'warning', '%ROUTING-4-ROUTINGERR: Routes to 10.10.0.0/24 flapping — OSPF metric instability on GigabitEthernet0/0/0'),

  // ── High CPU ──
  ev(NOW - 1*DAY + 6*HOUR,   'generic_text', CISCO_CORE, 'warning', '%SYS-4-CPUHOG: 4286 ms CPU hog at level 5: Process=IP Input, PC=0x404819C0, CPU utilization 92% for 5 seconds'),
  ev(NOW - 1*DAY + 6*HOUR + MIN, 'generic_text', CISCO_CORE, 'warning', '%SYS-3-CPUHOG: CPU utilization 87% for 60 seconds — top processes: CEF switching, BGP Scanner, OSPF Router'),

  // ── Hardware / environmental ──
  ev(NOW - 6*DAY + 10*HOUR,  'generic_text', CISCO_CORE, 'info',    '%SYS-6-LOGGINGHOST_STARTSTOP: Logging to host 10.0.0.50 started — syslog UDP/514 configured'),
  ev(NOW - 1*DAY + 2*HOUR,   'generic_text', CISCO_CORE, 'error',   '%PLATFORM_ENV-3-FRU_PS_ACCESS: Switch 1 R0 power supply bay 2 removed — now running on single power supply, redundancy lost'),
  ev(NOW - 1*DAY + 2*HOUR + 30*MIN, 'generic_text', CISCO_CORE, 'error', '%PLATFORM_ENV-3-FRU_PS_ACCESS: Switch 1 R0 power supply 2 inserted — dual PSU redundancy restored'),
  ev(NOW - 8*HOUR,            'generic_text', CISCO_CORE, 'warning', '%TRANSCEIVER-3-THRESHOLD_VIOLATION: Te1/1/1 — Tx Power -3.5 dBm below minimum threshold -3.0 dBm: Optical signal degraded on uplink to core'),
]

// ---------------------------------------------------------------------------
// ═══════════════════════════════════════════════════════════════════════════
//  EXTREME NETWORKS (ExtremeXOS)
//  Format: "MM/DD/YYYY HH:MM:SS.ms <Process.Severity>: message"
//  Hosts: extreme-edge-sw01 (X460-G2), extreme-edge-sw02
// ═══════════════════════════════════════════════════════════════════════════
const EXT_SW01 = 'extreme-edge-sw01'
const EXT_SW02 = 'extreme-edge-sw02'

const extremeEvents: Row[] = [
  // ── Boot / system ──
  ev(NOW - 7*DAY + MIN,     'generic_text', EXT_SW01, 'info',    '<kern.info>: System successfully booted ExtremeXOS version 31.7.1.4 — Switch: X460-G2-48p, Serial: 1622G-41234'),
  ev(NOW - 7*DAY + 2*MIN,   'generic_text', EXT_SW01, 'info',    '<mgmtd.info>: SSH server started on port 22 — management access ready'),
  ev(NOW - 7*DAY + 3*MIN,   'generic_text', EXT_SW01, 'info',    '<snmpMaster.info>: SNMP agent initialized — community "lab-ro" v2c read-only configured'),

  // ── Port up/down ──
  ev(NOW - 6*DAY + 5*HOUR,  'generic_text', EXT_SW01, 'info',    '<hal.info>: Port 1:23 link up at speed 1Gbps full duplex — device: Milestone Recording Server (MAC 00:50:56:a1:b2:c3)'),
  ev(NOW - 5*DAY + 3*HOUR,  'generic_text', EXT_SW01, 'warning', '<hal.warning>: Port 1:8 link down — carrier lost, device was: IP Camera 08 (MAC 00:23:8b:f0:ab:cd)'),
  ev(NOW - 5*DAY + 3*HOUR + 5*MIN, 'generic_text', EXT_SW01, 'warning', '<hal.warning>: Port 1:8 link down — still down after 5 minutes, no response to LLDP'),
  ev(NOW - 5*DAY + 3*HOUR + 20*MIN,'generic_text', EXT_SW01, 'error',   '<hal.error>: Port 1:8 has been down for 20 minutes — check cable and power for IP Camera 08', { port: '1:8' }),
  ev(NOW - 5*DAY + 4*HOUR,  'generic_text', EXT_SW01, 'info',    '<hal.info>: Port 1:8 link up at speed 100Mbps full duplex — IP Camera 08 reconnected'),

  // ── STP ──
  ev(NOW - 5*DAY + 3*HOUR + MIN, 'generic_text', EXT_SW01, 'warning', '<stp.warning>: MSTP port 1:25 state changed to Discarding — topology change received from downstream (VLAN 30: Cameras)'),
  ev(NOW - 5*DAY + 3*HOUR + 2*MIN,'generic_text', EXT_SW01, 'warning', '<stp.warning>: MSTP port 1:25 state changed to Learning (VLAN 30)'),
  ev(NOW - 5*DAY + 3*HOUR + 3*MIN,'generic_text', EXT_SW01, 'info',   '<stp.info>: MSTP port 1:25 state changed to Forwarding (VLAN 30) — convergence complete'),

  // ── Authentication / security ──
  ev(NOW - 4*DAY + 7*HOUR,  'generic_text', EXT_SW01, 'warning', '<netLogin.warning>: Authentication failed for MAC 00:0c:29:cc:dd:ee on port 1:12 — 802.1X RADIUS rejected (EAP-PEAP: wrong credentials)'),
  ev(NOW - 4*DAY + 7*HOUR + MIN, 'generic_text', EXT_SW01, 'warning', '<netLogin.warning>: Authentication failed for MAC 00:0c:29:cc:dd:ee on port 1:12 — 2nd failure, port in guest VLAN 999'),
  ev(NOW - 3*DAY + 9*HOUR,  'generic_text', EXT_SW01, 'warning', '<snmpMaster.warning>: SNMP authentication failure from 192.168.1.200 — wrong community string used (attempted: "public")'),
  ev(NOW - 3*DAY + 9*HOUR + MIN, 'generic_text', EXT_SW01, 'warning', '<snmpMaster.warning>: SNMP authentication failure from 192.168.1.200 — 3 failures in 60 seconds, possible SNMP enumeration'),
  ev(NOW - 2*DAY + 11*HOUR, 'generic_text', EXT_SW01, 'warning', '<mgmtd.warning>: Login failed for user "admin" from 10.0.99.55 via SSH — invalid password'),
  ev(NOW - 2*DAY + 11*HOUR + MIN,'generic_text', EXT_SW01, 'warning', '<mgmtd.warning>: Login failed for user "admin" from 10.0.99.55 via SSH — invalid password (2nd attempt)'),
  ev(NOW - 2*DAY + 11*HOUR + 2*MIN,'generic_text', EXT_SW01, 'error',  '<mgmtd.error>: Account "admin" temporarily locked after 3 consecutive login failures from 10.0.99.55', { src_ip: '10.0.99.55' }),

  // ── PoE events (cameras typically use PoE) ──
  ev(NOW - 4*DAY + HOUR,    'generic_text', EXT_SW01, 'warning', '<hal.warning>: PoE budget exceeded — total consumption 380W on 48-port PoE+ switch (capacity: 370W); port 1:45 power-limited to 15.4W'),
  ev(NOW - 4*DAY + HOUR + MIN, 'generic_text', EXT_SW01, 'error', '<hal.error>: PoE critical: unable to power port 1:46 — insufficient PoE budget, device unpowered: IP Camera 46 (PTZ)'),
  ev(NOW - 4*DAY + HOUR + 10*MIN,'generic_text', EXT_SW01, 'info', '<hal.info>: PoE port 1:44 detected a class 0 device — negotiated to 15.4W (802.3af)'),

  // ── Hardware ──
  ev(NOW - 6*DAY + 8*HOUR,  'generic_text', EXT_SW01, 'error',   '<hal.error>: Fan tray 1: fan 2 failed (0 RPM detected) — redundant fan still operating, but thermal risk elevated'),
  ev(NOW - 6*DAY + 8*HOUR + 10*MIN,'generic_text', EXT_SW01, 'warning', '<hal.warning>: Chassis temperature 61°C — above warning threshold (55°C), check airflow and fan status'),
  ev(NOW - 6*DAY + 9*HOUR,  'generic_text', EXT_SW01, 'info',    '<hal.info>: Fan tray 1 replaced — all fans now operating normally, chassis temperature dropping'),

  // ── SW02 events ──
  ev(NOW - 3*DAY + 2*HOUR,  'generic_text', EXT_SW02, 'warning', '<hal.warning>: Port 2:5 excessive input errors — 4821 CRC errors in last 5 minutes on link to extreme-edge-sw01 (likely bad cable)'),
  ev(NOW - 3*DAY + 2*HOUR + 5*MIN,'generic_text', EXT_SW02, 'warning', '<hal.warning>: Port 2:5 input errors rate: 24/sec — consider replacing SFP or cable between sw01 and sw02'),
  ev(NOW - 3*DAY + 3*HOUR,  'generic_text', EXT_SW02, 'info',    '<hal.info>: Port 2:5 CRC errors cleared after SFP module replaced — link stable at 10Gbps'),
  ev(NOW - 1*DAY + 5*HOUR,  'generic_text', EXT_SW02, 'info',    '<mgmtd.info>: Configuration saved to NVRAM by user "netadmin" from 10.0.0.5 — firmware upgrade preparation'),
  ev(NOW - 1*DAY + 5*HOUR + 30*MIN,'generic_text', EXT_SW02, 'info', '<kern.info>: System successfully booted ExtremeXOS version 31.7.2.1 — firmware upgrade from 31.7.1.4 completed'),
]

// ---------------------------------------------------------------------------
// ═══════════════════════════════════════════════════════════════════════════
//  MILESTONE XPROTECT VMS
//  Format: event log from Milestone recording/management servers
//  Hosts: milestone-mgmt (Management Server), milestone-rec01 (Recording Server)
// ═══════════════════════════════════════════════════════════════════════════
const MS_MGMT = 'milestone-mgmt01'
const MS_REC  = 'milestone-rec01'

const milestoneEvents: Row[] = [
  // ── Service startup ──
  ev(NOW - 7*DAY + MIN,       'generic_text', MS_MGMT, 'info',    'Milestone Management Server: Service started — XProtect Corporate 2023 R3 (version 23.3a)'),
  ev(NOW - 7*DAY + 2*MIN,     'generic_text', MS_MGMT, 'info',    'Milestone Management Server: Loaded configuration — 48 cameras, 2 recording servers, 1 failover server'),
  ev(NOW - 7*DAY + 3*MIN,     'generic_text', MS_REC,  'info',    'Milestone Recording Server: Service started — rec01, storage D:\\Recordings (12 TB, 4.1 TB free)'),
  ev(NOW - 7*DAY + 4*MIN,     'generic_text', MS_REC,  'info',    'Milestone Recording Server: All 24 assigned cameras reporting online — recording started'),

  // ── Camera offline / connection failures ──
  ev(NOW - 6*DAY + 6*HOUR,    'generic_text', MS_REC, 'warning',  'Milestone Recording Server: Camera "Parking Lot North (Cam-08)" not responding — retrying connection (attempt 1/5)'),
  ev(NOW - 6*DAY + 6*HOUR + 30,'generic_text', MS_REC, 'warning', 'Milestone Recording Server: Camera "Parking Lot North (Cam-08)" not responding — retrying connection (attempt 2/5)'),
  ev(NOW - 6*DAY + 6*HOUR + MIN,'generic_text', MS_REC, 'error',  'Milestone Recording Server: Camera "Parking Lot North (Cam-08)" connection failed — TCP timeout to 10.0.40.108:80 after 5 attempts. Recording gap started.', { camera: 'Cam-08', ip: '10.0.40.108' }),
  ev(NOW - 6*DAY + 6*HOUR + 3*MIN,'generic_text', MS_REC, 'error','Milestone Recording Server: Camera "Parking Lot North (Cam-08)" offline — no data for 3 minutes. Motion detection disabled.'),
  ev(NOW - 6*DAY + 6*HOUR + 20*MIN,'generic_text', MS_REC, 'info', 'Milestone Recording Server: Camera "Parking Lot North (Cam-08)" reconnected — recording gap was 20 minutes. Gap stored as lost data event.'),

  // ── Multiple cameras offline (switch event correlation) ──
  ev(NOW - 5*DAY + 3*HOUR,    'generic_text', MS_REC, 'error',    'Milestone Recording Server: Camera "IP Camera 08 (Cam-18)" connection lost — correlates with network switch event on extreme-edge-sw01:1:8'),
  ev(NOW - 5*DAY + 3*HOUR + MIN,'generic_text', MS_REC, 'error',  'Milestone Recording Server: Camera "Entrance East (Cam-19)" connection lost — same subnet as Cam-18, possible switch failure'),
  ev(NOW - 5*DAY + 3*HOUR + 2*MIN,'generic_text', MS_MGMT, 'warning','Milestone Management Server: 2 cameras offline on recording server rec01 — generating alarm: Multiple Camera Failure'),
  ev(NOW - 5*DAY + 4*HOUR,    'generic_text', MS_REC, 'info',     'Milestone Recording Server: Cameras 18,19 reconnected after network switch port 1:8 restored. Recording resumed.'),

  // ── Storage warnings ──
  ev(NOW - 4*DAY + 4*HOUR,    'generic_text', MS_REC, 'warning',  'Milestone Recording Server: Storage D:\\Recordings at 80% capacity (9.6 TB / 12 TB) — circular overwrite of oldest footage will begin at 90%'),
  ev(NOW - 3*DAY + 4*HOUR,    'generic_text', MS_REC, 'warning',  'Milestone Recording Server: Storage D:\\Recordings at 90% capacity — circular overwrite activated, deleting footage older than 30 days'),
  ev(NOW - 2*DAY + 4*HOUR,    'generic_text', MS_REC, 'error',    'Milestone Recording Server: Storage write performance degraded — average write latency 850ms (threshold: 200ms). Possible disk health issue.', { drive: 'D:\\' }),
  ev(NOW - 2*DAY + 4*HOUR + 5*MIN,'generic_text', MS_REC, 'error','Milestone Recording Server: Camera "Server Room (Cam-03)" recording stopped — write error to D:\\Recordings\\Cam-03. Disk: check SMART status.'),
  ev(NOW - 2*DAY + 5*HOUR,    'generic_text', MS_REC, 'info',     'Milestone Recording Server: Recording resumed on "Server Room (Cam-03)" — failover storage path activated on E:\\RecordingsFallback'),

  // ── License ──
  ev(NOW - 5*DAY + 8*HOUR,    'generic_text', MS_MGMT, 'warning', 'Milestone Management Server: License expiry warning — SLC license valid for 28 more days (expires 2026-06-16). Contact Milestone partner.'),
  ev(NOW - 3*DAY + 8*HOUR,    'generic_text', MS_MGMT, 'warning', 'Milestone Management Server: License expiry warning — 14 days remaining. System will enter grace mode after expiry (reduced camera count).'),
  ev(NOW - 1*DAY + 8*HOUR,    'generic_text', MS_MGMT, 'error',   'Milestone Management Server: License expiry in 7 days — URGENT: renew SLC license to avoid recording interruption on all 48 cameras'),

  // ── Motion / analytics ──
  ev(NOW - 3*DAY + 2*HOUR,    'generic_text', MS_REC, 'warning',  'Milestone Video Analytics: Loitering detected — "Parking Lot North (Cam-08)" area 2 for 8 minutes. Alarm triggered: LOITER-2024'),
  ev(NOW - 2*DAY + 11*HOUR,   'generic_text', MS_REC, 'warning',  'Milestone Video Analytics: Object left behind — "Main Entrance (Cam-01)" unattended object detected for 15 minutes. Alarm: LEFTOBJ-2891'),
  ev(NOW - 1*DAY + 1*HOUR,    'generic_text', MS_REC, 'warning',  'Milestone Video Analytics: Crowd density high — "Lobby (Cam-02)" > 80 persons detected in zone, alert sent to security desk'),
  ev(NOW - 6*HOUR,            'generic_text', MS_REC, 'error',    'Milestone Video Analytics: Smart Search failed — Analytics engine not responding on rec01, video intelligence features offline'),
  ev(NOW - 5*HOUR,            'generic_text', MS_REC, 'info',     'Milestone Video Analytics: Analytics engine restarted — Smart Search and motion analytics restored on all cameras'),

  // ── User access ──
  ev(NOW - 4*DAY + 9*HOUR,    'generic_text', MS_MGMT, 'info',    'Milestone Management Server: User "security.operator" logged in from 10.0.2.45 — XProtect Smart Client v23.3'),
  ev(NOW - 4*DAY + 9*HOUR + 5*MIN,'generic_text', MS_MGMT, 'info', 'Milestone Management Server: User "security.operator" exported video — Cam-08, 2026-05-15 06:00–06:20, format: MKV, size 847 MB'),
  ev(NOW - 2*DAY + 9*HOUR,    'generic_text', MS_MGMT, 'warning', 'Milestone Management Server: Failed login for user "admin" from 10.0.99.50 — invalid password (attempt 1)', { src_ip: '10.0.99.50' }),
  ev(NOW - 2*DAY + 9*HOUR + MIN,'generic_text', MS_MGMT, 'warning','Milestone Management Server: Failed login for user "admin" from 10.0.99.50 — invalid password (attempt 2)', { src_ip: '10.0.99.50' }),
  ev(NOW - 2*DAY + 9*HOUR + 2*MIN,'generic_text', MS_MGMT, 'error','Milestone Management Server: Account "admin" locked after 3 failed logins from 10.0.99.50 — security policy enforced', { src_ip: '10.0.99.50' }),

  // ── Recording server failover ──
  ev(NOW - 1*DAY + 8*HOUR,    'generic_text', MS_MGMT, 'error',   'Milestone Management Server: Recording Server rec01 connection lost — failover server rec01-failover taking over 24 cameras'),
  ev(NOW - 1*DAY + 8*HOUR + 2*MIN,'generic_text', MS_MGMT, 'warning','Milestone Management Server: Failover activated — rec01-failover is now recording cameras 1–24 in reduced quality (2 fps)'),
  ev(NOW - 1*DAY + 8*HOUR + 15*MIN,'generic_text', MS_MGMT, 'info', 'Milestone Management Server: rec01 reconnected — failback to primary recording server initiated, full quality restored'),
  ev(NOW - 1*DAY + 8*HOUR + 20*MIN,'generic_text', MS_MGMT, 'info', 'Milestone Management Server: Failback complete — all 24 cameras recording on rec01, failover server in standby'),
]

// ---------------------------------------------------------------------------
// Sample open alarms (so the Alarms page has data without running the pipeline)
// cluster_id = null because we don't have cluster IDs from this script
// ---------------------------------------------------------------------------
type AlarmRow = {
  created_at: string
  severity: Sev
  status: 'open' | 'cleared'
  notes: string | null
  cleared_by: null
  cleared_at: null
}

const sampleAlarms: AlarmRow[] = [
  { created_at: ago(5*DAY + 2*HOUR + 8*MIN), severity: 'error',    status: 'open',    notes: null, cleared_by: null, cleared_at: null },
  { created_at: ago(3*DAY + 2*HOUR),         severity: 'error',    status: 'open',    notes: null, cleared_by: null, cleared_at: null },
  { created_at: ago(2*DAY + HOUR),            severity: 'error',    status: 'open',    notes: null, cleared_by: null, cleared_at: null },
  { created_at: ago(2*DAY + 4*HOUR),         severity: 'critical', status: 'open',    notes: null, cleared_by: null, cleared_at: null },
  { created_at: ago(1*DAY + 8*HOUR),         severity: 'error',    status: 'open',    notes: null, cleared_by: null, cleared_at: null },
  { created_at: ago(1*DAY + 8*HOUR),         severity: 'warning',  status: 'open',    notes: null, cleared_by: null, cleared_at: null },
  { created_at: ago(6*HOUR),                 severity: 'error',    status: 'open',    notes: null, cleared_by: null, cleared_at: null },
  { created_at: ago(5*DAY + 3*HOUR),         severity: 'warning',  status: 'cleared', notes: 'Switch port replaced, camera back online', cleared_by: null, cleared_at: null },
  { created_at: ago(4*DAY + 6*HOUR),         severity: 'error',    status: 'cleared', notes: 'Resolved by disabling port security and re-adding MAC to allowed list', cleared_by: null, cleared_at: null },
  { created_at: ago(6*DAY + 8*HOUR),         severity: 'error',    status: 'cleared', notes: 'Fan replaced, temperatures normalised', cleared_by: null, cleared_at: null },
]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  preflight()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const all: Row[] = [
    ...windowsEvents,
    ...linuxEvents,
    ...ciscoEvents,
    ...extremeEvents,
    ...milestoneEvents,
  ]

  console.log(`[seed-logs] inserting ${all.length} log events…`)
  console.log(`  Windows Server : ${windowsEvents.length}`)
  console.log(`  Linux Server   : ${linuxEvents.length}`)
  console.log(`  Cisco IOS/XE   : ${ciscoEvents.length}`)
  console.log(`  Extreme XOS    : ${extremeEvents.length}`)
  console.log(`  Milestone VMS  : ${milestoneEvents.length}`)

  // Insert in batches of 100
  const BATCH = 100
  let inserted = 0
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH)
    const { error } = await supabase.from('log_events').insert(batch)
    if (error) {
      console.error(`[seed-logs] INSERT error at offset ${i}:`, error.message)
      process.exit(1)
    }
    inserted += batch.length
    process.stdout.write(`\r[seed-logs] inserted ${inserted}/${all.length}`)
  }
  console.log('\n[seed-logs] log_events done.')

  // Seed alarms
  console.log(`[seed-logs] inserting ${sampleAlarms.length} sample alarms…`)
  const { error: alarmErr } = await supabase.from('alarms').insert(sampleAlarms)
  if (alarmErr) {
    console.warn('[seed-logs] alarms insert failed (non-fatal):', alarmErr.message)
  } else {
    console.log('[seed-logs] alarms done.')
  }

  console.log('\n[seed-logs] ✓ COMPLETE')
  console.log(`  ${all.length} log events inserted`)
  console.log(`  ${sampleAlarms.length} alarms inserted`)
  console.log('\nNext step: run scripts/seed-pipeline.ts to generate clusters and AI summaries.')
}

main().catch((err) => {
  console.error('[seed-logs] FAILED:', err.message ?? err)
  process.exit(1)
})
