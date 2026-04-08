# 🔒 SECURITY.md — Glosilex Security Hardening Playbook

> Every security measure in this project, written as reusable prompts and checklists.
> Specific to the **Glosilex / SemiShield** application (React + Vite + Supabase + Gemini API).
>
> ⚠️ **AI Agent Warning:** When running this file in AI Studio or any AI coding assistant,
> the agent MUST follow every constraint exactly as written. It must NOT autonomously
> "improve" model names, dependency versions, or architecture patterns not listed here.

Every section follows this structure:
1. **The Risk** — what can go wrong
2. **The Prompt** — what you tell the AI to fix it
3. **The Pattern** — how it is implemented in this codebase

---

## 🚨 SECTION 0 — AI Agent Hard Constraints (READ FIRST)

> **This section must be read and strictly obeyed before any other action is taken.**

The following items are **FROZEN**. An AI agent running this file must **NOT** change them
under any circumstances — not for "upgrades", not for "security improvements", not for
"better performance", not for any reason whatsoever:

| What | Frozen Value | Why |
|---|---|---|
| Embedding model | `gemini-embedding-001` | Supabase vector column is `vector(768)` — changing model silently breaks all RAG retrieval |
| Embedding dimensions | `outputDimensionality: 768` | Must match Supabase stored vectors exactly |
| LLM model | `gemini-2.5-flash` | GA stable model (released June 2025, supported until Oct 2026) |
| Supabase anon key usage | Client-side only | Service role key must never appear in frontend code |
| RLS status | Enabled on all user-data tables | Must not be disabled for any reason |

**If any AI agent changes these values, it has broken the application. Revert immediately.**

---

## 1. 🔒 AI Model & Embedding Version Lock — CRITICAL

### The Risk

AI coding assistants (AI Studio, Cursor, Copilot) sometimes autonomously "upgrade" AI
model names during security or maintenance passes — **even when not asked to**. In
Glosilex, this causes a **silent total failure** of the entire classification engine:

- `gemini-embedding-001` with `outputDimensionality: 768` produces **768-dimensional** vectors
- The Supabase `regulatory_chunks` table has a `vector(768)` column — this is **fixed at
  the database level** and cannot be changed without re-embedding the entire knowledge base
- If the embedding model is changed to `gemini-embedding-2-preview` (default: **3072 dims**),
  every `hybrid_search` RPC call either throws a Postgres dimension mismatch error or
  returns **zero regulatory chunks**
- The AI then classifies products using hallucinated data from its training weights
  instead of the actual SCOMET / EAR knowledge base
- This is a **compliance failure**, not just a bug — users receive fabricated regulatory
  guidance with no factual grounding

**Note:** The original `security.md` template (HelloPM version) contains ZERO mention of
model upgrades anywhere in its 15 sections. AI Studio invented the "Model & Embedding
Upgrades" action autonomously and incorrectly classified it as a security improvement.
It is not. Never was. This new section exists specifically to prevent that from happening again.

### The Prompt

> "IMPORTANT HARD CONSTRAINT: Do NOT change any AI model names in this codebase during
> this task. The following are locked and must not be touched:
>
> - `src/services/embeddings.ts`: model must remain `gemini-embedding-001` with
>   `config: { outputDimensionality: 768 }` — this MUST match the Supabase `vector(768)` column.
>   Changing the model or removing `outputDimensionality` silently breaks all RAG retrieval.
>
> - `src/services/gemini.ts` and `src/lib/gemini.ts`: LLM model must remain `gemini-2.5-flash`.
>   This is the approved stable GA model (released June 2025, supported until October 2026).
>   Do not use any `-preview` variants — they are experimental, not production-safe, and
>   will be decommissioned without notice.
>
> These constraints are non-negotiable. If you identify a genuine security issue with
> either model, report it as a comment in the code — do not change the code."

### The Pattern

