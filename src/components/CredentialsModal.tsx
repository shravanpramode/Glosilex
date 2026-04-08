import React, { useState } from 'react';
import { saveCredentials } from '../utils/session';

interface Props {
  onComplete: () => void;
}

export const CredentialsModal: React.FC<Props> = ({ onComplete }) => {
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (supabaseUrl && supabaseKey) {
      saveCredentials(supabaseUrl, supabaseKey);
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Welcome to Silex</h2>
        <p className="text-slate-600 mb-6">Enter your credentials to start. These are stored securely in your browser session only.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="supabaseUrl" className="block text-sm font-medium text-slate-700 mb-1">Supabase Project URL</label>
            <input 
              id="supabaseUrl"
              type="url" 
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
              value={supabaseUrl}
              onChange={e => setSupabaseUrl(e.target.value)}
              placeholder="https://xyz.supabase.co"
            />
          </div>
          <div>
            <label htmlFor="supabaseKey" className="block text-sm font-medium text-slate-700 mb-1">Supabase Anon Key</label>
            <input 
              id="supabaseKey"
              type="password" 
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
              value={supabaseKey}
              onChange={e => setSupabaseKey(e.target.value)}
              placeholder="eyJh..."
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-indigo-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors mt-6 min-h-[44px]"
          >
            Start Silex &rarr;
          </button>
        </form>
      </div>
    </div>
  );
};
