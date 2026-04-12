import React, { useState, useRef, useEffect } from 'react';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Copy,
  FileSignature, ShieldAlert, CheckCircle, MessageSquare, Download,
  ChevronLeft, ChevronRight, ArrowRight, ChevronDown, ChevronUp, Info,
  Globe, Shield, Layers, BarChart3, Target, BookOpen, Zap, TrendingUp,
  LayoutGrid, Search, Sparkles
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { extractTextFromFile, getFileTypeLabel } from '../utils/fileParser';
import { runContractChain, ContractResult, ClauseAudit, PartialContractData } from '../lib/contractService';
import { normalizeContractResult } from '../lib/reportService';
import { LoadingSteps } from '../components/LoadingSteps';
import { RiskBadge } from '../components/RiskBadge';
import { cleanContent } from '../utils/contentCleaner';
import { ProductSummaryCard } from '../components/ProductSummaryCard';
import { DualJurisdictionAlert } from '../components/DualJurisdictionAlert';
import { CitationsAccordion } from '../components/CitationsAccordion';
import { parseCitations } from '../utils/citations';
import { useNavigate } from 'react-router-dom';
import { saveContractsState, loadContractsState } from '../utils/sessionPersistence';
import { getSupabase } from '../services/supabase';

// ─── Design tokens ─────────────────────────────────────────────────────────
const T = {
  teal:         'var(--color-glosilex-teal-dim)',
  tealHover:    'var(--color-glosilex-teal)',
  text:         'var(--color-glosilex-light-text)',
  body:         'var(--color-glosilex-light-body)',
  muted:        'var(--color-glosilex-light-muted)',
  surface:      'var(--color-glosilex-light-surface)',
  bg:           'var(--color-glosilex-light-bg)',
  border:       'rgba(180,185,190,0.18)',
  borderActive: 'rgba(79,152,163,0.45)',
};

const REVIEW_SCOPE_OPTIONS = [
  { key: 'Export Control Compliance',              icon: '🛡️', sub: 'EAR/SCOMET control checks' },
  { key: 'End-Use / End-User Statements',          icon: '🎯', sub: 'EUC / EUU requirements' },
  { key: 'Re-Export Restrictions',                 icon: '↩️', sub: 'Transfer control clauses' },
  { key: 'Licensing Delay / Force Majeure',        icon: '⏳', sub: 'License contingencies' },
  { key: 'Audit / Compliance Cooperation Rights',  icon: '🔍', sub: 'Right-to-audit provisions' },
  { key: 'Regulatory Change / Update Mechanism',   icon: '🔄', sub: 'Amendment procedures' },
];

// ─── Compact field label ───────────────────────────────────────────────────
const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: T.muted }}>
    {children}
  </label>
);

