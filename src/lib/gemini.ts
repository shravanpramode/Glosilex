import { GoogleGenAI } from '@google/genai';
import { embedText } from '../services/embeddings';
import { getSupabase } from '../services/supabase';
import { GLOBAL_SYSTEM_PROMPT, QA_PROMPT } from './prompts';

export const getGemini = () => new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY
});

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

  const chat = ai.chats.create({
    model: 'gemini-2.5-pro',
    config
  });

  const response = await chat.sendMessage({ message: userPrompt });
  return response.text || '';
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
  const formattedContext = retrievedChunks.map((chunk: any) =>
    `[Source: ${chunk.document_name} | Section: ${chunk.section} | Clause: ${chunk.clause_id}]\n${chunk.content}`
  ).join('\n\n');

  const systemPrompt = `${GLOBAL_SYSTEM_PROMPT}\n\n${QA_PROMPT}`;
  const answer = await callGemini(systemPrompt, query, formattedContext);

  return { answer, chunks: retrievedChunks };
}
