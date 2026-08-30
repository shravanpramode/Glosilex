-- ============================================================================
-- Glosilex — reclaim disk space after the corpus refresh
--
-- Run in the Supabase SQL Editor, section by section.
-- ============================================================================
--
-- WHY THE DATABASE GREW WHILE THE CORPUS SHRANK
--
-- The corpus went from 27,212 chunks to 15,948, yet the database reports
-- 0.537 GB — over the 0.5 GB free-tier limit. Both facts are true.
--
-- PostgreSQL does not hand disk space back to the operating system when you
-- DELETE. It marks the rows dead and leaves the space inside the table for
-- reuse. Across the refresh roughly 25,000 rows were deleted — the whole old
-- Entity List, the old Part 774, and the superseded copy of every other
-- document. Each of those rows carried a 768-dimension vector, about 3 KB
-- before the text and the index entry. That is well over 100 MB of corpses
-- sitting inside a table that now holds far less live data.
--
-- The pgvector index bloats the same way: entries for deleted rows are not
-- removed until the index is rebuilt.
--
-- So the fix is not to delete more. It is to compact what is already there.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1 — See where the space actually is. Read this before changing anything.
-- ---------------------------------------------------------------------------
SELECT
  relname                                          AS object,
  pg_size_pretty(pg_total_relation_size(relid))    AS total_size,
  pg_size_pretty(pg_relation_size(relid))          AS table_only,
  pg_size_pretty(pg_indexes_size(relid))           AS indexes,
  n_live_tup                                       AS live_rows,
  n_dead_tup                                       AS dead_rows,
  CASE WHEN n_live_tup > 0
       THEN round(100.0 * n_dead_tup / n_live_tup, 1)
       ELSE NULL END                               AS pct_dead
FROM pg_stat_user_tables
JOIN pg_class c ON c.oid = relid
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;

-- A high dead_rows figure on regulatory_chunks is the whole story.
-- Anything above roughly 20% dead is worth compacting.


-- ---------------------------------------------------------------------------
-- STEP 2 — Compact the table. THIS IS THE ONE THAT RECLAIMS SPACE.
--
-- VACUUM FULL rewrites the table from scratch, keeping only live rows, and
-- returns the freed space to the operating system. Plain VACUUM does not — it
-- only marks space reusable inside the file, which does not reduce what
-- Supabase bills you for.
--
-- IT TAKES AN EXCLUSIVE LOCK. Nothing can read or write regulatory_chunks
-- while it runs, so the live app will error for the duration. On ~16,000 rows
-- expect seconds to a minute, not hours. Do it when nobody is demoing.
--
-- Run these ONE AT A TIME. VACUUM cannot run inside a transaction block, and
-- pasting several statements together may make the editor wrap them in one.
-- ---------------------------------------------------------------------------

VACUUM FULL regulatory_chunks;

-- The vector index is rebuilt by VACUUM FULL, but the smaller tables are worth
-- doing too — the agent has been writing to ingestion_runs on every run.

VACUUM FULL ingestion_runs;

VACUUM FULL corpus_registry;


-- ---------------------------------------------------------------------------
-- STEP 3 — Confirm it worked. Re-run the STEP 1 query.
--
-- Expect dead_rows near zero and total_size substantially smaller. Then check
-- the Supabase dashboard: Settings -> Usage -> Database size. The figure there
-- can lag by a few minutes.
-- ---------------------------------------------------------------------------


-- ============================================================================
-- IF YOU ARE STILL OVER 0.5 GB AFTER COMPACTING
--
-- Look at what is genuinely large rather than deleting at random. In order of
-- how much space they free per unit of regret:
--
--   1. BIS_Entity_List_Part744 — 3,370 chunks, and the least useful vectors in
--      the corpus. Semantic search cannot answer "is this exact company
--      listed"; that is a lookup, not a similarity problem. Dropping it costs
--      little today and frees roughly 10 MB.
--
--        DELETE FROM regulatory_chunks WHERE document_name = 'BIS_Entity_List_Part744';
--        UPDATE corpus_registry SET is_active = false, chunk_count = 0
--        WHERE document_name = 'BIS_Entity_List_Part744';
--        VACUUM FULL regulatory_chunks;
--
--   2. Old audit rows, once they are older than you would ever review:
--
--        DELETE FROM ingestion_runs WHERE run_started_at < now() - interval '30 days';
--
--   3. The empty legacy tables from before the agent existed —
--      compliance_sessions, compliance_reports — hold almost nothing but can
--      be dropped if you are certain nothing reads them.
--
-- Do NOT reduce the embedding dimensions to save space. Every vector in the
-- corpus is 768, the column is vector(768), and a mixed corpus produces
-- meaningless similarity scores. That is not a saving, it is a silent
-- corruption.
-- ============================================================================
