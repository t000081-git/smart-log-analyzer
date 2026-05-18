# smart-log-analyzer — Project Master Document

*For team onboarding and NotebookLM. Last updated: 2026-05-15.*

---

## Part 1 — What is smart-log-analyzer

**Problem:** Sysadmins managing 5–50 Linux/Windows servers face thousands of daily log entries across syslog, dmesg, UPS daemons, RAID controllers, and network monitoring tools. Recurring hardware warnings — failing drives, UPS brownouts, thermal events — get buried in noise and are missed until failure. Manual `grep`/`awk` doesn't catch patterns over time, and existing SIEM tools cost thousands or require heavy infrastructure.

**Solution:** A log analysis tool for solo sysadmins and small IT teams (1–3 people) — homelabbers without budget for Splunk or Datadog who need more than `tail -f`. Ingests logs from multiple sources, clusters semantically-related events using embeddings, and generates plain-English summaries of what the patterns mean.

**Target users:** Solo sysadmins and small IT teams managing Linux/Windows servers on a homelab or small-business budget.

**Core AI capability (two layers):**
1. **Embedding-based clustering** — sentence-transformer embeddings group semantically-identical errors that have different wording. Example: "disk read error sda" and "I/O error sda1 sector 4096" cluster together because they describe the same underlying event.
2. **LLM-generated plain-English summaries** — reads cluster metadata (frequency, timing, severity distribution) and writes summaries a non-specialist can act on. Example: "Your UPS reported 3 brownouts this week, all between 2–4 AM on Tuesday — likely a grid issue on that circuit."

**Log sources supported (Phase 1):**
- Windows Server event logs
- Linux syslog (RFC 3164 and RFC 5424)
- PRTG network monitoring output
- Generic text logs

**Log sources (deferred to Phase 1.5):**
- DXT/Netboss (Tetra)
- Ericsson LTE core logs
- Ericsson 5G core logs

**AI backend:** OpenRouter (cloud, primary) or Ollama (local). A single `AI_BACKEND` environment variable switches between them — no code changes. Both use the OpenAI SDK interface with different base URLs.

**Role model:**
- **viewer** — read-only; sees finished cluster reports and summaries.
- **admin** — read + write; can filter logs, delete duplicates, copy logs to storage, export logs, clear alarms. Capabilities are individually grantable by root.
- **root** — single superuser; configures admin permission scopes.

**Permission scopes:** `delete_logs`, `copy_logs`, `manage_roles`, `filter_logs`, `export_logs`, `clear_alarms`.

**Visualization:**
- Timeline graph (default) — nodes connected by date-time.
- Events graph (advanced) — nodes connected by correlated events.

**Primary surface:** Desktop. Mobile-responsive but not mobile-first.

---

## Part 2 — How we got here

### 2.1 Session origin

Bootstrapped 2026-05-15 in a single session, with the project's foundational conventions and merge-gating discipline established before any code work began.

### 2.2 PRD cleanup

The original PRD contained template residue from a different product category (booking/marketplace app). Items reviewed and resolved:

| Item | Verdict |
|---|---|
| Location Markers/Pins | Reinstated — some log sources embed real location data (IoT GPS, datacenter labels). Phase 1: list view. Phase 2: Leaflet.js map. |
| Personalized Recommendations | Dropped — booking-app residue, not applicable. |
| AI Chatbot / Log Query Assistant | Deferred to Phase 2. |
| Analytics Dashboard | Scoped strictly to log-pattern analytics (cluster frequency, severity trends). Not a generic business dashboard. |
| DRP / Waitlist | Reinstated as Alarm Waitlist — a queue of triggered log events waiting for clearance (auto-resolved when condition clears, or manually cleared by a user with `clear_alarms` permission). Not a SaaS sign-up waitlist. |
| Content Management deletion model | Three-tier RLS with granular admin permissions. Soft-delete only (append-only invariant on `log_events`). |

### 2.3 Technical approach

Two decisions locked in for the 5-day capstone:

