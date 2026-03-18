export const GLOBAL_SYSTEM_PROMPT = `You are SemiShield, an AI-powered semiconductor trade compliance copilot.
Your primary function is to assist users in navigating semiconductor trade compliance across India SCOMET and US EAR/BIS regulations.

CRITICAL RULES:
1. GROUNDING: You must answer ONLY using the retrieved regulatory chunks and user-provided documents provided in the context. These chunks are retrieved via pgvector hybrid search (semantic + keyword RRF) using gemini-embedding-001 with outputDimensionality: 768. Do not use outside knowledge.
2. MISSING INFORMATION: If the answer cannot be determined from the retrieved documents, explicitly state: "I cannot find sufficient information in the provided regulatory documents to make a determination. Please consult a qualified export control attorney or contact DGFT/BIS directly."
3. CITATIONS: Every compliance claim MUST be cited using the exact format: [Source: DOCUMENT_NAME, Section X, Clause Y]. If you cannot cite it, do not claim it.
4. RISK RATING: You must provide a risk rating of 🔴 HIGH RISK, 🟠 MEDIUM RISK, or 🟢 LOW RISK.
5. CONFIDENCE SCORE: You must provide a confidence score (e.g., Confidence: 90% — HIGH / MEDIUM / LOW).
6. DUAL-JURISDICTION: Always handle dual-jurisdiction reasoning for India SCOMET and US EAR. If both apply, show separate findings for each and include a "⚠️ DUAL JURISDICTION ALERT: Both India SCOMET and US EAR apply. You must obtain separate authorizations from DGFT (India) AND BIS (US)."
7. DISCLAIMER: Always include the following legal disclaimer at the end of your response: "⚠️ LEGAL DISCLAIMER: SemiShield is an AI-generated tool for informational purposes only. It does not constitute legal advice. Verify all compliance determinations with a qualified export control attorney before making shipping, licensing, or contractual decisions."`;

export const QA_PROMPT = `Based on the provided context and user query, generate a response strictly following this format:

1. DIRECT ANSWER: (1-2 sentences summarizing the bottom line)
2. DETAILED ANALYSIS: (In-depth explanation with inline citations)
3. JURISDICTION BREAKDOWN:
   - 🇮🇳 SCOMET: (Findings specific to India)
   - 🇺🇸 EAR: (Findings specific to US)
4. ⚠️ DUAL JURISDICTION ALERT: (Include only if both jurisdictions apply)
5. ACTION REQUIRED: (Specific next steps for the user)
6. RISK RATING & CONFIDENCE: (e.g., 🔴 HIGH RISK | Confidence: 85% — HIGH)
7. CITATIONS: (Numbered list of all citations used)
8. DISCLAIMER: (Standard legal disclaimer)

USER QUERY: {{query}}
RETRIEVED CONTEXT:
{{context}}`;

export const CLASSIFICATION_CHAIN = {
  step1_extractSpecs: `Extract the technical specifications, product name, destination, end-use, and component origin from the provided datasheet text. Return the output as a structured JSON object.
DATASHEET TEXT:
{{text}}`,

  step2_classifyScomet: `Classify the following product specifications against the retrieved India SCOMET regulatory chunks. Determine if it is controlled, the category, clause, and provide citations.
PRODUCT SPECS: {{specs}}
SCOMET CONTEXT: {{scomet_context}}`,

  step3_classifyEar: `Classify the following product specifications against the retrieved US EAR/BIS regulatory chunks. Determine if it is controlled, the ECCN, controls, and provide citations.
PRODUCT SPECS: {{specs}}
EAR CONTEXT: {{ear_context}}`,

  step4_crossJurisdiction: `Perform a cross-jurisdiction analysis using the SCOMET classification and EAR classification results. Identify overlaps, conflicts, and determine if dual-jurisdiction rules apply. Remember to apply the more restrictive requirement if there is a conflict.
SCOMET RESULTS: {{scomet_results}}
EAR RESULTS: {{ear_results}}`,

  step5_finalDetermination: `Based on the cross-jurisdiction analysis, generate a final compliance determination and an action plan. Output the result as a JSON object containing riskLevel, scomet details, ear details, dualJurisdiction flag, and an actionPlan array.
ANALYSIS: {{analysis}}`
};

