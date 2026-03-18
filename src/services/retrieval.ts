import { embedText } from './embeddings';
import { getSupabase } from './supabase';

export async function detectJurisdiction(queryText: string): Promise<string[]> {
  const scomet_keywords = ['scomet', 'dgft', 'ftdr', 'category 7', 'category 1', 'category 2', 'mea india'];
  const ear_keywords = ['ear', 'bis', 'eccn', 'ear99', 'ccl', 'entity list', 'chips act', 'bureau of industry', 'us export'];
  const lower = queryText.toLowerCase();
  
  const hasScomet = scomet_keywords.some(k => lower.includes(k));
  const hasEar = ear_keywords.some(k => lower.includes(k));

  if (hasScomet && !hasEar) return ['SCOMET_INDIA'];
  if (hasEar && !hasScomet) return ['EAR_US'];
  return ['SCOMET_INDIA', 'EAR_US'];
}

export async function retrieveChunks(queryText: string, jurisdictions: string[], topK = 5) {
  const queryEmbedding = await embedText(queryText);
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('hybrid_search', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    jurisdiction_filter: jurisdictions,
    match_count: topK
  });

  if (error) {
    console.error('Supabase hybrid_search error:', error);
    throw new Error('Retrieval failed');
  }

  return data || [];
}

export function formatRetrievedContext(chunks: any[]): string {
  return chunks.map((chunk, i) => 
    `[RETRIEVED CHUNK ${i+1}]\n` +
    `[Source: ${chunk.document_name}, ${chunk.section}, ${chunk.clause_id}]\n` +
    `${chunk.content}\n`
  ).join('\n---\n');
}
