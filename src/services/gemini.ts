import { GoogleGenAI } from '@google/genai';

let geminiInstance: GoogleGenAI | null = null;

export const getGemini = () => {
  if (geminiInstance) return geminiInstance;
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key not found in environment.');
  }
  geminiInstance = new GoogleGenAI({ apiKey });
  return geminiInstance;
};

export const clearGeminiInstance = () => {
  geminiInstance = null;
};