export const ICP_CHAIN = {
  step1_extractStructure: `Extract the structural elements, policies, and procedures from the provided Internal Compliance Program (ICP) document text.
Return the output as a structured JSON object representing the identified ICP components.
ICP TEXT: {{text}}`,

  step2_mapScomet: `Map the extracted ICP structure against the retrieved India SCOMET ICP requirements. Identify which requirements are met, partially met, or missing.
Return the output as a JSON object containing the SCOMET gap analysis.
ICP STRUCTURE: {{icp_structure}}
SCOMET CONTEXT: {{scomet_context}}`,

  step3_mapEar: `Map the extracted ICP structure against the retrieved US EAR/BIS ICP requirements. Identify which requirements are met, partially met, or missing.
Return the output as a JSON object containing the EAR gap analysis.
ICP STRUCTURE: {{icp_structure}}
EAR CONTEXT: {{ear_context}}`,

  step4_identifyGaps: `Analyze the SCOMET and EAR mapping results to identify all compliance gaps in the user's ICP against the 14 standard ICP components.
Return a unified gap list as a JSON array. Each object in the array MUST have exactly these fields:
- component (string, one of the 14 standard components)
- status (string: "Present", "Partial", or "Missing")
- jurisdiction (string: "SCOMET", "EAR", or "Both")
- priority (string: "P1", "P2", or "P3")
- gapDescription (string)
- citation (string)

SCOMET MAPPING: {{scomet_mapping}}
EAR MAPPING: {{ear_mapping}}`,

  step5_generateSop: `For each identified gap in the provided JSON array, generate ready-to-use Standard Operating Procedure (SOP) text that the user can insert into their ICP to achieve compliance.
Return the exact same JSON array, but add a "sopText" (string) field to each item containing the generated SOP language.
GAPS: {{gaps}}`,

  step6_buildFlow: `Build a recommended documentation flow output based on the gap analysis and generated SOPs.
Return a JSON array representing an ordered list of documentation steps. Each object MUST have:
- stepNumber (number)
- label (string)
- type (string: "Policy", "Procedure", "Record", or "Form")
- jurisdictionTags (array of strings: "SCOMET", "EAR", or both)

ANALYSIS DATA: {{analysis_data}}`
};

export const CONTRACT_CHAIN = {
  step1_extractClauses: `Extract all export control, end-use, re-export, force majeure, audit rights, and regulatory change clauses from the provided contract text.
Return a JSON array of extracted clause objects. Each object MUST have:
- clauseType (string)
- extractedText (string)
- pageReference (string)

CONTRACT TEXT: {{text}}`,

  step2_retrieveRequirements: `Identify the required legal clauses and stipulations based on the retrieved SCOMET and EAR regulatory chunks relevant to semiconductor trade contracts.
Return a JSON object listing the required regulatory clauses per jurisdiction.

REGULATORY CONTEXT: {{context}}`,

  step3_assessAdequacy: `Assess the adequacy of the extracted contract clauses against the required regulatory stipulations.
Assess each of these 6 clause categories:
1. Export Control Compliance
2. End-Use / End-User Statements
3. Re-Export Restrictions
4. Licensing Delay / Force Majeure
5. Audit / Compliance Cooperation Rights
6. Regulatory Change / Update Mechanism

Return a JSON array where each object represents one of the 6 categories and MUST have:
- category (string, one of the 6 categories above)
- status (string: "ADEQUATE", "WEAK", or "MISSING")
- extractedText (string, or null if missing)
- riskLevel (string: "HIGH", "MEDIUM", or "LOW")
- riskReason (string)
- jurisdiction (string)
- citation (string)

EXTRACTED CLAUSES: {{extracted_clauses}}
REQUIREMENTS: {{requirements}}`,

  step4_listGaps: `Filter the adequacy assessment to list only WEAK and MISSING clauses. Explain the specific risk if the clause remains missing or weak.
Return a JSON array of the filtered clauses with an added or updated 'riskReason' field.

ASSESSMENT: {{assessment}}`,

  step5_generateLanguage: `Generate ready-to-insert legal clause language for each missing or weak clause to ensure compliance with SCOMET and EAR.
Output the final result as a JSON object containing:
- riskScore (number, 0-100)
- riskLevel (string: "HIGH", "MEDIUM", or "LOW")
- summary (string)
- clauses (array of objects, where each object has: category, status, riskLevel, riskReason, citation, generatedClauseText)

GAPS: {{gaps}}`
};

export const REPORT_SYNTHESIS_PROMPT = `Synthesize the findings from the Product Classification, ICP Gap Analysis, and Contract Intelligence chains into a comprehensive final compliance report.

REQUIREMENTS:
1. Structure the output exactly as follows:
   - Executive Summary
   - Risk Overview
   - Jurisdiction Findings (India SCOMET & US EAR)
   - Gaps Identified
   - Recommended Actions
   - Full Citations
2. The overall Risk Level must be the HIGHEST risk found across all individual chains.
3. Calculate and include a Compliance Readiness Score (0-100).
4. Explicitly FLAG if immediate legal review is required based on critical gaps or high-risk classifications.

INPUT DATA:
CLASSIFICATION RESULTS: {{classification_results}}
ICP RESULTS: {{icp_results}}
CONTRACT RESULTS: {{contract_results}}`;
