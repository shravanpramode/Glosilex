import { getGemini } from '../services/gemini';
export { getGemini };
import { embedText } from '../services/embeddings';
import { getSupabase } from '../services/supabase';
import { GLOBAL_SYSTEM_PROMPT, QA_PROMPT } from './prompts';


// ── Change this one constant to switch models across the entire app ────────────
const GEMINI_MODEL = 'gemini-2.5-flash';
// ─────────────────────────────────────────────────────────────────────────────

// ── Retry helper ──────────────────────────────────────────────────────────────
// No TypeScript generics used — takes and returns Promise<string> directly.
// Retries on 503 UNAVAILABLE and 429 RESOURCE_EXHAUSTED with exponential backoff.
// Attempt schedule: instant → wait 3s → wait 9s → wait 27s → throw
async function callWithRetry(fn: () => Promise<string>): Promise<string> {
  const BASE_DELAY_MS = 3000;
  const MAX_ATTEMPTS = 4;
  let lastError: any;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg: string = (err && err.message) ? err.message : JSON.stringify(err);

      const isRetryable = (
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED')
      );

      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        throw err;
      }

      // Jitter ±20% so parallel chain steps don't all hammer the API at once
      const jitter = 0.8 + Math.random() * 0.4;
      const delayMs = BASE_DELAY_MS * Math.pow(3, attempt - 1) * jitter;
      const label = msg.includes('429') ? '429 rate-limit' : '503 unavailable';
      console.warn(
        '[Silex] Gemini ' + label + ' — retrying in ' +
        Math.round(delayMs / 1000) + 's (attempt ' + attempt + '/' + MAX_ATTEMPTS + ')'
      );
      await new Promise(function(resolve) { setTimeout(resolve, delayMs); });
    }
  }

  throw lastError;
}
// ─────────────────────────────────────────────────────────────────────────────

export async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  retrievedChunks: string,
  options?: { temperature?: number, responseMimeType?: string }
): Promise<string> {
  const ai = getGemini();

  const fullSystemPrompt = retrievedChunks
    ? `${systemPrompt}\n\nRETRIEVED CONTEXT:\n${retrievedChunks}`
    : systemPrompt;

  const config: any = {
    systemInstruction: fullSystemPrompt,
    temperature: options?.temperature ?? 0.1,
  };
  if (options?.responseMimeType) {
    config.responseMimeType = options.responseMimeType;
  }

  return callWithRetry(function() {
    const chat = ai.chats.create({
      model: GEMINI_MODEL,
      config
    });
    return chat.sendMessage({ message: userPrompt }).then(function(response) {
      const text = response.text || '';
      if (!text.trim()) {
        throw new Error('[Silex] Gemini returned an empty response — possible safety filter or token limit.');
      }
      return text;
    });
  });
}

export async function retrieveAndAnswer(
  query: string,
  jurisdictions: string[],
  matchCount: number = 12
): Promise<{ answer: string; chunks: any[] }> {
  const supabase = getSupabase();
  const queryEmbedding = await embedText(query);

  const { data: chunks } = await supabase.rpc('hybrid_search', {
    query_embedding: queryEmbedding,
    query_text: query,
    jurisdiction_filter: jurisdictions,
    match_count: matchCount
  });

  const retrievedChunks = chunks || [];
  
  // Sanitize context: remove potential prompt injection triggers or excessive whitespace
  const formattedContext = retrievedChunks.map((chunk: any) => {
    const sanitizedContent = chunk.content
      .replace(/<\|.*?\|>/g, '') // Remove potential control tokens
      .replace(/\[\[.*?\]\]/g, '') // Remove potential internal markers
      .trim();
    return `[Source: ${chunk.document_name} | Section: ${chunk.section} | Clause: ${chunk.clause_id}]\n${sanitizedContent}`;
  }).join('\n\n');

  const systemPrompt = `${GLOBAL_SYSTEM_PROMPT}\n\n${QA_PROMPT}`;
  const answer = await callGemini(systemPrompt, query, formattedContext);

  return { answer, chunks: retrievedChunks };
}