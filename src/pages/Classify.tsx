import React, { useState, useRef, useEffect } from 'react';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight, Download,
  Search, ChevronDown, ChevronUp, MessageSquare, ChevronLeft, ChevronRight,
  Cpu, ScanLine, Layers, BookOpen, ShieldAlert, Activity,
  Globe, Zap, Shield, Scale, FlaskConical, Microchip, Target,
  TrendingUp, ClipboardList, BookMarked, Info
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { extractTextFromPdf } from '../utils/pdfParser';
import { LoadingSteps } from '../components/LoadingSteps';
import { RiskBadge } from '../components/RiskBadge';
import { ProductSummaryCard } from '../components/ProductSummaryCard';
import { cleanContent, extractConfidence } from '../utils/contentCleaner';
import { DualJurisdictionAlert } from '../components/DualJurisdictionAlert';
import { CitationsAccordion } from '../components/CitationsAccordion';
import { parseCitations } from '../utils/citations';
import { runClassificationChain, ClassificationResult, PartialClassificationData } from '../lib/classificationService';
import { normalizeClassificationResult } from '../lib/reportService';
import { useNavigate } from 'react-router-dom';
import { saveClassifyState, loadClassifyState } from '../utils/sessionPersistence';
import { getSupabase } from '../services/supabase';