**Scope-demoted safe core.** Ericsson LTE, Ericsson 5G, and DXT/Netboss parsers deferred to Phase 1.5. Multi-GB upload handling deferred. The core AI differentiators — embedding-based clustering and LLM summarization — ship in Phase 1 with the four primary log sources. Rationale: the parsing adapters are mechanical work that can be added later; the AI pipeline is the architectural risk that must be validated first.

**AI pipeline proven before UI exists.** A seed script (`scripts/seed-pipeline.ts`) ships in Task 2. It generates 50 synthetic log events, runs them through the full pipeline (embeddings → clustering → summarization → database write), and validates that every layer works end-to-end. Teammates build frontend features against a pipeline that is demonstrably working — not a stub.

---

## Part 3 — System architecture

```
┌─────────────────────────────── Log Sources ──────────────────────────────────┐
│                                                                               │
│   Windows Server    Linux/syslog    PRTG    Ericsson LTE    Ericsson 5G      │
│                                                                               │
│              DXT/Netboss (Tetra)          Generic text logs                  │
│                                                                               │
└────────────────────────────────────┬──────────────────────────────────────────┘
                                     │ raw log files
                                     ▼
                         ┌───────────────────────┐
                         │   File Upload          │
                         │   Browser →            │
                         │   Supabase Storage     │
                         └──────────┬────────────┘
                                    │ storage event / API call
                                    ▼
                    ┌───────────────────────────────────┐
                    │        Ingestion Pipeline          │
                    │                                    │
                    │  detectParser() → parse()          │
                    │  → NormalizedLogEvent[]            │
                    │  → log_events (Supabase, INSERT)   │
                    └──────────────┬────────────────────┘
                                   │ normalized events
                                   ▼
                    ┌───────────────────────────────────┐
                    │           AI Pipeline              │
                    │                                    │
                    │  generateEmbeddings()              │
                    │  → cosine similarity clustering    │
                    │  → log_clusters + members          │
                    │  generateText() → summaries        │
                    │  → cluster_summaries               │
                    └──────────────┬────────────────────┘
                                   │
                  ┌────────────────┼────────────────┐
                  ▼                ▼                ▼
         ┌──────────────┐  ┌─────────────┐  ┌───────────────┐
         │  OpenRouter  │  │   Ollama    │  │   Supabase    │
         │  (cloud)     │  │   (local)   │  │   Postgres    │
         │              │  │             │  │   + RLS       │
         └──────────────┘  └─────────────┘  └───────┬───────┘
          (AI_BACKEND=      (AI_BACKEND=             │
           openrouter)       ollama)                 │
                                                     ▼
                                    ┌────────────────────────────┐
                                    │      Next.js 16 App        │
                                    │      (App Router)          │
                                    │                            │
                                    │  /login                    │
                                    │  /dashboard                │
                                    │    ├── log viewer          │
                                    │    ├── cluster view        │
                                    │    ├── timeline graph      │
                                    │    ├── events graph        │
                                    │    └── alarm waitlist      │
                                    │  /admin                    │
                                    │    └── role management     │
                                    └────────────────────────────┘

                    ┌───────────────────────────────────┐
                    │      Meta-log Export Pipeline      │
                    │                                    │
                    │  export_jobs → sanitization        │
                    │  → smart_log_analyzer_export       │
                    │  → higher-tier analyzer instance   │
                    │  (hierarchy_level escalation)      │
                    └───────────────────────────────────┘
```

**Key design invariants:**
- `log_events` is **append-only**. No UPDATE policy exists in RLS — ever. Corrections are new rows with `supersedes_id`. Soft-deletes go to `log_event_deletions`.
- `hierarchy_level`: 0 = raw server log; 1 = first-level analyzer export; 2 = second-level, etc.
- File uploads go directly **browser → Supabase Storage** — not proxied through Next.js/Vercel.
- The `AI_BACKEND` env var is the only switch between OpenRouter and Ollama. Both backends use the OpenAI SDK interface.