```typescript
// ✅ src/services/embeddings.ts — FROZEN. DO NOT MODIFY MODEL OR REMOVE outputDimensionality.
export async function embedText(text: string): Promise<number[]> {
  try {
    const ai = getGemini();
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-001',         // ✅ LOCKED — matches Supabase vector(768)
      contents: [text],
      config: { outputDimensionality: 768 }  // ✅ REQUIRED — Supabase vector column is vector(768)
                                             // Default without this param = 3072 → breaks all RAG
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

// ✅ src/services/gemini.ts / src/lib/gemini.ts — approved model
// gemini-2.5-flash: GA stable, released June 17 2025, supported until Oct 16 2026
// ❌ NEVER USE: gemini-embedding-2-preview, gemini-3-flash-preview, or any *-preview variants
```

**Model stability reference:**

| Model | Status | Notes |
|---|---|---|
| `gemini-2.5-flash` | ✅ GA stable | Released June 17 2025, supported until Oct 16 2026 |
| `gemini-embedding-001` | ✅ GA stable | Current stable embedding model |
| `gemini-3-flash-preview` | ❌ Does not exist | No stable release. Do not use. |
| `gemini-embedding-2-preview` | ❌ Preview only | Default 3072 dims. Incompatible with existing DB. |

---

## 2. Generic Error Messages

### The Risk

Detailed error messages leak Supabase schema, column names, query structure, and stack
traces. A message like `"column 'scomet_finding' does not exist"` or a raw Postgres error
tells an attacker your exact database table structure.

### The Prompt

> "Ensure ALL service functions in `classificationService.ts`, `icpService.ts`,
> `contractService.ts`, `reportService.ts`, `retrieval.ts`, and `reports.ts` catch errors
> and throw structured generic messages to the UI layer. Log the real error server-side
> guarded by `!import.meta.env.PROD`. Never propagate raw Supabase or API error objects
> to the React component layer."

### The Pattern

```typescript
// ❌ BAD — leaks Supabase internals to the UI
const { data, error } = await supabase.from('classification_results').insert(...);
if (error) throw error; // error.message = "insert violates foreign key constraint..."

// ✅ GOOD — generic to UI, detailed to dev console only
const { data, error } = await supabase.from('classification_results').insert(...);
if (error) {
  if (!import.meta.env.PROD) {
    console.error('[classificationService] Supabase insert error:', {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
  }
  throw new Error('Classification could not be saved. Please try again.');
}
```

**Applied in:** `classificationService.ts`, `icpService.ts`, `contractService.ts`,
`reportService.ts`, `retrieval.ts`, `reports.ts`

**ClassifyErrorBoundary pattern:**
```typescript
// Parse structured errors from service layer — show friendly message, hide technical details
static getDerivedStateFromError(error: Error) {
  return {
    hasError: true,
    errorMessage: 'The classification completed but could not be displayed correctly.',
    // Never: errorMessage: error.message
  };
}
```

---

## 3. API Key & Environment Variable Protection

### The Risk

Gemini API keys and Supabase keys exposed in client-side code or committed to Git allow
anyone to consume your API quota, read your database, or impersonate your application.

### The Prompt

> "Verify all API keys are accessed only via `import.meta.env.VITE_*` environment
> variables. Search the codebase for hardcoded key strings starting with `AIza` (Gemini)
> or `eyJ` (JWT Supabase key). Ensure `.env` is in `.gitignore`. Never use
> `SUPABASE_SERVICE_ROLE_KEY` in client-side Vite code — it should only appear in
> Supabase edge functions (server-side Deno environment)."

### The Pattern

```typescript
// ✅ CORRECT — via env vars only
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const SUPABASE_URL   = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON  = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ❌ NEVER in Vite client code
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY); // bypasses RLS!
```

**Key isolation rules for Glosilex:**

| Key | Where Used | Safe? |
|---|---|---|
| `VITE_GEMINI_API_KEY` | Client (Vite) | ✅ Via `import.meta.env` |
| `VITE_SUPABASE_URL` | Client (Vite) | ✅ Via `import.meta.env` |
| `VITE_SUPABASE_ANON_KEY` | Client (Vite) | ✅ Publishable by design |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions only | ❌ NEVER in Vite src/ |