// ─── Slim panel section ────────────────────────────────────────────────────
const PanelSection: React.FC<{
  icon: React.ReactNode; step: string; title: string; children: React.ReactNode;
}> = ({ icon, step, title, children }) => (
  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}`, background: T.surface }}>
    <div className="flex items-center gap-2 px-3 py-2 border-b"
      style={{ borderColor: T.border, background: 'rgba(79,152,163,0.04)' }}>
      <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
        style={{ background: T.teal, color: '#fff' }}>{step}</span>
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.teal }}>
        {icon}{title}
      </span>
    </div>
    <div className="p-3">{children}</div>
  </div>
);

// ─── Futuristic toggle (scope & jurisdiction) ──────────────────────────────
interface ToggleProps {
  id: string; checked: boolean; onChange: () => void;
  icon?: string; label: string; sub?: string;
}
const FuturisticToggle: React.FC<ToggleProps> = ({ id, checked, onChange, icon, label, sub }) => (
  <button type="button" role="switch" aria-checked={checked} id={id} onClick={onChange}
    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 min-h-[38px]"
    style={{
      background: checked
        ? 'linear-gradient(135deg,rgba(79,152,163,0.10) 0%,rgba(79,152,163,0.03) 100%)'
        : 'transparent',
      border: `1px solid ${checked ? T.borderActive : T.border}`,
    }}>
    {icon && <span className="text-sm leading-none select-none flex-shrink-0">{icon}</span>}
    <div className="flex-1 text-left min-w-0">
      <div className="text-xs font-semibold leading-tight truncate" style={{ color: checked ? T.teal : T.text }}>{label}</div>
      {sub && <div className="text-[10px] leading-tight mt-0.5 truncate" style={{ color: T.muted }}>{sub}</div>}
    </div>
    <span className="relative flex-shrink-0 inline-flex items-center rounded-full transition-all duration-300"
      style={{ width: 32, height: 18, background: checked ? T.teal : 'rgba(150,155,160,0.3)' }}>
      <span className="absolute rounded-full bg-white shadow-sm transition-all duration-300"
        style={{ width: 12, height: 12, left: checked ? 17 : 3, top: 3 }} />
    </span>
  </button>
);

// ─── Right-pane section header ─────────────────────────────────────────────
const RSection: React.FC<{
  icon: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode;
}> = ({ icon, title, subtitle, action }) => (
  <div className="flex items-center justify-between px-5 py-3 border-b"
    style={{ borderColor: T.border, background: 'rgba(79,152,163,0.03)' }}>
    <div className="flex items-center gap-2.5">
      <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(79,152,163,0.12)', color: T.teal }}>
        {icon}
      </span>
      <div>
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: T.text }}>{title}</div>
        {subtitle && <div className="text-[10px]" style={{ color: T.muted }}>{subtitle}</div>}
      </div>
    </div>
    {action && <div>{action}</div>}
  </div>
);

// ─── Status / risk chips ───────────────────────────────────────────────────
const StatusChip = ({ status }: { status: string }) => {
  const cfg = status === 'ADEQUATE'
    ? { bg: 'rgba(16,185,129,0.1)', color: '#065f46', icon: <CheckCircle2 className="w-3 h-3" /> }
    : status === 'WEAK'
    ? { bg: 'rgba(245,158,11,0.1)', color: '#92400e', icon: <AlertTriangle className="w-3 h-3" /> }
    : { bg: 'rgba(239,68,68,0.1)', color: '#7f1d1d', icon: <XCircle className="w-3 h-3" /> };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.icon}{status}
    </span>
  );
};

const RiskChip = ({ risk }: { risk: string }) => {
  const cfg = risk === 'HIGH'
    ? { bg: 'rgba(239,68,68,0.1)', color: '#7f1d1d' }
    : risk === 'MEDIUM'
    ? { bg: 'rgba(245,158,11,0.1)', color: '#92400e' }
    : { bg: 'rgba(16,185,129,0.1)', color: '#065f46' };
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold"
      style={{ background: cfg.bg, color: cfg.color }}>{risk}</span>
  );
};

export const Contracts: React.FC = () => {
  const [uploadedFileText, setUploadedFileText]   = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName]   = useState<string | null>(null);
  const [reviewScope, setReviewScope]             = useState<string[]>(REVIEW_SCOPE_OPTIONS.map(o => o.key));
  const [jurisdictions, setJurisdictions]         = useState<string[]>(['SCOMET_INDIA', 'EAR_US']);
  const [isLoading, setIsLoading]                 = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [loadingSteps, setLoadingSteps]           = useState<string[]>([]);
  const [currentStep, setCurrentStep]             = useState(0);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [partialContractData, setPartialContractData] = useState<PartialContractData | null>(null);
  const [result, setResult]                       = useState<ContractResult | null>(null);
  const [userId, setUserId]                       = useState<string | null>(null);
  const [selectedClause, setSelectedClause]       = useState<ClauseAudit | null>(null);
  const [isSidebarOpen, setIsSidebarOpen]         = useState(() => {
    const s = localStorage.getItem('contracts_sidebar_open');
    return s !== null ? JSON.parse(s) : true;
  });
  useEffect(() => { localStorage.setItem('contracts_sidebar_open', JSON.stringify(isSidebarOpen)); }, [isSidebarOpen]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
    const fetchUser = async () => {
      try {
        const { data } = await getSupabase().auth.getUser();
        const id = data?.user?.id || 'anonymous';
        setUserId(id);

        const saved = loadContractsState(id);
        if (saved) {
          setUploadedFileName(saved.uploadedFileName);
          setUploadedFileText(saved.uploadedFileText);
          setReviewScope(saved.reviewScope);
          setJurisdictions(saved.jurisdictions);
          if (saved.result) {
            setResult(saved.result);
            const firstGap = saved.result.clauseAudit.find(c => c.status !== 'ADEQUATE');
            if (firstGap) setSelectedClause(firstGap);
          }
        }
      } catch (err) {
        if (!import.meta.env.PROD) console.error('Auth fetch error:', err);
        setUserId('anonymous');
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (userId) {
      saveContractsState(userId, { uploadedFileName, uploadedFileText, reviewScope, jurisdictions, result });
    }
  }, [userId, uploadedFileName, uploadedFileText, reviewScope, jurisdictions, result]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadedFileName(file.name);
      setUploadedFileText(await extractTextFromFile(file));
    } catch (err: any) {
      setUploadedFileName(null);
      alert(err.message ?? 'Failed to read file.');
    }
  };

  const handleScopeToggle = (scope: string) =>
    setReviewScope(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);

  const handleJurisdictionToggle = (j: string) =>
    setJurisdictions(prev => prev.includes(j) ? prev.filter(x => x !== j) : [...prev, j]);

  const handleReviewContract = async (resumeFromPartial = false) => {
    if (!resumeFromPartial) setPartialContractData(null);
    if (!uploadedFileText) { alert('Please upload a contract document.'); return; }
    if (reviewScope.length === 0) { alert('Please select at least one review scope category.'); return; }
    if (jurisdictions.length === 0) { alert('Please select at least one jurisdiction.'); return; }
    setIsLoading(true); setResult(null); setError(null); setSelectedClause(null);
    setLoadingSteps(['Extracting contract clauses...','Retrieving regulatory requirements...','Assessing clause adequacy...','Identifying gaps and risks...','Generating compliant clause language...']);
    setCurrentStep(0);
    try {
      const assessmentResult = await runContractChain(
        uploadedFileText,
        uploadedFileName || 'Uploaded Contract',
        reviewScope,
        jurisdictions,
        (step) => {
          setRetryStatus(null);
          if (step.includes('Extracting')) setCurrentStep(0);
          else if (step.includes('Retrieving')) setCurrentStep(1);
          else if (step.includes('Assessing')) setCurrentStep(2);
          else if (step.includes('Identifying')) setCurrentStep(3);
          else if (step.includes('Generating')) setCurrentStep(4);
        },
        (attempt, delayMs, reason) => {
          setRetryStatus(
            `Gemini ${reason === '429 rate-limit' ? 'rate limited' : 'overloaded'} — retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt}/6)`
          );
          setTimeout(() => setRetryStatus(null), delayMs + 200);
        },
        (partial) => setPartialContractData(partial),
        resumeFromPartial ? (partialContractData ?? undefined) : undefined
      );
      setResult(assessmentResult);
      setPartialContractData(null);
      const firstGap = assessmentResult.clauseAudit.find(c => c.status !== 'ADEQUATE');
      if (firstGap) setSelectedClause(firstGap);
    } catch (err: any) {
      console.error('Assessment failed:', err);
      const errMsg = String(err?.message || JSON.stringify(err) || '');
      if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE')) {
        setError('Gemini is temporarily overloaded (Google-side issue). This is not a problem with your input or connection. Please wait 2–3 minutes and click Retry — your next attempt will likely succeed.');
      } else if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        setError('Gemini API rate limit reached. Please wait 1–2 minutes before retrying.');
      } else if (errMsg.includes('empty response')) {
        setError('Gemini returned an empty response — this occasionally happens on complex inputs. Please retry.');
      } else {
        setError('An error occurred during the assessment. Please check your connection and try again.');
      }
    } finally { setIsLoading(false); }
  };

  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); alert('Copied to clipboard!'); };

  const handleAskFollowUp = () => navigate('/ask', {
    state: {
      initialQuery: `I have a follow-up question about my contract compliance review for ${uploadedFileName || 'my contract'}.`,
      hiddenContext: `PREVIOUS CONTRACT CONTEXT —\nContract: ${uploadedFileName}\nScope: ${reviewScope.join(', ')}\n\nFull Analysis Result:\n${JSON.stringify(result, null, 2)}`,
      fromModule: 'Contract Intelligence', sourceView: 'results'
    }
  });

  const handleDownloadReport = () => {
    if (!result) return;
    const reportData = normalizeContractResult(result, uploadedFileName || 'Contract');
    navigate('/report', { state: { reportData, fromModule: 'Contract Intelligence' } });
  };

  const getDualJurisdictionProps = (result: ContractResult) => {
    const scometHasGap = result.clauseAudit.some(c => (c.jurisdiction === 'SCOMET_INDIA' || c.jurisdiction === 'Both') && c.status !== 'ADEQUATE');
    const earHasGap    = result.clauseAudit.some(c => (c.jurisdiction === 'EAR_US'       || c.jurisdiction === 'Both') && c.status !== 'ADEQUATE');
    if (!scometHasGap && !earHasGap) return null;
    if (scometHasGap && earHasGap) return {
      state: 'CONFIRMED' as const,
      message: '⚠️ Dual Jurisdiction Risk — Export control clause gaps identified under both SCOMET and EAR frameworks.'
    };
    return {
      state: 'POTENTIAL' as const,
      confirmedJurisdiction: scometHasGap ? 'SCOMET' : 'EAR',
      pendingJurisdiction:   scometHasGap ? 'EAR' : 'SCOMET',
    };
  };

  const riskColors = {
    HIGH:   { bg: 'rgba(239,68,68,0.07)',   border: 'rgba(239,68,68,0.28)',   text: '#7f1d1d',  icon: '#ef4444' },
    MEDIUM: { bg: 'rgba(245,158,11,0.07)',  border: 'rgba(245,158,11,0.28)',  text: '#92400e',  icon: '#f59e0b' },
    LOW:    { bg: 'rgba(16,185,129,0.07)',  border: 'rgba(16,185,129,0.28)', text: '#065f46',  icon: '#10b981' },
  };
  const rC = result ? (riskColors[result.overallRisk as keyof typeof riskColors] || riskColors.MEDIUM) : riskColors.MEDIUM;

  const adequateCount = result?.clauseAudit.filter(c => c.status === 'ADEQUATE').length || 0;
  const weakCount     = result?.clauseAudit.filter(c => c.status === 'WEAK').length     || 0;
  const missingCount  = result?.clauseAudit.filter(c => c.status === 'MISSING').length  || 0;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row overflow-hidden relative"
      style={{ height: 'calc(100vh - 64px)', background: T.bg, fontFamily: 'var(--font-body,Inter,sans-serif)' }}>

      {/* ════ LEFT PANEL ════════════════════════════════════════════════════ */}
      <div className="transition-all duration-300 ease-in-out flex flex-col h-full shrink-0"
        style={{
          width: isSidebarOpen ? 'min(340px,32%)' : 0,
          minWidth: 0,
          overflow: isSidebarOpen ? 'visible' : 'hidden',
          borderRight: isSidebarOpen ? `1px solid ${T.border}` : 'none',
          background: T.surface,
        }}>
        <div className="w-[340px] flex flex-col h-full overflow-hidden">

          {/* Panel header */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: T.border }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(79,152,163,0.12)', border: '1px solid rgba(79,152,163,0.25)' }}>
                <FileSignature className="w-3.5 h-3.5" style={{ color: T.teal }} />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight" style={{ color: T.text, fontFamily: 'var(--font-heading)' }}>
                  Contract Intelligence
                </h1>
                <p className="text-[10px] leading-tight mt-0.5" style={{ color: T.muted }}>
                  Clause Audit · SCOMET · EAR Compliance
                </p>
              </div>
            </div>
          </div>

          {/* Scrollable form */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-2.5">

            {/* ── 1 · Contract Content ── */}
            <PanelSection icon={<FileText className="w-3 h-3" />} step="1" title="Contract Content">
              <div className="space-y-2">
                <textarea
                  className="w-full px-2.5 py-2 text-xs rounded-lg resize-none focus:outline-none transition-all duration-200"
                  style={{ background: T.bg, border: `1.5px solid ${T.border}`, color: T.text, minHeight: 110, lineHeight: 1.55 }}
                  rows={6}
                  value={uploadedFileText || ''}
                  onChange={e => { setUploadedFileText(e.target.value); if (e.target.value && uploadedFileName) setUploadedFileName(null); }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(79,152,163,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,152,163,0.08)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none'; }}
                  placeholder={`Paste contract text here, or upload a file.\n\nFor best results include:\n• Export control clauses\n• End-use / re-export restrictions\n• Product list & destination countries\n• Parties (supplier, distributor)`}
                />
                {/* Upload strip */}
                <div
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200"
                  style={{
                    border: `1.5px dashed ${uploadedFileName ? T.borderActive : 'rgba(79,152,163,0.3)'}`,
                    background: uploadedFileName ? 'rgba(79,152,163,0.06)' : 'transparent',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onMouseEnter={e => { if (!uploadedFileName) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(79,152,163,0.55)'; }}
                  onMouseLeave={e => { if (!uploadedFileName) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(79,152,163,0.3)'; }}>
                  {uploadedFileName
                    ? <FileText className="h-4 w-4 flex-shrink-0" style={{ color: T.teal }} />
                    : <Upload className="h-4 w-4 flex-shrink-0" style={{ color: T.muted }} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium" style={{ color: uploadedFileName ? T.teal : T.muted }}>
                      {uploadedFileName ? 'Change file' : 'Upload PDF / DOCX / TXT'}
                    </div>
                    {uploadedFileName && <div className="text-[10px] truncate" style={{ color: T.muted }}>{getFileTypeLabel(uploadedFileName)}</div>}
                  </div>
                  {!uploadedFileName && <span className="text-[10px] flex-shrink-0" style={{ color: T.muted }}>up to 10MB</span>}
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload}
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  className="hidden" />
              </div>
            </PanelSection>

            {/* ── 2 · Review Scope ── */}
            <PanelSection icon={<Search className="w-3 h-3" />} step="2" title="Review Scope">
              <div className="space-y-1.5">
                {REVIEW_SCOPE_OPTIONS.map((opt) => (
                  <FuturisticToggle
                    key={opt.key}
                    id={`scope-${opt.key}`}
                    checked={reviewScope.includes(opt.key)}
                    onChange={() => handleScopeToggle(opt.key)}
                    icon={opt.icon}
                    label={opt.key}
                    sub={opt.sub}
                  />
                ))}
                {/* Select all / none */}
                <div className="flex gap-2 pt-0.5">
                  {[
                    { label: 'All', action: () => setReviewScope(REVIEW_SCOPE_OPTIONS.map(o => o.key)) },
                    { label: 'None', action: () => setReviewScope([]) },
                  ].map(({ label, action }) => (
                    <button key={label} type="button" onClick={action}
                      className="text-[10px] px-2.5 py-1 rounded-lg border transition-all duration-150 font-semibold"
                      style={{ background: T.bg, borderColor: T.border, color: T.muted }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = T.teal; (e.currentTarget as HTMLButtonElement).style.borderColor = T.borderActive; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = T.muted; (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; }}>
                      {label}
                    </button>
                  ))}
                  <span className="ml-auto text-[10px] self-center" style={{ color: T.muted }}>
                    {reviewScope.length}/{REVIEW_SCOPE_OPTIONS.length} selected
                  </span>
                </div>
              </div>
            </PanelSection>

            {/* ── 3 · Jurisdictions ── */}
            <PanelSection icon={<Globe className="w-3 h-3" />} step="3" title="Jurisdictions">
              <div className="space-y-1.5">
                <FuturisticToggle
                  id="contractScomet"
                  checked={jurisdictions.includes('SCOMET_INDIA')}
                  onChange={() => handleJurisdictionToggle('SCOMET_INDIA')}
                  icon="🇮🇳" label="India SCOMET" sub="DGFT · FTP 2023 SCOMET"
                />
                <FuturisticToggle
                  id="contractEar"
                  checked={jurisdictions.includes('EAR_US')}
                  onChange={() => handleJurisdictionToggle('EAR_US')}
                  icon="🇺🇸" label="US EAR / BIS" sub="15 CFR §734–762"
                />
              </div>
            </PanelSection>

            {/* Last run summary */}
            {result && (
              <div className="rounded-lg px-3 py-2.5 flex items-start gap-2"
                style={{ background: 'rgba(79,152,163,0.05)', border: `1px solid rgba(79,152,163,0.18)` }}>
                <BarChart3 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: T.teal }} />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.teal }}>Last Run</div>
                  <div className="text-[10px] mt-0.5" style={{ color: T.muted }}>
                    {uploadedFileName || 'Contract'} · <strong style={{ color: rC.icon }}>{result.overallRisk} RISK</strong> · Score: <strong style={{ color: T.text }}>{result.riskScore}/100</strong>
                  </div>
                  <div className="flex gap-2 mt-1">
                    {[
                      { l: 'OK', v: adequateCount, c: '#10b981' },
                      { l: 'Weak', v: weakCount,    c: '#f59e0b' },
                      { l: 'Miss', v: missingCount, c: '#ef4444' },
                    ].map(x => <span key={x.l} className="text-[10px] font-bold" style={{ color: x.c }}>{x.v} {x.l}</span>)}
                  </div>
                </div>
              </div>
            )}

          </div>{/* end scrollable */}

          {/* CTA */}
          <div className="flex-shrink-0 px-3 py-3 border-t" style={{ borderColor: T.border, background: T.surface }}>
            <button
              onClick={() => handleReviewContract(false)}
              disabled={isLoading || !uploadedFileText || reviewScope.length === 0 || jurisdictions.length === 0}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white transition-all duration-200 min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: T.teal, boxShadow: '0 2px 10px rgba(79,152,163,0.28)' }}
              onMouseEnter={e => { if (!(e.currentTarget as HTMLButtonElement).disabled) (e.currentTarget as HTMLButtonElement).style.background = T.tealHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.teal; }}>
              {isLoading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
                : <><Zap className="w-4 h-4" />Analyse Contract<ArrowRight className="w-3.5 h-3.5 ml-auto" /></>}
            </button>
          </div>
        </div>
      </div>{/* end left panel */}

      {/* ── SIDEBAR TOGGLE ── */}
      <div className="hidden md:block absolute top-5 z-40 transition-all duration-300"
        style={{ left: isSidebarOpen ? 'min(333px,calc(32% - 7px))' : 10 }}>
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="flex items-center justify-center rounded-full shadow-md hover:shadow-lg transition-all duration-200"
          style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted, width: 26, height: 26 }}
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
          {isSidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* ════ RIGHT PANEL ════════════════════════════════════════════════════ */}
      <div className="flex-1 h-full flex flex-col overflow-hidden" style={{ background: T.bg }}>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 sm:p-5 space-y-5">

            {/* Loading */}
            {isLoading && (
              <div className="rounded-2xl border p-8 shadow-sm" style={{ background: T.surface, borderColor: T.border }}>
                <LoadingSteps steps={loadingSteps} currentStepIndex={currentStep} />
                {retryStatus && (
                  <div style={{
                    marginTop: 12, padding: '9px 14px', borderRadius: 8,
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                    fontSize: 12, color: '#B7791F', fontFamily: 'var(--font-body)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 14 }}>⚠️</span>
                    <span>{retryStatus}</span>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && !isLoading && (
              <div className="rounded-2xl border p-8 text-center max-w-2xl mx-auto"
                style={{ background: T.surface, borderColor: 'rgba(239,68,68,0.28)' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <AlertTriangle className="h-7 w-7" style={{ color: '#ef4444' }} />
                </div>
                <h3 className="text-base font-bold mb-2" style={{ color: T.text, fontFamily: 'var(--font-heading)' }}>Assessment Failed</h3>
                <p className="mb-5 text-sm" style={{ color: T.muted }}>{error}</p>
                <button 
                  onClick={() => handleReviewContract(!!partialContractData)}
                    style={{ background: T.teal, color: '#fff', fontWeight: 600, padding: '10px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, minHeight: 44 }}
                  >
                    {partialContractData
                      ? `Resume from Step ${partialContractData.lastCompletedStep + 1} of 5`
                      : 'Retry Analysis'}
                </button>
                {partialContractData && (
                  <button
                    onClick={() => handleReviewContract(false)}
                    style={{ marginTop: 8, padding: '8px 18px', borderRadius: 8, border: `1px solid ${T.muted}`, background: 'transparent', color: T.muted, fontSize: 12, cursor: 'pointer', display: 'block', margin: '8px auto 0' }}
                  >
                    Start Fresh Instead
                  </button>
                )}
              </div>
            )}

            {/* Empty state */}
            {!result && !isLoading && !error && (
              <div className="rounded-2xl border p-10 text-center max-w-2xl mx-auto"
                style={{ background: T.surface, borderColor: T.border }}>
                {/* Icon with layered glow ring */}
                <div className="relative mx-auto mb-5" style={{ width: 80, height: 80 }}>
                  <div className="absolute inset-0 rounded-2xl opacity-15"
                    style={{ background: 'repeating-linear-gradient(0deg,transparent,transparent 8px,rgba(79,152,163,0.3) 8px,rgba(79,152,163,0.3) 9px),repeating-linear-gradient(90deg,transparent,transparent 8px,rgba(79,152,163,0.3) 8px,rgba(79,152,163,0.3) 9px)' }} />
                  <div className="absolute -inset-2 rounded-3xl opacity-20"
                    style={{ background: 'radial-gradient(circle,rgba(79,152,163,0.35) 0%,transparent 70%)' }} />
                  <div className="absolute inset-0 rounded-2xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,rgba(79,152,163,0.14),rgba(1,105,111,0.07))', border: '1.5px solid rgba(79,152,163,0.30)' }}>
                    <FileSignature className="w-9 h-9" style={{ color: T.teal }} />
                  </div>
                </div>

                {/* Module identity */}
                <h3 className="text-lg font-bold mb-1" style={{ color: T.text, fontFamily: 'var(--font-heading)' }}>Contract Intelligence</h3>                
                <p className="text-sm leading-relaxed max-w-sm mx-auto mb-1" style={{ color: T.muted }}>
                Upload your contract and configure your review scope in the left panel, then click{' '}
                <strong style={{ color: T.teal }}>Analyse Contract</strong> to ensure high-precision regulatory alignment.
                </p>

                {/* Grounding note */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mt-3 mb-5"
                  style={{ background: 'rgba(79,152,163,0.07)', border: '1px solid rgba(79,152,163,0.2)' }}>
                  <Sparkles className="w-3 h-3 flex-shrink-0" style={{ color: T.teal }} />
                  <span className="text-[10px] font-medium" style={{ color: T.teal }}>                    
                    AI-grounded clause-by-clause audit of commercial contracts against SCOMET FTP 2023 · EAR 15 CFR 734–762
                  </span>
                </div>

                {/* Value tags */}
                <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                  {[
                    { icon: <Shield className="w-3 h-3" />, label: '6 Compliance Categories' },
                    { icon: <Globe className="w-3 h-3" />,  label: 'Dual Jurisdiction' },
                    { icon: <Zap className="w-3 h-3" />,    label: 'HyDE Retrieval' },
                    { icon: <BookOpen className="w-3 h-3" />, label: 'Regulatory Grounding' },
                    { icon: <Target className="w-3 h-3" />, label: 'AI Confidence Score' },
                    { icon: <FileText className="w-3 h-3" />, label: 'Clause Rewrite' },
                  ].map(({ icon, label }) => (
                    <span key={label}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border"
                      style={{ background: 'rgba(79,152,163,0.07)', borderColor: 'rgba(79,152,163,0.22)', color: T.teal }}>
                      {icon}{label}
                    </span>
                  ))}
                </div>                
                
                {/* What the analyzer checks — tag style */}
                <div className="rounded-xl p-4 text-left" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: T.teal }}>What the analyzer checks</p>                  
                  <div className="grid grid-cols-2 gap-2">
                    {['End-use & end-user restrictions','Re-export transfer controls','Recordkeeping requirements','Audit rights & certifications','Licensing contingencies','Regulatory change procedures'].map(item => (
                      <div key={item} className="flex items-start gap-2 text-xs" style={{ color: T.body }}>
                        <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: T.teal }} />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ════ RESULTS ════════════════════════════════════════════════ */}
            {result && !isLoading && !error && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Retrieval quality warning */}
                {(result as any).retrievalWarning && (
                  <div className="flex items-start gap-2.5 rounded-xl border px-4 py-3"
                    style={{ background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.3)', color: '#92400e' }}>
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                    <span className="flex-1 text-xs">{(result as any).retrievalWarningMessage}</span>
                    <button onClick={() => handleReviewContract(false)}
                      className="text-xs font-bold underline underline-offset-2 whitespace-nowrap" style={{ color: '#92400e' }}>
                      Re-run
                    </button>
                  </div>
                )}

                {/* ── Risk banner ── */}
                <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                  <RSection icon={<TrendingUp className="w-3.5 h-3.5" />} title="Risk Assessment" subtitle="Overall contract compliance posture" />
                  <div className="p-5">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                      {/* Score circle */}
                      <div className="relative flex-shrink-0 w-20 h-20">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                          <path strokeWidth="3.2" stroke="rgba(180,185,190,0.22)" fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                          <path strokeWidth="3.2" strokeDasharray={`${result.riskScore}, 100`}
                            strokeLinecap="round" stroke={rC.icon} fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-bold" style={{ color: rC.icon }}>{result.riskScore}</span>
                          <span className="text-[9px] font-semibold uppercase" style={{ color: T.muted }}>/ 100</span>
                        </div>
                      </div>

                      <div className="flex-1 space-y-2 w-full">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: rC.text, fontFamily: 'var(--font-heading)' }}>
                            {result.overallRisk === 'HIGH'   && <ShieldAlert className="w-4 h-4" style={{ color: rC.icon }} />}
                            {result.overallRisk === 'MEDIUM' && <AlertTriangle className="w-4 h-4" style={{ color: rC.icon }} />}
                            {result.overallRisk === 'LOW'    && <CheckCircle className="w-4 h-4" style={{ color: rC.icon }} />}
                            {result.overallRisk} RISK
                          </span>
                          <RiskBadge level={result.overallRisk as any} />
                        </div>

                        {/* Clause status bar */}
                        <div className="w-full h-2 rounded-full overflow-hidden flex" style={{ background: T.border }}>
                          {adequateCount > 0 && <div className="h-full" style={{ width: `${(adequateCount/result.clauseAudit.length)*100}%`, background: '#10b981' }} />}
                          {weakCount     > 0 && <div className="h-full" style={{ width: `${(weakCount/result.clauseAudit.length)*100}%`,     background: '#f59e0b' }} />}
                          {missingCount  > 0 && <div className="h-full" style={{ width: `${(missingCount/result.clauseAudit.length)*100}%`,  background: '#ef4444' }} />}
                        </div>
                        <div className="flex gap-4">
                          {[
                            { l: 'Adequate', v: adequateCount, c: '#10b981' },
                            { l: 'Weak',     v: weakCount,     c: '#f59e0b' },
                            { l: 'Missing',  v: missingCount,  c: '#ef4444' },
                          ].map(x => (
                            <div key={x.l} className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ background: x.c }} />
                              <span className="text-[10px] font-semibold" style={{ color: T.muted }}>{x.v} {x.l}</span>
                            </div>
                          ))}
                        </div>

                        {/* Jurisdiction scores */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {jurisdictions.map(j => {
                            const count = result.clauseAudit.filter(c => (c.jurisdiction === j || c.jurisdiction === 'Both') && c.status !== 'ADEQUATE').length;
                            const flag = j === 'SCOMET_INDIA' ? '🇮🇳' : '🇺🇸';
                            const label = j === 'SCOMET_INDIA' ? 'SCOMET' : 'EAR/BIS';
                            return (
                              <span key={j} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-semibold"
                                style={{ background: T.bg, borderColor: T.border, color: T.muted }}>
                                {flag} {label}: <strong style={{ color: count > 0 ? '#ef4444' : '#10b981' }}>{count} gap{count !== 1 ? 's' : ''}</strong>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Dual jurisdiction alert inside risk card */}
                    {jurisdictions.includes('SCOMET_INDIA') && jurisdictions.includes('EAR_US') && getDualJurisdictionProps(result) && (
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: T.border }}>
                        <DualJurisdictionAlert {...getDualJurisdictionProps(result)!} />
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Contract Summary ── */}
                {result.contractSummary && Object.keys(result.contractSummary).some(k => !!(result.contractSummary as any)[k]) && (
                  <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                    <RSection icon={<FileSignature className="w-3.5 h-3.5" />} title="Contract Summary" />
                    <div className="p-4">
                      <div className="rounded-xl overflow-hidden border" style={{ borderColor: T.border }}>
                        <table className="w-full text-xs">
                          <tbody>
                            {[
                              { k: 'poReference',     l: 'PO / Reference'   },
                              { k: 'contractDate',    l: 'Contract Date'    },
                              { k: 'sellerName',      l: 'Seller'           },
                              { k: 'buyerName',       l: 'Buyer'            },
                              { k: 'buyerCountry',    l: 'Destination'      },
                              { k: 'totalOrderValue', l: 'Total Value'      },
                              { k: 'deliveryTerms',   l: 'Delivery Terms'   },
                              { k: 'governingLaw',    l: 'Governing Law'    },
                            ].filter(({ k }) => !!(result.contractSummary as any)[k]).map(({ k, l }, i, arr) => (
                              <tr key={k} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                                <td className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-r w-1/3"
                                  style={{ color: T.muted, borderColor: T.border, background: T.bg }}>{l}</td>
                                <td className="px-4 py-2" style={{ color: T.text }}>{(result.contractSummary as any)[k]}</td>
                              </tr>
                            ))}
                            {result.contractSummary?.products && result.contractSummary.products.length > 0 && (
                              <tr style={{ borderTop: `1px solid ${T.border}` }}>
                                <td className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-r"
                                  style={{ color: T.muted, borderColor: T.border, background: T.bg }}>Products</td>
                                <td className="px-4 py-2 space-y-0.5">
                                  {result.contractSummary.products.map((p, i) => (
                                    <div key={i} className="text-xs" style={{ color: T.text }}>
                                      {p.description}{p.quantity ? ` (×${p.quantity})` : ''}
                                    </div>
                                  ))}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Executive Summary ── */}
                <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                  <RSection icon={<Target className="w-3.5 h-3.5" />} title="Executive Summary"
                    subtitle="AI confidence & summary finding" />
                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Fact table */}
                      <div className="rounded-xl overflow-hidden border" style={{ borderColor: T.border }}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                              <th className="px-4 py-2 text-left font-bold uppercase tracking-wider text-[10px] w-1/2" style={{ color: T.muted }}>Factor</th>
                              <th className="px-4 py-2 text-left font-bold uppercase tracking-wider text-[10px]" style={{ color: T.muted }}>Assessment</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { l: 'Risk Rating',       v: <RiskBadge level={result.overallRisk as any} /> },
                              { l: 'Risk Score',        v: <span className="font-bold" style={{ color: T.text }}>{result.riskScore}/100</span> },
                              { l: 'Clauses Assessed',  v: <span className="font-bold" style={{ color: T.text }}>{result.clauseAudit.length}</span> },
                              { l: 'Jurisdictions',     v: <span style={{ color: T.body }}>{jurisdictions.join(', ')}</span> },
                              { l: 'AI Confidence',     v: (
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full"
                                    style={{ background: (result as any).confidenceScore >= 80 ? '#10b981' : (result as any).confidenceScore >= 50 ? '#f59e0b' : '#ef4444' }} />
                                  <span className="font-bold" style={{ color: T.text }}>{(result as any).confidenceScore ?? 75}%</span>
                                  <span className="text-[10px]" style={{ color: T.muted }}>— {(result as any).confidenceNote ?? 'Not assessed'}</span>
                                </div>
                              )},
                            ].map(({ l, v }, i, arr) => (
                              <tr key={i} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                                <td className="px-4 py-2 font-semibold text-[10px] uppercase tracking-wider border-r"
                                  style={{ color: T.muted, borderColor: T.border }}>{l}</td>
                                <td className="px-4 py-2">{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Narrative */}
                      <div className="rounded-xl p-4" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                        <span className="block text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: T.teal }}>Summary Finding</span>
                        <div className="markdown-body text-xs leading-relaxed" style={{ color: T.body }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent(result.summary) ?? 'No summary available.'}</ReactMarkdown>
                        </div>
                      </div>
                    </div>

                    {/* Regulatory grounding note */}
                    <div className="mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5"
                      style={{ background: 'rgba(79,152,163,0.05)', border: '1px solid rgba(79,152,163,0.18)' }}>
                      <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: T.teal }} />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: T.teal }}>
                          6 Mandatory Compliance Categories — Formally Grounded
                        </p>
                        <p className="text-[11px] leading-relaxed" style={{ color: T.body }}>
                          Derived from <strong>EAR Part 734/736/744/762 (15 CFR)</strong> and India's <strong>SCOMET Foreign Trade Policy 2023</strong>. Together they represent the minimum contractual obligations for dual-use export compliance under both jurisdictions.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Clause Audit Table ── */}
                <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                  <RSection
                    icon={<Layers className="w-3.5 h-3.5" />}
                    title="Clause Audit"
                    subtitle={`${result.clauseAudit.length} categories assessed`}
                    action={
                      <span className="text-[10px] px-2 py-1 rounded-full border font-medium"
                        style={{ background: T.bg, borderColor: T.border, color: T.muted }}>
                        Click row to expand
                      </span>
                    }
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10"
                        style={{ background: T.bg, color: T.muted, borderBottom: `1px solid ${T.border}` }}>
                        <tr>
                          {['Category','Status','Risk','Jurisdiction','Existing Clause','Citation',''].map((h, i) => (
                            <th key={i} className={`px-4 py-2.5 ${i === 5 ? 'hidden lg:table-cell' : ''} ${i === 4 ? 'hidden xl:table-cell' : ''}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.clauseAudit.map((clause, idx) => (
                          <React.Fragment key={idx}>
                            {/* Row */}
                            <tr
                              className="border-b cursor-pointer transition-colors"
                              style={{
                                borderColor: T.border,
                                background: selectedClause?.category === clause.category
                                  ? 'rgba(79,152,163,0.06)' : 'transparent',
                              }}
                              onMouseEnter={e => { if (selectedClause?.category !== clause.category) (e.currentTarget as HTMLTableRowElement).style.background = T.bg; }}
                              onMouseLeave={e => { if (selectedClause?.category !== clause.category) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                              onClick={() => setSelectedClause(selectedClause?.category === clause.category ? null : clause)}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 text-xs font-medium" style={{ color: T.text }}>
                                  {selectedClause?.category === clause.category
                                    ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: T.teal }} />
                                    : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: T.muted }} />}
                                  {clause.category}
                                </div>
                              </td>
                              <td className="px-4 py-3"><StatusChip status={clause.status} /></td>
                              <td className="px-4 py-3"><RiskChip risk={clause.riskLevel} /></td>
                              <td className="px-4 py-3 text-xs" style={{ color: T.muted }}>{clause.jurisdiction}</td>
                              <td className="px-4 py-3 text-[11px] max-w-[180px] truncate hidden xl:table-cell" style={{ color: T.muted }}>
                                {clause.extractedText ? `"${clause.extractedText.substring(0, 60)}…"` : '—'}
                              </td>
                              <td className="px-4 py-3 text-[10px] hidden lg:table-cell" style={{ color: T.muted }}>
                                {(() => {
                                  const raw = clause.citation?.split(';')[0] || '';
                                  if (!raw || raw.startsWith('Based on') || raw.startsWith('No specific')) return '—';
                                  const cleaned = raw.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
                                  return cleaned.replace('[Source: UPLOADED DOCUMENT,', '').replace(']', '').trim() || '—';
                                })()}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {selectedClause?.category === clause.category
                                  ? <ChevronUp className="w-3.5 h-3.5 inline" style={{ color: T.muted }} />
                                  : <ChevronDown className="w-3.5 h-3.5 inline" style={{ color: T.muted }} />}
                              </td>
                            </tr>

                            {/* Expanded detail */}
                            {selectedClause?.category === clause.category && (
                              <tr className="border-b" style={{ borderColor: T.border, background: T.bg }}>
                                <td colSpan={7} className="px-5 py-4">
                                  <div className="space-y-3 animate-in slide-in-from-top-1 duration-200">

                                    {/* Existing clause */}
                                    {clause.extractedText && (
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: T.muted }}>Existing Clause Text</p>
                                        <p className="text-xs italic p-3 rounded-lg border"
                                          style={{ color: T.body, background: T.surface, borderColor: T.border, lineHeight: 1.6 }}>
                                          "{clause.extractedText}"
                                        </p>
                                      </div>
                                    )}

                                    {/* Risk analysis */}
                                    <div className="rounded-xl p-3.5"
                                      style={{
                                        background: clause.status === 'ADEQUATE' ? 'rgba(16,185,129,0.06)' : clause.status === 'WEAK' ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)',
                                        border: `1px solid ${clause.status === 'ADEQUATE' ? 'rgba(16,185,129,0.22)' : clause.status === 'WEAK' ? 'rgba(245,158,11,0.22)' : 'rgba(239,68,68,0.22)'}`,
                                      }}>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        {clause.status === 'ADEQUATE' && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#10b981' }} />}
                                        {clause.status === 'WEAK'     && <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />}
                                        {clause.status === 'MISSING'  && <XCircle className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />}
                                        <span className="text-xs font-semibold" style={{
                                          fontFamily: 'var(--font-heading)',
                                          color: clause.status === 'ADEQUATE' ? '#065f46' : clause.status === 'WEAK' ? '#92400e' : '#7f1d1d',
                                        }}>Risk Analysis</span>
                                      </div>
                                      <div className="markdown-body text-xs leading-relaxed"
                                        style={{ color: clause.status === 'ADEQUATE' ? '#065f46' : clause.status === 'WEAK' ? '#92400e' : '#991b1b' }}>
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent(clause.riskReason)}</ReactMarkdown>
                                      </div>
                                    </div>

                                    {/* Generated clause */}
                                    {clause.status !== 'ADEQUATE' && clause.generatedClauseText && (
                                      <div>
                                        <div className="flex justify-between items-center mb-1.5">
                                          <div className="flex items-center gap-1.5" style={{ color: T.teal }}>
                                            <FileText className="w-3.5 h-3.5" />
                                            <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>Generated Compliant Clause Language</span>
                                          </div>
                                          <button
                                            onClick={e => { e.stopPropagation(); copyToClipboard(clause.generatedClauseText || ''); }}
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold transition-colors min-h-[32px]"
                                            style={{ background: T.bg, borderColor: T.border, color: T.muted }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = T.teal; (e.currentTarget as HTMLButtonElement).style.borderColor = T.borderActive; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = T.muted; (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; }}
                                            aria-label="Copy clause language">
                                            <Copy className="w-3 h-3" /> Copy
                                          </button>
                                        </div>
                                        <div className="rounded-xl p-4 shadow-inner"
                                          style={{ background: T.text }}>
                                          <p className="text-xs font-mono whitespace-pre-wrap leading-relaxed" style={{ color: '#4ade80' }}>
                                            {cleanContent(clause.generatedClauseText)}
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                    {/* Adequate confirmation */}
                                    {clause.status === 'ADEQUATE' && (
                                      <div className="flex items-center gap-2.5 rounded-xl px-4 py-3"
                                        style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.22)' }}>
                                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#10b981' }} />
                                        <p className="text-xs font-medium" style={{ color: '#065f46' }}>
                                          No remediation required. This clause adequately satisfies the regulatory requirement.
                                        </p>
                                      </div>
                                    )}

                                    {/* Citation */}
                                    <div className="flex items-start gap-1.5 text-[11px] p-3 rounded-lg border"
                                      style={{ background: T.surface, borderColor: T.border, color: T.muted }}>
                                      <span className="font-bold flex-shrink-0" style={{ color: T.text }}>Citations:</span>
                                      <span className="leading-relaxed">{clause.citation}</span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Cross-Jurisdiction Analysis ── */}
                {jurisdictions.includes('SCOMET_INDIA') && jurisdictions.includes('EAR_US') && (
                  <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                    <RSection icon={<LayoutGrid className="w-3.5 h-3.5" />} title="Cross-Jurisdiction Analysis" subtitle="SCOMET ↔ EAR clause overlap" />
                    <div className="p-5 space-y-3">
                      {getDualJurisdictionProps(result) && (
                        <DualJurisdictionAlert {...getDualJurisdictionProps(result)!} />
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { flag: '🇮🇳', label: 'SCOMET', j: 'SCOMET_INDIA' },
                          { flag: '🇺🇸', label: 'EAR/BIS', j: 'EAR_US' },
                        ].map(({ flag, label, j }) => {
                          const gaps = result.clauseAudit.filter(c => (c.jurisdiction === j || c.jurisdiction === 'Both') && c.status !== 'ADEQUATE').length;
                          return (
                            <div key={j} className="rounded-xl p-3.5 text-center border"
                              style={{ background: T.bg, borderColor: T.border }}>
                              <p className="text-lg mb-0.5">{flag}</p>
                              <p className="text-xs font-semibold mb-1" style={{ color: T.muted }}>{label}</p>
                              <p className="text-xl font-bold" style={{ color: gaps > 0 ? '#ef4444' : '#10b981' }}>{gaps}</p>
                              <p className="text-[10px]" style={{ color: T.muted }}>clause gap{gaps !== 1 ? 's' : ''}</p>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs italic" style={{ color: T.muted }}>
                        Contract clauses assessed against both SCOMET FTP 2023 and EAR 15 CFR §734–762 requirements.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Regulatory Citations ── */}
                {((result.chunksUsed && result.chunksUsed.length > 0) ||
                  (result.clauseAudit && result.clauseAudit.some(c => c.citation && c.citation !== 'N/A'))) && (
                  <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                    <RSection icon={<BookOpen className="w-3.5 h-3.5" />} title="Regulatory Citations" />
                    <div className="p-4">
                      {result.chunksUsed && result.chunksUsed.length > 0
                        ? <CitationsAccordion chunks={result.chunksUsed} />
                        : <CitationsAccordion chunks={result.clauseAudit.map(c => c.citation).filter(c => c && c !== 'N/A').flatMap(c => parseCitations(c))} />}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-1">
                  <button onClick={handleAskFollowUp}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm border transition-all duration-200 min-h-[44px]"
                    style={{ background: T.surface, color: T.text, borderColor: T.border }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = T.bg}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = T.surface}>
                    <MessageSquare className="w-4 h-4" style={{ color: T.teal }} />Ask Follow-up
                  </button>
                  <button onClick={handleDownloadReport}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-all duration-200 min-h-[44px]"
                    style={{ background: T.teal, boxShadow: '0 2px 8px rgba(79,152,163,0.28)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = T.tealHover}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = T.teal}>
                    <Download className="w-4 h-4" />Download Report
                  </button>
                </div>

                {/* Disclaimer */}
                <div className="pt-4 border-t text-center" style={{ borderColor: T.border }}>
                  <p className="text-[10px] max-w-2xl mx-auto" style={{ color: T.muted, opacity: 0.7 }}>
                    ⚠️ LEGAL DISCLAIMER: GloSilex is an AI-generated tool for informational purposes only. It does not constitute legal advice. Verify all compliance determinations with a qualified export control attorney before making shipping, licensing, or contractual decisions.
                  </p>
                </div>

              </div>
            )}

          </div>
        </div>
      </div>{/* end right panel */}
    </div>
  );
};
