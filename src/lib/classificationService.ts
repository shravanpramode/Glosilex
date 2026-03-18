import { callGemini } from './gemini';
import { getSupabase } from '../services/supabase';
import { embedText } from '../services/embeddings';
import { CLASSIFICATION_CHAIN, GLOBAL_SYSTEM_PROMPT } from './prompts';

export interface ClassificationResult {
  id?: string;
  extractedSpecs: any;
  scometFinding: string;
  earFinding: string;
  crossJurisdictionNote: string;
  finalDetermination: any;
}

export async function runClassificationChain(
  productInput: string,
  uploadedDocText?: string,
  jurisdictions: string[] = ['SCOMET_INDIA', 'EAR_US'],
  onProgress?: (step: string) => void
): Promise<ClassificationResult> {
  const supabase = getSupabase();
  const fullInput = uploadedDocText ? `${productInput}\n\nDOCUMENT TEXT:\n${uploadedDocText}` : productInput;

  // Step 1: Extract specs
  onProgress?.('Extracting product specifications...');
  const step1System = CLASSIFICATION_CHAIN.step1_extractSpecs.replace('{{text}}', '');
  const step1Response = await callGemini(step1System, fullInput, '', { temperature: 0.0, responseMimeType: 'application/json' });
  
  let extractedSpecs;
  try {
    extractedSpecs = JSON.parse(step1Response);
  } catch (e) {
    console.error('Failed to parse Step 1 JSON:', step1Response);
    extractedSpecs = { raw: step1Response };
  }
  const specsString = JSON.stringify(extractedSpecs);

  // Step 2: Classify against SCOMET
  let scometFinding = 'Not evaluated (SCOMET not selected)';
  if (jurisdictions.includes('SCOMET_INDIA')) {
    onProgress?.('Retrieving SCOMET regulatory context...');
    const queryEmbedding = await embedText(specsString);
    const { data: scometChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: queryEmbedding,
      query_text: specsString,
      jurisdiction_filter: ['SCOMET_INDIA'],
      match_count: 5
    });
    const scometContext = (scometChunks || []).map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`).join('\n\n');
    
    onProgress?.('Analyzing SCOMET compliance...');
    const step2System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CLASSIFICATION_CHAIN.step2_classifyScomet.replace('{{specs}}', specsString).replace('{{scomet_context}}', '')}`;
    scometFinding = await callGemini(step2System, 'Classify against SCOMET', scometContext, { temperature: 0.1 });
  }

  // Step 3: Classify against EAR
  let earFinding = 'Not evaluated (EAR not selected)';
  if (jurisdictions.includes('EAR_US')) {
    onProgress?.('Retrieving EAR regulatory context...');
    const queryEmbedding = await embedText(specsString);
    const { data: earChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: queryEmbedding,
      query_text: specsString,
      jurisdiction_filter: ['EAR_US'],
      match_count: 5
    });
    const earContext = (earChunks || []).map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`).join('\n\n');
    
    onProgress?.('Analyzing EAR compliance...');
    const step3System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CLASSIFICATION_CHAIN.step3_classifyEar.replace('{{specs}}', specsString).replace('{{ear_context}}', '')}`;
    earFinding = await callGemini(step3System, 'Classify against EAR', earContext, { temperature: 0.1 });
  }

  // Step 4: Cross-jurisdiction analysis
  onProgress?.('Running cross-jurisdiction analysis...');
  let crossJurisdictionNote = 'N/A';
  if (jurisdictions.includes('SCOMET_INDIA') && jurisdictions.includes('EAR_US')) {
    const step4System = CLASSIFICATION_CHAIN.step4_crossJurisdiction
      .replace('{{scomet_results}}', scometFinding)
      .replace('{{ear_results}}', earFinding);
    crossJurisdictionNote = await callGemini(step4System, 'Perform cross-jurisdiction analysis', '', { temperature: 0.1 });
  }

  // Step 5: Final determination + action plan
  onProgress?.('Generating final determination...');
  const step5System = CLASSIFICATION_CHAIN.step5_finalDetermination
    .replace('{{analysis}}', `SCOMET: ${scometFinding}\n\nEAR: ${earFinding}\n\nCROSS JURISDICTION: ${crossJurisdictionNote}`);
  const step5Response = await callGemini(step5System, 'Generate final determination and action plan', '', { temperature: 0.1, responseMimeType: 'application/json' });
  
  let finalDetermination;
  try {
    finalDetermination = JSON.parse(step5Response);
  } catch (e) {
    console.error('Failed to parse Step 5 JSON:', step5Response);
    finalDetermination = { raw: step5Response };
  }

  // Save to Supabase
  onProgress?.('Saving results...');
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id || 'anonymous';

  const { data: savedData, error } = await supabase.from('classification_results').insert({
    user_id: userId,
    product_input: productInput,
    extracted_specs: extractedSpecs,
    scomet_finding: scometFinding,
    ear_finding: earFinding,
    cross_jurisdiction_note: crossJurisdictionNote,
    action_plan: JSON.stringify(finalDetermination.actionPlan || []),
    overall_risk: finalDetermination.riskLevel || 'Unknown',
    created_at: new Date().toISOString()
  }).select().single();

  if (error) {
    console.error('Failed to save classification result:', error);
  }

  return {
    id: savedData?.id,
    extractedSpecs,
    scometFinding,
    earFinding,
    crossJurisdictionNote,
    finalDetermination
  };
}
