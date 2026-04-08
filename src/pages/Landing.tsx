import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ChevronRight, X,
  Cpu, MessageSquareText, FileSearch2, FileSignature,
  Layers, Zap, BookOpen,
  CheckCircle2, Clock, ArrowUpRight,
} from 'lucide-react';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type ModuleKey = 'classify' | 'ask' | 'icp' | 'contracts';

interface ModuleDetail {
  key: ModuleKey;
  // Fix: include style prop so Lucide icons don't throw TS error
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  tagline: string;
  description: string;
  route: string;
  accentColor: string;
  capabilities: string[];
  strength: string;
  output: string;
}

interface RoadmapItem {
  phase: string;
  label: string;
  jurisdictions: string[];
  status: 'active' | 'upcoming' | 'future';
  year: string;
}

// ─────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────
const MODULES: ModuleDetail[] = [
  {
    key: 'classify',
    icon: Cpu,
    label: 'Export Classification',
    tagline: 'Silicon-native product intelligence.',
    description: 'Upload any product datasheet — GloSilex extracts technical parameters, cross-references them against the SCOMET Category 7 and EAR Commerce Control List, and returns a dual-jurisdiction classification with full regulatory citations.',
    route: '/classify',
    accentColor: '#00D5C7',
    capabilities: [
      'Dual SCOMET + EAR classification in one pass',
      'Parameter-level extraction from PDFs and datasheets',
      'Full regulatory citations per classification decision',
      'Licensing requirement determination',
      'Confidence scoring on every output',
    ],
    strength: 'The only tool trained natively on SCOMET Category 7 (Oct 2025) and EAR CCL simultaneously.',
    output: 'Cited classification report with ECCN, SCOMET category, and licensing pathway.',
  },
  {
    key: 'ask',
    icon: MessageSquareText,
    label: 'Compliance Q&A',
    tagline: 'The global compliance lexicon, conversational.',
    description: 'Ask any cross-jurisdiction export control question in plain English. GloSilex retrieves answers from the authoritative regulatory corpus — not the internet — and returns risk-rated, cited responses.',
    route: '/ask',
    accentColor: '#00B4A8',
    capabilities: [
      'RAG-grounded answers from official regulatory documents only',
      'Risk-rated responses (HIGH / MEDIUM / LOW)',
      'Cross-jurisdiction reasoning (SCOMET + EAR in one answer)',
      'Citation to exact regulation section',
      'Follow-up context preserved across the session',
    ],
    strength: 'No hallucination. Every answer traces back to a paragraph in an official document.',
    output: 'Risk-rated compliance answer with exact regulatory citations and confidence level.',
  },
  {
    key: 'icp',
    icon: FileSearch2,
    label: 'ICP Gap Analyzer',
    tagline: 'Turn policy gaps into audit-ready SOPs.',
    description: 'Upload your Internal Compliance Program document. GloSilex audits it clause-by-clause against SCOMET and EAR ICP requirements, identifies every gap, and generates ready-to-use SOP text to close each one.',
    route: '/icp',
    accentColor: '#009E94',
    capabilities: [
      'Clause-level gap detection against current ICP requirements',
      'SCOMET and EAR dual-jurisdiction assessment',
      'Risk classification per gap (Critical / Moderate / Minor)',
      'Auto-generated SOP language per gap',
      'Documentation flow recommendations',
    ],
    strength: 'Turns a compliance review that takes a consultant 3 days into a 3-minute audit.',
    output: 'Gap report with risk levels + ready-to-paste SOP text for every identified gap.',
  },
  {
    key: 'contracts',
    icon: FileSignature,
    label: 'Contract Intelligence',
    tagline: 'Lex: Legal logic, export clause precision.',
    description: 'Upload any commercial agreement. GloSilex audits all export-control-relevant clauses, scores adequacy against SCOMET and EAR requirements, and generates jurisdiction-specific clause language where gaps exist.',
    route: '/contracts',
    accentColor: '#008880',
    capabilities: [
      '6-category clause audit per contract',
      'Dual SCOMET + EAR clause adequacy scoring',
      'Risk score (0–100) with confidence rating',
      'AI-generated remediation clause text',
      'Dual-jurisdiction risk flag when both regimes have gaps',
    ],
    strength: 'Replaces ₹1–5 lakh per contract review engagement with a deterministic, cited AI audit.',
    output: 'Clause audit report with adequacy status, risk score, and generated replacement clauses.',
  },
];

