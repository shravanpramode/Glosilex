import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronRight, BookOpen } from 'lucide-react';

interface Props {
  chunks?: any[];
}

const ChunkItem: React.FC<{ chunk: any; idx: number }> = ({ chunk, idx }) => {
  const [showText, setShowText] = useState(false);
  
  const cleanClause = chunk.clause_id?.replace(/^Clause\s*[:\-]?\s*/i, '').trim();
  const hasClause = cleanClause && cleanClause.toLowerCase() !== 'null' && cleanClause !== '';
  
  const formatSection = (section: string) => {
    if (!section || section.toLowerCase() === 'null') return "General";
    let clean = section.replace(/^Section\s*[:\-]?\s*/i, '').trim();
    
    const words = clean.split(/\s+/);
    const hasVowellessFragment = words.some(w => /^[A-Za-z]+$/.test(w) && !/[aeiouy]/i.test(w));
    
    if (clean.length < 6 || hasVowellessFragment) {
      return "General";
    }
    return clean;
  };

  const displaySection = formatSection(chunk.section);
  const content = chunk.content || chunk.text;
  const isCutOff = content && !/[.?!'"\]})]\s*$/.test(content);

  return (
    <li className="text-sm text-slate-600 flex items-start gap-2">
      <span className="font-mono text-xs text-slate-400 mt-0.5 shrink-0">[{idx + 1}]</span>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <div className="font-semibold text-slate-800">
            {displaySection}
            {hasClause && <span className="font-normal text-slate-500">, Clause {cleanClause}</span>}
          </div>
          
          {content && content.trim() !== '' && (
            <button 
              onClick={() => setShowText(!showText)}
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium focus:outline-none transition-colors shrink-0 mt-0.5"
            >
              {showText ? 'Hide text ▲' : 'View text ▼'}
            </button>
          )}
        </div>
        
        {content && content.trim() !== '' && (showText || true) && (
          <div className={`mt-2 p-3 bg-slate-100 rounded text-xs text-slate-700 font-mono whitespace-pre-wrap border border-slate-200 ${!showText ? 'hidden print:block' : ''}`}>
            {content}
            {isCutOff && (
              <span className="block mt-2 text-slate-400 italic font-sans">
                Excerpt — full text available in source document
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
};

const DocumentGroup: React.FC<{ documentName: string; chunks: any[] }> = ({ documentName, chunks }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors focus:outline-none"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-left">{documentName} ({chunks.length} excerpt{chunks.length === 1 ? '' : 's'})</span>
        </div>
      </button>
      
      {(isOpen || true) && (
        <div className={`p-3 border-t border-slate-200 ${!isOpen ? 'hidden print:block' : ''}`}>
          <ul className="space-y-3">
            {chunks.map((chunk, idx) => (
              <ChunkItem key={idx} chunk={chunk} idx={idx} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const CitationsAccordion: React.FC<Props> = ({ chunks }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!chunks || chunks.length === 0) return null;

  const uniqueChunks = chunks.reduce((acc: any[], current) => {
    const content = (current.content || current.text || '').trim();
    const docName = (current.document_name || '').trim();
    
    const isDuplicate = acc.some(item => {
      const itemContent = (item.content || item.text || '').trim();
      const itemDocName = (item.document_name || '').trim();
      return itemContent === content && itemDocName === docName;
    });

    if (!isDuplicate) {
      acc.push(current);
    }
    return acc;
  }, []);

  const groupedChunks = uniqueChunks.reduce((acc: Record<string, any[]>, chunk) => {
    const docName = chunk.document_name || 'Unknown Document';
    if (!acc[docName]) {
      acc[docName] = [];
    }
    acc[docName].push(chunk);
    return acc;
  }, {});

  return (
    <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">
            View Citations ({uniqueChunks.length})
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {(isOpen || true) && (
        <div className={`px-4 py-3 border-t border-slate-200 ${!isOpen ? 'hidden print:block' : ''}`}>
          <div className="space-y-3">
            {Object.entries(groupedChunks).map(([docName, docChunks]) => (
              <DocumentGroup key={docName} documentName={docName} chunks={docChunks as any[]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