---

## Part 4 — Feature list

### Phase 1 (5-day capstone)

| Feature | Notes |
|---|---|
| Auth (sign in / sign out) | Supabase Auth; profiles auto-created on signup |
| Role-based access (viewer / admin / root) | RLS-enforced; `user_roles` + `user_permissions` tables |
| Log file upload | Browser → Supabase Storage direct upload |
| Ingestion pipeline | Parse → normalize → insert into `log_events` |
| Parsers: Windows Event, Linux syslog, PRTG, Generic | Syslog ships as reference; others parallel |
| Embedding-based clustering | Batch embeddings → cosine similarity → `log_clusters` |
| LLM cluster summaries | `generateText()` per cluster → `cluster_summaries` |
| Log viewer | Filterable list; soft-deleted rows hidden by RLS |
| Cluster view | Groups + summaries; hierarchy-aware |
| Timeline graph | Nodes by date-time |
| Alarm Waitlist | Flagged events queue; manual + auto-clear |
| Admin: delete logs | Soft-delete via `log_event_deletions` INSERT |
| Admin: role management | Root grants/revokes; admins see their own permissions |
| Export jobs | `export_jobs` table; sanitization policy JSONB |
| Location list view | Log events with `metadata.location` surfaced in a list |
| AI pipeline seed script | `scripts/seed-pipeline.ts` — Task 2 end-to-end proof |

### Phase 1.5 (post-capstone, parser backlog)

| Feature | Notes |
|---|---|
| Ericsson LTE parser | Core log adapter |
| Ericsson 5G parser | Core log adapter |
| DXT/Netboss (Tetra) parser | Core log adapter |
| Multi-GB file upload | Chunked / streaming ingestion |

### Phase 2 (future)

| Feature | Notes |
|---|---|
| Events graph | Nodes connected by correlated events (advanced view) |
| AI Chatbot / Log Query Assistant | Natural-language queries against log data |
| Location map view | Leaflet.js map for events with lat/lng metadata |
| Adaptive format learning | Unknown log formats inferred by AI; no manual adapter needed |
| Analytics dashboard | Trend charts, severity histograms, source breakdowns |

---

## Part 5 — Data model highlights

### Core tables

| Table | Purpose |
|---|---|
| `profiles` | Extends `auth.users`; display name; auto-created on signup |
| `user_roles` | Maps user → role (viewer/admin/root); `UNIQUE(user_id, role)` |
| `user_permissions` | Granular per-admin capabilities (`permission_key TEXT`) |
| `log_sources` | Configured ingestion endpoints (name, source_type, config JSONB) |
| `log_events` | Core append-only table. `hierarchy_level`, `supersedes_id`, no `updated_at` |
| `log_clusters` | AI-generated semantic groupings; `severity_distribution JSONB` |
| `log_cluster_members` | Many-to-many: cluster ↔ log_event; `similarity_score FLOAT` |
| `cluster_summaries` | LLM-generated plain-English summaries per cluster |
| `log_event_deletions` | Soft-delete record; INSERT only; never UPDATE `log_events` |
| `export_jobs` | Meta-log export queue; `hierarchy_level_target`, `sanitization_policy JSONB` |

### NormalizedLogEvent (TypeScript interface)

Every parser outputs this shape. Used for raw server logs, meta-log exports, and the app's own operational events.

```typescript
interface NormalizedLogEvent {
  timestamp: Date
  source_type: LogSourceType        // 'windows_event' | 'linux_syslog' | 'prtg' | ...
  source_id: string                 // hostname, device ID, or file path
  hierarchy_level: number           // 0 = raw; 1+ = export tier
  severity: LogSeverity             // 'debug' | 'info' | 'warning' | 'error' | 'critical'
  message: string
  raw_message?: string
  metadata: Record<string, unknown> // parser-specific extras; location goes here
  supersedes_id?: string            // correction chain
}
```

### RLS summary

