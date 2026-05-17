# smart-log-analyzer

AI-assisted log analysis for solo sysadmins and small IT teams managing 5–50 Linux/Windows servers. Ingests heterogeneous log sources — Linux syslog, Windows Event Log, PRTG, custom text — clusters semantically-related events via sentence-transformer embeddings, and writes plain-English LLM summaries that surface what recurring patterns mean. "Splunk for homelabbers." Role-based access (viewer / admin / root); append-only `log_events` with soft-delete; swappable AI backend via `AI_BACKEND` env var (OpenRouter cloud or Ollama local).

This is the team capstone for a four-student bootcamp cohort. Built entirely on free-tier services (Supabase + Vercel) without sacrificing the architectural decisions that matter: append-only event log, role-enforced row-level security, embedding-based clustering with full model attribution. The AI pipeline (embeddings, clustering, LLM summarization) runs on Supabase Edge Functions to avoid the Vercel Hobby 10-second serverless timeout. See [DEPLOY.md](DEPLOY.md) for the end-to-end deploy checklist and [AGENTS.md](AGENTS.md) for team operating rules and infrastructure constraints.

## Tech stack

- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- **Database & Auth:** Supabase (Postgres + RLS + Realtime + Storage)
- **AI pipeline:** Supabase Edge Functions (embeddings + clustering + LLM summaries)
- **AI backend:** OpenRouter (cloud, primary) or Ollama (local); `AI_BACKEND` env var switches between
- **Deploy:** Vercel — `staging` branch → staging URL; `main` branch → production

## Getting started

```bash
git clone https://github.com/<org>/smart-log-analyzer.git
cd smart-log-analyzer
npm install
cp .env.example .env.local
# Fill in Supabase + AI backend values in .env.local
npm run dev
```

Apply the schema to your Supabase project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

See [DEPLOY.md](DEPLOY.md) for the full deploy chain including Vercel environment variable setup and `/api/health` verification.
