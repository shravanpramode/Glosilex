import React, { useState, useRef, useEffect } from 'react';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, Copy, Download, Building2, FileCheck,
  MessageSquare, ChevronLeft, ChevronRight, ArrowRight, Info,
  Sparkles, GitBranch, Globe, Shield, BarChart3, Layers, BookOpen,
  TrendingUp, X, Zap, Target, LayoutGrid
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { extractTextFromFile, getFileTypeLabel } from '../utils/fileParser';
import { runICPChain, ICPResult, ICPGap, DocFlowStep, PartialICPData } from '../lib/icpService';
import { normalizeICPResult } from '../lib/reportService';
import { LoadingSteps } from '../components/LoadingSteps';
import { RiskBadge } from '../components/RiskBadge';
import { cleanContent } from '../utils/contentCleaner';
import { ProductSummaryCard } from '../components/ProductSummaryCard';
import { DualJurisdictionAlert } from '../components/DualJurisdictionAlert';
import { CitationsAccordion } from '../components/CitationsAccordion';
import { parseCitations } from '../utils/citations';
import { useNavigate } from 'react-router-dom';
import { saveIcpState, loadIcpState } from '../utils/sessionPersistence';
import { getSupabase } from '../services/supabase';
import { ICP_COMPONENT_GROUPS, CRITICALITY_CONFIG, matchGroupDocs, STATIC_DOC_FLOW } from '../lib/icpDocGroups';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  teal: 'var(--color-glosilex-teal-dim)',
  tealHover: 'var(--color-glosilex-teal)',
  text: 'var(--color-glosilex-light-text)',
  body: 'var(--color-glosilex-light-body)',
  muted: 'var(--color-glosilex-light-muted)',
  surface: 'var(--color-glosilex-light-surface)',
  bg: 'var(--color-glosilex-light-bg)',
  border: 'rgba(180,185,190,0.18)',
  borderActive: 'rgba(79,152,163,0.45)',
};

// ─── Compact inline label ─────────────────────────────────────────────────────
const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: T.muted }}>
    {children}
  </label>
);

