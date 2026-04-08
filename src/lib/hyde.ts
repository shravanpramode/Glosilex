import { callGemini } from './gemini';

const HYDE_SYSTEM = `You are a regulatory document assistant. 
Given a compliance topic, generate a realistic 3-4 sentence excerpt from 
an actual regulatory guideline or control list that would be authoritative 
on that topic. Write it as if it were an excerpt from the real document — 
use formal regulatory language with clause-style numbering where appropriate. 
Do NOT add any explanation or preamble. Output only the excerpt text.`;

export async function generateHypotheticalDoc(topic: string): Promise<string> {
  try {
    const result = await callGemini(HYDE_SYSTEM, topic, '', { temperature: 0.2 });
    return result.trim();
  } catch {
    // If HyDE generation fails, fall back to the original topic string
    return topic;
  }
}