-- ============================================================================
-- Glosilex — fix the past_classifications tool
--
-- Run in the Supabase SQL Editor, then re-import the workflow.
-- ============================================================================
--
-- THE BUG
--
-- The HTTP Request Tool sent this body template:
--
--     {"changed_clauses": {changed_clauses}}
--
-- n8n parses the body as JSON *before* substituting the placeholder. That
-- template is not valid JSON — where a value belongs there is a bare `{` — so
-- it failed with "Could not replace placeholders in body: Expected ',' or '}'
-- after property value at position 23" before the tool ever ran.
--
-- THE FIX
--
-- Put the placeholder inside the quotes:
--
--     {"changed_clauses": "{changed_clauses}"}
--
-- Now the template is valid JSON whatever the model fills in, and a malformed
-- model output degrades to "no matches" instead of crashing the node. The
-- trade-off is that the argument arrives as a string, so the function has to
-- split it — which is what this migration does.
--
-- This is the safer shape regardless. Asking an LLM to emit a syntactically
-- perfect JSON array of forty clause identifiers is a coin flip; asking it for
-- a comma-separated list is not.
-- ============================================================================


-- The old array-typed version has to go: leaving both would give PostgREST two
-- overloads of the same name and it cannot tell which one you meant.
DROP FUNCTION IF EXISTS find_affected_classifications(text[]);


CREATE OR REPLACE FUNCTION find_affected_classifications(changed_clauses text)
RETURNS TABLE (
  id uuid,
  user_id text,
  product_input text,
  overall_risk text,
  created_at timestamptz,
  matched_clause text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT c.id, c.user_id, c.product_input, c.overall_risk, c.created_at, cl AS matched_clause
  FROM classification_results c
  CROSS JOIN unnest(string_to_array(changed_clauses, ',')) AS raw
  CROSS JOIN LATERAL (SELECT btrim(raw)) AS t(cl)
  WHERE btrim(raw) <> ''
    AND (c.scomet_finding ILIKE '%' || btrim(raw) || '%'
      OR c.ear_finding    ILIKE '%' || btrim(raw) || '%')
  ORDER BY c.created_at DESC
  LIMIT 200;
$fn$;

-- Agent-only. The browser must never be able to enumerate other users' results.
REVOKE EXECUTE ON FUNCTION find_affected_classifications(text) FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- Check it works. Part 736's amendment touched Supplement No. 1, so try a
-- clause you know is in the corpus. An empty result is a valid answer — it
-- means no past classification cited those clauses.
-- ---------------------------------------------------------------------------
-- SELECT * FROM find_affected_classifications('736.2, 774.1 ,3A001');

-- Sanity check the splitting itself, independent of any data:
-- SELECT btrim(x) FROM unnest(string_to_array('736.2, 774.1 ,3A001', ',')) AS x;
--   expected: 736.2 / 774.1 / 3A001
