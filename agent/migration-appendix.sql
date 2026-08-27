-- ============================================================================
-- Glosilex — add eCFR appendix support to the watchlist
--
-- Run AFTER agent/schema.sql. Safe to run more than once.
-- Required if you re-import the workflow dated 2026-08-28 or later.
-- ============================================================================
--
-- WHY
--
-- eCFR returns a Part's *supplements* separately from its body. Fetching
-- part=744 gives you the end-user-control prose and NOT the Entity List,
-- because the Entity List is "Supplement No. 4 to Part 744".
--
-- Measured 2026-08-28:
--   part=744 body only ................................        1 chunk
--   part=744 + appendix "Supplement No. 4 to Part 744" .   3,372 chunks
--
-- The original corpus_registry seed pointed the Entity List row at the part
-- body. The chunk-count guardrail would have caught it — 1 chunk against a
-- band of 8,000-30,000 halts before any delete — so no data was ever at risk.
-- But the row was wrong and would have logged a confusing failure.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. New column: which supplement, if any, this document lives in
-- ---------------------------------------------------------------------------
ALTER TABLE corpus_registry
  ADD COLUMN IF NOT EXISTS cfr_appendix text;

COMMENT ON COLUMN corpus_registry.cfr_appendix IS
  'eCFR appendix/supplement label, e.g. "Supplement No. 4 to Part 744". '
  'NULL means fetch the part body. Passed to the versioner full endpoint '
  'as &appendix=...';


-- ---------------------------------------------------------------------------
-- 2. Point the Entity List row at the actual Entity List
--
-- Band widened to 1,500-8,000 around the measured 3,372. Note this is far
-- below the 17,734 rows currently held: the PDF ingest split the same content
-- much more aggressively than the eCFR XML does. That is expected, not a loss
-- of coverage — but it does mean the first re-ingest of this document will
-- look like a large shrink. Read the ingestion_runs row before assuming a bug.
-- ---------------------------------------------------------------------------
UPDATE corpus_registry
SET cfr_appendix       = 'Supplement No. 4 to Part 744',
    expected_chunk_min = 1500,
    expected_chunk_max = 8000
WHERE document_name = 'BIS_Entity_List_Part744';


-- ---------------------------------------------------------------------------
-- 3. Optional: watch Part 744's body separately
--
-- The end-user control rules (744.1 to 744.23 — the catch-all controls, the
-- military end-use rules, the "know your customer" guidance) are substantive
-- regulation worth having, distinct from the list of names.
--
-- Left commented out because the measured body is tiny; enable only if a
-- spot check shows eCFR returning real content for the part body.
-- ---------------------------------------------------------------------------
-- INSERT INTO corpus_registry
--   (document_name, jurisdiction, source_type, cfr_title, cfr_part, source_url,
--    expected_chunk_min, expected_chunk_max, last_ingested_amendment, is_active)
-- VALUES
--   ('EAR_EndUserControls_Part744', 'EAR_US', 'ecfr', '15', '744',
--    'https://www.ecfr.gov/current/title-15/part-744', 1, 5000, NULL, false)
-- ON CONFLICT (document_name) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. NOT added: the Commerce Country Chart
--
-- Supplement No. 1 to Part 738 is now technically fetchable with this change.
-- It is still deliberately absent from the watchlist, because it is a table
-- and the prose chunker reduces it to rows of context-free X marks. See the
-- note in agent/expand-corpus.sql. Adding it would be a retrieval regression.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- SELECT document_name, cfr_title, cfr_part, cfr_appendix,
--        expected_chunk_min, expected_chunk_max, is_active
-- FROM corpus_registry
-- WHERE cfr_appendix IS NOT NULL OR document_name LIKE '%744%';
