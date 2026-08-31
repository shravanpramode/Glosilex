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
18. [The Corpus Sentinel Agent](#18-the-corpus-sentinel-agent)
19. [License](#19-license)

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
├── supabase_security.sql         # SUPERSEDED — do not run (see v2)
├── supabase_security_v2.sql      # RLS policies, corrected Aug 2026
├── verify_fix.sql                # Post-deploy verification (5 PASS/FAIL checks)
├── agent/                        # Corpus Sentinel — see section 18
│   ├── README.md                 # Agent setup and n8n wiring
│   ├── glosilex-corpus-sentinel.json   # Importable n8n workflow (31 nodes)
│   ├── backfill.mjs              # The worker: fetch, chunk, embed, verify, swap
│   ├── report.mjs                # Corpus freshness report generator
│   ├── schema.sql                # corpus_registry + ingestion_runs
│   ├── expand-corpus.sql         # ITAR + the four missing EAR parts
│   ├── migration-appendix.sql    # eCFR supplement support (Entity List)
│   ├── migration-routing.sql     # route / checks / duration columns
│   ├── migration-full-coverage.sql     # register SCOMET and static documents
│   ├── migration-tool-signature.sql    # past_classifications tool signature
│   ├── migration-internal-reference.sql # register the derived country table
│   ├── run-waves.sql             # Quota-safe ingestion waves
│   ├── demo-reset.sql            # Replay a run for recording
│   └── reclaim-space.sql         # VACUUM FULL after a large refresh
├── .github/workflows/
│   └── corpus-sentinel.yml       # Cloud worker: dispatch, manual, daily cron
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

> **Corrected August 2026.** The policy matrix previously documented here did
> not match `supabase_security.sql`, and the SQL is what runs. That mismatch
> caused a 91-day production outage: every write was rejected and the corpus was
> invisible to retrieval, while this file said "Anon allowed". The correction is
> recorded rather than quietly overwritten, because the failure mode is the
> useful part.

Run **`supabase_security_v2.sql`** in the SQL Editor. It supersedes
`supabase_security.sql`, which must not be used.

**Prerequisite:** Supabase Dashboard -> Authentication -> Sign In / Providers ->
enable **Anonymous sign-ins**. The app calls `signInAnonymously()` on boot, so
every visitor gets a real `auth.uid()` with no login screen. Without that
toggle `auth.uid()` is NULL and the ownership policies below correctly deny
everything.

**Policy matrix, as actually enforced:**

| Table | INSERT | SELECT | Notes |
|---|---|---|---|
| `regulatory_chunks` | None (service role only) | `anon` + `authenticated` | Published government text; gating it broke RAG |
| `classification_results` | Owner (`auth.uid()::text = user_id`) | Owner | Per-visitor isolation via anonymous auth |
| `icp_results` | Owner | Owner | |
| `contract_results` | Owner | Owner | |
| `reports` | Owner | Owner + `get_report_by_token()` RPC | Share links resolve one row via SECURITY DEFINER |
| `conversations` | Owner | Owner | |
| `compliance_sessions` | `authenticated` | none | Write-only |
| `compliance_reports` | `authenticated` | `authenticated` | |
| `corpus_registry` | Service role only | `anon` + `authenticated` | Agent watchlist; readable for a freshness badge |
| `ingestion_runs` | Service role only | Service role only | Agent audit trail |
| `agent_config` | Service role only | Service role only | Tunable thresholds |

**Two design notes worth keeping:**

1. `hybrid_search` is now **`SECURITY DEFINER`**. As `SECURITY INVOKER` it
   inherited the caller's permissions, so restricting `regulatory_chunks`
   silently returned zero chunks — with no error, because an RLS denial arrives
   as an empty result set, not an exception. `retrieveChunks()` now throws when
   it retrieves nothing, so that can never be silent again.
2. The old share-link policy was `USING (share_token IS NOT NULL)`. Every row
   has a token, so it exposed **every** report to any anonymous caller. Replaced
   by `get_report_by_token()`, which returns exactly one row and only to a
   caller who already holds the unguessable UUID.

---
## 7. Regulatory Data Ingestion

There are now **two** ingestion paths. Read this before using either.

### The current path: the Corpus Sentinel (recommended)

Since August 2026 the corpus is maintained by an agent rather than by hand. It
watches for amendments, decides whether they matter, re-ingests only when they
do, verifies the result before deleting anything, and records every check. See
**section 19** for the full design and **`agent/README.md`** for setup.

```bash
node agent/backfill.mjs --list          # show the watchlist
node agent/backfill.mjs                 # ingest everything currently armed
node agent/backfill.mjs --pending       # ingest only what n8n delegated
node agent/report.mjs                   # generate the corpus freshness report
```

The agent pulls current text directly from the **eCFR versioner API**, so no PDF
downloading is involved for any US document. It produces chunks byte-identical
to `ingest.js` on purpose — drift between ingestion paths would degrade
retrieval only on re-ingested documents, which is the hardest kind of bug to
notice.

### The legacy path: `ingest.js` (still valid, use with care)

`ingest.js` is the original Node.js ESM script for parsing, chunking, embedding
and inserting regulatory PDF/TXT/CSV documents. It remains the only way to
ingest a source with no API — currently the DGFT SCOMET list.

**Three things it does not do**, which the agent does:

1. **It never deletes.** Re-running it on a document already in the corpus
   produces a second copy rather than an update. Part 730 would become 230
   chunks holding two versions of the same regulation, and retrieval would cite
   both as current.
2. **It never checks whether anything changed.** It ingests whatever file you
   point it at, unconditionally.
3. **It leaves no record.** Nothing is written to `ingestion_runs`.

There is also a latent bug worth knowing about: the clause-splitting regex
builds an alternation for any jurisdiction other than `SCOMET_INDIA` or
`EAR_US`, and `String.split()` splices capture groups into its output, so the
non-matching branch yields `undefined` and the loop throws. It never fired
because the script was only ever run with those two jurisdictions. The agent
has the same logic with the fix applied.

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

### Credentials Modal (legacy)

> **No longer required.** The app now establishes its own anonymous Supabase
> session on boot, and the Vercel deployment supplies `VITE_SUPABASE_URL` and
> `VITE_SUPABASE_ANON_KEY` at build time, so this modal does not appear in
> production. It remains in the codebase as a local-development fallback and is
> a candidate for removal.

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

**`supabase_security_v2.sql`** is the authoritative security file.
`supabase_security.sql` is superseded and must not be run — its policies
excluded the `anon` role the app actually uses, which produced a 91-day outage
where every write was rejected and retrieval returned zero chunks with no error.

The current model:
- **Anonymous auth.** The app calls `signInAnonymously()` on boot, so every
  visitor has a real `auth.uid()` and per-visitor row isolation holds — without
  a login screen. This is why the ownership policies work rather than being
  disabled.
- `regulatory_chunks` is **public-read** (`anon` + `authenticated`). It is
  published government text, not user data, and gating it is what killed RAG.
- All writes to `regulatory_chunks` are service-role only, from the agent.
- `hybrid_search` is `SECURITY DEFINER` with a pinned `search_path`.
- Share links resolve through `get_report_by_token()` rather than a policy that
  exposed every report to any caller.

### API Key Exposure

**`VITE_GEMINI_API_KEY` is visible in the browser bundle.** This is inherent to
calling Gemini directly from the client — it is not a mistake in the code, and
rotating the key does not fix it, because the replacement is published on the
next deploy.

**Current mitigation (in place):** the key is restricted in Google Cloud to the
HTTP referrer `glosilex.vercel.app/*`, so a copy lifted from the bundle will not
work from anywhere else.

**Proper fix (not yet implemented):** proxy Gemini through a Vercel serverless
function so the key stays server-side. The `@google/genai` SDK supports
`httpOptions.baseUrl`, so this does not require rewriting call sites — only
repointing the client and adding the function.

**Safe for client exposure:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` — safe *because* RLS is now correct; it was not safe
  while the share-token policy exposed every report

**Must remain server/admin-only:**
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS entirely. Lives in GitHub Actions
  secrets and locally in `.env`. Never in Vercel, never in the browser, never
  committed.
- `GEMINI_API_KEY` (unprefixed) — used by the agent and `ingest.js`

### `.gitignore` Protection

`.gitignore` excludes `.env*` while preserving `.env.example` (placeholders
only). It also excludes `agent/*.READY.json`, the local convenience copy of the
n8n workflow with the project id substituted.

### Current Limitations

- No named user accounts. Anonymous auth gives per-browser isolation, not
  per-person identity, and clearing site data starts a new identity.
- Gemini is still called from the browser (see mitigation above).
- `ingest.js` and `agent/backfill.mjs` are privileged and must run only in a
  trusted environment or GitHub Actions with secrets.
- **Denied-party screening does not exist.** The Entity List text is in the
  corpus and answers questions about the list, but semantic search cannot
  answer "is this exact company listed?" Do not present the product as
  providing screening.

---
## 14. Regulatory Coverage

**28 documents, 15,948 chunks, three regimes.** Maintained by the Corpus
Sentinel (section 19). This table was generated from `corpus_registry` on
2026-08-31; for the live position run `node agent/report.mjs`.

| Document | Regime | Citation | Watch | Version held | Chunks |
|---|---|---|---|---|---|
| `SCOMET_List_2025` | SCOMET_INDIA | — | manual | 2025-09-23 | 2,030 |
| `FTDR_Act_1992` | SCOMET_INDIA | — | static | 1992-08-07 | 110 |
| `Country_Risk_Reference` | SCOMET_INDIA | — | internal | 2025-09-01 | 9 |
| `EAR_CCL_Part730` | EAR_US | 15 CFR 730 | ecfr | 2026-07-16 | 99 |
| `EAR_CCL_Part732` | EAR_US | 15 CFR 732 | ecfr | 2026-07-16 | 153 |
| `EAR_CCL_Part734` | EAR_US | 15 CFR 734 | ecfr | 2026-03-05 | 325 |
| `EAR_CCL_Part736` | EAR_US | 15 CFR 736 | ecfr | 2026-07-16 | 91 |
| `EAR_CCL_Part738` | EAR_US | 15 CFR 738 | ecfr | 2026-03-05 | 244 |
| `EAR_CCL_Part740` | EAR_US | 15 CFR 740 | ecfr | 2026-08-14 | 844 |
| `EAR_ControlPolicy_Part742` | EAR_US | 15 CFR 742 | ecfr | 2026-07-23 | 508 |
| `BIS_Entity_List_Part744` | EAR_US | 15 CFR 744 Supp. 4 | ecfr | 2026-08-24 | 3,370 |
| `EAR_Embargoes_Part746` | EAR_US | 15 CFR 746 | ecfr | 2026-07-23 | 869 |
| `EAR_Applications_Part748` | EAR_US | 15 CFR 748 | ecfr | 2026-01-15 | 582 |
| `EAR_Enforcement_Part764` | EAR_US | 15 CFR 764 | ecfr | 2024-10-17 | 138 |
| `EAR_CCL_Part774` | EAR_US | 15 CFR 774 | ecfr | 2026-08-18 | 3,779 |
| `BIS_InterimRule_Jan2025` | EAR_US | — | static | 2025-01-13 | 639 |
| `CHIPS_Act_Guardrails` | EAR_US | — | static | 2023-09-25 | 378 |
| `ITAR_Definitions_Part120` | ITAR_US | 22 CFR 120 | ecfr | 2025-07-07 | 200 |
| `ITAR_USML_Part121` | ITAR_US | 22 CFR 121 | ecfr | 2026-07-23 | 539 |
| `ITAR_Registration_Part122` | ITAR_US | 22 CFR 122 | ecfr | 2025-01-08 | 39 |
| `ITAR_Licenses_Part123` | ITAR_US | 22 CFR 123 | ecfr | 2024-09-03 | 150 |
| `ITAR_Agreements_Part124` | ITAR_US | 22 CFR 124 | ecfr | 2024-09-03 | 108 |
| `ITAR_TechData_Part125` | ITAR_US | 22 CFR 125 | ecfr | 2022-09-06 | 46 |
| `ITAR_Policies_Part126` | ITAR_US | 22 CFR 126 | ecfr | 2025-12-30 | 439 |
| `ITAR_Violations_Part127` | ITAR_US | 22 CFR 127 | ecfr | 2025-01-10 | 71 |
| `ITAR_Procedures_Part128` | ITAR_US | 22 CFR 128 | ecfr | 2022-09-06 | 61 |
| `ITAR_Brokering_Part129` | ITAR_US | 22 CFR 129 | ecfr | 2025-01-08 | 75 |
| `ITAR_Political_Part130` | ITAR_US | 22 CFR 130 | ecfr | 2022-09-06 | 52 |

### Watch methods, and why the distinction matters

- **`ecfr`** — machine-checkable. The agent polls the eCFR versioner API daily.
- **`manual`** — no API exists. DGFT publishes SCOMET changes as gazette PDFs, so
  a human must check on a 30-day cadence. Overdue is visible in the report
  rather than silent. Auto-ingesting a government PDF nobody has read is how a
  compliance corpus gets quietly corrupted.
- **`static`** — immutable. A published Federal Register rule never changes after
  issue; what changes is the CFR that incorporates it, watched separately. A
  1992 Act of Parliament is the same. Never re-ingest these.
- **`internal`** — derived in-house, **not a primary source**.
  `Country_Risk_Reference` was compiled by hand from EAR Part 740 Supplement 1,
  UN designations and DGFT policy. It does not update when its sources do, and
  retrieval cannot tell it apart from official text — so a stale entry there is
  cited with the same confidence as the law. 90-day review cadence.

### Reachability

`ITAR_US` chunks are retrievable only in **Ask Compliance**, via the ITAR toggle
or automatic routing on ITAR vocabulary. Classify, ICP and Contracts remain
EAR + SCOMET deliberately: those modules run jurisdiction-specific determination
chains, and a half-built USML classifier would be worse than none. A commodity
jurisdiction determination belongs to DDTC, not to Glosilex.

ITAR is also **excluded from the default search**. It is a narrow regime, and
pulling 1,780 munitions-list chunks into an ordinary dual-use question crowds
out the text that answers it.

### Known corpus limitations

- **Commerce Country Chart** (Supplement No. 1 to Part 738) is *not* ingested.
  It is fetchable, but it is a table, and the prose chunker reduces it to rows
  of context-free `X` marks with the column headers stripped. It needs
  structured extraction, not chunking.
- **Denied-party screening is not solved by the corpus.** The Entity List text
  is present and answers questions *about* the list. It cannot answer "is
  Company X listed?" — that is exact matching, not semantic similarity.
- **Every document shrank** when moving from PDFs to eCFR XML, because the PDFs
  included page furniture and supplements. Part 736 went 106 -> 91 for the same
  regulation.

### Adding a document

Insert a row into `corpus_registry` with the right `source_type`, then run the
agent. See `agent/expand-corpus.sql` for worked examples. No code changes are
required — retrieval covers whatever is in `regulatory_chunks`, subject to the
jurisdiction filter.

**Blind-spot check:** `SELECT * FROM unregistered_corpus_documents;` must always
return zero rows. Anything listed is being served to users with nothing
monitoring it.

---
## 15. Roadmap / Known TODOs

### Done since the August 2026 hardening pass

- RLS corrected; anonymous auth added; retrieval restored
- Zero-chunk retrieval now throws instead of answering ungrounded
- Corpus Sentinel agent built (section 19); corpus current across three regimes
- ITAR ingested and reachable in Ask Compliance
- Citation whitelist corrected — it had been forbidding 15 of 28 documents
- Per-jurisdiction retrieval in Ask, so adding a regime cannot displace another
- Worker hosted on GitHub Actions; report published from CI

### Open — near term

- **Gemini serverless proxy** so the API key leaves the browser entirely
- **OFAC SDN branch** for the agent. The Treasury endpoint is live and exposes a
  `Last-Modified` header, so change detection is straightforward. Marked
  Critical in the domain gap analysis.
- **Denied-party screening** as a real feature: a structured table plus
  trigram/fuzzy matching (`pg_trgm`), not vector search. This is a *different
  build* from ingesting the list text — see section 14.
- **Commerce Country Chart** via structured extraction rather than chunking
- **DGFT/SCOMET watcher** — poll the notifications page, diff it, alert a human;
  no automatic ingestion of an unread government PDF
- **ITAR clause-boundary chunking.** ITAR numbers sections differently
  (`121.1`, `Category VIII(a)`), so ITAR chunks are currently split by length
  only. Fixing it means re-ingesting all 11 parts together so they stay
  mutually consistent.

### Open — later

- Per-user authentication with named accounts, replacing anonymous identity
- ITAR determinations in Classify / ICP / Contracts, with real USML logic
- EU Dual-Use (EUR-Lex) and UK ECO (legislation.gov.uk) — both automatable
- Batch classification, BOM-level review
- Observability on failed LLM chain steps

### Known cosmetic issues

- In Ask answers, `5. RISK RATING & CONFIDENCE` sometimes renders inside the
  ACTION REQUIRED block rather than as its own section
- Dead code: `src/services/reports.ts` is never imported; three separate
  `saveReport` implementations exist
- Unused dependencies: `better-sqlite3`, `pdf-parse`, `html2canvas`, `jspdf`
- `CredentialsModal` no longer serves a purpose now that the app creates its own
  anonymous session
- Main bundle is ~2 MB; `pdfjs-dist` could be lazy-loaded

### Running a TODO Audit

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

## 18. The Corpus Sentinel Agent

A RAG compliance product is only as trustworthy as the freshness of its corpus.
Glosilex's corpus was ingested from PDFs dated **2026-03-05**. 15 CFR Part 774 —
the Commerce Control List, the most load-bearing document in the corpus — was
amended on **2026-08-18**. Nobody knew, because nothing was watching. The
Corpus Sentinel closes that gap.

Full setup lives in **`agent/README.md`**. This section covers the design.

### Architecture

```text
  n8n (cloud)          watches, decides, reports, schedules
      │                  │
      │                  ├── no change            -> log and stop
      │                  ├── editorial only       -> log and skip
      │                  ├── substantive, small   -> ingest inline
      │                  └── substantive, large   -> delegate
      ▼
  GitHub Actions       executes the heavy work
      │                  fetch -> chunk -> embed -> insert -> verify -> retire
      ▼
  Supabase             stores; publishes the report to docs/
```

Three services, each doing what it is actually good at. That split was not the
original design — it was forced by measurement, which is the more useful story.

### What makes it an agent rather than a cron job

1. **It decides whether to act.** eCFR flags each section version as
   `substantive: true|false`. A cross-reference renumbering is an amendment but
   not a change in what is legally controlled. Re-embedding 3,779 chunks because
   BIS fixed a comma costs money and churns the vector store underneath answers
   that were already right. Editorial changes are logged and skipped.
2. **It knows its own limits.** Before doing expensive work it counts the chunks
   and compares against a threshold (300, stored in `agent_config`, empirical —
   n8n Cloud completed 91 chunks and stalled twice on 2,097). Over the limit it
   records a delegation with a written reason and stops, rather than starting
   something it cannot finish.
3. **It reasons about blast radius.** After ingesting, an AI analyst looks up
   which classifications Glosilex has already issued that cited a clause which
   just changed, and grades severity `editorial | material | critical`.

That third step is the product: not "ask an AI about regulations" but *the rule
you relied on in March changed last week, and here are the three classifications
it affects.*

### Safety properties

- **Verify before delete.** New chunks are written alongside the old ones and
  counted against an expected band. Only then are superseded rows retired. The
  corpus is never empty mid-run.
- **Idempotent re-runs.** A failed attempt leaves rows tagged with the target
  amendment date; the next run clears them before inserting, so five runs still
  leave one copy.
- **Paged deletes.** Retiring ~18,000 rows in one request exceeded the timeout
  on the runner. Deletes now page 500 at a time.
- **Failures are recorded.** An error writes an `ingestion_runs` row with
  severity `critical`. The worker also exits non-zero, so CI shows red instead
  of publishing a clean report about a corpus it just failed to update.
- **Chunking is byte-identical to `ingest.js`.** Drift between ingestion paths
  would degrade retrieval only on re-ingested documents.

### The audit trail

Every run records what it *verified*, not just what happened — source reachable,
version comparison, substantive filter, chunk count in band, embeddings
generated, dimensions correct, rows submitted, rows verified in the database,
superseded version retired. Each with expected, actual, PASS/FAIL/SKIP and why
it matters.

`node agent/report.mjs` renders it as standalone HTML, including a live check
of every eCFR document against the governing body. "The corpus is current" is a
claim; the checks are the evidence.

### Operating it

```bash
node agent/backfill.mjs --list       # the watchlist
node agent/backfill.mjs              # ingest what is armed
node agent/backfill.mjs --pending    # ingest only what n8n delegated
node agent/report.mjs                # freshness + audit report
```

Or from GitHub: **Actions -> Corpus Sentinel Worker -> Run workflow**. It also
runs daily at 01:00 UTC as a safety net, and on `repository_dispatch` when n8n
delegates.

---

## 19. License

**[TODO: license not yet decided — not currently declared in repository]**

---

*Glosilex — Built for India's semiconductor export compliance frontier.*
