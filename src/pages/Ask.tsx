import { callGemini } from '../lib/gemini';
import { GLOBAL_SYSTEM_PROMPT, QA_PROMPT } from '../lib/prompts';
import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Send, Paperclip, FileText, BookOpen,
  ChevronLeft, ChevronRight, ArrowLeft,
  MessageSquare, Zap, Globe, Shield, X, Menu,
  Database, Layers, Activity, AlertTriangle,
  Search, Scale, FileWarning, RefreshCw, Users, BookMarked
} from 'lucide-react';
import { detectJurisdiction, retrieveChunks } from '../services/retrieval';
import { generateHypotheticalDoc } from '../lib/hyde';
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

function buildAskQuery(userQuery: string): string {
  const t = userQuery.toLowerCase();
  const parts = [userQuery];
  if (t.includes('fpga') || t.includes('programmable') || t.includes('logic device'))
    parts.push('ECCN 3A001.a.7 SCOMET 8A301 field programmable logic device control threshold I/O count');
  if (t.includes('gan') || t.includes('amplifier') || t.includes('rf') || t.includes('microwave'))
    parts.push('ECCN 3A001.b.4 GaN GaAs RF microwave power amplifier frequency SCOMET 3A');
  if (t.includes('scomet') || t.includes('india') || t.includes('dgft') || t.includes('category'))
    parts.push('SCOMET Category 8A 6A 3A controlled item license DGFT India Foreign Trade Policy');
  if (t.includes('eccn') || t.includes('ear') || t.includes('bis') || t.includes('export control'))
    parts.push('EAR Commerce Control List ECCN BIS Bureau of Industry Security license required');
  if (t.includes('satellite') || t.includes('space') || t.includes('mil-prf') || t.includes('radiation'))
    parts.push('ECCN 9A515 space qualified radiation hardened satellite spacecraft microcircuit MIL-PRF-38535');
  if (t.includes('penalty') || t.includes('violation') || t.includes('enforcement'))
    parts.push('EAR export violation penalty fine denial order BIS enforcement SCOMET DGFT penalty provision');
  if (t.includes('re-export') || t.includes('reexport') || t.includes('deemed export'))
    parts.push('EAR deemed export re-export technology transfer foreign national 15 CFR Part 734');
  if (t.includes('icp') || t.includes('compliance program') || t.includes('internal'))
    parts.push('Internal Compliance Program ICP export control program management commitment training audit DGFT BIS');
  if (t.includes('license exception') || t.includes('ear99') || t.includes('no license'))
    parts.push('EAR license exception EAR99 no license required NLR LVS TMP STA BIS authorization');
  if (t.includes('country') || t.includes('embargo') || t.includes('sanction'))
    parts.push('EAR country group D E embargo sanctioned country OFAC SCOMET destination prohibited');
  return parts.join('. ');
}

const KB_ITEMS = {
  india: [
    { id: 'scomet', label: 'SCOMET List 2025' },
    { id: 'ftdr', label: 'FTDR Act 1992' },
  ],
  us: [
    { id: 'ear', label: 'EAR CCL 730\u2013774' },
    { id: 'bis_entity', label: 'BIS Entity List 744' },
    { id: 'bis_jan25', label: 'BIS Interim Rule Jan 2025' },
    { id: 'chips', label: 'CHIPS Act Guardrails' },
  ],
};

// ── Sidebar Section Wrapper ──────────────────────────────────────────────────
const SideSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  noBorder?: boolean;
}> = ({ icon, title, badge, children, noBorder }) => (
  <div
    className="px-4 py-3"
    style={{
      borderBottom: noBorder ? 'none' : '1px solid rgba(180,185,190,0.10)',
    }}
  >
    <div className="flex items-center gap-2 mb-2.5">
      <span style={{ color: 'var(--color-glosilex-teal-dim)', display: 'flex', alignItems: 'center' }}>
        {icon}
      </span>
      <h3
        className="text-xs font-bold uppercase tracking-widest flex-1"
        style={{ color: 'var(--color-glosilex-light-text)', fontFamily: 'var(--font-heading)', letterSpacing: '0.13em' }}
      >
        {title}
      </h3>
      {badge}
    </div>
    {children}
  </div>
);

// ── Live pulse badge ─────────────────────────────────────────────────────────
const LiveBadge: React.FC = () => (
  <span className="flex items-center gap-1.5 ml-auto">
    <span className="relative flex h-1.5 w-1.5">
      <span
        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ background: 'var(--color-glosilex-teal-dim)' }}
      />
      <span
        className="relative inline-flex rounded-full h-1.5 w-1.5"
        style={{ background: 'var(--color-glosilex-teal-dim)' }}
      />
    </span>
    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-glosilex-teal-dim)' }}>
      Live
    </span>
  </span>
);

