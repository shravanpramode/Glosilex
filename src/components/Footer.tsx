import React from 'react';
import { Shield } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-indigo-500" />
            <span className="font-semibold text-white">SemiShield</span>
            <span className="text-sm">| Compliance Intelligence for the Semiconductor Age</span>
          </div>
          
          <div className="flex gap-6 text-sm">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
        
        <div className="mt-8 text-center text-xs border-t border-slate-800 pt-8">
          <p className="mb-2">Powered by Google Gemini + Supabase pgvector</p>
          <p className="text-slate-500">
            ⚠️ LEGAL DISCLAIMER: SemiShield is an AI-generated tool for informational purposes only. 
            It does not constitute legal advice. Verify all compliance determinations with a qualified 
            export control attorney before making shipping, licensing, or contractual decisions.
          </p>
        </div>
      </div>
    </footer>
  );
};
