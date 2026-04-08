CREATE TABLE IF NOT EXISTS contract_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text,
  contract_name text,
  review_scope text[],
  jurisdictions text[],
  clause_audit jsonb,
  generated_clauses jsonb,
  overall_risk text,
  risk_score integer,
  confidence_score float,
  confidence_note text,
  summary text,
  created_at timestamptz DEFAULT now()
);