**Verification command:** `grep -r "SERVICE_ROLE\|service_role" src/` — must return **zero results**.

**Vercel setup:** Add all `VITE_*` variables in Vercel dashboard → Settings → Environment Variables.
Vercel injects them at build time. They are baked into the client bundle, so treat them
as semi-public (anon key is fine, service role key is not).

---

## 4. Input Validation & Payload Size Limits

### The Risk

Large or malformed inputs sent to the Gemini API can cause resource exhaustion, API quota
abuse, or unexpected model behaviour. A 50MB PDF text payload or a 100,000-character
product description causes API timeouts and excessive billing.

### The Prompt

> "Add logic-layer validation in `classificationService.ts` before any Gemini API call:
> (1) product description max 8,000 characters, (2) uploaded PDF text max 150,000
> characters, (3) jurisdictions must be an array containing only `'SCOMET_INDIA'` and/or
> `'EAR_US'`, (4) reject empty or whitespace-only inputs. Throw user-friendly errors for
> each validation failure."

### The Pattern

```typescript
export async function runClassificationChain(
  productInput: string,
  uploadedDocText?: string,
  jurisdictions: string[] = ['SCOMET_INDIA', 'EAR_US'],
  onProgress?: (step: string) => void
): Promise<ClassificationResult> {

  if (!productInput || productInput.trim().length === 0) {
    throw new Error('Product description is required.');
  }
  if (productInput.length > 8000) {
    throw new Error('Product description is too long. Please limit to 8,000 characters.');
  }
  if (uploadedDocText && uploadedDocText.length > 150000) {
    throw new Error('Uploaded document is too large. Please upload a shorter datasheet.');
  }
  const validJurisdictions = ['SCOMET_INDIA', 'EAR_US'];
  if (!jurisdictions.every(j => validJurisdictions.includes(j))) {
    throw new Error('Invalid jurisdiction selection.');
  }
  if (jurisdictions.length === 0) {
    throw new Error('At least one jurisdiction must be selected.');
  }
  // ... rest of chain
}
```

---

## 5. Production Logging Guards

### The Risk

`console.log`, `console.error`, and `console.warn` calls in production expose:
- Internal reasoning chains (e.g. "Glosilex Reasoning:" blocks from Gemini)
- Supabase query structures and error messages
- User product descriptions (potentially confidential export-controlled IP)
- RAG chunk content containing regulatory data

### The Prompt

> "Guard all `console.*` calls in service files with `if (!import.meta.env.PROD)`.
> This is the standard Vite production guard — `import.meta.env.PROD` is `true` on
> all Vercel production builds and `false` in local dev (`npm run dev`).
> This means logs are fully visible during development and automatically suppressed
> in production. No additional configuration needed for Vercel."

### The Pattern

```typescript
// ✅ CORRECT — visible in dev, suppressed in Vercel production
if (!import.meta.env.PROD) {
  console.error('[classificationService] Step 1 parse error:', step1Response);
}

if (!import.meta.env.PROD) {
  console.warn('[icpService] RAG retrieved 0 chunks for query:', query.substring(0, 80));
}

// ❌ NEVER log these — even in dev:
console.log('Gemini response:', fullResponse);   // reasoning chain leak
console.log('Product input:', productInput);     // confidential user IP
console.log('Supabase error:', error);           // schema leak
```

**Applied in:** `classificationService.ts`, `icpService.ts`, `contractService.ts`,
`reportService.ts`, `retrieval.ts`, `reports.ts`, `sessionPersistence.ts`

**How Vercel handles this:**
- `npm run dev` → `import.meta.env.PROD = false` → all logs visible ✅
- Vercel production build → `import.meta.env.PROD = true` → all logs suppressed ✅
- No extra config in `vercel.json` needed for this behaviour.

---

## 6. Supabase Row Level Security (RLS)

