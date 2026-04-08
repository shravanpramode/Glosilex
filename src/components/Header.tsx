import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Settings, ChevronDown, Globe, Keyboard, Sliders, FileText, Download, ClipboardList, LogOut, Wifi } from 'lucide-react';
import { clearCredentials } from '../utils/session';
import { clearEverything } from '../utils/sessionPersistence';

// ─────────────────────────────────────────────────────────────────────────────
// LOGO CONFIGURATION
//
// CURRENT MODE: Image logo (glosilex-TopLeft-Logo.jpg placed in /public or
//   imported as an asset). Set USE_IMAGE_LOGO = true to show the image.
//
// FUTURE MODE: When the image is removed, set USE_IMAGE_LOGO = false.
//   The <BrandWordmark> component below will render the text-based brand name
//   exactly as it was before, using the GloSilexMark SVG icon + wordmark text.
//
// ─── TO SWITCH BACK TO TEXT BRANDING IN THE FUTURE ──────────────────────────
//   1. Set USE_IMAGE_LOGO = false  (line below)
//   2. The BrandWordmark component will automatically re-engage
//   3. Remove or ignore LOGO_IMAGE_PATH — it won't be referenced
// ─────────────────────────────────────────────────────────────────────────────
const USE_IMAGE_LOGO = true;

// Path to the logo image. Place glosilex-TopLeft-Logo.jpg in your /public
// folder and use '/glosilex-TopLeft-Logo.jpg', OR import it at the top of
// this file as: import logoImg from '../assets/glosilex-TopLeft-Logo.jpg';
// and set LOGO_IMAGE_PATH = logoImg;
const LOGO_IMAGE_PATH = '/glosilex-TopLeft-Logo.png';

// ─── FUTURE / FALLBACK: SVG icon mark ────────────────────────────────────────
// This SVG is used by BrandWordmark (text mode). It is NOT rendered when
// USE_IMAGE_LOGO = true. Keep it here so the text-brand fallback stays intact.
const GloSilexMark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="GloSilex logo mark"
  >
    <rect width="40" height="40" rx="8" fill="#0d1117" />
    <text
      x="3"
      y="27"
      fontFamily="'Space Grotesk', 'Inter', sans-serif"
      fontWeight="700"
      fontSize="13"
      fill="#e2e8f0"
      letterSpacing="-0.5"
    >GSL</text>
    <line x1="25.5" y1="13.5" x2="38.5" y2="27.5" stroke="#2dd4bf" strokeWidth="3.2" strokeLinecap="round" opacity="0.22" />
    <line x1="38.5" y1="13.5" x2="25.5" y2="27.5" stroke="#2dd4bf" strokeWidth="3.2" strokeLinecap="round" opacity="0.22" />
    <line x1="26" y1="14" x2="38" y2="27" stroke="#2dd4bf" strokeWidth="2.1" strokeLinecap="round" />
    <line x1="38" y1="14" x2="26" y2="27" stroke="#2dd4bf" strokeWidth="2.1" strokeLinecap="round" />
    <polyline points="36,14 38,14 38,16" stroke="#2dd4bf" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polyline points="28,27 26,27 26,25" stroke="#2dd4bf" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polyline points="28,14 26,14 26,16" stroke="#2dd4bf" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polyline points="36,27 38,27 38,25" stroke="#2dd4bf" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

// ─── FUTURE / FALLBACK: Text-based brand wordmark ─────────────────────────────
// Rendered only when USE_IMAGE_LOGO = false. Preserves the original brand name
// display with SVG icon + "GLOSILEX" + "Compliance Intelligence Platform".
// ── BEGIN FUTURE-USE BRAND WORDMARK (inactive while USE_IMAGE_LOGO = true) ──
const BrandWordmark: React.FC = () => (
  <>
    <GloSilexMark size={40} />
    <div className="flex flex-col leading-none gap-[3px]">
      <span
        className="font-bold text-white tracking-tight"
        style={{ fontSize: '17px', letterSpacing: '-0.02em' }}
      >
        GLOSILEX
      </span>
      <span
        className="hidden md:block text-[10px] uppercase tracking-widest"
        style={{ color: '#2dd4bf', letterSpacing: '0.14em' }}
      >
        Compliance Intelligence Platform
      </span>
    </div>
  </>
);
// ── END FUTURE-USE BRAND WORDMARK ────────────────────────────────────────────


