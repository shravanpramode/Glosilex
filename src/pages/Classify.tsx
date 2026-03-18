import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight, Download, Search, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { extractTextFromPdf } from '../utils/pdfParser';
import { LoadingSteps } from '../components/LoadingSteps';
import { RiskBadge } from '../components/RiskBadge';
import { DualJurisdictionAlert } from '../components/DualJurisdictionAlert';
import { runClassificationChain, ClassificationResult } from '../lib/classificationService';
import { normalizeClassificationResult } from '../lib/reportService';
import { useNavigate } from 'react-router-dom';

export const Classify: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [productDesc, setProductDesc] = useState('');
  const [scometEnabled, setScometEnabled] = useState(true);
  const [earEnabled, setEarEnabled] = useState(true);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSteps, setLoadingSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [specsExpanded, setSpecsExpanded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
    } else {
      alert('Please upload a PDF datasheet.');
    }
  };

  const runClassification = async () => {
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
      if (file) {
        pdfText = await extractTextFromPdf(file);
      }
      
      const jurisdictions = [];
      if (scometEnabled) jurisdictions.push('SCOMET_INDIA');
      if (earEnabled) jurisdictions.push('EAR_US');

      const classificationResult = await runClassificationChain(
        productDesc,
        pdfText,
        jurisdictions,
        (stepMsg) => {
          const index = steps.findIndex(s => stepMsg.includes(s.replace('...', '')));
          if (index !== -1) setCurrentStep(index);
        }
      );

      setResult(classificationResult);

    } catch (err) {
      console.error('Classification error:', err);
      setError('An error occurred during classification. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAskFollowUp = () => {
    // Navigate to /ask with pre-filled context
    const context = `Product Description: ${productDesc}\n\nClassification Result:\nRisk: ${result?.finalDetermination?.riskLevel}\nSCOMET: ${result?.scometFinding}\nEAR: ${result?.earFinding}`;
    navigate('/ask', { state: { initialQuery: `I have a question about this product classification:\n\n${context}` } });
  };

  const handleDownloadReport = () => {
    if (!result) return;
    const reportData = normalizeClassificationResult(result, file?.name || productDesc.substring(0, 50) || 'Product');
    navigate('/report', { state: { reportData } });
  };

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-64px)] bg-slate-50">
      {/* Left Panel - Input */}
      <div className="w-full md:w-2/5 bg-white border-r border-slate-200 p-6 overflow-y-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Search className="h-6 w-6 text-indigo-600" /> Classify My Product
          </h1>
          <p className="text-slate-500 mt-2 text-sm">Upload a datasheet or describe your product to determine SCOMET and EAR licensing requirements.</p>
        </div>

        <div className="space-y-6">
          {/* Upload Zone */}
          <div 
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              file ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              accept=".pdf" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            {file ? (
              <div className="flex flex-col items-center">
                <FileText className="h-10 w-10 text-indigo-600 mb-3" />
                <span className="font-medium text-indigo-900">{file.name}</span>
                <span className="text-xs text-indigo-600 mt-1">Click to change file</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Upload className="h-10 w-10 text-slate-400 mb-3" />
                <span className="font-medium text-slate-700">Drop product datasheet PDF here</span>
                <span className="text-xs text-slate-500 mt-1">or click to browse</span>
              </div>
            )}
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label htmlFor="productDesc" className="block text-sm font-medium text-slate-700 mb-1">Product Description & Technical Specs</label>
              <textarea 
                id="productDesc"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                rows={5}
                value={productDesc}
                onChange={e => setProductDesc(e.target.value)}
                placeholder="Describe the product, its end-use, destination, and key technical specifications..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Jurisdiction Scope</label>
              <div className="flex flex-col sm:flex-row gap-4">
                <label htmlFor="scometEnabled" className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                  <input 
                    id="scometEnabled"
                    type="checkbox" 
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-5 w-5"
                    checked={scometEnabled}
                    onChange={e => setScometEnabled(e.target.checked)}
                  />
                  <span className="text-sm text-slate-700">India SCOMET</span>
                </label>
                <label htmlFor="earEnabled" className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                  <input 
                    id="earEnabled"
                    type="checkbox" 
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-5 w-5"
                    checked={earEnabled}
                    onChange={e => setEarEnabled(e.target.checked)}
                  />
                  <span className="text-sm text-slate-700">US EAR / BIS</span>
                </label>
              </div>
            </div>
          </div>

          <button
            onClick={runClassification}
            disabled={(!file && !productDesc.trim()) || isLoading}
            className="w-full bg-indigo-600 text-white font-medium py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px]"
          >
            {isLoading ? 'Processing...' : 'Classify Product'} <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Right Panel - Results */}
      <div className="w-full md:w-3/5 p-6 overflow-y-auto bg-slate-50">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <LoadingSteps steps={loadingSteps} currentStepIndex={currentStep} />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center p-6">
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6 max-w-md w-full text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">Classification Failed</h3>
              <p className="text-slate-600 mb-6">{error}</p>
              <button 
                onClick={runClassification}
                className="bg-indigo-600 text-white font-medium py-2 px-6 rounded-lg hover:bg-indigo-700 transition-colors min-h-[44px]"
              >
                Retry Classification
              </button>
            </div>
          </div>
        ) : result ? (
          <div className="max-w-3xl mx-auto space-y-6 pb-8">
            {/* Risk Banner */}
            <div className={`p-6 rounded-2xl border ${
              result.finalDetermination?.riskLevel === 'HIGH' ? 'bg-red-50 border-red-200' :
              result.finalDetermination?.riskLevel === 'MEDIUM' ? 'bg-amber-50 border-amber-200' :
              'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-center gap-3 mb-2">
                <RiskBadge level={result.finalDetermination?.riskLevel || 'LOW'} />
                <h2 className={`text-xl font-bold ${
                  result.finalDetermination?.riskLevel === 'HIGH' ? 'text-red-900' :
                  result.finalDetermination?.riskLevel === 'MEDIUM' ? 'text-amber-900' :
                  'text-green-900'
                }`}>
                  {result.finalDetermination?.riskLevel === 'HIGH' ? 'LICENSE REQUIRED' : 
                   result.finalDetermination?.riskLevel === 'MEDIUM' ? 'REVIEW NEEDED' : 'NO LICENSE INDICATED'}
                </h2>
              </div>
              <p className={`text-sm ${
                result.finalDetermination?.riskLevel === 'HIGH' ? 'text-red-700' :
                result.finalDetermination?.riskLevel === 'MEDIUM' ? 'text-amber-700' :
                'text-green-700'
              }`}>
                Based on the provided datasheet and details, this product has been classified against the selected regulations.
              </p>
            </div>

            {/* Extracted Specs Summary Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <button 
                className="w-full px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center hover:bg-slate-100 transition-colors"
                onClick={() => setSpecsExpanded(!specsExpanded)}
              >
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" /> Extracted Specifications
                </h3>
                {specsExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
              </button>
              {specsExpanded && (
                <div className="p-6 bg-white">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(result.extractedSpecs || {}).map(([key, value]) => (
                      <div key={key} className="border-b border-slate-100 pb-2">
                        <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-sm text-slate-800">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SCOMET Findings Table */}
            {scometEnabled && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    🇮🇳 India SCOMET Classification
                  </h3>
                  <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                    Conf: {result.finalDetermination?.scomet?.confidence || 'N/A'}
                  </span>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">Controlled</p>
                      <p className="font-medium text-slate-900">
                        {result.finalDetermination?.scomet?.controlled ? <span className="text-red-600">✅ YES</span> : <span className="text-green-600">❌ NO</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">Category</p>
                      <p className="font-medium text-slate-900">{result.finalDetermination?.scomet?.category || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">Clause</p>
                      <p className="font-medium text-slate-900">{result.finalDetermination?.scomet?.clause || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-700 border border-slate-100">
                    <strong>Citation:</strong> {result.finalDetermination?.scomet?.citation || 'No specific citation found.'}
                  </div>
                  <div className="mt-4 text-sm text-slate-600 border-t border-slate-100 pt-4">
                    <strong>Detailed Finding:</strong> {result.scometFinding}
                  </div>
                </div>
              </div>
            )}

            {/* EAR Findings Card */}
            {earEnabled && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    🇺🇸 US EAR / BIS Classification
                  </h3>
                  <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                    Conf: {result.finalDetermination?.ear?.confidence || 'N/A'}
                  </span>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">Controlled</p>
                      <p className="font-medium text-slate-900">
                        {result.finalDetermination?.ear?.controlled ? <span className="text-red-600">✅ YES</span> : <span className="text-green-600">❌ NO</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">ECCN</p>
                      <p className="font-medium text-slate-900">{result.finalDetermination?.ear?.eccn || 'EAR99'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">Controls</p>
                      <p className="font-medium text-slate-900">{result.finalDetermination?.ear?.controls || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">Exception</p>
                      <p className="font-medium text-slate-900">{result.finalDetermination?.ear?.licenseException || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-700 border border-slate-100">
                    <strong>Citation:</strong> {result.finalDetermination?.ear?.citation || 'No specific citation found.'}
                  </div>
                  <div className="mt-4 text-sm text-slate-600 border-t border-slate-100 pt-4">
                    <strong>Detailed Finding:</strong> {result.earFinding}
                  </div>
                </div>
              </div>
            )}

            {/* Cross-Jurisdiction Note */}
            {scometEnabled && earEnabled && result.crossJurisdictionNote && result.crossJurisdictionNote !== 'N/A' && (
              <div className={`p-4 rounded-xl border ${result.finalDetermination?.dualJurisdiction ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-200'}`}>
                <h3 className={`font-bold flex items-center gap-2 mb-2 ${result.finalDetermination?.dualJurisdiction ? 'text-amber-900' : 'text-indigo-900'}`}>
                  {result.finalDetermination?.dualJurisdiction ? <AlertTriangle className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                  Cross-Jurisdiction Analysis
                </h3>
                <p className={`text-sm ${result.finalDetermination?.dualJurisdiction ? 'text-amber-800' : 'text-indigo-800'}`}>
                  {result.crossJurisdictionNote}
                </p>
                {result.finalDetermination?.dualJurisdiction && (
                  <div className="mt-3">
                    <DualJurisdictionAlert message="Both India SCOMET and US EAR apply to this product. Separate licenses may be required from DGFT and BIS." />
                  </div>
                )}
              </div>
            )}

            {/* Action Plan */}
            {result.finalDetermination?.actionPlan && result.finalDetermination.actionPlan.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="font-bold text-slate-800">Action Plan</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3">#</th>
                        <th className="px-6 py-3">Priority</th>
                        <th className="px-6 py-3">Action</th>
                        <th className="px-6 py-3">Jurisdiction</th>
                        <th className="px-6 py-3">Timeline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.finalDetermination.actionPlan.map((item: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-6 py-4 text-slate-500">{idx + 1}</td>
                          <td className="px-6 py-4 font-medium">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              item.priority === 'P1' || item.priority === 'High' ? 'bg-red-100 text-red-800' :
                              item.priority === 'P2' || item.priority === 'Medium' ? 'bg-amber-100 text-amber-800' :
                              'bg-indigo-100 text-indigo-800'
                            }`}>
                              {item.priority}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-700">{item.action}</td>
                          <td className="px-6 py-4 text-slate-600">{item.jurisdiction || item.authority || 'General'}</td>
                          <td className="px-6 py-4 text-slate-600">{item.timeline}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button 
                onClick={handleDownloadReport}
                className="flex-1 bg-white border border-slate-300 text-slate-700 font-medium py-3 px-4 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
              >
                <Download className="h-5 w-5" /> Download Report
              </button>
              <button 
                onClick={handleAskFollowUp}
                className="flex-1 bg-indigo-600 text-white font-medium py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
              >
                <MessageSquare className="h-5 w-5" /> Ask Follow-up
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 text-center">
              <p className="text-xs text-slate-500 max-w-2xl mx-auto">
                ⚠️ LEGAL DISCLAIMER: SemiShield is an AI-generated tool for informational purposes only. It does not constitute legal advice. Verify all compliance determinations with a qualified export control attorney before making shipping, licensing, or contractual decisions.
              </p>
            </div>

          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6">
            <Search className="h-16 w-16 text-slate-200 mb-4" />
            <p className="text-lg font-medium text-slate-600">Ready to Classify</p>
            <p className="max-w-md mt-2 mb-8">Upload a datasheet or enter product details to generate a multi-jurisdiction classification report.</p>
            
            <div className="w-full max-w-md">
              <p className="text-sm font-medium text-slate-500 mb-3 text-left">Try an example:</p>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => setProductDesc('5-axis CNC milling machine with positioning accuracy of 1.5 µm')} 
                  className="text-sm bg-white border border-slate-200 rounded-lg px-4 py-3 hover:bg-slate-50 hover:border-indigo-300 transition-colors text-slate-700 text-left flex items-center justify-between group min-h-[44px]"
                >
                  <span className="truncate pr-4">5-axis CNC milling machine (1.5 µm accuracy)</span>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 flex-shrink-0" />
                </button>
                <button 
                  onClick={() => setProductDesc('Carbon fiber prepreg tape with specific tensile strength of 23.5 x 10^4 m')} 
                  className="text-sm bg-white border border-slate-200 rounded-lg px-4 py-3 hover:bg-slate-50 hover:border-indigo-300 transition-colors text-slate-700 text-left flex items-center justify-between group min-h-[44px]"
                >
                  <span className="truncate pr-4">Carbon fiber prepreg tape (23.5 x 10^4 m)</span>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 flex-shrink-0" />
                </button>
                <button 
                  onClick={() => setProductDesc('Radiation-hardened microprocessor rated for 500 krad(Si)')} 
                  className="text-sm bg-white border border-slate-200 rounded-lg px-4 py-3 hover:bg-slate-50 hover:border-indigo-300 transition-colors text-slate-700 text-left flex items-center justify-between group min-h-[44px]"
                >
                  <span className="truncate pr-4">Radiation-hardened microprocessor (500 krad)</span>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 flex-shrink-0" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
