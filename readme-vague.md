# Glosilex: Developer Implementation Guide & Technical Documentation

Glosilex is an AI-powered compliance copilot for semiconductor trade controls, specifically targeting **India SCOMET** and **US EAR**. This document provides a deep dive into the architecture, implementation logic, and deployment requirements for developers.

---

## 1. Core Architecture

Glosilex is built as a **Single Page Application (SPA)** with a **Serverless RAG (Retrieval-Augmented Generation)** backend.

### Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS.
- **AI Reasoning**: Google Gemini 2.5 Flash (via `@google/genai`).
- **Embeddings**: Google `gemini-embedding-001` (768 dimensions).
- **Vector Database**: Supabase (PostgreSQL + `pgvector`).
- **Hybrid Search**: Custom Reciprocal Rank Fusion (RRF) combining vector similarity and keyword matching.

### Data Flow
1. **User Input**: User provides a query, datasheet, or contract.
2. **Retrieval**: 
   - Query is embedded.
   - `hybrid_search` RPC is called in Supabase to fetch relevant regulatory chunks from `regulatory_chunks`.
3. **Reasoning**: Gemini receives the user input + retrieved chunks + strict system prompts.
4. **Output**: Gemini generates a cited, risk-rated response.
5. **Persistence**: Results are saved to Supabase tables (`classification_results`, `icp_results`, etc.).

---

## 2. RAG Pipeline Implementation

### Chunking & Ingestion (`ingest.js`)
- **Strategy**: Structure-aware chunking.
- **Target Size**: ~512 characters with 100-character overlap.
- **Metadata**: Each chunk stores `document_name`, `jurisdiction`, `section`, `clause_id`, and `content`.
- **Embeddings**: Generated using `gemini-embedding-001`.

### Hybrid Search (`hybrid_search.sql`)
The search logic uses a weighted combination:
- **Semantic Search**: 70% weight (Cosine similarity).
- **Keyword Search**: 30% weight (Full-text search on `content`).
- **Implementation**: A PostgreSQL function `hybrid_search` that returns the top-K chunks.

---

## 3. Module Logic & Services

### 🛡️ Product Classification (`classificationService.ts`)
- **Chain**: 
  1. Extract specs from text/PDF.
  2. Build SCOMET/EAR queries.
  3. Retrieve regulatory context.
  4. Perform cross-jurisdiction classification.
- **Deterministic Scoring**: Risk levels (HIGH/MEDIUM/LOW) are normalized in code based on AI-detected "controlled" flags.

### 💬 Compliance Q&A (`Ask.tsx`)
- **Jurisdiction Detection**: Uses `detectJurisdiction` service to automatically filter retrieval based on query intent.
- **Citations**: Uses `parseCitations` utility to extract `[Source: ...]` patterns and render them as interactive accordions.
- **Dual Jurisdiction Alert**: Triggered when both SCOMET and EAR are implicated.

### 📊 ICP Gap Analyzer (`icpService.ts`)
- **Audit Framework**: Evaluates 14 canonical ICP components (Management Commitment, Training, Recordkeeping, etc.).
- **Scoring**: Calculates separate SCOMET and EAR compliance scores.
- **Documentation Flow**: Generates a prioritized list of required documents (Policies, Procedures, Records).

### 📜 Contract Intelligence (`contractService.ts`)
- **Audit Logic**: 
  1. Extract existing clauses.
  2. Compare against retrieved regulatory requirements.
  3. Assess adequacy (ADEQUATE/WEAK/MISSING).
  4. Generate remedial clause text.

---

## 4. Database Schema

The project includes several SQL files in the root for schema setup:
- `hybrid_search.sql`: The RAG search function.
- `classification_results.sql`: Table for classification history.
- `icp_results.sql`: Table for ICP audits.
- `contract_results.sql`: Table for contract reviews.
- `reports.sql`: Table for shareable compliance reports.
- `supabase_security.sql`: **CRITICAL** Row Level Security (RLS) policies.

---

## 5. Security & Compliance Controls

### Hallucination Guards (`prompts.ts`)
- **Grounding**: The `GLOBAL_SYSTEM_PROMPT` forbids answering outside the provided context.
- **Citations**: Every claim MUST include a source citation.
- **Risk Rating**: Every response MUST end with a standardized risk badge and confidence score.

### Data Privacy
- **RLS**: All tables are scoped by `user_id`. Currently, `user_id` defaults to `'anonymous'` as the app is in pre-auth phase.
- **Input Sanitization**: `classificationService.ts` implements length limits to prevent prompt injection and resource exhaustion.

---

## 6. Developer Setup Directions

### 1. Supabase Configuration
1. Create a new Supabase project.
2. Enable `pgvector` extension.
3. Run all `.sql` files in the SQL Editor (start with `hybrid_search.sql` and `supabase_security.sql`).
4. Create a table `regulatory_chunks` with a `vector(768)` column named `embedding`.

### 2. Environment Variables
Copy `.env.example` to `.env` and provide:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`

### 3. Ingestion
Run the ingestion script to populate the knowledge base:
```bash
node ingest.js
```

### 4. Local Development
```bash
npm install
npm run dev
```

---

## 7. Future Roadmap for Developers
- **Authentication**: Integrate Supabase Auth to replace `'anonymous'` user scoping.
- **PDF Parsing**: Enhance `pdfParser.ts` for complex table extraction in datasheets.
- **Jurisdictions**: Add EU Dual-Use and UK Export Control modules by updating the `jurisdiction_filter` in retrieval services.

---

**⚠️ LEGAL DISCLAIMER**: This tool is for informational purposes only. All compliance determinations must be verified by a qualified export control attorney.
