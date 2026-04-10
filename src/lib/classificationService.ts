import { callGemini } from './gemini';
import { getSupabase } from '../services/supabase';
import { embedText } from '../services/embeddings';
import { CLASSIFICATION_CHAIN, GLOBAL_SYSTEM_PROMPT } from './prompts';
import { generateHypotheticalDoc } from './hyde';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface ClassificationResult {
  id?: string;
  extractedSpecs: any;
  scometFinding: string;
  earFinding: string;
  crossJurisdictionNote: string;
  finalDetermination: any;
  chunksUsed?: any[];
}

export interface PartialClassificationData {
  lastCompletedStep: 1 | 2 | 3 | 4;
  extractedSpecs?: any;
  specsString?: string;
  scometFinding?: string;
  earFinding?: string;
  allChunks?: any[];
  crossJurisdictionNote?: string;
}

function buildScometQuery(specs: any): string {
  const t = JSON.stringify(specs).toLowerCase();
  const parts: string[] = [
    `Product: ${specs.productName || 'electronic component'}`,
    `Specifications: ${specs.keySpecifications || ''}`,
    `End-use: ${specs.endUse || ''}`,
    `Origin: ${specs.componentOrigin || ''}`
  ];

  if (t.includes('fpga') || t.includes('field programmable') || t.includes('programmable logic'))
    parts.push('SCOMET Category 8A301 field programmable logic devices integrated circuits');
  if (t.includes('radiation') || t.includes('krad') || t.includes('rad(si)') || t.includes('tid'))
    parts.push('SCOMET radiation hardened microcircuits total ionizing dose Category 8A radiation tolerant');
  if (t.includes('mil-std') || t.includes('mil-prf') || t.includes('military') || t.includes('munition'))
    parts.push('SCOMET Category 6A military electronics munitions list specialized military components');
  if (t.includes('satellite') || t.includes('spacecraft') || t.includes('space') || t.includes('reconnaissance'))
    parts.push('SCOMET space qualified satellite components Category 8A Category 6A reconnaissance');
  if (t.includes('amplifier') || t.includes('gan') || t.includes('gaas') || t.includes('rf') || t.includes('microwave'))
    parts.push('SCOMET Category 3A GaN GaAs RF amplifier microwave power module transistor');
  if (t.includes('microprocessor') || t.includes('asic') || t.includes('processor'))
    parts.push('SCOMET Category 8A301 microprocessors digital integrated circuits semiconductor');
  if (t.includes('antifuse') || t.includes('one-time') || t.includes('otp'))
    parts.push('SCOMET antifuse non-reprogrammable integrated circuit specialized microcircuit');
  if (t.includes('encrypt') || t.includes('cryptograph') || t.includes('hsm') ||
      t.includes('aes') || t.includes('rsa') || t.includes('fips') ||
      t.includes('key storage') || t.includes('cipher') || t.includes('security module') ||
      t.includes('ecc') || t.includes('trng') || t.includes('rng')) {
    parts.push('SCOMET Category 8A information security cryptographic hardware encryption module AES-256 RSA ECC key management FIPS 140 dual-use information security equipment DGFT SCOMET 8A301');
  }

  return parts.join('. ');
}


