import { callGemini } from './gemini';
import { getSupabase } from '../services/supabase';
import { REPORT_SYNTHESIS_PROMPT, GLOBAL_SYSTEM_PROMPT } from './prompts';
import { ClassificationResult } from './classificationService';
import { ICPResult } from './icpService';
import { ContractResult } from './contractService';

export interface NormalizedReport {
  moduleType: 'classification' | 'icp' | 'contract' | 'combined';
  companyName?: string;
  overallRisk: 'HIGH' | 'MEDIUM' | 'LOW';
  riskScore?: number;
  summary: string;
  jurisdictions: string[];
  findings: {
    scomet?: string;
    ear?: string;
    crossJurisdiction?: string;
  };
  gapList?: Array<{
    item: string;
    status: string;
    priority: string;
    jurisdiction: string;
    description: string;
    citation: string;
  }>;
  actionPlan?: Array<{
    action: string;
    jurisdiction: string;
    priority: string;
    timeline: string;
  }>;
  entityScreening?: Array<{
    entity: string;
    status: string;
    listMatch: string;
  }>;
  extractedSpecs?: Record<string, any>;
  docFlow?: Array<{
    stepNumber: number;
    label: string;
    type: string;
    jurisdictionTags: string[];
  }>;
  citations: string[];
  rawData?: any;
}

export function normalizeClassificationResult(
  result: ClassificationResult,
  productInput: string
): NormalizedReport {
  const jurisdictions = [];
  if (result.scometFinding && result.scometFinding !== 'Not evaluated (SCOMET not selected)') jurisdictions.push('SCOMET_INDIA');
  if (result.earFinding && result.earFinding !== 'Not evaluated (EAR not selected)') jurisdictions.push('EAR_US');

  const actionPlan = result.finalDetermination?.actionPlan?.map((ap: any) => ({
    action: ap.step || ap.action || JSON.stringify(ap),
    jurisdiction: ap.jurisdiction || 'General',
    priority: ap.priority || 'Medium',
    timeline: ap.timeline || 'Immediate'
  })) || [];

  return {
    moduleType: 'classification',
    companyName: productInput, // Using product input as the identifier
    overallRisk: result.finalDetermination?.riskLevel || 'MEDIUM',
    summary: result.finalDetermination?.summary || 'Product classification analysis completed.',
    jurisdictions,
    findings: {
      scomet: result.scometFinding,
      ear: result.earFinding,
      crossJurisdiction: result.crossJurisdictionNote
    },
    actionPlan,
    extractedSpecs: result.extractedSpecs,
    citations: [
      result.finalDetermination?.scomet?.citation,
      result.finalDetermination?.ear?.citation
    ].filter(Boolean) as string[],
    rawData: result
  };
}

export function normalizeICPResult(
  result: ICPResult,
  companyName: string
): NormalizedReport {
  const jurisdictions = [];
  if (result.scometScore > 0 || result.gapAnalysis.some(g => g.jurisdiction.includes('SCOMET'))) jurisdictions.push('SCOMET_INDIA');
  if (result.earScore > 0 || result.gapAnalysis.some(g => g.jurisdiction.includes('EAR'))) jurisdictions.push('EAR_US');

  const gapList = result.gapAnalysis.map(gap => ({
    item: gap.component,
    status: gap.status,
    priority: gap.priority,
    jurisdiction: gap.jurisdiction,
    description: gap.gapDescription,
    citation: gap.citation
  }));

  let overallRisk: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (result.overallScore < 50) overallRisk = 'HIGH';
  else if (result.overallScore < 80) overallRisk = 'MEDIUM';

  return {
    moduleType: 'icp',
    companyName,
    overallRisk,
    riskScore: Math.round(result.overallScore),
    summary: `ICP Gap Analysis completed. Overall compliance score is ${Math.round(result.overallScore)}%.`,
    jurisdictions,
    findings: {
      scomet: `SCOMET Compliance Score: ${Math.round(result.scometScore)}%`,
      ear: `EAR Compliance Score: ${Math.round(result.earScore)}%`
    },
    gapList,
    docFlow: result.docFlow,
    citations: result.gapAnalysis.map(g => g.citation).filter(c => c && c !== 'N/A'),
    rawData: result
  };
}

export function normalizeContractResult(
  result: ContractResult,
  contractName: string
): NormalizedReport {
  const jurisdictions = Array.from(new Set(result.clauseAudit.map(c => c.jurisdiction)));

  const gapList = result.clauseAudit.map(clause => ({
    item: clause.category,
    status: clause.status,
    priority: clause.riskLevel === 'HIGH' ? 'P1' : clause.riskLevel === 'MEDIUM' ? 'P2' : 'P3',
    jurisdiction: clause.jurisdiction,
    description: clause.riskReason,
    citation: clause.citation
  }));

  return {
    moduleType: 'contract',
    companyName: contractName,
    overallRisk: result.overallRisk,
    riskScore: result.riskScore,
    summary: result.summary,
    jurisdictions,
    findings: {
      crossJurisdiction: 'Contract clauses assessed against selected jurisdictions.'
    },
    gapList,
    citations: result.clauseAudit.map(c => c.citation).filter(c => c && c !== 'N/A'),
    rawData: result
  };
}

export async function synthesizeReport(normalized: NormalizedReport): Promise<string> {
  const systemPrompt = `${GLOBAL_SYSTEM_PROMPT}\n\n${REPORT_SYNTHESIS_PROMPT}`;
  
  const classificationResults = normalized.moduleType === 'classification' ? JSON.stringify(normalized) : 'N/A';
  const icpResults = normalized.moduleType === 'icp' ? JSON.stringify(normalized) : 'N/A';
  const contractResults = normalized.moduleType === 'contract' ? JSON.stringify(normalized) : 'N/A';

  const prompt = systemPrompt
    .replace('{{classification_results}}', classificationResults)
    .replace('{{icp_results}}', icpResults)
    .replace('{{contract_results}}', contractResults);

  const response = await callGemini(prompt, 'Synthesize executive summary', '', { temperature: 0.1 });
  return response;
}

export async function saveReport(
  normalized: NormalizedReport,
  synthesizedSummary: string
): Promise<{ shareToken: string }> {
  const supabase = getSupabase();
  const shareToken = crypto.randomUUID();

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id || 'anonymous';

  const { error } = await supabase.from('reports').insert({
    user_id: userId,
    module_type: normalized.moduleType,
    report_json: normalized,
    synthesized_summary: synthesizedSummary,
    share_token: shareToken,
    created_at: new Date().toISOString()
  });

  if (error) {
    console.error('Failed to save report:', error);
    throw new Error('Failed to save report');
  }

  return { shareToken };
}

export async function loadReportByToken(token: string): Promise<NormalizedReport | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('reports')
    .select('report_json, synthesized_summary')
    .eq('share_token', token)
    .single();

  if (error || !data) {
    console.error('Failed to load report:', error);
    return null;
  }

  const report = data.report_json as NormalizedReport;
  // Inject the synthesized summary back in if it was saved separately
  if (data.synthesized_summary) {
    report.summary = data.synthesized_summary;
  }

  return report;
}
