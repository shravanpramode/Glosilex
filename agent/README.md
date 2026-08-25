# Glosilex — Regulatory Corpus Sentinel

An n8n agent that keeps the Glosilex retrieval corpus current with published US
export-control regulation, and tells you when a change invalidates an answer the
product already gave.

**Why this exists.** A RAG compliance product is only as trustworthy as the
freshness of its corpus. Glosilex's corpus was ingested from PDFs dated
**2026-03-05**. 15 CFR Part 774 — the Commerce Control List, the single most
load-bearing document in the corpus — was amended on **2026-08-18**. Nobody
knew, because nothing was watching. That is the failure mode this agent closes.

---

## What it does on each run

```
  ┌─ Every morning 06:00 (or "Run Now" for a demo)
  │
  ├─ 1. Load the watchlist from corpus_registry
  │
  ├─ 2. Ask eCFR: what is the latest amendment date for each watched Part?
  │       GET /api/versioner/v1/versions/title-15.json?part=774
  │
  ├─ 3. DECIDE  ← the judgment step
  │       no_change          nothing newer than we hold
  │       editorial_skipped  newer, but eCFR marks nothing substantive
  │       ingest             substantive change → do the work
  │
  ├─ 4. Fetch the current official text (eCFR XML)
  ├─ 5. Chunk it — byte-identical logic to ingest.js
  ├─ 6. Embed in batches of 100  (gemini-embedding-001 @ 768 dims)
  ├─ 7. INSERT the new chunks alongside the old ones
  │
  ├─ 8. VERIFY  ← the safety gate
  │       count what we wrote; is it inside the expected band?
  │       ├─ no  → halt, alert, leave the old corpus serving traffic
  │       └─ yes → retire the superseded chunks (atomic-ish swap)
  │
  ├─ 9. AI IMPACT ANALYST (agent + tool)
  │       reads the changed clause ids
  │       calls past_classifications → which answers we already gave cited them
  │       grades severity: editorial | material | critical
  │
  └─ 10. Write the audit row, update the registry
```

### The two things that make it an agent rather than a cron job

1. **It decides whether to act.** eCFR flags each section version as
   `substantive: true|false`. A cross-reference renumbering is an amendment but
   not a change in what is controlled. Re-embedding 4,394 chunks because BIS
   fixed a comma costs money and churns the vector store underneath answers
   that were already right. The agent skips those and records why.

2. **It reasons about blast radius.** After ingesting, the agent looks up
   the classifications Glosilex has already issued that cited a clause which
   just changed, and grades how likely the change is to flip a determination.
   Corpus maintenance becomes a user-facing feature: *"the rule you relied on
   in March changed last week."*

---

## Setup

### Prerequisites

- An n8n instance — [n8n Cloud](https://n8n.io) free trial or `npx n8n` locally.
  Local is fine and is what the demo was built on.
- Your Supabase **service_role** key (Dashboard → Project Settings → API).
  This key bypasses RLS. It belongs in n8n's credential store and nowhere else —
  never in the browser, never in Vercel, never committed.
- Your Gemini API key.

---

### Step 1 — Create the tables

Supabase Dashboard → SQL Editor → paste and run **`agent/schema.sql`**.

Verify:

```sql
SELECT document_name, cfr_part, last_ingested_amendment, chunk_count
FROM corpus_registry ORDER BY document_name;
```

You should see 8 rows, each with `last_ingested_amendment = 2026-03-05` and a
real `chunk_count`. That seeded date is deliberate — it is what makes the first
run correctly report the Part 774 amendment as a change you missed.

---

### Step 2 — Start n8n

```bash
npx n8n
```

Opens on `http://localhost:5678`. Create the owner account when prompted (local
account, stays on your machine).

---

### Step 3 — Add two credentials

n8n → **Credentials** → **Add credential**.

**a) Supabase API**
- Search `Supabase API`
- **Host:** `https://YOUR-PROJECT.supabase.co`
- **Service Role Secret:** your `service_role` key
- Save.

