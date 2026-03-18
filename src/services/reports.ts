import { getSupabase } from './supabase';

export async function saveSession(
  sessionId: string,
  module: string,
  question: string,
  answer: string,
  jurisdiction: string[],
  riskRating: string,
  citations: any,
  dualFlag: boolean
) {
  const supabase = getSupabase();
  const { error } = await supabase.from('compliance_sessions').insert({
    session_id: sessionId,
    module,
    question,
    answer,
    jurisdiction,
    risk_rating: riskRating,
    citations,
    dual_flag: dualFlag
  });

  if (error) {
    console.error('Error saving session:', error);
  }
}

export async function saveReport(
  reportId: string,
  sessionId: string,
  module: string,
  reportJson: any,
  shareToken: string
) {
  const supabase = getSupabase();
  const { error } = await supabase.from('compliance_reports').insert({
    report_id: reportId,
    session_id: sessionId,
    module,
    report_json: reportJson,
    share_token: shareToken
  });

  if (error) {
    console.error('Error saving report:', error);
    throw error;
  }
}

export async function getReportByToken(token: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('compliance_reports')
    .select('*')
    .eq('share_token', token)
    .single();

  if (error) {
    console.error('Error fetching report:', error);
    throw error;
  }
  return data;
}
