-- ============================================================================
-- Glosilex — reset the demo so you can re-record the run
-- ============================================================================
--
-- WHY YOU NEED THIS
--
-- The agent is doing its job: it remembers. After the successful run on
-- 2026-08-28 the registry holds
--
--     EAR_CCL_Part736   last_ingested_amendment = 2026-07-16
--
-- and eCFR's latest amendment for Part 736 is also 2026-07-16. So the next run
-- correctly decides `no_change` and does nothing. Press "Run Now (Demo)" again
-- and you get a two-second run with no ingestion and nothing to film.
--
-- To re-record the interesting path, put the registry back to where it was
-- before the first run. This is a replay, not a fabrication — 2026-03-05 with
-- 106 chunks is exactly the state the corpus was in, and the transition you
-- record is the one that genuinely happened.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Reset Part 736 to its pre-run state
-- ---------------------------------------------------------------------------
UPDATE corpus_registry
SET last_ingested_amendment = DATE '2026-03-05',
    chunk_count             = 106          -- what the PDF ingest produced
WHERE document_name = 'EAR_CCL_Part736';

-- Make sure nothing else is armed, so the run stays small and fast
UPDATE corpus_registry SET is_active = false;
UPDATE corpus_registry SET is_active = true WHERE document_name = 'EAR_CCL_Part736';

-- Now click "Run Now (Demo)". You will get, again:
--   ingested   2026-03-05 -> 2026-07-16   106 -> 91   [material]


-- ---------------------------------------------------------------------------
-- Is it safe to run repeatedly?  Yes.
--
-- 1. No duplicates. "Clear Partial Reingest" deletes any rows already carrying
--    the incoming amendment_date before the insert, so run five and you still
--    end with 91 chunks, not 455.
--
-- 2. No gap in coverage. New chunks are written and counted before the old set
--    is retired, so the corpus is never empty mid-run.
--
-- 3. Negligible cost. 91 embeddings per run — about two seconds of your rate
--    limit. Compare with 4,394 for Part 774, which is why the demo is on 736.
--
-- 4. The audit trail grows. Every run appends to ingestion_runs. That is
--    correct behaviour, and it films well: the history is the proof the agent
--    has been watching. Only clear it if you want a tidy screen — see below.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Optional: tidy the run history before recording the final take
-- ---------------------------------------------------------------------------
-- DELETE FROM ingestion_runs WHERE run_started_at < now() - interval '10 minutes';


-- ---------------------------------------------------------------------------
-- What NOT to do
--
-- Do not reset and re-run Part 774 repeatedly. It is 4,394 chunks per run;
-- three takes is 13,000 embeddings and you will hit the rate limit again.
-- Film Part 736 and say the number out loud for 774 instead.
--
-- Do not reset BIS_Entity_List_Part744 at all. See agent/run-waves.sql.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Put everything back when you have finished filming
-- ---------------------------------------------------------------------------
-- UPDATE corpus_registry SET is_active = true;
-- UPDATE corpus_registry SET is_active = false WHERE document_name = 'BIS_Entity_List_Part744';

-- Where things stand:
-- SELECT document_name, last_ingested_amendment, chunk_count, is_active
-- FROM corpus_registry ORDER BY document_name;
