import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Search, FileText, FileCheck, CheckCircle2, ArrowRight } from 'lucide-react';

export const Landing: React.FC = () => {
  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Hero Section */}
      <section className="bg-slate-900 text-white py-20 px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
            Semiconductor Trade Compliance, <span className="text-indigo-500">Powered by AI</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 mb-10 max-w-3xl mx-auto">
            Instant answers on India SCOMET and US EAR/BIS. Classify products, review ICP readiness, analyze contracts, and generate cited compliance reports.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link to="/ask" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors flex items-center justify-center gap-2 min-h-[44px]">
              Start with Q&A <ArrowRight className="h-5 w-5" />
            </Link>
            <a href="#modules" className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors border border-slate-700 min-h-[44px] flex items-center justify-center">
              Explore Modules
            </a>
          </div>
          <div className="mt-12 flex justify-center gap-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-900/50 text-orange-200 border border-orange-700/50">
              🇮🇳 India SCOMET Oct 2025
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-900/50 text-indigo-200 border border-indigo-700/50">
              🇺🇸 US EAR Jan 2025 Update
            </span>
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
            <div className="text-4xl font-bold text-red-500 mb-2">₹50 lakh</div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Maximum SCOMET Penalty</h3>
            <p className="text-slate-600">Under the FTDR Act for unauthorized exports of Category 7 items.</p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
            <div className="text-4xl font-bold text-amber-500 mb-2">$200k/yr</div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Enterprise Tool Costs</h3>
            <p className="text-slate-600">Legacy compliance tools are inaccessible to SMBs and startups.</p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
            <div className="text-4xl font-bold text-indigo-500 mb-2">Oct 2025</div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">SCOMET Cat 7 Mandate</h3>
            <p className="text-slate-600">The first AI tool native to the new semiconductor regulations.</p>
          </div>
        </div>
      </section>

      {/* Modules Grid */}
      <section id="modules" className="py-16 px-4 sm:px-6 lg:px-8 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">Comprehensive Compliance Suite</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <Link to="/classify" className="group p-8 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all">
              <Search className="h-10 w-10 text-indigo-500 mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">Classify My Product</h3>
              <p className="text-slate-600 mb-4">Upload a datasheet to instantly determine SCOMET and EAR licensing requirements with full citations.</p>
              <span className="text-indigo-600 font-medium flex items-center gap-1">Try it now <ArrowRight className="h-4 w-4" /></span>
            </Link>
            <Link to="/ask" className="group p-8 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all">
              <Shield className="h-10 w-10 text-indigo-500 mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">Ask Compliance</h3>
              <p className="text-slate-600 mb-4">Chat with our AI copilot grounded entirely in official regulatory documents. Get cited, risk-rated answers.</p>
              <span className="text-indigo-600 font-medium flex items-center gap-1">Try it now <ArrowRight className="h-4 w-4" /></span>
            </Link>
            <Link to="/icp" className="group p-8 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all">
              <FileCheck className="h-10 w-10 text-indigo-500 mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">ICP Gap Analyzer</h3>
              <p className="text-slate-600 mb-4">Upload your Internal Compliance Program to find gaps against new regulations. Generates ready-to-use SOP text.</p>
              <span className="text-indigo-600 font-medium flex items-center gap-1">Try it now <ArrowRight className="h-4 w-4" /></span>
            </Link>
            <Link to="/contracts" className="group p-8 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all">
              <FileText className="h-10 w-10 text-indigo-500 mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">Contract Intelligence</h3>
              <p className="text-slate-600 mb-4">Audit agreements for missing export control clauses. Generates legally-framed, jurisdiction-specific clause text.</p>
              <span className="text-indigo-600 font-medium flex items-center gap-1">Try it now <ArrowRight className="h-4 w-4" /></span>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-slate-900 mb-12">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-1/2 left-1/6 right-1/6 h-0.5 bg-slate-200 -z-10"></div>
          <div className="bg-slate-50 p-6">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4 shadow-lg">1</div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Connect & Load</h3>
            <p className="text-slate-600">Enter credentials securely. The system loads the latest regulatory corpus into vector memory.</p>
          </div>
          <div className="bg-slate-50 p-6">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4 shadow-lg">2</div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Upload & Ask</h3>
            <p className="text-slate-600">Upload datasheets, contracts, or ask complex cross-jurisdiction questions in plain English.</p>
          </div>
          <div className="bg-slate-50 p-6">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4 shadow-lg">3</div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Get Cited Reports</h3>
            <p className="text-slate-600">Receive risk-rated, fully cited determinations and export shareable PDF compliance reports.</p>
          </div>
        </div>
      </section>

      {/* Cost Value Banner */}
      <section className="bg-slate-900 text-white py-12 text-center px-4">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">Save ₹1–5 lakh per compliance engagement.</h2>
        <p className="text-slate-400 max-w-2xl mx-auto">Stop paying hourly legal fees for basic classification and clause drafting. SemiShield does it instantly, securely, and accurately.</p>
      </section>

      {/* Roadmap */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">Global Expansion Roadmap</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
            <div>
              <h4 className="font-bold text-green-900">NOW: MVP Active</h4>
              <p className="text-green-800 text-sm">🇮🇳 India SCOMET + 🇺🇸 US EAR/BIS</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-lg opacity-75">
            <div className="h-6 w-6 rounded-full border-2 border-indigo-500 flex-shrink-0"></div>
            <div>
              <h4 className="font-bold text-slate-900">V2 (2026)</h4>
              <p className="text-slate-600 text-sm">🇪🇺 EU Dual-Use + 🇸🇬 Singapore SGCA</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-lg opacity-50">
            <div className="h-6 w-6 rounded-full border-2 border-slate-300 flex-shrink-0"></div>
            <div>
              <h4 className="font-bold text-slate-900">V3 (2027)</h4>
              <p className="text-slate-600 text-sm">🇯🇵 Japan FEFTA + 🇰🇷 South Korea STA</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
