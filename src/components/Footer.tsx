import React, { useState } from 'react';

type ModalKey = 'privacy' | 'terms' | 'contact' | null;

const MODAL_CONTENT: Record<NonNullable<ModalKey>, { title: string; body: React.ReactNode }> = {
  privacy: {
    title: 'Privacy Policy',
    body: (
      <div className="space-y-4 text-sm text-[#8899aa] leading-relaxed">
        <p><strong className="text-white">Data you upload</strong> — Datasheets, contracts, and ICP documents you upload are processed in memory for the duration of your session only. They are not stored on our servers after your session ends.</p>
        <p><strong className="text-white">Session data</strong> — API credentials you enter are held in browser session memory and cleared when you close the tab or click logout. They are never transmitted to or stored by GloSilex servers.</p>
        <p><strong className="text-white">No tracking</strong> — GloSilex does not use advertising trackers, analytics cookies, or third-party profiling. Usage telemetry, if any, is anonymised and used solely to improve response quality.</p>
        <p><strong className="text-white">Third-party processors</strong> — AI inference is performed via Google Gemini APIs. Vector search runs on Supabase pgvector. Both operate under their respective data processing agreements.</p>
        <p><strong className="text-white">Contact</strong> — For privacy inquiries write to <span className="text-[#2dd4bf]">privacy@glosilex.com</span></p>
      </div>
    ),
  },
  terms: {
    title: 'Terms of Use',
    body: (
      <div className="space-y-4 text-sm text-[#8899aa] leading-relaxed">
        <p><strong className="text-white">Informational use only</strong> — GloSilex outputs are AI-generated and provided for informational and preliminary screening purposes. They do not constitute legal advice, export licensing determinations, or official regulatory guidance.</p>
        <p><strong className="text-white">No reliance</strong> — Do not rely solely on GloSilex outputs for shipping, licensing, or contractual decisions. Always verify with a qualified export control attorney and the relevant regulatory authority (DGFT for SCOMET, BIS for EAR).</p>
        <p><strong className="text-white">Accuracy</strong> — While GloSilex is grounded in official regulatory documents, the regulatory landscape changes frequently. GloSilex makes no warranty that its outputs reflect the most current regulatory amendments.</p>
        <p><strong className="text-white">Acceptable use</strong> — GloSilex may not be used to facilitate unlicensed exports, evade export controls, or violate any applicable trade law.</p>
        <p><strong className="text-white">Jurisdiction</strong> — These terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of courts in Chennai, Tamil Nadu.</p>
      </div>
    ),
  },
  contact: {
    title: 'Contact GloSilex',
    body: (
      <div className="space-y-5 text-sm text-[#8899aa] leading-relaxed">
        <p>We're building the compliance intelligence layer for the semiconductor trade ecosystem. Reach us for partnerships, enterprise access, regulatory feedback, or support.</p>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-[#2dd4bf] mt-0.5 text-lg">✉</span>
            <div>
              <div className="text-white font-semibold text-xs uppercase tracking-widest mb-1">General & Support</div>
              <a href="mailto:hello@glosilex.com" className="text-[#2dd4bf] hover:underline">hello@glosilex.com</a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-[#2dd4bf] mt-0.5 text-lg">⚖</span>
            <div>
              <div className="text-white font-semibold text-xs uppercase tracking-widest mb-1">Regulatory & Compliance Feedback</div>
              <a href="mailto:compliance@glosilex.com" className="text-[#2dd4bf] hover:underline">compliance@glosilex.com</a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-[#2dd4bf] mt-0.5 text-lg">🏢</span>
            <div>
              <div className="text-white font-semibold text-xs uppercase tracking-widest mb-1">Enterprise & Partnerships</div>
              <a href="mailto:enterprise@glosilex.com" className="text-[#2dd4bf] hover:underline">enterprise@glosilex.com</a>
            </div>
          </div>
        </div>
        <p className="text-[#556677] text-xs border-t border-white/8 pt-4">Response time: 1–2 business days. For urgent compliance matters, please include "URGENT" in the subject line.</p>
      </div>
    ),
  },
};

// Fixed wordmark — GLOSILE+X flush, no gap
const GloSilexWordmark: React.FC = () => (
  <svg
    width="130"
    height="24"
    viewBox="0 0 130 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="GloSilex"
  >
    {/* GLOSILEX text as one continuous word, X drawn over the last letter slot */}
    <text
      x="0"
      y="18"
      fontFamily="'Space Grotesk', 'Inter', sans-serif"
      fontWeight="700"
      fontSize="17"
      fill="#e2e8f0"
      letterSpacing="-0.3"
    >GLOSILE</text>
    {/* X — positioned immediately after GLOSILE, no gap */}
    <line x1="100" y1="3" x2="118" y2="20" stroke="#2dd4bf" strokeWidth="2.8" strokeLinecap="round" opacity="0.25" />
    <line x1="118" y1="3" x2="100" y2="20" stroke="#2dd4bf" strokeWidth="2.8" strokeLinecap="round" opacity="0.25" />
    <line x1="100" y1="3" x2="118" y2="20" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" />
    <line x1="118" y1="3" x2="100" y2="20" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" />
    {/* Arrow tips on X */}
    <polyline points="116,3 118,3 118,5" stroke="#2dd4bf" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polyline points="102,20 100,20 100,18" stroke="#2dd4bf" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polyline points="102,3 100,3 100,5" stroke="#2dd4bf" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polyline points="116,20 118,20 118,18" stroke="#2dd4bf" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

export const Footer: React.FC = () => {
  const [activeModal, setActiveModal] = useState<ModalKey>(null);
  const modal = activeModal ? MODAL_CONTENT[activeModal] : null;

  return (
    <>
      <footer
        className="bg-[#0a0c0f] text-[#556677] border-t mt-auto print:hidden no-print"
        style={{ borderColor: 'rgba(255,255,255,0.07)', fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
      >
        <div className="w-full px-6 md:px-10 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">

            {/* Brand */}
            <div className="flex flex-col gap-1.5">
              <GloSilexWordmark />
              <span className="text-[11px] uppercase tracking-widest" style={{ color: '#334455' }}>
                Semiconductor Export Compliance · AI-Powered
              </span>
            </div>

            {/* Legal links */}
            <div className="flex gap-6 text-[13px]">
              {(['privacy', 'terms', 'contact'] as ModalKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveModal(key)}
                  className="capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf] rounded"
                  style={{ color: '#556677' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#2dd4bf'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#556677'}
                >
                  {key === 'contact' ? 'Contact' : key === 'terms' ? 'Terms' : 'Privacy'}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom strip */}
          <div className="mt-8 pt-6 border-t flex flex-col gap-2 text-[11px]" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <p style={{ color: '#334455' }}>
              Powered by <span style={{ color: '#445566' }}>Google Gemini</span> · <span style={{ color: '#445566' }}>Supabase pgvector</span>
            </p>
            <p className="leading-relaxed max-w-3xl" style={{ color: '#2d3a44' }}>
              ⚠ LEGAL DISCLAIMER: GloSilex is an AI tool for informational purposes only. It does not constitute legal advice.
              Verify all compliance determinations with a qualified export control attorney before making shipping, licensing, or contractual decisions.
            </p>
          </div>
        </div>
      </footer>

      {/* Modal overlay */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(5,7,10,0.88)', backdropFilter: 'blur(8px)' }}
          onClick={() => setActiveModal(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-xl border"
            style={{
              background: '#0d1117',
              borderColor: 'rgba(255,255,255,0.1)',
              boxShadow: '0 0 0 1px rgba(45,212,191,0.08), 0 24px 64px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <h2 className="font-bold text-white tracking-tight" style={{ fontSize: '16px' }}>{modal.title}</h2>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf]"
                style={{ color: '#556677' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#fff'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#556677'}
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 max-h-[65vh] overflow-y-auto">{modal.body}</div>
          </div>
        </div>
      )}
    </>
  );
};