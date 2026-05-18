# smart-log-analyzer — Agent Operating Rules

Hard rules for any AI agent working in this repo. Read at session start. Override default behaviour.

---

## What this project is

**smart-log-analyzer** is a log analysis tool for solo sysadmins and small IT teams (1–3 people) managing 5–50 Linux/Windows servers — homelabbers without budget for Splunk or Datadog who need more than `tail -f`.

**Core problem:** Sysadmins managing servers face thousands of daily log entries across syslog, dmesg, UPS daemons, and RAID controllers. Recurring hardware warnings — failing drives, UPS brownouts, thermal events — get buried in noise and missed until failure. Manual grep/awk doesn't catch patterns over time, and existing SIEM tools cost thousands or require heavy setup.

**Core AI capability (two layers):**
1. **Embedding-based clustering** — sentence-transformer embeddings group semantically-identical errors that have different wording (e.g. "disk read error sda" and "I/O error sda1 sector 4096" cluster together).
2. **LLM-generated plain-English summaries** — reads cluster metadata (frequency, timing, severity) and writes summaries like "Your UPS reported 3 brownouts this week, all 2–4am Tuesday — likely grid issue."

**Multi-source log ingestion:** Windows Server logs, Linux/syslog, PRTG output, DXT/Netboss (Tetra), Ericsson 5G/LTE core logs. Raw logs dropped to a central location (local laptop directory, NAS, or cloud bucket). App ingests from configured source(s).

**Swappable AI backend:** OpenRouter (cloud) OR Ollama (local). User configures which "brain" handles processing. Network flexibility: local laptop, LAN, or internet access.

**Role-based access:** viewers (read-only, see finished reports), admins (read + write + role-permission filtering), single root user (configures admin permissions). Permission scopes include: copy more logs to storage, delete duplicate logs, filter log subsets by date-range or by field-value before sending to AI, export logs, clear alarms.

**Visualization:** timeline-based graph (nodes connected by date-time) as default; events-based graph (nodes connected by correlated events) as advanced view.

**Primary surface:** desktop. Mobile-responsive but not mobile-first.

---

## Tech stack

- **Frontend:** Next.js 16 (App Router) + React 19
- **Database & Auth:** Supabase (Postgres + RLS + Realtime + Storage) — BaaS; files upload directly browser → Supabase Storage
- **AI:** OpenRouter (primary, cloud) with swappable Ollama-local backend; single `AI_BACKEND` env var controls which is active
- **Monitoring:** Sentry + Google Analytics (deferred until staging deploy stable)
- **Deploy:** Vercel (staging branch → staging URL; main branch → production)

---

## Team

- **user-charles** — Foundation / scaffolding. Sole merge-to-main gatekeeper (production protection).
- **user-zahid** — Supabase / database lead.
- **user-mohamad** — TBD; introduce yourself and this line gets filled in.
- **user-mufaddal** — TBD; introduce yourself and this line gets filled in.

**Branch flow:**
- Each teammate works on feature branches off `staging`
- All merges target the `staging` branch first
- CI on staging must pass (no conflicts, no broken builds) before main merge
- Only user-charles merges `staging` → `main`
- Vercel auto-deploys `staging` branch to a staging URL for team review; `main` deploys to production

**Attribution in commit messages and code comments:** use your team handle (`user-zahid`, `user-mohamad`, `user-mufaddal`, `user-charles`). Never use email prefixes.

---

## Infrastructure rules (free-tier stack — all teammates must respect)

**Repository:**
- The repo is **public**. Never commit secrets, credentials, or `.env.local`. Gitignore is already configured — verify before every commit.
- **Never commit raw log files** to the repo, even as test fixtures. Sample fixtures for parser tests must be under 100 lines / 50 KB. Large test datasets go in Supabase Storage, not git.

**AI pipeline placement:**
- The AI pipeline (embeddings, clustering, LLM summarization) runs on **Supabase Edge Functions — NOT Vercel API routes**. Vercel Hobby enforces a 10-second serverless function timeout; LLM calls routinely exceed this and will be killed silently. Vercel hosts auth, UI, and fast CRUD reads only.

**Vercel access:**
- user-charles owns the Vercel project. Teammates do not have Vercel dashboard access — Hobby free tier does not support team membership. Teammates push to GitHub; Vercel auto-deploys from there. Environment variables are managed by user-charles in the Vercel dashboard.

**Vercel region alignment:**
- Supabase region: Mumbai (`ap-south-1`) — **strongly recommended**. The team's Vercel function region is pinned to `bom1` (Mumbai) in `vercel.json` to match. Same-region Vercel ↔ Supabase typically yields ~15-20ms warm latency vs. 500-1000ms cross-region — a meaningful difference for any auth-gated request. The team Supabase project lives in user-zahid's Supabase account; region selection is ultimately his call as the account owner. If zahid picks a different region, update `vercel.json` post-Supabase-setup to match.

**Supabase Storage:**
- Maximum file size per upload: **50 MB** (Supabase free tier hard limit). Validate this in the upload UI and guide users to compress large logs (`.gz`) before uploading.
- **Delete raw log files from Storage after successful ingestion.** The source of truth is `log_events`, not the raw file. Keeping raw files fills the 1 GB Storage quota.

**Database connections:**
- Always use the **pooler URL (port 6543, transaction mode)** for any raw Postgres connections (seed scripts, migrations run from code). Never use the direct connection URL (port 5432) from serverless or Edge Function contexts. The Supabase JS SDK used throughout the app handles pooling internally — this rule applies only to code that opens raw `pg` / `postgres.js` connections.

**Supabase CLI workdirs:**
- `supabase/.temp/` and `supabase/.branches/` are created by `supabase` CLI commands and are already gitignored. Do not commit them. If they appear in `git status`, verify `.gitignore` is applied before staging.

---

## Forbidden without explicit approval

- **Pushing to `main`** — only user-charles does this. Agents must not `git push origin main` or create PRs directly to main.
- **Modifying CI configuration** — changes to any CI/CD pipeline files (GitHub Actions workflows, Vercel config) require user-charles review.
- **Modifying Supabase RLS policies for the role table** — the viewer/admin/root permission model is security-critical; any RLS policy changes require user-charles review before applying.