| Table | SELECT | INSERT | UPDATE |
|---|---|---|---|
| `log_events` | authenticated (soft-deleted rows hidden) | service role only | **never** |
| `log_event_deletions` | authenticated | `has_permission(uid, 'delete_logs')` | never |
| `export_jobs` | own rows | `has_permission(uid, 'export_logs')` | never |
| `user_roles` | own row | service role | service role |
| `user_permissions` | own row | service role | service role |

---

## Part 6 — Team and branch model

| Handle | Role |
|---|---|
| **user-charles** | Foundation / scaffolding. Sole merge-to-main gatekeeper. |
| **user-zahid** | Supabase / database lead. |
| **user-mohamad** | TBD — introduce yourself; handle gets recorded here. |
| **user-mufaddal** | TBD — introduce yourself; handle gets recorded here. |

**Branch flow:**
1. Each teammate works on a feature branch off `staging`.
2. All merges target `staging` first. CI must pass (no conflicts, no broken builds).
3. Vercel auto-deploys `staging` → staging URL for team review.
4. Only user-charles merges `staging` → `main`. `main` deploys to production.

**Commit attribution:** Use your team handle in commit messages and code comments (`user-zahid`, `user-mohamad`, `user-mufaddal`, `user-charles`). Never use email prefixes.

---

## Part 7 — Task plan (5-task capstone estimate)

*These are estimates based on a traditional development pace. Actual delivery may be faster with AI-assisted development (e.g. Claude). Tasks are milestones — not calendar days. Finish Task 2? Start Task 3 the same day. The goal is to move as fast as the team can, and use any spare capacity to push into Phase 1.5 or Phase 2.*

| Task | Milestone | Owner |
|---|---|---|
| **Task 1** ✅ (user-charles) | Scaffold shipped. Login page + dashboard shell complete. Migration file ready. ⏳ user-zahid: create Supabase project, apply migration, share keys → sign-in end-to-end. | user-charles ✅, user-zahid ⏳ |
| **Task 2** | AI pipeline seed script (`scripts/seed-pipeline.ts`) passes: 50 synthetic events → embeddings → clusters → summaries → DB. Log upload + ingestion for Windows Event + syslog working. | All |
| **Task 3** | Cluster view + summaries UI. Log viewer with filtering. Timeline graph. | user-mohamad + user-mufaddal (frontend), user-zahid (queries) |
| **Task 4** | Admin features: delete logs, role management, export jobs. Alarm Waitlist UI. PRTG parser. | All |
| **Task 5** | Polish, edge cases, CI passing, staging deploy reviewed. | All |

---

## Part 8 — Task dependency map (series vs parallel)

Tasks on the main spine are **series** — each must finish before the next starts. Work items *within* a task are **parallel** — teammates can split them and run simultaneously. Phase 1.5 parsers are ingestion-only code: they only need Task 1 done and can be picked up early by anyone with free bandwidth during Task 3 or 4.

