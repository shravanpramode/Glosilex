-- ============================================================================
-- Glosilex — put the WHOLE corpus on the watchlist
--
-- Run in the Supabase SQL Editor. Safe to run more than once.
-- ============================================================================
--
-- THE GAP THIS CLOSES
--
-- corpus_registry was seeded only with documents the eCFR API can watch. Four
-- documents in regulatory_chunks were therefore invisible to the agent and
-- absent from every report:
--
--     SCOMET_List_2025          2,030 chunks   <-- the entire India corpus
--     BIS_InterimRule_Jan2025     639
--     CHIPS_Act_Guardrails        378
--     FTDR_Act_1992               110
--                               ------
--                               3,157 chunks unaccounted
--
-- Glosilex's core claim is dual-jurisdiction coverage, India SCOMET and US
-- EAR. The agent was watching only the US half, and the report said "23
-- documents watched" while the corpus held 27 — with no indication that the
-- other four existed. A monitoring system that silently omits part of what it
-- monitors is worse than no monitoring, because it reports healthy.
--
-- Registering a document does NOT mean it can be watched automatically. It
-- means it is accounted for, and the report states plainly how its freshness
-- is established. Three honest categories:
--
--   ecfr    machine-checkable. The agent polls eCFR and knows the answer.
--   manual  no API exists. A human must check on a cadence. The report shows
--           when that check is due, and going overdue is a visible failure.
--   static  published once and immutable. A 1992 statute and a published
--           Federal Register rule do not change; what changes is the CFR that
--           incorporates them, which is watched separately. Never re-ingest.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Columns that let the registry describe HOW freshness is established
-- ---------------------------------------------------------------------------
ALTER TABLE corpus_registry
  ADD COLUMN IF NOT EXISTS publisher           text,
  ADD COLUMN IF NOT EXISTS source_note         text,
  ADD COLUMN IF NOT EXISTS review_cadence_days integer,
  ADD COLUMN IF NOT EXISTS last_reviewed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS document_version    text;

COMMENT ON COLUMN corpus_registry.publisher IS
  'Governing body that issues this document — eCFR, DGFT, Federal Register, Parliament of India.';
COMMENT ON COLUMN corpus_registry.source_note IS
  'Plain-English statement of how a change to this document is detected.';
COMMENT ON COLUMN corpus_registry.review_cadence_days IS
  'For source_type = manual: how often a human must check. NULL for ecfr and static.';
COMMENT ON COLUMN corpus_registry.last_reviewed_at IS
  'For source_type = manual: when a human last confirmed this is current.';
COMMENT ON COLUMN corpus_registry.document_version IS
  'Human-readable version label where a date is not the natural identifier, e.g. "SCOMET List 2025, as on 23.09.2025".';

-- Disambiguate the two dates that were being confused with each other.
COMMENT ON COLUMN corpus_registry.last_ingested_amendment IS
  'THE DOCUMENT VERSION WE HOLD — the date the governing body last amended the copy in our corpus. NOT when we refreshed.';
COMMENT ON COLUMN corpus_registry.last_ingested_at IS
  'WHEN WE LAST REFRESHED — the timestamp our pipeline last wrote this document. NOT the document version.';


-- ---------------------------------------------------------------------------
-- 2. Register the four missing documents
-- ---------------------------------------------------------------------------

-- ---- India: SCOMET -------------------------------------------------------
-- DGFT publishes the SCOMET list and its amending notifications as PDFs. There
-- is no versioned API, nothing equivalent to eCFR. Auto-ingesting a government
-- PDF nobody has looked at is how a compliance corpus gets silently corrupted,
-- so this is deliberately human-in-the-loop on a 30-day cadence.
INSERT INTO corpus_registry
  (document_name, jurisdiction, source_type, source_url, publisher, source_note,
   review_cadence_days, document_version, last_ingested_amendment,
   expected_chunk_min, expected_chunk_max, is_active)
VALUES
  ('SCOMET_List_2025', 'SCOMET_INDIA', 'manual',
   'https://www.dgft.gov.in/CP/?opt=notification', 'DGFT (Directorate General of Foreign Trade)',
   'No API exists. DGFT publishes SCOMET updates as gazette notification PDFs. A human must check the notifications page, confirm a genuine list change, download the PDF and ingest it. The agent tracks when that check is due and flags it overdue.',
   30, 'SCOMET List 2025, as on 23.09.2025', DATE '2025-09-23',
   1500, 4000, true),

  ('FTDR_Act_1992', 'SCOMET_INDIA', 'static',
   'https://www.indiacode.nic.in/handle/123456789/1362', 'Parliament of India',
   'Primary legislation from 1992. Amended only by an Act of Parliament, which would be major news. No monitoring required; re-ingest only on an explicit amendment.',
   NULL, 'Act No. 22 of 1992', DATE '1992-08-07',
   50, 400, true)
