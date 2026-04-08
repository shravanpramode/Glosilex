import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Link as LinkIcon, Printer, MessageSquare, ShieldAlert, CheckCircle, AlertTriangle, ArrowLeft, FileSignature } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NormalizedReport, loadReportByToken, saveReport, synthesizeReport } from '../lib/reportService';
import { cleanContent } from '../utils/contentCleaner';
import { RiskBadge } from '../components/RiskBadge';
import { ProductSummaryCard } from '../components/ProductSummaryCard';
import { DualJurisdictionAlert } from '../components/DualJurisdictionAlert';
import { CitationsAccordion } from '../components/CitationsAccordion';
import { parseCitations } from '../utils/citations';
import { ICP_COMPONENT_GROUPS, CRITICALITY_CONFIG, matchGroupDocs, STATIC_DOC_FLOW } from '../lib/icpDocGroups';
import { Info, GitBranch } from 'lucide-react';

export const Report: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [reportData, setReportData] = useState<NormalizedReport | null>(
    location.state?.reportData ?? null
  );

  const [isLoading, setIsLoading] = useState(true);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const hasSynthesized = useRef(false);

  // Guard: if no reportData and not loading from token, redirect back
  if (!reportData && !token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-glosilex-light-bg)] p-8 text-center">
        <FileSignature className="w-12 h-12 text-[var(--color-glosilex-light-muted)] mb-4" />
        <h2 className="text-lg font-heading font-bold text-[var(--color-glosilex-light-text)] mb-2">No Report Data Found</h2>
        <p className="text-[var(--color-glosilex-light-body)] mb-6 max-w-sm">
          This page requires a completed analysis. Please return to the relevant module.
        </p>
        <button
          onClick={() => navigate('/')}
          className="bg-[var(--color-glosilex-teal)] text-[var(--color-glosilex-light-bg)] font-medium py-2.5 px-6 rounded-lg hover:bg-[var(--color-glosilex-teal-dim)] transition-colors min-h-[44px] flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>
      </div>
    );
  }

  useEffect(() => {
    window.scrollTo(0, 0);
    const loadData = async () => {
      setIsLoading(true);
      if (token) {
        const data = await loadReportByToken(token);
        if (data) {
          setReportData(data);
          setShareToken(token);
        }
      } else if (location.state?.reportData) {
        const data = location.state.reportData as NormalizedReport;

        if (!hasSynthesized.current &&
            (!data.summary || data.summary.includes('completed.'))) {
          hasSynthesized.current = true;
          try {
            const synthesized = await synthesizeReport(data);
            setReportData({ ...data, summary: synthesized });
            setIsLoading(false);
            return;
          } catch (e) {
            console.error('Failed to synthesize report summary', e);
          }
        }
        setReportData(data);
      }
      setIsLoading(false);
    };

    loadData();
  }, [token, location.state]);

  const fromModule = location.state?.fromModule;

  const handleBack = () => {
    if (fromModule === 'Classify') navigate('/classify');
    else if (fromModule === 'ICP Review') navigate('/icp');
    else if (fromModule === 'Contract Intelligence') navigate('/contracts');
    else navigate(-1);
  };

  const handleDownloadPdf = () => {
    const originalTitle = document.title;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    document.title = `glosilex-report-${timestamp}`;
    try {
      window.print();
    } catch (error) {
      console.error('Failed to trigger print for PDF:', error);
      alert("Failed to trigger print. Please use your browser's print function (Ctrl+P or Cmd+P).");
    } finally {
      document.title = originalTitle;
    }
  };

  const handleCopyShareLink = async () => {
    if (!reportData) return;
    try {
      let currentToken = shareToken;
      if (!currentToken) {
        const result = await saveReport(reportData, reportData.summary);
        currentToken = result.shareToken;
        setShareToken(currentToken);
      }
      const url = `${window.location.origin}/report?token=${currentToken}`;
      await navigator.clipboard.writeText(url);
      alert('Share link copied to clipboard!');
    } catch (error) {
      console.error('Failed to generate share link:', error);
      alert('Failed to generate share link. Please try again.');
    }
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch (error) {
      console.error('Failed to open print dialog:', error);
      alert("Failed to open print dialog. Please use your browser's print function (Ctrl+P or Cmd+P).");
    }
  };

  const handleAskFollowUp = () => {
    if (!reportData) return;
    const initialQuery = `I have a follow-up question regarding the ${reportData.moduleType} report for ${reportData.companyName || 'my product'}.`;
    const hiddenContext = `PREVIOUS CLASSIFICATION CONTEXT —\nReport Type: ${reportData.moduleType}\nCompany/Product: ${reportData.companyName}\nOverall Risk: ${reportData.overallRisk}\n\nFull Report Data:\n${JSON.stringify(reportData, null, 2)}`;
    navigate('/ask', {
      state: {
        initialQuery,
        hiddenContext,
        fromModule: reportData.moduleType === 'classification' ? 'Classify' :
                    reportData.moduleType === 'icp' ? 'ICP Review' :
                    'Contract Intelligence',
        sourceView: 'report'
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-[var(--color-glosilex-light-bg)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-glosilex-teal)] mx-auto mb-4"></div>
          <p className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Loading report data...</p>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-[var(--color-glosilex-light-bg)]">
        <p className="text-[var(--color-glosilex-light-muted)] font-heading">Report not found.</p>
      </div>
    );
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'HIGH': return 'bg-red-500 text-white';
      case 'MEDIUM': return 'bg-amber-500 text-white';
      case 'LOW': return 'bg-emerald-500 text-white';
      default: return 'bg-[var(--color-glosilex-light-muted)] text-white';
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'HIGH': return 'bg-red-100 text-red-800 border-red-200';
      case 'MEDIUM': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'LOW': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default: return 'bg-[var(--color-glosilex-light-muted)]/10 text-[var(--color-glosilex-light-text)] border-[var(--color-glosilex-light-muted)]/20';
    }
  };

  const getDualJurisdictionPropsFromReport = (data: NormalizedReport) => {
    if (!data.dualJurisdiction) return null;

    if (data.moduleType === 'classification' && data.rawData) {
      const scomet = data.rawData.finalDetermination?.scomet;
      const ear = data.rawData.finalDetermination?.ear;
      if (!scomet || !ear) return null;
      const scometControlled = scomet.controlled === true;
      const earControlled = ear.controlled === true;
      if (!scometControlled && !earControlled) return null;
      if (scometControlled && earControlled) return { state: 'CONFIRMED' as const };
      return {
        state: 'POTENTIAL' as const,
        confirmedJurisdiction: scometControlled ? 'SCOMET' : 'EAR',
        pendingJurisdiction: scometControlled ? 'EAR' : 'SCOMET'
      };
    }

    if (data.moduleType === 'contract' && data.gapList) {
      const scometHasGap = data.gapList.some(
        g => (g.jurisdiction === 'SCOMET_INDIA' || g.jurisdiction === 'Both') && g.status !== 'ADEQUATE'
      );
      const earHasGap = data.gapList.some(
        g => (g.jurisdiction === 'EAR_US' || g.jurisdiction === 'Both') && g.status !== 'ADEQUATE'
      );
      if (!scometHasGap && !earHasGap) return null;
      if (scometHasGap && earHasGap) return {
        state: 'CONFIRMED' as const,
        message: '⚠️ Dual Jurisdiction Risk — Export control clause gaps identified under both SCOMET and EAR frameworks.'
      };
      return {
        state: 'POTENTIAL' as const,
        confirmedJurisdiction: scometHasGap ? 'SCOMET' : 'EAR',
        pendingJurisdiction: scometHasGap ? 'EAR' : 'SCOMET'
      };
    }

    if (data.moduleType === 'icp' && data.rawData) {
      const ss = data.rawData.scometScore as number;
      const es = data.rawData.earScore as number;
      if (ss >= 80 && es >= 80) return null;
      if (ss < 80 && es < 80) return {
        state: 'CONFIRMED' as const,
        message: '⚠️ Dual Jurisdiction Gaps — Compliance gaps identified under both SCOMET and EAR frameworks. Remediation required for both.'
      };
      return {
        state: 'POTENTIAL' as const,
        confirmedJurisdiction: ss < 80 ? 'SCOMET' : 'EAR',
        pendingJurisdiction: ss < 80 ? 'EAR' : 'SCOMET'
      };
    }

    return null;
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[var(--color-glosilex-light-bg)] pb-12">

      {/* Action Bar — fluid width, hidden on print */}
      <div className="bg-[var(--color-glosilex-light-surface)] border-b border-[var(--color-glosilex-light-muted)]/20 sticky top-16 z-50 shadow-sm no-print pointer-events-auto">
        <div className="w-full px-4 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-sm font-heading font-medium text-[var(--color-glosilex-light-muted)] hover:text-[var(--color-glosilex-teal)] transition-colors group min-h-[44px] pointer-events-auto"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              {fromModule ? `Back to ${fromModule} Results` : 'Back'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-2 px-4 py-2 text-sm font-heading font-medium text-[var(--color-glosilex-light-text)] bg-[var(--color-glosilex-light-surface)] border border-[var(--color-glosilex-light-muted)]/20 rounded-lg hover:bg-[var(--color-glosilex-light-bg)] transition-colors min-h-[44px] pointer-events-auto"
            >
              <Download className="w-4 h-4" /> Download PDF
            </button>
            <button
              onClick={handleCopyShareLink}
              title="Recipients must have a GloSilex account to view this report."
              className="flex items-center gap-2 px-4 py-2 text-sm font-heading font-medium text-[var(--color-glosilex-light-text)] bg-[var(--color-glosilex-light-surface)] border border-[var(--color-glosilex-light-muted)]/20 rounded-lg hover:bg-[var(--color-glosilex-light-bg)] transition-colors min-h-[44px] pointer-events-auto"
            >
              <LinkIcon className="w-4 h-4" /> Copy Link
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-sm font-heading font-medium text-[var(--color-glosilex-light-text)] bg-[var(--color-glosilex-light-surface)] border border-[var(--color-glosilex-light-muted)]/20 rounded-lg hover:bg-[var(--color-glosilex-light-bg)] transition-colors min-h-[44px] pointer-events-auto"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button
              onClick={handleAskFollowUp}
              className="flex items-center gap-2 px-4 py-2 text-sm font-heading font-medium text-[var(--color-glosilex-light-bg)] bg-[var(--color-glosilex-teal)] rounded-lg hover:bg-[var(--color-glosilex-teal-dim)] transition-colors min-h-[44px] pointer-events-auto"
            >
              <MessageSquare className="w-4 h-4" /> Ask Follow-up
            </button>
          </div>
        </div>
      </div>

      {/* Report Content — fluid width */}
      <div className="w-full px-4 sm:px-8 lg:px-12 mt-8 print:mt-0 print:px-0">
        <div ref={reportRef} id="report-content" className="bg-[var(--color-glosilex-light-surface)] rounded-xl shadow-sm border border-[var(--color-glosilex-light-muted)]/20 p-8 sm:p-12 print:shadow-none print:border-none print:p-0 print:w-full">

          {/* Section 1: Header */}
          <div className="border-b border-[var(--color-glosilex-light-muted)]/20 pb-8 mb-8 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-8 h-8 text-[var(--color-glosilex-teal)]" />
                <h1 className="text-3xl font-heading font-bold text-[var(--color-glosilex-light-text)] tracking-tight">GloSilex</h1>
              </div>
              <h2 className="text-xl font-heading font-medium text-[var(--color-glosilex-light-muted)]">Compliance Report</h2>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-heading font-medium bg-[var(--color-glosilex-teal-dim)]/10 text-[var(--color-glosilex-teal)] mb-3">
                {reportData.moduleType.toUpperCase()} MODULE
              </span>
              <p className="text-sm text-[var(--color-glosilex-light-muted)] font-heading">Date: {new Date().toLocaleDateString()}</p>
              {reportData.companyName && (
                <p className="text-sm font-heading font-medium text-[var(--color-glosilex-light-text)] mt-1">Subject: {reportData.companyName}</p>
              )}
            </div>
          </div>

          {/* Section 2: Summary Card — Contract Summary OR Product Summary */}
          {reportData.moduleType === 'contract' ? (
            <div className="bg-[var(--color-glosilex-light-bg)] rounded-xl border border-[var(--color-glosilex-light-muted)]/20 p-6 mb-8">
              <h3 className="text-sm font-heading font-bold text-[var(--color-glosilex-light-text)] uppercase tracking-wider mb-4 flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-[var(--color-glosilex-teal)]" />
                Contract Summary
              </h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                {reportData.contractSummary?.poReference && (
                  <>
                    <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">PO Reference</span>
                    <span className="text-[var(--color-glosilex-light-text)] font-heading font-semibold">{reportData.contractSummary.poReference}</span>
                  </>
                )}
                {reportData.contractSummary?.contractDate && (
                  <>
                    <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Contract Date</span>
                    <span className="text-[var(--color-glosilex-light-text)] font-heading">{reportData.contractSummary.contractDate}</span>
                  </>
                )}
                {reportData.contractSummary?.sellerName && (
                  <>
                    <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Seller</span>
                    <span className="text-[var(--color-glosilex-light-text)] font-heading">{reportData.contractSummary.sellerName}</span>
                  </>
                )}
                {reportData.contractSummary?.buyerName && (
                  <>
                    <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Buyer</span>
                    <span className="text-[var(--color-glosilex-light-text)] font-heading">{reportData.contractSummary.buyerName}</span>
                  </>
                )}
                {reportData.contractSummary?.buyerCountry && (
                  <>
                    <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Destination Country</span>
                    <span className="text-[var(--color-glosilex-light-text)] font-heading">{reportData.contractSummary.buyerCountry}</span>
                  </>
                )}
                {reportData.contractSummary?.products && reportData.contractSummary.products.length > 0 && (
                  <>
                    <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Products Covered</span>
                    <span className="text-[var(--color-glosilex-light-text)] font-heading">
                      {reportData.contractSummary.products.map((p, i) => (
                        <span key={i} className="block">{p.description}{p.quantity ? ` — ${p.quantity}` : ''}</span>
                      ))}
                    </span>
                  </>
                )}
                {reportData.contractSummary?.totalOrderValue && (
                  <>
                    <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Total Order Value</span>
                    <span className="text-[var(--color-glosilex-light-text)] font-heading font-semibold">{reportData.contractSummary.totalOrderValue}</span>
                  </>
                )}
                {reportData.contractSummary?.deliveryTerms && (
                  <>
                    <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Delivery Terms</span>
                    <span className="text-[var(--color-glosilex-light-text)] font-heading">{reportData.contractSummary.deliveryTerms}</span>
                  </>
                )}
                {reportData.contractSummary?.governingLaw && (
                  <>
                    <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Governing Law</span>
                    <span className="text-[var(--color-glosilex-light-text)] font-heading">{reportData.contractSummary.governingLaw}</span>
                  </>
                )}
                <>
                  <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Jurisdictions Assessed</span>
                  <span className="text-[var(--color-glosilex-light-text)] font-heading">
                    {reportData.jurisdictionDisplay ?? reportData.jurisdictions?.join(', ')}
                  </span>
                </>
                <>
                  <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Clauses Assessed</span>
                  <span className="text-[var(--color-glosilex-light-text)] font-heading">{reportData.clausesAssessed ?? 0}</span>
                </>
                <>
                  <span className="text-[var(--color-glosilex-light-muted)] font-heading font-medium">Risk Score</span>
                  <span className="text-[var(--color-glosilex-light-text)] font-heading font-semibold">{reportData.riskScore}/100</span>
                </>
              </div>
            </div>
          ) : (
            <ProductSummaryCard data={reportData.extractedSpecs} />
          )}

          {/* Section 2b: Executive Summary (Risk + AI Narrative) */}
          <div className="mb-10">
            <h3 className="text-lg font-heading font-bold text-[var(--color-glosilex-light-text)] mb-4 border-b border-[var(--color-glosilex-light-muted)]/10 pb-2">Executive Summary</h3>
            <div className={`rounded-xl border p-6 mb-6 flex flex-col gap-4 ${getRiskBadge(reportData.overallRisk)}`} style={{ WebkitPrintColorAdjust: 'exact' }}>
              <div className="flex items-start gap-6">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center font-heading font-bold text-xl flex-shrink-0 shadow-sm ${getRiskColor(reportData.overallRisk)}`}
                  style={{ WebkitPrintColorAdjust: 'exact' }}
                >
                  {reportData.riskScore !== undefined ? reportData.riskScore : (
                    reportData.overallRisk === 'HIGH' ? '!' :
                    reportData.overallRisk === 'MEDIUM' ? '~' : '✓'
                  )}
                </div>
                <div>
                  <h4 className="text-lg font-heading font-bold mb-1 flex items-center gap-2">
                    {reportData.overallRisk === 'HIGH' && <AlertTriangle className="w-5 h-5" />}
                    {reportData.overallRisk === 'LOW' && <CheckCircle className="w-5 h-5" />}
                    OVERALL RISK: {reportData.overallRisk}
                  </h4>
                </div>
              </div>
              <div className="prose prose-sm max-w-none text-[var(--color-glosilex-light-body)] whitespace-pre-wrap">
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent(reportData.summary)}</ReactMarkdown>
                </div>
              </div>
            </div>
            {getDualJurisdictionPropsFromReport(reportData) && (
              <div className="pt-4 border-t border-[var(--color-glosilex-light-muted)]/20">
                <DualJurisdictionAlert {...getDualJurisdictionPropsFromReport(reportData)!} />
              </div>
            )}
          </div>

          {/* Section 2.5: Risk Factor Summary Table */}
          <div className="mb-10">
            <h3 className="text-xs font-heading font-bold text-[var(--color-glosilex-light-text)] mb-4 border-b border-[var(--color-glosilex-light-muted)]/10 pb-2 uppercase tracking-wider">Risk Factor Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse border border-[var(--color-glosilex-light-muted)]/20 rounded-lg overflow-hidden shadow-sm">
                <thead>
                  <tr className="bg-[var(--color-glosilex-light-bg)] border-b border-[var(--color-glosilex-light-muted)]/20">
                    <th className="py-3 px-4 font-heading font-bold text-[var(--color-glosilex-light-text)] uppercase tracking-wider text-[10px] w-1/3 border-r border-[var(--color-glosilex-light-muted)]/20">Factor</th>
                    <th className="py-3 px-4 font-heading font-bold text-[var(--color-glosilex-light-text)] uppercase tracking-wider text-[10px]">Assessment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-glosilex-light-muted)]/10">
                  <tr>
                    <td className="py-3 px-4 font-heading font-semibold text-[var(--color-glosilex-light-muted)] uppercase tracking-wider text-[10px] w-1/3 border-r border-[var(--color-glosilex-light-muted)]/20">Risk Rating</td>
                    <td className="py-3 px-4"><RiskBadge level={reportData.overallRisk} /></td>
                  </tr>
                  {reportData.moduleType === 'classification' && reportData.rawData && (
                    <>
                      <tr>
                        <td className="py-3 px-4 font-heading font-semibold text-[var(--color-glosilex-light-muted)] uppercase tracking-wider text-[10px] border-r border-[var(--color-glosilex-light-muted)]/20">Confidence Score</td>
                        <td className="py-3 px-4 font-heading font-bold text-[var(--color-glosilex-light-text)]">
                          {reportData.rawData.finalDetermination?.scomet?.confidence ?? reportData.rawData.finalDetermination?.ear?.confidence ?? 'N/A'}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-heading font-semibold text-[var(--color-glosilex-light-muted)] uppercase tracking-wider text-[10px] border-r border-[var(--color-glosilex-light-muted)]/20">SCOMET Classification</td>
                        <td className="py-3 px-4 font-heading font-bold text-[var(--color-glosilex-light-text)]">
                          {(() => {
                            const scomet = reportData.rawData.finalDetermination?.scomet;
                            if (!scomet) return reportData.jurisdictions.includes('SCOMET_INDIA') ? 'Not Controlled' : 'Not Applicable';
                            if (scomet.controlled === true) return `${scomet.category} — Controlled`;
                            if (!reportData.jurisdictions.includes('SCOMET_INDIA')) return 'Not Applicable';
                            const cat = (scomet.category ?? '').toLowerCase();
                            if (cat.includes('pending') || cat.includes('determination')) return 'Determination Pending';
                            return 'Not Controlled';
                          })()}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-heading font-semibold text-[var(--color-glosilex-light-muted)] uppercase tracking-wider text-[10px] border-r border-[var(--color-glosilex-light-muted)]/20">US EAR Classification</td>
                        <td className="py-3 px-4 font-heading font-bold text-[var(--color-glosilex-light-text)]">
                          {reportData.rawData.finalDetermination?.ear?.eccn ?? 'EAR99'}
                        </td>
                      </tr>
                    </>
                  )}
                  {reportData.moduleType === 'icp' && (
                    <>
                      <tr>
                        <td className="py-3 px-4 font-heading font-semibold text-[var(--color-glosilex-light-muted)] uppercase tracking-wider text-[10px] border-r border-[var(--color-glosilex-light-muted)]/20">Overall Score</td>
                        <td className="py-3 px-4 font-heading font-bold text-[var(--color-glosilex-light-text)]">{reportData.riskScore}</td>
                      </tr>
                      {reportData.findings.scomet && (
                        <tr>
                          <td className="py-3 px-4 font-heading font-semibold text-[var(--color-glosilex-light-muted)] uppercase tracking-wider text-[10px] border-r border-[var(--color-glosilex-light-muted)]/20">SCOMET Score</td>
                          <td className="py-3 px-4 font-heading font-bold text-[var(--color-glosilex-light-text)]">{reportData.findings.scomet.match(/\d+/)?.[0] ?? 'N/A'}</td>
                        </tr>
                      )}
                      {reportData.findings.ear && (
                        <tr>
                          <td className="py-3 px-4 font-heading font-semibold text-[var(--color-glosilex-light-muted)] uppercase tracking-wider text-[10px] border-r border-[var(--color-glosilex-light-muted)]/20">EAR Score</td>
                          <td className="py-3 px-4 font-heading font-bold text-[var(--color-glosilex-light-text)]">{reportData.findings.ear.match(/\d+/)?.[0] ?? 'N/A'}</td>
                        </tr>
                      )}
                    </>
                  )}
                  {reportData.moduleType === 'contract' && (
                    <>
                      <tr>
                        <td className="py-3 px-4 font-heading font-semibold text-[var(--color-glosilex-light-muted)] uppercase tracking-wider text-[10px] border-r border-[var(--color-glosilex-light-muted)]/20">Risk Score</td>
                        <td className="py-3 px-4 font-heading font-bold text-[var(--color-glosilex-light-text)]">{reportData.riskScore}/100</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-heading font-semibold text-[var(--color-glosilex-light-muted)] uppercase tracking-wider text-[10px] border-r border-[var(--color-glosilex-light-muted)]/20">Clauses Assessed</td>
                        <td className="py-3 px-4 font-heading font-bold text-[var(--color-glosilex-light-text)]">{reportData.clausesAssessed ?? reportData.gapList?.length ?? 0}</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-heading font-semibold text-[var(--color-glosilex-light-muted)] uppercase tracking-wider text-[10px] border-r border-[var(--color-glosilex-light-muted)]/20">Jurisdictions</td>
                        <td className="py-3 px-4 font-heading font-bold text-[var(--color-glosilex-light-text)]">
                          {(reportData.jurisdictionDisplay ?? reportData.jurisdictions?.join(', ') ?? 'N/A').replace(/_/g, ' ')}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-heading font-semibold text-[var(--color-glosilex-light-muted)] uppercase tracking-wider text-[10px] border-r border-[var(--color-glosilex-light-muted)]/20">AI Confidence</td>
                        <td className="py-3 px-4">
                          <div className="font-heading font-bold text-[var(--color-glosilex-light-text)]">
                            {reportData.confidenceScore ?? 'N/A'}{typeof reportData.confidenceScore === 'number' ? '%' : ''}
                          </div>
                          {reportData.confidenceNote && (
                            <div className="text-xs font-heading text-[var(--color-glosilex-light-muted)] mt-1">{reportData.confidenceNote}</div>
                          )}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Jurisdiction Coverage */}
          <div className="mb-10">
            <h3 className="text-lg font-heading font-bold text-[var(--color-glosilex-light-text)] mb-4 border-b border-[var(--color-glosilex-light-muted)]/10 pb-2">Jurisdiction Coverage</h3>
            <div className="flex flex-wrap gap-3 mb-4">
              {reportData.jurisdictions.map(j => (
                <span key={j} className="px-3 py-1.5 bg-[var(--color-glosilex-light-bg)] border border-[var(--color-glosilex-light-muted)]/30 rounded-lg text-sm font-heading font-bold text-[var(--color-glosilex-light-text)]" style={{ WebkitPrintColorAdjust: 'exact' }}>
                  {j.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {reportData.findings.scomet && (
                <div className="bg-[var(--color-glosilex-light-bg)] p-4 rounded-lg border border-[var(--color-glosilex-light-muted)]/20">
                  <h4 className="font-heading font-bold text-[var(--color-glosilex-light-text)] mb-2 text-sm">India SCOMET</h4>
                  <div className="markdown-body text-sm text-[var(--color-glosilex-light-body)] whitespace-pre-wrap">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent(reportData.findings.scomet)}</ReactMarkdown>
                  </div>
                </div>
              )}
              {reportData.findings.ear && (
                <div className="bg-[var(--color-glosilex-light-bg)] p-4 rounded-lg border border-[var(--color-glosilex-light-muted)]/20">
                  <h4 className="font-heading font-bold text-[var(--color-glosilex-light-text)] mb-2 text-sm">US EAR / BIS</h4>
                  <div className="markdown-body text-sm text-[var(--color-glosilex-light-body)] whitespace-pre-wrap">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent(reportData.findings.ear)}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
            {reportData.moduleType !== 'contract' && reportData.findings.crossJurisdiction && reportData.findings.crossJurisdiction !== 'N/A' && (
              <div className="mt-4 bg-[var(--color-glosilex-teal-dim)]/10 p-4 rounded-lg border border-[var(--color-glosilex-teal-dim)]/20">
                <h4 className="font-heading font-bold text-[var(--color-glosilex-teal)] mb-2 text-sm">Cross-Jurisdiction Analysis</h4>
                <p className="text-sm font-heading text-[var(--color-glosilex-light-body)] mb-4">Based on the provided SCOMET and EAR classification results, here is a cross-jurisdiction analysis.</p>
                {getDualJurisdictionPropsFromReport(reportData) && (
                  <div className="mb-4">
                    <DualJurisdictionAlert {...getDualJurisdictionPropsFromReport(reportData)!} />
                  </div>
                )}
                <div className="markdown-body text-sm text-[var(--color-glosilex-light-body)] whitespace-pre-wrap">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent(reportData.findings.crossJurisdiction)}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Detailed Findings & Gaps */}
          {reportData.gapList && reportData.gapList.length > 0 && (
            <div className="mb-10 print:break-before-auto">
              <h3 className="text-lg font-heading font-bold text-[var(--color-glosilex-light-text)] mb-4 border-b border-[var(--color-glosilex-light-muted)]/10 pb-2">Detailed Findings &amp; Gaps</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs font-heading text-[var(--color-glosilex-light-muted)] uppercase bg-[var(--color-glosilex-light-bg)] border-y border-[var(--color-glosilex-light-muted)]/20">
                    <tr>
                      <th className="px-4 py-3 font-heading font-semibold">Item / Category</th>
                      <th className="px-4 py-3 font-heading font-semibold">Status</th>
                      <th className="px-4 py-3 font-heading font-semibold">Priority</th>
                      <th className="px-4 py-3 font-heading font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-glosilex-light-muted)]/10">
                    {reportData.gapList.map((gap, idx) => (
                      <tr key={idx} className="bg-[var(--color-glosilex-light-surface)]">
                        <td className="px-4 py-3 font-heading font-medium text-[var(--color-glosilex-light-text)] w-1/4 align-top">{gap.item}</td>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`inline-flex px-2 py-1 rounded text-xs font-heading font-bold ${
                              gap.status === 'Present' || gap.status === 'ADEQUATE' ? 'bg-emerald-100 text-emerald-800' :
                              gap.status === 'Partial' || gap.status === 'WEAK' ? 'bg-amber-100 text-amber-800' :
                              'bg-red-100 text-red-800'
                            }`}
                            style={{ WebkitPrintColorAdjust: 'exact' }}
                          >
                            {gap.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`inline-flex px-2 py-1 rounded text-xs font-heading font-bold ${
                              gap.priority === 'P1' ? 'bg-red-100 text-red-800' :
                              gap.priority === 'P2' ? 'bg-amber-100 text-amber-800' :
                              'bg-[var(--color-glosilex-teal-dim)]/20 text-[var(--color-glosilex-teal)]'
                            }`}
                            style={{ WebkitPrintColorAdjust: 'exact' }}
                          >
                            {gap.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--color-glosilex-light-body)] align-top">
                          <div className="markdown-body text-sm">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent(gap.description)}</ReactMarkdown>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 5: Entity Screening */}
          {reportData.entityScreening && reportData.entityScreening.length > 0 && (
            <div className="mb-10">
              <h3 className="text-lg font-heading font-bold text-[var(--color-glosilex-light-text)] mb-4 border-b border-[var(--color-glosilex-light-muted)]/10 pb-2">Entity Screening</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs font-heading text-[var(--color-glosilex-light-muted)] uppercase bg-[var(--color-glosilex-light-bg)] border-y border-[var(--color-glosilex-light-muted)]/20">
                    <tr>
                      <th className="px-4 py-3 font-heading font-semibold">Entity</th>
                      <th className="px-4 py-3 font-heading font-semibold">Status</th>
                      <th className="px-4 py-3 font-heading font-semibold">List Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-glosilex-light-muted)]/10">
                    {reportData.entityScreening.map((entity, idx) => (
                      <tr key={idx} className="bg-[var(--color-glosilex-light-surface)]">
                        <td className="px-4 py-3 font-heading font-medium text-[var(--color-glosilex-light-text)]">{entity.entity}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-1 rounded text-xs font-heading font-bold ${
                              entity.status === 'CLEAR' ? 'bg-emerald-100 text-emerald-800' :
                              entity.status === 'MATCH' ? 'bg-red-100 text-red-800' :
                              'bg-amber-100 text-amber-800'
                            }`}
                            style={{ WebkitPrintColorAdjust: 'exact' }}
                          >
                            {entity.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-heading text-[var(--color-glosilex-light-body)]">{entity.listMatch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 6: Action Plan — Classification module ONLY */}
          {reportData.moduleType === 'classification' && reportData.actionPlan && reportData.actionPlan.length > 0 && (
            <div className="mb-10">
              <h3 className="text-lg font-heading font-bold text-[var(--color-glosilex-light-text)] mb-4 border-b border-[var(--color-glosilex-light-muted)]/10 pb-2">Recommended Action Plan</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs font-heading text-[var(--color-glosilex-light-muted)] uppercase bg-[var(--color-glosilex-light-bg)] border-y border-[var(--color-glosilex-light-muted)]/20">
                    <tr>
                      <th className="px-4 py-3 font-heading font-semibold w-12">#</th>
                      <th className="px-4 py-3 font-heading font-semibold">Action</th>
                      <th className="px-4 py-3 font-heading font-semibold">Jurisdiction</th>
                      <th className="px-4 py-3 font-heading font-semibold">Timeline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-glosilex-light-muted)]/10">
                    {reportData.actionPlan.map((action, idx) => (
                      <tr key={idx} className="bg-[var(--color-glosilex-light-surface)]">
                        <td className="px-4 py-3 font-heading font-medium text-[var(--color-glosilex-light-muted)]">{idx + 1}</td>
                        <td className="px-4 py-3 font-heading font-medium text-[var(--color-glosilex-light-text)]">{cleanContent(action.action)}</td>
                        <td className="px-4 py-3 font-heading text-[var(--color-glosilex-light-body)]">{action.jurisdiction}</td>
                        <td className="px-4 py-3 font-heading text-[var(--color-glosilex-light-body)]">{action.timeline}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 6.5: Documentation Flow — ICP MODULE ONLY */}
          {reportData.moduleType === 'icp' && (() => {
            const docFlowToUse = reportData.docFlow ?? STATIC_DOC_FLOW;
            return (
              <div className="mb-10">
                <h3 className="text-lg font-heading font-bold text-[var(--color-glosilex-light-text)] mb-1 border-b border-[var(--color-glosilex-light-muted)]/10 pb-2">
                  Recommended Documentation Flow
                </h3>
                <p className="text-xs font-heading text-[var(--color-glosilex-light-muted)] mb-4">
                  {docFlowToUse.length} documents · Grounded in BIS EMCP Guidelines · EAR 15 CFR 730–774 · DGFT HBP 2023 Chapter 10 SCOMET
                </p>
                <div className="flex items-start gap-2 bg-[var(--color-glosilex-teal-dim)]/10 border border-[var(--color-glosilex-teal-dim)]/20 rounded-lg px-4 py-2.5 text-xs text-[var(--color-glosilex-teal)] mb-4">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span className="font-heading">
                    All documents are <strong>mandatory</strong> for full export authorization eligibility under both jurisdictions.
                    Derived from <strong>BIS EMCP Guidelines</strong> and <strong>DGFT ICP Standards HBP 2023 Chapter 10</strong>.
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  {(['Foundational', 'Operational', 'Governance'] as const).map(level => (
                    <span key={level} className="flex items-center gap-1.5 text-[10px] font-heading text-[var(--color-glosilex-light-muted)] bg-[var(--color-glosilex-light-bg)] border border-[var(--color-glosilex-light-muted)]/20 rounded-full px-2.5 py-1">
                      <div className={`w-2 h-2 rounded-full ${CRITICALITY_CONFIG[level].dot}`} />
                      {level}
                    </span>
                  ))}
                </div>
                <div className="space-y-3">
                  {ICP_COMPONENT_GROUPS.map((group, groupIdx) => {
                    const groupDocs = matchGroupDocs(group, docFlowToUse);
                    if (groupDocs.length === 0) return null;
                    const cfg = CRITICALITY_CONFIG[group.criticality];
                    return (
                      <div key={groupIdx} className="border border-[var(--color-glosilex-light-muted)]/20 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between bg-[var(--color-glosilex-light-bg)] px-4 py-2.5 border-b border-[var(--color-glosilex-light-muted)]/20">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                            <span className="text-xs font-heading font-semibold text-[var(--color-glosilex-light-text)]">{group.component}</span>
                            <span className={`text-[10px] font-heading font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                              {group.criticality}
                            </span>
                            <span className="text-[10px] font-heading text-[var(--color-glosilex-light-muted)] font-mono hidden sm:inline">{group.bisRef}</span>
                          </div>
                          <span className="text-[10px] font-heading text-[var(--color-glosilex-light-muted)] flex-shrink-0">
                            {groupDocs.length} doc{groupDocs.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className={`p-3 ${groupDocs.length > 1 ? 'grid grid-cols-1 md:grid-cols-2 gap-2' : ''}`}>
                          {groupDocs.map((step, docIdx) => (
                            <div key={docIdx} className="flex items-center gap-3 bg-[var(--color-glosilex-light-surface)] border border-[var(--color-glosilex-light-muted)]/20 rounded-lg p-3">
                              <div className="flex-shrink-0 w-6 h-6 bg-[var(--color-glosilex-teal-dim)]/10 text-[var(--color-glosilex-teal)] font-heading font-bold text-xs rounded-full flex items-center justify-center border border-[var(--color-glosilex-teal-dim)]/20">
                                {step.stepNumber}
                              </div>
                              <div className="flex-grow min-w-0">
                                <p className="text-sm font-heading font-medium text-[var(--color-glosilex-light-text)] truncate">{step.label}</p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-heading font-medium ${
                                      step.type === 'Policy' ? 'bg-purple-100 text-purple-700' :
                                      step.type === 'Procedure' ? 'bg-[var(--color-glosilex-teal-dim)]/20 text-[var(--color-glosilex-teal)]' :
                                      step.type === 'Record' ? 'bg-emerald-100 text-emerald-700' :
                                      'bg-amber-100 text-amber-700'
                                    }`}
                                    style={{ WebkitPrintColorAdjust: 'exact' }}
                                  >
                                    {step.type}
                                  </span>
                                  {(step.jurisdictionTags as string[]).map(tag => (
                                    <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-heading font-medium bg-[var(--color-glosilex-light-bg)] text-[var(--color-glosilex-light-muted)] border border-[var(--color-glosilex-light-muted)]/20" style={{ WebkitPrintColorAdjust: 'exact' }}>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {group.dependencyNote && groupDocs.length > 1 && (
                          <div className="px-4 pb-2.5 flex items-center gap-1.5 text-[10px] font-heading text-[var(--color-glosilex-light-muted)]">
                            <GitBranch className="w-3 h-3 flex-shrink-0" />
                            <span>Document order matters · {group.dependencyNote}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Section 7: Citations */}
          {reportData.citations && reportData.citations.length > 0 && (
            <div className="mb-10">
              <h3 className="text-lg font-heading font-bold text-[var(--color-glosilex-light-text)] mb-4 border-b border-[var(--color-glosilex-light-muted)]/10 pb-2">Regulatory Citations</h3>
              {reportData.chunksUsed && reportData.chunksUsed.length > 0 ? (
                <CitationsAccordion chunks={reportData.chunksUsed} />
              ) : (
                <CitationsAccordion chunks={reportData.citations.flatMap(c => parseCitations(c))} />
              )}
            </div>
          )}

          {/* Section 8: Disclaimer */}
          <div className="mt-16 pt-8 border-t border-[var(--color-glosilex-light-muted)]/20 text-xs font-heading text-[var(--color-glosilex-light-muted)] text-center max-w-3xl mx-auto">
            <p className="mb-2 font-heading font-bold text-[var(--color-glosilex-light-text)]">LEGAL DISCLAIMER</p>
            <p>
              GloSilex is an AI-generated tool for informational purposes only. It does not constitute legal advice.
              Verify all compliance determinations with a qualified export control attorney before making shipping,
              licensing, or contractual decisions. The information provided in this report is based on automated
              analysis of provided documents and retrieved regulatory texts, which may be incomplete or out of date.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};