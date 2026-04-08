-- ============================================================
-- Glosilex Supabase Security Policies (RLS)
-- Schema-Verified Final Version — April 2026
--
-- Verified against actual Supabase schema:
--   ✓ user_id is TEXT in all tables → auth.uid()::text is correct
--   ✓ conversations.user_id confirmed (with underscore)
--   ✓ All 8 tables confirmed present in schema
--   ✓ compliance_reports & compliance_sessions added (were missing)
--   ✓ Anonymous-user-safe policies for conversations (no auth yet)
--
-- ⚠️  IMPORTANT BEFORE RUNNING:
--   Currently all conversations rows have user_id = 'anonymous'
--   because Glosilex has no user login system yet.
--   The conversations policies below are written to be
--   permissive (allow inserts from all roles) so existing
--   data flow is not broken. Tighten once auth is added.
-- ============================================================


-- ============================================================
-- 1. Enable RLS on ALL 8 tables
-- ============================================================
ALTER TABLE classification_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE icp_results             ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_chunks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_sessions     ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. regulatory_chunks — authenticated read-only
--    TO authenticated prevents unauthenticated/anonymous access
-- ============================================================
DROP POLICY IF EXISTS "Regulatory chunks readable by authenticated users" ON regulatory_chunks;

CREATE POLICY "Regulatory chunks readable by authenticated users"
  ON regulatory_chunks
  FOR SELECT TO authenticated
  USING (true);


-- ============================================================
-- 3. conversations
--    No user auth yet — all rows have user_id = 'anonymous'
--    Using permissive policies until auth is implemented.
--    TODO: Once login is added, tighten to:
--      USING (auth.uid()::text = user_id)
-- ============================================================
DROP POLICY IF EXISTS "Anyone can insert conversations"           ON conversations;
DROP POLICY IF EXISTS "Authenticated users can read conversations" ON conversations;

CREATE POLICY "Anyone can insert conversations"
  ON conversations
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read conversations"
  ON conversations
  FOR SELECT TO authenticated
  USING (true);


-- ============================================================
-- 4. classification_results
--    user_id is TEXT — auth.uid()::text cast is correct
--    DELETE intentionally omitted — compliance audit trail
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own classification results"   ON classification_results;
DROP POLICY IF EXISTS "Users can insert their own classification results" ON classification_results;
DROP POLICY IF EXISTS "Users can update their own classification results" ON classification_results;

CREATE POLICY "Users can view their own classification results"
  ON classification_results
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own classification results"
  ON classification_results
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own classification results"
  ON classification_results
  FOR UPDATE
  USING (auth.uid()::text = user_id);


-- ============================================================
-- 5. icp_results
--    DELETE intentionally omitted — compliance audit trail
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own icp results"   ON icp_results;
DROP POLICY IF EXISTS "Users can insert their own icp results" ON icp_results;
DROP POLICY IF EXISTS "Users can update their own icp results" ON icp_results;

CREATE POLICY "Users can view their own icp results"
  ON icp_results
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own icp results"
  ON icp_results
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own icp results"
  ON icp_results
  FOR UPDATE
  USING (auth.uid()::text = user_id);


-- ============================================================
-- 6. contract_results
--    DELETE intentionally omitted — compliance audit trail
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own contract results"   ON contract_results;
DROP POLICY IF EXISTS "Users can insert their own contract results" ON contract_results;
DROP POLICY IF EXISTS "Users can update their own contract results" ON contract_results;

CREATE POLICY "Users can view their own contract results"
  ON contract_results
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own contract results"
  ON contract_results
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own contract results"
  ON contract_results
  FOR UPDATE
  USING (auth.uid()::text = user_id);


-- ============================================================
-- 7. reports
--    Has both user_id (ownership) and share_token (public link)
--    Two SELECT policies: owner access + share-token public access
--    DELETE intentionally omitted — compliance audit trail
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own reports"        ON reports;
DROP POLICY IF EXISTS "Public can view reports via share token" ON reports;
DROP POLICY IF EXISTS "Users can insert their own reports"      ON reports;
DROP POLICY IF EXISTS "Users can update their own reports"      ON reports;

CREATE POLICY "Users can view their own reports"
  ON reports
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Public can view reports via share token"
  ON reports
  FOR SELECT
  USING (share_token IS NOT NULL);

CREATE POLICY "Users can insert their own reports"
  ON reports
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own reports"
  ON reports
  FOR UPDATE
  USING (auth.uid()::text = user_id);


-- ============================================================
-- 8. compliance_reports
--    NO user_id column — session-based, share_token for links
--    Authenticated users can read and insert.
--    Public can read via share_token (shared report links).
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read compliance reports"   ON compliance_reports;
DROP POLICY IF EXISTS "Public can read compliance reports via token"      ON compliance_reports;
DROP POLICY IF EXISTS "Authenticated users can insert compliance reports" ON compliance_reports;

CREATE POLICY "Authenticated users can read compliance reports"
  ON compliance_reports
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Public can read compliance reports via token"
  ON compliance_reports
  FOR SELECT
  USING (share_token IS NOT NULL);

CREATE POLICY "Authenticated users can insert compliance reports"
  ON compliance_reports
  FOR INSERT TO authenticated
  WITH CHECK (true);


-- ============================================================
-- 9. compliance_sessions
--    NO user_id column — write-only from app perspective
--    Authenticated users can insert. No SELECT needed.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can insert compliance sessions" ON compliance_sessions;

CREATE POLICY "Authenticated users can insert compliance sessions"
  ON compliance_sessions
  FOR INSERT TO authenticated
  WITH CHECK (true);


-- ============================================================
-- DONE — 8 tables, 20 policies, all idempotent (DROP IF EXISTS)
--
-- After running, verify in Supabase Dashboard:
--   Authentication → Policies
--   Every table should show its policies listed.
--
-- TODO when user authentication is added to Glosilex:
--   Update conversations policies to user_id-based:
--     FOR INSERT WITH CHECK (auth.uid()::text = user_id)
--     FOR SELECT USING (auth.uid()::text = user_id)
-- ============================================================
