import { callGemini } from './gemini';
import { getSupabase } from '../services/supabase';
import { embedText } from '../services/embeddings';
import { ICP_CHAIN, GLOBAL_SYSTEM_PROMPT } from './prompts';

export interface ICPGap {
  component: string;
  status: 'Present' | 'Partial' | 'Missing';
  jurisdiction: string;
  priority: 'P1' | 'P2' | 'P3';
  gapDescription: string;
  citation: string;
  sopText?: string;
}

export interface DocFlowStep {
  stepNumber: number;
  label: string;
  type: 'Policy' | 'Procedure' | 'Record' | 'Form';
  jurisdictionTags: string[];
}

export interface ICPResult {
  id?: string;
  gapAnalysis: ICPGap[];
  docFlow: DocFlowStep[];
  overallScore: number;
  scometScore: number;
  earScore: number;
}

const ICP_COMPONENTS = [
  "Management Commitment & Policy Statement",
  "Export Control Officer Appointment",
  "Product Classification Procedures",
  "Customer & End-User Screening",
  "Transaction Screening & Red Flag Review",
  "License Determination Procedures",
  "License Application & Tracking",
  "Recordkeeping Policy (minimum 5 years)",
  "Employee Training Programme",
  "Auditing & Monitoring Procedures",
  "Violation Reporting & Escalation",
  "Third-Party / Intermediary Controls",
  "Technology Transfer & Deemed Export Controls",
  "Sanctions & Entity List Screening"
];

function calculateScore(gaps: ICPGap[], jurisdictionFilter?: string): number {
  let relevantGaps = gaps;
  if (jurisdictionFilter) {
    relevantGaps = gaps.filter(g => g.jurisdiction.includes(jurisdictionFilter) || g.jurisdiction === 'Both');
  }

  let sum = 0;
  for (const gap of relevantGaps) {
    if (gap.status === 'Present') sum += 1.0;
    else if (gap.status === 'Partial') sum += 0.5;
  }

  return (sum / 14) * 100;
}