ON CONFLICT (document_name) DO NOTHING;

-- ---- US: published Federal Register rules ---------------------------------
-- A published final rule is IMMUTABLE. It never changes after publication.
-- What changes is the CFR text that incorporates it — and those CFR parts are
-- already watched. Re-downloading these would be pure waste.
INSERT INTO corpus_registry
  (document_name, jurisdiction, source_type, source_url, publisher, source_note,
   review_cadence_days, document_version, last_ingested_amendment,
   expected_chunk_min, expected_chunk_max, is_active)
VALUES
  ('BIS_InterimRule_Jan2025', 'EAR_US', 'static',
   'https://www.federalregister.gov/documents/2025/01/15/2025-00636/framework-for-artificial-intelligence-diffusion',
   'Federal Register / BIS',
   'A published Federal Register rule is immutable once issued. Its effects flow into 15 CFR Parts 740, 742 and 774, which the agent watches directly. Never re-ingest.',
   NULL, 'Interim Final Rule, 13 Jan 2025', DATE '2025-01-13',
   300, 1200, true),

  ('CHIPS_Act_Guardrails', 'EAR_US', 'static',
   'https://www.federalregister.gov/documents/2023/09/25/2023-20471/preventing-the-improper-use-of-chips-act-funding',
   'Federal Register / Dept. of Commerce',
   'Published final rule, immutable. Governs CHIPS Act funding guardrails. Never re-ingest.',
   NULL, 'Final Rule, 25 Sep 2023', DATE '2023-09-25',
   150, 800, true)
ON CONFLICT (document_name) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Describe the documents already registered
-- ---------------------------------------------------------------------------
UPDATE corpus_registry
SET publisher = 'eCFR (Electronic Code of Federal Regulations)',
    source_note = 'Machine-checkable. The agent polls the eCFR versioner API daily for the latest amendment date and re-ingests only when a substantive section has changed.'
WHERE source_type = 'ecfr' AND publisher IS NULL;


-- ---------------------------------------------------------------------------
-- 4. Backfill true chunk counts, so the registry stops disagreeing with reality
-- ---------------------------------------------------------------------------
UPDATE corpus_registry r
SET chunk_count = c.n
FROM (SELECT document_name, count(*)::int AS n FROM regulatory_chunks GROUP BY document_name) c
WHERE c.document_name = r.document_name;


-- ---------------------------------------------------------------------------
-- 5. A reconciliation view — anything here is a monitoring blind spot
--
-- This should always return zero rows. If it ever returns one, a document is
-- being served to users that nothing is watching.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW unregistered_corpus_documents AS
SELECT
  rc.document_name,
  rc.jurisdiction,
  count(*) AS chunks,
  'Present in regulatory_chunks but absent from corpus_registry. Nothing is monitoring this document.' AS problem
FROM regulatory_chunks rc
LEFT JOIN corpus_registry cr ON cr.document_name = rc.document_name
WHERE cr.document_name IS NULL
GROUP BY rc.document_name, rc.jurisdiction
ORDER BY count(*) DESC;


-- ---------------------------------------------------------------------------
-- 6. Manual reviews that are overdue
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW overdue_manual_reviews AS
SELECT
  document_name, jurisdiction, publisher, source_url,
  review_cadence_days,
  last_reviewed_at,
  COALESCE(
    EXTRACT(day FROM now() - COALESCE(last_reviewed_at, last_ingested_at))::int,
    9999) AS days_since_review,
  CASE WHEN COALESCE(last_reviewed_at, last_ingested_at) IS NULL THEN 'never reviewed'
       WHEN now() - COALESCE(last_reviewed_at, last_ingested_at) > (review_cadence_days || ' days')::interval
       THEN 'OVERDUE' ELSE 'current' END AS review_status
FROM corpus_registry
WHERE source_type = 'manual' AND is_active
ORDER BY days_since_review DESC;


-- ---------------------------------------------------------------------------
-- Record a manual review once you have checked DGFT and confirmed nothing changed
-- ---------------------------------------------------------------------------
-- UPDATE corpus_registry SET last_reviewed_at = now()
-- WHERE document_name = 'SCOMET_List_2025';


-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- SELECT * FROM unregistered_corpus_documents;     -- must be empty
-- SELECT * FROM overdue_manual_reviews;
-- SELECT jurisdiction, source_type, count(*), sum(chunk_count)
-- FROM corpus_registry GROUP BY jurisdiction, source_type ORDER BY 1,2;