const ROADMAP: RoadmapItem[] = [
  {
    phase: 'NOW',
    label: 'MVP Live',
    jurisdictions: ['🇮🇳 India SCOMET (Oct 2025)', '🇺🇸 US EAR / BIS'],
    status: 'active',
    year: '2025–2026',
  },
  {
    phase: 'V2',
    label: 'Multi-Jurisdiction Expansion',
    jurisdictions: ['🇪🇺 EU Dual-Use Regulation', '🇸🇬 Singapore SGCA'],
    status: 'upcoming',
    year: '2026',
  },
  {
    phase: 'V3',
    label: 'Asia-Pacific Coverage',
    jurisdictions: ['🇯🇵 Japan FEFTA', '🇰🇷 South Korea STA'],
    status: 'future',
    year: '2027',
  },
  {
    phase: 'V4',
    label: 'Enterprise & API Platform',
    jurisdictions: ['Batch classification API', 'ERP integrations', 'Team audit trails'],
    status: 'future',
    year: '2027–2028',
  },
];

// ─────────────────────────────────────────────
// SUBCOMPONENTS
// ─────────────────────────────────────────────

const GlobeBackground: React.FC = () => (
  <div className="absolute right-0 top-0 h-full w-1/2 pointer-events-none overflow-hidden" aria-hidden="true">
    <svg
      viewBox="0 0 600 600"
      className="absolute right-[-10%] top-[50%] translate-y-[-50%] w-[70%] max-w-[560px] opacity-[0.07]"
      fill="none"
    >
      {[280, 240, 200, 160, 120, 80, 40].map((r, i) => (
        <circle key={i} cx="300" cy="300" r={r} stroke="#00D5C7" strokeWidth="0.8" />
      ))}
      {[-60, -30, 0, 30, 60].map((angle, i) => (
        <ellipse
          key={i}
          cx="300"
          cy="300"
          rx={Math.abs(Math.cos((angle * Math.PI) / 180) * 280)}
          ry="280"
          stroke="#00D5C7"
          strokeWidth="0.6"
          transform={`rotate(${angle}, 300, 300)`}
        />
      ))}
      {Array.from({ length: 30 }).map((_, row) =>
        Array.from({ length: 30 }).map((_, col) => {
          const x = col * 20 + 10;
          const y = row * 20 + 10;
          const dist = Math.sqrt((x - 300) ** 2 + (y - 300) ** 2);
          if (dist > 290) return null;
          return <circle key={`${row}-${col}`} cx={x} cy={y} r="1.2" fill="#00D5C7" opacity="0.5" />;
        })
      )}
    </svg>
  </div>
);

const GridBackground: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
    <svg className="w-full h-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#00D5C7" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  </div>
);

const ScanLine: React.FC = () => (
  <div
    className="absolute bottom-0 left-0 w-full h-px pointer-events-none"
    style={{ background: 'linear-gradient(90deg, transparent 0%, #00D5C7 40%, #00D5C7 60%, transparent 100%)', opacity: 0.3 }}
    aria-hidden="true"
  />
);

