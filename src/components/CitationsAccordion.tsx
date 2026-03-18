import React, { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';

interface Citation {
  document_name: string;
  section: string;
  clause_id: string;
}

interface Props {
  citations: Citation[];
}

export const CitationsAccordion: React.FC<Props> = ({ citations }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">
            View Citations ({citations.length})
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 py-3 border-t border-slate-200">
          <ul className="space-y-2">
            {citations.map((citation, idx) => (
              <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                <span className="font-mono text-xs text-slate-400 mt-0.5">[{idx + 1}]</span>
                <div>
                  <span className="font-semibold text-slate-800">{citation.document_name}</span>
                  {citation.section && <span className="text-slate-500">, {citation.section}</span>}
                  {citation.clause_id && <span className="text-slate-500">, Clause {citation.clause_id}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
