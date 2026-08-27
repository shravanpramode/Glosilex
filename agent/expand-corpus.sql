-- ============================================================================
-- Glosilex — expanding the watchlist to close corpus gaps
--
-- Run AFTER agent/schema.sql. Optional — the sentinel works without it.
-- ============================================================================
--
-- READ THIS BEFORE YOU RUN IT
--
-- Ingesting a document is NOT the same as shipping a capability. Your gap
-- analysis mixes two very different kinds of gap, and only one of them is
-- fixed by ingestion:
--
--   MISSING CORPUS      the regulation exists, we just never loaded it.
--                       ITAR, OFAC, EU Dual-Use. Ingestion fixes these.
--
--   MISSING CAPABILITY  the text is already in the corpus; what is missing is
--                       a module that reasons over it. "Deemed export risk"
--                       lives in 15 CFR 734 which you already hold — what you
--                       do not have is a workflow that asks who your foreign
--                       national employees are. No amount of ingestion fixes
--                       that.
--
-- This file only addresses the first kind.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- ITAR / USML  —  22 CFR Parts 120, 121, 123, 126
--
-- Marked "Critical" in your gap analysis, and it is the cheapest one to close:
-- ITAR lives in eCFR Title 22, and the sentinel already speaks eCFR. This is
-- a configuration change, not a code change. The workflow does not know or
-- care which title it is reading.
--
-- Chunk counts below were measured against live eCFR XML on 2026-08-28, with
-- the same chunking the existing corpus uses. Bands are set ~±40% around the
-- measured value: wide enough to absorb a real amendment, tight enough to
-- catch a parser regression.
-- ---------------------------------------------------------------------------
INSERT INTO corpus_registry
  (document_name, jurisdiction, source_type, cfr_title, cfr_part, source_url,
   expected_chunk_min, expected_chunk_max, last_ingested_amendment, is_active)
VALUES
  -- measured 535 chunks
  ('ITAR_USML_Part121', 'ITAR_US', 'ecfr', '22', '121',
   'https://www.ecfr.gov/current/title-22/part-121',  300, 1200, NULL, true),

  -- measured 200 chunks — definitions, incl. "defense article" and "export"
  ('ITAR_Definitions_Part120', 'ITAR_US', 'ecfr', '22', '120',
   'https://www.ecfr.gov/current/title-22/part-120',  100,  600, NULL, true),

  -- measured 150 chunks — licences and other approvals
  ('ITAR_Licenses_Part123', 'ITAR_US', 'ecfr', '22', '123',
   'https://www.ecfr.gov/current/title-22/part-123',   80,  500, NULL, true),

  -- measured 439 chunks — general policies and prohibited exports
  ('ITAR_Policies_Part126', 'ITAR_US', 'ecfr', '22', '126',
   'https://www.ecfr.gov/current/title-22/part-126',  250, 1000, NULL, true)
ON CONFLICT (document_name) DO NOTHING;

-- last_ingested_amendment is deliberately NULL: we hold no copy at all, so the
-- first run treats everything as new and ingests the full text.


-- ============================================================================
-- IMPORTANT — ingesting ITAR does not yet make it reachable
--
-- hybrid_search filters on `jurisdiction = ANY(jurisdiction_filter)`, and the
-- app only ever passes 'SCOMET_INDIA', 'EAR_US' and 'EU_DUAL_USE'. Chunks
-- tagged 'ITAR_US' will sit in the table and never be retrieved.
--
-- The tempting shortcut is to tag them 'EAR_US' so they show up immediately.
-- Do NOT do that. ITAR and EAR are administered by different agencies (DDTC
-- vs BIS) under different statutes, with different licensing regimes and
-- different penalties. Blending them into one jurisdiction bucket would let
-- the model cite an ITAR clause as though it were an EAR control. In a
-- compliance product that is not untidy data modelling, it is wrong advice.
--
-- To actually surface ITAR you need three small app changes:
--   1. add 'ITAR_US' to the jurisdiction toggles in Classify / Ask / Contracts
--   2. add ITAR to detectJurisdiction() in src/services/retrieval.ts
--      (keywords: itar, usml, ddtc, defense article, munitions)
--   3. extend the prompts in src/lib/prompts.ts so the model knows ITAR is a
--      separate determination, not an EAR sub-case
--
-- That is a v1.5 feature, not a today feature. Ingest now so the corpus is
-- ready; ship the module when you have time to do it properly.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Verify what you just added
-- ---------------------------------------------------------------------------
-- SELECT document_name, jurisdiction, cfr_title, cfr_part,
--        last_ingested_amendment, chunk_count, is_active
-- FROM corpus_registry
-- ORDER BY cfr_title, cfr_part;


-- ---------------------------------------------------------------------------
-- To ingest ONLY the new ITAR parts on the next run, park the rest first:
-- ---------------------------------------------------------------------------
-- UPDATE corpus_registry SET is_active = false;
-- UPDATE corpus_registry SET is_active = true WHERE jurisdiction = 'ITAR_US';
--
-- ...run the workflow, confirm the rows landed, then switch everything back on:
--
-- UPDATE corpus_registry SET is_active = true;
