-- ============================================================================
-- Glosilex — Corpus Sentinel schema
-- Run in Supabase SQL Editor BEFORE importing the n8n workflow.
-- ============================================================================
--
-- Two tables the agent needs, and one it maintains:
--
--   corpus_registry   - what we watch, and which version we currently hold.
--                       This is the agent's memory. Without it, "has it
--                       changed?" is an unanswerable question.
--   ingestion_runs    - an audit trail of every decision the agent made.
--                       A compliance product cannot have a pipeline that
--                       silently mutates its own evidence base.
--   regulatory_chunks - the existing vector store the agent maintains.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. corpus_registry - the watchlist and the agent's memory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS corpus_registry (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- must match regulatory_chunks.document_name exactly - this is the join key
  document_name             text UNIQUE NOT NULL,
  jurisdiction              text NOT NULL,              -- SCOMET_INDIA | EAR_US

  -- where to look for changes
  source_type               text NOT NULL,              -- ecfr | federal_register | manual
  cfr_title                 text,                       -- 15
  cfr_part                  text,                       -- 774
  source_url                text,

  -- what we currently hold
  last_ingested_amendment   date,                       -- eCFR amendment_date of our copy
  last_ingested_at          timestamptz,
  chunk_count               integer DEFAULT 0,

  -- guardrail: if a re-ingest produces a count outside this band the agent
  -- halts instead of overwriting a good corpus with a bad parse
  expected_chunk_min        integer DEFAULT 1,
  expected_chunk_max        integer DEFAULT 100000,

  is_active                 boolean DEFAULT true,
  created_at                timestamptz DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 2. ingestion_runs - audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_started_at           timestamptz DEFAULT now(),
  document_name            text,
  jurisdiction             text,

  -- no_change | editorial_skipped | ingested | halted_validation | error
  outcome                  text NOT NULL,

  previous_amendment       date,
  new_amendment            date,

  chunks_before            integer,
  chunks_after             integer,

  -- the agent's reasoning, kept verbatim so a human can audit the decision
  change_summary           text,
  impact_assessment        text,
  severity                 text,        -- none | editorial | material | critical

  affected_classifications jsonb,       -- past results citing a changed clause
  error_detail             text
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started
  ON ingestion_runs (run_started_at DESC);


-- ---------------------------------------------------------------------------
-- 3. Seed the watchlist
--
-- expected_chunk_min/max come from the counts actually observed in the live
-- corpus, with a generous band. A re-ingest landing outside the band is a
-- parser regression, not a regulatory change, and must not overwrite data.
-- ---------------------------------------------------------------------------
INSERT INTO corpus_registry
  (document_name, jurisdiction, source_type, cfr_title, cfr_part, source_url,
   expected_chunk_min, expected_chunk_max)
VALUES
  ('EAR_CCL_Part774',        'EAR_US', 'ecfr', '15', '774',
   'https://www.ecfr.gov/current/title-15/part-774',  2000,  9000),
  ('EAR_CCL_Part740',        'EAR_US', 'ecfr', '15', '740',
   'https://www.ecfr.gov/current/title-15/part-740',   400,  2000),
  ('EAR_CCL_Part734',        'EAR_US', 'ecfr', '15', '734',
   'https://www.ecfr.gov/current/title-15/part-734',   150,   800),
  ('EAR_CCL_Part738',        'EAR_US', 'ecfr', '15', '738',
   'https://www.ecfr.gov/current/title-15/part-738',   100,   600),
  ('EAR_CCL_Part732',        'EAR_US', 'ecfr', '15', '732',
   'https://www.ecfr.gov/current/title-15/part-732',    80,   500),
  ('EAR_CCL_Part730',        'EAR_US', 'ecfr', '15', '730',
   'https://www.ecfr.gov/current/title-15/part-730',    50,   400),
  ('EAR_CCL_Part736',        'EAR_US', 'ecfr', '15', '736',
   'https://www.ecfr.gov/current/title-15/part-736',    50,   400),
  ('BIS_Entity_List_Part744','EAR_US', 'ecfr', '15', '744',
   'https://www.ecfr.gov/current/title-15/part-744',  8000, 30000)
ON CONFLICT (document_name) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. RLS - these are agent-only tables
--
-- The agent authenticates with the service_role key, which bypasses RLS.
-- Enabling RLS with no write policy therefore means: the browser can never
-- touch these, the agent always can. That is exactly the boundary we want.
-- ---------------------------------------------------------------------------
ALTER TABLE corpus_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_runs  ENABLE ROW LEVEL SECURITY;

-- Optional: lets the app show a live "corpus freshness" badge.
-- Drop this policy if you would rather keep the watchlist private.
DROP POLICY IF EXISTS "Corpus freshness is public read" ON corpus_registry;
CREATE POLICY "Corpus freshness is public read"
  ON corpus_registry FOR SELECT TO anon, authenticated
  USING (true);


-- ---------------------------------------------------------------------------
-- 5. Blast-radius helper
--
-- Given the clause ids that changed, return past classifications whose stored
-- findings cite any of them. This is what turns corpus maintenance into a
-- user-facing feature: "the rule you relied on in March changed last week."
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_affected_classifications(changed_clauses text[])
RETURNS TABLE (
  id uuid,
  user_id text,
  product_input text,
  overall_risk text,
  created_at timestamptz,
  matched_clause text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT c.id, c.user_id, c.product_input, c.overall_risk, c.created_at, cl AS matched_clause
  FROM classification_results c
  CROSS JOIN unnest(changed_clauses) AS cl
  WHERE c.scomet_finding ILIKE '%' || cl || '%'
     OR c.ear_finding    ILIKE '%' || cl || '%'
  ORDER BY c.created_at DESC
  LIMIT 200;
$fn$;

-- Agent-only: called with the service_role key, never from the browser.
REVOKE EXECUTE ON FUNCTION find_affected_classifications(text[]) FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6. Backfill - record what we currently hold
--
-- The existing corpus was ingested from PDFs dated 2026-03-05. Seeding that
-- date is what makes the very first run correctly report the Part 774
-- amendment of 2026-08-18 as a real, missed change rather than a no-op.
-- ---------------------------------------------------------------------------
UPDATE corpus_registry r
SET chunk_count             = c.n,
    last_ingested_amendment = COALESCE(r.last_ingested_amendment, DATE '2026-03-05'),
    last_ingested_at        = COALESCE(r.last_ingested_at, now())
FROM (
  SELECT document_name, count(*)::int AS n
  FROM regulatory_chunks
  GROUP BY document_name
) c
WHERE c.document_name = r.document_name;


-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- SELECT document_name, cfr_part, last_ingested_amendment, chunk_count,
--        expected_chunk_min, expected_chunk_max
-- FROM corpus_registry
-- ORDER BY document_name;
