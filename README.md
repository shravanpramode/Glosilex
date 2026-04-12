# Glosilex — AI-Powered Semiconductor Trade Compliance Copilot

![Glosilex Banner](glosilex-banner.png)

> **AI copilot for India SCOMET and US EAR/BIS export control compliance — built for semiconductor companies, defence exporters, and trade compliance professionals.**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features & Modules](#2-features--modules)
3. [System Architecture](#3-system-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Project File Structure](#5-project-file-structure)
6. [Supabase Database Setup](#6-supabase-database-setup)
   - [Prerequisites](#prerequisites)
   - [Table Schemas](#table-schemas)
   - [Hybrid Search Function](#hybrid-search-function)
   - [Row Level Security (RLS)](#row-level-security-rls)
7. [Regulatory Data Ingestion](#7-regulatory-data-ingestion)
8. [Environment Variables](#8-environment-variables)
9. [Local Development Setup](#9-local-development-setup)
10. [Vercel Deployment](#10-vercel-deployment)
11. [Key Technical Design Decisions](#11-key-technical-design-decisions)
12. [Module Deep-Dive](#12-module-deep-dive)
13. [Security Notes](#13-security-notes)
14. [Regulatory Coverage](#14-regulatory-coverage)
15. [Roadmap / Known TODOs](#15-roadmap--known-todos)
16. [Contributing](#16-contributing)
17. [Final Bug & Issue Verification Status](#17-final-bug--issue-verification-status)
18. [License](#18-license)

---

## 1. Project Overview

Glosilex is a production-grade, full-stack AI compliance platform that helps semiconductor and dual-use technology exporters navigate two of the world's most complex export control regimes simultaneously: **India's SCOMET (Special Chemicals, Organisms, Materials, Equipment and Technologies)** and the **US Export Administration Regulations (EAR / BIS)**. It does this through four purpose-built AI modules, each backed by a proprietary vector database of regulatory documents and powered by Google Gemini 2.5 Flash. Classification, Contract, and Ask modules use Hypothetical Document Embedding (HyDE) retrieval; the ICP Gap Analyzer uses direct Gemini-grounded analysis without HyDE (see Section 12 for the full reasoning).

The product is designed for:
- Exporters dealing in dual-use goods and advanced electronics
- Trade compliance officers and legal teams
- Semiconductor manufacturers, fabs, design houses, RF/microwave companies, and component exporters
- Cross-border commercial teams reviewing contracts, licensing risk, and export obligations

The application provides four specialized AI compliance workflows — **Classification**, **ICP Gap Analyzer**, **Contract Intelligence**, and **Ask Compliance** — plus a report-generation layer for audit-ready outputs.

**Current status:** Pre-launch / active development. The codebase is production-oriented and deployment-ready, but several roadmap items such as user authentication and Phase 2 document generation remain open.

**GitHub:** [https://github.com/shravanpramode/Glosilex](https://github.com/shravanpramode/Glosilex)

**Supabase Project:** [https://supabase.com/dashboard/project/kflsdxdhupcfetdenxjb](https://supabase.com/dashboard/project/kflsdxdhupcfetdenxjb)

**Live URL:** *(https://glosilex.vercel.app/)*

---

## 2. Features & Modules

### 1. 🔬 Export Classification (`/classify`)

AI-assisted dual-jurisdiction export classification for semiconductor and dual-use technology products.

- Extracts product specifications from natural language input or uploaded documents (PDF, DOCX, TXT)
- Maps against **SCOMET Category-wise control lists** (India DGFT) and **EAR ECCN codes** (US BIS)
- Generates a structured finding with risk rating (HIGH / MEDIUM / LOW), cross-jurisdiction notes, and a step-by-step action plan
- HyDE-powered retrieval: generates a hypothetical SCOMET clause + hypothetical EAR clause before searching the vector DB, producing significantly more accurate regulatory chunk retrieval
- Results stored in `classification_results` table for audit trail
- Designed for semiconductor export classifications where both India and US frameworks can overlap

### 2. 📋 ICP Gap Analyzer (`/icp`)

Evaluates or builds an Internal Compliance Program (ICP) against 14 standard export control components.

- Accepts an existing ICP document or starts from scratch
- Analyses 14 standard ICP components (screening, licensing, training, recordkeeping, etc.)
- Produces component-level gap analysis with status (Present / Partial / Missing), priority (P1/P2/P3), jurisdiction-specific SOP language, and regulatory citations
- Outputs overall compliance score plus separate SCOMET and EAR sub-scores
- Dual Jurisdiction Alert banner when gaps exist in both frameworks simultaneously
- Recommended Documentation Flow (Phase 2 preview): document-by-document guidance for building a compliant ICP
- HyDE is used in Steps 2 and 3 of the ICP chain for vector retrieval (SCOMET and EAR regulatory context respectively), but **not** for the gap-analysis judgment itself — that is handled by direct Gemini reasoning over the extracted ICP structure and retrieved context (see Key Technical Design Decisions §10 for the full reasoning)
- **Cross-Jurisdiction Analysis** — rendered when both SCOMET and EAR are in scope; contains three analytical sub-sections: (A) Remediation Efficiency Map — a priority-ordered table mapping each gap to which jurisdiction it fixes and the estimated remediation effort; (B) FDPR / Dual-Trigger Explanation — a contextual panel explaining why EAR jurisdiction is triggered via the Foreign Direct Product Rule even for India-origin products using US-origin EDA tools, with a count of how many open gaps a SCOMET fix simultaneously closes under EAR; (C) Score Gap Tracker — live dual progress bars with an 80% pass-line marker for SCOMET and EAR sub-scores, and a distance-to-pass indicator
- **Regulatory Basis & Evidence Index** — a two-part reference section rendered after the Documentation Flow: (1) *Regulatory Basis table* — maps every one of the 14 ICP components to its BIS/DGFT standard reference (e.g., BIS EMCP §3 / EAR §774), jurisdiction, and live status chip sourced from the gap analysis; (2) *Document Evidence Index* — quoted verbatim evidence extracted directly from the uploaded ICP document for each component, with full regulatory citation and priority
- `icpDocGroups.ts` — new file providing the static component group metadata (`ICP_COMPONENT_GROUPS`), criticality configuration (`CRITICALITY_CONFIG` — Foundational / Operational / Governance), the `matchGroupDocs()` helper for linking doc-flow steps to component groups, and the `STATIC_DOC_FLOW` array of all 19 standard compliance documents
- Results stored in `icp_results` table

### 3. 📄 Contract Reviewer (`/contracts`)

Clause-by-clause export control audit of commercial contracts and NDAs.

- Accepts contract documents (PDF, DOCX, TXT)
- Configurable review scope: End-Use Restrictions, Deemed Export Controls, Re-export Controls, Red Flag Screening
- Audits each clause for compliance risk under SCOMET and EAR
- Generates ready-to-use compliant replacement clause language for each flagged clause
- Overall risk score and confidence rating (confidence score, confidence note, summary)
- Suitable for dual-use hardware export clauses and downstream customer/end-use obligations
- Results stored in `contract_results` table

### 4. 💬 Ask Glosilex (`/ask`)

Conversational compliance Q&A grounded in the regulatory document vector database.

- Accepts free-form compliance questions, optionally with an uploaded reference document
- Auto-detects jurisdiction from question context (SCOMET / EAR / both)
- Context-aware follow-up: short follow-up questions reuse prior retrieved chunks instead of re-querying
- Structured output format: Risk Rating → Compliance Assessment → Jurisdiction Breakdown → Action Required → Citations
- HyDE is especially impactful here due to open-ended query variety
- Sessions stored in `compliance_sessions` table

### 5. 📑 Report Generator (`/report`)

Shareable, downloadable compliance reports generated from any module result.

- Auto-synthesizes module output into a structured compliance report
- PDF export via jsPDF + html2canvas
- Shareable via unique token stored in `reports` table
- Normalizes outputs from all modules into a consistent compliance-report view

---

## 3. System Architecture

### High-Level Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                  │
│  Landing → Classify → ICP → Contracts → Ask → Report           │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────────────────────────┐
│                   AI SERVICES LAYER                             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  src/lib/  (orchestration layer)                         │   │
│  │  classificationService.ts  │  icpService.ts              │   │
│  │  contractService.ts        │  gemini.ts (callGemini)     │   │
│  │  hyde.ts (HyDE engine)     │  prompts.ts                 │   │
│  └────────────────────────────┬─────────────────────────────┘   │
│                               │                                  │
│  ┌────────────────────────────▼─────────────────────────────┐   │
│  │  src/services/  (API clients)                            │   │
│  │  gemini.ts (getGemini singleton)                         │   │
│  │  embeddings.ts (gemini-embedding-001 @ 768 dims)         │   │
│  │  retrieval.ts  (hybrid_search RPC caller)                │   │
│  │  supabase.ts   (getSupabase singleton)                   │   │
│  └────────────────────────────┬─────────────────────────────┘   │
└────────────────────────────────┼────────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                       │
┌─────────▼──────┐  ┌────────────▼──────────┐  ┌───────▼────────┐
│  Google Gemini │  │  Supabase (pgvector)  │  │ Google Gemini  │
│  2.5 Flash     │  │  hybrid_search RPC    │  │ Embedding-001  │
│  (generation)  │  │  vector(768) columns  │  │ (768 dims)     │
└────────────────┘  └───────────────────────┘  └────────────────┘
```

### HyDE Retrieval Flow (all modules)

```text
User Input
    │
    ▼
buildXxxQuery()        ← adds regulatory jargon/keywords
    │
    ▼
generateHypotheticalDoc()  ← Gemini writes a fake regulatory clause
    │                         in formal SCOMET/EAR document language
    ▼
embedText()            ← gemini-embedding-001, 768 dims
    │
    ▼
hybrid_search()        ← 70% semantic (pgvector cosine) +
    │                    30% keyword (PostgreSQL FTS + BM25 RRF)
    ▼
Top-K real regulatory chunks → passed to Gemini for final answer
```

### Client → Gemini → Supabase Request Flow

1. The React page collects user input, uploaded text, and jurisdiction scope.
2. A module service in `src/lib/` orchestrates a multi-step chain.
3. For retrieval-backed steps, the service builds a domain-specific regulatory query.
4. `src/lib/hyde.ts` generates a **hypothetical regulatory excerpt** for the query.
5. `src/services/embeddings.ts` embeds that HyDE text using `gemini-embedding-001` with `outputDimensionality: 768`.
6. `src/services/retrieval.ts` calls the Supabase RPC `hybrid_search`.
7. Supabase searches `regulatory_chunks` using both pgvector similarity and PostgreSQL full-text search.
8. The retrieved chunks are formatted as context and passed into Gemini 2.5 Flash.
9. The final grounded result is shown in the UI and, where applicable, saved to Supabase result tables.

### How `regulatory_chunks` Powers RAG

`regulatory_chunks` is the central retrieval corpus for Glosilex. Each row stores:
- the source document name
- jurisdiction (`SCOMET_INDIA` or `EAR_US`)
- clause/category metadata
- the text chunk itself
- a 768-dimensional embedding
- metadata such as page number or source URL

This table is populated offline using `ingest.js`. At runtime, the app **never writes to this table from the browser**. It only retrieves the most relevant chunks and uses them to ground Gemini responses.

### How the Chaining Prompt System Works

Glosilex avoids a single monolithic prompt. Each major workflow is decomposed into **multi-step AI chains**:
- **Classification**: extract specs → retrieve SCOMET context → retrieve EAR context → synthesize action plan
- **ICP**: parse/build ICP basis → retrieve SCOMET obligations → retrieve EAR obligations → score gaps → generate remediation guidance
- **Contract**: parse clauses → retrieve export-control obligations → audit clauses → draft improved clauses → summarize risk
- **Ask**: detect follow-up or fresh query → retrieve relevant chunks → answer using grounded context

This chain design improves determinism, makes intermediate results reusable, and allows each stage to use a prompt specialized for that exact subtask.

---

## 4. Tech Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| Frontend framework | React | 19.0.0 |
| Language | TypeScript | ~5.8.2 |
| Build tool | Vite | ^6.2.0 |
| React plugin | `@vitejs/plugin-react` | ^5.0.4 |
| Styling engine | Tailwind CSS v4 | ^4.1.14 |
| Tailwind Vite plugin | `@tailwindcss/vite` | ^4.1.14 |
| Routing | `react-router-dom` | ^7.13.1 |
| AI SDK | `@google/genai` | ^1.29.0 |
| Primary generation model | Gemini 2.5 Flash | configured in `src/lib/gemini.ts` |
| Embedding model | `gemini-embedding-001` | 768 dimensions |
| Backend / BaaS | Supabase | via `@supabase/supabase-js` ^2.99.0 |
| Database | PostgreSQL | managed by Supabase |
| Vector search | `pgvector` | `vector(768)` column in `regulatory_chunks` |
| Hybrid retrieval | PostgreSQL RPC (`hybrid_search`) | semantic + FTS + RRF fusion |
| Markdown rendering | `react-markdown` | ^10.1.0 |
| Markdown tables / GFM | `remark-gfm` | ^4.0.1 |
| PDF export | `jspdf` | ^4.2.0 |
| DOM-to-canvas capture | `html2canvas` | ^1.4.1 |
| Client PDF parsing | `pdfjs-dist` | ^5.5.207 |
| Alternate PDF utilities | `pdf-parse` | ^2.4.5 |
| DOCX parsing | `mammoth` | ^1.8.0 |
| Icons | `lucide-react` | ^0.546.0 |
| Animation / motion | `motion` | ^12.23.24 |
| Local Node utilities | `dotenv` | ^17.2.3 |
| Ingestion PDF parser | `pdf2json` (used by `ingest.js`) | imported directly in script |
| Optional server deps | `express`, `better-sqlite3` | present in `package.json`, not central to current client app |
| Deployment target | Vercel | configured via `vercel.json` |
| Fonts loaded in `index.html` | Space Grotesk, Inter, JetBrains Mono | via Google Fonts |

---

## 5. Project File Structure

### Root Directory

```text
Glosilex/
├── .env.example                  # Environment variable documentation (no real keys)
├── .gitignore                    # Excludes .env*, dist/, node_modules/
├── README.md                     # This file
├── check_schema.js               # Supabase schema verification utility
├── clean_db.js                   # Development DB cleanup utility
├── classification_results.sql    # Table: classification audit trail
├── contract_results.sql          # Table: contract review results
├── globe-semiconductor.jpg       # Asset
├── glosilex-TopLeft-Logo.png     # Brand asset
├── glosilex-banner.jpg           # Brand asset
├── glosilex-banner.png           # Brand asset
├── hybrid_search.sql             # RPC function: 70/30 RRF hybrid search
├── icp_results.sql               # Table: ICP gap analysis results
├── index.html                    # App entry point (Space Grotesk + Inter fonts)
├── ingest.js                     # Regulatory document ingestion script (Node ESM)
├── metadata.json                 # Document metadata registry
├── package-lock.json
├── package.json                  # Dependencies & scripts (name: "glosilex")
├── readme-vague.md               # Early draft (superseded)
├── reports.sql                   # Table: shareable compliance reports
├── security.md                   # Security notes
├── supabase_security.sql         # RLS policies for all 8 tables
├── test_env.js                   # Environment variable diagnostic tool
├── tsconfig.json                 # TypeScript config (ESNext, bundler resolution)
├── vercel.json                   # SPA rewrite rules for Vercel
├── vite.config.ts                # Vite + Tailwind config
└── src/
```

### `src/` Directory Tree

```text
src/
├── App.tsx                       # Router + CredentialsModal gate
├── index.css                     # Glosilex design tokens + Tailwind base
├── main.tsx                      # React entry point
├── vite-env.d.ts                 # Vite env type declarations
│
├── components/
│   ├── CitationsAccordion.tsx    # Collapsible regulatory citations display
│   ├── CredentialsModal.tsx      # Runtime Supabase URL + anon key entry
│   ├── DualJurisdictionAlert.tsx # Dual-jurisdiction warning banner
│   ├── Footer.tsx                # Footer with branding
│   ├── Header.tsx                # Top navigation bar
│   ├── JurisdictionBadge.tsx     # SCOMET / EAR jurisdiction badge
│   ├── LoadingSteps.tsx          # Animated multi-step loading indicator
│   ├── ProductSummaryCard.tsx    # Extracted product spec display card
│   └── RiskBadge.tsx             # HIGH / MEDIUM / LOW risk pill badge
│
├── lib/                          # AI orchestration (service logic)
│   ├── classificationService.ts  # 4-step Classification chain with HyDE
│   ├── contractService.ts        # Contract audit chain with HyDE
│   ├── gemini.ts                 # callGemini(), retry logic, getGemini re-export
│   ├── hyde.ts                   # generateHypotheticalDoc() — HyDE engine
│   ├── icpDocGroups.ts           # ICP component definitions + doc flow config
│   ├── icpService.ts             # Multi-step ICP chain with HyDE
│   ├── prompts.ts                # GLOBAL_SYSTEM_PROMPT + all module prompts
│   └── reportService.ts          # Report data normalisation
│
├── pages/
│   ├── Ask.tsx                   # Conversational Q&A module UI
│   ├── Classify.tsx              # Export Classification module UI
│   ├── Contracts.tsx             # Contract Reviewer module UI
│   ├── Icp.tsx                   # ICP Gap Analyzer module UI
│   ├── Landing.tsx               # Home page with module cards
│   └── Report.tsx                # Report generation + PDF export
│
├── services/                     # Raw API client layer (no business logic)
│   ├── embeddings.ts             # embedText() — gemini-embedding-001, 768 dims
│   ├── gemini.ts                 # getGemini() — single GoogleGenAI instance
│   ├── reports.ts                # saveReport() Supabase insert
│   ├── retrieval.ts              # retrieveChunks() — calls hybrid_search RPC
│   └── supabase.ts               # getSupabase() — Supabase client singleton
│
└── utils/
    ├── chunking.ts               # Text chunking utility
    ├── citations.ts              # parseCitations() from AI response text
    ├── contentCleaner.ts         # cleanContent() — strips markdown artifacts
    ├── fileParser.ts             # PDF + DOCX + TXT text extraction (client)
    ├── pdfParser.ts              # pdfjs-dist PDF text extraction
    ├── session.ts                # hasCredentials(), saveSession(), saveReport()
    └── sessionPersistence.ts     # Per-module state save/load (localStorage)
```

### File-by-File Purpose

#### Core App Files
- `src/main.tsx` — React application bootstrap
- `src/App.tsx` — main router and top-level application shell; wraps all routes with the CredentialsModal gate
- `src/index.css` — Glosilex design system, CSS variables, brand palette, typography tokens, layout utilities
- `src/vite-env.d.ts` — environment typing for Vite

#### Components
- `src/components/Header.tsx` — top navigation bar
- `src/components/Footer.tsx` — footer content and branding
- `src/components/CredentialsModal.tsx` — modal for runtime Supabase URL and anon key entry; stored in `sessionStorage`
- `src/components/LoadingSteps.tsx` — animated step-by-step loading UI used across long AI flows
- `src/components/RiskBadge.tsx` — standardized HIGH / MEDIUM / LOW risk badges
- `src/components/JurisdictionBadge.tsx` — SCOMET / EAR display chips
- `src/components/DualJurisdictionAlert.tsx` — warning banner when both jurisdictions are implicated
- `src/components/ProductSummaryCard.tsx` — normalized product/company summary card reused across module outputs
- `src/components/CitationsAccordion.tsx` — collapsible citations viewer for grounded answers

#### Lib (Orchestration / AI Logic)
- `src/lib/gemini.ts` — `callGemini()`, `callWithRetry()`, retry logic, grounded response helpers, and `getGemini` re-export
- `src/lib/hyde.ts` — `generateHypotheticalDoc()` implementing HyDE retrieval
- `src/lib/prompts.ts` — `GLOBAL_SYSTEM_PROMPT` and module-specific prompt text/constants
- `src/lib/classificationService.ts` — multi-step export classification workflow
- `src/lib/icpService.ts` — multi-step ICP gap analysis workflow
- `src/lib/contractService.ts` — contract audit and clause-generation workflow
- `src/lib/icpDocGroups.ts` — Static metadata for the ICP module: `ICP_COMPONENT_GROUPS` (14 entries with short `component` name, `criticality` tier, `bisRef` standard reference, keyword array for doc-flow matching, and optional `dependencyNote`); `CRITICALITY_CONFIG` (Foundational / Operational / Governance visual badge configuration); `matchGroupDocs()` helper (links `STATIC_DOC_FLOW` documents to component groups via keyword matching); `STATIC_DOC_FLOW` (the 19-document ordered compliance roadmap, each with `stepNumber`, `label`, `type`, and `jurisdictionTags`). This file drives both the Recommended Documentation Flow section and the Regulatory Basis table in the ICP results UI.
- `src/lib/reportService.ts` — transforms module output into report-ready structures

#### Pages
- `src/pages/Landing.tsx` — home/marketing surface introducing all modules
- `src/pages/Classify.tsx` — export classification UI
- `src/pages/Icp.tsx` — ICP gap analyzer UI
- `src/pages/Contracts.tsx` — contract review UI
- `src/pages/Ask.tsx` — conversational compliance Q&A UI
- `src/pages/Report.tsx` — rendered report page with export/share capabilities

#### Services (API / DB Client Layer)
- `src/services/gemini.ts` — singleton Gemini client factory (`getGemini()`)
- `src/services/embeddings.ts` — query embedding generation using `gemini-embedding-001`
- `src/services/retrieval.ts` — jurisdiction detection plus `retrieveChunks()` wrapper around Supabase RPC
- `src/services/supabase.ts` — singleton Supabase client factory
- `src/services/reports.ts` — report persistence helpers

#### Utils
- `src/utils/fileParser.ts` — front-end text extraction for PDF/DOCX/TXT inputs
- `src/utils/pdfParser.ts` — PDF parsing utilities via pdfjs-dist
- `src/utils/citations.ts` — citation extraction/parsing helpers
- `src/utils/contentCleaner.ts` — response text cleanup for UI rendering
- `src/utils/chunking.ts` — text chunking utility helpers
- `src/utils/session.ts` — credentials handling plus `saveSession()` / `saveReport()` wrappers
- `src/utils/sessionPersistence.ts` — persists per-module UI state (inputs + results) to `localStorage` between page refreshes

---

## 6. Supabase Database Setup

Glosilex uses **Supabase** (PostgreSQL + pgvector extension) as its backend. All tables must be created and the `hybrid_search` RPC function must be deployed before the app can function.

### Prerequisites

- Supabase project created at [supabase.com](https://supabase.com)
- `pgvector` extension enabled: **Dashboard → Database → Extensions → enable `vector`**
- All SQL files below must be run in **Supabase Dashboard → SQL Editor** in the stated order

### Table Schemas

Run each SQL file in this order:

#### 1. `regulatory_chunks` — Core Vector Store (manual creation required)

```sql
CREATE TABLE IF NOT EXISTS regulatory_chunks (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  document_name text NOT NULL,
  jurisdiction  text NOT NULL,         -- 'SCOMET_INDIA' or 'EAR_US'
  category      text,
  section       text,
  clause_id     text,
  content       text NOT NULL,
  embedding     vector(768),           -- gemini-embedding-001 @ 768 dims
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz DEFAULT now()
);

-- Index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS regulatory_chunks_embedding_idx
  ON regulatory_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for full-text search
CREATE INDEX IF NOT EXISTS regulatory_chunks_content_fts_idx
  ON regulatory_chunks
  USING gin(to_tsvector('english', content));
```

#### 2. `classification_results.sql`

```sql
CREATE TABLE IF NOT EXISTS classification_results (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                text,
  product_input          text,
  extracted_specs        jsonb,
  scomet_finding         text,
  ear_finding            text,
  cross_jurisdiction_note text,
  action_plan            text,
  overall_risk           text,
  created_at             timestamptz DEFAULT now()
);
```

#### 3. `icp_results.sql`

```sql
CREATE TABLE IF NOT EXISTS icp_results (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       text,
  company_name  text,
  icp_provided  boolean DEFAULT false,
  gap_analysis  jsonb,
  doc_flow      jsonb,
  overall_score float,
  scomet_score  float,
  ear_score     float,
  created_at    timestamptz DEFAULT now()
);
```

#### 4. `contract_results.sql`

```sql
CREATE TABLE IF NOT EXISTS contract_results (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           text,
  contract_name     text,
  review_scope      text[],
  jurisdictions     text[],
  clause_audit      jsonb,
  generated_clauses jsonb,
  overall_risk      text,
  risk_score        integer,
  confidence_score  float,
  confidence_note   text,
  summary           text,
  created_at        timestamptz DEFAULT now()
);
```

#### 5. `reports.sql`

```sql
CREATE TABLE IF NOT EXISTS reports (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            text,
  module_type        text,
  report_json        jsonb NOT NULL,
  synthesized_summary text,
  share_token        text UNIQUE NOT NULL,
  created_at         timestamptz DEFAULT now()
);
```

#### 6. `compliance_sessions` — Ask Module Sessions

```sql
CREATE TABLE IF NOT EXISTS compliance_sessions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id   text UNIQUE NOT NULL,
  module       text,
  question     text,
  answer       text,
  jurisdiction text[],
  risk_rating  text,
  citations    jsonb,
  dual_flag    boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);
```

#### 7. `compliance_reports` — Linked Report Storage

```sql
CREATE TABLE IF NOT EXISTS compliance_reports (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id   text UNIQUE NOT NULL,
  session_id  text,
  module      text,
  report_json jsonb,
  share_token text UNIQUE,
  created_at  timestamptz DEFAULT now()
);
```

#### 8. `conversations` — Legacy Q&A History

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      text DEFAULT 'anonymous',
  module       text,
  question     text,
  answer       text,
  jurisdiction text[],
  risk_rating  text,
  citations    jsonb,
  created_at   timestamptz DEFAULT now()
);
```

### Required Tables Summary

| Table | Purpose |
|---|---|
| `regulatory_chunks` | Main vector corpus for RAG retrieval across SCOMET and EAR |
| `classification_results` | Stores export classification results |
| `icp_results` | Stores ICP gap-analysis outputs and scores |
| `contract_results` | Stores clause audits, rewrites, scores, and confidence fields |
| `reports` | Stores generated report payloads and share tokens |
| `compliance_sessions` | Stores Ask module question/answer sessions |
| `compliance_reports` | Stores report records linked to compliance sessions |
| `conversations` | Legacy/general conversation history table |

---

### Hybrid Search Function

Run `hybrid_search.sql` in the SQL Editor. This creates the `hybrid_search` PostgreSQL function used by `src/services/retrieval.ts`.

The function combines:
- **70% semantic search** — pgvector cosine distance on `embedding vector(768)`
- **30% keyword search** — PostgreSQL full-text search (`tsvector` / `websearch_to_tsquery`)
- **Reciprocal Rank Fusion (RRF)** — fuses both rankings with `k=60` constant

```sql
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(768),
  query_text text,
  jurisdiction_filter text[],
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  document_name text,
  jurisdiction text,
  category text,
  section text,
  clause_id text,
  page integer,
  content text,
  source_url text,
  similarity float,
  rank_score float
)
LANGUAGE plpgsql
AS $$
DECLARE
  semantic_weight float := 0.7;
  keyword_weight float := 0.3;
  rrf_k int := 60;
BEGIN
  RETURN QUERY
  WITH semantic_search AS (
    SELECT
      c.id,
      ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding) as rank,
      1 - (c.embedding <=> query_embedding) as similarity_score
    FROM regulatory_chunks c
    WHERE c.jurisdiction = ANY(jurisdiction_filter)
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword_search AS (
    SELECT
      c.id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(
          to_tsvector('english', c.content),
          websearch_to_tsquery('english', query_text)
        ) DESC
      ) as rank
    FROM regulatory_chunks c
    WHERE c.jurisdiction = ANY(jurisdiction_filter)
      AND to_tsvector('english', c.content) @@ websearch_to_tsquery('english', query_text)
    ORDER BY ts_rank_cd(
      to_tsvector('english', c.content),
      websearch_to_tsquery('english', query_text)
    ) DESC
    LIMIT match_count * 2
  ),
  rrf_scores AS (
    SELECT
      COALESCE(s.id, k.id) as chunk_id,
      COALESCE(s.similarity_score, 0.0) as similarity,
      (
        semantic_weight * COALESCE(1.0 / (rrf_k + s.rank), 0.0) +
        keyword_weight * COALESCE(1.0 / (rrf_k + k.rank), 0.0)
      ) as rrf_score
    FROM semantic_search s
    FULL OUTER JOIN keyword_search k ON s.id = k.id
  )
  SELECT
    c.id,
    c.document_name,
    c.jurisdiction,
    c.category,
    c.section,
    c.clause_id,
    (c.metadata->>'page')::integer as page,
    c.content,
    c.metadata->>'source_url' as source_url,
    r.similarity::float,
    r.rrf_score::float as rank_score
  FROM rrf_scores r
  JOIN regulatory_chunks c ON c.id = r.chunk_id
  ORDER BY r.rrf_score DESC
  LIMIT match_count;
END;
$$;
```

---

### Row Level Security (RLS)

Run `supabase_security.sql` in the SQL Editor to enable RLS on all 8 tables and apply appropriate policies.

**Policy matrix:**

| Table | INSERT | SELECT | Notes |
|---|---|---|---|
| `regulatory_chunks` | Blocked (service role only via ingest.js) | Authenticated users only | Core vector store — never written from client |
| `classification_results` | Anon allowed | Anon allowed | No user auth yet |
| `icp_results` | Anon allowed | Anon allowed | No user auth yet |
| `contract_results` | Anon allowed | Anon allowed | No user auth yet |
| `reports` | Anon allowed | Anon allowed | Share-token based access |
| `compliance_sessions` | Anon allowed | Anon allowed | Session persistence |
| `compliance_reports` | Anon allowed | Anon allowed | Report persistence |
| `conversations` | Anon allowed | Anon allowed | Legacy — permissive until auth added |

> **Auth hardening path:** All result tables currently use permissive policies because Glosilex has no user authentication system yet. Once auth is added, tighten policies to `USING (auth.uid()::text = user_id)`. Comments in `supabase_security.sql` document this path explicitly.

---

## 7. Regulatory Data Ingestion

`ingest.js` is the Node.js ESM script used to parse, chunk, embed, and insert regulatory PDF/TXT/CSV documents into the `regulatory_chunks` Supabase table. It is an administrative/offline tool — never part of the browser app runtime.

### Embedding Contract

| Parameter | Value |
|---|---|
| Model | `gemini-embedding-001` |
| Output dimensions | `768` (must match `vector(768)` column) |
| API endpoint | `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent` |

> ⚠️ **Critical:** `text-embedding-004` was deprecated in January 2026. All existing chunks in Supabase were ingested using `gemini-embedding-001` at 768 dimensions. The client-side `src/services/embeddings.ts` also uses `gemini-embedding-001` at 768 dimensions. **Both must always match.** Any change to the embedding model or dimensions requires re-ingesting all regulatory documents from scratch.

### Prerequisites

```bash
npm install          # installs pdf2json, @supabase/supabase-js, dotenv
```

Create a local `.env` file (never commit):

```env
VITE_SUPABASE_URL=https://kflsdxdhupcfetdenxjb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...          # Service role key — bypasses RLS
GEMINI_API_KEY=AIzaSy...                    # Standard (non-VITE) key for Node.js
```

### Usage

```bash
# Ingest a SCOMET regulatory PDF
node ingest.js \
  --file "./docs/SCOMET_List_2024.pdf" \
  --name "SCOMET Control List 2024" \
  --jurisdiction SCOMET_INDIA \
  --date 2024-01-01 \
  --url "https://dgft.gov.in/..."

# Ingest a US EAR regulation
node ingest.js \
  --file "./docs/CCL_EAR_Part738.pdf" \
  --name "EAR Part 738 - CCL" \
  --jurisdiction EAR_US \
  --date 2024-09-15 \
  --url "https://www.ecfr.gov/..."

# Resume interrupted ingestion from chunk N
node ingest.js \
  --file "./docs/SCOMET_List_2024.pdf" \
  --name "SCOMET Control List 2024" \
  --jurisdiction SCOMET_INDIA \
  --skip 145
```

### CLI Arguments

| Argument | Required | Description |
|---|---|---|
| `--file` | ✅ | Path to PDF, TXT, or CSV file |
| `--name` | ✅ | Document display name (stored in `document_name` column) |
| `--jurisdiction` | ✅ | `SCOMET_INDIA` or `EAR_US` |
| `--date` | Optional | Document date (ISO format, defaults to today) |
| `--url` | Optional | Source URL stored in metadata |
| `--skip` | Optional | Skip first N chunks (for resuming interrupted runs) |

### Chunking Strategy

The script applies jurisdiction-aware chunking:
- **SCOMET documents:** splits on clause pattern `\d[A-Z]\d{3}[a-z]?\.`
- **EAR documents:** splits on clause pattern `[0-9][A-Z][0-9]{3}\.[a-z]\.[0-9]+`
- **Minimum chunk size:** 100 characters (merges short fragments with next chunk)
- **Maximum chunk size:** 512 characters with 100-character overlap
- **Rate limiting:** 1 second delay between API calls to avoid 429 errors

### Supabase Key Priority

`ingest.js` resolves the Supabase key using:

```js
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
```

`SUPABASE_SERVICE_ROLE_KEY` takes priority. This ensures ingestion bypasses RLS and can write to `regulatory_chunks`.

---

## 8. Environment Variables

### Full Variable Reference

| Variable | Used in | Purpose | Client-exposed? |
|---|---|---|---|
| `VITE_GEMINI_API_KEY` | `src/services/gemini.ts`, credential checks in `src/utils/session.ts`, Vite client bundle | Primary Gemini API key for all browser-side AI calls | Yes (`VITE_`) |
| `VITE_SUPABASE_URL` | `src/services/supabase.ts`, `src/utils/session.ts`, `ingest.js` fallback | Supabase project URL for browser client or local ingestion convenience | Yes (`VITE_`) |
| `VITE_SUPABASE_ANON_KEY` | `src/services/supabase.ts`, `src/utils/session.ts`, `ingest.js` fallback | Public anon key for browser access (RLS protected) | Yes (`VITE_`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `ingest.js` only | Server-side key used only to ingest regulatory chunks bypassing RLS | **No — never client-side** |
| `GEMINI_API_KEY` | `ingest.js` only | Non-Vite Gemini key for Node-side embedding calls during ingestion | **No — never client-side** |
| `APP_URL` | `.env.example` | AI Studio runtime-injected app URL | Yes / runtime injected |
| `SUPABASE_URL` | `src/utils/session.ts`, compatibility paths | Non-Vite fallback naming used in some compatibility paths | Depends on runtime source |
| `SUPABASE_ANON_KEY` | `src/utils/session.ts`, compatibility paths | Non-Vite fallback naming used in compatibility checks | Depends on runtime source |
| `DISABLE_HMR` | `vite.config.ts` | Used to disable HMR in AI Studio editing contexts | No |

### Environment by Deployment Target

#### AI Studio (development)
Set **only** `VITE_GEMINI_API_KEY` in the AI Studio Secrets panel. Supabase credentials are entered by the user at runtime via the Credentials modal.

#### Local Development (`.env.local`)
```env
# Required
VITE_GEMINI_API_KEY="your-real-gemini-key"

# Optional — skip CredentialsModal if set
VITE_SUPABASE_URL="https://kflsdxdhupcfetdenxjb.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJh..."

# Optional compatibility aliases
# SUPABASE_URL="https://kflsdxdhupcfetdenxjb.supabase.co"
# SUPABASE_ANON_KEY="eyJh..."
```

#### Vercel Production

| Variable | Required in Vercel? | Notes |
|---|---|---|
| `VITE_GEMINI_API_KEY` | ✅ Yes | Required for client-side Gemini calls |
| `VITE_SUPABASE_URL` | Optional | Can be set to skip runtime modal entry |
| `VITE_SUPABASE_ANON_KEY` | Optional | Can be set to skip runtime modal entry |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ No | Do **not** set for browser deployment — admin only |
| `GEMINI_API_KEY` | ❌ No | Only needed for local `ingest.js` |

#### `ingest.js` Only (local admin)
```env
VITE_SUPABASE_URL="https://kflsdxdhupcfetdenxjb.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJh..."   # bypasses RLS — admin only
GEMINI_API_KEY="AIzaSy..."            # non-Vite key for Node.js
```

### `.env.example` (full reference — no real keys)

```env
# ─── Glosilex Environment Variables ────────────────────────────────────────────
# .env.example is documentation only — never store real keys in Git.

# Required for browser-side Gemini calls
VITE_GEMINI_API_KEY="your-gemini-api-key-here"

# AI Studio may inject this automatically at runtime
APP_URL="MY_APP_URL"

# Optional for local browser development (skips CredentialsModal if set)
# VITE_SUPABASE_URL="https://your-project.supabase.co"
# VITE_SUPABASE_ANON_KEY="eyJh..."

# Optional compatibility aliases if you intentionally use non-Vite names locally
# SUPABASE_URL="https://your-project.supabase.co"
# SUPABASE_ANON_KEY="eyJh..."

# For ingest.js only — never expose client-side, never put in Vercel browser env
# SUPABASE_SERVICE_ROLE_KEY="eyJh..."
# GEMINI_API_KEY="your-gemini-api-key-here"

# Optional dev flag used by vite.config.ts
# DISABLE_HMR="true"
```

### Environment Handling Notes

- `VITE_` variables are bundled into the client and are visible in browser-delivered code
- The Supabase anon key is acceptable for client use because Row Level Security controls what the browser can read/write
- The service role key **bypasses RLS entirely** and must never be shipped to the browser or configured as a Vercel client variable
- If `VITE_GEMINI_API_KEY` is missing, the app will not be able to call Gemini
- If Supabase URL/anon key are absent from env vars, the **CredentialsModal** prompts for them at runtime

---

## 9. Local Development Setup

### Prerequisites

1. **Node.js 18+** (recommended: current LTS)
2. **npm** as the package manager
3. A **Google AI Studio Gemini API key** from [aistudio.google.com](https://aistudio.google.com)
4. A **Supabase project** with all 8 tables, RLS policies, pgvector, and `hybrid_search` RPC deployed

### Step-by-Step Setup

```bash
# 1. Clone the repository
git clone https://github.com/shravanpramode/Glosilex.git
cd Glosilex

# 2. Install dependencies
npm install

# 3. Create local environment file
cp .env.example .env.local
# Edit .env.local — add VITE_GEMINI_API_KEY at minimum

# 4. Start development server
npm run dev
# → App available at http://localhost:3000
```

### Available Scripts

| Script | Command | Description |
|---|---|---|
| Dev server | `npm run dev` | Starts Vite on port 3000 with HMR |
| Production build | `npm run build` | Compiles TypeScript + bundles to `dist/` |
| Preview build | `npm run preview` | Serves `dist/` locally for production testing |
| Type check | `npm run lint` | Runs `tsc --noEmit` — zero TypeScript errors required |
| Clean | `npm run clean` | Removes `dist/` folder |

### Credentials Modal

On first load, the app checks for `VITE_GEMINI_API_KEY` in the environment. If Supabase credentials are not set as environment variables, a **Credentials Modal** appears prompting for the Supabase Project URL and Anon Key. These are stored in `sessionStorage` (not localStorage) for the duration of the browser session.

### Known Gotchas

- If `VITE_GEMINI_API_KEY` is missing, the app will not be able to call Gemini
- If Supabase URL / anon key are not present as env vars, the **CredentialsModal** will prompt for them at runtime
- `npm run lint` runs **TypeScript type-checking** (`tsc --noEmit`), not ESLint
- If you change the embedding model or vector dimension, all previously ingested regulatory chunks become incompatible and must be re-ingested
- `ingest.js` is a local/admin script, not part of the browser app runtime

---

## 10. Vercel Deployment

### One-Time Setup

1. Push the repository to GitHub
2. In Vercel, create a new project from the GitHub repo: **Add New → Project → Import from GitHub**
3. Let Vercel auto-detect the framework as **Vite**
4. Set required environment variables in the Vercel dashboard
5. Deploy

### Build Settings

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |

### SPA Routing

`vercel.json` configures SPA rewrite rules so all routes (`/classify`, `/icp`, `/contracts`, `/ask`, `/report`) resolve to `index.html`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

Without this rewrite, routes can 404 on browser refresh.

### Runtime Supabase Credentials

Users enter their Supabase Project URL and Anon Key via the Credentials Modal at runtime. These never need to be hardcoded into Vercel environment variables — Vercel only strictly requires `VITE_GEMINI_API_KEY`.

---

## 11. Key Technical Design Decisions

### 1. Hypothetical Document Embeddings (HyDE)

**Problem:** User queries ("Can I export FPGAs to China?") live in a different semantic space from regulatory text ("3A001.a.7 — Field programmable logic devices..."), causing poor cosine similarity scores and missed chunks.

**Solution:** Before embedding a query, `generateHypotheticalDoc()` in `src/lib/hyde.ts` asks Gemini to write a realistic 3–4 sentence excerpt from an actual regulatory guideline on the topic. This hypothetical document, written in formal regulatory language, lives in the same vector space as the real chunks in Supabase — producing significantly higher similarity scores and more accurate retrieval.

**Fallback:** If the HyDE LLM call fails, the function returns the original query string — the system degrades gracefully to direct embedding.

**Usage:** Applied in Classification (2 HyDE calls — SCOMET + EAR), Contract (2 HyDE calls — SCOMET + EAR), and Ask (1 HyDE call). The ICP module uses HyDE for regulatory chunk retrieval in Steps 2 and 3, but does not use HyDE for the gap-analysis judgment pass — see Key Technical Design Decisions §10 for the full reasoning.

### 2. Hybrid Search with Reciprocal Rank Fusion

The `hybrid_search` PostgreSQL function combines:
- **Semantic search (70%):** `pgvector` cosine similarity on `vector(768)` embeddings
- **Keyword search (30%):** PostgreSQL FTS using `websearch_to_tsquery` + `ts_rank_cd`
- **RRF fusion:** Both ranked lists merged via Reciprocal Rank Fusion with `k=60`, then top-K results by fused score returned

This ensures both conceptually similar chunks (semantic) and exact clause-ID matches (keyword) surface in results.

### 3. Single Embedding Model with Consistent Dimensionality

`gemini-embedding-001` at `outputDimensionality: 768` is used uniformly:
- `ingest.js` — embeds all regulatory documents into Supabase at ingestion time
- `src/services/embeddings.ts` — embeds queries at runtime for all retrieval calls

Both must always match. Any change to the embedding model or dimensions requires re-ingesting all regulatory documents.

### 4. Consolidated Gemini Client

`getGemini()` is defined once in `src/services/gemini.ts` and re-exported from `src/lib/gemini.ts`. This ensures a single `GoogleGenAI` instance configuration point — change `VITE_GEMINI_API_KEY` once in env, updates everywhere.

### 5. Single Model Constant

```typescript
// src/lib/gemini.ts — change this one line to switch generation models globally
const GEMINI_MODEL = 'gemini-2.5-flash';
```

All generation calls (`callGemini`, `callWithRetry`) reference this constant. Switching models requires changing exactly one line.

### 6. Retry with Exponential Backoff

`callWithRetry()` in `src/lib/gemini.ts` retries on `503 UNAVAILABLE` and `429 RESOURCE_EXHAUSTED` with exponential backoff: instant → 3s → 9s → 27s → throw. This handles Gemini rate limiting transparently.

### 7. Multi-Step Chaining Instead of a Single Prompt

Multi-step chaining is a core architectural choice visible across `classificationService.ts`, `icpService.ts`, and `contractService.ts`. Benefits of the current design:
- Each step has a narrower objective
- Retrieval happens only where needed
- Intermediate outputs can be audited or reused
- Dual-jurisdiction logic can be handled separately before synthesis
- Failures are easier to isolate and debug

A single prompt would mix extraction, retrieval interpretation, legal reasoning, and synthesis into one opaque step. The chain design is more controllable and better suited to regulatory workflows.

### 8. Session State Persistence

Each module uses `src/utils/sessionPersistence.ts` to save its current state (inputs + results) to `localStorage`, so refreshing the page does not lose in-progress work. The sidebar open/closed state is also persisted per module.

### 9. Brand Design System

The app uses a branded Glosilex visual system defined primarily in `src/index.css` and reflected throughout page components. Key characteristics:
- CSS-variable-driven theming with semantic color tokens
- Glosilex brand palette
- Typography built around **Space Grotesk** (headings), **Inter** (body), and **JetBrains Mono** (code)
- Modern dashboard-like surfaces, cards, badges, and jurisdiction-aware UI accents
- Module UIs aligned toward a consistent branded compliance platform

### 10. Why HyDE Is Not Applied to ICP Gap Analysis Judgment

**Problem stated incorrectly in earlier versions:** The ICP module was described as using "HyDE for SCOMET and EAR ICP retrieval" as if HyDE drove the gap analysis itself. This needed clarification.

**What HyDE actually does in ICP:** HyDE *is* used in Steps 2 and 3 for the retrieval pass — generating a hypothetical regulatory excerpt before embedding and calling `hybrid_search`. This is standard RAG retrieval augmentation, identical to other modules.

**Why HyDE is not applicable to the gap-analysis judgment pass (Steps 4–6):**

The gap analysis is fundamentally different in nature from the retrieval problem HyDE solves:

1. **HyDE solves a semantic space mismatch problem** — user queries live in conversational language; regulatory text lives in formal clause language. HyDE bridges this gap by asking Gemini to write a fake regulatory excerpt, putting the search query into the same vector space as the real chunks. This is the retrieval problem.

2. **Gap analysis is a *judgment* problem, not a retrieval problem.** By the time we reach Step 4, we already have: the extracted ICP structure (Step 1), the SCOMET component mapping with status/citations (Step 2), and the EAR component mapping with status/citations (Step 3). There is no additional retrieval to do. The question being answered is: "Given what the ICP says and what the regulation requires, what is missing?" — this is a deterministic comparison and classification task, not a document search.

3. **Generating a hypothetical gap-analysis document to embed and search for would be circular.** If you HyDE-generate "what a good gap analysis looks like" and search the `regulatory_chunks` corpus with it, you retrieve more regulatory text — but you *already have* the regulatory context from Steps 2 and 3. The additional retrieval would return the same chunks (or overlapping chunks) without adding new information to the judgment.

4. **Step 4 is a `buildGapListFromMappings()` deterministic function**, not an LLM call with context retrieval. The worst-case status merge, jurisdiction assignment, and priority classification are all rule-based logic, not probabilistic generation. Applying HyDE here would mean using an LLM to generate something for a function that doesn't call an LLM at all.

5. **SOP generation (Step 5) and documentation flow (Step 6) are instruction-following tasks** on already-structured data. The inputs are JSON arrays of gap objects. Generating a hypothetical SOP document to embed and retrieve against would add latency and API cost without improving the output — Gemini already has the gap context directly.

**Bottom line:** HyDE is a retrieval-time technique. The ICP module uses it exactly where retrieval happens (Steps 2 and 3). It is correctly absent from Steps 4–6 because those steps do not perform retrieval.

---

## 12. Module Deep-Dive

### Classification Service (`src/lib/classificationService.ts`)

**Key Inputs:** Product description text, optional uploaded PDF/DOCX/TXT, jurisdiction scope

**Key Outputs:** Extracted specs object, SCOMET finding, EAR finding, cross-jurisdiction note, action plan, overall risk rating (HIGH/MEDIUM/LOW)

**Chain steps:**
1. **Step 1:** Extract product specs from user input (LLM, no retrieval)
2. **Step 2:** HyDE → embed → `hybrid_search(['SCOMET_INDIA'])` → SCOMET finding (LLM + retrieved chunks)
3. **Step 3:** HyDE → embed → `hybrid_search(['EAR_US'])` → EAR/ECCN finding (LLM + retrieved chunks)
4. **Step 4:** Cross-jurisdiction synthesis + action plan (LLM, both findings as context)

**Supabase:** Reads `regulatory_chunks` via `hybrid_search`; writes `classification_results`

---

### ICP Service (`src/lib/icpService.ts`)

**Key Inputs:** Company name, existing ICP document text or uploaded file, jurisdiction selection (`SCOMET_INDIA`, `EAR_US`, or both)

**Key Outputs:** Gap analysis array with status (Present/Partial/Missing), priority (P1/P2/P3), gap description, SOP language, citations; overall score; SCOMET and EAR sub-scores; documentation flow (`doc_flow`)

**Chain steps:**
1. **Step 1:** Extract ICP structure from the uploaded document (or note "building from scratch") — pure LLM extraction, no retrieval
2. **Step 2:** HyDE → `embedText()` → `hybrid_search(['SCOMET_INDIA'], match_count: 7)` → Gemini maps ICP structure against SCOMET requirements; returns `components[]` JSON with status, gapDescription, citation, evidence per component
3. **Step 3:** HyDE → `embedText()` → `hybrid_search(['EAR_US'], match_count: 7)` → Gemini maps ICP structure against EAR requirements; same output shape as Step 2
4. **Step 4:** `buildGapListFromMappings()` — deterministic merge of Step 2 and Step 3 outputs; worst-case status selected per component; P1/P2/P3 priority assigned based on component criticality; jurisdiction (`SCOMET` / `EAR` / `Both`) derived from which frameworks have the gap; safety-net ensures all 14 canonical component names are always present
5. **Step 5:** SOP text generation — Gemini adds ready-to-use SOP language to each gap item; if Step 5 returns fewer than 14 items, Step 4 output is preserved without SOP text
6. **Step 6:** Documentation flow (`STATIC_DOC_FLOW`) — builds the 19-document ordered compliance roadmap; `ICP_COMPONENT_GROUPS` from `icpDocGroups.ts` links each document back to its ICP component group

**Inter-step delay:** A deliberate `pause(1500ms)` is inserted between every step. This was added because Steps 4 → 5 → 6 are three consecutive Gemini calls with only microsecond-level JSON parsing in between — firing them without delay stacks on an already-loaded API and triggers `503 UNAVAILABLE` errors. The 1.5s pause gives Gemini's server-side rate management time to breathe between calls.

**Supabase:** Reads `regulatory_chunks` via `hybrid_search`; writes `icp_results`

---

### Contract Service (`src/lib/contractService.ts`)

**Key Inputs:** Uploaded contract document, review scope (end-use restrictions, re-export controls, screening, deemed exports), jurisdiction selection

**Key Outputs:** Clause audit results, generated replacement clauses, overall risk, risk score, confidence score, confidence note, summary

**Chain steps:**
1. **Step 1:** Parse contract clauses from uploaded document
2. **Step 2:** HyDE → `hybrid_search(['SCOMET_INDIA', 'EAR_US'])` → retrieve relevant regulatory context
3. **Step 3:** Clause-by-clause audit against SCOMET + EAR requirements
4. **Step 4:** Generate compliant replacement clause language for each flagged clause
5. **Step 5:** Overall risk score + confidence assessment

**Supabase:** Reads `regulatory_chunks` via `hybrid_search`; writes `contract_results`

---

### Ask Module (`src/pages/Ask.tsx`)

**Key Inputs:** User query, optional uploaded supporting document, optional hidden prior-context from another module

**Key Outputs:** Final answer text, risk rating, citations, dual-jurisdiction flag, saved compliance session

**Stateful conversational loop:**
- Short follow-up detection: if the new question is semantically a follow-up and jurisdictions haven't changed, reuses previous retrieved chunks — avoiding a redundant retrieval call
- HyDE applied to all fresh (non-follow-up) queries
- `buildAskQuery()` enriches the user's query with regulatory terminology before HyDE generation

**Supabase:** Reads `regulatory_chunks` via `hybrid_search`; writes `compliance_sessions`; can create linked report artifacts in `compliance_reports`

---

### Reports (`src/pages/Report.tsx` + `src/lib/reportService.ts`)

**Key Inputs:** Normalized result object from a module, report metadata

**Key Outputs:** Rendered report UI, printable/downloadable PDF export, persisted report record with share token

**Supabase:** Writes `reports`; in Ask-linked flows, writes `compliance_reports`

---

## 13. Security Notes

### RLS Overview

`supabase_security.sql` is the authoritative security file for the project. It:
- enables RLS on all 8 tables
- keeps `regulatory_chunks` protected from normal browser-side writes
- allows the current no-auth app to function using permissive policies where needed
- includes comments warning that policies should be tightened once authentication is added

### API Key Exposure

**Safe for client exposure (VITE_ prefix):**
- `VITE_GEMINI_API_KEY` — technically visible in browser-delivered code
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` — safe because RLS controls what the anon key can access

**Must remain server/admin-only:**
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS entirely; never set in Vercel, never commit
- Node-side `GEMINI_API_KEY` used by `ingest.js` — local admin only

### `.gitignore` Protection

`.gitignore` excludes `.env*` files while explicitly preserving `.env.example` (which contains only placeholders). Never commit real credentials.

### Current Limitations

- No full user authentication system yet — result tables are intentionally permissive at this stage
- Browser-side AI calls mean the app depends on client-accessible runtime configuration
- `ingest.js` is a privileged admin script and must only be run in a trusted local environment

---

## 14. Regulatory Coverage

Currently ingested regulatory documents (stored in Supabase `regulatory_chunks`):

| Document | Jurisdiction | Notes |
|---|---|---|
| SCOMET Control List (DGFT) | `SCOMET_INDIA` | India's dual-use and munitions control list |
| EAR Commerce Control List (CCL) | `EAR_US` | US Bureau of Industry and Security ECCN list |
| EAR Part 730–774 | `EAR_US` | Full EAR regulatory text |
| SCOMET Policy Circulars | `SCOMET_INDIA` | DGFT notifications and amendments |

To add new regulatory documents, run `ingest.js` with the appropriate `--jurisdiction` flag. No code changes are required — retrieval automatically covers any documents in `regulatory_chunks`.

---

## 15. Roadmap / Known TODOs

### Confirmed Open Items

- **License** — not yet declared in the repository
- **Auth hardening** — `supabase_security.sql` explicitly notes that policies should be tightened once login/auth is added
- **Phase 2 ICP features** — UI already references Phase 2 / SOP-document enhancements, indicating deeper document-generation workflows are intended

### Architecture Roadmap

- **Supabase Auth integration** — move from anonymous/permissive access to authenticated per-user isolation; replace permissive policies with `USING (auth.uid()::text = user_id)` across all result tables
- **Expanded document-generation features** — the platform already generates clause/SOP language; more exportable, auto-assembled compliance documents are the natural next step
- **Production launch URL and deployment hardening** — finalize launch metadata and operational documentation
- **Stronger observability / logging** — observability around failed LLM chain steps
- **Batched ingestion in `ingest.js`** — consider if re-ingestion volume grows significantly
- **Formal ADR** — architecture decision record for Gemini selection and retrieval strategy

### Running a TODO Audit

To find all inline TODOs in the codebase:

```bash
rg -n "TODO|FIXME|XXX" .
```

---

## 16. Contributing

This is a private production-oriented application. Recommended internal development workflow:

1. Create a feature branch from `main`
2. Keep changes scoped to a single module or infrastructure concern
3. Run type checks before committing:
   ```bash
   npm run lint
   ```
4. If a change affects Supabase schema — update the relevant root `.sql` files and `supabase_security.sql`
5. If a change affects retrieval, embeddings, or HyDE behaviour — verify compatibility with existing `regulatory_chunks` embeddings and document whether re-ingestion is required
6. If a change affects prompts or AI chains — test both SCOMET and EAR paths, verify citations still parse correctly, and confirm report generation still works
7. If a change affects UI/branding — maintain Glosilex design tokens and CSS-variable conventions; verify responsive behaviour across all module pages
8. Do not commit secrets, `.env.local`, or service-role credentials
9. Prefer full-file replacements for major AI Studio-managed UI pages where partial patching risks breakage

---

## 17. Final Bug & Issue Verification Status

All bugs and issues identified during development and testing have been resolved as of April 2026.

| # | Issue | Status |
|---|---|---|
| Bug 1 | `saveSession()` — missing `session_id`, wrong column names | ✅ Fixed |
| Bug 2 | `saveReport()` — wrong column names, spurious `user_id` | ✅ Fixed |
| Bug 3 | `contract_results` missing `confidence_score`, `confidence_note`, `summary` | ✅ Fixed |
| Bug 4 | `hasCredentials()` reading wrong env variable name | ✅ Fixed |
| Bug 5 | `GEMINI_API_KEY` mismatch between `lib/gemini.ts` and `.env.example` | ✅ Fixed |
| Bug 7 | Regulatory Basis table Status column blank for Management Commitment, ECO Appointment, Product Classification, License Determination | ✅ Fixed — `ICP_COMPONENT_GROUPS` short names (e.g., "Management Commitment") didn't match Gemini-returned full names (e.g., "Management Commitment & Policy Statement"); fixed by replacing `===` with a bidirectional `startsWith` match |
| Bug 8 | Cross-Jurisdiction Analysis block never rendered despite both SCOMET and EAR being in scope | ✅ Fixed — jurisdiction condition checked `'SCOMET:INDIA'` and `'EAR:US'` (colon-separated) but the state array stores `'SCOMET_INDIA'` and `'EAR_US'` (underscore-separated); corrected to underscore keys |
| Issue 1 | HyDE not implemented (pseudo-HyDE only) | ✅ Implemented in all 4 modules |
| Issue 2 | `getGemini` singleton not enforced | ✅ Fixed |
| Issue 3 | `.env.example` incomplete for Vercel deployment | ✅ Fixed |
| Issue 4 | Two duplicate `getGemini` exports | ✅ Consolidated to `services/gemini.ts` |
| Issue 5 | `ingest.js` inserts one-by-one (performance) | ✅ Noted — acceptable for low-frequency admin operation |
| Issue 6 | `supabase_security.sql` was unvalidated version | ✅ Schema-verified version committed |
| Arch | `vite.config.ts` missing `name`/`base` for Vercel | ✅ Fixed via `vercel.json` SPA rewrites |
| Arch | `package.json` name was generic | ✅ Set to `"glosilex"` |
| Arch | Embedding model mismatch (`text-embedding-004` vs `gemini-embedding-001`) | ✅ Both `ingest.js` and `embeddings.ts` use `gemini-embedding-001` @ 768 dims |
| Arch | `ingest.js` Supabase key priority (anon key before service role key) | ✅ Fixed — service role key now has priority |

---

## 18. License

**[TODO: license not yet decided — not currently declared in repository]**

---

*Glosilex — Built for India's semiconductor export compliance frontier.*
