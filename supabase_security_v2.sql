-- ============================================================================
-- Glosilex — Supabase Security v2  (REPLACES supabase_security.sql)
-- ============================================================================
--
-- WHY THIS FILE EXISTS
-- --------------------
-- supabase_security.sql (v1) enabled RLS on all 8 tables, but every policy was
-- written for a `authenticated` role / a non-NULL auth.uid().
--
-- Glosilex has NO login. The browser always talks to Supabase as the `anon`
-- role, and auth.uid() is always NULL. In Postgres RLS:
--
--     auth.uid()::text = user_id   →   NULL = NULL   →   NULL   →   DENY
--     ... TO authenticated          →   anon is not authenticated → DENY
--
-- So v1 silently produced TWO failures:
--   1. Every INSERT was rejected  → nothing saved since 2026-05-26.
--   2. regulatory_chunks SELECT was rejected → hybrid_search (SECURITY INVOKER)
--      returned 0 rows → THE RAG PIPELINE RETURNED ZERO CHUNKS IN PRODUCTION.
--
-- Verified 2026-08-25:
--     service_role sees 27,212 rows in regulatory_chunks
--     anon         sees      0 rows
--
-- THE FIX (two parts — do them in order)
-- --------------------------------------
-- STEP 1 — In the Supabase Dashboard, turn ON anonymous sign-in:
--          Authentication → Sign In / Providers → Anonymous sign-ins → Enable
--          This lets the browser get a real JWT with a real auth.uid()
--          WITHOUT asking the user to create an account.
--
-- STEP 2 — Run this entire file in the SQL Editor.
--
-- STEP 3 — Deploy the matching app change (supabase.ts calls
--          signInAnonymously() before any query). Without STEP 3 the app is
--          still the `anon` role and the user-scoped policies below will
--          (correctly) keep denying.
--
-- If you cannot enable anonymous sign-in, see BREAK GLASS at the bottom.
-- ============================================================================


-- ============================================================================
-- 1. RLS on, on every table
-- ============================================================================
ALTER TABLE regulatory_chunks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE icp_results             ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_reports      ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 2. regulatory_chunks — THE CRITICAL FIX
--
-- This is published government regulatory text (SCOMET, EAR, CHIPS Act, BIS).
-- It is not user data and it is not secret. Gating it behind `authenticated`
-- is what killed retrieval.
--
-- Readable by anon AND authenticated. Writable by NOBODY from the browser —
-- ingestion happens server-side with the service_role key, which bypasses RLS.
-- ============================================================================
DROP POLICY IF EXISTS "Regulatory chunks readable by authenticated users" ON regulatory_chunks;
DROP POLICY IF EXISTS "Regulatory corpus is public read"                  ON regulatory_chunks;

CREATE POLICY "Regulatory corpus is public read"
  ON regulatory_chunks
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policy = no client can ever write the corpus.


-- ============================================================================
-- 3. hybrid_search — make it SECURITY DEFINER
--
-- Belt and braces. Even if regulatory_chunks RLS is tightened again later,
-- retrieval keeps working, because the RPC is the only sanctioned read path.
-- search_path is pinned to prevent function-hijacking via a malicious schema.
-- ============================================================================
ALTER FUNCTION hybrid_search(vector(768), text, text[], int)
  SECURITY DEFINER
  SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION hybrid_search(vector(768), text, text[], int)
  TO anon, authenticated;


-- ============================================================================
-- 4. User-scoped result tables
--
-- After STEP 1 + STEP 3, every browser gets a real anonymous auth.uid().
-- Each visitor sees only their own rows. No cross-tenant leakage.
--
-- DELETE is deliberately omitted on all of these — compliance audit trail.
-- ============================================================================

-- ---- classification_results -------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own classification results"   ON classification_results;
DROP POLICY IF EXISTS "Users can insert their own classification results" ON classification_results;
DROP POLICY IF EXISTS "Users can update their own classification results" ON classification_results;

CREATE POLICY "Owner can read classification results"
  ON classification_results FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "Owner can insert classification results"
  ON classification_results FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

-- ---- icp_results ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own icp results"   ON icp_results;
DROP POLICY IF EXISTS "Users can insert their own icp results" ON icp_results;
DROP POLICY IF EXISTS "Users can update their own icp results" ON icp_results;

