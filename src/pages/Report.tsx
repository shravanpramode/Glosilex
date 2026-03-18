import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Link as LinkIcon, Printer, MessageSquare, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { NormalizedReport, loadReportByToken, saveReport, synthesizeReport } from '../lib/reportService';

export const Report: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [reportData, setReportData] = useState<NormalizedReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const hasSynthesized = useRef(false);

  useEffect(() => {
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
        
        // If we just came from a module, we might need to synthesize the summary
        if (!hasSynthesized.current && 
             (!data.summary || data.summary.includes('completed.'))) {
           hasSynthesized.current = true;
           try {
             const synthesized = await synthesizeReport(data);
             data.summary = synthesized;
           } catch (e) {
             console.error("Failed to synthesize report summary", e);
           }
        }
        setReportData(data);
      }
      setIsLoading(false);
    };

    loadData();
  }, [token, location.state]);

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let position = 0;      
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      let remainingHeight = imgHeight - pdfHeight;

      while (remainingHeight > 0) {
        position -= pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        remainingHeight -= pdfHeight;
      }
      pdf.save(`semishield-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
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
    window.print();
  };

  const handleAskFollowUp = () => {
    if (!reportData) return;
    const initialQuery = `I have a follow-up question regarding the ${reportData.moduleType} report for ${reportData.companyName || 'my product'}. The overall risk was ${reportData.overallRisk}.`;
    navigate('/ask', { state: { initialQuery } });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading report data...</p>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-slate-50">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center max-w-md">
          <ShieldAlert className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">No Report Data</h2>
          <p className="text-slate-500 mb-6">Run a compliance module first to generate a report.</p>
          <button 
            onClick={() => navigate('/')}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors min-h-[44px]"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'HIGH': return 'bg-red-500 text-white';
      case 'MEDIUM': return 'bg-amber-500 text-white';
      case 'LOW': return 'bg-emerald-500 text-white';
      default: return 'bg-slate-500 text-white';
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'HIGH': return 'bg-red-100 text-red-800 border-red-200';
      case 'MEDIUM': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'LOW': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 pb-12">
      {/* Action Bar (Hidden on Print) */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50 print:hidden shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">Report Actions</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              <Download className="w-4 h-4" /> {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
            </button>
            <button 
              onClick={handleCopyShareLink}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors min-h-[44px]"
            >
              <LinkIcon className="w-4 h-4" /> Copy Share Link
            </button>
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors min-h-[44px]"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button 
              onClick={handleAskFollowUp}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors min-h-[44px]"
            >
              <MessageSquare className="w-4 h-4" /> Ask Follow-up
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div 
          ref={reportRef}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 sm:p-12 print:shadow-none print:border-none print:p-0"
        >
          {/* Section 1: Header */}
          <div className="border-b border-slate-200 pb-8 mb-8 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-8 h-8 text-indigo-600" />
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">SemiShield</h1>
              </div>
              <h2 className="text-xl font-medium text-slate-600">Compliance Report</h2>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800 mb-3">
                {reportData.moduleType.toUpperCase()} MODULE
              </span>
              <p className="text-sm text-slate-500">Date: {new Date().toLocaleDateString()}</p>
              {reportData.companyName && (
                <p className="text-sm font-medium text-slate-900 mt-1">Subject: {reportData.companyName}</p>
              )}
            </div>
          </div>

          {/* Section 2: Executive Summary */}
          <div className="mb-10">
            <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Executive Summary</h3>
            <div className={`rounded-xl border p-6 mb-6 flex items-start gap-6 ${getRiskBadge(reportData.overallRisk)}`} style={{ WebkitPrintColorAdjust: 'exact' }}>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0 shadow-sm ${getRiskColor(reportData.overallRisk)}`} style={{ WebkitPrintColorAdjust: 'exact' }}>
                {reportData.riskScore !== undefined ? reportData.riskScore : (
                  reportData.overallRisk === 'HIGH' ? '!' :
                  reportData.overallRisk === 'MEDIUM' ? '?' : '✓'
                )}
              </div>
              <div>
                <h4 className="text-lg font-bold mb-1 flex items-center gap-2">
                  {reportData.overallRisk === 'HIGH' && <AlertTriangle className="w-5 h-5" />}
                  {reportData.overallRisk === 'LOW' && <CheckCircle className="w-5 h-5" />}
                  OVERALL RISK: {reportData.overallRisk}
                </h4>
                <div className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap">
                  {reportData.summary}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Jurisdiction Coverage */}
          <div className="mb-10">
            <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Jurisdiction Coverage</h3>
            <div className="flex flex-wrap gap-3 mb-4">
              {reportData.jurisdictions.map(j => (
                <span key={j} className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-700" style={{ WebkitPrintColorAdjust: 'exact' }}>
                  {j.replace('_', ' ')}
                </span>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {reportData.findings.scomet && (
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h4 className="font-bold text-slate-900 mb-2 text-sm">India SCOMET</h4>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{reportData.findings.scomet}</p>
                </div>
              )}
              {reportData.findings.ear && (
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h4 className="font-bold text-slate-900 mb-2 text-sm">US EAR / BIS</h4>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{reportData.findings.ear}</p>
                </div>
              )}
            </div>
            {reportData.findings.crossJurisdiction && reportData.findings.crossJurisdiction !== 'N/A' && (
              <div className="mt-4 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                <h4 className="font-bold text-indigo-900 mb-2 text-sm">Cross-Jurisdiction Analysis</h4>
                <p className="text-sm text-indigo-800 whitespace-pre-wrap">{reportData.findings.crossJurisdiction}</p>
              </div>
            )}
          </div>

          {/* Section 3.5: Extracted Specifications */}
          {reportData.extractedSpecs && Object.keys(reportData.extractedSpecs).length > 0 && (
            <div className="mb-10">
              <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Extracted Specifications</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-6 rounded-xl border border-slate-200">
                {Object.entries(reportData.extractedSpecs).map(([key, value]) => (
                  <div key={key} className="border-b border-slate-200 pb-2">
                    <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className="text-sm text-slate-800">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Detailed Findings (Gaps) */}
          {reportData.gapList && reportData.gapList.length > 0 && (
            <div className="mb-10 print:break-before-auto">
              <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Detailed Findings & Gaps</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-y border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Item / Category</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Priority</th>
                      <th className="px-4 py-3 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.gapList.map((gap, idx) => (
                      <tr key={idx} className="bg-white">
                        <td className="px-4 py-3 font-medium text-slate-900 w-1/4 align-top">{gap.item}</td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex px-2 py-1 rounded text-xs font-bold ${
                            gap.status === 'Present' || gap.status === 'ADEQUATE' ? 'bg-emerald-100 text-emerald-800' :
                            gap.status === 'Partial' || gap.status === 'WEAK' ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800'
                          }`} style={{ WebkitPrintColorAdjust: 'exact' }}>
                            {gap.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex px-2 py-1 rounded text-xs font-bold ${
                            gap.priority === 'P1' ? 'bg-red-100 text-red-800' :
                            gap.priority === 'P2' ? 'bg-amber-100 text-amber-800' :
                            'bg-indigo-100 text-indigo-800'
                          }`} style={{ WebkitPrintColorAdjust: 'exact' }}>
                            {gap.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 align-top">{gap.description}</td>
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
              <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Entity Screening</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-y border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Entity</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">List Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.entityScreening.map((entity, idx) => (
                      <tr key={idx} className="bg-white">
                        <td className="px-4 py-3 font-medium text-slate-900">{entity.entity}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded text-xs font-bold ${
                            entity.status === 'CLEAR' ? 'bg-emerald-100 text-emerald-800' :
                            entity.status === 'MATCH' ? 'bg-red-100 text-red-800' :
                            'bg-amber-100 text-amber-800'
                          }`} style={{ WebkitPrintColorAdjust: 'exact' }}>
                            {entity.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{entity.listMatch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 6: Action Plan */}
          {reportData.actionPlan && reportData.actionPlan.length > 0 && (
            <div className="mb-10">
              <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Recommended Action Plan</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-y border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold w-12">#</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                      <th className="px-4 py-3 font-semibold">Jurisdiction</th>
                      <th className="px-4 py-3 font-semibold">Timeline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.actionPlan.map((action, idx) => (
                      <tr key={idx} className="bg-white">
                        <td className="px-4 py-3 font-medium text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-3 text-slate-900 font-medium">{action.action}</td>
                        <td className="px-4 py-3 text-slate-600">{action.jurisdiction}</td>
                        <td className="px-4 py-3 text-slate-600">{action.timeline}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 6.5: Documentation Flow */}
          {reportData.docFlow && reportData.docFlow.length > 0 && (
            <div className="mb-10">
              <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Recommended Documentation Flow</h3>
              <div className="max-w-3xl mx-auto">
                {reportData.docFlow.map((step, idx) => (
                  <div key={idx} className="relative">
                    <div className="flex items-center gap-4 bg-white border-2 border-slate-200 rounded-xl p-4 shadow-sm z-10 relative">
                      <div className="flex-shrink-0 w-10 h-10 bg-indigo-50 text-indigo-600 font-bold rounded-full flex items-center justify-center border border-indigo-100">
                        {step.stepNumber}
                      </div>
                      <div className="flex-grow">
                        <h4 className="text-base font-semibold text-slate-900">{step.label}</h4>
                        <div className="flex gap-2 mt-1.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            step.type === 'Policy' ? 'bg-purple-100 text-purple-800' :
                            step.type === 'Procedure' ? 'bg-indigo-100 text-indigo-800' :
                            step.type === 'Record' ? 'bg-emerald-100 text-emerald-800' :
                            'bg-amber-100 text-amber-800'
                          }`} style={{ WebkitPrintColorAdjust: 'exact' }}>
                            {step.type}
                          </span>
                          {step.jurisdictionTags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200" style={{ WebkitPrintColorAdjust: 'exact' }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {idx < reportData.docFlow.length - 1 && (
                      <div className="flex justify-center my-2">
                        <div className="w-0.5 h-6 bg-slate-300"></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 7: Citations */}
          {reportData.citations && reportData.citations.length > 0 && (
            <div className="mb-10">
              <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Regulatory Citations</h3>
              <ul className="list-decimal list-inside space-y-2 text-sm text-slate-600">
                {Array.from(new Set(reportData.citations)).map((citation, idx) => (
                  <li key={idx} className="pl-2">{citation}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Section 8: Disclaimer */}
          <div className="mt-16 pt-8 border-t border-slate-200 text-xs text-slate-400 text-center max-w-3xl mx-auto">
            <p className="mb-2 font-bold">⚠️ LEGAL DISCLAIMER</p>
            <p>
              SemiShield is an AI-generated tool for informational purposes only. It does not constitute legal advice. 
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
