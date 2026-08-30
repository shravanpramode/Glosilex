-- ============================================================================
-- Glosilex — register the last unwatched document
--
-- Run AFTER agent/migration-full-coverage.sql. Safe to run more than once.
-- ============================================================================
--
-- Country_Risk_Reference (9 chunks) is the final blind spot, and it is a
-- different KIND of document from everything else in the corpus.
--
-- Every other document is published by a governing body — eCFR, DGFT, the
-- Federal Register, Parliament. This one was written by hand, in-house. Its
-- own header says:
--
--     Source: US EAR Part 740 Supplement 1, UN Security Council,
--             DGFT SCOMET Policy
--     Last Updated: 2025-09-01
--
-- That makes it DERIVED, not authoritative — a summary of other documents
-- rather than a primary source. Two consequences worth being explicit about:
--
--   1. It can go stale invisibly. Part 740 has been amended since 2025-09-01,
--      and nothing propagates that into this table. It ages silently while
--      looking exactly as current as everything around it.
--
--   2. Retrieval cannot tell the difference. When the model retrieves a chunk
--      saying "China | D:1 D:5 | EAR License: Required for 3A001 3A090", it
--      has no way of knowing that came from an internal summary rather than
--      from the Commerce Control List itself. In a compliance product, a
--      hand-written interpretation cited with the same confidence as the
--      regulation is a real liability.
--
-- Registering it as 'internal' makes both facts visible in the report instead
-- of leaving it as an untracked file.
-- ============================================================================

INSERT INTO corpus_registry
  (document_name, jurisdiction, source_type, source_url, publisher, source_note,
   review_cadence_days, document_version, last_ingested_amendment,
   expected_chunk_min, expected_chunk_max, is_active)
VALUES
  ('Country_Risk_Reference', 'SCOMET_INDIA', 'internal',
   NULL,
   'Glosilex (internal, derived)',
   'DERIVED DOCUMENT, NOT A PRIMARY SOURCE. Hand-compiled from EAR Part 740 Supplement 1, UN Security Council designations and DGFT SCOMET policy. It does not update when its sources do, so it must be re-checked by a human whenever any of those move. Consider replacing it with structured extraction from Part 740 Supplement 1 so it derives automatically rather than by hand.',
   90, 'Internal reference, last updated 2025-09-01', DATE '2025-09-01',
   5, 60, true)
ON CONFLICT (document_name) DO NOTHING;


-- ---------------------------------------------------------------------------
-- Confirm the blind-spot check is now clean. This must return ZERO rows.
-- ---------------------------------------------------------------------------
-- SELECT * FROM unregistered_corpus_documents;


-- ---------------------------------------------------------------------------
-- Full picture after this runs
-- ---------------------------------------------------------------------------
-- SELECT jurisdiction, source_type, count(*) AS docs, sum(chunk_count) AS chunks
-- FROM corpus_registry
-- GROUP BY jurisdiction, source_type
-- ORDER BY jurisdiction, source_type;
