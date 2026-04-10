import { callGemini } from './gemini';
import { getSupabase } from '../services/supabase';
import { embedText } from '../services/embeddings';
import { ICP_CHAIN, GLOBAL_SYSTEM_PROMPT } from './prompts';
import { generateHypotheticalDoc } from './hyde';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface ICPGap {
  component: string;
  status: 'Present' | 'Partial' | 'Missing';
  jurisdiction: string;
  priority: 'P1' | 'P2' | 'P3';
  gapDescription: string;
  citation: string;
  sopText?: string;
  evidence?: string;
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
  chunksUsed?: any[];
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

  return relevantGaps.length === 0 ? 0 : (sum / relevantGaps.length) * 100;
}

function cleanJsonResponse(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseArrayResponse(raw: string): any[] {
  try {
    const cleaned = cleanJsonResponse(raw);
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    // Handle wrapped objects: {gapAnalysis: [...]} or {components: [...]} etc.
    for (const key of ['gapAnalysis', 'components', 'gaps', 'items', 'results', 'data']) {
      if (parsed[key] && Array.isArray(parsed[key])) return parsed[key];
    }
    return [];
  } catch (e) {
    return [];
  }
}

function buildGapListFromMappings(
  scometMapping: string,
  earMapping: string,
  jurisdictions: string[]
): ICPGap[] {
  let scometComponents: any[] = [];
  let earComponents: any[] = [];

  try {
    const s = JSON.parse(cleanJsonResponse(scometMapping));
    scometComponents = s.components || (Array.isArray(s) ? s : []);
  } catch (e) {}

  try {
    const e = JSON.parse(cleanJsonResponse(earMapping));
    earComponents = e.components || (Array.isArray(e) ? e : []);
  } catch (e) {}

  const statusRank: Record<string, number> = { Missing: 0, Partial: 1, Present: 2 };

  return ICP_COMPONENTS.map(compName => {
    const sc = scometComponents.find((c: any) => c.component === compName);
    const ec = earComponents.find((c: any) => c.component === compName);

    const scStatus = (sc?.status || 'Missing') as 'Present' | 'Partial' | 'Missing';
    const ecStatus = (ec?.status || 'Missing') as 'Present' | 'Partial' | 'Missing';
    const worstStatus: 'Present' | 'Partial' | 'Missing' =
      statusRank[scStatus] <= statusRank[ecStatus] ? scStatus : ecStatus;

    let jurisdiction = 'Both';
    if (jurisdictions.includes('SCOMET_INDIA') && !jurisdictions.includes('EAR_US')) jurisdiction = 'SCOMET';
    else if (jurisdictions.includes('EAR_US') && !jurisdictions.includes('SCOMET_INDIA')) jurisdiction = 'EAR';
    else if (scStatus === 'Missing' && ecStatus !== 'Missing') jurisdiction = 'SCOMET';
    else if (ecStatus === 'Missing' && scStatus !== 'Missing') jurisdiction = 'EAR';

    const criticalComponents = [
      'License Determination Procedures',
      'Customer & End-User Screening',
      'Product Classification Procedures',
      'Sanctions & Entity List Screening'
    ];
    const priority: 'P1' | 'P2' | 'P3' =
      (worstStatus === 'Missing' || worstStatus === 'Partial') && criticalComponents.includes(compName) ? 'P1' :
      worstStatus === 'Missing' ? 'P2' :
      worstStatus === 'Partial' ? 'P2' : 'P3';

    const gapParts: string[] = [];
    if (sc?.gapDescription && sc.gapDescription !== 'Fully compliant') gapParts.push(`SCOMET: ${sc.gapDescription}`);
    if (ec?.gapDescription && ec.gapDescription !== 'Fully compliant') gapParts.push(`EAR: ${ec.gapDescription}`);
    const gapDescription = gapParts.length > 0
      ? gapParts.join(' | ')
      : worstStatus === 'Present'
        ? 'Fully compliant under both assessed jurisdictions.'
        : 'Component not found in the provided ICP.';

    const citations = [sc?.citation, ec?.citation]
      .filter((c: string) => c && c !== 'N/A')
      .join('; ');

    return {
      component: compName,
      status: worstStatus,
      jurisdiction,
      priority,
      gapDescription,
      citation: citations || 'N/A',
      evidence: sc?.evidence || ec?.evidence || undefined
    };
  });
}

/* Inter-Step Delay of 1.5s (await pause(1500);) between every step - To avoid Rapid sequential Gemini calls on an overloaded API stack up and trigger 503 errors
ICP needed this most urgently because steps 4 → 5 → 6 are pure back-to-back Gemini calls with literally nothing in between — just JSON parsing which takes microseconds:
ICP Step 4 (callGemini) → [0ms gap — JSON parse only] → Step 5 (callGemini) → [0ms] → Step 6 (callGemini)
Three Gemini calls fired in rapid succession with zero breathing room. That's the stacking.*/
export async function runICPChain(
  icpText: string,
  companyName: string,
  jurisdictions: string[],
  onProgress?: (step: string) => void,
  onRetry?: (attempt: number, delayMs: number, reason: string) => void
): Promise<ICPResult> {
  const supabase = getSupabase();
  const input = icpText.trim() ? icpText : "No ICP provided";

  // Step 1: Extract ICP structure
  onProgress?.('Extracting ICP structure...');
  const step1System = `${GLOBAL_SYSTEM_PROMPT}\n\n${ICP_CHAIN.step1_extractStructure.replace('{{text}}', '')}`;
  const step1Response = await callGemini(step1System, input, '', { temperature: 0.0, responseMimeType: 'application/json', onRetry });
  
  let extractedStructure;
  try {
    extractedStructure = JSON.parse(step1Response);
  } catch (e) {
    console.error('Failed to parse Step 1 JSON:', step1Response);
    extractedStructure = { raw: step1Response };
  }
  const structureString = JSON.stringify(extractedStructure);

  // Step 2: Map against SCOMET requirements - Implemented HyDE (scometIcpQuery)
  let scometMapping = 'Not evaluated (SCOMET not selected)';
  let allChunks: any[] = [];
  if (jurisdictions.includes('SCOMET_INDIA')) {
    await pause(1500);
    onProgress?.('Mapping against SCOMET requirements...');
    const scometIcpQuery = `SCOMET India DGFT export control program ICP requirements: management commitment policy statement export control officer appointment SCOMET list Category 8A 6A 3A product classification procedures customer end-user screening transaction red flag review license determination recordkeeping 5 years employee training audit monitoring violation reporting escalation third-party intermediary controls technology transfer deemed export sanctions entity list screening DGFT Foreign Trade Policy`;
    const scometIcpHyde = await generateHypotheticalDoc(
      `SCOMET India ICP internal compliance program requirements: ${scometIcpQuery}`
    );
    const scometIcpEmbedding = await embedText(scometIcpHyde);
    const { data: scometChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: scometIcpEmbedding,
      query_text: scometIcpQuery,
      jurisdiction_filter: ['SCOMET_INDIA'],
      match_count: 7
    });
    if (scometChunks) allChunks = [...allChunks, ...scometChunks];
    const scometContext = (scometChunks || []).map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`).join('\n\n');
    
    const step2System = `${GLOBAL_SYSTEM_PROMPT}\n\n${ICP_CHAIN.step2_mapScomet.replace('{{icp_structure}}', structureString).replace('{{scomet_context}}', '')}`;
    scometMapping = await callGemini(step2System, 'Map against SCOMET', scometContext, { temperature: 0.0, responseMimeType: 'application/json', onRetry });
  }

  // Step 3: Map against EAR requirements - Implemented HyDE (earIcpQuery)
  let earMapping = 'Not evaluated (EAR not selected)';
  if (jurisdictions.includes('EAR_US')) {
    await pause(1500);
    onProgress?.('Mapping against EAR requirements...');
    const earIcpQuery = `US EAR BIS export compliance program ICP requirements: management commitment export control officer ECCN classification denied party screening license determination EAR99 recordkeeping 5 years training audit monitoring violation reporting deemed export technology transfer OFAC sanctions Consolidated Screening List Part 744 Part 764 15 CFR Bureau of Industry Security`;
    const earIcpHyde = await generateHypotheticalDoc(
      `US EAR BIS export compliance program requirements: ${earIcpQuery}`
    );
    const earIcpEmbedding = await embedText(earIcpHyde);
    const { data: earChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: earIcpEmbedding,
      query_text: earIcpQuery,
      jurisdiction_filter: ['EAR_US'],
      match_count: 7
    });
    if (earChunks) allChunks = [...allChunks, ...earChunks];
    const earContext = (earChunks || []).map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`).join('\n\n');
    
    const step3System = `${GLOBAL_SYSTEM_PROMPT}\n\n${ICP_CHAIN.step3_mapEar.replace('{{icp_structure}}', structureString).replace('{{ear_context}}', '')}`;
    earMapping = await callGemini(step3System, 'Map against EAR', earContext, { temperature: 0.0, responseMimeType: 'application/json', onRetry });
  }

  // Step 4: Identify gaps — pass mappings as context, NOT embedded in system prompt
  await pause(1500);
  onProgress?.('Identifying compliance gaps...');
  const step4PromptBase = ICP_CHAIN.step4_identifyGaps
    .replace('{{scomet_mapping}}', '')
    .replace('{{ear_mapping}}', '');
  const step4System = `${GLOBAL_SYSTEM_PROMPT}\n\n${step4PromptBase}`;
  const step4Context = `SCOMET MAPPING:\n${scometMapping}\n\nEAR MAPPING:\n${earMapping}`;
  const step4Response = await callGemini(
    step4System,
    'Evaluate ALL 14 standard ICP components and return all of them in the output, including Present components.',
    step4Context,
    { temperature: 0.0, responseMimeType: 'application/json', onRetry }
  );

  let gapList: ICPGap[] = parseArrayResponse(step4Response);

  // Robust fallback: if step 4 returns fewer than 14, build directly from step 2/3 outputs
  if (gapList.length < 14) {
    console.warn(`Step 4 returned ${gapList.length} items — rebuilding from step 2/3 directly`);
    gapList = buildGapListFromMappings(scometMapping, earMapping, jurisdictions);
  }

  // Safety net: ensure all 14 canonical names are represented
  const existingComponents = new Set(gapList.map(g => g.component));
  for (const comp of ICP_COMPONENTS) {
    if (!existingComponents.has(comp)) {
      gapList.push({
        component: comp,
        status: 'Missing',
        jurisdiction: jurisdictions.length > 1 ? 'Both' : (jurisdictions[0] === 'SCOMET_INDIA' ? 'SCOMET' : 'EAR'),
        priority: 'P2',
        gapDescription: 'Component not evaluated — insufficient regulatory context retrieved.',
        citation: 'N/A'
      });
    }
  }

  // Step 5: Generate SOP text — pass gapList as context
  await pause(1500);
  onProgress?.('Generating SOP language...');
  const step5PromptBase = ICP_CHAIN.step5_generateSop.replace('{{gaps}}', '');
  const step5System = `${GLOBAL_SYSTEM_PROMPT}\n\n${step5PromptBase}`;
  const step5Response = await callGemini(
    step5System,
    'Add sopText to every item in the gap list. Return the complete array with all 14 items.',
    JSON.stringify(gapList),
    { temperature: 0.0, responseMimeType: 'application/json', onRetry }
  );

  let gapListWithSop: ICPGap[] = gapList; // default: keep existing if step 5 fails
  const step5Parsed = parseArrayResponse(step5Response);
  if (step5Parsed.length >= 14) {
    gapListWithSop = step5Parsed;
  } else {
    console.warn(`Step 5 returned ${step5Parsed.length} items — keeping step 4 gap list without SOP text`);
  }

  // Step 6: Build documentation flow — pass analysis data as context
  await pause(1500);
  onProgress?.('Building documentation flow...');
  const step6PromptBase = ICP_CHAIN.step6_buildFlow.replace('{{analysis_data}}', '');
  const step6System = `${GLOBAL_SYSTEM_PROMPT}\n\n${step6PromptBase}`;
  const step6Response = await callGemini(
    step6System,
    'Build the recommended documentation flow based on the gap analysis.',
    JSON.stringify(gapListWithSop),
    { temperature: 0.1, responseMimeType: 'application/json', onRetry }
  );

  let docFlow: DocFlowStep[] = parseArrayResponse(step6Response);

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
    earScore,
    chunksUsed: allChunks
  };
}