const SETTINGS_ITEMS = [
  {
    group: 'Platform',
    items: [
      { icon: Globe, label: 'Regulatory Coverage', sub: 'SCOMET Oct 2025 · EAR Jan 2025', action: 'coverage' },
      { icon: Wifi, label: 'Connection Status', sub: 'Gemini API · Supabase pgvector', action: 'status' },
    ],
  },
  {
    group: 'Preferences',
    items: [
      { icon: Sliders, label: 'API Configuration', sub: 'Manage API keys & endpoints', action: 'api' },
      { icon: FileText, label: 'Report Preferences', sub: 'Default format & citation style', action: 'report' },
      { icon: Download, label: 'Export Settings', sub: 'PDF layout, watermark, branding', action: 'export' },
    ],
  },
  {
    group: 'Session',
    items: [
      { icon: ClipboardList, label: 'Compliance Audit Log', sub: 'View current session history', action: 'log' },
      { icon: Keyboard, label: 'Keyboard Shortcuts', sub: 'Navigate modules faster', action: 'shortcuts' },
    ],
  },
];


export const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const location = useLocation();
  const settingsRef = useRef<HTMLDivElement>(null);

  const navLinks = [
    { name: 'Export Classification', path: '/classify' },
    { name: 'Compliance Q&A', path: '/ask' },
    { name: 'ICP Gap Analyzer', path: '/icp' },
    { name: 'Contract Intelligence', path: '/contracts' },
  ];

  const handleLogout = () => {
    clearCredentials();
    clearEverything();
    window.location.reload();
  };

  const handleNavClick = (path: string) => {
    if (location.pathname !== path) clearEverything();
    setIsMobileMenuOpen(false);
  };

  const handleSettingsAction = (action: string) => {
    if (action === 'api' || action === 'log' || action === 'shortcuts') {
      setSettingsMsg(`${action === 'api' ? 'API Configuration' : action === 'log' ? 'Audit Log' : 'Keyboard Shortcuts'} — available in a future update.`);
      setTimeout(() => setSettingsMsg(null), 3000);
    }
    setIsSettingsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <header
        className="sticky top-0 z-40 print:hidden no-print backdrop-blur-md border-b transition-all duration-300"
        style={{
          background: 'rgba(10,12,17,0.97)',
          borderColor: 'rgba(255,255,255,0.07)',
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
        }}
      >
        <div className="w-full px-6 md:px-10">
          <div className="flex justify-between items-center" style={{ height: '72px' }}>

            {/* ── Logo / Brand ─────────────────────────────────────────── */}
            <Link
              to="/"
              className="flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0c0f] rounded-md"
              onClick={() => handleNavClick('/')}
            >
              {/* ── IMAGE LOGO MODE (active) ─────────────────────────────
                  Shows the uploaded brand image from LOGO_IMAGE_PATH.
                  Height is capped at 52px so it sits comfortably in the
                  72px header without clipping. Width is auto so the full
                  horizontal logo is never cropped.
                  To disable: set USE_IMAGE_LOGO = false at the top of file.
              ────────────────────────────────────────────────────────── */}
              {USE_IMAGE_LOGO ? (
                <img
                  src={LOGO_IMAGE_PATH}
                  alt="GloSilex — Compliance Intelligence Platform"
                  style={{
                    height: '52px',
                    width: 'auto',
                    maxWidth: '280px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              ) : (
                // ── TEXT BRAND MODE (future) ─────────────────────────
                // Remove image and set USE_IMAGE_LOGO = false to re-enable
                // the SVG icon + wordmark text branding below.
                <BrandWordmark />
              )}
            </Link>

            {/* ── Desktop nav ──────────────────────────────────────────── */}
            <nav className="hidden md:flex items-center h-full" aria-label="Main navigation">
              {navLinks.map((link) => {
                const active = location.pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => handleNavClick(link.path)}
                    className={`relative px-4 h-full flex items-center font-medium tracking-wide transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf] group ${
                      active ? 'text-[#2dd4bf]' : 'text-[#8899aa] hover:text-white'
                    }`}
                    style={{ fontSize: '14px' }}
                  >
                    {link.name}
                    {active && <span className="absolute bottom-0 left-0 h-[2px] w-full bg-[#2dd4bf]" aria-hidden="true" />}
                    {!active && <span className="absolute bottom-0 left-0 h-[2px] bg-[#2dd4bf] w-0 group-hover:w-full transition-all duration-300" aria-hidden="true" />}
                  </Link>
                );
              })}
            </nav>

            {/* ── Right actions ─────────────────────────────────────────── */}
            <div className="hidden md:flex items-center gap-2" ref={settingsRef}>
              <div className="relative">
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf]"
                  style={{
                    color: isSettingsOpen ? '#2dd4bf' : '#8899aa',
                    background: isSettingsOpen ? 'rgba(45,212,191,0.08)' : 'transparent',
                    border: `1px solid ${isSettingsOpen ? 'rgba(45,212,191,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    minHeight: '44px',
                  }}
                  title="Settings"
                  aria-label="Open settings"
                  aria-expanded={isSettingsOpen}
                >
                  <Settings className="h-[18px] w-[18px]" style={{ transition: 'transform 0.3s', transform: isSettingsOpen ? 'rotate(45deg)' : 'rotate(0deg)' }} />
                  <ChevronDown className="h-3 w-3" style={{ transition: 'transform 0.2s', transform: isSettingsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>

                {/* Settings dropdown */}
                {isSettingsOpen && (
                  <div
                    className="absolute right-0 top-[calc(100%+8px)] w-72 rounded-xl overflow-hidden z-50"
                    style={{
                      background: '#0D1017',
                      border: '1px solid rgba(45,212,191,0.15)',
                      boxShadow: '0 0 0 1px rgba(45,212,191,0.06), 0 24px 48px rgba(0,0,0,0.7)',
                    }}
                  >
                    <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: '#2dd4bf' }}>Platform Settings</p>
                      <p className="text-[11px] mt-0.5" style={{ color: '#4A4D58' }}>GloSilex · Session active</p>
                    </div>

                    {SETTINGS_ITEMS.map((group) => (
                      <div key={group.group} className="py-1">
                        <p className="px-4 py-1.5 text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: '#334455' }}>
                          {group.group}
                        </p>
                        {group.items.map((item) => (
                          <button
                            key={item.action}
                            onClick={() => handleSettingsAction(item.action)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                            style={{ color: '#8899aa' }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.background = 'rgba(45,212,191,0.05)';
                              (e.currentTarget as HTMLElement).style.color = '#C8CAD0';
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.background = 'transparent';
                              (e.currentTarget as HTMLElement).style.color = '#8899aa';
                            }}
                          >
                            <item.icon className="h-4 w-4 flex-shrink-0" style={{ color: '#2dd4bf', opacity: 0.7 }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-white leading-tight">{item.label}</p>
                              <p className="text-[11px] truncate mt-0.5" style={{ color: '#4A4D58' }}>{item.sub}</p>
                            </div>
                          </button>
                        ))}
                        <div className="mx-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }} />
                      </div>
                    ))}

                    {/* Sign out */}
                    <div className="px-3 pb-3 pt-1">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                        style={{ color: '#8899aa', border: '1px solid rgba(255,255,255,0.06)' }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,0.06)';
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(220,38,38,0.2)';
                          (e.currentTarget as HTMLElement).style.color = '#f87171';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
                          (e.currentTarget as HTMLElement).style.color = '#8899aa';
                        }}
                      >
                        <LogOut className="h-4 w-4 flex-shrink-0" />
                        <div>
                          <p className="text-[13px] font-medium leading-tight">Sign Out</p>
                          <p className="text-[11px] mt-0.5" style={{ color: '#4A4D58' }}>Clear session & credentials</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Mobile toggle ─────────────────────────────────────────── */}
            <button
              className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf] rounded-md transition-colors"
              style={{ color: '#8899aa' }}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#fff'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#8899aa'}
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* ── Mobile menu ───────────────────────────────────────────────── */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t" style={{ background: '#0d1117', borderColor: 'rgba(255,255,255,0.07)' }}>
            <div className="px-6 pt-2 pb-4 space-y-1">
              {navLinks.map((link) => {
                const active = location.pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`block px-3 py-3 rounded-md text-sm font-medium transition-colors ${
                      active ? 'text-[#2dd4bf]' : 'text-[#8899aa] hover:text-white'
                    }`}
                    style={{ background: active ? 'rgba(45,212,191,0.08)' : 'transparent' }}
                    onClick={() => handleNavClick(link.path)}
                  >
                    {link.name}
                  </Link>
                );
              })}
              <button
                onClick={handleLogout}
                className="block w-full text-left px-3 py-3 rounded-md text-sm font-medium min-h-[44px] transition-colors"
                style={{ color: '#8899aa' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,0.06)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#8899aa'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Settings toast */}
      {settingsMsg && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg text-sm font-medium"
          style={{ background: '#0D1017', border: '1px solid rgba(45,212,191,0.2)', color: '#C8CAD0', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
        >
          {settingsMsg}
        </div>
      )}
    </>
  );
};