```
LEGEND:  ✅ Done  ⏳ In progress  ○ Not started
         ══╗ / ══╝  Parallel tracks merging at a point
         ──▶         Series dependency (must finish before next)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TASK 1 — Foundation & Setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [✅ user-charles]  Scaffold, types, AI client,       ══╗
                     ingestion layer, auth middleware,    ║
                     login page, dashboard shell          ║
                                                          ╠══▶ Sign-in end-to-end ✓
  [⏳ user-zahid  ]  Create Supabase project,           ║
                     apply migration, share keys          ║
                                                        ══╝
                                        │
                                        │ (series)
                                        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TASK 2 — AI Pipeline + Parsers
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [○ user-charles]   Seed script: 50 events →          ══╗
                     embeddings → clusters →              ║
                     summaries → DB (end-to-end proof)    ║
                                                          ╠══▶ Pipeline validated ✓
  [○ user-zahid  ]   Windows Event Log parser            ║
                     (implements LogParser interface)     ║
                                                        ══╝
                                        │
                                        │ (series)
                                        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TASK 3 — Core UI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [○ mohamad/mufaddal]  Log viewer (filterable list)    ══╗
  [○ mohamad/mufaddal]  Cluster view + summaries         ║
  [○ mohamad/mufaddal]  Timeline graph                   ╠══▶ Core UI done ✓
  [○ user-zahid      ]  Supabase queries for above       ║
                                                        ══╝
                                        │
                                        │ (series)
                                        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TASK 4 — Admin, Alarms & PRTG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [○ all]  Admin: delete logs, role mgmt, export jobs  ══╗
  [○ all]  Alarm Waitlist UI                             ╠══▶ Feature complete ✓
  [○ all]  PRTG parser (ingestion layer)                ══╝
                                        │
                                        │ (series)
                                        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TASK 5 — Polish, CI & Staging Deploy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [○ all]  GitHub Actions CI, Vercel staging, E2E
           testing, bug fixes, edge cases
                                        │
                                        ▼
                              ╔═════════════════╗
                              ║  PHASE 1 DONE   ║
                              ╚════════╤════════╝
                                       │
         ┌─────────────────────────────┼──────────────────────────┐
         │                             │                          │
━━━━━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━┷━━
  PHASE 1.5 — Parser Backlog   (all three run in parallel)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [○]  Ericsson LTE parser       ══╗
  [○]  Ericsson 5G parser         ╠══▶ All parsers done ✓
  [○]  DXT/Netboss (Tetra) parser ══╝
         │
         │ (series — needs parsers done first)
         ▼
  [○]  Multi-GB file upload (chunked/streaming ingestion)
                                        │
                                        ▼
                              ╔══════════════════╗
                              ║  PHASE 1.5 DONE  ║
                              ╚════════╤═════════╝
                                       │
    ┌──────────┬──────────────┬────────┴────────┬──────────────┐
    │          │              │                 │              │
━━━━┷━━━━━━━━━━┷━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━┷━━
  PHASE 2 — Future Features   (all five run in parallel)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [○]  Events graph (correlated nodes)         ══╗
  [○]  AI Chatbot / Log Query Assistant          ║
  [○]  Location map view (Leaflet.js)            ╠══▶ All features done ✓
  [○]  Adaptive format learning                  ║
  [○]  Analytics dashboard                      ══╝
                                        │
                                        ▼
                              ╔═════════════════╗
                              ║  PHASE 2 DONE   ║
                              ╚═════════════════╝
```

---

## Part 9 — Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-side only (AI pipeline, root actions) |
| `AI_BACKEND` | `openrouter` or `ollama` |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `OPENROUTER_MODEL` | e.g. `openai/gpt-4o-mini` |
| `OPENROUTER_EMBEDDING_MODEL` | e.g. `openai/text-embedding-3-small` |
| `OLLAMA_BASE_URL` | e.g. `http://localhost:11434` |
| `OLLAMA_MODEL` | e.g. `llama3.2` |
| `OLLAMA_EMBEDDING_MODEL` | e.g. `nomic-embed-text` |
| `NEXT_PUBLIC_APP_URL` | e.g. `http://localhost:3000` |
| `DATABASE_POOL_URL` | Supabase pooler URL (port 6543) — only needed for raw Postgres connections |

Copy `.env.example` → `.env.local` and fill in values. Never commit `.env.local`.

---

## Part 10 — Free-tier platform limits & architecture decisions

*Identified before architecture was locked (2026-05-15). The goal: no silent platform failures downstream.*

### Architecture decision — Vercel 10s timeout

**Vercel Hobby enforces a 10-second serverless function timeout.** LLM text generation takes 5–30 seconds. Batch embedding calls take 3–15 seconds. The full ingestion pipeline takes 30–90 seconds. Any of these running as a Next.js API route on Vercel will be killed silently with a 504.

**Decision (locked):** The AI pipeline runs on Supabase Edge Functions, not Vercel. Vercel hosts auth, UI, and fast CRUD reads only.