// ─── Slim section divider with title ──────────────────────────────────────────
const PanelSection: React.FC<{
  icon: React.ReactNode;
  step: string;
  title: string;
  children: React.ReactNode;
}> = ({ icon, step, title, children }) => (
  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}`, background: T.surface }}>
    <div
      className="flex items-center gap-2 px-3 py-2 border-b"
      style={{ borderColor: T.border, background: 'rgba(79,152,163,0.04)' }}
    >
      <span
        className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
        style={{ background: T.teal, color: '#fff' }}
      >
        {step}
      </span>
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.teal }}>
        {icon}
        {title}
      </span>
    </div>
    <div className="p-3">{children}</div>
  </div>
);

// ─── Futuristic jurisdiction toggle (compact) ─────────────────────────────────
interface JurisdictionToggleProps {
  id: string;
  checked: boolean;
  onChange: () => void;
  flag: string;
  label: string;
  sub: string;
}
const JurisdictionToggle: React.FC<JurisdictionToggleProps> = ({ id, checked, onChange, flag, label, sub }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    id={id}
    onClick={onChange}
    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 min-h-[40px]"
    style={{
      background: checked ? 'linear-gradient(135deg,rgba(79,152,163,0.10) 0%,rgba(79,152,163,0.03) 100%)' : 'transparent',
      border: `1px solid ${checked ? T.borderActive : T.border}`,
    }}
  >
    <span className="text-sm leading-none select-none flex-shrink-0">{flag}</span>
    <div className="flex-1 text-left min-w-0">
      <div className="text-xs font-semibold leading-tight" style={{ color: checked ? T.teal : T.text }}>{label}</div>
      <div className="text-[10px] leading-tight mt-0.5" style={{ color: T.muted }}>{sub}</div>
    </div>
    <span
      className="relative flex-shrink-0 inline-flex items-center rounded-full transition-all duration-300"
      style={{ width: 32, height: 18, background: checked ? T.teal : 'rgba(150,155,160,0.3)' }}
    >
      <span
        className="absolute rounded-full bg-white shadow-sm transition-all duration-300"
        style={{ width: 12, height: 12, left: checked ? 17 : 3, top: 3 }}
      />
    </span>
  </button>
);

// ─── Right-pane section header ────────────────────────────────────────────────
const RSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ icon, title, subtitle, action }) => (
  <div
    className="flex items-center justify-between px-5 py-3 border-b"
    style={{ borderColor: T.border, background: 'rgba(79,152,163,0.03)' }}
  >
    <div className="flex items-center gap-2.5">
      <span
        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(79,152,163,0.12)', color: T.teal }}
      >
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

export const Icp: React.FC = () => {
  const [companyName, setCompanyName] = useState('');
  const [frozenCompanyName, setFrozenCompanyName] = useState('');
  const [hasExistingIcp, setHasExistingIcp] = useState(true);
  const [uploadedFileText, setUploadedFileText] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [jurisdictions, setJurisdictions] = useState<string[]>(['SCOMET_INDIA', 'EAR_US']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSteps, setLoadingSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [partialIcpData, setPartialIcpData] = useState<PartialICPData | null>(null);
  const [result, setResult] = useState<ICPResult | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try { const s = localStorage.getItem('icp_sidebar_open'); return s !== null ? JSON.parse(s) : true; }
    catch { return true; }
  });
  useEffect(() => { try { localStorage.setItem('icp_sidebar_open', JSON.stringify(isSidebarOpen)); } catch {} }, [isSidebarOpen]);

  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [sopToast, setSopToast] = useState<{
    label: string; type: string; bisRef: string; jurisdictionTags: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
    const fetchUser = async () => {
      try {
        const { data } = await getSupabase().auth.getUser();
        const id = data?.user?.id || 'anonymous';
        setUserId(id);

        const saved = loadIcpState(id);
        if (saved) {
          setCompanyName(saved.companyName);
          if (saved.frozenCompanyName) setFrozenCompanyName(saved.frozenCompanyName);
          setHasExistingIcp(saved.hasExistingIcp);
          setUploadedFileName(saved.uploadedFileName);
          setUploadedFileText(saved.uploadedFileText);
          setJurisdictions(saved.jurisdictions);
          if (saved.result) setResult(saved.result);
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
      saveIcpState(userId, { companyName, frozenCompanyName, hasExistingIcp, uploadedFileName, uploadedFileText, jurisdictions, result });
    }
  }, [userId, companyName, frozenCompanyName, hasExistingIcp, uploadedFileName, uploadedFileText, jurisdictions, result]);

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

  const handleJurisdictionToggle = (j: string) =>
    setJurisdictions(prev => prev.includes(j) ? prev.filter(x => x !== j) : [...prev, j]);

  const handleRunAssessment = async (resumeFromPartial = false) => {
    if (!resumeFromPartial) setPartialIcpData(null);
    if (!companyName.trim()) { alert('Please enter a company name.'); return; }
    if (jurisdictions.length === 0) { alert('Please select at least one jurisdiction.'); return; }
    if (hasExistingIcp && !uploadedFileText) { alert('Please upload an ICP document or select "Start fresh".'); return; }
    setIsLoading(true); setFrozenCompanyName(companyName); setResult(null); setError(null);
    setLoadingSteps(['Extracting ICP structure...','Mapping against SCOMET requirements...','Mapping against EAR requirements...','Identifying compliance gaps...','Generating SOP language...','Building documentation flow...']);
    setCurrentStep(0);
    try {
      const assessmentResult = await runICPChain(
        hasExistingIcp ? (uploadedFileText || '') : '',
        companyName,
        jurisdictions,
        (step) => {
          setRetryStatus(null);
          if (step.includes('Extracting')) setCurrentStep(0);
          else if (step.includes('SCOMET')) setCurrentStep(1);
          else if (step.includes('EAR')) setCurrentStep(2);
          else if (step.includes('gaps') || step.includes('gap')) setCurrentStep(3);
          else if (step.includes('SOP')) setCurrentStep(4);
          else if (step.includes('flow')) setCurrentStep(5);
        },
        (attempt, delayMs, reason) => {
          setRetryStatus(
            `Gemini ${reason === '429 rate-limit' ? 'rate limited' : 'overloaded'} — retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt}/6)`
          );
          setTimeout(() => setRetryStatus(null), delayMs + 200);
        },
        (partial) => setPartialIcpData(partial),
        resumeFromPartial ? (partialIcpData ?? undefined) : undefined
      );
      setResult(assessmentResult);
      setPartialIcpData(null);
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

  const getIcpNarrative = (res: ICPResult, name: string): string => {
    const p = res.gapAnalysis.filter(g => g.status === 'Present').length;
    const partial = res.gapAnalysis.filter(g => g.status === 'Partial').length;
    const m = res.gapAnalysis.filter(g => g.status === 'Missing').length;
    const p1 = res.gapAnalysis.filter(g => g.priority === 'P1' && g.status !== 'Present').length;
    const score = Math.round(res.overallScore);
    if (score >= 80 && p1 === 0) return `${name}'s Internal Compliance Program demonstrates a strong compliance posture with ${p} of 14 standard components fully addressed under both SCOMET and EAR frameworks. The overall compliance score of ${score}% reflects a well-structured export control program.${partial > 0 ? ` ${partial} component(s) require minor enhancement to achieve full compliance.` : ' No significant gaps were identified.'} Annual review is recommended to maintain alignment with evolving DGFT and BIS requirements.`;
    if (score >= 50) return `${name}'s ICP requires targeted remediation before full export compliance can be confirmed. ${p} components are compliant, ${partial} are partially addressed, and ${m} are missing entirely.${p1 > 0 ? ` ${p1} critical P1 gap(s) must be remediated immediately before any controlled exports proceed.` : ''} The overall compliance score is ${score}%. Use the SOP language below for each gap to accelerate remediation.`;
    return `${name}'s ICP has significant compliance gaps under both SCOMET and EAR frameworks. ${m} of 14 standard components are missing or inadequate, resulting in an overall score of ${score}%.${p1 > 0 ? ` ${p1} critical P1 gap(s) require immediate attention — export operations involving controlled items should be paused until these are resolved.` : ''} The recommended SOP language for each gap is provided below to support rapid ICP build-out.`;
  };

  const scoreColor = (s: number) => s >= 80 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444';
  const scoreBg = (s: number) => s >= 80
    ? { bg: 'rgba(16,185,129,0.09)', border: 'rgba(16,185,129,0.28)', text: '#065f46' }
    : s >= 50
    ? { bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.28)', text: '#92400e' }
    : { bg: 'rgba(239,68,68,0.09)', border: 'rgba(239,68,68,0.28)', text: '#7f1d1d' };
  const copyToClipboard = (t: string) => { navigator.clipboard.writeText(t); alert('Copied to clipboard!'); };

  const presentCount = result?.gapAnalysis.filter(g => g.status === 'Present').length || 0;
  const partialCount = result?.gapAnalysis.filter(g => g.status === 'Partial').length || 0;
  const missingCount = result?.gapAnalysis.filter(g => g.status === 'Missing').length || 0;
  const p1Count = result?.gapAnalysis.filter(g => g.priority === 'P1' && g.status !== 'Present').length || 0;

  const handleAskFollowUp = () => navigate('/ask', {
    state: {
      initialQuery: `I have a follow-up question about my ICP gap analysis for ${companyName || 'my company'}.`,
      hiddenContext: `PREVIOUS ICP CONTEXT —\nCompany: ${companyName}\nICP Status: ${hasExistingIcp ? 'Reviewing existing ICP' : 'Building new ICP'}\n\nFull Analysis Result:\n${JSON.stringify(result, null, 2)}`,
      fromModule: 'ICP Review', sourceView: 'results'
    }
  });

  const handleDownloadReport = () => {
    if (!result) return;
    const reportData = normalizeICPResult(result, companyName || 'Company');
    (reportData as any).extractedSpecs = {
      productName: companyName || 'Not specified',
      keySpecifications: `ICP Assessment — Overall Score: ${Math.round(result.overallScore)}% | Present: ${presentCount} | Partial: ${partialCount} | Missing: ${missingCount}`,
      destination: 'Export destinations per ICP scope',
      endUse: 'Internal Compliance Program Gap Assessment',
      componentOrigin: hasExistingIcp ? 'Existing ICP document reviewed' : 'Building new ICP from scratch',
    };
    navigate('/report', { state: { reportData, fromModule: 'ICP Review' } });
  };

  const getDualJurisdictionProps = (result: ICPResult) => {
    if (result.scometScore >= 80 && result.earScore >= 80) return null;
    if (result.scometScore < 80 && result.earScore < 80) return {
      state: 'CONFIRMED' as const,
      message: '⚠️ Dual Jurisdiction Gaps — Compliance gaps identified under both SCOMET and EAR frameworks. Remediation required for both jurisdictions.',
    };
    return {
      state: 'POTENTIAL' as const,
      confirmedJurisdiction: result.scometScore < 80 ? 'SCOMET' : 'EAR',
      pendingJurisdiction: result.scometScore < 80 ? 'EAR' : 'SCOMET',
    };
  };

  // ─── Status chip ───────────────────────────────────────────────────────────
  const StatusChip = ({ status }: { status: string }) => {
    const cfg = status === 'Present'
      ? { bg: 'rgba(16,185,129,0.1)', color: '#065f46', icon: <CheckCircle2 className="w-3 h-3" /> }
      : status === 'Partial'
      ? { bg: 'rgba(245,158,11,0.1)', color: '#92400e', icon: <AlertTriangle className="w-3 h-3" /> }
      : { bg: 'rgba(239,68,68,0.1)', color: '#7f1d1d', icon: <XCircle className="w-3 h-3" /> };
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={{ background: cfg.bg, color: cfg.color }}>
        {cfg.icon}{status}
      </span>
    );
  };

  const PriorityChip = ({ priority }: { priority: string }) => {
    const cfg = priority === 'P1'
      ? { bg: 'rgba(239,68,68,0.1)', color: '#7f1d1d' }
      : priority === 'P2'
      ? { bg: 'rgba(245,158,11,0.1)', color: '#92400e' }
      : { bg: 'rgba(79,152,163,0.1)', color: T.teal };
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>{priority}</span>;
  };

  // ─── Render ────────────────────────────────────────────────────────────────
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

          {/* ── Panel header ── */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: T.border }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(79,152,163,0.12)', border: '1px solid rgba(79,152,163,0.25)' }}>
                <Building2 className="w-3.5 h-3.5" style={{ color: T.teal }} />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight" style={{ color: T.text, fontFamily: 'var(--font-heading)' }}>
                  ICP Gap Analyzer
                </h1>
                <p className="text-[10px] leading-tight mt-0.5" style={{ color: T.muted }}>
                  SCOMET · EAR · Compliance Assessment
                </p>
              </div>
            </div>
          </div>

          {/* ── Scrollable form ── */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-2.5">

            {/* ── 1 · Scope & Setup ── */}
            <PanelSection icon={<Shield className="w-3 h-3" />} step="1" title="Scope & Setup">
              <div className="space-y-2.5">
                <div>
                  <FieldLabel>Company Name</FieldLabel>
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Semiconductors"
                    className="w-full px-2.5 py-2 rounded-lg text-xs focus:outline-none transition-all duration-200"
                    style={{ background: T.bg, border: `1.5px solid ${T.border}`, color: T.text }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(79,152,163,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,152,163,0.08)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
                <div>
                  <FieldLabel>Existing ICP Document?</FieldLabel>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[true, false].map(val => (
                      <button key={String(val)} type="button" onClick={() => setHasExistingIcp(val)}
                        className="py-2 px-2 text-[11px] font-medium rounded-lg transition-all duration-200 min-h-[36px]"
                        style={{
                          background: hasExistingIcp === val ? 'rgba(79,152,163,0.10)' : 'transparent',
                          border: `1.5px solid ${hasExistingIcp === val ? T.borderActive : T.border}`,
                          color: hasExistingIcp === val ? T.teal : T.body,
                        }}>
                        {val ? '✓ Yes, I have one' : '+ Start fresh'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </PanelSection>

            {/* ── 2 · ICP Document (conditional) ── */}
            {hasExistingIcp && (
              <PanelSection icon={<FileText className="w-3 h-3" />} step="2" title="ICP Document">
                <div className="space-y-2">
                  <textarea
                    className="w-full px-2.5 py-2 text-xs rounded-lg resize-none focus:outline-none transition-all duration-200"
                    style={{ background: T.bg, border: `1.5px solid ${T.border}`, color: T.text, minHeight: 110, lineHeight: 1.55 }}
                    rows={6}
                    value={uploadedFileText || ''}
                    onChange={e => { setUploadedFileText(e.target.value); if (e.target.value && uploadedFileName) setUploadedFileName(null); }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(79,152,163,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,152,163,0.08)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none'; }}
                    placeholder={`Paste ICP text here, or upload a file.\n\nInclude:\n• Policy scope & products\n• Screening procedures\n• Training & recordkeeping\n• Date of last update`}
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
                    onMouseLeave={e => { if (!uploadedFileName) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(79,152,163,0.3)'; }}
                  >
                    {uploadedFileName
                      ? <FileText className="h-4 w-4 flex-shrink-0" style={{ color: T.teal }} />
                      : <Upload className="h-4 w-4 flex-shrink-0" style={{ color: T.muted }} />}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium" style={{ color: uploadedFileName ? T.teal : T.muted }}>
                        {uploadedFileName ? 'Change file' : 'Upload PDF / DOCX / TXT'}
                      </div>
                      {uploadedFileName && (
                        <div className="text-[10px] truncate" style={{ color: T.muted }}>{getFileTypeLabel(uploadedFileName)}</div>
                      )}
                    </div>
                    {!uploadedFileName && <span className="text-[10px] flex-shrink-0" style={{ color: T.muted }}>up to 10MB</span>}
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload}
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden" />
                </div>
              </PanelSection>
            )}

            {/* ── 3 · Jurisdictions ── */}
            <PanelSection icon={<Globe className="w-3 h-3" />} step={hasExistingIcp ? '3' : '2'} title="Jurisdictions">
              <div className="space-y-1.5">
                <JurisdictionToggle
                  id="icpScomet"
                  checked={jurisdictions.includes('SCOMET_INDIA')}
                  onChange={() => handleJurisdictionToggle('SCOMET_INDIA')}
                  flag="🇮🇳" label="India SCOMET" sub="DGFT · HBP 2023 Ch.10"
                />
                <JurisdictionToggle
                  id="icpEar"
                  checked={jurisdictions.includes('EAR_US')}
                  onChange={() => handleJurisdictionToggle('EAR_US')}
                  flag="🇺🇸" label="US EAR / BIS" sub="15 CFR §730–774"
                />
              </div>
            </PanelSection>

            {/* Quick checklist hint */}
            {result && (
              <div className="rounded-lg px-3 py-2.5 flex items-start gap-2"
                style={{ background: 'rgba(79,152,163,0.05)', border: `1px solid rgba(79,152,163,0.18)` }}>
                <BarChart3 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: T.teal }} />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.teal }}>Last Run</div>
                  <div className="text-[10px] mt-0.5" style={{ color: T.muted }}>
                    {frozenCompanyName} · Score: <strong style={{ color: T.text }}>{Math.round(result.overallScore)}%</strong>
                  </div>
                  <div className="flex gap-2 mt-1">
                    {[
                      { l: 'P', v: presentCount, c: '#10b981' },
                      { l: 'Pa', v: partialCount, c: '#f59e0b' },
                      { l: 'M', v: missingCount, c: '#ef4444' },
                    ].map(x => (
                      <span key={x.l} className="text-[10px] font-bold" style={{ color: x.c }}>{x.v} {x.l}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>{/* end scrollable */}

          {/* ── CTA ── */}
          <div className="flex-shrink-0 px-3 py-3 border-t" style={{ borderColor: T.border, background: T.surface }}>
            <button
              onClick={() => handleRunAssessment(false)}
              disabled={isLoading || !companyName || (hasExistingIcp && !uploadedFileText) || jurisdictions.length === 0}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white transition-all duration-200 min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: T.teal, boxShadow: '0 2px 10px rgba(79,152,163,0.28)' }}
              onMouseEnter={e => { if (!(e.currentTarget as HTMLButtonElement).disabled) (e.currentTarget as HTMLButtonElement).style.background = T.tealHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.teal; }}
            >
              {isLoading ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
              ) : (
                <><Zap className="w-4 h-4" />Run ICP Assessment<ArrowRight className="w-3.5 h-3.5 ml-auto" /></>
              )}
            </button>
          </div>
        </div>
      </div>{/* end left panel */}

      {/* ── SIDEBAR TOGGLE ── */}
      <div className="hidden md:block absolute top-5 z-40 transition-all duration-300"
        style={{ left: isSidebarOpen ? 'min(333px, calc(32% - 7px))' : 10 }}>
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="flex items-center justify-center rounded-full shadow-md hover:shadow-lg transition-all duration-200"
          style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted, width: 26, height: 26 }}
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isSidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* ════ RIGHT PANEL ════════════════════════════════════════════════════ */}
      <div className="flex-1 h-full overflow-y-auto" style={{ background: T.bg }}>
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
              <button onClick={() => handleRunAssessment(!!partialIcpData)}
                className="font-semibold py-2.5 px-6 rounded-xl text-white text-sm transition-colors min-h-[44px]"
                style={{ background: T.teal }}>
                {partialIcpData
                  ? `Resume from Step ${partialIcpData.lastCompletedStep + 1} of 6`
                  : 'Retry Assessment'}
              </button>
              {partialIcpData && (
                <button
                  onClick={() => handleRunAssessment(false)}
                  style={{
                    marginTop: 8,
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: `1px solid ${T.border}`,
                    background: 'transparent',
                    color: T.muted,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
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
              {/* Decorative grid lines */}
              <div className="relative mx-auto mb-6" style={{ width: 72, height: 72 }}>
                <div className="absolute inset-0 rounded-2xl opacity-20"
                  style={{ background: 'repeating-linear-gradient(0deg,transparent,transparent 8px,rgba(79,152,163,0.3) 8px,rgba(79,152,163,0.3) 9px),repeating-linear-gradient(90deg,transparent,transparent 8px,rgba(79,152,163,0.3) 8px,rgba(79,152,163,0.3) 9px)' }} />
                <div className="absolute inset-0 rounded-2xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,rgba(79,152,163,0.12),rgba(1,105,111,0.06))', border: '1.5px solid rgba(79,152,163,0.25)' }}>
                  <FileCheck className="w-8 h-8" style={{ color: T.teal }} />
                </div>
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: T.text, fontFamily: 'var(--font-heading)' }}>
                Ready for Assessment
              </h3>
              <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: T.muted }}>
                Configure your company details and ICP scope in the left panel, then click <strong style={{ color: T.teal }}>Run ICP Assessment</strong>.
              </p>
              {/* Feature chips */}
              <div className="flex flex-wrap justify-center gap-2 mt-5">
                {['14 ICP Components','SCOMET & EAR Mapping','SOP Generation','Doc Flow'].map(chip => (
                  <span key={chip} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border"
                    style={{ background: T.bg, borderColor: T.border, color: T.muted }}>
                    <Sparkles className="w-2.5 h-2.5" style={{ color: T.teal }} />
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ════ RESULTS ════════════════════════════════════════════════════ */}
          {result && !isLoading && !error && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* Dual jurisdiction banner */}
              {jurisdictions.includes('SCOMET_INDIA') && jurisdictions.includes('EAR_US') &&
                getDualJurisdictionProps(result) && (
                  <DualJurisdictionAlert {...getDualJurisdictionProps(result)!} />
              )}

              {/* Product summary */}
              <ProductSummaryCard data={{
                productName: frozenCompanyName || 'Not specified',
                keySpecifications: `ICP Assessment — Overall Score: ${Math.round(result.overallScore)}% | Present: ${presentCount} | Partial: ${partialCount} | Missing: ${missingCount}`,
                destination: 'Export destinations per ICP scope',
                endUse: 'Internal Compliance Program Gap Assessment',
                componentOrigin: hasExistingIcp ? 'Existing ICP document reviewed' : 'Building new ICP from scratch',
              }} />

              {/* ── Score card ── */}
              <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                <RSection
                  icon={<TrendingUp className="w-3.5 h-3.5" />}
                  title="Compliance Score"
                  subtitle="ICP Gap Assessment Overview"
                />
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    {/* Donut */}
                    <div className="relative flex-shrink-0" style={{ width: 88, height: 88 }}>
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path strokeWidth="3.2" stroke="rgba(180,185,190,0.25)" fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path strokeWidth="3.2" strokeDasharray={`${result.overallScore}, 100`}
                          strokeLinecap="round" stroke={scoreColor(result.overallScore)} fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold" style={{ color: scoreColor(result.overallScore) }}>
                          {Math.round(result.overallScore)}%
                        </span>
                      </div>
                    </div>

                    {/* Score details */}
                    <div className="flex-1 space-y-2 w-full">
                      <div className="flex flex-wrap gap-2">
                        <span className="text-sm font-bold" style={{ color: T.text, fontFamily: 'var(--font-heading)' }}>
                          Overall Compliance Score
                        </span>
                        <RiskBadge level={p1Count > 0 ? (result.overallScore <= 50 ? 'HIGH' : 'MEDIUM') : (result.overallScore < 50 ? 'HIGH' : result.overallScore < 80 ? 'MEDIUM' : 'LOW')} />
                      </div>

                      {/* Per-jurisdiction pills */}
                      <div className="flex flex-wrap gap-2">
                        {jurisdictions.includes('SCOMET_INDIA') && (() => {
                          const s = scoreBg(result.scometScore);
                          return (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                              style={{ background: s.bg, borderColor: s.border }}>
                              <span className="text-[10px] font-bold" style={{ color: s.text }}>🇮🇳 SCOMET</span>
                              <div className="flex-1 w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                                <div className="h-full rounded-full" style={{ width: `${result.scometScore}%`, background: scoreColor(result.scometScore) }} />
                              </div>
                              <span className="text-[10px] font-bold" style={{ color: s.text }}>{Math.round(result.scometScore)}%</span>
                            </div>
                          );
                        })()}
                        {jurisdictions.includes('EAR_US') && (() => {
                          const s = scoreBg(result.earScore);
                          return (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                              style={{ background: s.bg, borderColor: s.border }}>
                              <span className="text-[10px] font-bold" style={{ color: s.text }}>🇺🇸 EAR/BIS</span>
                              <div className="flex-1 w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                                <div className="h-full rounded-full" style={{ width: `${result.earScore}%`, background: scoreColor(result.earScore) }} />
                              </div>
                              <span className="text-[10px] font-bold" style={{ color: s.text }}>{Math.round(result.earScore)}%</span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Present/Partial/Missing bar */}
                      <div className="w-full h-2 rounded-full overflow-hidden flex" style={{ background: T.border }}>
                        {presentCount > 0 && <div className="h-full" style={{ width: `${(presentCount/14)*100}%`, background: '#10b981' }} />}
                        {partialCount > 0 && <div className="h-full" style={{ width: `${(partialCount/14)*100}%`, background: '#f59e0b' }} />}
                        {missingCount > 0 && <div className="h-full" style={{ width: `${(missingCount/14)*100}%`, background: '#ef4444' }} />}
                      </div>
                      <div className="flex gap-4">
                        {[
                          { l: 'Present', v: presentCount, c: '#10b981' },
                          { l: 'Partial', v: partialCount, c: '#f59e0b' },
                          { l: 'Missing', v: missingCount, c: '#ef4444' },
                        ].map(x => (
                          <div key={x.l} className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ background: x.c }} />
                            <span className="text-[10px] font-semibold" style={{ color: T.muted }}>{x.v} {x.l}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Dual alert */}
                  {jurisdictions.includes('SCOMET_INDIA') && jurisdictions.includes('EAR_US') &&
                    getDualJurisdictionProps(result) && (
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: T.border }}>
                        <DualJurisdictionAlert {...getDualJurisdictionProps(result)!} />
                      </div>
                  )}
                </div>
              </div>

              {/* ── Exec Summary table ── */}
              <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                <RSection icon={<Target className="w-3.5 h-3.5" />} title="Executive Summary" />
                <div className="p-4">
                  {/* Narrative */}
                  <p className="text-sm leading-relaxed mb-4" style={{ color: T.body }}>
                    {getIcpNarrative(result, frozenCompanyName || 'Your company')}
                  </p>
                  {/* Compact fact table */}
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: T.border }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                          <th className="px-4 py-2 text-left font-bold uppercase tracking-wider text-[10px] w-1/3" style={{ color: T.muted }}>Factor</th>
                          <th className="px-4 py-2 text-left font-bold uppercase tracking-wider text-[10px]" style={{ color: T.muted }}>Assessment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Risk Rating', value: <RiskBadge level={p1Count > 0 ? (result.overallScore <= 50 ? 'HIGH' : 'MEDIUM') : (result.overallScore < 50 ? 'HIGH' : result.overallScore < 80 ? 'MEDIUM' : 'LOW')} /> },
                          { label: 'Overall Score', value: <span className="font-bold" style={{ color: T.text }}>{Math.round(result.overallScore)}%</span> },
                          ...(jurisdictions.includes('SCOMET_INDIA') ? [{ label: 'SCOMET Score', value: <span className="font-bold" style={{ color: T.text }}>{Math.round(result.scometScore)}%</span> }] : []),
                          ...(jurisdictions.includes('EAR_US') ? [{ label: 'EAR Score', value: <span className="font-bold" style={{ color: T.text }}>{Math.round(result.earScore)}%</span> }] : []),
                        ].map((row, i, arr) => (
                          <tr key={i} style={{ borderBottom: i < arr.length-1 ? `1px solid ${T.border}` : 'none' }}>
                            <td className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider border-r" style={{ color: T.muted, borderColor: T.border }}>{row.label}</td>
                            <td className="px-4 py-2">{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ── Gap Analysis Table ── */}
              <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                <RSection
                  icon={<Layers className="w-3.5 h-3.5" />}
                  title="Gap Analysis & SOP Generation"
                  subtitle="14 Standard ICP Components"
                  action={
                    <span className="text-[10px] px-2 py-1 rounded-full border font-medium" style={{ background: T.bg, borderColor: T.border, color: T.muted }}>
                      Click row to expand SOP
                    </span>
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10"
                      style={{ background: T.bg, color: T.muted, borderBottom: `1px solid ${T.border}` }}>
                      <tr>
                        {['#','Component','Status','Juris.','Priority','Gap Description','Citation',''].map((h, i) => (
                          <th key={i} className={`px-4 py-2.5 ${i === 0 ? 'w-8 text-center' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.gapAnalysis.map((gap, idx) => (
                        <React.Fragment key={idx}>
                          <tr
                            className="border-b cursor-pointer transition-colors"
                            style={{ borderColor: T.border, background: expandedRow === idx ? T.bg : 'transparent' }}
                            onMouseEnter={e => { if (expandedRow !== idx) (e.currentTarget as HTMLTableRowElement).style.background = T.bg; }}
                            onMouseLeave={e => { if (expandedRow !== idx) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                            onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                          >
                            <td className="px-4 py-3 text-center text-[10px] font-mono" style={{ color: T.muted }}>{idx + 1}</td>
                            <td className="px-4 py-3 font-medium text-xs" style={{ color: T.text, maxWidth: 140 }}>{gap.component}</td>
                            <td className="px-4 py-3"><StatusChip status={gap.status} /></td>
                            <td className="px-4 py-3 text-xs" style={{ color: T.body }}>{gap.jurisdiction}</td>
                            <td className="px-4 py-3"><PriorityChip priority={gap.priority} /></td>
                            <td className="px-4 py-3" style={{ maxWidth: 220 }}>
                              <div className="markdown-body text-[11px]" style={{ color: T.body }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent(gap.gapDescription)}</ReactMarkdown>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[10px]" style={{ color: T.muted, maxWidth: 100 }}>{gap.citation}</td>
                            <td className="px-4 py-3 text-right">
                              {expandedRow === idx
                                ? <ChevronUp className="w-3.5 h-3.5 inline" style={{ color: T.muted }} />
                                : <ChevronDown className="w-3.5 h-3.5 inline" style={{ color: T.muted }} />}
                            </td>
                          </tr>

                          {/* Expanded row */}
                          {expandedRow === idx && (
                            <tr className="border-b" style={{ borderColor: T.border, background: T.bg }}>
                              <td colSpan={8} className="px-5 py-4">
                                <div className="space-y-3">
                                  {/* Evidence */}
                                  <div className="rounded-xl p-3.5"
                                    style={{
                                      background: gap.status === 'Present' ? 'rgba(16,185,129,0.06)' : gap.status === 'Partial' ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)',
                                      border: `1px solid ${gap.status === 'Present' ? 'rgba(16,185,129,0.22)' : gap.status === 'Partial' ? 'rgba(245,158,11,0.22)' : 'rgba(239,68,68,0.22)'}`,
                                    }}>
                                    <div className="flex items-center gap-1.5 mb-1.5"
                                      style={{ color: gap.status === 'Present' ? '#065f46' : gap.status === 'Partial' ? '#92400e' : '#7f1d1d' }}>
                                      {gap.status === 'Present' && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#10b981' }} />}
                                      {gap.status === 'Partial' && <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />}
                                      {gap.status === 'Missing' && <XCircle className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />}
                                      <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
                                        {gap.status === 'Present' ? 'Evidence of Compliance' : gap.status === 'Partial' ? 'Partial Evidence Found' : 'No Evidence Found'}
                                      </span>
                                    </div>
                                    <p className="text-xs italic"
                                      style={{ color: gap.status === 'Present' ? '#065f46' : gap.status === 'Partial' ? '#92400e' : '#991b1b' }}>
                                      {gap.evidence
                                        ? gap.evidence.replace(/[{}"]/g, '').replace(/,\s*/g, ' · ')
                                        : gap.status === 'Present' ? 'Component identified as present in the uploaded ICP document.'
                                          : gap.status === 'Partial' ? 'Partial coverage identified — see gap description for details.'
                                          : 'This component was not identified in the uploaded ICP document.'}
                                    </p>
                                    <div className="mt-1.5 text-[10px]" style={{ color: T.muted }}>
                                      <span className="font-semibold">Regulatory basis: </span>{gap.citation}
                                    </div>
                                  </div>

                                  {/* SOP */}
                                  {gap.status !== 'Present' && gap.sopText && (
                                    <div className="rounded-xl p-3.5"
                                      style={{ background: T.surface, border: `1px solid rgba(79,152,163,0.2)` }}>
                                      <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-1.5" style={{ color: T.teal }}>
                                          <FileText className="w-3.5 h-3.5" />
                                          <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>Recommended SOP Language</span>
                                        </div>
                                        <button onClick={e => { e.stopPropagation(); copyToClipboard(gap.sopText || ''); }}
                                          className="p-1.5 rounded-md flex items-center justify-center transition-colors min-h-[32px] min-w-[32px]"
                                          style={{ color: T.muted }}
                                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = T.teal}
                                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = T.muted}
                                          title="Copy SOP" aria-label="Copy SOP language to clipboard">
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      <div className="text-xs p-3 rounded-lg border markdown-body"
                                        style={{ color: T.body, background: T.bg, borderColor: T.border, fontSize: '0.75rem', lineHeight: 1.6 }}>
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent(gap.sopText)}</ReactMarkdown>
                                      </div>
                                    </div>
                                  )}

                                  {gap.status === 'Present' && (
                                    <p className="text-xs px-3 py-2 rounded-lg border"
                                      style={{ color: '#065f46', background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.22)' }}>
                                      ✅ No SOP action required. This component is adequately addressed in the current ICP.
                                    </p>
                                  )}
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

              {/* ── Documentation Flow ── */}
              {(() => {
                const docFlowToUse = STATIC_DOC_FLOW;
                return (
                  <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                    <RSection
                      icon={<BookOpen className="w-3.5 h-3.5" />}
                      title="Recommended Documentation Flow"
                      subtitle={`${docFlowToUse.length} documents · BIS EMCP Guidelines & DGFT HBP 2023 Ch.10`}
                      action={
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(['Foundational', 'Operational', 'Governance'] as const).map(level => (
                            <span key={level} className={`flex items-center gap-1 text-[9px] rounded-full px-2 py-0.5 border font-medium ${CRITICALITY_CONFIG[level].badge}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${CRITICALITY_CONFIG[level].dot}`} />
                              {level}
                            </span>
                          ))}
                        </div>
                      }
                    />

                    {/* Ref banner */}
                    <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg px-3.5 py-2 text-xs"
                      style={{ background: 'rgba(79,152,163,0.05)', border: '1px solid rgba(79,152,163,0.18)', color: T.teal }}>
                      <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        Derived from <strong>BIS EAR 15 CFR §730–774</strong> and <strong>DGFT HBP 2023 Ch.10 (SCOMET)</strong>.
                        All documents are mandatory for full export authorization eligibility under both jurisdictions.
                      </span>
                    </div>

                    {/* Component groups */}
                    <div className="p-4 space-y-2.5">
                      {ICP_COMPONENT_GROUPS.map((group, groupIdx) => {
                        const groupDocs = matchGroupDocs(group, docFlowToUse);
                        if (groupDocs.length === 0) return null;
                        const cfg = CRITICALITY_CONFIG[group.criticality];
                        return (
                          <div key={groupIdx} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
                            <div className="flex items-center justify-between px-3.5 py-2 border-b"
                              style={{ background: T.bg, borderColor: T.border }}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                <span className="text-xs font-semibold" style={{ color: T.text }}>{group.component}</span>
                                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${cfg.badge}`}>{group.criticality}</span>
                                <span className="text-[9px] font-mono hidden sm:inline" style={{ color: T.muted }}>{group.bisRef}</span>
                              </div>
                              <span className="text-[10px]" style={{ color: T.muted }}>{groupDocs.length} doc{groupDocs.length > 1 ? 's' : ''}</span>
                            </div>
                            <div className={`p-2.5 ${groupDocs.length > 1 ? 'grid grid-cols-1 md:grid-cols-2 gap-2' : ''}`}>
                              {groupDocs.map((step, docIdx) => (
                                <button key={docIdx}
                                  onClick={() => setSopToast({ label: step.label, type: step.type, bisRef: group.bisRef, jurisdictionTags: step.jurisdictionTags ?? [] })}
                                  className="w-full text-left flex items-center gap-2.5 rounded-lg p-2.5 transition-all group cursor-pointer"
                                  style={{ background: T.surface, border: `1px solid ${T.border}` }}
                                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'rgba(79,152,163,0.38)'; b.style.background = 'rgba(79,152,163,0.05)'; }}
                                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = T.border; b.style.background = T.surface; }}>
                                  <div className="flex-shrink-0 w-6 h-6 font-bold text-[10px] rounded-full flex items-center justify-center"
                                    style={{ background: 'rgba(79,152,163,0.1)', color: T.teal, border: '1px solid rgba(79,152,163,0.2)', fontFamily: 'var(--font-heading)' }}>
                                    {step.stepNumber}
                                  </div>
                                  <div className="flex-grow min-w-0">
                                    <p className="text-xs font-medium truncate" style={{ color: T.text }}>{step.label}</p>
                                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                                        style={{
                                          background: step.type === 'Policy' ? 'rgba(147,51,234,0.1)' : step.type === 'Procedure' ? 'rgba(79,152,163,0.1)' : step.type === 'Record' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                                          color: step.type === 'Policy' ? '#6b21a8' : step.type === 'Procedure' ? T.teal : step.type === 'Record' ? '#065f46' : '#92400e',
                                        }}>
                                        {step.type}
                                      </span>
                                      {step.jurisdictionTags.map((tag: string) => (
                                        <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] font-medium border"
                                          style={{ background: T.bg, color: T.muted, borderColor: T.border }}>{tag}</span>
                                      ))}
                                      <span className="ml-auto text-[9px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 whitespace-nowrap" style={{ color: T.teal }}>
                                        <Sparkles className="w-2.5 h-2.5" />Generate SOP
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                            {group.dependencyNote && groupDocs.length > 1 && (
                              <div className="px-3.5 pb-2 flex items-center gap-1 text-[9px]" style={{ color: T.muted }}>
                                <GitBranch className="w-2.5 h-2.5 flex-shrink-0" />
                                <span>Order matters: {group.dependencyNote}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ── Phase 2 Modal ── */}
              {sopToast && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
                  onClick={() => setSopToast(null)}>
                  <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.32)' }} />
                  <div className="relative rounded-2xl shadow-2xl w-full max-w-md p-5 animate-in slide-in-from-bottom-4 duration-300"
                    style={{ background: T.surface, border: `1px solid ${T.border}` }}
                    onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgba(79,152,163,0.1)', border: '1px solid rgba(79,152,163,0.25)' }}>
                          <Sparkles className="w-5 h-5" style={{ color: T.teal }} />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: T.teal }}>Phase 2 Feature</p>
                          <h3 className="text-sm font-bold" style={{ color: T.text, fontFamily: 'var(--font-heading)' }}>SOP Template Generator</h3>
                        </div>
                      </div>
                      <button type="button" onClick={() => setSopToast(null)}
                        className="p-1.5 rounded-lg transition-colors" style={{ color: T.muted }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = T.text; (e.currentTarget as HTMLButtonElement).style.background = T.bg; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = T.muted; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Doc preview */}
                    <div className="rounded-xl p-3.5 mb-4"
                      style={{ background: 'rgba(79,152,163,0.05)', border: '1px solid rgba(79,152,163,0.18)' }}>
                      <p className="text-sm font-semibold mb-1.5" style={{ color: T.teal, fontFamily: 'var(--font-heading)' }}>{sopToast.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            background: sopToast.type === 'Policy' ? 'rgba(147,51,234,0.1)' : sopToast.type === 'Procedure' ? 'rgba(79,152,163,0.1)' : sopToast.type === 'Record' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                            color: sopToast.type === 'Policy' ? '#6b21a8' : sopToast.type === 'Procedure' ? T.teal : sopToast.type === 'Record' ? '#065f46' : '#92400e',
                          }}>{sopToast.type}</span>
                        {sopToast.jurisdictionTags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-medium border"
                            style={{ background: T.bg, color: T.muted, borderColor: T.border }}>{tag}</span>
                        ))}
                      </div>
                    </div>

                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: T.muted }}>What this will do</p>
                    <ul className="space-y-1.5 mb-4">
                      {[
                        `Generate a ready-to-use ${sopToast.type} draft in seconds`,
                        `Pre-fill regulatory references from ${sopToast.bisRef}`,
                        `Adapt clauses for ${sopToast.jurisdictionTags.join(' + ')} jurisdictions`,
                        'Export as .docx / .pdf — ready for ECO signature',
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs" style={{ color: T.body }}>
                          <span className="flex-shrink-0 font-bold mt-0.5" style={{ color: T.teal }}>✦</span>{item}
                        </li>
                      ))}
                    </ul>

                    <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                      style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.28)' }}>
                      <span className="text-sm flex-shrink-0">🚧</span>
                      <p className="text-xs font-medium" style={{ color: '#92400e' }}>
                        This feature is under active development and will be available in Phase 2.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Cross-Jurisdiction Analysis ── */}
              {jurisdictions.includes('SCOMET_INDIA') && jurisdictions.includes('EAR_US') && (
                <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                  <RSection icon={<LayoutGrid className="w-3.5 h-3.5" />} title="Cross-Jurisdiction Analysis" subtitle="SCOMET ↔ EAR overlap" />
                  <div className="p-5">
                    {getDualJurisdictionProps(result) && (
                      <div className="mb-4"><DualJurisdictionAlert {...getDualJurisdictionProps(result)!} /></div>
                    )}
                    {(() => {
                      const sharedGaps = result.gapAnalysis.filter(g => g.jurisdiction === 'Both' && g.status !== 'Present');
                      const scometOnly = result.gapAnalysis.filter(g => g.jurisdiction === 'SCOMET' && g.status !== 'Present');
                      const earOnly = result.gapAnalysis.filter(g => g.jurisdiction === 'EAR' && g.status !== 'Present');
                      const p1Both = result.gapAnalysis.filter(g => g.priority === 'P1' && g.status !== 'Present');
                      const worstScore = Math.min(result.scometScore, result.earScore);
                      return (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              { val: sharedGaps.length, label: 'Both Jurisdictions' },
                              { val: scometOnly.length, label: 'SCOMET Only' },
                              { val: earOnly.length, label: 'EAR Only' },
                            ].map(({ val, label }) => (
                              <div key={label} className="rounded-xl p-3 text-center border"
                                style={{ background: T.bg, borderColor: T.border }}>
                                <p className="text-xl font-bold" style={{ color: T.teal }}>{val}</p>
                                <p className="text-[9px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: T.muted }}>{label}</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-sm leading-relaxed" style={{ color: T.body }}>
                            {sharedGaps.length > 0
                              ? `${sharedGaps.length} gap${sharedGaps.length > 1 ? 's' : ''} affect both SCOMET and EAR simultaneously — a single remediation effort advances compliance under both frameworks. `
                              : 'No overlapping gaps were identified — SCOMET and EAR gaps are independent and require separate remediation tracks. '}
                            {p1Both.length > 0
                              ? `${p1Both.length} P1 critical gap${p1Both.length > 1 ? 's require' : ' requires'} immediate remediation: ${p1Both.map(g => g.component).join(', ')}.`
                              : 'No P1 critical gaps identified across either jurisdiction.'}
                          </p>
                          {/* Score bars */}
                          <div className="flex gap-4 rounded-xl px-4 py-3 border"
                            style={{ background: T.bg, borderColor: T.border }}>
                            {[
                              { flag: '🇮🇳', label: 'SCOMET', score: result.scometScore },
                              { flag: '🇺🇸', label: 'EAR', score: result.earScore },
                            ].map(({ flag, label, score }) => (
                              <div key={label} className="flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.muted }}>{flag} {label}</p>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(180,185,190,0.2)' }}>
                                    <div className="h-full rounded-full" style={{ width: `${score}%`, background: scoreColor(score) }} />
                                  </div>
                                  <span className="text-xs font-bold" style={{ color: T.text }}>{Math.round(score)}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs italic" style={{ color: T.muted }}>
                            {result.scometScore === result.earScore
                              ? `Both jurisdictions at equal score (${Math.round(result.scometScore)}%) — remediate P1 gaps first, then P2.`
                              : `Priority: remediate ${result.scometScore < result.earScore ? 'SCOMET' : 'EAR'} first (lower score at ${Math.round(worstScore)}%), then address P1 gaps across both.`}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* ── Regulatory Citations ── */}
              {((result.chunksUsed && result.chunksUsed.length > 0) ||
                (result.gapAnalysis && result.gapAnalysis.some(g => g.citation && g.citation !== 'N/A'))) && (
                <div className="rounded-2xl border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                  <RSection icon={<BookOpen className="w-3.5 h-3.5" />} title="Regulatory Citations" />
                  <div className="p-4">
                    {result.chunksUsed && result.chunksUsed.length > 0
                      ? <CitationsAccordion chunks={result.chunksUsed} />
                      : <CitationsAccordion chunks={result.gapAnalysis.map(g => g.citation).filter(c => c && c !== 'N/A').flatMap(c => parseCitations(c))} />}
                  </div>
                </div>
              )}

              {/* ── Action Buttons ── */}
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
      </div>{/* end right panel */}
    </div>
  );
};
