import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Shield, Settings } from 'lucide-react';
import { clearCredentials } from '../utils/session';

export const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { name: 'Classify', path: '/classify' },
    { name: 'Ask Compliance', path: '/ask' },
    { name: 'ICP Review', path: '/icp' },
    { name: 'Contracts', path: '/contracts' },
  ];

  const handleLogout = () => {
    clearCredentials();
    window.location.reload();
  };

  return (
    <header className="bg-slate-900 text-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <Shield className="h-8 w-8 text-indigo-500" />
              <div>
                <span className="font-bold text-xl tracking-tight">SemiShield</span>
                <span className="hidden md:block text-xs text-slate-400">Compliance Intelligence for the Semiconductor Age</span>
              </div>
            </Link>
          </div>

          <nav className="hidden md:flex space-x-8 h-full">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-colors hover:text-indigo-400 h-full flex items-center border-b-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                  location.pathname === link.path ? 'text-indigo-400 border-indigo-400' : 'text-slate-300 border-transparent'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <div className="flex gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                🇮🇳 SCOMET
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                🇺🇸 EAR
              </span>
            </div>
            <button 
              onClick={handleLogout} 
              className="text-slate-400 hover:text-white p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center" 
              title="Settings / Logout"
              aria-label="Settings and Logout"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>

          <div className="md:hidden flex items-center">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
              className="text-slate-300 hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-md"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden bg-slate-800 border-t border-slate-700">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  location.pathname === link.path ? 'bg-slate-900 text-indigo-400' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.name}
              </Link>
            ))}
            <button onClick={handleLogout} className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-slate-300 hover:bg-slate-700 hover:text-white min-h-[44px]">
              Settings / Logout
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
