import { getGemini } from './gemini';

export async function embedText(text: string): Promise<number[]> {
  try {
    const ai = getGemini();
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: [text],
      config: { outputDimensionality: 768 }
    });
    const values = result.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
      throw new Error('Empty embedding returned from API');
    }
    return values;
  } catch (error: any) {
    const message = error?.message || error?.toString() || 'Unknown error';
    throw new Error(`Failed to generate embedding: ${message}`);
  }
}