function buildEarQuery(specs: any): string {
  const t = JSON.stringify(specs).toLowerCase();
  const parts: string[] = [
    `Product: ${specs.productName || 'electronic component'}`,
    `Specifications: ${specs.keySpecifications || ''}`,
    `End-use: ${specs.endUse || ''}`,
    `Origin: ${specs.componentOrigin || ''}`
  ];

  if (t.includes('fpga') || t.includes('field programmable') || t.includes('programmable logic'))
    parts.push('ECCN 3A001.a.7 field programmable logic devices Commerce Control List input output');
  if (t.includes('radiation') || t.includes('krad') || t.includes('rad(si)') || t.includes('tid'))
    parts.push('ECCN 3A001.a.1 radiation hardened integrated circuits total ionizing dose rads silicon threshold 5000 Gy Si 500 krad');
  // 3A001.a.2 is temperature-only (≤218K OR ≥398K OR full -55°C to 125°C range) — no radiation criterion.
  // Retrieve this separately so the AI does NOT conflate the radiation threshold from a.1 into a.2.
  if (t.includes('-55') || t.includes('55°c') || t.includes('218 k') || t.includes('125°c') ||
      t.includes('398 k') || t.includes('mil-std') || t.includes('military temp') ||
      t.includes('temperature range') || t.includes('operating temp'))
    parts.push('ECCN 3A001.a.2 temperature range operating below 218K minus 55 degrees celsius above 398K 125 degrees full military temperature range integrated circuits');
  if (t.includes('satellite') || t.includes('spacecraft') || t.includes('space') || t.includes('mil-prf-38535'))
    parts.push('ECCN 9A515 spacecraft space qualified radiation hardened microelectronic circuits satellite Category 9');
  // 9A515.d vs .e distinction: SEL immunity ≥80 MeV·cm²/mg triggers .d (NS1/RS1 global licence),
  // below threshold falls to .e (RS2). Retrieve both control paragraphs so the AI can compare.
  if (t.includes('sel') || t.includes('single event latch') || t.includes('mev') ||
      t.includes('let threshold') || t.includes('linear energy transfer') ||
      t.includes('radiation hard') || t.includes('rad-hard'))
    parts.push('ECCN 9A515.d 9A515.e single event latchup SEL immunity LET threshold 80 MeV cm2 mg NS1 RS1 RS2 control radiation hardened microelectronic circuits space qualified');
  if (t.includes('mil-std') || t.includes('mil-prf') || t.includes('military') || t.includes('reconnaissance'))
    parts.push('EAR Part 744 military end-use end-user controls license required ECCN 3A001 military grade');
  if (t.includes('amplifier') || t.includes('gan') || t.includes('gaas') || t.includes('rf') || t.includes('microwave'))
    parts.push('ECCN 3A001.b.4 GaN GaAs RF amplifier microwave power transistor semiconductor high frequency');
  if (t.includes('microprocessor') || t.includes('asic') || t.includes('processor') || t.includes('ai') || t.includes('inference'))
    parts.push('ECCN 3A090 advanced integrated circuits AI inference chips performance threshold BIS 2023');
  if (t.includes('antifuse') || t.includes('one-time') || t.includes('otp'))
    parts.push('ECCN 9A515 3A001 non-reprogrammable antifuse microelectronic circuit space qualified');

  return parts.join('. ');
}