CREATE POLICY "Owner can read icp results"
  ON icp_results FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "Owner can insert icp results"
  ON icp_results FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

-- ---- contract_results -------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own contract results"   ON contract_results;
DROP POLICY IF EXISTS "Users can insert their own contract results" ON contract_results;
DROP POLICY IF EXISTS "Users can update their own contract results" ON contract_results;

CREATE POLICY "Owner can read contract results"
  ON contract_results FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "Owner can insert contract results"
  ON contract_results FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

-- ---- conversations ----------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can insert conversations"            ON conversations;
DROP POLICY IF EXISTS "Authenticated users can read conversations" ON conversations;

CREATE POLICY "Owner can read conversations"
  ON conversations FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "Owner can insert conversations"
  ON conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

-- ---- compliance_sessions (no user_id column — session scoped) ---------------
DROP POLICY IF EXISTS "Authenticated users can insert compliance sessions" ON compliance_sessions;

CREATE POLICY "Authenticated can insert compliance sessions"
  ON compliance_sessions FOR INSERT TO authenticated
  WITH CHECK (true);


-- ============================================================================
-- 5. reports — owner access + SAFE share links
--
-- v1 had:  CREATE POLICY ... FOR SELECT USING (share_token IS NOT NULL);
--
-- Every row has a share_token, so that policy let ANY anonymous visitor read
-- EVERY report in the table with a single unfiltered SELECT. That is a real
-- data leak, and it is the only reason `reports` appeared to still "work".
--
-- Replaced with: owner-only direct access + a SECURITY DEFINER function that
-- resolves exactly one report, and only when the caller already knows the
-- unguessable UUID token.
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own reports"        ON reports;
DROP POLICY IF EXISTS "Public can view reports via share token" ON reports;
DROP POLICY IF EXISTS "Users can insert their own reports"      ON reports;
DROP POLICY IF EXISTS "Users can update their own reports"      ON reports;

CREATE POLICY "Owner can read reports"
  ON reports FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "Owner can insert reports"
  ON reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE OR REPLACE FUNCTION get_report_by_token(token text)
RETURNS TABLE (report_json jsonb, synthesized_summary text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.report_json, r.synthesized_summary
  FROM reports r
  WHERE r.share_token = token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_report_by_token(text) TO anon, authenticated;

-- ---- compliance_reports -----------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read compliance reports"   ON compliance_reports;
DROP POLICY IF EXISTS "Public can read compliance reports via token"      ON compliance_reports;
DROP POLICY IF EXISTS "Authenticated users can insert compliance reports" ON compliance_reports;

CREATE POLICY "Authenticated can read compliance reports"
  ON compliance_reports FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert compliance reports"
  ON compliance_reports FOR INSERT TO authenticated
  WITH CHECK (true);


-- ============================================================================
-- 6. VERIFY — run this after the above. Every line should read PASS.
-- ============================================================================
-- SELECT 'corpus visible to anon'  AS check,
--        CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
-- FROM regulatory_chunks;
--
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd;


-- ============================================================================
-- BREAK GLASS — only if you cannot enable anonymous sign-in
-- ----------------------------------------------------------------------------
-- This makes the result tables writable and readable by the raw `anon` role.
-- It restores functionality but gives NO per-user isolation: anyone holding
-- the public anon key can read every row. Acceptable for a throwaway demo,
-- NOT acceptable once real compliance data is in the table.
--
-- Uncomment only as a last resort:
--
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY['classification_results','icp_results',
--                            'contract_results','reports','conversations',
--                            'compliance_sessions','compliance_reports']
--   LOOP
--     EXECUTE format('DROP POLICY IF EXISTS "demo open insert" ON %I', t);
--     EXECUTE format('CREATE POLICY "demo open insert" ON %I
--                     FOR INSERT TO anon, authenticated WITH CHECK (true)', t);
--     EXECUTE format('DROP POLICY IF EXISTS "demo open read" ON %I', t);
--     EXECUTE format('CREATE POLICY "demo open read" ON %I
--                     FOR SELECT TO anon, authenticated USING (true)', t);
--   END LOOP;
-- END $$;
-- ============================================================================