**b) Google Gemini (PaLM) API**
- Search `Google Gemini(PaLM) Api`
- **Host:** `https://generativelanguage.googleapis.com`
- **API Key:** your Gemini key
- Save.

> These two credential types are what let the workflow authenticate without a
> single secret appearing in the workflow JSON. That is why every HTTP node
> uses "Predefined Credential Type" rather than pasted headers.

---

### Step 4 — Import the workflow

n8n → **Workflows** → **⋯** → **Import from File** →
`agent/glosilex-corpus-sentinel.json`.

---

### Step 5 — Point it at your project

The workflow ships with a placeholder host. Replace it in one pass:

**Either** open each HTTP Request node and change `YOUR-PROJECT` in the URL,
**or** do it before importing:

```bash
node -e "const f='agent/glosilex-corpus-sentinel.json';const fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/YOUR-PROJECT/g,'kflsdxdhupcfetdenxjb'))"
```

Then attach credentials: open each HTTP Request node once and pick the
**Supabase API** credential from the dropdown (n8n does not auto-bind
credentials on import). The nodes needing it:

`Load Watchlist` · `Insert New Chunks` · `Count What We Wrote` ·
`Retire Superseded Chunks` · `Write Audit Row` · `Update Corpus Registry` ·
`Log Checked, No Action` · `Halt and Alert` · `past_classifications`

`Embed Batch (100 at a time)` takes the **Gemini** credential.
`Gemini 2.5 Flash` takes it too.

---

### Step 6 — First run, on a small document

Do **not** point the first run at Part 774 (4,394 chunks). Prove the pipeline on
something small.

```sql
UPDATE corpus_registry SET is_active = false;
UPDATE corpus_registry SET is_active = true WHERE document_name = 'EAR_CCL_Part736';
```

Then click **Run Now (Demo)** in n8n.

Part 736 produces **91 chunks** and completes in well under a minute. Watch the
data flow node by node — that is exactly the shot you want for the video.

Verify:

```sql
SELECT outcome, previous_amendment, new_amendment,
       chunks_before, chunks_after, severity, change_summary
FROM ingestion_runs ORDER BY run_started_at DESC LIMIT 5;
```

Then re-enable the rest:

```sql
UPDATE corpus_registry SET is_active = true;
```

---

### Step 7 — Turn on the schedule

Activate the workflow with the toggle top-right. `Every Morning 06:00` takes
over; `Run Now (Demo)` stays available for manual runs.

---

## Known limits — state these, don't hide them

- **eCFR only covers US CFR.** SCOMET (India) has no equivalent versioned API.
  DGFT publishes notification PDFs. Watching SCOMET needs a different detector —
  poll the DGFT notifications page, diff the listing, and fall back to a
  human-in-the-loop confirmation before ingesting. `source_type` in
  `corpus_registry` already has room for this; the SCOMET branch is not built.
- **`substantive` is eCFR's judgment, not ours.** It is a good cheap filter, not
  a guarantee. A change eCFR marks non-substantive could still matter. The
  conservative setting is to treat `editorial_skipped` as "review weekly"
  rather than "ignore".
- **The blast-radius match is lexical.** `find_affected_classifications` does an
  `ILIKE` against stored findings. It will over-match on short clause ids and
  miss paraphrases. Storing the retrieved `chunk_id`s alongside each result at
  classification time would make this exact — that is the right next change.
- **No rollback.** The swap is safe (old rows survive until new ones verify) but
  once superseded chunks are deleted there is no undo. Retaining superseded rows
  with a `retired_at` timestamp instead of deleting them would give point-in-time
  corpus reconstruction — which a compliance auditor will eventually ask for.

---

## Cost

Re-embedding the full corpus (~27,000 chunks) at `gemini-embedding-001` is a few
cents. The point of the `substantive` filter is not the embedding bill — it is
avoiding needless churn in a vector store that live answers depend on.