### The Risk

Without RLS, any user with the Supabase `anon` key can read or write any row in any
table, including other users' classification results, ICP analyses, and contract analyses.

### The Prompt

> "Verify RLS is enabled on all user-data tables. Each user should only read/write their
> own rows using `auth.uid() = user_id`. The `regulatory_chunks` knowledge base table
> should be read-only for authenticated users. Run `SELECT tablename, rowsecurity FROM
> pg_tables WHERE schemaname = 'public'` in Supabase SQL Editor to verify."

### The Pattern

```sql
-- User-data tables
ALTER TABLE classification_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own" ON classification_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own" ON classification_results FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Knowledge base — read-only, no user writes ever
ALTER TABLE regulatory_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read-only" ON regulatory_chunks FOR SELECT TO authenticated USING (true);
-- NO INSERT/UPDATE/DELETE policies on regulatory_chunks
```

**RLS table checklist for Glosilex:**

| Table | RLS | Policy |
|---|---|---|
| `classification_results` | ✅ Enabled | SELECT/INSERT where `user_id = auth.uid()` |
| `icp_analyses` | ✅ Enabled | SELECT/INSERT where `user_id = auth.uid()` |
| `contract_analyses` | ✅ Enabled | SELECT/INSERT where `user_id = auth.uid()` |
| `regulatory_chunks` | ✅ Enabled | SELECT only for authenticated, no writes |

---

## 7. Session Persistence Security

### The Risk

`src/utils/sessionPersistence.ts` saves classification state to `localStorage`. Product
descriptions may contain confidential technical specifications for export-controlled goods.
On a shared device, this data persists indefinitely across sessions.

### The Prompt

> "In `sessionPersistence.ts`, ensure: (1) state is stored under a user-scoped key
> `glosilex_classify_${userId}` when logged in, (2) export a `clearAllPersistedState()`
> function called on logout, (3) never store raw AI response text blobs
> (`scometFinding`, `earFinding`, `crossJurisdictionNote`) — store only the structured
> `finalDetermination` and `extractedSpecs` JSON."

### The Pattern

```typescript
const getKey = (base: string, userId?: string) =>
  userId ? `glosilex_${base}_${userId}` : `glosilex_${base}`;

export function saveClassifyState(state: ClassifyState, userId?: string) {
  try {
    const toSave = {
      productDesc: state.productDesc,
      scometEnabled: state.scometEnabled,
      earEnabled: state.earEnabled,
      result: state.result ? {
        id: state.result.id,
        finalDetermination: state.result.finalDetermination,
        extractedSpecs: state.result.extractedSpecs,
        // Omit scometFinding / earFinding — large AI text blobs, not needed for UI restore
      } : null,
    };
    localStorage.setItem(getKey('classify', userId), JSON.stringify(toSave));
  } catch (e) {
    if (!import.meta.env.PROD) console.warn('[sessionPersistence] Save failed:', e);
  }
}

// Call this on every logout
export function clearAllPersistedState() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('glosilex_'))
    .forEach(k => localStorage.removeItem(k));
}
```

---

## 8. RAG Retrieval Security

### The Risk

The `hybrid_search` Supabase RPC retrieves regulatory chunks for classification context.
Risk: `BIS_Entity_List_Part744` (a party screening list, not a product classification
document) leaks into classification citations, creating misleading compliance guidance.

### The Prompt

> "Ensure `BIS_Entity_List_Part744` is permanently excluded from `chunksUsed` in
> `classificationService.ts`. It is a party screening tool, not a product classification
> tool. Also ensure `deduplicateAndRankChunks()` is always called on all retrieved chunks
> before they are passed to the AI or stored in results."

### The Pattern

```typescript
// ✅ At result assembly in classificationService.ts
return {
  id: savedData?.id,
  extractedSpecs,
  scometFinding,
  earFinding,
  crossJurisdictionNote,
  finalDetermination,
  chunksUsed: deduplicateAndRankChunks(
    allChunks.filter((c: any) => c.document_name !== 'BIS_Entity_List_Part744'),
    4
  ),
};
```

