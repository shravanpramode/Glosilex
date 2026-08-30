import { embedText } from './embeddings';
import { getSupabase } from './supabase';

export async function detectJurisdiction(queryText: string): Promise<string[]> {
  const scomet_keywords = ['scomet', 'dgft', 'ftdr', 'category 7', 'category 1', 'category 2', 'mea india'];
  const ear_keywords = ['ear', 'bis', 'eccn', 'ear99', 'ccl', 'entity list', 'chips act', 'bureau of industry', 'us export'];
  const itar_keywords = ['itar', 'usml', 'ddtc', 'munitions', 'defense article', 'defence article',
                         'technical data', 'commodity jurisdiction', 'state department', 'brokering',
                         'defense service', 'defence service', 'taa', 'manufacturing license agreement'];
  const lower = queryText.toLowerCase();

  const hasScomet = scomet_keywords.some(k => lower.includes(k));
  const hasEar = ear_keywords.some(k => lower.includes(k));
  const hasItar = itar_keywords.some(k => lower.includes(k));

  const matched: string[] = [];
  if (hasScomet) matched.push('SCOMET_INDIA');
  if (hasEar) matched.push('EAR_US');
  if (hasItar) matched.push('ITAR_US');

  // ITAR is deliberately NOT in the fallback. It is a narrow regime covering
  // defense articles, and pulling 1,780 munitions-list chunks into an ordinary
  // dual-use question would crowd out the EAR and SCOMET text that actually
  // answers it. It joins the search only when the question asks for it, or the
  // user ticks it explicitly.
  return matched.length ? matched : ['SCOMET_INDIA', 'EAR_US'];
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

/**
 * Retrieve separately for each jurisdiction, then merge.
 *
 * A single pooled call asks hybrid_search for the global top-K across every
 * selected regime, so the regimes compete for the same slots. Observed on
 * "What is a defense article under the USML?":
 *
 *   ITAR only  -> 12 ITAR chunks -> a full, well-cited definition
 *   all three  -> 12 chunks split across SCOMET, EAR and ITAR
 *                 -> "I cannot find sufficient information"
 *
 * Selecting MORE jurisdictions produced a WORSE answer, which is the opposite
 * of what the toggle appears to promise. Giving each regime its own budget
 * fixes that: adding a jurisdiction can now only add context, never displace
 * it. This is how the Classify module has always worked.
 */
export async function retrievePerJurisdiction(
  queryText: string,
  jurisdictions: string[],
  perJurisdiction?: number
) {
  if (jurisdictions.length <= 1) {
    return retrieveChunks(queryText, jurisdictions, perJurisdiction ?? 12);
  }
  const budget = perJurisdiction ?? 8;
  const results = await Promise.all(
    jurisdictions.map(j =>
      retrieveChunks(queryText, [j], budget).catch(() => [] as any[])
    )
  );
  const merged = results.flat();
  if (merged.length === 0) {
    throw new Error(
      'Retrieved 0 regulatory chunks for jurisdictions [' + jurisdictions.join(', ') + ']. ' +
      'Refusing to answer without grounding.'
    );
  }
  return merged;
}

export function formatRetrievedContext(chunks: any[]): string {
  return chunks.map((chunk, i) => 
    `[RETRIEVED CHUNK ${i+1}]\n` +
    `[Source: ${chunk.document_name}, ${chunk.section}, ${chunk.clause_id}]\n` +
    `${chunk.content}\n`
  ).join('\n---\n');
}
