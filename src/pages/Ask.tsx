import { callGemini } from '../lib/gemini';
import { GLOBAL_SYSTEM_PROMPT, QA_PROMPT } from '../lib/prompts';
import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, Paperclip, FileText, AlertTriangle, BookOpen, CheckCircle2, Menu, X } from 'lucide-react';
import { detectJurisdiction, retrieveChunks } from '../services/retrieval';
import { saveSession } from '../utils/session';
import { getSupabase } from '../services/supabase';
import { parseCitations } from '../utils/citations';
import { LoadingSteps } from '../components/LoadingSteps';
import { RiskBadge } from '../components/RiskBadge';
import { JurisdictionBadge } from '../components/JurisdictionBadge';
import { DualJurisdictionAlert } from '../components/DualJurisdictionAlert';
import { CitationsAccordion } from '../components/CitationsAccordion';
import { extractTextFromPdf } from '../utils/pdfParser';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  jurisdictions?: string[];
  riskRating?: string;
  confidence?: string;
  citations?: any[];
  dualFlag?: boolean;
  chunksUsed?: any[];
}

export const Ask: React.FC = () => {
  const location = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>(['SCOMET_INDIA', 'EAR_US']);
  const [uploadedFileText, setUploadedFileText] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Multi-turn state
  const [lastTopic, setLastTopic] = useState<string | null>(null);
  const [lastJurisdictions, setLastJurisdictions] = useState<string[]>([]);
  const [lastChunks, setLastChunks] = useState<any[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (location.state?.initialQuery) {
      setInput(location.state.initialQuery);
      // Clear the state so it doesn't trigger again on reload
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const exampleQuestions = [
    "Is a 7nm semiconductor fab tool controlled under SCOMET Category 6?",
    "What ECCN applies to a radiation-hardened FPGA with military specs?",
    "Does an IC designed in India but manufactured in the US need both SCOMET and EAR licenses?",
    "What are the penalties for violating US EAR export controls?",
    "Can I re-export a US-origin semiconductor to a UAE distributor without a license?",
    "Does a foreign national engineer accessing controlled EDA tools in India trigger deemed export rules?",
    "Is my NDA clause adequate for SCOMET-controlled technical data?",
    "What does an ICP need to include to satisfy DGFT requirements?"
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      try {
        setUploadedFileName(file.name);
        const text = await extractTextFromPdf(file);
        setUploadedFileText(text);
      } catch (error) {
        alert('Failed to parse PDF. Please try again or paste text.');
      }
    } else {
      alert('Please upload a PDF file.');
    }
  };

  const handleSubmit = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const userQuery = overrideQuery || input;
    if (!userQuery.trim()) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setIsLoading(true);
    setIsMobileMenuOpen(false);

    try {
      // Step 1: Detect Jurisdiction
      setLoadingSteps([
        'Embedding your query...',
        'Retrieving regulatory context...',
        'Analyzing with Gemini...',
        'Generating response...'
      ]);
      setCurrentStep(0);
      
      let targetJurisdictions = selectedJurisdictions;
      if (targetJurisdictions.length === 2) {
        targetJurisdictions = await detectJurisdiction(userQuery);
      }

      // Check if we can reuse previous chunks (multi-turn logic)
      // Simple heuristic for MVP: if jurisdictions match and we have previous chunks, 
      // check if the new query contains keywords from the last topic to decide if it's a follow-up.
      // A more robust way is to just check if it's a short follow-up (e.g., "what about penalties?")
      let chunksToUse = lastChunks;
      const jurisdictionsChanged = JSON.stringify(targetJurisdictions.sort()) !== JSON.stringify(lastJurisdictions.sort());
      const isShortFollowUp = userQuery.split(' ').length < 8;
      
      let finalChunks = [];
      let finalAnswer = '';

      if (!jurisdictionsChanged && lastChunks.length > 0 && isShortFollowUp) {
        // Reuse previous chunks
        setCurrentStep(2); // Skip retrieval steps
        finalChunks = lastChunks;
        
        const formattedContext = finalChunks.map((chunk: any) => 
          `[Source: ${chunk.document_name} | Section: ${chunk.section} | Clause: ${chunk.clause_id}]\n${chunk.content}`
        ).join('\n\n');

        setCurrentStep(3);
        
        // We need to call callGemini directly since we are skipping retrieval
                
        const systemPrompt = `${GLOBAL_SYSTEM_PROMPT}\n\n${QA_PROMPT}`;
        
        // Include previous topic for context
        const contextQuery = `Previous Topic: ${lastTopic}\nFollow-up Question: ${userQuery}`;
        finalAnswer = await callGemini(systemPrompt, contextQuery, formattedContext);
      } else {
        // Re-run retrieval
        setCurrentStep(1);
        
        const fullQuery = userQuery + (uploadedFileText ? `\n\nDocument Context: ${uploadedFileText.substring(0, 2000)}` : '');
        finalChunks = await retrieveChunks(fullQuery, targetJurisdictions, 12);
        
        setCurrentStep(2);
        
        const formattedContext = finalChunks.map((chunk: any) => 
          `[Source: ${chunk.document_name} | Section: ${chunk.section} | Clause: ${chunk.clause_id}]\n${chunk.content}`
        ).join('\n\n');

        const systemPrompt = `${GLOBAL_SYSTEM_PROMPT}\n\n${QA_PROMPT}`;
        finalAnswer = await callGemini(systemPrompt, userQuery, formattedContext);
        
        setCurrentStep(3);
      }

      // Parse metadata from answer
      const riskMatch = finalAnswer.match(/(🔴 HIGH RISK|🟠 MEDIUM RISK|🟢 LOW RISK)/);
      const confMatch = finalAnswer.match(/Confidence:\s*(\d+%?\s*—\s*(HIGH|MEDIUM|LOW))/i);
      const dualFlag = finalAnswer.includes('⚠️ DUAL JURISDICTION ALERT') &&
        !finalAnswer.includes('DUAL JURISDICTION ALERT: Not applicable') &&
        !finalAnswer.includes('DUAL JURISDICTION ALERT:** Not applicable');
      const citations = parseCitations(finalAnswer);

      const aiMessage: Message = {
        role: 'assistant',
        content: finalAnswer,
        jurisdictions: targetJurisdictions,
        riskRating: riskMatch ? riskMatch[1] : 'Unknown',
        confidence: confMatch ? confMatch[1] : 'Unknown',
        citations,
        dualFlag,
        chunksUsed: finalChunks
      };

      setMessages(prev => [...prev, aiMessage]);
      setLastJurisdictions(targetJurisdictions);
      setLastChunks(finalChunks);
      setLastTopic(userQuery);

      // Persist to conversations table
      const supabase = getSupabase();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || 'anonymous';
      
      try {
        await supabase.from('conversations').insert({
          user_id: userId,
          question: userQuery,
          answer: finalAnswer,
          chunks_used: finalChunks,
          jurisdictions: targetJurisdictions,
          created_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Failed to save to conversations table:', err);
      }

      // Also save to compliance_sessions for backward compatibility
      try {
        await saveSession(
          'qa',
          userQuery,
          finalAnswer,
          targetJurisdictions,
          riskMatch ? riskMatch[1] : 'Unknown',
          citations,
          dualFlag
        );
      } catch (err) {
        console.error('Failed to save session:', err);
      }

    } catch (error: any) {
      console.error('Q&A Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${error.message || 'Failed to generate response. Please check your API keys or try again.'}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleJurisdiction = (j: string) => {
    setSelectedJurisdictions(prev => 
      prev.includes(j) ? prev.filter(x => x !== j) : [...prev, j]
    );
  };

  const handleChipClick = (q: string) => {
    setInput(q);
    // Optionally auto-submit: handleSubmit(undefined, q);
  };

  // Format the answer text to render sections nicely
  const renderFormattedContent = (content: string) => {
    // Hide raw citations in text, show in accordion
    let displayContent = content.replace(/\[Source:[^\]]*\]/g, 
      (match) => {
        const parts = match.match(/Source: ([^|]+)\|[^|]+\| Clause: ([^\]]+)/);
        return parts ? `*(${parts[1].trim()}, ${parts[2].trim()})*` : '';
      });
    
    // Split by numbered sections for better rendering
    const sections = displayContent.split(/(?=\d\.\s+[A-Z\s]+:)/);
    
    if (sections.length <= 1) {
      return <div className="prose prose-sm max-w-none prose-slate whitespace-pre-wrap">{displayContent}</div>;
    }

    return (
      <div className="space-y-4">
        {sections.map((section, idx) => {
          if (!section.trim()) return null;
          
          // Check if it's a header section
          const match = section.match(/^(\d\.\s+([A-Z\s&]+):)([\s\S]*)$/);
          if (match) {
            const [, header, title, body] = match;
            return (
              <div key={idx} className="mb-2">
                <h4 className="font-bold text-slate-800 text-sm mb-1">{title.trim()}</h4>
                <div className="prose prose-sm max-w-none prose-slate whitespace-pre-wrap text-slate-700">
                  {body.trim()}
                </div>
              </div>
            );
          }
          
          return (
            <div key={idx} className="prose prose-sm max-w-none prose-slate whitespace-pre-wrap text-slate-700">
              {section.trim()}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] bg-slate-50 overflow-hidden relative">
      
      {/* Mobile Menu Toggle */}
      <div className="md:hidden bg-white border-b border-slate-200 p-3 flex justify-between items-center z-10">
        <span className="font-semibold text-slate-800 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-600" /> Q&A Copilot
        </span>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
          className="p-2 text-slate-600 bg-slate-100 rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar (Collapsible on mobile) */}
      <div className={`${isMobileMenuOpen ? 'block' : 'hidden'} md:flex absolute md:relative z-20 w-full md:w-80 bg-white border-r border-slate-200 flex-col h-full shadow-xl md:shadow-none transition-all`}>
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Knowledge Base</h2>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> SCOMET List 2025 🇮🇳
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> FTDR Act 1992 🇮🇳
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> EAR CCL Part 774 🇺🇸
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> BIS Entity List 🇺🇸
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Jurisdiction Scope</h3>
          <div className="flex flex-col gap-2">
            <label htmlFor="askScomet" className="flex items-center gap-2 cursor-pointer min-h-[44px]">
              <input 
                id="askScomet"
                type="checkbox" 
                checked={selectedJurisdictions.includes('SCOMET_INDIA')}
                onChange={() => toggleJurisdiction('SCOMET_INDIA')}
                className="rounded text-indigo-600 focus:ring-indigo-500 h-5 w-5"
              />
              <span className="text-sm text-slate-700">🇮🇳 India SCOMET</span>
            </label>
            <label htmlFor="askEar" className="flex items-center gap-2 cursor-pointer min-h-[44px]">
              <input 
                id="askEar"
                type="checkbox" 
                checked={selectedJurisdictions.includes('EAR_US')}
                onChange={() => toggleJurisdiction('EAR_US')}
                className="rounded text-indigo-600 focus:ring-indigo-500 h-5 w-5"
              />
              <span className="text-sm text-slate-700">🇺🇸 US EAR/BIS</span>
            </label>
          </div>
        </div>

        <div className="p-4 border-b border-slate-200 flex-1">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Document Context</h3>
          <input 
            id="askFileUpload"
            type="file" 
            accept=".pdf" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:border-indigo-400 transition-colors min-h-[44px]"
          >
            <Paperclip className="h-4 w-4" />
            {uploadedFileName ? 'Change Document' : 'Upload PDF Document'}
          </button>
          {uploadedFileName && (
            <div className="mt-2 flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 p-2 rounded">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{uploadedFileName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative h-full w-full">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-32">
          {messages.length === 0 && !isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-3xl mx-auto">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                <BookOpen className="h-8 w-8 text-indigo-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Compliance Q&A Copilot</h2>
              <p className="text-slate-500 mb-8 max-w-lg">
                Ask any question about SCOMET or EAR regulations. I will search the official documents and provide a cited, risk-rated answer.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                {exampleQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleChipClick(q)}
                    className="text-sm bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700 p-3 rounded-xl transition-colors shadow-sm text-left flex items-start gap-2 min-h-[44px]"
                  >
                    <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[95%] md:max-w-[85%] rounded-2xl p-5 ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-br-none shadow-md' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                }`}>
                  {msg.role === 'assistant' && (
                    <div className="mb-4 flex flex-wrap gap-2 items-center pb-3 border-b border-slate-100">
                      {msg.jurisdictions?.map(j => <JurisdictionBadge key={j} jurisdiction={j} />)}
                      {msg.riskRating && <RiskBadge level={msg.riskRating} />}
                      {msg.confidence && (
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                          Conf: {msg.confidence}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {msg.dualFlag && <div className="mb-4"><DualJurisdictionAlert /></div>}

                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    renderFormattedContent(msg.content)
                  )}

                  {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                    <div className="mt-4 pt-2">
                      <CitationsAccordion citations={msg.citations} />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-5 shadow-sm max-w-[85%]">
                <LoadingSteps steps={loadingSteps} currentStepIndex={currentStep} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Sticky Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200">
          <form onSubmit={(e) => handleSubmit(e)} className="max-w-4xl mx-auto relative flex items-end gap-2">
            <div className="relative flex-1">
              <label htmlFor="askInput" className="sr-only">Ask a compliance question</label>
              <textarea
                id="askInput"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Ask a compliance question... (Press Enter to send)"
                className="w-full pl-4 pr-12 py-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm resize-none min-h-[52px] max-h-32"
                rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 4) : 1}
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              aria-label="Send message"
              disabled={!input.trim() || isLoading}
              className="p-3 h-[52px] w-[52px] flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shrink-0"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
          <div className="text-center mt-2 max-w-4xl mx-auto">
            <p className="text-[10px] text-slate-500 text-center">
              ⚠️ LEGAL DISCLAIMER: SemiShield is an AI-generated tool for informational purposes only. It does not constitute legal advice. Verify all compliance determinations with a qualified export control attorney before making shipping, licensing, or contractual decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
