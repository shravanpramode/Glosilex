-- ============================================================================
-- Glosilex — post-deploy verification
--
-- Run this in the Supabase SQL Editor AFTER you have:
--   1. enabled Anonymous sign-ins
--   2. run supabase_security_v2.sql
--   3. deployed the fix branch and used the live app once
--
-- Every check prints PASS or FAIL. All five must say PASS.
-- ============================================================================


-- ── CHECK 1 ─────────────────────────────────────────────────────────────────
-- The corpus is readable by the roles the browser actually uses.
-- This is the one that was silently returning zero rows in production.
SELECT
  'corpus readable by anon/authenticated' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'regulatory_chunks'
      AND cmd        = 'SELECT'
      AND ('anon' = ANY(roles) OR 'authenticated' = ANY(roles))
  ) THEN 'PASS' ELSE 'FAIL — rerun supabase_security_v2.sql' END AS result;


-- ── CHECK 2 ─────────────────────────────────────────────────────────────────
-- hybrid_search must be SECURITY DEFINER, otherwise it inherits the caller's
-- permissions and any future tightening of the corpus silently kills retrieval.
SELECT
  'hybrid_search is SECURITY DEFINER' AS check_name,
  CASE WHEN p.prosecdef THEN 'PASS' ELSE 'FAIL — rerun section 3 of supabase_security_v2.sql' END AS result
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'hybrid_search';


-- ── CHECK 3 ─────────────────────────────────────────────────────────────────
-- The share-link RPC the app now calls must exist, or /report?token=... breaks.
SELECT
  'get_report_by_token() exists' AS check_name,
  CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL — rerun section 5 of supabase_security_v2.sql' END AS result
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_report_by_token';


-- ── CHECK 4 ─────────────────────────────────────────────────────────────────
-- Anonymous sign-in is actually producing users. If this is 0 after you have
-- loaded the deployed app, the dashboard toggle is still off.
SELECT
  'anonymous users exist' AS check_name,
  count(*)::text || ' anonymous user(s)' AS detail,
  CASE WHEN count(*) > 0 THEN 'PASS'
       ELSE 'FAIL — Dashboard > Authentication > Sign In / Providers > Anonymous sign-ins' END AS result
FROM auth.users
WHERE is_anonymous = true;


-- ── CHECK 5 ─────────────────────────────────────────────────────────────────
-- The actual proof: something was written today, with a real uid attached.
-- Run a classification in the live app first, then run this.
SELECT
  'writes are landing again' AS check_name,
  count(*)::text || ' row(s) written in the last hour' AS detail,
  CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL — no new rows; check the browser console' END AS result
FROM (
  SELECT created_at, user_id FROM classification_results
  UNION ALL SELECT created_at, user_id FROM icp_results
  UNION ALL SELECT created_at, user_id FROM contract_results
  UNION ALL SELECT created_at, user_id FROM conversations
) w
WHERE created_at > now() - interval '1 hour';


-- ============================================================================
-- Context: the last write before the fix. Should read 2026-05-26.
-- After a successful verification you will see a second, much newer row.
-- ============================================================================
SELECT 'classification_results' AS tbl, max(created_at) AS last_write, count(*) AS rows FROM classification_results
UNION ALL SELECT 'icp_results',        max(created_at), count(*) FROM icp_results
UNION ALL SELECT 'contract_results',   max(created_at), count(*) FROM contract_results
UNION ALL SELECT 'conversations',      max(created_at), count(*) FROM conversations
UNION ALL SELECT 'reports',            max(created_at), count(*) FROM reports
ORDER BY tbl;


-- ============================================================================
-- Confirm the new rows carry a real uid rather than NULL or 'anonymous'.
-- A uuid here is what proves the anonymous session is wired through correctly.
-- ============================================================================
SELECT user_id, product_input, created_at
FROM classification_results
ORDER BY created_at DESC
LIMIT 3;
