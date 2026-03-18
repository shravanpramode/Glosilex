import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Copy, ArrowDown, Download, Building2, FileCheck } from 'lucide-react';
import { extractTextFromPdf } from '../utils/pdfParser';
import { runICPChain, ICPResult, ICPGap, DocFlowStep } from '../lib/icpService';
import { normalizeICPResult } from '../lib/reportService';
import { LoadingSteps } from '../components/LoadingSteps';
import { useNavigate } from 'react-router-dom';

export const Icp: React.FC = () => {
  const [companyName, setCompanyName] = useState('');
  const [hasExistingIcp, setHasExistingIcp] = useState(true);
  const [uploadedFileText, setUploadedFileText] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [jurisdictions, setJurisdictions] = useState<string[]>(['SCOMET_INDIA', 'EAR_US']);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSteps, setLoadingSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<ICPResult | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

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

  const handleJurisdictionToggle = (jurisdiction: string) => {
    setJurisdictions(prev => 
      prev.includes(jurisdiction) 
        ? prev.filter(j => j !== jurisdiction)
        : [...prev, jurisdiction]
    );
  };

  const handleRunAssessment = async () => {
    if (!companyName.trim()) {
      alert('Please enter a company name.');
      return;
    }
    if (jurisdictions.length === 0) {
      alert('Please select at least one jurisdiction.');
      return;
    }
    if (hasExistingIcp && !uploadedFileText) {
      alert('Please upload an existing ICP document or select "Start from scratch".');
      return;
    }

    setIsLoading(true);
    setResult(null);
    setError(null);
    setLoadingSteps([
      'Extracting ICP structure...',
      'Mapping against SCOMET requirements...',
      'Mapping against EAR requirements...',
      'Identifying compliance gaps...',
      'Generating SOP language...',
      'Building documentation flow...'
    ]);
    setCurrentStep(0);

    try {
      const icpText = hasExistingIcp ? (uploadedFileText || '') : '';
      const assessmentResult = await runICPChain(
        icpText,
        companyName,
        jurisdictions,
        (step) => {
          if (step.includes('Extracting')) setCurrentStep(0);
          else if (step.includes('SCOMET')) setCurrentStep(1);
          else if (step.includes('EAR')) setCurrentStep(2);
          else if (step.includes('gaps')) setCurrentStep(3);
          else if (step.includes('SOP')) setCurrentStep(4);
          else if (step.includes('flow')) setCurrentStep(5);
        }
      );
      setResult(assessmentResult);
    } catch (err) {
      console.error('Assessment failed:', err);
      setError('An error occurred during the assessment. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score >= 50) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getScoreColorText = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-600';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const presentCount = result?.gapAnalysis.filter(g => g.status === 'Present').length || 0;
  const partialCount = result?.gapAnalysis.filter(g => g.status === 'Partial').length || 0;
  const missingCount = result?.gapAnalysis.filter(g => g.status === 'Missing').length || 0;

  const handleDownloadReport = () => {
    if (!result) return;
    const reportData = normalizeICPResult(result, companyName || 'Company');
    navigate('/report', { state: { reportData } });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">ICP Gap Analyzer</h1>
        <p className="text-slate-500 mt-1">Evaluate your Internal Compliance Program against SCOMET and EAR requirements.</p>
      </div>

      {/* Scope & Setup Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-600" />
          Scope & Setup
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
                placeholder="e.g. Acme Semiconductors Ltd."
              />
              <p className="text-xs text-slate-500 mt-1">Used to customize the generated SOP language.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">ICP Status</label>
              <div className="flex flex-col sm:flex-row gap-4">
                <label htmlFor="hasExistingIcp" className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                  <input
                    id="hasExistingIcp"
                    type="radio"
                    checked={hasExistingIcp}
                    onChange={() => setHasExistingIcp(true)}
                    className="text-indigo-600 focus:ring-indigo-500 h-5 w-5"
                  />
                  <span className="text-sm text-slate-700">I have an existing ICP</span>
                </label>
                <label htmlFor="startFromScratch" className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                  <input
                    id="startFromScratch"
                    type="radio"
                    checked={!hasExistingIcp}
                    onChange={() => {
                      setHasExistingIcp(false);
                      setUploadedFileText(null);
                      setUploadedFileName(null);
                    }}
                    className="text-indigo-600 focus:ring-indigo-500 h-5 w-5"
                  />
                  <span className="text-sm text-slate-700">Start from scratch</span>
                </label>
              </div>
            </div>

            {hasExistingIcp && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Upload ICP Document (PDF)</label>
                <div 
                  className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer bg-slate-50 min-h-[120px]"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-8 w-8 text-slate-400" />
                    <div className="flex text-sm text-slate-600">
                      <span className="relative rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                        {uploadedFileName ? 'Change file' : 'Upload a file'}
                      </span>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-slate-500">
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
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Jurisdiction Scope</label>
              <div className="space-y-2">
                <label htmlFor="icpScomet" className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 min-h-[44px]">
                  <input
                    id="icpScomet"
                    type="checkbox"
                    checked={jurisdictions.includes('SCOMET_INDIA')}
                    onChange={() => handleJurisdictionToggle('SCOMET_INDIA')}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-5 w-5"
                  />
                  <span className="text-sm font-medium text-slate-900">India SCOMET</span>
                </label>
                <label htmlFor="icpEar" className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 min-h-[44px]">
                  <input
                    id="icpEar"
                    type="checkbox"
                    checked={jurisdictions.includes('EAR_US')}
                    onChange={() => handleJurisdictionToggle('EAR_US')}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-5 w-5"
                  />
                  <span className="text-sm font-medium text-slate-900">US EAR / BIS</span>
                </label>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={handleRunAssessment}
                disabled={isLoading || !companyName.trim() || jurisdictions.length === 0 || (hasExistingIcp && !uploadedFileText)}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                Run ICP Assessment
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading Sequence */}
      {isLoading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 mb-8">
          <LoadingSteps steps={loadingSteps} currentStepIndex={currentStep} />
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 mb-8 text-center max-w-2xl mx-auto">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">Assessment Failed</h3>
          <p className="text-slate-600 mb-6">{error}</p>
          <button 
            onClick={handleRunAssessment}
            className="bg-indigo-600 text-white font-medium py-2 px-6 rounded-lg hover:bg-indigo-700 transition-colors min-h-[44px]"
          >
            Retry Assessment
          </button>
        </div>
      )}

      {/* Empty State */}
      {!result && !isLoading && !error && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center max-w-3xl mx-auto">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileCheck className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-3">Ready to Analyze Your ICP</h3>
          <p className="text-slate-500 max-w-lg mx-auto mb-8">
            Upload your Internal Compliance Program document or start from scratch to generate a comprehensive gap analysis and standard operating procedures.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <h4 className="font-bold text-slate-800 mb-2 text-sm">1. Scope</h4>
              <p className="text-xs text-slate-600">Select the jurisdictions relevant to your business operations.</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <h4 className="font-bold text-slate-800 mb-2 text-sm">2. Analyze</h4>
              <p className="text-xs text-slate-600">Our AI compares your document against official regulatory requirements.</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <h4 className="font-bold text-slate-800 mb-2 text-sm">3. Generate</h4>
              <p className="text-xs text-slate-600">Receive a detailed gap report and ready-to-use SOP language.</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Section */}
      {result && !isLoading && !error && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Summary Bar */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="relative flex items-center justify-center w-24 h-24">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100"
                    strokeWidth="3"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={getScoreColorText(result.overallScore)}
                    strokeWidth="3"
                    strokeDasharray={`${result.overallScore}, 100`}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className={`text-2xl font-bold ${getScoreColorText(result.overallScore)}`}>
                    {Math.round(result.overallScore)}%
                  </span>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-bold text-slate-900">Overall Compliance Score</h3>
                <div className="flex gap-3 mt-2">
                  {jurisdictions.includes('SCOMET_INDIA') && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getScoreColor(result.scometScore)}`}>
                      SCOMET: {Math.round(result.scometScore)}%
                    </span>
                  )}
                  {jurisdictions.includes('EAR_US') && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getScoreColor(result.earScore)}`}>
                      EAR: {Math.round(result.earScore)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="text-center px-4 border-r border-slate-200">
                <div className="text-2xl font-bold text-emerald-600">{presentCount}</div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">Present</div>
              </div>
              <div className="text-center px-4 border-r border-slate-200">
                <div className="text-2xl font-bold text-amber-500">{partialCount}</div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">Partial</div>
              </div>
              <div className="text-center px-4">
                <div className="text-2xl font-bold text-red-500">{missingCount}</div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">Missing</div>
              </div>
            </div>
          </div>

          {/* Gap Analysis Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">Gap Analysis & SOP Generation</h3>
              <span className="text-sm text-slate-500">14 Standard Components</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3">Component</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Jurisdiction</th>
                    <th className="px-6 py-3">Priority</th>
                    <th className="px-6 py-3">Gap Description</th>
                    <th className="px-6 py-3">Citation</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {result.gapAnalysis.map((gap, idx) => (
                    <React.Fragment key={idx}>
                      <tr 
                        className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${expandedRow === idx ? 'bg-slate-50' : ''}`}
                        onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                      >
                        <td className="px-6 py-4 font-medium text-slate-900 w-1/5">{gap.component}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            gap.status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                            gap.status === 'Partial' ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {gap.status === 'Present' && <CheckCircle2 className="w-3.5 h-3.5" />}
                            {gap.status === 'Partial' && <AlertTriangle className="w-3.5 h-3.5" />}
                            {gap.status === 'Missing' && <XCircle className="w-3.5 h-3.5" />}
                            {gap.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{gap.jurisdiction}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            gap.priority === 'P1' ? 'bg-red-100 text-red-800' :
                            gap.priority === 'P2' ? 'bg-amber-100 text-amber-800' :
                            'bg-indigo-100 text-indigo-800'
                          }`}>
                            {gap.priority}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 w-1/4">{gap.gapDescription}</td>
                        <td className="px-6 py-4 text-slate-500 text-xs w-1/6">{gap.citation}</td>
                        <td className="px-6 py-4 text-right">
                          {expandedRow === idx ? (
                            <ChevronUp className="w-5 h-5 text-slate-400 inline-block" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400 inline-block" />
                          )}
                        </td>
                      </tr>
                      {expandedRow === idx && gap.sopText && (
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="bg-white border border-indigo-100 rounded-lg p-4 shadow-sm">
                              <div className="flex justify-between items-start mb-3">
                                <h4 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-indigo-600" />
                                  Recommended SOP Language
                                </h4>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(gap.sopText || '');
                                  }}
                                  className="text-slate-400 hover:text-indigo-600 transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md"
                                  title="Copy to clipboard"
                                  aria-label="Copy SOP language to clipboard"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="text-sm text-slate-700 whitespace-pre-wrap font-mono bg-slate-50 p-3 rounded border border-slate-200">
                                {gap.sopText}
                              </div>
                              <div className="mt-3 text-xs text-slate-500 flex items-center gap-1">
                                <span className="font-semibold">Citation:</span> {gap.citation}
                              </div>
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

          {/* Documentation Flow */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">Recommended Documentation Flow</h3>
            <div className="max-w-3xl mx-auto">
              {result.docFlow.map((step, idx) => (
                <div key={idx} className="relative">
                  <div className="flex items-center gap-4 bg-white border-2 border-slate-200 rounded-xl p-4 shadow-sm hover:border-indigo-300 transition-colors z-10 relative">
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
                        }`}>
                          {step.type}
                        </span>
                        {step.jurisdictionTags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {idx < result.docFlow.length - 1 && (
                    <div className="flex justify-center my-2">
                      <ArrowDown className="w-5 h-5 text-slate-300" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Export Button */}
          <div className="flex justify-end pt-4">
            <button
              onClick={handleDownloadReport}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors min-h-[44px]"
            >
              <Download className="w-5 h-5" />
              Download Report
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-500 max-w-2xl mx-auto">
              ⚠️ LEGAL DISCLAIMER: SemiShield is an AI-generated tool for informational purposes only. It does not constitute legal advice. Verify all compliance determinations with a qualified export control attorney before making shipping, licensing, or contractual decisions.
            </p>
          </div>

        </div>
      )}
    </div>
  );
};
