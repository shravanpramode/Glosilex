-- ============================================================================
-- Glosilex — set up the n8n agent recording
--
-- Run in the Supabase SQL Editor, then record the n8n run.
-- ============================================================================
--
-- WHAT THIS DEMO SHOWS, ALL IN ONE RUN
--
--   no_change   ->  EAR_CCL_Part736, ITAR_Registration_Part122
--   INLINE      ->  ITAR_Definitions_Part120   (200 chunks, under the 300 limit)
--   DELEGATE    ->  EAR_CCL_Part774            (3,779 chunks, over the limit)
--
-- NOTHING HERE IS STAGED. All four documents are in the state shown below
-- right now. eCFR published amendments to Title 15 Part 774 and Title 22
-- Part 120 on 2026-08-28, and the corpus has not caught up yet. The agent
-- catching a genuine three-day-old amendment on camera is worth considerably
-- more than a replayed one, and you can say so honestly.
--
--   document                    held         published    decision
--   EAR_CCL_Part736             2026-07-16   2026-07-16   no_change
--   ITAR_Registration_Part122   2025-01-08   2025-01-08   no_change
--   ITAR_Definitions_Part120    2025-07-07   2026-08-28   ingest -> inline
--   EAR_CCL_Part774             2026-08-18   2026-08-28   ingest -> delegate
--
-- ============================================================================
-- WHY THIS CANNOT CORRUPT THE CORPUS
--
-- The one risk in a re-ingest is "Clear Partial Reingest", which deletes rows
-- already carrying the INCOMING amendment date before writing. That exists so
-- a retry cannot duplicate chunks.
--
-- It is only dangerous if you artificially reset a document's held date while
-- its chunks already carry the newest date — then it deletes the good rows and
-- the corpus is briefly empty. That is exactly what a staged demo would do,
-- and it is why this file does not stage anything.
--
-- Here, both ingesting documents are genuinely behind:
--
--   Part 120's chunks carry amendment_date = 2025-07-07
--   Part 774's chunks carry amendment_date = 2026-08-18
--   the incoming date for both is           2026-08-28
--
-- So "Clear Partial Reingest" matches ZERO rows and deletes nothing. The old
-- version keeps serving traffic until the new one is written AND verified, and
-- only then is it retired. That is the atomic swap working as designed.
--
-- The two no_change documents never reach a write path at all.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1 — Arm exactly these four documents
-- ---------------------------------------------------------------------------
UPDATE corpus_registry SET is_active = false;

UPDATE corpus_registry SET is_active = true
WHERE document_name IN (
  'EAR_CCL_Part736',            -- no_change  (91 chunks, current)
  'ITAR_Registration_Part122',  -- no_change  (39 chunks, current)
  'ITAR_Definitions_Part120',   -- ingest inline   (200 chunks)
  'EAR_CCL_Part774'             -- ingest delegate (3,779 chunks)
);


-- ---------------------------------------------------------------------------
-- STEP 2 — Confirm the starting position before you hit record
-- ---------------------------------------------------------------------------
SELECT document_name,
       last_ingested_amendment AS held,
       chunk_count,
       CASE
         WHEN document_name IN ('EAR_CCL_Part736','ITAR_Registration_Part122')
           THEN 'expect: no_change'
         WHEN document_name = 'ITAR_Definitions_Part120'
           THEN 'expect: ingest INLINE (200 chunks)'
         WHEN document_name = 'EAR_CCL_Part774'
           THEN 'expect: ingest DELEGATE (3,779 chunks)'
       END AS expected_path
FROM corpus_registry
WHERE is_active
ORDER BY document_name;

-- Four rows. If you see any other document, re-run STEP 1.


-- ---------------------------------------------------------------------------
-- STEP 3 — Record the n8n run (see the checklist below), then verify
-- ---------------------------------------------------------------------------
-- SELECT document_name, outcome, route,
--        previous_amendment || ' -> ' || COALESCE(new_amendment::text,'—') AS version,
--        chunks_before, chunks_after, severity
-- FROM ingestion_runs
-- ORDER BY run_started_at DESC
-- LIMIT 6;
--
-- Expect: two no_change, one ingested, one delegated.


-- ---------------------------------------------------------------------------
-- STEP 4 — Put everything back when you have finished filming
-- ---------------------------------------------------------------------------
-- UPDATE corpus_registry SET is_active = true;
--
-- Part 774 and ITAR Part 121 are both still behind after this demo. Bring them
-- current with the worker rather than n8n — 774 is 3,779 chunks:
--
--   node agent/backfill.mjs --pending
--
-- or let the GitHub Action do it, which is what the delegation triggers anyway.
