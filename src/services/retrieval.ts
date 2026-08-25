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

  // A grounded answer with zero grounding is worse than no answer at all: the
  // model falls back on parametric knowledge, sounds just as confident, and
  // produces an uncited determination a compliance officer might act on.
  //
  // RLS denials do not surface as errors here — Postgres returns an empty set,
  // so the error object stays null and the failure is completely silent. That is how the
  // corpus stayed invisible to production for three months without a single
  // alarm. Retrieving nothing is now a hard failure.
  const chunks = data || [];
  if (chunks.length === 0) {
    throw new Error(
      'Retrieved 0 regulatory chunks for jurisdictions [' + jurisdictions.join(', ') + ']. ' +
      'Refusing to answer without grounding. Check that the corpus is populated and ' +
      'that the current role can read regulatory_chunks.'
    );
  }

  return chunks;
}

export function formatRetrievedContext(chunks: any[]): string {
  return chunks.map((chunk, i) => 
    `[RETRIEVED CHUNK ${i+1}]\n` +
    `[Source: ${chunk.document_name}, ${chunk.section}, ${chunk.clause_id}]\n` +
    `${chunk.content}\n`
  ).join('\n---\n');
}
