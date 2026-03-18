CREATE TABLE IF NOT EXISTS icp_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text,
  company_name text,
  icp_provided boolean DEFAULT false,
  gap_analysis jsonb,
  doc_flow jsonb,
  overall_score float,
  scomet_score float,
  ear_score float,
  created_at timestamptz DEFAULT now()
);
