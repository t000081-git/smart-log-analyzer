# Deploy reference

End-to-end deploy chain for `smart-log-analyzer`: clone to live, verified `/api/health`. Reference checklist, not a tutorial — assumes familiarity with the listed tooling.

## Prerequisites

- Node 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) ≥ 2.98
- [GitHub CLI](https://cli.github.com/) authenticated (if pushing to a new repo)
- Vercel account

## 1. Clone + install

```bash
git clone https://github.com/<org>/smart-log-analyzer.git
cd smart-log-analyzer
npm install
cp .env.example .env.local
```

## 2. Provision Supabase

Create a project at https://supabase.com/dashboard in a region matching your users' latency target. From the new project:

- **Settings → API**: copy `URL`, `anon` key, `service_role` key → `.env.local`. Use the **Legacy JWT** keys (long strings starting `eyJ...`), not the newer `sb_publishable_*` / `sb_secret_*` format — the `@supabase/ssr` client in this project expects JWTs.
- **Settings → Database → Connection string**: copy pooler URL (port 6543) → `DATABASE_URL`; copy direct URL (port 5432) → `DIRECT_URL`.

## 3. Apply schema

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Expect: `Finished supabase db push` plus one NOTICE (`extension "uuid-ossp" already exists, skipping`). Verify with `supabase migration list` — Local + Remote columns match.

## 4. Run + smoke-test locally

```bash
npm run dev
# http://localhost:3000

curl http://localhost:3000/api/health
# {"ok": true, "supabase": {"reachable": true, ...}, "commit": {"sha": "local-dev", ...}, ...}
```

Optional end-to-end auth probe (creates + deletes a test user):

```bash
node --env-file=.env.local scripts/test-auth-probe.mjs
```

## 5. Push to GitHub

```bash
gh repo create smart-log-analyzer --public --source=. --remote=origin
git push -u origin main
```

## 6. Deploy to Vercel (dashboard import)

1. https://vercel.com → **Add New Project** → Import from GitHub → select the repo.
2. Framework: Next.js (auto-detected). Leave defaults.
3. Region: **already pinned via `vercel.json`** (`bom1` Mumbai). Verify in **Settings → Functions** post-deploy.
4. **Environment Variables**: paste these from `.env.local`. Mark `Sensitive?` rows as Sensitive in Vercel — that encrypts the value at rest and makes it write-only post-save (can't read back from dashboard or CLI).

   | Variable | Sensitive? | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` |  | public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |  | public |
   | `SUPABASE_SERVICE_ROLE_KEY` | ✓ | server-only |
   | `DATABASE_URL` | ✓ | server-only |
   | `DIRECT_URL` | ✓ | server-only |
   | `AI_BACKEND` |  | `openrouter` |
   | `OPENROUTER_API_KEY` | ✓ | defer until AI pipeline work; leave unset until needed |
   | `OPENROUTER_MODEL` |  | `openai/gpt-4o-mini` |
   | `OPENROUTER_EMBEDDING_MODEL` |  | `openai/text-embedding-3-small` |
   | `NEXT_PUBLIC_APP_URL` |  | set to deployed URL after first successful deploy |

   Skip `OLLAMA_*` (local-only).

5. **Deploy**. Vercel auto-deploys subsequent pushes to `main`.

## 7. Verify deployed `/api/health`

```bash
curl https://<your-deployment>.vercel.app/api/health
```

Expect:
- `commit.sha` matches `git rev-parse origin/main`
- `supabase.reachable: true`
- `supabase.latency_ms`: ~15–25ms warm (after 1st request), ~300–500ms cold-start
- `env: "production"`, `region: "bom1"`

Troubleshooting:
- `commit.sha` ≠ `origin/main` → stale build; trigger fresh Vercel deploy.
- `supabase.reachable: false` → env vars missing or wrong in Vercel.
- `supabase.latency_ms > 200ms` consistently → region mismatch; verify `vercel.json` region matches Supabase project region.

## Region alignment note

`vercel.json` pins serverless functions to `bom1` (Mumbai) to match the Supabase project's Mumbai region. ~10x warm-path latency improvement vs default US-East regions for this Supabase deployment. **If you change Supabase region, change `vercel.json` and redeploy** — keeping function region aligned with data region is the durable rule.

---

*Verified end-to-end 2026-05-17 against Vercel + Supabase free tier.*
