/**
 * Cleans markdown content by removing legal disclaimers and internal AI reasoning sections.
 */
export function cleanContent(content: string): string {
  if (!content) return '';
  
  // Remove Legal Disclaimer (more robust regex)
  const disclaimerRegex = /⚠️\s*LEGAL\s*DISCLAIMER:[\s\S]*?It\s*does\s*not\s*constitute\s*legal\s*advice\.[\s\S]*?decisions\./gi;
  let cleaned = content.replace(disclaimerRegex, '');
  
  // Remove Old Dual Jurisdiction Banner (multiple variations)
  const oldBannerPatterns = [
    /⚠️\s*Dual\s*Jurisdiction\s*Alert\s*Both\s*India\s*SCOMET\s*and\s*US\s*EAR\s*apply\.\s*You\s*must\s*obtain\s*separate\s*authorizations\s*from\s*DGFT\s*\(India\)\s*AND\s*BIS\s*\(US\)\./gi,
    /⚠️\s*Dual\s*Jurisdiction\s*Alert\s*Both\s*India\s*SCOMET\s*and\s*US\s*EAR\s*apply\./gi,
    /You\s*must\s*obtain\s*separate\s*authorizations\s*from\s*DGFT\s*\(India\)\s*AND\s*BIS\s*\(US\)\./gi,
    /⚠️\s*Dual\s*Jurisdiction\s*Alert/gi
  ];
  oldBannerPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  // Remove RAG/Retrieval Debug Text
  const ragDebugPatterns = [
    /The\s*query\s*for\s*'.*?'\s*did\s*not\s*return\s*any\s*results\./gi,
    /The\s*retrieved\s*documents\s*pertained\s*to\s*.*?\./gi,
    /The\s*provided\s*context\s*consists\s*of\s*excerpts\s*from\s*.*?\./gi,
    /I\s*could\s*not\s*find\s*specific\s*information\s*regarding\s*.*?\s*in\s*the\s*provided\s*context\./gi,
    /Based\s*on\s*the\s*provided\s*context,\s*there\s*is\s*no\s*mention\s*of\s*.*?\./gi,
    /The\s*retrieved\s*text\s*does\s*not\s*contain\s*information\s*about\s*.*?\./gi,
    /The\s*search\s*for\s*.*?\s*yielded\s*no\s*direct\s*matches\s*in\s*the\s*regulatory\s*database\./gi,
    /No\s*specific\s*SCOMET\s*category\s*was\s*retrieved\s*for\s*this\s*product\./gi,
    /Based\s*on\s*the\s*retrieved\s*regulatory\s*chunks\.\.\./gi,
    /The\s*retrieved\s*documents\s*for\s*SCOMET\s*classification\.\.\./gi,
    /The\s*retrieved\s*documents\s*for\s*EAR\s*classification\.\.\./gi,
    /No\s*EAR\s*regulatory\s*text\s*was\s*retrieved\./gi,
    /The\s*provided\s*context\s*does\s*not\s*contain\s*specific\s*.*?\./gi,
    /Internal\s*retrieval\s*failures\.\.\./gi,
    /Search\s*queries\s*yielded\.\.\./gi,
    /The\s*retrieved\s*documents\s*pertained\s*to\s*the\s*classification\s*of\s*.*?\./gi,
    /The\s*provided\s*context\s*consists\s*of\s*excerpts\s*from\s*the\s*.*?\./gi,
    /\d*\.?\s*Silex\s*Query\s*Methodology.*?(?=\n\d*\.?\s*|$)/gis
  ];
  
  ragDebugPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Remove Silex Query Methodology section
  // It usually starts with "Silex Query Methodology" or "5. Silex Query Methodology"
  // and goes until the end of the content or another section.
  const methodologyRegex = /(?:^|\n)(?:#+\s*)?(?:\d+\.\s*)?Silex Query Methodology[\s\S]*?(?=\n(?:#+\s*)?(?:\d+\.\s*)?[A-Z]|$)/gi;
  cleaned = cleaned.replace(methodologyRegex, '');
  
  // Fix unclosed bold/italic markers at the start of lines (common in AI output for headings)
  // We split by lines to handle each line's markdown integrity
  cleaned = cleaned.split('\n').map(line => {
    const trimmed = line.trim();
    
    // Handle unclosed bold: starts with optional # then ** but only has one occurrence of **
    // Regex matches optional # and spaces, then **
    if (/^(?:#+\s*)?\*\*/.test(trimmed) && (line.match(/\*\*/g) || []).length === 1) {
      return line.replace('**', '');
    }
    
    // Handle unclosed italic: starts with optional # then * but only has one occurrence of *
    // We check that it's NOT a bullet point (bullet points have a space after *)
    if (/^(?:#+\s*)?\*/.test(trimmed) && !/^(?:#+\s*)?\*\s/.test(trimmed) && (line.match(/\*/g) || []).length === 1) {
      return line.replace('*', '');
    }
    
    return line;
  }).join('\n');

  return cleaned.trim();
}

/**
 * Extracts confidence level (HIGH, MEDIUM, LOW) from markdown content.
 * Looks for patterns like "Confidence: 95% — HIGH" or "Confidence: HIGH".
 */
export function extractConfidence(content: string): string | null {
  if (!content) return null;
  
  // Look for "Confidence: [X]% — HIGH/MEDIUM/LOW" or "Confidence: HIGH/MEDIUM/LOW"
  const confidenceRegex = /Confidence:\s*(?:\d+%\s*—\s*)?(HIGH|MEDIUM|LOW)/i;
  const match = content.match(confidenceRegex);
  
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  
  return null;
}
