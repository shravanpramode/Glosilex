import { getSupabase } from '../services/supabase';

export const hasCredentials = () => {
  const geminiKey = process.env.GEMINI_API_KEY
    || import.meta.env.VITE_GEMINI_API_KEY 
    || import.meta.env.GEMINI_API_KEY;
    
  const supabaseUrl = sessionStorage.getItem('SUPABASE_URL') 
    || import.meta.env.VITE_SUPABASE_URL 
    || import.meta.env.SUPABASE_URL 
    || process.env.SUPABASE_URL;
    
  const supabaseKey = sessionStorage.getItem('SUPABASE_ANON_KEY') 
    || import.meta.env.VITE_SUPABASE_ANON_KEY 
    || import.meta.env.SUPABASE_ANON_KEY 
    || process.env.SUPABASE_ANON_KEY;

  const isValid = (val: string | null | undefined, placeholder: string) => {
    return !!val && val !== placeholder;
  };

  return (
    isValid(geminiKey, 'MY_GEMINI_API_KEY') &&
    isValid(supabaseUrl, 'MY_SUPABASE_URL') &&
    isValid(supabaseKey, 'MY_SUPABASE_ANON_KEY')
  );
};

export const saveCredentials = (supabaseUrl: string, supabaseAnonKey: string) => {
  sessionStorage.setItem('SUPABASE_URL', supabaseUrl);
  sessionStorage.setItem('SUPABASE_ANON_KEY', supabaseAnonKey);
};

export const clearCredentials = () => {
  sessionStorage.removeItem('SUPABASE_URL');
  sessionStorage.removeItem('SUPABASE_ANON_KEY');
};

export async function saveSession(
  module: string,
  question: string,
  answer: string,
  jurisdictions: string[],
  riskRating: string,
  citations: any,
  dualFlag: boolean
) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('compliance_sessions').insert({
    module,
    question,
    answer,
    jurisdictions,
    risk_rating: riskRating,
    citations,
    dual_flag: dualFlag
  }).select().single();

  if (error) {
    console.error('Error saving session:', error);
    throw error;
  }
  return data;
}

export async function saveReport(
  sessionId: string,
  module: string,
  reportJson: any
) {
  const supabase = getSupabase();
  const shareToken = crypto.randomUUID();
  
  const { error } = await supabase.from('compliance_reports').insert({
    session_id: sessionId,
    module,
    report_json: reportJson,
    share_token: shareToken
  });

  if (error) {
    console.error('Error saving report:', error);
    throw error;
  }
  
  return shareToken;
}
