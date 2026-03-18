import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Copy, FileSignature, ShieldAlert, CheckCircle } from 'lucide-react';
import { extractTextFromPdf } from '../utils/pdfParser';
import { runContractChain, ContractResult, ClauseAudit } from '../lib/contractService';
import { normalizeContractResult } from '../lib/reportService';
import { LoadingSteps } from '../components/LoadingSteps';
import { useNavigate } from 'react-router-dom';

const REVIEW_SCOPE_OPTIONS = [
  "Export Control Compliance",
  "End-Use / End-User Statements",
  "Re-Export Restrictions",
  "Licensing Delay / Force Majeure",
  "Audit / Compliance Cooperation Rights",
  "Regulatory Change / Update Mechanism"
];

export const Contracts: React.FC = () => {
  const [uploadedFileText, setUploadedFileText] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [reviewScope, setReviewScope] = useState<string[]>(REVIEW_SCOPE_OPTIONS);
  const [jurisdictions, setJurisdictions] = useState<string[]>(['SCOMET_INDIA', 'EAR_US']);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSteps, setLoadingSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<ContractResult | null>(null);
  const [selectedClause, setSelectedClause] = useState<ClauseAudit | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      try {
        setUploadedFileName(file.name);
        const text = await extractTextFromPdf(file);
        setUploadedFileText(text);
      } catch (error) {
        alert('Failed to parse PDF. Please try again.');
      }
    } else {
      alert('Please upload a PDF file.');
    }
  };

  const handleScopeToggle = (scope: string) => {
    setReviewScope(prev => 
      prev.includes(scope) 
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
    );
  };

  const handleJurisdictionToggle = (jurisdiction: string) => {
    setJurisdictions(prev => 
      prev.includes(jurisdiction) 
        ? prev.filter(j => j !== jurisdiction)
        : [...prev, jurisdiction]
    );
  };

  const handleReviewContract = async () => {
    if (!uploadedFileText) {
      alert('Please upload a contract document.');
      return;
    }
    if (reviewScope.length === 0) {
      alert('Please select at least one review scope category.');
      return;
    }
    if (jurisdictions.length === 0) {
      alert('Please select at least one jurisdiction.');
      return;
    }

    setIsLoading(true);
    setResult(null);
    setError(null);
    setSelectedClause(null);
    setLoadingSteps([
      'Extracting contract clauses...',
      'Retrieving regulatory requirements...',
      'Assessing clause adequacy...',
      'Identifying gaps and risks...',
      'Generating compliant clause language...'
    ]);
    setCurrentStep(0);

    try {
      const assessmentResult = await runContractChain(
        uploadedFileText,
        uploadedFileName || 'Uploaded Contract',
        reviewScope,
        jurisdictions,
        (step) => {
          if (step.includes('Extracting')) setCurrentStep(0);
          else if (step.includes('Retrieving')) setCurrentStep(1);
          else if (step.includes('Assessing')) setCurrentStep(2);
          else if (step.includes('Identifying')) setCurrentStep(3);
          else if (step.includes('Generating')) setCurrentStep(4);
        }
      );
      setResult(assessmentResult);
      
      // Select the first weak/missing clause by default if any exist
      const firstGap = assessmentResult.clauseAudit.find(c => c.status !== 'ADEQUATE');
      if (firstGap) {
        setSelectedClause(firstGap);
      }
    } catch (err) {
      console.error('Assessment failed:', err);
      setError('An error occurred during the assessment. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

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
      case 'HIGH': return 'bg-red-100 text-red-800';
      case 'MEDIUM': return 'bg-amber-100 text-amber-800';
      case 'LOW': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ADEQUATE': return 'bg-emerald-100 text-emerald-800';
      case 'WEAK': return 'bg-amber-100 text-amber-800';
      case 'MISSING': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ADEQUATE': return <CheckCircle2 className="w-4 h-4" />;
      case 'WEAK': return <AlertTriangle className="w-4 h-4" />;
      case 'MISSING': return <XCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  const handleDownloadReport = () => {
    if (!result) return;
    const reportData = normalizeContractResult(result, uploadedFileName || 'Contract');
    navigate('/report', { state: { reportData } });
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-64px)] overflow-hidden flex flex-col">
      <div className="mb-6 flex-shrink-0">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileSignature className="w-6 h-6 text-indigo-600" />
          Contract Intelligence
        </h1>
        <p className="text-slate-500 mt-1">Analyze contracts for export control compliance and generate missing clauses.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-grow overflow-hidden">
        
        {/* Left Panel: Upload & Scope (25%) */}
        <div className="w-full lg:w-1/4 flex flex-col gap-6 overflow-y-auto pr-2 pb-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-4">1. Upload Contract</h2>
            
            <div 
              className={`flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
                uploadedFileName ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 bg-slate-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="space-y-2 text-center">
                {uploadedFileName ? (
                  <FileText className="mx-auto h-8 w-8 text-indigo-600" />
                ) : (
                  <Upload className="mx-auto h-8 w-8 text-slate-400" />
                )}
                <div className="text-sm text-slate-600">
                  <span className="font-medium text-indigo-600 hover:text-indigo-500">
                    {uploadedFileName ? 'Change file' : 'Upload a file'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium truncate max-w-[200px] mx-auto">
                  {uploadedFileName || 'PDF up to 10MB'}
                </p>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="application/pdf"
              className="hidden"
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-3">2. Review Scope</h2>
            <div className="space-y-2">
              {REVIEW_SCOPE_OPTIONS.map((scope, idx) => (
                <label key={scope} htmlFor={`scope-${idx}`} className="flex items-start gap-2 cursor-pointer group min-h-[44px]">
                  <input
                    id={`scope-${idx}`}
                    type="checkbox"
                    checked={reviewScope.includes(scope)}
                    onChange={() => handleScopeToggle(scope)}
                    className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 h-5 w-5"
                  />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900 leading-tight mt-1">{scope}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-3">3. Jurisdictions</h2>
            <div className="space-y-2">
              <label htmlFor="contractScomet" className="flex items-center gap-2 cursor-pointer group min-h-[44px]">
                <input
                  id="contractScomet"
                  type="checkbox"
                  checked={jurisdictions.includes('SCOMET_INDIA')}
                  onChange={() => handleJurisdictionToggle('SCOMET_INDIA')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-5 w-5"
                />
                <span className="text-sm text-slate-700 group-hover:text-slate-900">India SCOMET</span>
              </label>
              <label htmlFor="contractEar" className="flex items-center gap-2 cursor-pointer group min-h-[44px]">
                <input
                  id="contractEar"
                  type="checkbox"
                  checked={jurisdictions.includes('EAR_US')}
                  onChange={() => handleJurisdictionToggle('EAR_US')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-5 w-5"
                />
                <span className="text-sm text-slate-700 group-hover:text-slate-900">US EAR / BIS</span>
              </label>
            </div>
          </div>

          <button
            onClick={handleReviewContract}
            disabled={isLoading || !uploadedFileText || reviewScope.length === 0 || jurisdictions.length === 0}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            Review Contract
          </button>

          {result && !isLoading && !error && (
            <button
              onClick={handleDownloadReport}
              className="w-full flex justify-center py-3 px-4 border border-slate-300 rounded-lg shadow-sm text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors min-h-[44px]"
            >
              Download Report
            </button>
          )}
        </div>

        {/* Center Panel: Risk Summary & Audit Table (45%) */}
        <div className="w-full lg:w-[45%] flex flex-col gap-6 overflow-hidden">
          {isLoading ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex-grow flex items-center justify-center">
              <LoadingSteps steps={loadingSteps} currentStepIndex={currentStep} />
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 flex-grow flex flex-col items-center justify-center text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">Assessment Failed</h3>
              <p className="text-slate-600 mb-6 max-w-sm">{error}</p>
              <button 
                onClick={handleReviewContract}
                className="bg-indigo-600 text-white font-medium py-2 px-6 rounded-lg hover:bg-indigo-700 transition-colors min-h-[44px]"
              >
                Retry Assessment
              </button>
            </div>
          ) : result ? (
            <>
              {/* Overall Risk Banner */}
              <div className={`rounded-xl shadow-sm border p-5 flex items-center justify-between flex-shrink-0 ${
                result.overallRisk === 'HIGH' ? 'bg-red-50 border-red-200' :
                result.overallRisk === 'MEDIUM' ? 'bg-amber-50 border-amber-200' :
                'bg-emerald-50 border-emerald-200'
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-sm ${getRiskColor(result.overallRisk)}`}>
                    {result.riskScore}
                  </div>
                  <div>
                    <h2 className={`text-lg font-bold flex items-center gap-2 ${
                      result.overallRisk === 'HIGH' ? 'text-red-900' :
                      result.overallRisk === 'MEDIUM' ? 'text-amber-900' :
                      'text-emerald-900'
                    }`}>
                      {result.overallRisk === 'HIGH' && <ShieldAlert className="w-5 h-5" />}
                      {result.overallRisk === 'MEDIUM' && <AlertTriangle className="w-5 h-5" />}
                      {result.overallRisk === 'LOW' && <CheckCircle className="w-5 h-5" />}
                      {result.overallRisk} RISK
                    </h2>
                    <p className={`text-sm font-medium ${
                      result.overallRisk === 'HIGH' ? 'text-red-700' :
                      result.overallRisk === 'MEDIUM' ? 'text-amber-700' :
                      'text-emerald-700'
                    }`}>
                      {result.summary}
                    </p>
                  </div>
                </div>
              </div>

              {/* Clause Audit Table */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-grow flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                  <h3 className="text-base font-semibold text-slate-900">Clause Audit</h3>
                </div>
                <div className="overflow-x-auto overflow-y-auto flex-grow">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-5 py-3">Category</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.clauseAudit.map((clause, idx) => (
                        <tr 
                          key={idx} 
                          className={`cursor-pointer transition-colors hover:bg-indigo-50 ${
                            selectedClause?.category === clause.category ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'
                          }`}
                          onClick={() => setSelectedClause(clause)}
                        >
                          <td className="px-5 py-4 font-medium text-slate-900">{clause.category}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${getStatusBadge(clause.status)}`}>
                              {getStatusIcon(clause.status)}
                              {clause.status}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${getRiskBadge(clause.riskLevel)}`}>
                              {clause.riskLevel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex-grow flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <FileSignature className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Contract Uploaded</h3>
              <p className="text-slate-500 max-w-md mb-6">
                Upload a contract PDF and select your review scope to generate a compliance audit and missing clause language.
              </p>
              
              <div className="text-left bg-slate-50 border border-slate-200 rounded-xl p-5 w-full max-w-md">
                <h4 className="text-sm font-bold text-slate-800 mb-3">The analyzer will check for:</h4>
                <ul className="text-sm text-slate-600 space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                    <span>End-use and end-user restrictions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                    <span>Re-export and transfer controls</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                    <span>Recordkeeping requirements</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                    <span>Audit rights and compliance certifications</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Generated Clause Language (30%) */}
        <div className="w-full lg:w-[30%] flex flex-col overflow-hidden">
          {result && !error ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-grow flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                <h3 className="text-base font-semibold text-slate-900">Clause Details</h3>
              </div>
              
              <div className="p-5 overflow-y-auto flex-grow">
                {selectedClause ? (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 mb-2">{selectedClause.category}</h4>
                      <div className="flex gap-2 mb-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${getStatusBadge(selectedClause.status)}`}>
                          {getStatusIcon(selectedClause.status)}
                          {selectedClause.status}
                        </span>
                        <span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          {selectedClause.jurisdiction}
                        </span>
                      </div>
                      
                      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mb-6">
                        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Risk Analysis</h5>
                        <p className="text-sm text-slate-700 leading-relaxed">{selectedClause.riskReason}</p>
                      </div>
                    </div>

                    {selectedClause.status !== 'ADEQUATE' && selectedClause.generatedClauseText ? (
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h5 className="text-sm font-bold text-indigo-900">Generated Compliant Clause</h5>
                          <button
                            onClick={() => copyToClipboard(selectedClause.generatedClauseText || '')}
                            className="text-slate-400 hover:text-indigo-600 transition-colors p-1 flex items-center justify-center gap-1 text-xs font-medium min-h-[44px] min-w-[44px] rounded-md"
                            aria-label="Copy generated clause"
                          >
                            <Copy className="w-3.5 h-3.5" /> Copy
                          </button>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-4 shadow-inner">
                          <pre className="text-sm text-emerald-400 font-mono whitespace-pre-wrap leading-relaxed">
                            {selectedClause.generatedClauseText}
                          </pre>
                        </div>
                        <div className="mt-3 text-xs text-slate-500 flex items-start gap-1.5 bg-slate-50 p-3 rounded border border-slate-100">
                          <span className="font-bold text-slate-700">Citation:</span> 
                          <span className="leading-relaxed">{selectedClause.citation}</span>
                        </div>
                      </div>
                    ) : selectedClause.status === 'ADEQUATE' ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                        <h5 className="text-emerald-900 font-bold mb-1">Clause is Adequate</h5>
                        <p className="text-emerald-700 text-sm">This section meets regulatory requirements. No additional language is needed.</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6">
                    <p>Select a clause from the audit table to view details and generated language.</p>
                  </div>
                )}
              </div>
              
              <div className="mt-auto p-4 border-t border-slate-200 bg-slate-50">
                <p className="text-[10px] text-slate-500 text-center">
                  ⚠️ LEGAL DISCLAIMER: SemiShield is an AI-generated tool for informational purposes only. It does not constitute legal advice. Verify all compliance determinations with a qualified export control attorney before making shipping, licensing, or contractual decisions.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl border border-slate-200 border-dashed flex-grow flex items-center justify-center text-slate-400">
              <span className="text-sm font-medium">Generated clauses will appear here</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
