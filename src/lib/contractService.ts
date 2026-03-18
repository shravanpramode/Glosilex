import { callGemini } from './gemini';
import { getSupabase } from '../services/supabase';
import { embedText } from '../services/embeddings';
import { CONTRACT_CHAIN, GLOBAL_SYSTEM_PROMPT } from './prompts';

export interface ClauseAudit {
  category: string;
  status: 'ADEQUATE' | 'WEAK' | 'MISSING';
  extractedText: string | null;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  riskReason: string;
  jurisdiction: string;
  citation: string;
  generatedClauseText?: string;
}

export interface ContractResult {
  id?: string;
  overallRisk: 'HIGH' | 'MEDIUM' | 'LOW';
  riskScore: number;
  summary: string;
  clauseAudit: ClauseAudit[];
}

export async function runContractChain(
  contractText: string,
  contractName: string,
  reviewScope: string[],
  jurisdictions: string[],
  onProgress?: (step: string) => void
): Promise<ContractResult> {
  const supabase = getSupabase();

  // Step 1: Extract clauses
  onProgress?.('Extracting contract clauses...');
  const step1System = CONTRACT_CHAIN.step1_extractClauses.replace('{{text}}', '');
  const step1Response = await callGemini(step1System, contractText, '', { temperature: 0.0, responseMimeType: 'application/json' });
  
  let extractedClauses;
  try {
    extractedClauses = JSON.parse(step1Response);
  } catch (e) {
    console.error('Failed to parse Step 1 JSON:', step1Response);
    extractedClauses = [];
  }
  const extractedClausesString = JSON.stringify(extractedClauses);

  // Step 2: Retrieve regulatory requirements
  onProgress?.('Retrieving regulatory requirements...');
  const contractSummary = contractText.substring(0, 500);
  const queryEmbedding = await embedText(contractSummary);
  
  let scometContext = '';
  if (jurisdictions.includes('SCOMET_INDIA')) {
    const { data: scometChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: queryEmbedding,
      query_text: contractSummary,
      jurisdiction_filter: ['SCOMET_INDIA'],
      match_count: 5
    });
    scometContext = (scometChunks || []).map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`).join('\n\n');
  }

  let earContext = '';
  if (jurisdictions.includes('EAR_US')) {
    const { data: earChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: queryEmbedding,
      query_text: contractSummary,
      jurisdiction_filter: ['EAR_US'],
      match_count: 5
    });
    earContext = (earChunks || []).map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`).join('\n\n');
  }

  const combinedContext = `SCOMET CONTEXT:\n${scometContext}\n\nEAR CONTEXT:\n${earContext}`;
  const step2System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CONTRACT_CHAIN.step2_retrieveRequirements.replace('{{context}}', '')}`;
  const step2Response = await callGemini(step2System, 'Retrieve required clauses', combinedContext, { temperature: 0.1, responseMimeType: 'application/json' });

  // Step 3: Assess adequacy
  onProgress?.('Assessing clause adequacy...');
  const step3System = CONTRACT_CHAIN.step3_assessAdequacy
    .replace('{{extracted_clauses}}', extractedClausesString)
    .replace('{{requirements}}', step2Response);
  const step3Response = await callGemini(step3System, 'Assess adequacy of clauses', '', { temperature: 0.1, responseMimeType: 'application/json' });
  
  let adequacyAssessment: ClauseAudit[] = [];
  try {
    adequacyAssessment = JSON.parse(step3Response);
  } catch (e) {
    console.error('Failed to parse Step 3 JSON:', step3Response);
  }

  // Filter adequacy assessment to only include categories in reviewScope
  adequacyAssessment = adequacyAssessment.filter(item =>
    reviewScope.some(scope =>
      scope.toLowerCase().includes(item.category.toLowerCase()) ||
      item.category.toLowerCase().includes(scope.toLowerCase().split('/')[0].trim())
    )
  );

  // Step 4: List gaps
  onProgress?.('Identifying gaps and risks...');
  const step4System = CONTRACT_CHAIN.step4_listGaps.replace('{{assessment}}', JSON.stringify(adequacyAssessment));
  const step4Response = await callGemini(step4System, 'List WEAK and MISSING clauses', '', { temperature: 0.1, responseMimeType: 'application/json' });
  
  let gapList = [];
  try {
    gapList = JSON.parse(step4Response);
  } catch (e) {
    console.error('Failed to parse Step 4 JSON:', step4Response);
  }

  // Step 5: Generate clause language
  onProgress?.('Generating compliant clause language...');
  const step5System = CONTRACT_CHAIN.step5_generateLanguage.replace('{{gaps}}', JSON.stringify(gapList));
  const step5Response = await callGemini(step5System, 'Generate clause language', '', { temperature: 0.3, responseMimeType: 'application/json' });
  
  let finalResult: ContractResult = {
    overallRisk: 'MEDIUM',
    riskScore: 50,
    summary: 'Analysis failed to complete properly.',
    clauseAudit: adequacyAssessment
  };

  try {
    const parsedStep5 = JSON.parse(step5Response);
    
    // Merge generated clauses back into the full adequacy assessment
    const mergedAudit = adequacyAssessment.map(item => {
      const generatedMatch = parsedStep5.clauses?.find((c: any) => c.category === item.category);
      if (generatedMatch) {
        return {
          ...item,
          ...generatedMatch, // Update riskReason, citation, etc. if step 5 improved them
          generatedClauseText: generatedMatch.generatedClauseText
        };
      }
      return item;
    });

    finalResult = {
      overallRisk: parsedStep5.riskLevel || 'MEDIUM',
      riskScore: parsedStep5.riskScore || 50,
      summary: parsedStep5.summary || 'Analysis complete.',
      clauseAudit: mergedAudit
    };
  } catch (e) {
    console.error('Failed to parse Step 5 JSON:', step5Response);
  }

  // Save to Supabase
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id || 'anonymous';

  const { data: savedData, error } = await supabase.from('contract_results').insert({
    user_id: userId,
    contract_name: contractName, // We don't have filename in the service layer args, using placeholder
    review_scope: reviewScope,
    jurisdictions: jurisdictions,
    clause_audit: finalResult.clauseAudit,
    generated_clauses: finalResult.clauseAudit.filter(c => c.generatedClauseText),
    overall_risk: finalResult.overallRisk,
    risk_score: finalResult.riskScore,
    created_at: new Date().toISOString()
  }).select().single();

  if (error) {
    console.error('Failed to save Contract result:', error);
  }

  return {
    ...finalResult,
    id: savedData?.id
  };
}
