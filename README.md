# Glosilex: AI-Powered Semiconductor Trade Compliance Copilot

Glosilex is a production-grade, AI-driven compliance platform designed to help semiconductor companies, exporters, and compliance officers navigate the complex landscape of international trade regulations. It specifically focuses on dual-jurisdiction compliance across **India's SCOMET** (Special Chemicals, Organisms, Materials, Equipment and Technologies) and the **United States' EAR** (Export Administration Regulations) / BIS (Bureau of Industry and Security).

**Current Status**: Development / Pre-launch  
**Live URL**: TODO: [Insert Live URL Here]

---

## 🚀 Tech Stack

| Category | Technology | Version |
| :--- | :--- | :--- |
| **Framework** | React | `^19.0.0` |
| **Language** | TypeScript | `~5.8.2` |
| **Build Tool** | Vite | `^6.2.0` |
| **AI Reasoning** | Gemini 2.5 Flash | via `@google/genai ^1.29.0` |
| **Embeddings** | Gemini Embedding 001 | via `@google/genai ^1.29.0` |
| **Database** | Supabase (PostgreSQL) | via `@supabase/supabase-js ^2.99.0` |
| **Vector Search** | Supabase `pgvector` | Custom `hybrid_search` RPC |
| **Styling** | Tailwind CSS | `^4.1.14` |
| **Icons** | Lucide React | `^0.546.0` |
| **Animations** | Framer Motion | `^12.23.24` |
| **Markdown** | React Markdown | `^10.1.0` |
| **File Parsing** | PDF Parse / Mammoth | `^2.4.5` / `^1.8.0` |
| **Export** | jsPDF / html2canvas | `^4.2.0` / `^1.4.1` |

---

## 🏗️ Architecture Overview

Glosilex implements a sophisticated **Retrieval-Augmented Generation (RAG)** pipeline optimized for regulatory compliance.

### High-Level Flow
```text
[User Input] ──> [Retrieval Service] ──> [Reasoning Engine] ──> [Persistence]
      │                 │                       │                   │
      ▼                 ▼                       ▼                   ▼
Datasheet / Query  Hybrid Search (70/30)   Gemini Chain (Multi-step)  Supabase
```

### Key Components
1.  **Retrieval Pipeline**: Uses a custom `hybrid_search` RPC in Supabase that combines semantic vector search (via `pgvector`) and keyword search using Reciprocal Rank Fusion (RRF).
2.  **Reasoning Engine**: Leverages Gemini 2.5 Flash with multi-step "Chaining" prompts to handle complex regulatory logic, cross-jurisdiction conflicts, and citation generation.
3.  **Data Ingestion**: A dedicated `ingest.js` script processes regulatory PDFs, chunks them with structure-awareness, embeds them, and populates the `regulatory_chunks` table.
4.  **Persistence**: All analysis results, reports, and chat sessions are stored in Supabase with Row Level Security (RLS) for data privacy.

---

## 📂 Project Structure

```text
/
├── src/
│   ├── components/       # Reusable UI components (RiskBadge, LoadingSteps, etc.)
│   ├── lib/              # Core business logic & AI chains
│   │   ├── prompts.ts    # System prompts and multi-step chain definitions
│   │   ├── gemini.ts     # Gemini API integration
│   │   ├── icpService.ts # ICP analysis logic
│   │   └── ...           # Other module services
│   ├── pages/            # Main application views (Classify, Ask, Icp, etc.)
│   ├── services/         # External integrations (Supabase, Embeddings, Retrieval)
│   ├── utils/            # Helper functions (File parsing, Citations, etc.)
│   ├── App.tsx           # Main routing and layout
│   └── index.css         # Global styles & Tailwind configuration
├── ingest.js             # Regulatory document ingestion script
├── hybrid_search.sql     # Supabase RPC for hybrid search
├── supabase_security.sql # Supabase RLS policies
└── .env.example          # Environment variable template
```

---

## 🧩 Modules & Features

### 1. Product Classification (`Classify.tsx`)
*   **Function**: Performs dual SCOMET/EAR classification from datasheets or text descriptions.
*   **Logic**: Uses `runClassificationChain` to extract specs, retrieve relevant rules, and perform cross-jurisdiction reasoning.
*   **Output**: Detailed classification report with ECCN/Category, risk rating, and confidence score.

### 2. Compliance Q&A Copilot (`Ask.tsx`)
*   **Function**: Multi-turn conversational AI grounded in regulatory documents.
*   **Logic**: Uses `retrieveChunks` for hybrid search and `QA_PROMPT` for cited answers.
*   **Output**: Risk-rated answers with interactive citations.

### 3. ICP Gap Analyzer (`Icp.tsx`)
*   **Function**: Audits Internal Compliance Programs (ICP) against 14 standard SCOMET/EAR components.
*   **Logic**: Uses `runICPChain` to map document text against regulatory requirements and identify gaps.
*   **Output**: Gap analysis table, generated SOP language, and documentation flow.

### 4. Contract Intelligence (`Contracts.tsx`)
*   **Function**: Audits commercial contracts for export control clause adequacy.
*   **Logic**: Uses `runContractChain` to detect missing/weak clauses and suggest remediation.
*   **Output**: Clause audit report, risk score, and generated clause text.

---

## 🔑 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Google AI Studio API Key (Server-side only)
GEMINI_API_KEY=your_gemini_api_key

# Supabase Credentials (Client-side exposed)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Application URL
APP_URL=https://your-app-url.com
```

---

## 🛠️ Local Development Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-repo/glosilex.git
    cd glosilex
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Set up Supabase**:
    *   Create a new Supabase project.
    *   Run the SQL scripts in `hybrid_search.sql` and `supabase_security.sql` in the Supabase SQL Editor.
    *   Create the required tables: `regulatory_chunks`, `classification_results`, `icp_results`, `contract_results`, `reports`, `conversations`.

4.  **Ingest Regulatory Data**:
    ```bash
    # Ensure GEMINI_API_KEY and VITE_SUPABASE_URL/KEY are set in your environment
    node ingest.js
    ```

5.  **Start the development server**:
    ```bash
    npm run dev
    ```

---

## 🛡️ Security & Privacy

*   **Row Level Security (RLS)**: Enforced on all Supabase tables to ensure users can only access their own data.
*   **API Key Safety**: `GEMINI_API_KEY` is never exposed to the client. All AI calls are proxied through server-side logic (or handled via AI Studio environment).
*   **Data Isolation**: User-uploaded documents are processed in-memory and not stored unless explicitly saved as part of a report.

---

## 🗺️ Roadmap

- [ ] **Phase 1**: Core RAG pipeline and module MVP (Current).
- [ ] **Phase 2**: Integration of Supabase Auth for user management.
- [ ] **Phase 3**: Real-time entity screening (Denied Persons List, etc.).
- [ ] **Phase 4**: Expanded jurisdiction support (EU Dual-Use, UK Export Control).

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for more details.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

⚠️ **LEGAL DISCLAIMER**: Glosilex is an AI-generated tool for informational purposes only. It does not constitute legal advice. Verify all compliance determinations with a qualified export control attorney before making shipping, licensing, or contractual decisions.
