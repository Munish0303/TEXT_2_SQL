# Olist Text-to-SQL

Ask the [Olist Brazilian e-commerce dataset](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
questions in plain English. A free Groq-hosted Llama model writes the PostgreSQL, and the app runs it
**read-only** against your Supabase database and shows both the SQL and the results.

- **Frontend + API:** Next.js (App Router), deployed on Vercel
- **LLM:** Groq (`llama-3.3-70b-versatile`) — free API key, key stays server-side so visitors need nothing
- **Database:** Supabase Postgres (geolocation table excluded)
- **Self-correcting agent:** if the generated SQL is invalid or errors, the failure is fed back to the model to fix and retry (up to 3 attempts)
- **Evaluation harness:** 25 gold questions with reference SQL, measuring execution accuracy (`npm run eval` → **25/25, 100%**)
- **On-site schema viewer:** a "View database schema" panel so users can phrase their own questions
- **Safety:** only single `SELECT`/`WITH` statements, forbidden-keyword guard, and a read-only transaction with a statement timeout
- **Rate-limit handling:** Groq 429s are retried with backoff

---

## 1. Prerequisites

- Node.js 18+ installed
- A free [Supabase](https://supabase.com) project
- A free [Groq](https://console.groq.com/keys) API key
- The `Olist_Brazilian_Eccomerce/` folder (the CSVs) sitting next to this README

## 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

- **`DATABASE_URL`** — Supabase → *Project Settings → Database → Connection string → "Connection pooling"* (Transaction mode, port `6543`). It looks like:
  `postgresql://postgres.abcd:PASSWORD@aws-0-xx.pooler.supabase.com:6543/postgres`
- **`GROQ_API_KEY`** — from https://console.groq.com/keys

## 3. Install and load the data (one time)

```bash
npm install
npm run load-data
```

This drops/creates the 8 tables and loads ~1.5M rows total. It takes a few minutes.

## 4. Run locally

```bash
npm run dev
```

Open http://localhost:3000 and ask something like *"Top 10 product categories by revenue"*.

---

## 5. Deploy to Vercel

1. Push this repo to GitHub (the `.gitignore` already excludes the CSV folder and `.env.local`):
   ```bash
   git add .
   git commit -m "Olist text-to-SQL app"
   git push
   ```
2. On [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. In the project's **Settings → Environment Variables**, add:
   - `DATABASE_URL`
   - `GROQ_API_KEY`
   - `GROQ_MODEL` = `llama-3.3-70b-versatile` (optional)
4. **Deploy.** The database already has your data (loaded in step 3), so the live site works immediately.

> You only run `npm run load-data` once, locally — it fills your Supabase DB, and both local dev and the Vercel deployment read from that same database.

---

## How it works

```
Question ─▶ /api/query ─▶ answerQuestion()  (self-correcting agent)
                              │
              ┌───────────────┴────────────────┐
              ▼                                 │
   Groq (schema in prompt) ─▶ raw SQL           │ on failure, feed the
              │                                 │ SQL + error back and
              ▼                                 │ retry (max 3 attempts)
   guardSql()  single SELECT, no DDL/DML, auto-LIMIT
              │                                 │
              ▼                                 │
   runReadOnly()  READ ONLY txn + 10s timeout ──┘ (errors trigger a retry)
              │
              ▼
   rows ─▶ table in the UI (+ SQL, + "self-corrected" badge if it retried)
```

- `lib/schema.ts` — schema description for the model + structured `SCHEMA_TABLES` for the viewer
- `lib/groq.ts` — Groq call (generate + repair modes, 429 backoff)
- `lib/sql-guard.ts` — validation / SELECT-only enforcement
- `lib/agent.ts` — the self-correcting generate → validate → run → retry loop
- `lib/db.ts` — Postgres client + read-only executor
- `app/api/query/route.ts` — the endpoint
- `app/page.tsx` — the UI (question box, schema viewer, results)
- `scripts/load_data.mjs` + `scripts/schema.sql` — the data loader
- `scripts/eval.ts` — the evaluation harness

## Evaluation

```bash
npm run eval
```

Runs 25 questions, comparing the agent's SQL result against a hand-written reference query
(*execution accuracy* — the standard text-to-SQL metric). Reports overall accuracy and how
many needed a self-correction retry. Current result: **25/25 (100%)**.

## Notes & limits

- Result sets are capped at 200 rows.
- City names in the data are lower-case Portuguese; the model is told to use `LOWER()`.
- The `geolocation` table was intentionally excluded to keep the database small and fast.
