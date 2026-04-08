import fs from 'fs';
import PDFParser from 'pdf2json';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Parse CLI args
const args = process.argv.slice(2);
const params = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    params[args[i].substring(2)] = args[i + 1];
    i++;
  }
}

const { file, name, jurisdiction, date, url, skip } = params;
const SKIP_CHUNKS = parseInt(skip || '0', 10);


if (!file || !name || !jurisdiction) {
  console.error("Usage: node ingest.js --file <path> --name <name> --jurisdiction <SCOMET_INDIA|EAR_US> [--date <date>] [--url <url>]");
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error("Missing required environment variables (SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY). Please set them in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function cleanText(text) {
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

function chunkText(text, jurisdiction) {
  text = cleanText(text);
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

async function main() {
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }
  
  

const fileExt = file.split('.').pop().toLowerCase();
  console.log(`Reading ${fileExt.toUpperCase()}: ${file}`);

  const text = fileExt === 'txt' || fileExt === 'csv'
    ? fs.readFileSync(file, 'utf8')
    : await new Promise((resolve, reject) => {
        const parser = new PDFParser(null, 1);
        parser.on('pdfParser_dataReady', () => {
          resolve(parser.getRawTextContent());
        });
        parser.on('pdfParser_dataError', (err) => {
          reject(err.parserError);
        });
        parser.loadPDF(file);
      });



  console.log(`Chunking text...`);
  const chunks = chunkText(text, jurisdiction);
  console.log(`Generated ${chunks.length} chunks.`);

  let currentSection = "General";

  
for (let i = 0; i < chunks.length; i++) {
  if (i < SKIP_CHUNKS) {
    console.log(`Skipping chunk ${i + 1} (already ingested)`);
    continue;
  }
  const chunk = chunks[i];


    // Extract clause ID
    let clause_id = null;
    const scometMatch = chunk.match(/^(\d[A-Z]\d{3}[a-z]?\.)/);
    const earMatch = chunk.match(/^([0-9][A-Z][0-9]{3}\.[a-z]\.[0-9]+)/);

    if (scometMatch) clause_id = scometMatch[1];
    else if (earMatch) clause_id = earMatch[1];

    // Auto-detect category
    let category = "Unknown";
    if (clause_id) {
      category = "Category " + clause_id.charAt(0);
    }

    // Update section if we see something that looks like a header (heuristic)
    if (chunk.match(/^[A-Z\s]{10,}/)) {
       currentSection = chunk.match(/^[A-Z\s]{10,}/)[0].trim();
    }

    const metadata = {
      date_updated: date || new Date().toISOString().split('T')[0],
      source_url: url || ""
    };

    // Embed using Google gemini-embedding-001
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: chunk }] },
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

    // Insert into Supabase
    const { error } = await supabase.from('regulatory_chunks').insert({
      document_name: name,
      jurisdiction,
      category,
      section: currentSection,
      clause_id,
      content: chunk,
      embedding,
      metadata
    });

    if (error) {
      console.error(`Supabase insert error for chunk ${i + 1}:`, error.message);
    } else {
      console.log(`Ingested chunk ${i + 1} of ${chunks.length} — [${clause_id || 'No Clause ID'}]`);
    }

    // Rate limiting (1 second delay)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("Ingestion complete.");
}

main().catch(console.error);