// ── KB Pill ──────────────────────────────────────────────────────────────────
const KBPill: React.FC<{ label: string }> = ({ label }) => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border"
    style={{
      background: 'rgba(79,152,163,0.07)',
      borderColor: 'rgba(79,152,163,0.22)',
      color: 'var(--color-glosilex-teal-dim)',
    }}
  >
    {label}
  </span>
);

// ── Example question with icon mapping ──────────────────────────────────────
const EXAMPLE_QUESTIONS = [
  { q: "Is a 7nm semiconductor fab tool controlled under SCOMET Category 6?", icon: Search, tag: "Classification" },
  { q: "What ECCN applies to a radiation-hardened FPGA with military specs?", icon: Scale, tag: "ECCN" },
  { q: "Does an IC designed in India but manufactured in the US need both SCOMET and EAR licenses?", icon: Globe, tag: "Dual Jurisdiction" },
  { q: "What are the penalties for violating US EAR export controls?", icon: FileWarning, tag: "Penalties" },
  { q: "Can I re-export a US-origin semiconductor to a UAE distributor without a license?", icon: RefreshCw, tag: "Re-export" },
  { q: "Does a foreign national engineer accessing controlled EDA tools in India trigger deemed export rules?", icon: Users, tag: "Deemed Export" },
  { q: "Is my NDA clause adequate for SCOMET-controlled technical data?", icon: Shield, tag: "Contracts" },
  { q: "What does an ICP need to include to satisfy DGFT requirements?", icon: BookMarked, tag: "ICP" },
];