```
Upload → Supabase Storage
               │ (Storage webhook)
               ▼
   Supabase Edge Function          ← AI pipeline lives here
     parse → embed → cluster → summarise → INSERT
               │
               ▼
   Next.js (Vercel) reads results  ← fast CRUD only
```

### Supabase free tier

| Limit | Value | Impact on this project | Mitigation |
|---|---|---|---|
| Database size | 500 MB | `log_events` grows continuously — the binding constraint | Delete raw files post-ingest; no stored embeddings; retention policy Task 4 |
| Storage | 1 GB total | Raw log files fill it fast if kept | Delete from Storage after successful ingestion |
| File upload | 50 MB per file | Large log files rejected | Validate in upload UI; guide users to `.gz` compression |
| Project pause | 7 days inactivity | Dev project sleeps; 30s wake-up on next request | Weekly ping; team awareness |
| Edge Function CPU | 10s CPU time | Streaming ZIP decompression must be per-file | Noted for Phase 1.5 ZIP feature |
| Projects per org | 2 | Staging + prod = both slots | user-zahid uses 1 project; plan prod split before launch |
| No PITR | Daily snapshots only | Mid-day data loss if infra fails | Append-only schema limits blast radius; upgrade to Pro for real production |

### GitHub free tier

| Limit | Value | Mitigation |
|---|---|---|
| Actions minutes | 2,000/month (private repos) | **Public repo** → unlimited minutes. Capstone has no proprietary logic to hide. |
| File size | 100 MB hard limit | Never commit raw log files; test fixtures < 50 KB |
| Branch protection | Full features on public repos | Another reason to go public |

### Vercel free (Hobby) tier

| Limit | Value | Mitigation |
|---|---|---|
| Function timeout | **10 seconds** | AI pipeline → Supabase Edge Functions (see architecture decision above) |
| Team collaboration | None (solo account) | user-charles owns Vercel; teammates push via GitHub; Vercel auto-deploys |
| Bandwidth | 100 GB/month | Not a concern — uploads go direct to Supabase Storage, not through Vercel |
| Build minutes | 6,000/month | Not a concern — Next.js builds take 1–3 min |
| Preview URLs | Public, no auth layer | Middleware already redirects unauthenticated to `/login` |

### Act-now vs act-later

| Item | Act now (foundation) | Act later |
|---|---|---|
| Public repo | Confirm with team → enable | — |
| No raw log files in git | Rule in AGENTS.md ✅ | — |
| AI pipeline → Edge Functions | Architecture decision locked ✅ | Build in Task 2 |
| user-charles owns Vercel | Rule in AGENTS.md ✅ | — |
| 50 MB upload validation | Rule in AGENTS.md; build in Task 3 UI | Upload UI (Task 3) |
| Delete files post-ingest | Rule in AGENTS.md; build in Task 2 pipeline | Ingestion pipeline (Task 2) |
| DATABASE_POOL_URL in .env.example | Done ✅ | Use if raw Postgres needed |
| Supabase 500 MB DB | DB-size StatCard planned; no stored embeddings rule | Retention policy (Task 4) |
| Supabase project pause | Team awareness | — |

### .evtx (Windows Event Log binary format) — parser scope note

`.evtx` is a proprietary Microsoft binary format. It is **not** plain text and cannot be parsed with a simple text adapter. There is no maintained Deno-compatible `.evtx` parser. The realistic options are:

1. **Require pre-export from Windows** (recommended for Phase 1): users run `Get-WinEvent | ConvertTo-Json` or `wevtutil epl` + XML export before uploading. The app ingests the exported JSON/XML, not the raw `.evtx`.
2. **Node.js `node-evtx` library** (Phase 1.5): exists but poorly maintained; needs vetting before committing to it.

**Decision:** Phase 1 Windows Event Log support means exported JSON/XML, not raw `.evtx` binary. Document this clearly in the upload UI. Raw `.evtx` ingestion moves to Phase 1.5 pending parser vetting.