// Deduplicate and cap citations - avoid irrelevant & wrong product type citations getting retrieved
function deduplicateAndRankChunks(chunks: any[], maxPerSource: number = 4): any[] {
  const seen = new Set<string>();
  const deduped = chunks.filter(chunk => {
    const key = `${chunk.document_name}||${chunk.clause_id}||${(chunk.content || '').substring(0, 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Group by document, keep top N per source by similarity score
  const byDoc = new Map<string, any[]>();
  for (const chunk of deduped) {
    const doc = chunk.document_name || 'unknown';
    if (!byDoc.has(doc)) byDoc.set(doc, []);
    byDoc.get(doc)!.push(chunk);
  }

  const result: any[] = [];
  for (const [, docChunks] of byDoc) {
    const sorted = docChunks.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    result.push(...sorted.slice(0, maxPerSource));
  }
  return result;
}


// ─── Normalise the confidence string from an LLM finding to HIGH / MEDIUM / LOW ───
// The LLM sometimes writes "HIGH (95%)", "75% — MEDIUM", plain "High", etc.
// This extracts the canonical tier so the sanitiser has a reliable input.
function normaliseConfidence(raw: string | undefined): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (!raw) return 'LOW';
  const u = raw.toUpperCase();
  if (u.includes('HIGH'))   return 'HIGH';
  if (u.includes('MEDIUM')) return 'MEDIUM';
  return 'LOW';
}


// ─── Deterministic risk level from structured findings ──────────────────────
// Avoids relying on the LLM's own riskLevel field which can vary between runs.
// Rule: any controlled=true → HIGH. Both null/pending → MEDIUM. All false → LOW.
function deriveRiskLevel(
  scometControlled: boolean | null | undefined,
  earControlled: boolean | null | undefined
): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (scometControlled === true || earControlled === true) return 'HIGH';
  if (scometControlled === null || earControlled === null) return 'MEDIUM';
  return 'LOW';
}

// Inter-Step Delay of 1.5s (await pause(1500);) between every steps 4 → 5 ARE back-to-back gemini calls - To avoid Rapid sequential Gemini calls on an overloaded API stack up and trigger 503 errors
export async function runClassificationChain(
  productInput: string,
  uploadedDocText?: string,
  jurisdictions: string[] = ['SCOMET_INDIA', 'EAR_US'],
  onProgress?: (step: string) => void,
  onRetry?: (attempt: number, delayMs: number, reason: string) => void,
  onStepComplete?: (partial: PartialClassificationData) => void,
  partialData?: PartialClassificationData
): Promise<ClassificationResult> {
  // ── Input Validation ───────────────────────────────────────────────────
  if (productInput.length > 8000) {
    throw new Error('Product description exceeds maximum allowed length (8,000 characters).');
  }
  if (uploadedDocText && uploadedDocText.length > 150000) {
    throw new Error('Uploaded document text exceeds maximum allowed length (150,000 characters).');
  }

  const supabase = getSupabase();
  const fullInput = uploadedDocText
    ? `${productInput}\n\nDOCUMENT TEXT:\n${uploadedDocText}`
    : productInput;

  // ── Step 1: Extract specs ────────────────────────────────────────────────
  let extractedSpecs: any;
  let specsString: string;
  if (partialData && partialData.lastCompletedStep >= 1 && partialData.extractedSpecs) {
    onProgress?.('Extracting product specifications...');
    extractedSpecs = partialData.extractedSpecs;
    specsString = partialData.specsString!;
  } else {
    onProgress?.('Extracting product specifications...');
    const step1System = CLASSIFICATION_CHAIN.step1_extractSpecs.replace('{{text}}', '');
    const step1Response = await callGemini(step1System, fullInput, '', { temperature: 0.0, responseMimeType: 'application/json', onRetry });
    try {
      extractedSpecs = JSON.parse(step1Response);
    } catch (e) {
      if (!import.meta.env.PROD) {
        console.error('Failed to parse Step 1 JSON:', step1Response);
      }
      extractedSpecs = { raw: step1Response };
    }
    specsString = JSON.stringify(extractedSpecs);
    onStepComplete?.({ lastCompletedStep: 1, extractedSpecs, specsString });
  }

  // ── Step 2: Classify against SCOMET ─────────────────────────────────────
  let scometFinding = 'Not evaluated (SCOMET not selected)';
  let allChunks: any[] = [];

  if (partialData && partialData.lastCompletedStep >= 2) {
    onProgress?.('Retrieving SCOMET regulatory context...');
    scometFinding = partialData.scometFinding ?? 'Not evaluated (SCOMET not selected)';
    allChunks = [...(partialData.allChunks ?? [])];
  } else if (jurisdictions.includes('SCOMET_INDIA')) {
    onProgress?.('Retrieving SCOMET regulatory context...');
    const scometQuery = buildScometQuery(extractedSpecs);
    const scometHyde = await generateHypotheticalDoc(
      `SCOMET India export control classification for: ${scometQuery}`
    );
    const scometEmbedding = await embedText(scometHyde);
    const { data: scometChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: scometEmbedding,
      query_text: scometQuery,
      jurisdiction_filter: ['SCOMET_INDIA'],
      match_count: 8
    });
    if (scometChunks) allChunks = [...allChunks, ...scometChunks];
    const scometContext = (scometChunks || []).map((c: any) =>
      `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`
    ).join('\n\n');
    onProgress?.('Analyzing SCOMET compliance...');
    const step2System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CLASSIFICATION_CHAIN.step2_classifyScomet
      .replace('{{specs}}', specsString)
      .replace('{{scomet_context}}', '')}`;
    scometFinding = await callGemini(step2System, 'Classify against SCOMET', scometContext, { temperature: 0.0, onRetry });
    onStepComplete?.({ lastCompletedStep: 2, extractedSpecs, specsString, scometFinding, allChunks: [...allChunks] });
  }

  // ── Step 3: Classify against EAR ────────────────────────────────────────
  let earFinding = 'Not evaluated (EAR not selected)';

  if (partialData && partialData.lastCompletedStep >= 3) {
    onProgress?.('Retrieving EAR regulatory context...');
    earFinding = partialData.earFinding ?? 'Not evaluated (EAR not selected)';
    allChunks = [...(partialData.allChunks ?? allChunks)];
  } else if (jurisdictions.includes('EAR_US')) {
    onProgress?.('Retrieving EAR regulatory context...');
    const earQuery = buildEarQuery(extractedSpecs);
    const earHyde = await generateHypotheticalDoc(
      `US EAR BIS export control classification for: ${earQuery}`
    );
    const earEmbedding = await embedText(earHyde);
    const { data: earChunks } = await supabase.rpc('hybrid_search', {
      query_embedding: earEmbedding,
      query_text: earQuery,
      jurisdiction_filter: ['EAR_US'],
      match_count: 8
    });
    if (earChunks) allChunks = [...allChunks, ...earChunks];
    const earContext = (earChunks || []).map((c: any) =>
      `[Source: ${c.document_name} | Section: ${c.section} | Clause: ${c.clause_id}]\n${c.content}`
    ).join('\n\n');
    onProgress?.('Analyzing EAR compliance...');
    const step3System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CLASSIFICATION_CHAIN.step3_classifyEar
      .replace('{{specs}}', specsString)
      .replace('{{ear_context}}', '')}`;
    earFinding = await callGemini(step3System, 'Classify against EAR', earContext, { temperature: 0.0, onRetry });
    onStepComplete?.({ lastCompletedStep: 3, extractedSpecs, specsString, scometFinding, earFinding, allChunks: [...allChunks] });
  }

  // ── Step 4: Cross-jurisdiction analysis ─────────────────────────────────
  let crossJurisdictionNote = 'N/A';

  if (partialData && partialData.lastCompletedStep >= 4) {
    onProgress?.('Running cross-jurisdiction analysis...');
    crossJurisdictionNote = partialData.crossJurisdictionNote ?? 'N/A';
  } else {
    await pause(1500);
    onProgress?.('Running cross-jurisdiction analysis...');
    if (jurisdictions.includes('SCOMET_INDIA') && jurisdictions.includes('EAR_US')) {
      const step4System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CLASSIFICATION_CHAIN.step4_crossJurisdiction
        .replace('{{scomet_results}}', scometFinding)
        .replace('{{ear_results}}', earFinding)}`;
      crossJurisdictionNote = await callGemini(step4System, 'Perform cross-jurisdiction analysis', '', { temperature: 0.0, onRetry });
    }
    onStepComplete?.({ lastCompletedStep: 4, extractedSpecs, specsString, scometFinding, earFinding, allChunks: [...allChunks], crossJurisdictionNote });
  }

  // ── Step 5: Final determination + action plan ────────────────────────────
  await pause(1500);
  onProgress?.('Generating final determination...');
  const step5System = `${GLOBAL_SYSTEM_PROMPT}\n\n${CLASSIFICATION_CHAIN.step5_finalDetermination
    .replace('{{analysis}}', `SCOMET: ${scometFinding}\n\nEAR: ${earFinding}\n\nCROSS JURISDICTION: ${crossJurisdictionNote}`)}`;
  const step5Response = await callGemini(
    step5System,
    'Generate final determination and action plan',
    '',
    { temperature: 0.0, responseMimeType: 'application/json', onRetry }
  );

  let finalDetermination: any;
  try {
    const parsed = JSON.parse(step5Response);

    // ── Sanitise SCOMET block ─────────────────────────────────────────────
    const scometRaw = parsed.scomet || {};
    const scometCat = typeof scometRaw.category === 'string' ? scometRaw.category : 'Determination Pending';
    const scometCatLower = scometCat.toLowerCase();
    const scometControlled: boolean | null = (() => {
      if (scometCatLower.includes('pending') || scometCatLower.includes('determination')) return null;
      if (typeof scometRaw.controlled === 'boolean') return scometRaw.controlled;
      return false;
    })();
    // Normalise confidence — prefer scomet.confidence field, fall back to parsing the finding text
    const scometConfidence = normaliseConfidence(
      typeof scometRaw.confidence === 'string' ? scometRaw.confidence : undefined
    );

    // ── Sanitise EAR block ────────────────────────────────────────────────
    const earRaw = parsed.ear || {};
    const earEccn = typeof earRaw.eccn === 'string' ? earRaw.eccn : 'Jurisdiction Pending';
    const earControlled: boolean = typeof earRaw.controlled === 'boolean' ? earRaw.controlled : false;
    // EAR confidence floor: if EAR is definitively controlled (earControlled===true) and
    // FDPR/jurisdiction is confirmed, confidence must be at least MEDIUM — never LOW.
    const earConfRaw = normaliseConfidence(
      typeof earRaw.confidence === 'string' ? earRaw.confidence : undefined
    );
    const earConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = earControlled && earConfRaw === 'LOW'
      ? 'MEDIUM'
      : earConfRaw;

    // ── Derive riskLevel deterministically ───────────────────────────────
    // Do NOT trust the LLM's riskLevel verbatim — it fluctuates across runs.
    // Instead derive it from the structured controlled flags which are more stable.
    const derivedRisk = deriveRiskLevel(scometControlled, earControlled);

    finalDetermination = {
      // Use derived risk so it's stable across consecutive runs
      riskLevel: derivedRisk,
      summary: typeof parsed.summary === 'string'
        ? parsed.summary
        : 'Classification completed. Please review findings below.',
      dualJurisdiction: typeof parsed.dualJurisdiction === 'boolean' ? parsed.dualJurisdiction : false,
      scomet: {
        controlled: scometControlled,
        category: scometCat,
        // Sanitise clause: extract only the clause identifier (e.g. "8A301.a"),
        // stripping any AI-generated free-text legal boilerplate that bleeds into this field.
        clause: (() => {
          const raw = typeof scometRaw.clause === 'string' ? scometRaw.clause.trim() : '';
          if (!raw || raw === 'N/A') return 'N/A';
          // Match clause patterns: 8A301.a, 3A001.a.7, 9A515.e, Category 6A, etc.
          const match = raw.match(/\b(\d[A-Z]\d{3}(?:\.[a-z]\d?(?:\.\d+)?)?|Category\s+\d[A-Z]\d*[a-z]?)/i);
          if (match) return match[0];
          // If the field is a short pure identifier (≤30 chars, no sentence punctuation), keep it
          if (raw.length <= 30 && !/[.,;].*[.,;]/.test(raw)) return raw;
          // Otherwise it's a bloated text block — return just the first 30 chars + ellipsis
          return raw.substring(0, 30).replace(/\s+$/, '') + '…';
        })(),
        confidence: scometConfidence,
        citation: typeof scometRaw.citation === 'string' ? scometRaw.citation : 'N/A',
      },
      ear: {
        controlled: earControlled,
        eccn: earEccn,
        controls: typeof earRaw.controls === 'string' ? earRaw.controls : 'N/A',
        licenseException: typeof earRaw.licenseException === 'string' ? earRaw.licenseException : 'N/A',
        confidence: earConfidence,
        citation: typeof earRaw.citation === 'string' ? earRaw.citation : 'N/A',
      },
      actionPlan: Array.isArray(parsed.actionPlan)
        ? parsed.actionPlan.map((item: any) => ({
            priority: typeof item.priority === 'string' ? item.priority : 'P2',
            action: typeof item.action === 'string' ? item.action : String(item.action || 'Review required'),
            jurisdiction: typeof item.jurisdiction === 'string' ? item.jurisdiction : 'General',
            timeline: typeof item.timeline === 'string' ? item.timeline : 'As soon as possible',
          }))
        : [],
    };
  } catch (e) {
    if (!import.meta.env.PROD) {
      console.error('Failed to parse Step 5 JSON:', step5Response);
    }
    finalDetermination = {
      riskLevel: 'HIGH',
      summary: 'Classification analysis completed but the final determination could not be fully parsed. Please retry or consult legal counsel.',
      dualJurisdiction: false,
      scomet: { controlled: false, category: 'Determination Pending', clause: 'N/A', confidence: 'LOW', citation: 'N/A' },
      ear: { controlled: false, eccn: 'Jurisdiction Pending', controls: 'N/A', licenseException: 'N/A', confidence: 'LOW', citation: 'N/A' },
      actionPlan: [{
        priority: 'P1',
        action: 'Retry classification — the AI response was incomplete due to API instability.',
        jurisdiction: 'Both',
        timeline: 'Immediate'
      }],
    };
  }

  // ── Save to Supabase ────────────────────────────────────────────────────
  onProgress?.('Saving results...');
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id || 'anonymous';

  const { data: savedData, error } = await supabase
    .from('classification_results')
    .insert({
      user_id: userId,
      product_input: productInput,
      extracted_specs: extractedSpecs,
      scomet_finding: scometFinding,
      ear_finding: earFinding,
      cross_jurisdiction_note: crossJurisdictionNote,
      action_plan: JSON.stringify(finalDetermination.actionPlan || []),
      overall_risk: finalDetermination.riskLevel || 'Unknown',
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    if (!import.meta.env.PROD) {
      console.error('Failed to save classification result:', error);
    }
  }

  // The Entity List is for party screening (the Ask module / a dedicated screening feature),
  // not for product classification. It should never appear in classification citations.
  return {
    id: savedData?.id,
    extractedSpecs,
    scometFinding,
    earFinding,
    crossJurisdictionNote,
    finalDetermination,
    chunksUsed: deduplicateAndRankChunks(
      allChunks.filter((c: any) => c.document_name !== 'BIS_Entity_List_Part744'),
      4
    )
  };
}
