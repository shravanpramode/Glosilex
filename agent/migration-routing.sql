-- ============================================================================
-- Glosilex — ingestion routing + a real audit record
--
-- Run in the Supabase SQL Editor. Safe to run more than once.
-- ============================================================================
--
-- WHAT THIS ADDS
--
-- Until now `ingestion_runs` recorded WHAT happened. It did not record WHO did
-- it, WHY that executor was chosen, or WHICH CHECKS PASSED. For a compliance
-- product that is the wrong way round: the checks are the point. An auditor
-- asking "how do you know your corpus is correct?" needs the checks, not the
-- outcome.
--
-- Three new columns:
--
--   route         who executed it, and therefore what its limits were
--   route_reason  why that executor was chosen, in plain English
--   checks        every test performed, with PASS / FAIL / SKIP
--   duration_ms   how long it took, so slow drift is visible
-- ============================================================================


ALTER TABLE ingestion_runs
  ADD COLUMN IF NOT EXISTS route        text,
  ADD COLUMN IF NOT EXISTS route_reason text,
  ADD COLUMN IF NOT EXISTS checks       jsonb,
  ADD COLUMN IF NOT EXISTS duration_ms  integer;

COMMENT ON COLUMN ingestion_runs.route IS
  'n8n_inline | delegated_worker | worker_direct | none';
COMMENT ON COLUMN ingestion_runs.route_reason IS
  'Plain-English justification for the routing decision.';
COMMENT ON COLUMN ingestion_runs.checks IS
  'Array of {name, expected, actual, result, detail}. result is PASS|FAIL|SKIP.';


-- ---------------------------------------------------------------------------
-- The routing threshold, kept in the database so it can be tuned without
-- editing the workflow or redeploying anything.
--
-- 300 is empirical, not theoretical. Observed 2026-08-28/29 on n8n Cloud:
--
--     91 chunks    1 insert     completed end to end
--   2,097 chunks   84 inserts   stalled after 18 inserts (450 rows)
--   2,097 chunks   21 inserts   504 after 0 rows committed
--
-- n8n sustained 18 consecutive inserts before wedging. 300 chunks is 12
-- inserts at 25 rows each — comfortably inside observed-good territory, with
-- room for a bad day.
--
-- Raise it if n8n proves more reliable than this; lower it if a run stalls.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_config (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  description text,
  updated_at  timestamptz DEFAULT now()
);

INSERT INTO agent_config (key, value, description) VALUES
  ('inline_max_chunks', '300',
   'Documents producing this many chunks or fewer are ingested inside n8n. Larger ones are delegated to the worker. Empirical: n8n Cloud stalled at ~450 rows.'),
  ('worker_chunks_per_sec', '9',
   'Measured throughput of agent/backfill.mjs, used to estimate run duration.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;
-- No policy: only the service_role (the agent) can read or write it.


-- ---------------------------------------------------------------------------
-- The delegation queue.
--
-- When n8n decides a document is too big for it, it does not fail — it records
-- a `delegated_worker` run with everything the worker needs, and reports. The
-- worker then picks up anything still outstanding.
--
-- This is the queue, expressed as a view rather than a table so there is only
-- ever one source of truth: a document is outstanding if its most recent run
-- delegated it and the registry has not since caught up.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW pending_delegations AS
SELECT DISTINCT ON (r.document_name)
  r.document_name,
  r.new_amendment      AS target_amendment,
  cr.last_ingested_amendment AS currently_held,
  r.chunks_before,
  r.route_reason,
  r.run_started_at     AS delegated_at
FROM ingestion_runs r
JOIN corpus_registry cr ON cr.document_name = r.document_name
WHERE r.route = 'delegated_worker'
ORDER BY r.document_name, r.run_started_at DESC;


-- ---------------------------------------------------------------------------
-- A readable report, straight out of SQL.
--
-- One row per run, with the checks flattened into a pass/fail tally so you can
-- see at a glance whether anything needs attention.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW ingestion_report AS
SELECT
  r.run_started_at,
  r.document_name,
  r.jurisdiction,
  r.route,
  r.outcome,
  r.severity,
  r.previous_amendment || ' -> ' || COALESCE(r.new_amendment::text, '(none)') AS version_change,
  r.chunks_before,
  r.chunks_after,
  ROUND(r.duration_ms / 1000.0, 1) AS duration_sec,
  (SELECT count(*) FROM jsonb_array_elements(COALESCE(r.checks, '[]'::jsonb)) c
     WHERE c->>'result' = 'PASS') AS checks_passed,
  (SELECT count(*) FROM jsonb_array_elements(COALESCE(r.checks, '[]'::jsonb)) c
     WHERE c->>'result' = 'FAIL') AS checks_failed,
  (SELECT count(*) FROM jsonb_array_elements(COALESCE(r.checks, '[]'::jsonb)) c
     WHERE c->>'result' = 'SKIP') AS checks_skipped,
  r.route_reason,
  r.change_summary,
  r.impact_assessment
FROM ingestion_runs r
ORDER BY r.run_started_at DESC;


-- ---------------------------------------------------------------------------
-- Have a look
-- ---------------------------------------------------------------------------
-- SELECT * FROM ingestion_report LIMIT 20;
-- SELECT * FROM pending_delegations;
-- SELECT key, value, description FROM agent_config;

-- Every individual check from the most recent run:
-- SELECT r.document_name,
--        c->>'name'     AS check_name,
--        c->>'expected' AS expected,
--        c->>'actual'   AS actual,
--        c->>'result'   AS result,
--        c->>'detail'   AS detail
-- FROM ingestion_runs r,
--      LATERAL jsonb_array_elements(COALESCE(r.checks,'[]'::jsonb)) c
-- WHERE r.run_started_at = (SELECT max(run_started_at) FROM ingestion_runs);