export async function runICPChain(
  icpText: string,
  companyName: string,
  jurisdictions: string[],
  onProgress?: (step: string) => void
): Promise<ICPResult> {
  const supabase = getSupabase();
  const input = icpText.trim() ? icpText : "No ICP provided";

  // Step 1: Extract ICP structure
  onProgress?.('Extracting ICP structure...');
  const step1System = ICP_CHAIN.step1_extractStructure.replace('{{text}}', '');
  const step1Response = await callGemini(step1System, input, '', { temperature: 0.1, responseMimeType: 'application/json' });
  
  let extractedStructure;
  try {
    extractedStructure = JSON.parse(step1Response);
  } catch (e) {
    console.error('Failed to parse Step 1 JSON:', step1Response);
    extractedStructure = { raw: step1Response };
  }
  const structureString = JSON.stringify(extractedStructure);

  // Step 2: Map against SCOMET requirements
  let scometMapping = 'Not evaluated (SCOMET not selected)';
  if (jurisdictions.includes('SCOMET_INDIA')) {
    onProgress?.('Mapping against SCOMET requirements...');
    const queryEmbedding = await embedText(structureString);
    const { data: scometChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: queryEmbedding,
      query_text: structureString,
      jurisdiction_filter: ['SCOMET_INDIA'],
      match_count: 7
    });
    const scometContext = (scometChunks || []).map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`).join('\n\n');
    
    const step2System = `${GLOBAL_SYSTEM_PROMPT}\n\n${ICP_CHAIN.step2_mapScomet.replace('{{icp_structure}}', structureString).replace('{{scomet_context}}', '')}`;
    scometMapping = await callGemini(step2System, 'Map against SCOMET', scometContext, { temperature: 0.1, responseMimeType: 'application/json' });
  }

  // Step 3: Map against EAR requirements
  let earMapping = 'Not evaluated (EAR not selected)';
  if (jurisdictions.includes('EAR_US')) {
    onProgress?.('Mapping against EAR requirements...');
    const queryEmbedding = await embedText(structureString);
    const { data: earChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: queryEmbedding,
      query_text: structureString,
      jurisdiction_filter: ['EAR_US'],
      match_count: 7
    });
    const earContext = (earChunks || []).map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`).join('\n\n');
    
    const step3System = `${GLOBAL_SYSTEM_PROMPT}\n\n${ICP_CHAIN.step3_mapEar.replace('{{icp_structure}}', structureString).replace('{{ear_context}}', '')}`;
    earMapping = await callGemini(step3System, 'Map against EAR', earContext, { temperature: 0.1, responseMimeType: 'application/json' });
  }

  // Step 4: Identify gaps
  onProgress?.('Identifying compliance gaps...');
  const step4System = ICP_CHAIN.step4_identifyGaps
    .replace('{{scomet_mapping}}', scometMapping)
    .replace('{{ear_mapping}}', earMapping);
  const step4Response = await callGemini(step4System, 'Identify gaps against 14 standard components', '', { temperature: 0.1, responseMimeType: 'application/json' });
  
  let gapList: ICPGap[] = [];
  try {
    gapList = JSON.parse(step4Response);
  } catch (e) {
    console.error('Failed to parse Step 4 JSON:', step4Response);
  }

  // Ensure all 14 components are present in the gap list
  const existingComponents = new Set(gapList.map(g => g.component));
  for (const comp of ICP_COMPONENTS) {
    if (!existingComponents.has(comp)) {
      gapList.push({
        component: comp,
        status: 'Missing',
        jurisdiction: jurisdictions.length > 1 ? 'Both' : (jurisdictions[0] === 'SCOMET_INDIA' ? 'SCOMET' : 'EAR'),
        priority: 'P2',
        gapDescription: 'Component not found in the provided ICP.',
        citation: 'N/A'
      });
    }
  }

  // Step 5: Generate SOP text
  onProgress?.('Generating SOP language...');
  const step5System = ICP_CHAIN.step5_generateSop.replace('{{gaps}}', JSON.stringify(gapList));
  const step5Response = await callGemini(step5System, 'Generate SOP text for gaps', '', { temperature: 0.3, responseMimeType: 'application/json' });
  
  let gapListWithSop: ICPGap[] = gapList;
  try {
    gapListWithSop = JSON.parse(step5Response);
  } catch (e) {
    console.error('Failed to parse Step 5 JSON:', step5Response);
  }

  // Step 6: Build documentation flow output
  onProgress?.('Building documentation flow...');
  const step6System = ICP_CHAIN.step6_buildFlow.replace('{{analysis_data}}', JSON.stringify(gapListWithSop));
  const step6Response = await callGemini(step6System, 'Build documentation flow', '', { temperature: 0.1, responseMimeType: 'application/json' });
  
  let docFlow: DocFlowStep[] = [];
  try {
    docFlow = JSON.parse(step6Response);
  } catch (e) {
    console.error('Failed to parse Step 6 JSON:', step6Response);
  }

  // Calculate scores
  const overallScore = calculateScore(gapListWithSop);
  const scometScore = calculateScore(gapListWithSop, 'SCOMET');
  const earScore = calculateScore(gapListWithSop, 'EAR');

  // Save to Supabase
  onProgress?.('Saving results...');
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id || 'anonymous';

  const { data: savedData, error } = await supabase.from('icp_results').insert({
    user_id: userId,
    company_name: companyName,
    icp_provided: !!icpText.trim(),
    gap_analysis: gapListWithSop,
    doc_flow: docFlow,
    overall_score: overallScore,
    scomet_score: scometScore,
    ear_score: earScore,
    created_at: new Date().toISOString()
  }).select().single();

  if (error) {
    console.error('Failed to save ICP result:', error);
  }

  return {
    id: savedData?.id,
    gapAnalysis: gapListWithSop,
    docFlow,
    overallScore,
    scometScore,
    earScore
  };
}
