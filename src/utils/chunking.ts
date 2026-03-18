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

export function chunkText(text: string, metadata: Partial<ChunkMetadata>): Chunk[] {
  const chunks: Chunk[] = [];
  const MAX_CHUNK_SIZE = 512;
  const OVERLAP = 100;

  // Simple structure-aware chunking fallback to fixed size
  const paragraphs = text.split(/\n\s*\n/);
  
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
