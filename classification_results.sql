CREATE TABLE IF NOT EXISTS classification_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text,
  product_input text,
  extracted_specs jsonb,
  scomet_finding text,
  ear_finding text,
  cross_jurisdiction_note text,
  action_plan text,
  overall_risk text,
  created_at timestamptz DEFAULT now()
);
