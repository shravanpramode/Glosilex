import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function cleanText(text) {
  let cleaned = text;
  cleaned = cleaned.replace(/-+Page \(\d+\) Break-+/gi, '');
  cleaned = cleaned.replace(/-{3,}/g, '');
  cleaned = cleaned.replace(/_{5,}/g, '');
  cleaned = cleaned.replace(/\n[ \t]*\n([ \t]*\n)+/g, '\n\n');
  return cleaned.trim();
}

function chunkText(text, jurisdiction) {
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ');

  const scometRegex = /(\d[A-Z]\d{3}[a-z]?\.)/;
  const earRegex = /([0-9][A-Z][0-9]{3}\.[a-z]\.[0-9]+)/;

  const regex = jurisdiction === 'SCOMET_INDIA' ? scometRegex :
                jurisdiction === 'EAR_US' ? earRegex :
                new RegExp(`(${scometRegex.source}|${earRegex.source})`);

  // Split keeping the delimiter at the start of the chunk using lookahead
  const parts = text.split(new RegExp(`(?=${regex.source})`, 'g'));

  let chunks = [];
  let currentChunk = "";

  // Merge chunks < 100 characters
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i].trim();
    if (!part) continue;

    if (currentChunk.length < 100) {
      currentChunk += (currentChunk ? " " : "") + part;
    } else {
      chunks.push(currentChunk);
      currentChunk = part;
    }
  }
  if (currentChunk) {
    if (currentChunk.length < 100 && chunks.length > 0) {
      chunks[chunks.length - 1] += " " + currentChunk;
    } else {
      chunks.push(currentChunk);
    }
  }

  // Handle chunks > 512 characters
  const finalChunks = [];
  const MAX_LEN = 512;
  const OVERLAP = 100;

  for (const chunk of chunks) {
    if (chunk.length > MAX_LEN) {
      let start = 0;
      while (start < chunk.length) {
        let end = Math.min(start + MAX_LEN, chunk.length);
        // Try to break at a space if not at the very end
        if (end < chunk.length) {
          const lastSpace = chunk.lastIndexOf(' ', end);
          if (lastSpace > start + OVERLAP) {
            end = lastSpace;
          }
        }
        finalChunks.push(chunk.substring(start, end).trim());
        start = end - OVERLAP;
        if (start < 0) start = 0;
        if (end === chunk.length) break;
      }
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks;
}

// Reconstruct text from chunks by removing overlap
function reconstructText(chunks) {
  if (chunks.length === 0) return "";
  let fullText = chunks[0].content;
  for (let i = 1; i < chunks.length; i++) {
    const prev = fullText;
    const curr = chunks[i].content;
    
    // Find the maximum overlap between the end of prev and the start of curr
    // Overlap can be up to 150 characters
    let maxOverlap = 0;
    const minLen = Math.min(prev.length, curr.length, 200);
    
    for (let len = 1; len <= minLen; len++) {
      if (prev.substring(prev.length - len) === curr.substring(0, len)) {
        maxOverlap = len;
      }
    }
    
    if (maxOverlap > 0) {
      fullText += curr.substring(maxOverlap);
    } else {
      // If no exact overlap found, maybe just append with a space
      fullText += " " + curr;
    }
  }
  return fullText;
}

async function main() {
  console.log("Fetching all chunks from Supabase...");
  
  // Fetch all chunks
  let allChunks = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('regulatory_chunks')
      .select('*')
      .order('id', { ascending: true }) // Assuming id is sequential or we can order by created_at if it exists
      .range(page * pageSize, (page + 1) * pageSize - 1);
      
    if (error) {
      console.error("Error fetching chunks:", error);
      process.exit(1);
    }
    
    if (!data || data.length === 0) break;
    
    allChunks = allChunks.concat(data);
    page++;
  }
  
  console.log(`Fetched ${allChunks.length} chunks.`);
  
  // Group by document_name
  const chunksByDoc = {};
  for (const chunk of allChunks) {
    if (!chunksByDoc[chunk.document_name]) {
      chunksByDoc[chunk.document_name] = [];
    }
    chunksByDoc[chunk.document_name].push(chunk);
  }
  
  for (const [docName, chunks] of Object.entries(chunksByDoc)) {
    if (docName === 'SCOMET_List_2025') {
      console.log(`Re-chunking and re-embedding ${docName}...`);
      
      // Reconstruct full text
      const fullText = reconstructText(chunks);
      const cleanedText = cleanText(fullText);
      
      // Re-chunk
      const newChunks = chunkText(cleanedText, chunks[0].jurisdiction);
      
      console.log(`Generated ${newChunks.length} new chunks for ${docName}. Deleting old chunks...`);
      
      // Delete old chunks
      const { error: deleteError } = await supabase
        .from('regulatory_chunks')
        .delete()
        .eq('document_name', docName);
        
      if (deleteError) {
        console.error(`Error deleting old chunks for ${docName}:`, deleteError);
        continue;
      }
      
      // Embed and insert new chunks
      let currentSection = "General";
      for (let i = 0; i < newChunks.length; i++) {
        const chunkContent = newChunks[i];
        
        let clause_id = null;
        const scometMatch = chunkContent.match(/^(\d[A-Z]\d{3}[a-z]?\.)/);
        const earMatch = chunkContent.match(/^([0-9][A-Z][0-9]{3}\.[a-z]\.[0-9]+)/);

        if (scometMatch) clause_id = scometMatch[1];
        else if (earMatch) clause_id = earMatch[1];

        let category = "Unknown";
        if (clause_id) {
          category = "Category " + clause_id.charAt(0);
        }

        if (chunkContent.match(/^[A-Z\s]{10,}/)) {
           currentSection = chunkContent.match(/^[A-Z\s]{10,}/)[0].trim();
        }
        
        const metadata = chunks[0].metadata || {
          date_updated: new Date().toISOString().split('T')[0],
          source_url: ""
        };
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: "models/gemini-embedding-001",
            content: { parts: [{ text: chunkContent }] },
            outputDimensionality: 768
          })
        });

        if (!response.ok) {
          const err = await response.text();
          console.error(`Failed to embed chunk ${i + 1}:`, err);
          continue;
        }

        const embedData = await response.json();
        const embedding = embedData.embedding.values;

        const { error: insertError } = await supabase.from('regulatory_chunks').insert({
          document_name: docName,
          jurisdiction: chunks[0].jurisdiction,
          category,
          section: currentSection,
          clause_id,
          content: chunkContent,
          embedding,
          metadata
        });

        if (insertError) {
          console.error(`Supabase insert error for chunk ${i + 1}:`, insertError.message);
        } else {
          console.log(`Ingested chunk ${i + 1} of ${newChunks.length} — [${clause_id || 'No Clause ID'}]`);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } else {
      console.log(`Cleaning existing chunks for ${docName}...`);
      let updatedCount = 0;
      for (const chunk of chunks) {
        const cleaned = cleanText(chunk.content);
        if (cleaned !== chunk.content) {
          const { error: updateError } = await supabase
            .from('regulatory_chunks')
            .update({ content: cleaned })
            .eq('id', chunk.id);
            
          if (updateError) {
            console.error(`Error updating chunk ${chunk.id}:`, updateError);
          } else {
            updatedCount++;
          }
        }
      }
      console.log(`Updated ${updatedCount} chunks for ${docName}.`);
    }
  }
  
  console.log("Database cleaning complete.");
}

main().catch(console.error);
