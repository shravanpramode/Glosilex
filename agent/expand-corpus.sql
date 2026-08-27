-- ============================================================================
-- Glosilex — expanding the watchlist to close the corpus gaps
--
-- Run AFTER agent/schema.sql. Optional — the sentinel works without it.
--
-- Every chunk count below was MEASURED against live eCFR XML on 2026-08-28
-- using the same chunking the existing corpus uses. Nothing here is estimated.
-- ============================================================================
--
-- READ THIS FIRST — your gap analysis mixes two different problems
--
--   MISSING CORPUS      the regulation exists, we never loaded it.
--                       ITAR, EAR 742/746/748/764. Ingestion fixes these.
--
--   MISSING CAPABILITY  the text is already in the corpus; what is missing is
--                       a module that reasons over it. Denied-party screening,
--                       EUC generation, licence determination, the deemed-export
--                       checker. No amount of ingestion fixes these.
--
-- Your own 'Updated list' tab already makes this distinction correctly (see
-- rows 8, 13, 14). Sheet 1 note "uploading ITAR will fix this" against Deemed
-- Export is the one place the two tabs disagree — see the note at the bottom.
--
-- This file only addresses the first kind.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- SECTION A — EAR parts you are missing
--
-- These are tagged 'EAR_US', which the app already passes to hybrid_search.
-- They become retrievable the moment they are ingested. No app change needed.
-- This is the highest value-per-effort block in the file.
-- ---------------------------------------------------------------------------
INSERT INTO corpus_registry
  (document_name, jurisdiction, source_type, cfr_title, cfr_part, source_url,
   expected_chunk_min, expected_chunk_max, last_ingested_amendment, is_active)
VALUES
  -- 508 chunks. You named 742.6(b)(13) and (b)(14) yourself — this is the part
  -- that carries AI model weight control policy. Closes a "Critical" gap.
  ('EAR_ControlPolicy_Part742', 'EAR_US', 'ecfr', '15', '742',
   'https://www.ecfr.gov/current/title-15/part-742',  250, 1150, NULL, true),

  -- 869 chunks. THIS is the answer to your question #10, "country-specific
  -- licence requirements — what regulatory document to ingest?". Part 746 is
  -- the country-specific prose: Cuba, Iran, North Korea, Syria, Russia, Belarus.
  ('EAR_Embargoes_Part746', 'EAR_US', 'ecfr', '15', '746',
   'https://www.ecfr.gov/current/title-15/part-746',  430, 1900, NULL, true),

  -- 582 chunks. Licence applications and documentation — the procedural half
  -- of "do I need a licence, and how do I file one".
  ('EAR_Applications_Part748', 'EAR_US', 'ecfr', '15', '748',
   'https://www.ecfr.gov/current/title-15/part-748',  290, 1300, NULL, true),

  -- 138 chunks. Enforcement and Voluntary Self-Disclosure (764.5). Your
  -- gap item #12. Grounds VSD questions even before a VSD workflow exists.
  ('EAR_Enforcement_Part764', 'EAR_US', 'ecfr', '15', '764',
   'https://www.ecfr.gov/current/title-15/part-764',   70,  320, NULL, true)
ON CONFLICT (document_name) DO NOTHING;


-- ---------------------------------------------------------------------------
-- SECTION B — ITAR, 22 CFR Subchapter M, Parts 120–130
--
-- You asked for "ITAR 22 CFR Parts 120-130 full text". This is all of it.
-- ITAR lives in eCFR Title 22 and the sentinel already speaks eCFR, so closing
-- a gap you marked Critical is a configuration change, not a code change. The
-- workflow does not know or care which CFR title it is reading.
--
-- Total: roughly 1,776 chunks across eleven parts.
-- ---------------------------------------------------------------------------
INSERT INTO corpus_registry
  (document_name, jurisdiction, source_type, cfr_title, cfr_part, source_url,
   expected_chunk_min, expected_chunk_max, last_ingested_amendment, is_active)
VALUES
  ('ITAR_Definitions_Part120', 'ITAR_US', 'ecfr', '22', '120',
   'https://www.ecfr.gov/current/title-22/part-120', 100,  450, NULL, true),  -- 200

  ('ITAR_USML_Part121',        'ITAR_US', 'ecfr', '22', '121',
   'https://www.ecfr.gov/current/title-22/part-121', 260, 1200, NULL, true),  -- 535

  ('ITAR_Registration_Part122','ITAR_US', 'ecfr', '22', '122',
   'https://www.ecfr.gov/current/title-22/part-122',  20,  100, NULL, true),  -- 39

  ('ITAR_Licenses_Part123',    'ITAR_US', 'ecfr', '22', '123',
   'https://www.ecfr.gov/current/title-22/part-123',  75,  350, NULL, true),  -- 150

  ('ITAR_Agreements_Part124',  'ITAR_US', 'ecfr', '22', '124',
   'https://www.ecfr.gov/current/title-22/part-124',  50,  250, NULL, true),  -- 108

  ('ITAR_TechData_Part125',    'ITAR_US', 'ecfr', '22', '125',
   'https://www.ecfr.gov/current/title-22/part-125',  20,  120, NULL, true),  -- 46

  ('ITAR_Policies_Part126',    'ITAR_US', 'ecfr', '22', '126',
   'https://www.ecfr.gov/current/title-22/part-126', 220, 1000, NULL, true),  -- 439

  ('ITAR_Violations_Part127',  'ITAR_US', 'ecfr', '22', '127',
   'https://www.ecfr.gov/current/title-22/part-127',  35,  170, NULL, true),  -- 71

  ('ITAR_Procedures_Part128',  'ITAR_US', 'ecfr', '22', '128',
   'https://www.ecfr.gov/current/title-22/part-128',  30,  150, NULL, true),  -- 61

  ('ITAR_Brokering_Part129',   'ITAR_US', 'ecfr', '22', '129',
   'https://www.ecfr.gov/current/title-22/part-129',  35,  180, NULL, true),  -- 75
   -- ^ your gap item #11, brokering and transit rules

  ('ITAR_Political_Part130',   'ITAR_US', 'ecfr', '22', '130',
   'https://www.ecfr.gov/current/title-22/part-130',  25,  130, NULL, true)   -- 52
