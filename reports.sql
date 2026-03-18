CREATE TABLE IF NOT EXISTS reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text,
  module_type text,
  report_json jsonb NOT NULL,
  synthesized_summary text,
  share_token text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);