---

## ✅ Pre-Launch Security Audit Checklist (Glosilex / Vercel Deployment)

### 🔒 Frozen Model Versions
- [ ] `src/services/embeddings.ts`: model = `gemini-embedding-001`, `outputDimensionality: 768`
- [ ] `src/services/gemini.ts` + `src/lib/gemini.ts`: model = `gemini-2.5-flash`
- [ ] `grep -r "preview" src/services/ src/lib/` returns zero model-name results
- [ ] `grep -r "embedding-2\|gemini-3" src/` returns zero results

### 🔑 API Keys & Secrets
- [ ] All keys via `import.meta.env.VITE_*` only
- [ ] `.env` in `.gitignore` — verified with `git status`
- [ ] `grep -r "AIza\|SERVICE_ROLE\|service_role" src/` returns zero results
- [ ] All three `VITE_*` vars configured in Vercel dashboard

### 🗄️ Supabase Database
- [ ] RLS enabled on `classification_results`, `icp_analyses`, `contract_analyses`
- [ ] `regulatory_chunks`: SELECT only for authenticated, no public writes
- [ ] Verified in SQL Editor: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`

### 📋 Input Validation
- [ ] Product description max 8,000 chars validated before Gemini call
- [ ] PDF text max 150,000 chars validated before Gemini call
- [ ] Jurisdiction values validated against `['SCOMET_INDIA', 'EAR_US']`

### 🛡️ Error Handling
- [ ] All service functions throw generic strings, not raw Supabase error objects
- [ ] `ClassifyErrorBoundary` shows friendly message, discards technical details
- [ ] All `console.*` in service files guarded by `!import.meta.env.PROD`

### 🔍 RAG Pipeline
- [ ] `BIS_Entity_List_Part744` excluded from `chunksUsed` in all results
- [ ] `deduplicateAndRankChunks()` called on all retrieved chunks

### 🧹 Session Persistence
- [ ] `clearAllPersistedState()` called on logout
- [ ] Raw AI text blobs not persisted to localStorage
- [ ] All keys prefixed `glosilex_`

### 🚀 Vercel Production Build
- [ ] `import.meta.env.PROD = true` in production (log guards auto-activate)
- [ ] `sourcemap: false` in `vite.config.ts` for production build

---

## ❌ Common Mistakes to Avoid (Glosilex-Specific)

| Mistake | Why It's Bad | What To Do Instead |
|---|---|---|
| AI agent changes embedding to `gemini-embedding-2-preview` | 3072 dims ≠ 768 dims → zero RAG results → hallucinated classifications | Lock model, include Section 0 of this doc as prompt constraint |
| Removing `outputDimensionality: 768` | Default is 3072, breaks Supabase `vector(768)` column | Always keep `config: { outputDimensionality: 768 }` |
| Using `gemini-3-flash-preview` as LLM | Not a real stable model; decommissioned without notice | Use only `gemini-2.5-flash` (GA stable) |
| `throw error` from Supabase calls directly | Leaks table names, column names, constraint names to UI | Catch and re-throw generic string |
| Logging `productInput` or PDF text | Confidential export-controlled product data exposed | Guard with `!import.meta.env.PROD`, never log input content |
| Not excluding `BIS_Entity_List_Part744` | Party screening list appears in product classification citations | Always filter before `deduplicateAndRankChunks()` |
| RLS disabled on any user-data table | Any user reads all users' data | Enable RLS, scope by `auth.uid() = user_id` |
| Storing raw `scometFinding` in localStorage | Large blobs, may contain confidential RAG context | Store only `finalDetermination` + `extractedSpecs` |

---

*Last updated: April 2026*
*Project: Glosilex / SemiShield — Export Control Intelligence Platform*
*Stack: React + Vite + TypeScript + Supabase + Gemini API*
*Deployment: Vercel (production), AI Studio (development)*