ON CONFLICT (document_name) DO NOTHING;

-- last_ingested_amendment is deliberately NULL on every row above: we hold no
-- copy at all, so the first run treats it as new and ingests the full text.


-- ============================================================================
-- ITAR WILL NOT BE REACHABLE UNTIL YOU CHANGE THE APP
--
-- hybrid_search filters on `jurisdiction = ANY(jurisdiction_filter)`, and the
-- app only ever passes 'SCOMET_INDIA', 'EAR_US' and 'EU_DUAL_USE'. Chunks
-- tagged 'ITAR_US' will sit in the table and never be retrieved.
--
-- The tempting shortcut is to tag them 'EAR_US' so they show up immediately.
-- Do NOT. ITAR and EAR are administered by different agencies (DDTC vs BIS)
-- under different statutes, with different licensing regimes and — as your own
-- source article notes — criminal penalties up to 20 years for ITAR. Blending
-- them into one bucket would let the model cite an ITAR clause as an EAR
-- control. In a compliance product that is not untidy data modelling, it is
-- wrong advice of exactly the kind that gets someone prosecuted.
--
-- To surface ITAR properly, three small app changes:
--   1. add 'ITAR_US' to the jurisdiction toggles in Classify / Ask / Contracts
--   2. add ITAR keywords to detectJurisdiction() in src/services/retrieval.ts
--      (itar, usml, ddtc, defense article, munitions, technical data)
--   3. extend src/lib/prompts.ts so the model treats ITAR as a SEPARATE
--      determination, never an EAR sub-case
--
-- Ingest now so the corpus is ready. Ship the module when you can do it right.
-- ============================================================================


-- ============================================================================
-- THE COMMERCE COUNTRY CHART — DO NOT INGEST IT NAIVELY
--
-- Supplement No. 1 to Part 738 is the country/reason-for-control matrix. It is
-- NOT included when you fetch part 738, because eCFR returns supplements
-- separately. It is retrievable, with the appendix parameter:
--
--   https://www.ecfr.gov/api/versioner/v1/full/{date}/title-15.xml
--       ?part=738&appendix=Supplement%20No.%201%20to%20Part%20738
--
-- But it is a TABLE, and the prose chunker destroys it. Measured output:
-- 18.7 KB of text becoming 24 chunks that look like this:
--
--   "X X X X X X X Equatorial Guinea X X X X X X X X X X Eritrea 1 X X X ..."
--
-- The column headers — CB1, CB2, NS1, NS2, MT1, AT1, the reasons for control —
-- are stripped, so an X means nothing. A model retrieving that chunk cannot
-- determine anything, and will invent an interpretation rather than admit it.
-- That is worse than not having the document at all.
--
-- The Country Chart needs STRUCTURED extraction, not chunking: parse the table
-- into (country, reason_for_control) pairs and either store it as real columns
-- or synthesise one sentence per country — "For India, a licence is required
-- for reasons NS1, NS2, MT1, CB1..." — which chunks and retrieves cleanly.
--
-- That is a separate, small piece of work. It is not part of this file, and
-- adding the appendix to corpus_registry without it would be a regression.
-- ============================================================================


-- ============================================================================
-- ON "uploading ITAR will fix this" (Sheet 1, Deemed export risk)
--
-- Half right, and the half that is wrong matters.
--
-- Ingesting ITAR grounds the ITAR side of deemed export — 22 CFR 120.17,
-- which defines release of technical data to a foreign person as an export.
-- The EAR side, 15 CFR 734.13, is already in your corpus. So after this file
-- runs, Ask Compliance can answer deemed-export questions for both regimes.
--
-- What ingestion does NOT give you is the capability. Your own 'Updated list'
-- row 9 states it correctly: "no standalone deemed-export advisory workflow
-- exists". A Deemed Export Risk Checker has to ask who your foreign national
-- employees are, what technology they can reach, and under which regime — and
-- no document in the corpus can answer that, because the answer is about the
-- user's own organisation, not about the regulation.
--
-- Corpus gap: closed by this file. Capability gap: still open.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Verify what you added
-- ---------------------------------------------------------------------------
-- SELECT jurisdiction, count(*) AS documents,
--        sum(expected_chunk_min) AS min_expected,
--        sum(expected_chunk_max) AS max_expected
-- FROM corpus_registry GROUP BY jurisdiction ORDER BY jurisdiction;


-- ---------------------------------------------------------------------------
-- Suggested first run: the four EAR parts only.
-- They are immediately retrievable, so you can prove the value the same day.
-- ---------------------------------------------------------------------------
-- UPDATE corpus_registry SET is_active = false;
-- UPDATE corpus_registry SET is_active = true
--   WHERE document_name IN ('EAR_ControlPolicy_Part742','EAR_Embargoes_Part746',
--                           'EAR_Applications_Part748','EAR_Enforcement_Part764');
--
-- ...run the workflow, ask Glosilex "what are the licence requirements for
-- exporting to Iran?" and watch it cite Part 746 for the first time. Then:
--
-- UPDATE corpus_registry SET is_active = true;
