export interface ChunkMetadata {
  document_name: string;
  jurisdiction: string;
  category: string;
  section: string;
  clause_id: string;
  page: number;
  date_updated: string;
  source_url: string;
}

export interface Chunk {
  content: string;
  metadata: ChunkMetadata;
}

export function cleanText(text: string): string {
  let cleaned = text;
  
  // 1. Remove all page break markers matching the pattern: "----------------Page (X) Break----------------"
  cleaned = cleaned.replace(/-+Page \(\d+\) Break-+/gi, '');
  
  // 2. Remove sequences of 3 or more consecutive dashes: ---
  cleaned = cleaned.replace(/-{3,}/g, '');
  
  // 3. Remove repeated underscores of 5 or more: _____
  cleaned = cleaned.replace(/_{5,}/g, '');
  
  // 4. Normalize multiple blank lines to single blank lines
  cleaned = cleaned.replace(/\n[ \t]*\n([ \t]*\n)+/g, '\n\n');
  
  // 5. Trim leading/trailing whitespace
  return cleaned.trim();
}

export function chunkText(text: string, metadata: Partial<ChunkMetadata>): Chunk[] {
  const chunks: Chunk[] = [];
  const MAX_CHUNK_SIZE = 512;
  const OVERLAP = 100;

  // Clean the text before chunking
  const cleanedText = cleanText(text);

  // Simple structure-aware chunking fallback to fixed size
  const paragraphs = cleanedText.split(/\n\s*\n/);
  
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > MAX_CHUNK_SIZE) {
      if (currentChunk) {
        chunks.push({
          content: currentChunk.trim(),
          metadata: { ...metadata } as ChunkMetadata
        });
        // Start new chunk with overlap
        const overlapText = currentChunk.slice(-OVERLAP);
        currentChunk = overlapText + ' ' + para;
      } else {
        // Paragraph itself is larger than max chunk size
        let i = 0;
        while (i < para.length) {
          chunks.push({
            content: para.slice(i, i + MAX_CHUNK_SIZE).trim(),
            metadata: { ...metadata } as ChunkMetadata
          });
          i += MAX_CHUNK_SIZE - OVERLAP;
        }
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      metadata: { ...metadata } as ChunkMetadata
    });
  }

  return chunks;
}
