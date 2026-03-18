import { createClient } from '@supabase/supabase-js';

let supabaseInstance: any = null;

export const getSupabase = () => {
  if (supabaseInstance) return supabaseInstance;
  
  let url = sessionStorage.getItem('SUPABASE_URL') 
    || import.meta.env.VITE_SUPABASE_URL 
    || import.meta.env.SUPABASE_URL 
    || process.env.SUPABASE_URL;
    
  let key = sessionStorage.getItem('SUPABASE_ANON_KEY') 
    || import.meta.env.VITE_SUPABASE_ANON_KEY 
    || import.meta.env.SUPABASE_ANON_KEY 
    || process.env.SUPABASE_ANON_KEY;

  if (url === 'MY_SUPABASE_URL') url = null;
  if (key === 'MY_SUPABASE_ANON_KEY') key = null;

  if (!url || !key) {
    throw new Error('Supabase credentials not found in session storage or environment.');
  }
  
  supabaseInstance = createClient(url, key);
  return supabaseInstance;
};

export const clearSupabaseInstance = () => {
  supabaseInstance = null;
};
