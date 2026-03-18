export function parseCitations(text: string) {
  const citationRegex = /\[Source:\s*(.*?),\s*(.*?),\s*(.*?)\]/g;
  const citations = [];
  let match;
  
  while ((match = citationRegex.exec(text)) !== null) {
    citations.push({
      document_name: match[1].trim(),
      section: match[2].trim(),
      clause_id: match[3].trim(),
    });
  }
  
  return citations;
}