// Module detail slide-in drawer
const ModuleDrawer: React.FC<{
  module: ModuleDetail | null;
  onClose: () => void;
}> = ({ module, onClose }) => {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${module ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={module?.label ?? 'Module detail'}
        className={`fixed top-0 right-0 h-full z-50 w-full max-w-md flex flex-col transition-transform duration-300 ease-out ${module ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: '#0D1017', borderLeft: '1px solid rgba(0,213,199,0.15)' }}
      >
        {module && (
          <>
            {/* Drawer header */}
            <div className="flex items-start justify-between p-6 border-b" style={{ borderColor: 'rgba(0,213,199,0.1)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded flex items-center justify-center"
                  style={{ background: 'rgba(0,213,199,0.1)', border: '1px solid rgba(0,213,199,0.2)' }}
                >
                  <module.icon className="h-4 w-4" style={{ color: module.accentColor }} />
                </div>
                <div>
                  <p className="text-[10px] font-medium tracking-[0.15em] uppercase" style={{ color: '#00D5C7' }}>Module Detail</p>
                  <h3 className="text-base font-bold text-white leading-tight">{module.label}</h3>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded flex items-center justify-center text-[#4A4D58] hover:text-white hover:bg-white/5 transition-all"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <p className="text-sm font-medium italic" style={{ color: '#00D5C7' }}>{module.tagline}</p>
              <p className="text-sm leading-relaxed text-[#8A8D9A]">{module.description}</p>

              <div>
                <p className="text-[10px] tracking-[0.15em] uppercase font-semibold text-[#4A4D58] mb-3">Capabilities</p>
                <ul className="space-y-2">
                  {module.capabilities.map((cap, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#8A8D9A]">
                      <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: module.accentColor }} />
                      {cap}
                    </li>
                  ))}
                </ul>
              </div>

              <div
                className="rounded p-4 space-y-1"
                style={{ background: 'rgba(0,213,199,0.04)', border: '1px solid rgba(0,213,199,0.1)' }}
              >
                <p className="text-[10px] tracking-[0.12em] uppercase font-semibold" style={{ color: '#00D5C7' }}>Unique Strength</p>
                <p className="text-sm text-[#C8CAD0] leading-relaxed">{module.strength}</p>
              </div>

              <div>
                <p className="text-[10px] tracking-[0.15em] uppercase font-semibold text-[#4A4D58] mb-2">Output</p>
                <p className="text-sm text-[#8A8D9A] leading-relaxed">{module.output}</p>
              </div>
            </div>

            {/* Drawer footer */}
            <div className="p-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <Link
                to={module.route}
                onClick={onClose}
                className="flex items-center justify-center gap-2 w-full py-3 rounded text-sm font-semibold tracking-wide transition-all"
                style={{ background: '#00D5C7', color: '#0A0C11' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#00B4A8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#00D5C7'; }}
              >
                Open {module.label} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export const Landing: React.FC = () => {
  const [activeModule, setActiveModule] = useState<ModuleDetail | null>(null);

  return (
    <div
      className="text-white antialiased"
      style={{ background: '#0A0C11', fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── HERO ── */}
      <section className="relative overflow-hidden" style={{ minHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <GridBackground />
        <ScanLine />

        {/* Two-panel layout: 55% brand banner left, 45% globe image right */}
        <div className="relative z-10 flex flex-col md:flex-row flex-1" style={{ minHeight: '92vh' }}>

          {/* LEFT: Brand banner — 55% */}
          <div
            className="relative flex flex-col justify-center px-8 md:px-14 py-16 md:py-0"
            style={{ flex: '0 0 55%', minWidth: 0 }}
          >
            {/* The attached banner image as the wordmark — left aligned, ~55% width */}
            <div className="mb-6">
              <img
                src="/glosilex-banner.png"
                alt="GLOSILEX — Semiconductor Export-Compliance Platform"
                style={{
                  width: '100%',
                  maxWidth: '680px',
                  height: 'auto',
                  display: 'block',
                  objectFit: 'contain',
                  objectPosition: 'left center',
                }}
              />
            </div>

            {/* Eyebrow */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-7 text-[10px] font-medium tracking-[0.18em] uppercase w-fit"
              style={{ background: 'rgba(0,213,199,0.08)', border: '1px solid rgba(0,213,199,0.2)', color: '#00D5C7' }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00D5C7' }} />
              Compliance Intelligence Platform · Now Live
            </div>

            {/* Tagline */}
            <p
              className="mb-10 max-w-lg"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: 'clamp(0.95rem, 1.5vw, 1.15rem)',
                color: '#6A6D7A',
                lineHeight: 1.75,
                letterSpacing: '0.01em',
                fontWeight: 400,
              }}
            >
              Where{' '}
              <span
                style={{
                  color: '#9EAAB8',
                  fontWeight: 500,
                  letterSpacing: '0.015em',
                }}
              >
                global trade intelligence
              </span>{' '}
              meets{' '}
              <span style={{ color: '#9EAAB8', fontWeight: 500 }}>silicon expertise</span>{' '}
              and{' '}
              <span style={{ color: '#9EAAB8', fontWeight: 500 }}>legal precision</span>{' '}
              —{' '}
              <span
                style={{
                  color: '#C8CAD0',
                  fontWeight: 600,
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  letterSpacing: '-0.01em',
                }}
              >
                GloSilex
              </span>{' '}
              is the intelligence layer for semiconductor export compliance.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 mb-10">
              <Link
                to="/classify"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded text-sm font-semibold tracking-wide transition-all"
                style={{ background: '#00D5C7', color: '#0A0C11', letterSpacing: '0.04em' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#00B4A8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#00D5C7'; }}
              >
                Start Analysis <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#modules"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded text-sm font-semibold tracking-wide transition-all"
                style={{ background: 'transparent', color: '#C8CAD0', border: '1px solid rgba(255,255,255,0.14)', letterSpacing: '0.04em' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,213,199,0.4)';
                  (e.currentTarget as HTMLElement).style.color = '#00D5C7';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)';
                  (e.currentTarget as HTMLElement).style.color = '#C8CAD0';
                }}
              >
                Explore Modules
              </a>
            </div>

            {/* Live coverage */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-medium tracking-[0.12em] uppercase" style={{ color: '#4A4D58' }}>Live Coverage</span>
              {[
                { flag: '🇮🇳', label: 'India SCOMET Oct 2025' },
                { flag: '🇺🇸', label: 'US EAR · BIS' },
              ].map(j => (
                <span
                  key={j.label}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#8A8D9A' }}
                >
                  {j.flag} {j.label}
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT: Globe image — 45%, flush right edge, full height */}
          <div
            className="hidden md:block relative"
            style={{ flex: '0 0 45%', minWidth: 0, overflow: 'hidden' }}
          >
            {/* Left-side fade so globe blends into the brand panel */}
            <div
              className="absolute inset-y-0 left-0 w-32 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to right, #0A0C11 0%, transparent 100%)' }}
              aria-hidden="true"
            />
            {/* Bottom fade */}
            <div
              className="absolute inset-x-0 bottom-0 h-32 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, transparent 0%, #0A0C11 100%)' }}
              aria-hidden="true"
            />
            <img
              src="/globe-semiconductor.jpg"
              alt="Global semiconductor trade network"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center center',
                display: 'block',
                opacity: 0.88,
              }}
            />
          </div>
        </div>
      </section>

      {/* ── MODULES ── */}
      <section id="modules" className="px-6 md:px-10 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <p className="text-[10px] tracking-[0.2em] uppercase font-medium mb-2" style={{ color: '#00D5C7' }}>Four Intelligence Modules</p>
            <h2
              className="font-bold leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: '#E8E8EA' }}
            >
              The complete semiconductor<br />export compliance suite.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {MODULES.map((mod) => (
              <button
                key={mod.key}
                onClick={() => setActiveModule(mod)}
                className="group text-left rounded-lg p-6 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                style={{ background: '#0D1017', border: '1px solid rgba(255,255,255,0.06)' }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = 'rgba(0,213,199,0.25)';
                  el.style.background = '#10141C';
                  el.style.boxShadow = '0 0 0 1px rgba(0,213,199,0.08), 0 8px 24px rgba(0,0,0,0.4)';
                  el.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = 'rgba(255,255,255,0.06)';
                  el.style.background = '#0D1017';
                  el.style.boxShadow = 'none';
                  el.style.transform = 'translateY(0)';
                }}
                aria-label={`View ${mod.label} details`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(0,213,199,0.07)', border: '1px solid rgba(0,213,199,0.15)' }}
                  >
                    <mod.icon className="h-5 w-5" style={{ color: mod.accentColor }} />
                  </div>
                  <ArrowUpRight
                    className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: '#00D5C7' }}
                  />
                </div>

                <h3
                  className="text-base font-bold text-white mb-1.5"
                  style={{ fontFamily: "'Space Grotesk','Inter',sans-serif" }}
                >
                  {mod.label}
                </h3>
                <p className="text-sm text-[#8A8D9A] leading-relaxed mb-4">{mod.description.split('.')[0]}.</p>

                <div className="flex flex-wrap gap-1.5">
                  {mod.capabilities.slice(0, 2).map((cap, j) => (
                    <span
                      key={j}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full tracking-wide"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#4A4D58' }}
                    >
                      {cap.split(' ').slice(0, 4).join(' ')}…
                    </span>
                  ))}
                </div>

                <p className="text-[10px] mt-4 font-medium tracking-wide" style={{ color: '#00D5C7', opacity: 0.6 }}>
                  Click to explore →
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section
        className="px-6 md:px-10 py-20 relative overflow-hidden"
        style={{ background: '#0D1017', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <GridBackground />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="mb-12">
            <p className="text-[10px] tracking-[0.2em] uppercase font-medium mb-2" style={{ color: '#00D5C7' }}>From Upload to Audit-Ready</p>
            <h2
              className="font-bold"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: '#E8E8EA' }}
            >
              How GloSilex works.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-px" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {[
              {
                n: '01',
                icon: Layers,
                title: 'Load Regulatory Intelligence',
                body: 'GloSilex pre-loads the authoritative regulatory corpus — SCOMET Category 7 (Oct 2025 mandate), EAR CCL, BIS advisories, and ICP guidelines — into a vector knowledge base. Every answer is grounded in this corpus.',
                detail: 'No internet search. No hallucination. Pure regulatory documents.',
              },
              {
                n: '02',
                icon: Zap,
                title: 'Upload, Ask, or Audit',
                body: 'Choose your module: upload a datasheet for classification, paste a question for compliance Q&A, upload your ICP for gap analysis, or upload a contract for clause audit. GloSilex handles PDFs, docs, and plain text.',
                detail: 'Cross-jurisdiction reasoning runs in a single pass.',
              },
              {
                n: '03',
                icon: BookOpen,
                title: 'Receive Cited, Risk-Rated Output',
                body: 'Every output — classification, Q&A answer, gap report, or clause audit — includes risk rating (HIGH/MEDIUM/LOW), confidence scoring, and citations to exact regulatory paragraphs. Export as a shareable compliance report.',
                detail: 'Audit-ready. Attorney-reviewable. Defensible.',
              },
            ].map((step, i) => (
              <div
                key={i}
                className="p-8 transition-all duration-200"
                style={{ background: '#0D1017' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#111520'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0D1017'; }}
              >
                <div className="flex items-start gap-4 mb-5">
                  <span
                    className="text-[10px] font-bold tracking-[0.2em]"
                    style={{ color: '#00D5C7', fontFamily: "'Space Grotesk','Inter',sans-serif", lineHeight: 1 }}
                  >
                    {step.n}
                  </span>
                  <step.icon className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#00D5C7' }} />
                </div>
                <h3
                  className="text-base font-bold text-white mb-3"
                  style={{ fontFamily: "'Space Grotesk','Inter',sans-serif" }}
                >
                  {step.title}
                </h3>
                <p className="text-sm text-[#8A8D9A] leading-relaxed mb-4">{step.body}</p>
                <p className="text-[11px] font-medium tracking-wide" style={{ color: '#00D5C7', opacity: 0.7 }}>
                  {step.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COST BANNER ── */}
      <section
        className="px-6 md:px-10 py-16 relative overflow-hidden"
        style={{ background: '#0A0C11' }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 100% at 50% 50%, rgba(0,213,199,0.04) 0%, transparent 70%)' }}
          aria-hidden="true"
        />
        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <p className="text-[10px] tracking-[0.2em] uppercase font-medium mb-4" style={{ color: '#00D5C7' }}>The Economic Case</p>
          <h2
            className="font-bold mb-4 leading-tight"
            style={{
              fontFamily: "'Space Grotesk','Inter',sans-serif",
              fontSize: 'clamp(1.6rem, 3.5vw, 2.6rem)',
              color: '#E8E8EA',
            }}
          >
            Save ₹1–5 lakh<br />
            <span style={{ color: '#8A8D9A', fontWeight: 500, fontSize: '0.65em' }}>per compliance engagement.</span>
          </h2>
          <p className="text-sm text-[#8A8D9A] max-w-xl mx-auto leading-relaxed mb-8">
            Enterprise compliance platforms cost $200k/year and are built for legal teams, not engineers or trade desks.
            GloSilex puts semiconductor-native, citation-grade compliance intelligence directly in the hands of compliance
            officers, lawyers, and engineers who need it instantly.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
            {[
              { value: '₹50L', label: 'Max SCOMET penalty under FTDR Act', color: '#DC2626' },
              { value: '$200k', label: 'Enterprise tool cost per year', color: '#D97706' },
              { value: '<3 min', label: 'GloSilex analysis time', color: '#00D5C7' },
            ].map((stat, i) => (
              <div
                key={i}
                className="py-4 px-5 rounded-lg text-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <p
                  className="text-2xl font-bold mb-1"
                  style={{ color: stat.color, fontFamily: "'Space Grotesk','Inter',sans-serif", fontVariantNumeric: 'tabular-nums' }}
                >
                  {stat.value}
                </p>
                <p className="text-[11px] text-[#4A4D58] leading-snug">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROADMAP ── */}
      <section
        className="px-6 md:px-10 py-20"
        style={{ background: '#0D1017', borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="mb-12">
            <p className="text-[10px] tracking-[0.2em] uppercase font-medium mb-2" style={{ color: '#00D5C7' }}>Global Expansion</p>
            <h2
              className="font-bold"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: '#E8E8EA' }}
            >
              The global compliance roadmap.
            </h2>
          </div>

          <div className="relative">
            <div
              className="absolute left-[19px] top-3 bottom-3 w-px hidden md:block"
              style={{ background: 'linear-gradient(to bottom, #00D5C7 0%, rgba(0,213,199,0.1) 30%, rgba(255,255,255,0.04) 100%)' }}
              aria-hidden="true"
            />
            <div className="space-y-3">
              {ROADMAP.map((item, i) => (
                <div
                  key={i}
                  className="relative flex gap-5 rounded-lg p-5 transition-all duration-200"
                  style={{
                    background: item.status === 'active' ? 'rgba(0,213,199,0.05)' : 'transparent',
                    border: item.status === 'active' ? '1px solid rgba(0,213,199,0.15)' : '1px solid rgba(255,255,255,0.04)',
                    opacity: item.status === 'future' ? 0.55 : 1,
                  }}
                  onMouseEnter={e => { if (item.status !== 'active') (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { if (item.status !== 'active') (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div className="flex-shrink-0 flex items-center justify-center w-10 h-10">
                    {item.status === 'active' ? (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#00D5C7' }}>
                        <CheckCircle2 className="h-3 w-3 text-[#0A0C11]" />
                      </div>
                    ) : item.status === 'upcoming' ? (
                      <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: '#00D5C7', background: 'transparent' }} />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'transparent' }} />
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span
                        className="text-[9px] font-bold tracking-[0.15em] px-2 py-0.5 rounded-full uppercase"
                        style={{
                          background: item.status === 'active' ? 'rgba(0,213,199,0.15)' : 'rgba(255,255,255,0.05)',
                          color: item.status === 'active' ? '#00D5C7' : '#4A4D58',
                          border: `1px solid ${item.status === 'active' ? 'rgba(0,213,199,0.2)' : 'rgba(255,255,255,0.06)'}`,
                        }}
                      >
                        {item.phase}
                      </span>
                      <span className="text-sm font-semibold text-white">{item.label}</span>
                      <span className="text-[11px] ml-auto" style={{ color: '#4A4D58' }}>
                        <Clock className="inline h-3 w-3 mr-0.5 -mt-px" />{item.year}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.jurisdictions.map((j, k) => (
                        <span key={k} className="text-[11px] text-[#8A8D9A]">
                          {j}{k < item.jurisdictions.length - 1 && ' ·'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── MODULE DRAWER ── */}
      <ModuleDrawer module={activeModule} onClose={() => setActiveModule(null)} />
    </div>
  );
};