export const Ask: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>(['SCOMET_INDIA', 'EAR_US']);
  const [uploadedFileText, setUploadedFileText] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [hiddenContext, setHiddenContext] = useState<string | null>(null);
  const [fromModule, setFromModule] = useState<string | null>(null);
  const [sourceView, setSourceView] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1280);
  const [lastTopic, setLastTopic] = useState<string | null>(null);
  const [lastJurisdictions, setLastJurisdictions] = useState<string[]>([]);
  const [lastChunks, setLastChunks] = useState<any[]>([]);

  const latestMessageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (location.state?.initialQuery) {
      setInput(location.state.initialQuery);
      if (location.state.hiddenContext) setHiddenContext(location.state.hiddenContext);
      if (location.state.fromModule) setFromModule(location.state.fromModule);
      if (location.state.sourceView) setSourceView(location.state.sourceView);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const scrollToLatest = () => {
    setTimeout(() => {
      if (chatContainerRef.current) {
        const container = chatContainerRef.current;
        if (isLoading) {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        } else if (latestMessageRef.current) {
          const containerRect = container.getBoundingClientRect();
          const messageRect = latestMessageRef.current.getBoundingClientRect();
          const scrollTop = container.scrollTop + (messageRect.top - containerRect.top) - 24;
          container.scrollTo({ top: scrollTop, behavior: 'smooth' });
        }
      }
    }, 100);
  };

  useEffect(() => { scrollToLatest(); }, [messages, isLoading]);

  const handleBack = () => {
    if (fromModule === 'Classify') navigate('/classify');
    else if (fromModule === 'ICP Review') navigate('/icp');
    else if (fromModule === 'Contract Intelligence') navigate('/contracts');
    else navigate(-1);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadedFileName(file.name);
      if (file.type === 'application/pdf') {
        const text = await extractTextFromPdf(file);
        setUploadedFileText(text);
      } else if (
        file.type === 'text/csv' || file.type === 'text/plain' ||
        file.name.endsWith('.csv') || file.name.endsWith('.txt')
      ) {
        setUploadedFileText(await file.text());
      } else {
        alert('Please upload a PDF, CSV, or TXT file.');
        setUploadedFileName(null);
      }
    } catch {
      alert('Failed to parse file. Please try again or paste text.');
      setUploadedFileName(null);
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
      setLoadingSteps([
        'Embedding your query...',
        'Retrieving regulatory context...',
        'Analyzing with Gemini...',
        'Generating response...',
      ]);
      setCurrentStep(0);

      let targetJurisdictions = selectedJurisdictions;
      if (targetJurisdictions.length === 2) {
        targetJurisdictions = await detectJurisdiction(userQuery);
      }

      const jurisdictionsChanged =
        JSON.stringify(targetJurisdictions.sort()) !== JSON.stringify(lastJurisdictions.sort());
      const isShortFollowUp = userQuery.split(' ').length < 8;

      let finalChunks: any[] = [];
      let finalAnswer = '';

      if (!jurisdictionsChanged && lastChunks.length > 0 && isShortFollowUp) {
        setCurrentStep(2);
        finalChunks = lastChunks;
        const formattedContext = finalChunks
          .map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`)
          .join('\n\n');
        setCurrentStep(3);
        let systemPrompt = `${GLOBAL_SYSTEM_PROMPT}\n\n${QA_PROMPT}`;
        if (uploadedFileText) systemPrompt += `\n\nUPLOADED DOCUMENT:\n${uploadedFileText}`;
        if (hiddenContext) systemPrompt += `\n\nPREVIOUS ANALYSIS CONTEXT (HIDDEN FROM USER):\n${hiddenContext}`;
        finalAnswer = await callGemini(systemPrompt, `Previous Topic: ${lastTopic}\nFollow-up Question: ${userQuery}`, formattedContext);
      } else {
        setCurrentStep(1);
        const enrichedQuery = buildAskQuery(userQuery);
        const fullQuery = enrichedQuery + (uploadedFileText ? `\n\nDocument Context: ${uploadedFileText.substring(0, 2000)}` : '');
        const hydeDoc = await generateHypotheticalDoc(
          `Export control regulatory answer for: ${enrichedQuery}`
        );
        finalChunks = await retrieveChunks(hydeDoc, targetJurisdictions, 12);
        setCurrentStep(2);
        const formattedContext = finalChunks
          .map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`)
          .join('\n\n');
        let systemPrompt = `${GLOBAL_SYSTEM_PROMPT}\n\n${QA_PROMPT}`;
        if (uploadedFileText) systemPrompt += `\n\nUPLOADED DOCUMENT:\n${uploadedFileText}`;
        if (hiddenContext) systemPrompt += `\n\nPREVIOUS ANALYSIS CONTEXT (HIDDEN FROM USER):\n${hiddenContext}`;
        finalAnswer = await callGemini(systemPrompt, userQuery, formattedContext);
        setCurrentStep(3);
      }

      const riskMatch = finalAnswer.match(/(🔴 HIGH RISK|🟠 MEDIUM RISK|🟢 LOW RISK)/);
      const confMatch = finalAnswer.match(/Confidence:\s*(\d+%?\s*—\s*(HIGH|MEDIUM|LOW))/i);
      const dualFlag =
        /⚠️\s*[*#\s"']*Dual Jurisdiction Alert/i.test(finalAnswer) &&
        !/Dual Jurisdiction Alert[*#\s"':]*[\s\n]*Not applicable/i.test(finalAnswer);
      const citations = parseCitations(finalAnswer);

      const section3Match = finalAnswer.match(/3\. JURISDICTION BREAKDOWN:([\s\S]*?)(?=4\. ACTION REQUIRED:|$)/i);
      const section3Text = section3Match ? section3Match[1] : finalAnswer;
      const activeJurisdictions = new Set<string>();
      if (/SCOMET/i.test(section3Text) || /SCOMET/i.test(finalAnswer)) activeJurisdictions.add('SCOMET_INDIA');
      if (/EAR/i.test(section3Text) || dualFlag) activeJurisdictions.add('EAR_US');
      if (/\bEU\b|European Union/i.test(section3Text)) activeJurisdictions.add('EU_DUAL_USE');
      const orderedJurisdictions = Array.from(activeJurisdictions).sort((a, b) => {
        if (a === 'SCOMET_INDIA') return -1;
        if (b === 'SCOMET_INDIA') return 1;
        return a.localeCompare(b);
      });
      const finalJurisdictions = orderedJurisdictions.length > 0 ? orderedJurisdictions : targetJurisdictions;

      const aiMessage: Message = {
        role: 'assistant',
        content: finalAnswer,
        jurisdictions: finalJurisdictions,
        riskRating: riskMatch ? riskMatch[1] : 'Unknown',
        confidence: confMatch ? confMatch[1] : 'Unknown',
        citations,
        dualFlag,
        chunksUsed: finalChunks,
      };

      setMessages(prev => [...prev, aiMessage]);
      setLastJurisdictions(finalJurisdictions);
      setLastChunks(finalChunks);
      setLastTopic(userQuery);

      const supabase = getSupabase();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || 'anonymous';
      try {
        await supabase.from('conversations').insert({
          user_id: userId, question: userQuery, answer: finalAnswer,
          chunks_used: finalChunks, jurisdictions: finalJurisdictions,
          created_at: new Date().toISOString(),
        });
      } catch (err) { console.error('Failed to save to conversations table:', err); }
      try {
        await saveSession(userId, 'qa', userQuery, finalAnswer, finalJurisdictions,
          riskMatch ? riskMatch[1] : 'Unknown', citations, dualFlag);
      } catch (err) { console.error('Failed to save session:', err); }
    } catch (error: any) {
      console.error('Q&A Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to generate response. Please check your API keys or try again.'}`,
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

  const handleChipClick = (q: string) => { setInput(q); };

  const renderFormattedContent = (content: string) => {
    let displayContent = content
      .replace(/(?:^|\n)[*#\s]*(?:\d\.\s+)?(?:⚠️\s*)?[*#\s]*(?:LEGAL\s+)?DISCLAIMER:?[*#\s]*[\s\S]*$/i, '')
      .trim();

    displayContent = displayContent.replace(
      /(\[\d+\]\s*)?\[Source:\s*([^,\]]+)(?:,\s*([^,\]]+))?(?:,\s*([^\]]+))?\]/g,
      (_match, prefix, doc, sec, clause) => {
        const d = doc ? doc.trim() : '';
        const s = sec ? sec.replace(/(?:Section\s*[:\-]?\s*)+/gi, '').trim() : '';
        const c = clause ? clause.replace(/(?:Clause\s*[:\-]?\s*)+/gi, '').trim() : '';
        let formatted = `Source: ${d}`;
        if (s && s.toLowerCase() !== 'null') formatted += `, Section: ${s}`;
        if (c && c.toLowerCase() !== 'null' && c !== '') formatted += `, Clause: ${c}`;
        return prefix ? `${prefix}[${formatted}]` : `[${formatted}]`;
      }
    );

    const sections = displayContent.split(/(?=\d\.\s+[A-Z\s]+:)/);

    const renderTextWithAlert = (text: string) => {
      const parts = text.split(
        /(?:^|\n)[*#\s"']*⚠️\s*[*#\s"']*Dual Jurisdiction Alert[*#\s"':]*[\s\n]*[*#\s"']*Both India SCOMET and US EAR apply\. You must obtain separate authorizations from DGFT \(India\) AND BIS \(US\)\.?[*#\s"']*/i
      );
      if (parts.length === 1) return <>{text}</>;
      return (
        <>
          {parts.map((part, i) => (
            <React.Fragment key={i}>
              {part}
              {i < parts.length - 1 && <div className="my-3"><DualJurisdictionAlert /></div>}
            </React.Fragment>
          ))}
        </>
      );
    };

    if (sections.length <= 1) {
      return (
        <div
          className="text-sm leading-relaxed"
          style={{
            color: 'var(--color-glosilex-light-body)',
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font-body, Inter, sans-serif)',
          }}
        >
          {renderTextWithAlert(displayContent)}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {sections.map((section, idx) => {
          if (!section.trim()) return null;
          const match = section.match(/^(\d\.\s+([A-Z\s&]+):)([\s\S]*)$/);
          if (match) {
            const [, , title, body] = match;
            return (
              <div key={idx} className="mb-2">
                <div
                  className="flex items-center gap-2 mb-1.5 pb-1"
                  style={{ borderBottom: '1px solid rgba(79,152,163,0.15)' }}
                >
                  <span
                    className="w-1 h-4 rounded-full flex-shrink-0"
                    style={{ background: 'var(--color-glosilex-teal-dim)', opacity: 0.7 }}
                  />
                  <h4
                    className="font-bold text-sm tracking-wide uppercase"
                    style={{
                      color: 'var(--color-glosilex-light-text)',
                      fontFamily: 'var(--font-heading)',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {title.trim()}
                  </h4>
                </div>
                <div
                  className="text-sm leading-relaxed pl-3"
                  style={{
                    color: 'var(--color-glosilex-light-body)',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'var(--font-body, Inter, sans-serif)',
                  }}
                >
                  {renderTextWithAlert(body.trim())}
                </div>
              </div>
            );
          }
          return (
            <div
              key={idx}
              className="text-sm leading-relaxed"
              style={{
                color: 'var(--color-glosilex-light-body)',
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--font-body, Inter, sans-serif)',
              }}
            >
              {renderTextWithAlert(section.trim())}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Jurisdiction toggle bar (matches Classify style) ────────────────────────
  const JurisdictionToggle = ({
    id, checked, onChange, flag, label,
  }: { id: string; checked: boolean; onChange: () => void; flag: string; label: string }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      onClick={onChange}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 min-h-[40px] group"
      style={{
        background: checked
          ? 'linear-gradient(135deg, rgba(79,152,163,0.12) 0%, rgba(1,105,111,0.05) 100%)'
          : 'rgba(255,255,255,0.02)',
        border: `1px solid ${checked ? 'rgba(79,152,163,0.4)' : 'rgba(180,185,190,0.15)'}`,
      }}
    >
      <span className="text-sm leading-none select-none">{flag}</span>
      <span
        className="flex-1 text-left text-[12px] font-semibold tracking-wide"
        style={{ color: checked ? 'var(--color-glosilex-teal-dim)' : 'var(--color-glosilex-light-muted)' }}
      >
        {label}
      </span>
      {/* pill track */}
      <span
        className="relative flex-shrink-0 inline-flex items-center rounded-full transition-all duration-300"
        style={{
          width: 32, height: 18,
          background: checked ? 'var(--color-glosilex-teal-dim)' : 'rgba(160,165,170,0.25)',
          boxShadow: checked ? '0 0 6px rgba(79,152,163,0.4)' : 'none',
        }}
      >
        <span
          className="absolute rounded-full bg-white shadow transition-all duration-300"
          style={{
            width: 12, height: 12,
            left: checked ? 17 : 3,
            top: 3,
          }}
        />
      </span>
    </button>
  );

  return (
    /*
     * FIX: Use `overflow-hidden` + explicit height on the root so the component
     * never extends behind the fixed navbar. The navbar in this app is 64px tall
     * and the layout root sits below it (margin-top or padding-top applied by the
     * shell). We therefore let the shell decide the offset and simply fill 100%
     * of the remaining viewport with `height: 100%` here.
     * If the shell wraps <main> with padding-top: 64px, then `100vh - 64px` is
     * still needed. We use both a CSS var fallback AND a direct calc to be safe.
     */
    <div
      className="flex flex-col md:flex-row overflow-hidden relative"
      style={{
        height: 'calc(var(--navbar-height, 64px) * -1 + 100vh)',
        minHeight: 0,
        background: 'var(--color-glosilex-light-bg)',
        fontFamily: 'var(--font-body, Inter, sans-serif)',
      }}
    >
      {/* ── Mobile top bar ────────────────────────────────────────────────── */}
      <div
        className="md:hidden flex justify-between items-center px-4 py-2.5 z-10 border-b shrink-0"
        style={{
          background: 'var(--color-glosilex-light-surface)',
          borderColor: 'rgba(180,185,190,0.12)',
        }}
      >
        <span
          className="flex items-center gap-2 font-semibold text-sm"
          style={{ color: 'var(--color-glosilex-light-text)', fontFamily: 'var(--font-heading)' }}
        >
          <MessageSquare className="h-4 w-4" style={{ color: 'var(--color-glosilex-teal-dim)' }} />
          Ask Compliance
        </span>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-md flex items-center justify-center min-h-[44px] min-w-[44px]"
          style={{ color: 'var(--color-glosilex-light-muted)', background: 'rgba(180,185,190,0.08)' }}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div
        className={`
          ${isMobileMenuOpen ? 'flex absolute z-30 w-full' : 'hidden'}
          md:flex flex-col h-full shrink-0 transition-all duration-300 overflow-hidden
          ${isSidebarOpen ? 'md:w-[288px]' : 'md:w-0'}
        `}
        style={{
          background: 'var(--color-glosilex-light-surface)',
          borderRight: '1px solid rgba(180,185,190,0.12)',
        }}
      >
        {/* Inner scrollable column — fixed width so content doesn't collapse during animation */}
        <div className="w-[288px] flex flex-col h-full overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'thin' }}>

          {/* ── Knowledge Base ────────────────────────────────────────────── */}
          <SideSection
            icon={<Database className="h-3.5 w-3.5" />}
            title="Knowledge Base"
            badge={<LiveBadge />}
          >
            {/* India */}
            <div className="mb-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5"
                style={{ color: 'var(--color-glosilex-light-muted)' }}>
                <span>🇮🇳</span> India · DGFT
              </p>
              <div className="flex flex-wrap gap-1">
                {KB_ITEMS.india.map(item => <KBPill key={item.id} label={item.label} />)}
              </div>
            </div>
            {/* US */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5"
                style={{ color: 'var(--color-glosilex-light-muted)' }}>
                <span>🇺🇸</span> United States · BIS
              </p>
              <div className="flex flex-wrap gap-1">
                {KB_ITEMS.us.map(item => <KBPill key={item.id} label={item.label} />)}
              </div>
            </div>
          </SideSection>

          {/* ── Jurisdiction Scope ────────────────────────────────────────── */}
          <SideSection
            icon={<Globe className="h-3.5 w-3.5" />}
            title="Jurisdiction Scope"
          >
            <div className="flex flex-col gap-1.5">
              <JurisdictionToggle
                id="askScomet"
                checked={selectedJurisdictions.includes('SCOMET_INDIA')}
                onChange={() => toggleJurisdiction('SCOMET_INDIA')}
                flag="🇮🇳"
                label="India SCOMET"
              />
              <JurisdictionToggle
                id="askEar"
                checked={selectedJurisdictions.includes('EAR_US')}
                onChange={() => toggleJurisdiction('EAR_US')}
                flag="🇺🇸"
                label="US EAR / BIS"
              />
            </div>
          </SideSection>

          {/* ── Document Context ──────────────────────────────────────────── */}
          <SideSection
            icon={<Paperclip className="h-3.5 w-3.5" />}
            title="Document Context"
            noBorder
          >
            <input
              id="askFileUpload"
              type="file"
              accept=".pdf,.csv,.txt"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 min-h-[40px]"
              style={{
                border: '1.5px dashed rgba(79,152,163,0.3)',
                color: 'var(--color-glosilex-light-muted)',
                background: 'transparent',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(79,152,163,0.6)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-glosilex-teal-dim)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(79,152,163,0.05)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(79,152,163,0.3)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-glosilex-light-muted)';
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
              {uploadedFileName ? 'Change Document' : 'Upload PDF, CSV or TXT'}
            </button>
            {uploadedFileName && (
              <div
                className="mt-2 flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-lg"
                style={{
                  background: 'rgba(79,152,163,0.07)',
                  color: 'var(--color-glosilex-teal-dim)',
                  border: '1px solid rgba(79,152,163,0.18)',
                }}
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate font-medium">{uploadedFileName}</span>
              </div>
            )}
          </SideSection>

          {/* ── Session context banner (when launched from another module) ── */}
          {(fromModule || sourceView) && (
            <div
              className="mx-3 mb-3 px-3 py-2 rounded-lg flex items-start gap-2"
              style={{
                background: 'rgba(79,152,163,0.07)',
                border: '1px solid rgba(79,152,163,0.2)',
              }}
            >
              <Activity className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-glosilex-teal-dim)' }} />
              <div>
                {fromModule && (
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--color-glosilex-teal-dim)' }}>
                    From: {fromModule}
                  </p>
                )}
                {sourceView && (
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-glosilex-light-muted)' }}>
                    {sourceView}
                  </p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Sidebar desktop toggle — floats at sidebar edge, never over scrollbar ── */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="hidden md:flex absolute z-40 rounded-full p-1.5 transition-all duration-300"
        style={{
          top: '18px',
          left: isSidebarOpen ? 'calc(288px - 12px)' : '8px',
          background: 'var(--color-glosilex-light-surface)',
          border: '1px solid rgba(180,185,190,0.25)',
          color: 'var(--color-glosilex-light-muted)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.13)',
        }}
        aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {isSidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {/* ── Chat Area ─────────────────────────────────────────────────────── */}
      {/*
       * FIX: This flex column must have `min-h-0` so flex children can shrink
       * below their natural height, allowing the messages div to scroll properly
       * without pushing the input bar off-screen.
       * `overflow-hidden` prevents any child from leaking outside this column.
       */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">

        {/* Back bar when launched from another module */}
        {fromModule && (
          <div
            className="px-4 py-2 flex items-center gap-4 z-20 border-b shrink-0"
            style={{
              background: 'var(--color-glosilex-light-surface)',
              borderColor: 'rgba(180,185,190,0.12)',
            }}
          >
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-sm font-medium transition-colors group min-h-[44px]"
              style={{ color: 'var(--color-glosilex-light-muted)' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-glosilex-teal-dim)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-glosilex-light-muted)'}
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back to {fromModule} Results
            </button>
          </div>
        )}

        {/* Loading indicator bar */}
        {isLoading && (
          <div
            className="px-4 py-1.5 flex items-center gap-3 border-b shrink-0"
            style={{
              background: 'rgba(79,152,163,0.07)',
              borderColor: 'rgba(79,152,163,0.18)',
            }}
          >
            <span
              className="w-3 h-3 rounded-full animate-spin border-2 flex-shrink-0"
              style={{ borderColor: 'var(--color-glosilex-teal-dim)', borderTopColor: 'transparent' }}
            />
            <span className="text-xs font-medium" style={{ color: 'var(--color-glosilex-teal-dim)' }}>
              {loadingSteps[currentStep]}…
            </span>
          </div>
        )}

        {/* ── Messages scroll region — must flex-1 + min-h-0 to scroll correctly ── */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto min-h-0"
          style={{ background: 'var(--color-glosilex-light-bg)' }}
        >
          {messages.length === 0 && !isLoading ? (

            /* ════════════════════════════════════════════════════════════
               WELCOME STATE  –  Futuristic redesign
               Layout: vertically centered, icon → title → subtitle →
               3-column prompt grid (no scroll-within-scroll)
            ════════════════════════════════════════════════════════════ */
            <div className="flex flex-col items-center justify-start px-6 pt-10 pb-6 w-full">

              {/* Glowing icon */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 relative"
                style={{
                  background: 'linear-gradient(135deg, rgba(79,152,163,0.18) 0%, rgba(1,105,111,0.10) 100%)',
                  border: '1.5px solid rgba(79,152,163,0.3)',
                  boxShadow: '0 0 28px rgba(79,152,163,0.18), 0 4px 16px rgba(0,0,0,0.06)',
                }}
              >
                <Zap className="h-7 w-7" style={{ color: 'var(--color-glosilex-teal-dim)' }} />
                {/* Subtle ring pulse */}
                <span
                  className="absolute inset-0 rounded-2xl animate-ping opacity-10"
                  style={{ background: 'var(--color-glosilex-teal-dim)' }}
                />
              </div>

              <h2
                className="text-2xl font-bold mb-1"
                style={{ color: 'var(--color-glosilex-light-text)', fontFamily: 'var(--font-heading)' }}
              >
                Ask Compliance
              </h2>
              <p
                className="mb-1 max-w-lg text-center text-sm leading-relaxed"
                style={{ color: 'var(--color-glosilex-light-muted)' }}
              >
                Ask anything about SCOMET or EAR/BIS regulations — classification rules, license exceptions,
                penalties, deemed exports, ICP requirements, and more.
              </p>
              <p
                className="mb-6 text-xs text-center"
                style={{ color: 'var(--color-glosilex-light-muted)', opacity: 0.55 }}
              >
                Every answer is grounded in official regulatory documents and fully cited.
              </p>

              {/* Capability pills */}
              <div className="flex flex-wrap justify-center gap-2 mb-7">
                {['SCOMET Classification', 'EAR / BIS', 'Dual Jurisdiction', 'Penalties & Enforcement', 'ICP Compliance', 'Re-export Rules'].map(tag => (
                  <span
                    key={tag}
                    className="text-[11px] font-semibold px-3 py-1 rounded-full border"
                    style={{
                      background: 'rgba(79,152,163,0.07)',
                      borderColor: 'rgba(79,152,163,0.22)',
                      color: 'var(--color-glosilex-teal-dim)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* ── 3-column prompt grid ── */}
              <div
                className="w-full"
                style={{ maxWidth: 900 }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-3 text-center"
                  style={{ color: 'var(--color-glosilex-light-muted)', opacity: 0.7 }}
                >
                  Try a sample question
                </p>
                <div
                  className="grid gap-2.5"
                  style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
                >
                  {EXAMPLE_QUESTIONS.map(({ q, icon: Icon, tag }, i) => (
                    <button
                      key={i}
                      onClick={() => handleChipClick(q)}
                      className="text-left flex flex-col gap-2 p-3 rounded-xl transition-all duration-200 group"
                      style={{
                        background: 'var(--color-glosilex-light-surface)',
                        border: '1px solid rgba(180,185,190,0.15)',
                        color: 'var(--color-glosilex-light-body)',
                        fontFamily: 'var(--font-body, Inter, sans-serif)',
                        minHeight: 88,
                      }}
                      onMouseEnter={e => {
                        const b = e.currentTarget as HTMLButtonElement;
                        b.style.borderColor = 'rgba(79,152,163,0.4)';
                        b.style.background = 'rgba(79,152,163,0.06)';
                        b.style.boxShadow = '0 2px 10px rgba(79,152,163,0.10)';
                      }}
                      onMouseLeave={e => {
                        const b = e.currentTarget as HTMLButtonElement;
                        b.style.borderColor = 'rgba(180,185,190,0.15)';
                        b.style.background = 'var(--color-glosilex-light-surface)';
                        b.style.boxShadow = 'none';
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0"
                          style={{ background: 'rgba(79,152,163,0.10)' }}
                        >
                          <Icon className="h-3.5 w-3.5" style={{ color: 'var(--color-glosilex-teal-dim)' }} />
                        </span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: 'var(--color-glosilex-teal-dim)' }}
                        >
                          {tag}
                        </span>
                      </div>
                      <span className="text-[12px] leading-snug" style={{ color: 'var(--color-glosilex-light-body)' }}>
                        {q}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

          ) : (
            /* ── Messages list ────────────────────────────────────────── */
            <div className="p-4 sm:p-5 space-y-5 pb-4">
              {messages.map((msg, idx) => {
                const isLast = idx === messages.length - 1 && !isLoading;
                return (
                  <div
                    key={idx}
                    ref={isLast ? latestMessageRef : null}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} scroll-mt-6`}
                  >
                    {/* User bubble */}
                    {msg.role === 'user' && (
                      <div
                        className="max-w-[90%] md:max-w-[78%] rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm"
                        style={{
                          background: 'var(--color-glosilex-teal-dim)',
                          color: '#fff',
                          fontFamily: 'var(--font-body, Inter, sans-serif)',
                        }}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    )}

                    {/* Assistant bubble */}
                    {msg.role === 'assistant' && (
                      <div
                        className="max-w-[95%] md:max-w-[90%] rounded-2xl rounded-bl-sm px-4 py-4 shadow-sm"
                        style={{
                          background: 'var(--color-glosilex-light-surface)',
                          border: '1px solid rgba(180,185,190,0.15)',
                          color: 'var(--color-glosilex-light-text)',
                          fontFamily: 'var(--font-body, Inter, sans-serif)',
                        }}
                      >
                        {/* Meta row */}
                        <div
                          className="mb-3 pb-2.5 flex flex-wrap gap-2 items-center border-b"
                          style={{ borderColor: 'rgba(180,185,190,0.10)' }}
                        >
                          {msg.jurisdictions && msg.jurisdictions.length > 0 && (
                            <JurisdictionBadge jurisdiction={msg.jurisdictions[0]} />
                          )}
                          {(() => {
                            let level = 'UNKNOWN';
                            const riskSectionMatch = msg.content.match(/RISK RATING & CONFIDENCE[\s\S]*?(?=\n\d\.\s+|$)/i);
                            const searchArea = riskSectionMatch ? riskSectionMatch[0] : msg.content;
                            if (/HIGH\s*RISK/i.test(searchArea)) level = 'HIGH RISK';
                            else if (/MEDIUM\s*RISK/i.test(searchArea)) level = 'MEDIUM RISK';
                            else if (/LOW\s*RISK/i.test(searchArea)) level = 'LOW RISK';
                            return <RiskBadge level={level} />;
                          })()}
                          {msg.confidence && msg.confidence !== 'Unknown' && (
                            <span
                              className="text-xs font-semibold px-2.5 py-1 rounded-full border"
                              style={{
                                color: 'var(--color-glosilex-light-muted)',
                                background: 'rgba(180,185,190,0.07)',
                                borderColor: 'rgba(180,185,190,0.18)',
                              }}
                            >
                              {msg.confidence}
                            </span>
                          )}
                        </div>

                        {/* Content */}
                        {renderFormattedContent(msg.content)}

                        {/* Citations accordion */}
                        {msg.chunksUsed && msg.chunksUsed.length > 0 && (
                          <div className="mt-3 pt-2">
                            <CitationsAccordion chunks={msg.chunksUsed} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Typing indicator */}
          {isLoading && (
            <div ref={latestMessageRef} className="flex justify-start px-4 sm:px-5 pb-4 scroll-mt-6">
              <div
                className="rounded-2xl rounded-bl-sm px-4 py-3.5 shadow-sm flex items-center gap-2"
                style={{
                  background: 'var(--color-glosilex-light-surface)',
                  border: '1px solid rgba(180,185,190,0.15)',
                }}
              >
                <div className="flex space-x-1">
                  {[0, 150, 300].map(delay => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{
                        background: 'var(--color-glosilex-teal-dim)',
                        opacity: 0.7,
                        animationDelay: `${delay}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Sticky input area ─────────────────────────────────────────────── */}
        <div
          className="shrink-0 px-4 pt-3 pb-4 border-t"
          style={{
            background: 'var(--color-glosilex-light-surface)',
            borderColor: 'rgba(180,185,190,0.12)',
          }}
        >
          <form
            onSubmit={e => handleSubmit(e)}
            className="max-w-4xl mx-auto flex items-end gap-2"
          >
            <div className="relative flex-1">
              <label htmlFor="askInput" className="sr-only">Ask a compliance question</label>
              <textarea
                id="askInput"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Ask a compliance question… (Enter to send, Shift+Enter for new line)"
                className="w-full pl-4 pr-4 py-3 rounded-xl resize-none min-h-[50px] max-h-36 text-sm focus:outline-none transition-all duration-200"
                style={{
                  background: 'var(--color-glosilex-light-bg)',
                  border: '1.5px solid rgba(180,185,190,0.22)',
                  color: 'var(--color-glosilex-light-text)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                  fontFamily: 'var(--font-body, Inter, sans-serif)',
                }}
                rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 4) : 1}
                disabled={isLoading}
                onFocus={e => {
                  (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'rgba(79,152,163,0.5)';
                  (e.currentTarget as HTMLTextAreaElement).style.boxShadow = '0 0 0 3px rgba(79,152,163,0.10)';
                }}
                onBlur={e => {
                  (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'rgba(180,185,190,0.22)';
                  (e.currentTarget as HTMLTextAreaElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.03)';
                }}
              />
            </div>
            <button
              type="submit"
              aria-label="Send message"
              disabled={!input.trim() || isLoading}
              className="h-[50px] w-[50px] flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'var(--color-glosilex-teal-dim)',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(79,152,163,0.28)',
              }}
              onMouseEnter={e => {
                if (!(e.currentTarget as HTMLButtonElement).disabled)
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-glosilex-teal)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-glosilex-teal-dim)';
              }}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p
            className="text-center mt-2 text-xs max-w-4xl mx-auto"
            style={{ color: 'var(--color-glosilex-light-muted)', opacity: 0.6 }}
          >
            ⚠️ GloSilex is for informational purposes only and does not constitute legal advice.
            Verify with a qualified export control attorney before making compliance decisions.
          </p>
        </div>
      </div>
    </div>
  );
};