// ── Error Boundary ───────────────────────────────────────────────────────────
class ClassifyErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{
            background: 'var(--color-glosilex-light-surface)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 16, padding: 32, maxWidth: 440, width: '100%',
            textAlign: 'center', boxShadow: '0 4px 24px rgba(10,12,17,0.08)',
            fontFamily: 'var(--font-body, Space Grotesk, Inter, sans-serif)',
          }}>
            <AlertTriangle style={{ width: 48, height: 48, color: '#ef4444', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-glosilex-light-text)', marginBottom: 8 }}>Display Error</h3>
            <p style={{ color: 'var(--color-glosilex-light-muted)', marginBottom: 8, fontSize: 14 }}>The classification completed but could not be displayed correctly.</p>
            <p style={{ fontSize: 12, color: 'var(--color-glosilex-light-faint)', marginBottom: 24 }}>{this.state.errorMessage}</p>
            <button
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              style={{
                background: 'linear-gradient(135deg, var(--color-glosilex-teal-dim), #008F85)',
                color: '#fff', fontWeight: 600, padding: '10px 28px',
                borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14,
              }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Brand tokens ─────────────────────────────────────────────────────────────
const T = {
  font:       "var(--font-body, 'Space Grotesk', 'Inter', sans-serif)",
  heading:    "var(--font-heading, 'Space Grotesk', 'Inter', sans-serif)",
  teal:       'var(--color-glosilex-teal)',
  tealDim:    'var(--color-glosilex-teal-dim)',
  tealBright: 'var(--color-glosilex-teal-bright, #00D5C7)',
  dark:       'var(--color-glosilex-light-text)',
  surface:    'var(--color-glosilex-light-surface)',
  bg:         'var(--color-glosilex-light-bg)',
  muted:      'var(--color-glosilex-light-muted)',
  faint:      'var(--color-glosilex-light-faint, #A0AEC0)',
  body:       'var(--color-glosilex-light-body)',
  border:     'rgba(0,213,199,0.15)',
  borderMed:  'rgba(0,213,199,0.28)',
  divider:    'rgba(180,185,190,0.13)',
};

// ── Citation source name sanitiser ────────────────────────────────────────────
// OCR artefacts like "ICENSE R EQUIREMEN T S R", "C ONDI TIONS FOR STA ST A"
// are caused by the PDF parser inserting spaces mid-word. This collapses them.
function sanitiseCitationText(raw: string): string {
  if (!raw) return raw;
  // Collapse spaced-out uppercase words (OCR artefact): "R EQUIREMEN T S" → "REQUIREMENTS"
  return raw
    .replace(/\b([A-Z])\s+([A-Z]{2,})\b/g, '$1$2')   // "R EQUIRE" → "REQUIRE"
    .replace(/\b([A-Z]{2,})\s+([A-Z])\b/g, '$1$2')   // "REQUIRE T" → "REQUIRET"
    .replace(/([A-Z]{3,})\s+([A-Z])\s+([A-Z]{3,})/g, '$1$2$3') // triple-fragment
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Shared panel styles ───────────────────────────────────────────────────────
const panelBase: React.CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.divider}`,
  borderRadius: 14,
  overflow: 'hidden',
  boxShadow: '0 1px 6px rgba(10,12,17,0.06)',
  fontFamily: T.font,
};

const panelHeader: React.CSSProperties = {
  padding: '13px 20px',
  borderBottom: `1px solid ${T.divider}`,
  background: 'rgba(0,213,199,0.03)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  fontFamily: T.font,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  color: T.muted,
  paddingRight: 16,
  whiteSpace: 'nowrap' as const,
  width: '28%',
};

const fieldValue: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  fontFamily: T.font,
  color: T.dark,
  paddingTop: 10,
  paddingBottom: 10,
};

// ── Section header component ──────────────────────────────────────────────────
const PanelHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  accent?: boolean;
  right?: React.ReactNode;
}> = ({ icon, title, accent, right }) => (
  <div style={{
    ...panelHeader,
    justifyContent: 'space-between',
    background: accent
      ? 'linear-gradient(90deg, rgba(0,213,199,0.06) 0%, rgba(0,213,199,0.01) 100%)'
      : 'rgba(0,213,199,0.025)',
    borderLeft: accent ? '3px solid var(--color-glosilex-teal-dim, #00B5A8)' : 'none',
    paddingLeft: accent ? 17 : 20,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 8,
        background: 'rgba(0,181,168,0.10)',
        color: 'var(--color-glosilex-teal-dim, #00B5A8)',
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.11em',
        color: T.dark,
        fontFamily: T.heading,
      }}>
        {title}
      </span>
    </div>
    {right && <div style={{ flexShrink: 0 }}>{right}</div>}
  </div>
);

// ── Confidence chip ──────────────────────────────────────────────────────────
const ConfChip: React.FC<{ label: string }> = ({ label }) => {
  const color = label === 'HIGH' ? '#276749' : label === 'MEDIUM' ? '#B7791F' : '#718096';
  const bg    = label === 'HIGH' ? 'rgba(34,197,94,0.08)' : label === 'MEDIUM' ? 'rgba(245,158,11,0.08)' : 'rgba(180,185,190,0.09)';
  const bdr   = label === 'HIGH' ? 'rgba(34,197,94,0.25)' : label === 'MEDIUM' ? 'rgba(245,158,11,0.25)' : 'rgba(180,185,190,0.18)';
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, fontFamily: T.font,
      color, background: bg, padding: '3px 9px',
      borderRadius: 6, border: `1px solid ${bdr}`,
      letterSpacing: '0.04em',
    }}>
      <span style={{ fontSize: 9, fontWeight: 500, color: T.faint, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>CONF</span>
      {label}
    </span>
  );
};

// ── Risk pill with explicit label ────────────────────────────────────────────
const RiskPill: React.FC<{ level: string }> = ({ level }) => {
  const color = level === 'HIGH' ? '#C53030' : level === 'MEDIUM' ? '#B7791F' : '#276749';
  const bg    = level === 'HIGH' ? 'rgba(239,68,68,0.08)' : level === 'MEDIUM' ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)';
  const bdr   = level === 'HIGH' ? 'rgba(239,68,68,0.25)' : level === 'MEDIUM' ? 'rgba(245,158,11,0.25)' : 'rgba(34,197,94,0.25)';
  const dot   = level === 'HIGH' ? '#E53E3E' : level === 'MEDIUM' ? '#D69E2E' : '#38A169';
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, fontFamily: T.font,
      color, background: bg, padding: '3px 9px',
      borderRadius: 6, border: `1px solid ${bdr}`,
      letterSpacing: '0.04em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ fontSize: 9, fontWeight: 500, color: T.faint, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>RISK</span>
      {level}
    </span>
  );
};

// ── Risk colour helpers ───────────────────────────────────────────────────────
const riskBg  = (r: string) => r === 'HIGH' ? 'rgba(239,68,68,0.05)' : r === 'MEDIUM' ? 'rgba(245,158,11,0.05)' : 'rgba(34,197,94,0.05)';
const riskBdr = (r: string) => r === 'HIGH' ? 'rgba(239,68,68,0.35)' : r === 'MEDIUM' ? 'rgba(245,158,11,0.35)' : 'rgba(34,197,94,0.35)';
const riskTxt = (r: string) => r === 'HIGH' ? '#C53030' : r === 'MEDIUM' ? '#B7791F' : '#276749';

// ── Markdown pre-processor ────────────────────────────────────────────────────
// Only strips the Citations section (rendered by CitationsAccordion separately)
// and Legal Disclaimer (rendered as shared footer). All headings, bold text,
// subsection numbering, and structural formatting are preserved intact.
function cleanMarkdownForDisplay(raw: string): string {
  if (!raw) return '';
  let text = raw;

  // Strip Citations section + everything after it
  // (CitationsAccordion renders this separately below the markdown block)
  text = text.replace(
    /\n#{1,3}\s*\d*\.?\s*Citations[^\n]*[\s\S]*/gi,
    ''
  );

  // Strip Legal Disclaimer (rendered as shared footer)
  text = text.replace(
    /\n#{1,3}\s*\d*\.?\s*Legal Disclaimer[^\n]*[\s\S]*?(?=\n#{1,3}\s|$)/gi,
    '\n'
  );

  // Strip Gosilex Reasoning chain-of-thought block if present
  text = text.replace(
    /\n\*\*Gosilex Reasoning\*\*[\s\S]*?(?=\n#{1,3}\s|\n\*\*[A-Z]|$)/gi,
    '\n'
  );

  // Strip Executive Summary table block — rendered separately by SectionExecSummary component
  // Handles both "## Executive Summary" heading and inline "Executive Summary" label forms
  text = text.replace(
    /\n?#{1,3}\s*Executive Summary[^\n]*\n[\s\S]*?(?=\n#{1,3}\s|\n\*\*[A-Z]|$)/gi,
    '\n'
  );

  // Collapse 3+ blank lines to max 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

// ── Parse Executive Summary table from AI markdown into structured object ────
// The AI outputs a |Factor|Assessment| pipe table in the Executive Summary.
// We extract it here for rendering as a designed component instead of raw markdown.
function extractExecSummaryFromMarkdown(raw: string): {
  riskRating: string; confidence: string; scometClass: string;
  earClass: string; keyFinding: string;
} | null {
  if (!raw) return null;
  const tableMatch = raw.match(/\|?\s*Factor\s*\|[\s\S]*?(?=\n\n|\n#{1,3}|\n\*\*[A-Z]|$)/im);
  if (!tableMatch) return null;
  const rawTable = tableMatch[0];
  // Gemini 2.5 Flash sometimes outputs the table all on one line with no \n between rows.
  // Handle both multi-line (normal GFM) and single-line (Gemini collapsed) formats.
  let rows: string[];
  if (rawTable.includes('\n')) {
    rows = rawTable.split('\n').filter(l => l.includes('|') && !l.match(/^[\s|:-]+$/));
  } else {
    // Single-line: "| Factor | Assessment | |---| | Risk Rating | HIGH | ..."
    // Split on "| |" boundaries to recover individual rows
    rows = rawTable.split(/\|\s*(?=\|)/).map(s => s.trim()).filter(s => s && !s.match(/^[-:\s|]+$/));
  }
  const get = (key: string) => {
    const row = rows.find(r => r.toLowerCase().includes(key.toLowerCase()));
    if (!row) return '';
    const parts = row.split('|').map(s => s.trim()).filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 1] : '';
  };
  return {
    riskRating:  get('Risk Rating'),
    confidence:  get('Confidence'),
    scometClass: get('SCOMET'),
    earClass:    get('EAR'),
    keyFinding:  get('Key Finding'),
  };
}

// ── Per-panel Executive Summary component ─────────────────────────────────────
// Renders the AI-extracted exec summary as a branded table (Factor | Assessment)
// matching the original design, with confidence badge in the header.
const SectionExecSummary: React.FC<{
  raw: string;
  confidenceLabel: string;
}> = ({ raw, confidenceLabel }) => {
  const parsed = extractExecSummaryFromMarkdown(raw);
  if (!parsed && !raw) return null;

  const confColor  = confidenceLabel === 'HIGH' ? '#276749' : confidenceLabel === 'MEDIUM' ? '#B7791F' : '#718096';
  const confBg     = confidenceLabel === 'HIGH' ? 'rgba(34,197,94,0.08)' : confidenceLabel === 'MEDIUM' ? 'rgba(245,158,11,0.10)' : 'rgba(180,185,190,0.09)';
  const confBorder = confidenceLabel === 'HIGH' ? 'rgba(34,197,94,0.30)' : confidenceLabel === 'MEDIUM' ? 'rgba(245,158,11,0.30)' : 'rgba(180,185,190,0.22)';

  const rows = parsed ? [
    parsed.riskRating  && { k: 'Risk Rating',           v: parsed.riskRating.replace(/\*\*/g, '')  },
    parsed.confidence  && { k: 'Confidence',            v: parsed.confidence.replace(/\*\*/g, '')  },
    parsed.scometClass && { k: 'SCOMET Classification', v: parsed.scometClass.replace(/\*\*/g, '') },
    parsed.earClass    && { k: 'EAR Classification',    v: parsed.earClass.replace(/\*\*/g, '')    },
    parsed.keyFinding  && { k: 'Key Finding',           v: parsed.keyFinding.replace(/\*\*/g, '')  },
  ].filter(Boolean) as { k: string; v: string }[] : [];

  return (
    <div style={{
      background: 'rgba(0,213,199,0.025)',
      border: '1px solid rgba(0,213,199,0.12)',
      borderRadius: 10, marginBottom: 16, overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 14px',
        background: 'linear-gradient(90deg, rgba(0,213,199,0.07) 0%, rgba(0,213,199,0.01) 100%)',
        borderBottom: '1px solid rgba(0,213,199,0.12)',
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
          letterSpacing: '0.13em', color: 'var(--color-glosilex-teal-dim,#00B5A8)',
          fontFamily: T.heading,
        }}>Executive Summary</span>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: confBg, border: `1.5px solid ${confBorder}`,
          borderRadius: 7, padding: '3px 10px',
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: confColor, textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontFamily: T.font }}>Confidence</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: confColor, fontFamily: T.heading }}>{confidenceLabel}</span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: confColor, display: 'inline-block', boxShadow: `0 0 4px ${confColor}66` }} />
        </div>
      </div>
      {/* Table */}
      {rows.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid rgba(0,213,199,0.12)` }}>
              <th style={{ ...fieldLabel, padding: '7px 14px', background: 'rgba(0,213,199,0.03)', fontSize: 9 }}>Factor</th>
              <th style={{ ...fieldLabel, padding: '7px 14px', background: 'rgba(0,213,199,0.03)', fontSize: 9, width: '72%' }}>Assessment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${T.divider}` : 'none' }}>
                <td style={{ ...fieldLabel, padding: '9px 14px', verticalAlign: 'top' as const }}>{row.k}</td>
                <td style={{ ...fieldValue, fontSize: 12, padding: '9px 14px', fontWeight: row.k === 'Key Finding' ? 600 : 500, color: row.k === 'Key Finding' ? T.dark : T.body }}>{row.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: 12.5, color: T.body, lineHeight: 1.75, margin: 0, padding: '12px 14px', fontFamily: T.font }}>
          {raw.substring(0, 300).replace(/[|#*`]/g, '').trim()}
        </p>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export const Classify: React.FC = () => {
  const [file, setFile]                   = useState<File | null>(null);
  const [productDesc, setProductDesc]     = useState('');
  const [scometEnabled, setScometEnabled] = useState(true);
  const [earEnabled, setEarEnabled]       = useState(true);
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [loadingSteps, setLoadingSteps]   = useState<string[]>([]);
  const [currentStep, setCurrentStep]     = useState(0);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [partialClassifyData, setPartialClassifyData] = useState<PartialClassificationData | null>(null);
  const [result, setResult]               = useState<ClassificationResult | null>(null);
  const [userId, setUserId]               = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('classify_sidebar_open');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // ── Confidence logic ──────────────────────────────────────────────────
  const getResolvedConfidence = () => {
    if (!result?.finalDetermination) return 'N/A';
    const scometConf = (result.finalDetermination.scomet?.confidence || 'LOW').toUpperCase();
    const earConf    = (result.finalDetermination.ear?.confidence    || 'LOW').toUpperCase();
    const levels: Record<string, number> = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'N/A': 0 };
    const maxLevel = (levels[scometConf] || 0) >= (levels[earConf] || 0) ? scometConf : earConf;
    const scometStatus = result.finalDetermination.scomet?.controlled;
    const earStatus    = result.finalDetermination.ear?.controlled;
    const earEccn      = result.finalDetermination.ear?.eccn || '';
    if (scometStatus === true && earStatus === true)   return `${maxLevel} — Both jurisdictions confirmed`;
    if (earStatus === true || (earEccn && earEccn !== 'EAR99' && earEccn !== 'Jurisdiction Pending'))
      return `${maxLevel} — EAR confirmed, SCOMET pending`;
    if (scometStatus === true) return `${maxLevel} — SCOMET confirmed, EAR pending`;
    if (earEccn === 'EAR99')   return `${maxLevel} — EAR jurisdiction confirmed (EAR99), SCOMET pending`;
    return `${maxLevel} — Classification pending`;
  };

  const getPanelRisk = (jurisdiction: 'scomet' | 'ear') => {
    const data = result?.finalDetermination?.[jurisdiction];
    if (!data) return 'LOW';
    if (data.controlled) return 'HIGH';
    return data.riskLevel || 'LOW';
  };

  const getMaxRisk = () => {
    const sRisk = getPanelRisk('scomet');
    const eRisk = getPanelRisk('ear');
    const riskMap: Record<string, number> = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
    return (riskMap[sRisk] || 1) >= (riskMap[eRisk] || 1) ? sRisk : eRisk;
  };

  // ── Side-effects ──────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('classify_sidebar_open', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  useEffect(() => {
    window.scrollTo(0, 0);
    const fetchUser = async () => {
      try {
        const { data } = await getSupabase().auth.getUser();
        const id = data?.user?.id || 'anonymous';
        setUserId(id);

        const saved = loadClassifyState(id);
        if (saved) {
          setProductDesc(saved.productDesc);
          setScometEnabled(saved.scometEnabled);
          setEarEnabled(saved.earEnabled);
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
      saveClassifyState(userId, { productDesc, scometEnabled, earEnabled, result });
    }
  }, [userId, productDesc, scometEnabled, earEnabled, result]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
    } else {
      alert('Please upload a PDF datasheet.');
    }
  };

  const runClassification = async (resumeFromPartial = false) => {
    if (!resumeFromPartial) setPartialClassifyData(null);
    if (!file && !productDesc.trim()) {
      alert('Please provide a product description or upload a datasheet.');
      return;
    }
    if (!scometEnabled && !earEnabled) {
      alert('Please select at least one jurisdiction.');
      return;
    }
    setIsLoading(true);
    setResult(null);
    setError(null);
    try {
      const steps = [
        'Extracting product specifications...',
        'Retrieving SCOMET regulatory context...',
        'Retrieving EAR regulatory context...',
        'Running cross-jurisdiction analysis...',
        'Generating final determination...',
        'Saving results...'
      ];
      setLoadingSteps(steps);
      setCurrentStep(0);
      let pdfText = '';
      if (file) pdfText = await extractTextFromPdf(file);
      const jurisdictions: string[] = [];
      if (scometEnabled) jurisdictions.push('SCOMET_INDIA');
      if (earEnabled)    jurisdictions.push('EAR_US');
      const classificationResult = await runClassificationChain(
        productDesc, pdfText, jurisdictions,
        (stepMsg) => {
          setRetryStatus(null);
          const index = steps.findIndex(s => stepMsg.includes(s.replace('...', '')));
          if (index !== -1) setCurrentStep(index);
        },
        (attempt, delayMs, reason) => {
          setRetryStatus(
            `Gemini ${reason === '429 rate-limit' ? 'rate limited' : 'overloaded'} — retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt}/6)`
          );
          setTimeout(() => setRetryStatus(null), delayMs + 200);
        },
        (partial) => setPartialClassifyData(partial),
        resumeFromPartial ? (partialClassifyData ?? undefined) : undefined
      );
      setResult(classificationResult);
      setPartialClassifyData(null);
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

  const handleAskFollowUp = () => {
    const productName = file?.name || productDesc.substring(0, 50) || 'Product';
    const initialQuery = `I have a follow-up question about my ${productName} classification.`;
    const hiddenContext = `PREVIOUS CLASSIFICATION CONTEXT —\nProduct Description: ${productDesc}\n\nFull Classification Result:\n${JSON.stringify(result, null, 2)}`;
    navigate('/ask', { state: { initialQuery, hiddenContext, fromModule: 'Classify', sourceView: 'results' } });
  };

  const handleDownloadReport = () => {
    if (!result) return;
    const reportData = normalizeClassificationResult(result, file?.name || productDesc.substring(0, 50) || 'Product');
    navigate('/report', { state: { reportData, fromModule: 'Classify' } });
  };

  const getDualJurisdictionProps = (result: any) => {
    const scomet = result.finalDetermination?.scomet;
    const ear    = result.finalDetermination?.ear;
    if (!scomet || !ear) return null;
    const sc = scomet.controlled;
    const ec = ear.controlled;
    if (sc === false && ec === false) return null;
    if (sc === true  && ec === true)  return { state: 'CONFIRMED' as const };
    if (ec === true)  return { state: 'POTENTIAL' as const, confirmedJurisdiction: 'EAR'    as const, pendingJurisdiction: 'SCOMET' as const };
    if (sc === true)  return { state: 'POTENTIAL' as const, confirmedJurisdiction: 'SCOMET' as const, pendingJurisdiction: 'EAR'    as const };
    if (sc === null || ec === null)
      return { state: 'POTENTIAL' as const, confirmedJurisdiction: undefined, pendingJurisdiction: sc === null ? 'SCOMET' as const : 'EAR' as const };
    return null;
  };

  const getScometLabel = () => {
    const scomet = result?.finalDetermination?.scomet;
    if (!scomet) return scometEnabled ? 'Not Controlled' : 'Not Applicable';
    if (scomet.controlled === true) return scomet.category || 'Controlled';
    if (!scometEnabled) return 'Not Applicable';
    const cat = (scomet.category || '').toLowerCase();
    if (cat.includes('pending') || cat.includes('determination')) return 'Determination Pending';
    return 'Not Controlled';
  };

  const SIDEBAR_W = 340;

  // ── Markdown styles ───────────────────────────────────────────────────
  // Rich visual hierarchy for AI-generated findings:
  //   h2 = primary numbered section  e.g. "## 2. Regulatory Analysis"
  //   h3 = subsection               e.g. "### Key Technical Parameters"
  //   h4 = detail level             e.g. "#### Notes"
  // Numbers in headings are intentionally preserved.
  const mdStyles = `
        /* ── Section counter reset on every glosilex-md block ── */
    .glosilex-md { counter-reset: h2-counter h3-counter; }

    /* ── H1: Document title level — rare but styled ── */
    .glosilex-md h1 {
      font-family: var(--font-heading,'Space Grotesk',sans-serif);
      font-size: 16px; font-weight: 800; line-height: 1.2;
      color: var(--color-glosilex-light-text);
      margin: 1.4em 0 0.5em;
      padding-bottom: 7px;
      border-bottom: 2px solid rgba(0,213,199,0.30);
      letter-spacing: 0.01em;
    }

    /* ── H2: Major section heading with auto-numbering ── */
    .glosilex-md h2 {
      font-family: var(--font-heading,'Space Grotesk',sans-serif);
      font-size: 13px; font-weight: 700; line-height: 1.25;
      color: var(--color-glosilex-teal-dim,#00B5A8);
      margin: 1.6em 0 0.55em;
      padding: 7px 12px 7px 14px;
      background: linear-gradient(90deg, rgba(0,213,199,0.07) 0%, rgba(0,213,199,0.01) 100%);
      border-left: 3px solid var(--color-glosilex-teal-dim,#00B5A8);
      border-radius: 0 6px 6px 0;
      text-transform: uppercase; letter-spacing: 0.09em;
      counter-increment: h2-counter; counter-reset: h3-counter;
    }
    .glosilex-md h2::before {
      content: counter(h2-counter) ". ";
      font-size: 11px; font-weight: 800;
      color: var(--color-glosilex-teal-dim,#00B5A8);
      opacity: 0.65; margin-right: 2px;
    }

    /* ── H3: Subsection heading with auto-numbering ── */
    .glosilex-md h3 {
      font-family: var(--font-heading,'Space Grotesk',sans-serif);
      font-size: 12.5px; font-weight: 700; line-height: 1.3;
      color: var(--color-glosilex-light-text);
      margin: 1.2em 0 0.4em;
      padding-left: 10px;
      border-left: 2px solid rgba(0,213,199,0.35);
      counter-increment: h3-counter;
    }
    .glosilex-md h3::before {
      content: counter(h2-counter) "." counter(h3-counter) "  ";
      font-size: 10px; font-weight: 700;
      color: var(--color-glosilex-teal-dim,#00B5A8);
      opacity: 0.55; margin-right: 1px;
    }

    /* ── H4: Sub-subsection ── */
    .glosilex-md h4 {
      font-family: var(--font-heading,'Space Grotesk',sans-serif);
      font-size: 12px; font-weight: 700; line-height: 1.3;
      color: var(--color-glosilex-light-muted);
      margin: 0.9em 0 0.35em;
      text-transform: uppercase; letter-spacing: 0.06em;
    }

    /* ── Body text — bumped to 13px for readability ── */
    .glosilex-md p  {
      font-size: 13px; line-height: 1.78; margin: 0 0 0.8em;
      color: var(--color-glosilex-light-body);
    }

    /* ── Strong / bold — teal accent for key terms ── */
    .glosilex-md strong {
      font-weight: 700;
      color: var(--color-glosilex-light-text);
    }
    .glosilex-md p strong, .glosilex-md li strong {
      color: var(--color-glosilex-teal-dim,#00B5A8);
    }
    .glosilex-md em { font-style: italic; color: var(--color-glosilex-light-muted); }

    /* ── Lists ── */
    .glosilex-md ul { padding-left: 0; margin: 0 0 0.9em; list-style: none; }
    .glosilex-md ol { padding-left: 20px; margin: 0 0 0.9em; }
    .glosilex-md ul li {
      font-size: 13px; line-height: 1.72; margin-bottom: 5px;
      color: var(--color-glosilex-light-body);
      padding-left: 16px; position: relative;
    }
    .glosilex-md ul li::before {
      content: '';
      position: absolute; left: 0; top: 9px;
      width: 5px; height: 5px; border-radius: 50%;
      background: var(--color-glosilex-teal-dim,#00B5A8);
      opacity: 0.65;
    }
    .glosilex-md ol li {
      font-size: 13px; line-height: 1.72; margin-bottom: 5px;
      color: var(--color-glosilex-light-body);
    }
    .glosilex-md ol li::marker {
      color: var(--color-glosilex-teal-dim,#00B5A8);
      font-weight: 700; font-size: 11px;
    }
    /* Citations subsection: lower-roman numerals for inline citation lists */
    .glosilex-md ol.citations-list { list-style-type: lower-roman; padding-left: 28px; margin: 0.5em 0 1em; }
    .glosilex-md ol.citations-list li {
      font-size: 11px; color: var(--color-glosilex-light-muted);
      line-height: 1.65; margin-bottom: 4px; padding-left: 4px;
    }
    .glosilex-md ol.citations-list li::marker {
      color: var(--color-glosilex-teal-dim,#00B5A8);
      font-size: 10px; font-weight: 700;
    }

    /* Style inline [Source: ...] citation text */
    .glosilex-md ol.citations-list li code,
    .glosilex-md ol.citations-list li {
      font-family: var(--font-body,'Space Grotesk',sans-serif);
      font-style: italic;
    }

    /* Citations h3 section heading inside glosilex-md */
    .glosilex-md h3.citations-heading,
    .glosilex-md h2:has(+ ol.citations-list),
    .glosilex-md h3:has(+ ol.citations-list) {
      color: var(--color-glosilex-teal-dim,#00B5A8);
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      border-left: 2px solid var(--color-glosilex-teal-dim,#00B5A8);
      padding-left: 8px;
      margin: 1.4em 0 0.5em;
    }

    /* ── Tables ── */
    .glosilex-md table { width:100%; border-collapse:collapse; margin: 0.85em 0; font-size:12.5px; }
    .glosilex-md th {
      background: rgba(0,213,199,0.07); font-weight:700; font-size:10px;
      text-transform:uppercase; letter-spacing:0.09em; color:var(--color-glosilex-light-muted);
      padding:8px 13px; border-bottom:1.5px solid rgba(0,213,199,0.20); text-align:left;
    }
    .glosilex-md td {
      padding:9px 13px; border-bottom:1px solid rgba(180,185,190,0.13);
      color:var(--color-glosilex-light-body); vertical-align:top; font-size: 12.5px;
    }
    .glosilex-md tr:last-child td { border-bottom:none; }
    .glosilex-md tr:hover td { background: rgba(0,213,199,0.025); }

    /* ── Blockquote — regulatory notice style ── */
    .glosilex-md blockquote {
      border-left: 3px solid var(--color-glosilex-teal-dim,#00B5A8);
      margin: 0 0 0.9em; padding: 8px 14px;
      background: rgba(0,213,199,0.04); border-radius: 0 7px 7px 0;
    }
    .glosilex-md blockquote p { margin:0; font-style:italic; font-size:12.5px; }

    /* ── Code ── */
    .glosilex-md code {
      font-size:11.5px; background:rgba(0,0,0,0.06);
      padding:2px 6px; border-radius:4px; font-family:monospace;
      color: var(--color-glosilex-light-text);
    }
    .glosilex-md a { color:var(--color-glosilex-teal-dim,#00B5A8); text-decoration:underline; }
    .glosilex-md hr {
      border:none; border-top:1px solid rgba(180,185,190,0.20); margin:1.2em 0;
    }

    /* ── Section separator spacing ── */
    .glosilex-md h2 + p, .glosilex-md h3 + p { margin-top: 0; }
    .glosilex-md h2 + ul, .glosilex-md h3 + ul { margin-top: 0.2em; }

    /* ── Dual Jurisdiction warning banner ── */
    .glosilex-md p:has(> strong:first-child:-webkit-any(*, *)):not(:has(*)) { }
    .glosilex-dj-banner {
      display: flex; align-items: flex-start; gap: 10;
      background: linear-gradient(90deg, rgba(245,158,11,0.07) 0%, rgba(245,158,11,0.02) 100%);
      border: 1.5px solid rgba(245,158,11,0.30);
      border-left: 4px solid rgba(245,158,11,0.70);
      border-radius: 0 9px 9px 0;
      padding: 10px 14px; margin: 0 0 0.9em;
    }
    .glosilex-dj-banner p { margin: 0 !important; font-size: 12.5px !important;
      font-weight: 600 !important; color: #92400e !important; line-height: 1.6 !important; }
  `;

  // ══════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════
  return (
    <><style>{mdStyles}</style>
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      height: 'calc(100vh - 64px)',
      overflow: 'hidden',
      position: 'relative',
      background: T.bg,
      fontFamily: T.font,
    }}>
      {/* ─────────────────────────────────────────────────────────────────────
          LEFT PANEL
      ───────────────────────────────────────────────────────────────────── */}
      <div style={{
        width: isSidebarOpen ? SIDEBAR_W : 0,
        minWidth: isSidebarOpen ? SIDEBAR_W : 0,
        maxWidth: isSidebarOpen ? SIDEBAR_W : 0,
        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRight: isSidebarOpen ? `1px solid ${T.divider}` : 'none',
        background: T.surface,
        boxShadow: isSidebarOpen ? '2px 0 20px rgba(0,0,0,0.05)' : 'none',
        flexShrink: 0,
      }}>
        {/* Inner scrollable container — fixed width prevents layout collapse during transition */}
        <div style={{
          width: SIDEBAR_W,
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          scrollbarWidth: 'thin',
        }}>
          {/* ── LEFT PANEL HEADER ─────────────────────────────────────── */}
          <div style={{
            padding: '18px 20px 14px',
            borderBottom: `1px solid ${T.divider}`,
            background: 'linear-gradient(135deg, rgba(0,213,199,0.05) 0%, rgba(0,213,199,0.01) 100%)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(0,181,168,0.18), rgba(0,213,199,0.08))',
                border: '1.5px solid rgba(0,213,199,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Cpu style={{ width: 17, height: 17, color: 'var(--color-glosilex-teal-dim, #00B5A8)' }} />
              </div>
              <div>
                <h1 style={{
                  fontSize: 15, fontWeight: 700, color: T.dark,
                  margin: 0, lineHeight: 1.2, fontFamily: T.heading, letterSpacing: '0.01em',
                }}>
                  Classify My Product
                </h1>
                <p style={{ fontSize: 11, color: T.muted, margin: 0, marginTop: 2, fontFamily: T.font }}>
                  SCOMET &amp; EAR/BIS multi-jurisdiction analysis
                </p>
              </div>
            </div>
          </div>

          {/* ── FORM SECTIONS ─────────────────────────────────────────── */}
          <div style={{ flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Upload Zone ─────────────────────────────────────────── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 5, background: 'rgba(0,181,168,0.10)',
                }}>
                  <Upload style={{ width: 10, height: 10, color: 'var(--color-glosilex-teal-dim, #00B5A8)' }} />
                </span>
                <label style={{
                  fontSize: 10, fontWeight: 700, fontFamily: T.font,
                  textTransform: 'uppercase' as const, letterSpacing: '0.09em', color: T.dark,
                }}>
                  Product Datasheet
                  <span style={{ color: T.faint, fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, marginLeft: 4 }}>
                    PDF · Optional
                  </span>
                </label>
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `1.5px dashed ${file ? 'var(--color-glosilex-teal-dim, #00B5A8)' : 'rgba(180,185,190,0.30)'}`,
                  borderRadius: 12, padding: '16px 14px', textAlign: 'center', cursor: 'pointer',
                  background: file ? 'rgba(0,181,168,0.04)' : 'rgba(0,0,0,0.01)',
                  transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-glosilex-teal-dim, #00B5A8)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(0,181,168,0.06)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = file ? 'var(--color-glosilex-teal-dim, #00B5A8)' : 'rgba(180,185,190,0.30)';
                  (e.currentTarget as HTMLElement).style.background = file ? 'rgba(0,181,168,0.04)' : 'rgba(0,0,0,0.01)';
                }}
              >
                <div style={{
                  position: 'absolute', inset: 0, opacity: 0.035,
                  backgroundImage: 'radial-gradient(circle, #0A0C11 1px, transparent 1px)',
                  backgroundSize: '16px 16px', pointerEvents: 'none',
                }} />
                <input type="file" accept=".pdf" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                {file ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, background: 'rgba(0,181,168,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FileText style={{ width: 16, height: 16, color: 'var(--color-glosilex-teal-dim, #00B5A8)' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.dark, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontFamily: T.font }}>{file.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-glosilex-teal-dim, #00B5A8)', fontWeight: 500 }}>Click to change file</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, background: 'rgba(180,185,190,0.10)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Upload style={{ width: 15, height: 15, color: T.faint }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.muted, fontFamily: T.font }}>Drop datasheet PDF here</span>
                    <span style={{ fontSize: 10, color: T.faint }}>or click to browse</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── OR divider ───────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 1, background: T.divider }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: T.faint, textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>or describe</span>
              <div style={{ flex: 1, height: 1, background: T.divider }} />
            </div>

            {/* ── Product Description ──────────────────────────────────── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 5, background: 'rgba(0,181,168,0.10)',
                }}>
                  <ClipboardList style={{ width: 10, height: 10, color: 'var(--color-glosilex-teal-dim, #00B5A8)' }} />
                </span>
                <label htmlFor="productDesc" style={{
                  fontSize: 10, fontWeight: 700, fontFamily: T.font,
                  textTransform: 'uppercase' as const, letterSpacing: '0.09em', color: T.dark,
                }}>
                  Product Description &amp; Technical Specs
                </label>
              </div>
              <textarea
                id="productDesc"
                style={{
                  width: '100%', padding: '11px 13px', fontSize: 12, color: T.dark,
                  border: `1.5px solid ${T.divider}`, borderRadius: 10,
                  background: 'rgba(0,0,0,0.015)', resize: 'none' as const, outline: 'none',
                  lineHeight: 1.6, fontFamily: T.font,
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxSizing: 'border-box' as const,
                }}
                rows={6}
                value={productDesc}
                onChange={e => setProductDesc(e.target.value)}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'var(--color-glosilex-teal-dim, #00B5A8)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,181,168,0.10)';
                  e.currentTarget.style.background = T.surface;
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = T.divider;
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.background = 'rgba(0,0,0,0.015)';
                }}
                placeholder={"Enter product details for best results:\n• Product Name: e.g. GaN Power Amplifier Module\n• Technical Specs: e.g. Frequency: 6-18 GHz\n• Destination Country: e.g. Malaysia\n• End-Use: e.g. Commercial radar systems\n• Component Origin: e.g. US-origin EDA tools"}
              />
            </div>

            {/* ── Jurisdiction Scope ───────────────────────────────────── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 5, background: 'rgba(0,181,168,0.10)',
                }}>
                  <Globe style={{ width: 10, height: 10, color: 'var(--color-glosilex-teal-dim, #00B5A8)' }} />
                </span>
                <label style={{
                  fontSize: 10, fontWeight: 700, fontFamily: T.font,
                  textTransform: 'uppercase' as const, letterSpacing: '0.09em', color: T.dark,
                }}>
                  Jurisdiction Scope
                </label>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { id: 'scometEnabled', checked: scometEnabled, onChange: (v: boolean) => setScometEnabled(v), flag: '🇮🇳', label: 'India SCOMET', sub: 'Oct 2025 regulations' },
                  { id: 'earEnabled',    checked: earEnabled,    onChange: (v: boolean) => setEarEnabled(v),    flag: '🇺🇸', label: 'US EAR / BIS',  sub: 'Jan 2025 update' },
                ].map(j => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => j.onChange(!j.checked)}
                    aria-pressed={j.checked}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 10,
                      border: `1.5px solid ${j.checked ? 'rgba(0,181,168,0.45)' : T.divider}`,
                      background: j.checked
                        ? 'linear-gradient(135deg, rgba(0,181,168,0.08) 0%, rgba(0,213,199,0.04) 100%)'
                        : 'rgba(0,0,0,0.01)',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                      minHeight: 48, width: '100%', textAlign: 'left' as const,
                      boxShadow: j.checked ? '0 0 0 3px rgba(0,213,199,0.10), 0 2px 8px rgba(0,181,168,0.08)' : 'none',
                      fontFamily: T.font,
                    }}
                    onMouseEnter={e => {
                      if (!j.checked) {
                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,181,168,0.4)';
                        (e.currentTarget as HTMLElement).style.background = 'rgba(0,181,168,0.04)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!j.checked) {
                        (e.currentTarget as HTMLElement).style.borderColor = T.divider;
                        (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.01)';
                      }
                    }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{j.flag}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: j.checked ? T.dark : T.muted, fontFamily: T.font }}>{j.label}</div>
                      <div style={{ fontSize: 10, color: T.faint, fontFamily: T.font, marginTop: 1 }}>{j.sub}</div>
                    </div>
                    {/* Futuristic toggle pill */}
                    <div style={{
                      width: 36, height: 20, borderRadius: 10,
                      background: j.checked ? 'var(--color-glosilex-teal-dim, #00B5A8)' : 'rgba(180,185,190,0.28)',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                      boxShadow: j.checked ? '0 0 6px rgba(0,181,168,0.35)' : 'none',
                    }}>
                      <div style={{
                        position: 'absolute', top: 3,
                        left: j.checked ? 18 : 3,
                        width: 14, height: 14, borderRadius: '50%',
                        background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                        transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)',
                      }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Coverage status pills ────────────────────────────────── */}
            <div style={{
              display: 'flex', gap: 6, flexWrap: 'wrap' as const,
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(0,213,199,0.03)',
              border: `1px solid ${T.border}`,
            }}>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
                letterSpacing: '0.1em', color: T.faint, width: '100%', marginBottom: 4,
              }}>
                Live KB Coverage
              </span>
              {[
                { flag: '🇮🇳', label: 'SCOMET Oct 2025' },
                { flag: '🇺🇸', label: 'EAR/BIS Jan 2025' },
              ].map(b => (
                <span key={b.label} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 10, fontWeight: 600, color: T.muted,
                  background: 'rgba(0,181,168,0.06)',
                  border: `1px solid ${T.border}`,
                  borderRadius: 20, padding: '3px 9px', fontFamily: T.font,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--color-glosilex-teal-dim, #00B5A8)',
                    display: 'inline-block', marginRight: 2,
                  }} />
                  {b.flag} {b.label}
                </span>
              ))}
            </div>

          </div>{/* end form sections */}
        </div>{/* end scrollable inner */}

        {/* ── Classify CTA ──────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 18px 18px',
          borderTop: `1px solid ${T.divider}`,
          background: T.surface, flexShrink: 0,
        }}>
          <button
            onClick={() => runClassification(false)}
            disabled={(!file && !productDesc.trim()) || isLoading}
            style={{
              width: '100%',
              background: (!file && !productDesc.trim()) || isLoading
                ? 'rgba(180,185,190,0.18)'
                : 'linear-gradient(135deg, var(--color-glosilex-teal-dim, #00B5A8) 0%, #008F85 100%)',
              color: (!file && !productDesc.trim()) || isLoading ? T.faint : '#fff',
              fontWeight: 700, fontSize: 13, padding: '13px 20px',
              borderRadius: 11, border: 'none',
              cursor: (!file && !productDesc.trim()) || isLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              minHeight: 48,
              boxShadow: (!file && !productDesc.trim()) || isLoading
                ? 'none' : '0 4px 20px rgba(0,181,168,0.30)',
              transition: 'all 0.2s', letterSpacing: '0.03em', fontFamily: T.heading,
            }}
            onMouseEnter={e => {
              if (!isLoading && (file || productDesc.trim())) {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 28px rgba(0,181,168,0.45)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,181,168,0.30)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}
          >
            {isLoading ? (
              <>
                <svg style={{ animation: 'spin 1s linear infinite', width: 15, height: 15 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round"/>
                </svg>
                Processing...
              </>
            ) : (
              <>
                <Cpu style={{ width: 15, height: 15 }} />
                Classify Product
                <ArrowRight style={{ width: 15, height: 15 }} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SIDEBAR TOGGLE — lives OUTSIDE the left panel div so it never
          overlaps the left panel's scrollbar
      ───────────────────────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label={isSidebarOpen ? 'Collapse input panel' : 'Expand input panel'}
        style={{
          position: 'absolute', top: 22,
          left: isSidebarOpen ? SIDEBAR_W + 8 : 10,
          zIndex: 40, width: 26, height: 26, borderRadius: '50%',
          background: T.surface, border: `1px solid ${T.divider}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 2px 10px rgba(10,12,17,0.10)',
          transition: 'left 0.3s cubic-bezier(0.4,0,0.2,1)', color: T.muted,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(0,181,168,0.08)';
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,181,168,0.45)';
          (e.currentTarget as HTMLElement).style.color = 'var(--color-glosilex-teal-dim, #00B5A8)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = T.surface;
          (e.currentTarget as HTMLElement).style.borderColor = T.divider;
          (e.currentTarget as HTMLElement).style.color = T.muted;
        }}
      >
        {isSidebarOpen ? <ChevronLeft style={{ width: 13, height: 13 }} /> : <ChevronRight style={{ width: 13, height: 13 }} />}
      </button>

      {/* ─────────────────────────────────────────────────────────────────────
          RIGHT PANEL
      ───────────────────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, height: '100%', overflowY: 'auto',
        padding: isSidebarOpen ? '24px 28px 28px 44px' : '24px 28px',
        background: T.bg, minWidth: 0,
        transition: 'padding 0.3s cubic-bezier(0.4,0,0.2,1)',
        scrollbarWidth: 'thin',
      }}>

        {/* ── Loading ─────────────────────────────────────────────────── */}
        {isLoading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

        /* ── Error ──────────────────────────────────────────────────── */
        ) : error ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ ...panelBase, padding: 32, maxWidth: 440, width: '100%', textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <AlertTriangle style={{ width: 26, height: 26, color: '#E53E3E' }} />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: T.dark, marginBottom: 8, fontFamily: T.heading }}>Classification Failed</h3>
              <p style={{ fontSize: 13, color: T.muted, marginBottom: 24, fontFamily: T.font }}>{error}</p>
              <button
                onClick={() => runClassification(!!partialClassifyData)}
                style={{ background: 'linear-gradient(135deg, var(--color-glosilex-teal-dim, #00B5A8), #008F85)', color: '#fff', fontWeight: 600, padding: '10px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, minHeight: 44, fontFamily: T.font }}
              >
                {partialClassifyData
                  ? `Resume from Step ${partialClassifyData.lastCompletedStep + 1} of 5`
                  : 'Retry Classification'}
              </button>
              {partialClassifyData && (
                <button
                  onClick={() => runClassification(false)}
                  style={{ marginTop: 8, padding: '8px 18px', borderRadius: 8, border: `1px solid ${T.muted}`, background: 'transparent', color: T.muted, fontSize: 12, cursor: 'pointer', display: 'block', margin: '8px auto 0' }}
                >
                  Start Fresh Instead
                </button>
              )}
            </div>
          </div>

        /* ── Results ────────────────────────────────────────────────── */
        ) : result ? (
          <ClassifyErrorBoundary>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 48 }}>

              {/* 1 ── Risk banner ──────────────────────────────────── */}
              {(() => {
                const risk = result.finalDetermination?.riskLevel || getMaxRisk();
                return (
                  <div style={{
                    background: riskBg(risk), border: `1.5px solid ${riskBdr(risk)}`,
                    borderRadius: 14, padding: '18px 22px',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0, width: 120,
                      background: `linear-gradient(to left, ${riskBg(risk)}, transparent)`,
                      pointerEvents: 'none',
                    }} />
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 12, marginBottom: 10, position: 'relative' }}>
                      <RiskBadge level={risk} />
                      <h2 style={{
                        fontSize: 17, fontWeight: 800, color: riskTxt(risk), margin: 0,
                        letterSpacing: '0.04em', fontFamily: T.heading,
                      }}>
                        {risk === 'HIGH' ? 'LICENSE REQUIRED' : risk === 'MEDIUM' ? 'REVIEW NEEDED' : 'NO LICENSE INDICATED'}
                      </h2>
                    </div>
                    {scometEnabled && earEnabled && getDualJurisdictionProps(result) && (
                      <DualJurisdictionAlert {...getDualJurisdictionProps(result)!} />
                    )}
                    <p style={{ fontSize: 12, color: riskTxt(risk), margin: '10px 0 0', lineHeight: 1.6, fontFamily: T.font, opacity: 0.85 }}>
                      Based on the provided datasheet and details, this product has been classified against the selected regulations.
                    </p>
                  </div>
                );
              })()}

              {/* 2 ── Product Summary ──────────────────────────────── */}
              <ProductSummaryCard data={result.extractedSpecs || {}} />

              {/* 3 ── Executive Summary ────────────────────────────── */}
              <div style={panelBase}>
                <PanelHeader icon={<Activity style={{ width: 13, height: 13 }} />} title="Classification Intelligence Brief" accent />
                <div style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div style={{
                      background: 'rgba(0,0,0,0.013)', borderRadius: 10, padding: '14px 16px',
                      border: `1px solid ${T.divider}`,
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr style={{ borderBottom: `1px solid ${T.divider}` }}>
                            <td style={fieldLabel}>Risk Rating</td>
                            <td style={fieldValue}><RiskBadge level={result.finalDetermination?.riskLevel || getMaxRisk()} /></td>
                          </tr>
                          <tr style={{ borderBottom: `1px solid ${T.divider}` }}>
                            <td style={fieldLabel}>Confidence</td>
                            <td style={{ ...fieldValue, fontSize: 12 }}>{getResolvedConfidence()}</td>
                          </tr>
                          <tr style={{ borderBottom: `1px solid ${T.divider}` }}>
                            <td style={fieldLabel}>SCOMET</td>
                            <td style={{ ...fieldValue, fontSize: 12 }}>{getScometLabel()}</td>
                          </tr>
                          <tr>
                            <td style={fieldLabel}>US EAR / ECCN</td>
                            <td style={{ ...fieldValue, fontSize: 12 }}>{result.finalDetermination?.ear?.eccn || 'EAR99'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div style={{
                      background: 'rgba(0,213,199,0.025)', borderRadius: 10, padding: '14px 16px',
                      border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column',
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
                        letterSpacing: '0.12em', color: 'var(--color-glosilex-teal-dim, #00B5A8)',
                        marginBottom: 10, display: 'block', fontFamily: T.font,
                      }}>Summary Finding</span>
                      <div className="glosilex-md" style={{ fontSize: 13, color: T.body, lineHeight: 1.78, flex: 1, fontFamily: T.font }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {cleanMarkdownForDisplay(result.finalDetermination?.summary || 'No summary available.')}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 ── SCOMET Findings ──────────────────────────────── */}
              {scometEnabled && (
                <div style={panelBase}>
                  <PanelHeader
                    icon={<span style={{ fontSize: 14, lineHeight: 1 }}>🇮🇳</span>}
                    title="India SCOMET Classification"
                    accent
                    right={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RiskPill level={getPanelRisk('scomet')} />
                        <ConfChip label={(result.finalDetermination?.scomet?.confidence || extractConfidence(result.scometFinding) || 'LOW').toUpperCase()} />
                      </div>
                    }
                  />
                  <div style={{ padding: '16px 20px' }}>
                    {/* Structured key-value summary table */}
                    <div style={{
                      background: 'rgba(0,0,0,0.013)', borderRadius: 10, padding: '12px 16px',
                      border: `1px solid ${T.divider}`, marginBottom: 16,
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {[
                            { k: 'Controlled', v: result.finalDetermination?.scomet?.controlled === true
                                ? <span style={{ color: '#C53030', fontWeight: 700, fontFamily: T.font, fontSize: 12 }}>✅ YES</span>
                                : (() => {
                                    const cat = (result.finalDetermination?.scomet?.category || '').toLowerCase();
                                    return cat.includes('pending') || cat.includes('determination')
                                      ? <span style={{ color: '#B7791F', fontWeight: 700, fontFamily: T.font, fontSize: 12 }}>⏳ PENDING</span>
                                      : <span style={{ color: '#276749', fontWeight: 700, fontFamily: T.font, fontSize: 12 }}>❌ NO</span>;
                                  })() },
                            { k: 'Category', v: result.finalDetermination?.scomet?.category  || 'N/A' },
                            { k: 'Clause',   v: result.finalDetermination?.scomet?.clause    || 'N/A' },
                            { k: 'Citation', v: <span style={{ fontStyle: 'italic', color: T.muted, fontFamily: T.font, fontSize: 12 }}>{result.finalDetermination?.scomet?.citation || 'No specific citation found.'}</span> },
                          ].map((row, i, arr) => (
                            <tr key={i} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.divider}` : 'none' }}>
                              <td style={{ ...fieldLabel, paddingTop: 9, paddingBottom: 9 }}>{row.k}</td>
                              <td style={{ ...fieldValue, fontSize: 12, width: '72%' }}>{row.v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Detailed Analysis heading */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                      paddingBottom: 8, borderBottom: `1px solid ${T.divider}`,
                    }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const,
                        letterSpacing: '0.12em', color: 'var(--color-glosilex-teal-dim,#00B5A8)',
                        fontFamily: T.heading,
                      }}>Detailed Analysis</span>
                    <div style={{ flex: 1, height: 1, background: T.divider }} />
                    </div>                    
                    <div className="glosilex-md" style={{ fontSize: 13, color: T.body, lineHeight: 1.78, fontFamily: T.font }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                        p: ({ children, ...props }) => {
                          const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : '';
                          if (text.includes('⚠️') && (text.includes('Dual Jurisdiction') || text.includes('dual jurisdiction'))) {
                            return <div className="glosilex-dj-banner"><p>{children}</p></div>;
                          }
                          return <p {...props}>{children}</p>;
                        },
                        ol: ({ children, ...props }: any) => {
                          const cls = (props.className || '') + ' citations-list';
                          return <ol {...props} className={cls}>{children}</ol>;
                        },
                      }}>
                        {cleanMarkdownForDisplay(result.scometFinding)}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* 5 ── EAR Findings ──────────────────────────────────── */}
              {earEnabled && (
                <div style={panelBase}>
                  <PanelHeader
                    icon={<span style={{ fontSize: 14, lineHeight: 1 }}>🇺🇸</span>}
                    title="US EAR / BIS Classification"
                    accent
                    right={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RiskPill level={getPanelRisk('ear')} />
                        <ConfChip label={(result.finalDetermination?.ear?.confidence || extractConfidence(result.earFinding) || 'LOW').toUpperCase()} />
                      </div>
                    }
                  />
                  <div style={{ padding: '16px 20px' }}>
                    {/* Structured key-value summary table */}
                    <div style={{
                      background: 'rgba(0,0,0,0.013)', borderRadius: 10, padding: '12px 16px',
                      border: `1px solid ${T.divider}`, marginBottom: 16,
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {[
                            { k: 'Controlled',        v: result.finalDetermination?.ear?.controlled
                                ? <span style={{ color: '#C53030', fontWeight: 700, fontFamily: T.font, fontSize: 12 }}>✅ YES</span>
                                : <span style={{ color: '#276749', fontWeight: 700, fontFamily: T.font, fontSize: 12 }}>❌ NO</span> },
                            { k: 'ECCN',              v: result.finalDetermination?.ear?.eccn              || 'EAR99' },
                            { k: 'Controls',          v: result.finalDetermination?.ear?.controls          || 'N/A' },
                            { k: 'License Exception', v: result.finalDetermination?.ear?.licenseException  || 'N/A' },
                            { k: 'Citation',          v: <span style={{ fontStyle: 'italic', color: T.muted, fontFamily: T.font, fontSize: 12 }}>{result.finalDetermination?.ear?.citation || 'No specific citation found.'}</span> },
                          ].map((row, i, arr) => (
                            <tr key={i} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.divider}` : 'none' }}>
                              <td style={{ ...fieldLabel, paddingTop: 9, paddingBottom: 9 }}>{row.k}</td>
                              <td style={{ ...fieldValue, fontSize: 12, width: '72%' }}>{row.v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Detailed Analysis heading */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                      paddingBottom: 8, borderBottom: `1px solid ${T.divider}`,
                    }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const,
                        letterSpacing: '0.12em', color: 'var(--color-glosilex-teal-dim,#00B5A8)',
                        fontFamily: T.heading,
                      }}>Detailed Analysis</span>
                      <div style={{ flex: 1, height: 1, background: T.divider }} />
                      </div>                      
                      <div className="glosilex-md" style={{ fontSize: 13, color: T.body, lineHeight: 1.78, fontFamily: T.font }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          p: ({ children, ...props }) => {
                          const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : '';
                          if (text.includes('⚠️') && (text.includes('Dual Jurisdiction') || text.includes('dual jurisdiction'))) {
                            return <div className="glosilex-dj-banner"><p>{children}</p></div>;
                          }
                          return <p {...props}>{children}</p>;
                        },
                        ol: ({ children, ...props }: any) => {
                          const cls = (props.className || '') + ' citations-list';
                          return <ol {...props} className={cls}>{children}</ol>;
                        },
                      }}>
                        {cleanMarkdownForDisplay(result.earFinding)}
                      </ReactMarkdown>
                    </div>
                    {/* EAR-scoped citations */}
                    {result.chunksUsed && result.chunksUsed.filter((c: any) =>
                      (c.document_name || '').includes('EAR') || (c.document_name || '').includes('BIS')
                    ).length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <CitationsAccordion chunks={result.chunksUsed.filter((c: any) =>
                          c.document_name?.includes('EAR') || c.document_name?.includes('BIS')
                        ).map((c: any) => ({
                          ...c,
                          section: sanitiseCitationText(c.section || ''),
                          document_name: sanitiseCitationText(c.document_name || ''),
                        }))} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 6 ── Cross-Jurisdiction ────────────────────────────── */}
              {result.crossJurisdictionNote && result.crossJurisdictionNote !== 'N/A' && (
                <div style={{ ...panelBase, border: `1.5px solid ${T.borderMed}`, background: 'rgba(0,181,168,0.025)' }}>
                  <PanelHeader icon={<ScanLine style={{ width: 13, height: 13 }} />} title="Cross-Jurisdiction Analysis" accent />
                  <div style={{ padding: '16px 20px' }}>                    
                    <div className="glosilex-md" style={{ fontSize: 13, color: T.body, lineHeight: 1.78, fontFamily: T.font }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                        p: ({ children, ...props }) => {
                          const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : '';
                          if (text.includes('⚠️') && (text.includes('Dual Jurisdiction') || text.includes('dual jurisdiction'))) {
                            return <div className="glosilex-dj-banner"><p>{children}</p></div>;
                          }
                          return <p {...props}>{children}</p>;
                        },
                        ol: ({ children, ...props }: any) => {
                          const cls = (props.className || '') + ' citations-list';
                          return <ol {...props} className={cls}>{children}</ol>;
                        },
                      }}>
                        {cleanMarkdownForDisplay(result.crossJurisdictionNote)}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* 7 ── Action Plan ────────────────────────────────────── */}
              {result.finalDetermination?.actionPlan && result.finalDetermination.actionPlan.length > 0 && (
                <div style={panelBase}>
                  <PanelHeader icon={<ShieldAlert style={{ width: 13, height: 13 }} />} title="Action Plan" accent />
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(0,213,199,0.03)', borderBottom: `1.5px solid ${T.divider}` }}>
                          {['#', 'Priority', 'Action', 'Jurisdiction', 'Timeline'].map(h => (
                            <th key={h} style={{
                              padding: '10px 16px', textAlign: 'left', fontSize: 9, fontWeight: 700,
                              textTransform: 'uppercase' as const, letterSpacing: '0.09em',
                              color: T.muted, whiteSpace: 'nowrap' as const, fontFamily: T.font,
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.finalDetermination.actionPlan.map((item: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: `1px solid ${T.divider}` }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(0,181,168,0.025)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                          >
                            <td style={{ padding: '11px 16px', fontSize: 11, color: T.faint, fontFamily: T.font }}>{idx + 1}</td>
                            <td style={{ padding: '11px 16px' }}>
                              <span style={{
                                padding: '2px 8px', borderRadius: 5,
                                fontSize: 10, fontWeight: 700, fontFamily: T.font,
                                background: item.priority === 'P1' || item.priority === 'High' ? 'rgba(239,68,68,0.08)' : item.priority === 'P2' || item.priority === 'Medium' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)',
                                color:      item.priority === 'P1' || item.priority === 'High' ? '#C53030' : item.priority === 'P2' || item.priority === 'Medium' ? '#B7791F' : '#2B6CB0',
                                border: `1px solid ${item.priority === 'P1' || item.priority === 'High' ? 'rgba(239,68,68,0.2)' : item.priority === 'P2' || item.priority === 'Medium' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)'}`,
                              }}>{item.priority}</span>
                            </td>
                            <td style={{ padding: '11px 16px', fontSize: 12, color: T.dark, fontFamily: T.font }}>{typeof item.action === 'string' ? cleanContent(item.action) : 'Review required'}</td>
                            <td style={{ padding: '11px 16px', fontSize: 11, color: T.muted, fontFamily: T.font }}>{typeof item.jurisdiction === 'string' ? item.jurisdiction : typeof item.authority === 'string' ? item.authority : 'General'}</td>
                            <td style={{ padding: '11px 16px', fontSize: 11, color: T.muted, whiteSpace: 'nowrap' as const, fontFamily: T.font }}>{typeof item.timeline === 'string' ? item.timeline : 'As soon as possible'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 8 ── Regulatory Citations ──────────────────────────── */}
              {result.chunksUsed && result.chunksUsed.length > 0 && (
                <div style={panelBase}>
                  <PanelHeader icon={<BookMarked style={{ width: 13, height: 13 }} />} title="Regulatory Citations" />
                  <div style={{ padding: '16px 20px' }}>
                    <CitationsAccordion chunks={result.chunksUsed.map((c: any) => ({
                      ...c,
                      section: sanitiseCitationText(c.section || ''),
                      document_name: sanitiseCitationText(c.document_name || ''),
                    }))} />
                  </div>
                </div>
              )}

              {/* 8b ── Legal Disclaimer (shared, one per page) ─────── */}
              <div style={{
                background: 'rgba(180,185,190,0.04)',
                border: '1px solid rgba(180,185,190,0.18)',
                borderTop: '3px solid rgba(180,185,190,0.30)',
                borderRadius: '0 0 12px 12px',
                padding: '18px 22px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const,
                    letterSpacing: '0.14em', color: T.muted, fontFamily: T.heading,
                  }}>⚖️ Legal Disclaimer</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(180,185,190,0.20)' }} />
                </div>
                <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.8, margin: 0, fontFamily: T.font }}>
                  <strong style={{ color: T.dark, fontWeight: 700 }}>Important Notice Regarding Regulatory Classification.</strong>{' '}
                  The analysis, determinations, and classifications provided herein are generated by an AI-assisted system ("Glosilex Silex Engine") for informational and preliminary screening purposes only. This output does <em>not</em> constitute legal advice, a formal regulatory determination, or an official classification ruling under the Foreign Trade Policy of India, the Export Administration Regulations (EAR) of the United States, or any other applicable export control regime.
                </p>
                <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.8, margin: '8px 0 0', fontFamily: T.font }}>
                  Export control laws and regulations are complex, jurisdiction-specific, and subject to change. Final classification and licensing determinations must be made by a qualified export control professional and, where required, confirmed by the relevant regulatory authority (DGFT, BIS/US DoC, or equivalent). The end-user assumes full responsibility for compliance with all applicable laws prior to export, re-export, or transfer of any item. Glosilex and its affiliates expressly disclaim all liability for any reliance placed on this analysis without independent legal review.
                </p>
                <p style={{ fontSize: 10, color: T.faint, lineHeight: 1.7, margin: '8px 0 0', fontFamily: T.font, fontStyle: 'italic' }}>
                  Regulatory database: SCOMET Schedule October 2025 | US EAR/CCL January 2025 | Cross-border FDPR controls. Classification subject to revision upon availability of updated regulatory notices.
                </p>
              </div>
              
              {/* 9 ── Actions row ────────────────────────────────────── */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, paddingTop: 4 }}>
                <button
                  onClick={handleAskFollowUp}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'linear-gradient(135deg, var(--color-glosilex-teal-dim, #00B5A8), #008F85)',
                    color: '#fff', fontWeight: 700, fontSize: 12,
                    padding: '10px 18px', borderRadius: 10, border: 'none',
                    cursor: 'pointer', minHeight: 44,
                    boxShadow: '0 4px 16px rgba(0,181,168,0.28)',
                    fontFamily: T.font, letterSpacing: '0.02em', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 24px rgba(0,181,168,0.45)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,181,168,0.28)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                >
                  <MessageSquare style={{ width: 14, height: 14 }} />
                  Ask Follow-up
                </button>
                <button
                  onClick={handleDownloadReport}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: T.surface, color: T.dark, fontWeight: 700, fontSize: 12,
                    padding: '10px 18px', borderRadius: 10, border: `1.5px solid ${T.divider}`,
                    cursor: 'pointer', minHeight: 44,
                    fontFamily: T.font, letterSpacing: '0.02em', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,181,168,0.45)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-glosilex-teal-dim, #00B5A8)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.divider; (e.currentTarget as HTMLElement).style.color = T.dark; }}
                >
                  <Download style={{ width: 14, height: 14 }} />
                  Download Report
                </button>
              </div>
            </div>
          </ClassifyErrorBoundary>

        /* ── Empty / initial state ───────────────────────────────────── */
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '0 16px' }}>

            <div style={{ textAlign: 'center', maxWidth: 520 }}>
              <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 20px' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 20,
                  background: 'linear-gradient(135deg, rgba(0,181,168,0.14), rgba(0,213,199,0.06))',
                  border: `1.5px solid ${T.borderMed}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', zIndex: 1, boxShadow: '0 0 32px rgba(0,181,168,0.14)',
                }}>
                  <Cpu style={{ width: 32, height: 32, color: 'var(--color-glosilex-teal-dim, #00B5A8)' }} />
                </div>
                <span style={{
                  position: 'absolute', top: 6, right: 6,
                  width: 10, height: 10, borderRadius: '50%',
                  background: 'var(--color-glosilex-teal-dim, #00B5A8)',
                  boxShadow: '0 0 6px rgba(0,181,168,0.6)',
                  animation: 'pulse 2s ease-in-out infinite',
                }} />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: T.dark, marginBottom: 10, fontFamily: T.heading, letterSpacing: '0.01em' }}>
                AI-Powered Export Classification
              </h2>
              <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, fontFamily: T.font }}>
                Upload a product datasheet or describe your product to get instant SCOMET and EAR/BIS classification with full regulatory citations.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, justifyContent: 'center', maxWidth: 520 }}>
              {[
                { icon: <Scale style={{ width: 13, height: 13 }} />, label: 'Dual Jurisdiction' },
                { icon: <Shield style={{ width: 13, height: 13 }} />, label: 'Risk Scoring' },
                { icon: <BookMarked style={{ width: 13, height: 13 }} />, label: 'Cited Sources' },
                { icon: <Target style={{ width: 13, height: 13 }} />, label: 'Action Plan' },
                { icon: <TrendingUp style={{ width: 13, height: 13 }} />, label: 'Confidence Level' },
              ].map(f => (
                <span key={f.label} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 600, color: T.muted,
                  background: T.surface, border: `1px solid ${T.divider}`,
                  borderRadius: 20, padding: '5px 11px', fontFamily: T.font,
                }}>
                  <span style={{ color: 'var(--color-glosilex-teal-dim, #00B5A8)' }}>{f.icon}</span>
                  {f.label}
                </span>
              ))}
            </div>

            <div style={{ width: '100%', maxWidth: 520 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: T.faint, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 10, fontFamily: T.font }}>
                Try an example product
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: '5-axis CNC milling machine with positioning accuracy of 1.5 µm', icon: <Layers style={{ width: 13, height: 13 }} /> },
                  { label: 'Carbon fiber prepreg tape with specific tensile strength of 23.5 x 10^4 m', icon: <FlaskConical style={{ width: 13, height: 13 }} /> },
                  { label: 'Radiation-hardened microprocessor rated for 500 krad(Si)', icon: <Cpu style={{ width: 13, height: 13 }} /> },
                ].map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setProductDesc(ex.label)}
                    style={{
                      background: T.surface, border: `1.5px solid ${T.divider}`, borderRadius: 11,
                      padding: '11px 14px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 10,
                      fontSize: 12, color: T.dark, textAlign: 'left' as const,
                      minHeight: 46, transition: 'all 0.2s',
                      boxShadow: '0 1px 4px rgba(10,12,17,0.04)', fontFamily: T.font,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,181,168,0.45)';
                      (e.currentTarget as HTMLElement).style.background = 'rgba(0,181,168,0.04)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,181,168,0.10)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = T.divider;
                      (e.currentTarget as HTMLElement).style.background = T.surface;
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(10,12,17,0.04)';
                    }}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,181,168,0.09)', color: 'var(--color-glosilex-teal-dim, #00B5A8)',
                    }}>{ex.icon}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{ex.label}</span>
                    <ArrowRight style={{ width: 14, height: 14, color: T.faint, flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, justifyContent: 'center' }}>
              {[
                { flag: '🇮🇳', label: 'SCOMET — Oct 2025' },
                { flag: '🇺🇸', label: 'EAR/BIS — Jan 2025' },
              ].map(b => (
                <span key={b.label} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 11, fontWeight: 600, color: T.muted,
                  background: T.surface, border: `1px solid ${T.borderMed}`,
                  borderRadius: 20, padding: '5px 12px', fontFamily: T.font,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-glosilex-teal-dim, #00B5A8)', display: 'inline-block' }} />
                  <span style={{ fontSize: 14 }}>{b.flag}</span> {b.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Spin + pulse keyframes ── */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.85); } }
      `}</style>
    </div></>
  );
};