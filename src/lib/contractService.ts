import { callGemini } from './gemini';
import { getSupabase } from '../services/supabase';
import { embedText } from '../services/embeddings';
import { CONTRACT_CHAIN, GLOBAL_SYSTEM_PROMPT } from './prompts';
import { generateHypotheticalDoc } from './hyde';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  chunksUsed?: any[];
  confidenceScore?: number;
  confidenceNote?: string;
  retrievalWarning?: boolean;
  retrievalWarningMessage?: string;
  contractSummary?: {
    sellerName?: string;
    buyerName?: string;
    buyerCountry?: string;
    products?: Array<{ description: string; technicalParams?: string; quantity?: string; unitPrice?: string }>;
    totalOrderValue?: string;
    deliveryTerms?: string;
    poReference?: string;
    contractDate?: string;
    governingLaw?: string;
  };
}

// Inter-Step Delay of 1.5s (await pause(1500);) between every steps 3 → 4 → 5 ARE back-to-back gemini calls - To avoid Rapid sequential Gemini calls on an overloaded API stack up and trigger 503 errors
export async function runContractChain(
  contractText: string,
  contractName: string,
  reviewScope: string[],
  jurisdictions: string[],
  onProgress?: (step: string) => void,
  onRetry?: (attempt: number, delayMs: number, reason: string) => void
): Promise<ContractResult> {
  const supabase = getSupabase();

  // Step 1: Extract clauses
  onProgress?.('Extracting contract clauses...');
  const step1System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CONTRACT_CHAIN.step1_extractClauses.replace('{{text}}', '')}`;
  const step1Response = await callGemini(step1System, contractText, '', { temperature: 0.0, responseMimeType: 'application/json', onRetry });
  
  let extractedClauses;
  let productSummary: any = {};
  try {
    const step1Parsed = JSON.parse(step1Response);
    if (Array.isArray(step1Parsed)) {
      extractedClauses = step1Parsed;
    } else {
      extractedClauses = step1Parsed.clauses || [];
      productSummary = step1Parsed.productSummary || {};
    }
  } catch (e) {
    console.error('Failed to parse Step 1 JSON:', step1Response);
    extractedClauses = [];
  }
  const extractedClausesString = JSON.stringify(extractedClauses);
  const productSummaryString = JSON.stringify(productSummary);

  // Step 2: Retrieve regulatory requirements - Implemented HyDE (scometContractQuery, earContractQuery)
  onProgress?.('Retrieving regulatory requirements...');
  let scometContext = '';
  let allChunks: any[] = [];
  // Build product-aware query using what was extracted in Step 1
  const productContext = productSummary?.products?.map((p: any) => p.description).join(', ')
    || productSummary?.productName
    || contractName;

  if (jurisdictions.includes('SCOMET_INDIA')) {
    const scometContractQuery = `SCOMET export control contract clauses for: ${productContext}. Required: SCOMET license authorization reference number export compliance end-use certificate end-user statement re-export restriction prohibited diversion force majeure regulatory change DGFT India audit rights suspension termination license denial revocation notification contractual obligation SCOMET List`;
    const scometContractHyde = await generateHypotheticalDoc(
      `SCOMET India export control contract clause requirements: ${scometContractQuery}`
    );
    const scometContractEmbedding = await embedText(scometContractHyde);
    const { data: scometChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: scometContractEmbedding,
      query_text: scometContractQuery,
      jurisdiction_filter: ['SCOMET_INDIA'],
      match_count: 5
    });
    if (scometChunks) allChunks = [...allChunks, ...scometChunks];
    scometContext = (scometChunks || []).map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`).join('\n\n');
  }

  let earContext = '';
  if (jurisdictions.includes('EAR_US')) {
    const earContractQuery = `US EAR BIS export control contract clauses for: ${productContext}. Required: export license number ECCN classification re-export restriction prohibited end-use end-user diversion clause license exception conditions deemed export technology transfer deemed re-export FDPR foreign direct product rule audit right regulatory change notification termination right 15 CFR Part 736 Part 744 BIS compliance`;
    const earContractHyde = await generateHypotheticalDoc(
      `US EAR BIS export control contract clause requirements: ${earContractQuery}`
    );
    const earContractEmbedding = await embedText(earContractHyde);
    const { data: earChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: earContractEmbedding,
      query_text: earContractQuery,
      jurisdiction_filter: ['EAR_US'],
      match_count: 5
    });
    if (earChunks) allChunks = [...allChunks, ...earChunks];
    earContext = (earChunks || []).map((c: any) => `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`).join('\n\n');
  }

  const combinedContext = `SCOMET CONTEXT:\n${scometContext}\n\nEAR CONTEXT:\n${earContext}`;
  const step2System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CONTRACT_CHAIN.step2_retrieveRequirements.replace('{{context}}', '')}`;
  const step2Response = await callGemini(step2System, 'Retrieve required clauses', combinedContext, { temperature: 0.0, responseMimeType: 'application/json', onRetry });

  // Step 3: Assess adequacy
  onProgress?.('Assessing clause adequacy...');
  const step3System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CONTRACT_CHAIN.step3_assessAdequacy
    .replace('{{extracted_clauses}}', extractedClausesString)
    .replace('{{product_summary}}', productSummaryString)
    .replace('{{requirements}}', step2Response)}`;
  const step3Response = await callGemini(step3System, 'Assess adequacy of clauses', combinedContext, { temperature: 0.0, responseMimeType: 'application/json', onRetry });
  
  let adequacyAssessment: ClauseAudit[] = [];
    let step3Confidence = {
      confidenceScore: 75,
      confidenceNote: 'Moderate — confidence not explicitly assessed'
    };
    try {
      const parsedStep3 = JSON.parse(step3Response);
      adequacyAssessment = Array.isArray(parsedStep3)
        ? parsedStep3
        : (parsedStep3.clauses || []);
      if (!Array.isArray(parsedStep3)) {
        // Override model confidence score with deterministic code-side computation
        // to prevent run-to-run variation.
        const missingForConf = (Array.isArray(parsedStep3.clauses) ? parsedStep3.clauses : [])
          .filter((c: any) => c.status === 'MISSING').length;
        const weakSingleJurisdiction = (Array.isArray(parsedStep3.clauses) ? parsedStep3.clauses : [])
          .filter((c: any) => c.status === 'WEAK').length;
        const computedConf = Math.max(10, Math.min(95,
          85 - (missingForConf * 4) - (weakSingleJurisdiction * 2)
        ));
        step3Confidence = {
          confidenceScore: computedConf,
          confidenceNote: parsedStep3.confidenceNote ?? 'Moderate — confidence not explicitly assessed'
        };
      }
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
  await pause(1500);
  onProgress?.('Identifying gaps and risks...');
  const step4System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CONTRACT_CHAIN.step4_listGaps.replace('{{assessment}}', JSON.stringify(adequacyAssessment))}`;
  const step4Response = await callGemini(step4System, 'List WEAK and MISSING clauses', '', { temperature: 0.0, responseMimeType: 'application/json', onRetry });
  
  let gapList = [];
    try {
      const parsedStep4 = JSON.parse(step4Response);
      gapList = Array.isArray(parsedStep4) ? parsedStep4 : (parsedStep4.gaps || parsedStep4.clauses || []);
    } catch (e) {
      console.error('Failed to parse Step 4 JSON:', step4Response);
      // Derive gap list directly from adequacy assessment as fallback
      gapList = adequacyAssessment
        .filter((c: any) => c.status === 'WEAK' || c.status === 'MISSING')
        .map((c: any) => ({
          item: c.category,
          status: c.status,
          priority: c.riskLevel === 'HIGH' ? 'P1' : c.riskLevel === 'MEDIUM' ? 'P2' : 'P3',
          jurisdiction: c.jurisdiction,
          description: c.riskReason,
          citation: c.citation
        }));
    }
  
  // Declare parsedStep5 here so the try block can assign to it
    let parsedStep5: any = { clauses: [], riskScore: null, riskLevel: null, summary: null };

    // ── Declare finalResult BEFORE the gap check so it's always in scope ──
    let finalResult: ContractResult = {
      overallRisk: 'MEDIUM',
      riskScore: 50,
      summary: 'Analysis failed to complete properly.',
      clauseAudit: adequacyAssessment,
      confidenceScore: step3Confidence.confidenceScore,
      confidenceNote: step3Confidence.confidenceNote,
    };

    // Compute risk score deterministically (used in both paths)
    const missingCount = adequacyAssessment.filter((c: any) => c.status === 'MISSING').length;
    const weakCount = adequacyAssessment.filter((c: any) => c.status === 'WEAK').length;
    const computedRiskScore = Math.min(100, Math.max(10, (missingCount * 20) + (weakCount * 10)));

  // Step 5: Generate clause language (only needed when there are gaps)
    if (gapList.length > 0) {
      await pause(1500);
      onProgress?.('Generating compliant clause language...');
      const step5System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CONTRACT_CHAIN.step5_generateLanguage
        .replace('{{gaps}}', JSON.stringify(gapList))
        .replace('{{product_summary}}', productSummaryString)}`;
      const step5Response = await callGemini(step5System, 'Generate clause language', '', { temperature: 0.0, responseMimeType: 'application/json', onRetry });

      try {
        // NOTE: use parsedStep5 (no 'const' — assigns to outer let)
        parsedStep5 = JSON.parse(step5Response);

        // Merge generated clauses back into the full adequacy assessment
        const mergedAudit = adequacyAssessment.map((item: any) => {
          if (item.status === 'ADEQUATE') {
            return { ...item, generatedClauseText: 'No remediation required. Existing clause is adequate.' };
          }
          const generatedMatch = parsedStep5.clauses?.find((c: any) => c.category === item.category);
          if (generatedMatch) {
            return {
              ...item,
              ...generatedMatch,
              generatedClauseText: generatedMatch.generatedClauseText
            };
          }
          return item;
        });

        // Compute overallRisk deterministically from the adequacy assessment — never from Step 5's guess
        const computedRisk: 'HIGH' | 'MEDIUM' | 'LOW' =
          missingCount > 0 ? 'HIGH' :
          weakCount >= 4 ? 'HIGH' :
          weakCount > 1 ? 'MEDIUM' :
          'LOW';
        
        // Normalize individual clause riskLevels — MISSING must always be HIGH
        const normalizedAudit = mergedAudit.map((c: any) => ({
          ...c,
          riskLevel: c.status === 'MISSING' ? 'HIGH' : c.riskLevel
        }));

        finalResult = {
          overallRisk: computedRisk,
          riskScore: computedRiskScore,
          // Confidence always sourced from Step 3 (authoritative adequacy pass) — never from Step 5
          confidenceScore: step3Confidence.confidenceScore,
          confidenceNote: step3Confidence.confidenceNote,
          summary: parsedStep5.summary || 'Analysis complete.',
          clauseAudit: normalizedAudit,
          contractSummary: productSummary
        };
      } catch (e) {
        console.error('Failed to parse Step 5 JSON:', step5Response);
        // finalResult stays as the safe default declared above
      }

    } else {
      // All clauses ADEQUATE — assemble the all-adequate result directly
      onProgress?.('All clauses adequate — no remediation required.');

      const adequateAudit = adequacyAssessment.map((item: any) => ({
        ...item,
        generatedClauseText: 'No remediation required. Existing clause is adequate.'
      }));

      finalResult = {
        overallRisk: 'LOW',
        riskScore: computedRiskScore,
        confidenceScore: step3Confidence.confidenceScore,
        confidenceNote: step3Confidence.confidenceNote,
        summary: `This contract demonstrates a strong export control compliance posture. All ${adequacyAssessment.length} assessed clause categories are adequate under both ${jurisdictions.join(' and ')} requirements. No remediation is required.`,
        clauseAudit: adequateAudit,
        contractSummary: productSummary
      };
    }

  // ── Low-quality run detection ─────────────────────────────────────────
    const genericSectionPattern = /Section:\s*(AND COMPONENTS|General Prohibitions)\b/i;
    const noCitationPattern = /^Based on standard export control practice/i;

    const clausesWithPoorCitations = finalResult.clauseAudit.filter((c: any) => {
      if (!c.citation) return true;
      if (noCitationPattern.test(c.citation.trim())) return true;
      if (genericSectionPattern.test(c.citation)) return true;
      return false;
    }).length;

    // Count clauses that have at least one specific section reference (e.g. 8A301, ECCN, §734)
    const specificCitationPattern = /Section:\s*(8A|ECCN|§\d|3A|Part\s*7[0-9]{2}\s*§)/i;
    const clausesWithSpecificCitations = finalResult.clauseAudit.filter((c: any) =>
      c.citation && specificCitationPattern.test(c.citation)
    ).length;

    // Only flag as low quality when BOTH conditions hold:
    // 1. Confidence is below 65% (model itself expressed uncertainty)
    // 2. Fewer than 2 clauses have specific regulatory section citations
    const retrievalQualityLow =
      (finalResult.confidenceScore ?? 85) < 65 &&
      clausesWithSpecificCitations < 2;

    if (retrievalQualityLow) {
      (finalResult as any).retrievalWarning = true;
      (finalResult as any).retrievalWarningMessage =
        'Low retrieval quality detected on this run — specific regulatory sections could not be resolved. Results may be less precise. Consider re-running the analysis.';
    }
  
  // ── Save to Supabase ───────────────────────────────────────────────────
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || 'anonymous';

    const { data: savedData, error } = await supabase.from('contract_results').insert({
      user_id: userId,
      contract_name: contractName,
      review_scope: reviewScope,
      jurisdictions: jurisdictions,
      clause_audit: finalResult.clauseAudit,
      generated_clauses: finalResult.clauseAudit.filter((c: any) => c.generatedClauseText),
      overall_risk: finalResult.overallRisk,
      risk_score: finalResult.riskScore,
      confidence_score: finalResult.confidenceScore,
      confidence_note: finalResult.confidenceNote,
      summary: finalResult.summary,
      created_at: new Date().toISOString()
    }).select().single();

    if (error) {
      console.error('Failed to save Contract result:', error);
    }

    return {
      ...finalResult,
      id: savedData?.id,
      chunksUsed: allChunks
    };
  
}
