-- ============================================================================
-- Glosilex — quota-safe ingestion waves
--
-- Run ONE wave, let the workflow finish, confirm it, then run the next.
-- Never activate the whole watchlist at once.
-- ============================================================================
--
-- WHY WAVES
--
-- Gemini counts each content inside a batchEmbedContents call separately
-- against embed_content_*_requests. Activating everything at once queues
-- 26,132 embeddings in a single run, which is what blew the rate limit.
--
-- After the workflow fix the pipeline paces itself at ~2,400 embeddings/min
-- (under the 3,000/min tier limit), but pacing only protects the per-minute
-- quota. Waves keep each run small enough to finish, verify, and roll back.
--
-- Estimated embedding time per wave assumes 2,400/min.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- WAVE 0 — prove the pipeline.  106 chunks, ~3 seconds.
--
-- Do this first, always. If this run does not end with a green
-- "Update Corpus Registry" node, do not proceed to Wave 1.
-- ---------------------------------------------------------------------------
UPDATE corpus_registry SET is_active = false;
UPDATE corpus_registry SET is_active = true WHERE document_name = 'EAR_CCL_Part736';

-- Then click "Run Now (Demo)" in n8n and check:
--   SELECT document_name, outcome, chunks_before, chunks_after, severity,
--          change_summary
--   FROM ingestion_runs ORDER BY run_started_at DESC LIMIT 3;


-- ---------------------------------------------------------------------------
-- WAVE 1 — the four new EAR parts.  2,097 chunks, ~1 minute.
--
-- Requires agent/expand-corpus.sql to have been run first.
--
-- Highest value in the whole plan: these are tagged EAR_US, so the app can
-- retrieve them the moment they land — no code change. This is the wave that
-- lets you ask "what are the licence requirements for exporting to Iran?" and
-- get a cited answer from Part 746 for the first time.
-- ---------------------------------------------------------------------------
-- UPDATE corpus_registry SET is_active = false;
-- UPDATE corpus_registry SET is_active = true
--   WHERE document_name IN ('EAR_ControlPolicy_Part742',   -- 508  AI model weights
--                           'EAR_Embargoes_Part746',       -- 869  country-specific
--                           'EAR_Applications_Part748',    -- 582  licence filing
--                           'EAR_Enforcement_Part764');    -- 138  VSD


-- ---------------------------------------------------------------------------
-- WAVE 2 — ITAR, all eleven parts.  ~1,776 chunks, ~45 seconds.
--
-- These land tagged ITAR_US and will NOT be retrievable until you add the
-- jurisdiction toggle to the app. Ingest anyway: the corpus is then ready,
-- and "ITAR corpus loaded, module next" is a much stronger position than
-- "ITAR not started".
-- ---------------------------------------------------------------------------
-- UPDATE corpus_registry SET is_active = false;
-- UPDATE corpus_registry SET is_active = true WHERE jurisdiction = 'ITAR_US';


-- ---------------------------------------------------------------------------
-- WAVE 3 — refresh the stale EAR corpus.  5,245 chunks, ~2.2 minutes.
--
-- This is the wave that actually fixes the five-month staleness, including
-- Part 774 and its 2026-08-18 amendment. Run it when you have time to watch.
--
-- Measured against live eCFR on 2026-08-28 — what each document will become:
--
--     part   held (PDF)   new (eCFR)
--     774        4,394        3,779
--     740          950          844
--     738          244           88   <-- see below
--     734          325          282
--     732          178          153
--     730          115           99
--
-- Every document shrinks, because the PDFs you downloaded included each part's
-- SUPPLEMENTS and the eCFR part endpoint does not. That is expected, not a
-- loss of regulatory coverage — with one real exception:
--
--   Part 738 drops from 244 to 88 because the Commerce Country Chart is
--   Supplement No. 1 and is genuinely not in the part body. Its band of
--   100-600 would reject 88 and halt the run. Widen it first (below).
--   The Country Chart still needs structured extraction — see expand-corpus.sql.
--
-- RUN THIS FIRST, or Wave 3 halts on Part 738:
--
-- UPDATE corpus_registry
-- SET expected_chunk_min = 50
-- WHERE document_name = 'EAR_CCL_Part738';
--
-- Then arm the wave:
--
-- UPDATE corpus_registry SET is_active = false;
-- UPDATE corpus_registry SET is_active = true
--   WHERE document_name IN ('EAR_CCL_Part774',   -- 4,394 -> 3,779
--                           'EAR_CCL_Part740',   --   950 ->   844
--                           'EAR_CCL_Part738',   --   244 ->    88
--                           'EAR_CCL_Part734',   --   325 ->   282
--                           'EAR_CCL_Part732',   --   178 ->   153
--                           'EAR_CCL_Part730');  --   115 ->    99


-- ---------------------------------------------------------------------------
-- WAVE 4 — BIS Entity List, Part 744.  17,734 chunks.  CONSIDER SKIPPING.
--
-- This single document is 68% of your entire embedding cost, and it is the
-- worst value in the corpus.
--
-- The Entity List is a LIST OF NAMES. Chunking a name list as prose produces
-- the same failure as the Commerce Country Chart: fragments like
-- "...Beijing Institute of Technology X Non-SDN..." with the column meaning
-- stripped out. Semantic similarity over company names is close to useless —
-- you cannot embed your way to "is this exact entity on the list".
--
-- Denied-party screening is a LOOKUP feature, not a RAG feature. Your own
-- 'Screening list' tab says exactly this: "No integration". The fix is an
-- exact-match query against a structured table, not 17,734 more vectors.
--
-- Leave this parked until you build the screening module properly.
-- ---------------------------------------------------------------------------
-- UPDATE corpus_registry SET is_active = false;
-- UPDATE corpus_registry SET is_active = true WHERE document_name = 'BIS_Entity_List_Part744';


-- ---------------------------------------------------------------------------
-- After every wave: reactivate everything so the daily schedule keeps watching
-- (watching costs one cheap eCFR call per document — no embeddings at all).
-- ---------------------------------------------------------------------------
-- UPDATE corpus_registry SET is_active = true;
-- UPDATE corpus_registry SET is_active = false WHERE document_name = 'BIS_Entity_List_Part744';


-- ---------------------------------------------------------------------------
-- Where things stand
-- ---------------------------------------------------------------------------
-- SELECT jurisdiction, count(*) FILTER (WHERE is_active) AS active,
--        count(*) AS total, sum(chunk_count) AS chunks_held
-- FROM corpus_registry GROUP BY jurisdiction ORDER BY jurisdiction;
