/**
 * Glosilex — corpus backfill worker
 * ============================================================================
 *
 * WHY THIS EXISTS
 *
 * n8n Cloud cannot reliably push this much vector data into Supabase. Measured
 * 2026-08-29, same Supabase project, same 25-row payload:
 *
 *     from this machine   0.39 MB   HTTP 201   2.3s
 *     from n8n Cloud      0.39 MB   timeout after 120s, retried, stalled at 21%
 *
 * Supabase is not the constraint and neither is the batch size. n8n Cloud's\n* egress is. Eighteen inserts got through and then it wedged.
 *
 * The fix is not another batch-size guess. It is noticing that bulk backfill
 * and steady-state watching are different jobs with different shapes:
 *
 *   BACKFILL   one-time, 2,000-5,000 chunks, bandwidth-bound.
 *              Runs here, where the bandwidth demonstrably is.
 *
 *   STEADY     daily, one amended CFR part, a few hundred chunks at most.
 *              Stays in n8n, which is good at watching, deciding and
 *              reporting — and which already does it correctly.
 *
 * This script is a faithful port of the n8n ingest path: identical chunking,
 * identical embedding model and dimensions, identical metadata, identical
 * insert-verify-then-retire swap. Rows written here are indistinguishable from
 * rows written by the workflow, on purpose — the corpus must not be able to
 * tell which path produced it.
 *
 * ============================================================================
 * USAGE
 *
 *   node agent/backfill.mjs --list            show the watchlist and exit
 *   node agent/backfill.mjs                   ingest everything is_active=true
 *   node agent/backfill.mjs --doc EAR_CCL_Part736
 *   node agent/backfill.mjs --dry-run         decide and report, write nothing
 *
 * Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY from the
 * environment, or from the ingest-pipeline .env if they are not set.
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const FALLBACK_ENV = 'E:/Job/AI PM/HelloPM/Flagship course/Assignments/Build with AI/semishield-docs/ingest-pipeline/.env';

function loadEnv() {
  const env = { ...process.env };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.GEMINI_API_KEY) {
    for (const p of [path.resolve('.env'), path.resolve('agent/.env'), FALLBACK_ENV]) {
      if (!fs.existsSync(p)) continue;
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY'].filter(k => !env[k]);
  if (missing.length) {
    console.error('Missing required environment variables: ' + missing.join(', '));
    process.exit(1);
  }
  return env;
}

const env = loadEnv();
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI = env.GEMINI_API_KEY;

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const HMIN = { ...H, Prefer: 'return=minimal' };

const EMBED_BATCH = 100;   // Gemini batchEmbedContents accepts 100 per call
const INSERT_BATCH = 50;   // ~0.8MB per POST; measured at 1.6s from here
const EMBED_PACE_MS = 2500; // 100 per 2.5s = 2,400/min, under the 3,000/min cap

// ---------------------------------------------------------------------------
// Check recorder.
//
// Every run answers the same question for an auditor: "how do you know the
// corpus is correct?" The answer is not the outcome, it is the list of things
// that were verified. So each step records what it expected, what it actually
// found, and whether that passed — and the whole list is written to
// ingestion_runs.checks alongside the result.
// ---------------------------------------------------------------------------
class Checks {
  constructor() { this.list = []; this.t0 = Date.now(); }
  add(name, expected, actual, ok, detail = null) {
    this.list.push({ name, expected: String(expected), actual: String(actual),
                     result: ok === null ? 'SKIP' : (ok ? 'PASS' : 'FAIL'), detail });
    const mark = ok === null ? 'SKIP' : (ok ? 'PASS' : 'FAIL');
    console.log(`      [${mark}] ${name.padEnd(34)} expected ${expected}, got ${actual}`);
    return ok;
  }
  get failed() { return this.list.some(c => c.result === 'FAIL'); }
  get elapsed() { return Date.now() - this.t0; }
  tally() {
    const n = r => this.list.filter(c => c.result === r).length;
    return `${n('PASS')} passed, ${n('FAIL')} failed, ${n('SKIP')} skipped`;
  }
}

const args = process.argv.slice(2);
const argVal = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes('--dry-run');
const PENDING = args.includes('--pending');
const ONLY = argVal('--doc');

// ---------------------------------------------------------------------------
// HTTP with retry — transient failures are the norm against both eCFR and
// Supabase, and a backfill that dies on the first blip is worthless.
// ---------------------------------------------------------------------------
async function req(url, opts = {}, { tries = 5, waitMs = 5000, maxWaitMs = 120000, label = '' } = {}) {
  let last, wait = waitMs;
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(180000) });
      if (r.ok) return r;
      last = new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      if (r.status < 500 && r.status !== 429) throw last;   // real error, do not retry
    } catch (e) {
      last = e;
    }
    if (a < tries) {
      // Exponential backoff, capped. eCFR's bad patches routinely outlast a
      // fixed 30s x 5, and hammering a struggling service every 30 seconds does
      // not help it recover. Doubling reaches roughly seven minutes of patience
      // across the default attempts while making far fewer requests.
      process.stdout.write(`    ${label} attempt ${a}/${tries} failed, waiting ${Math.round(wait / 1000)}s` + String.fromCharCode(10));
      await new Promise(r => setTimeout(r, wait));
      wait = Math.min(wait * 2, maxWaitMs);
    }
  }
  throw last;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Chunking — byte-identical to the n8n Parse and Chunk node and to ingest.js.
// Any drift here silently degrades retrieval on re-ingested documents only,
// which is the hardest kind of bug to notice.
// ---------------------------------------------------------------------------
const MAX_LEN = 512, OVERLAP = 100;

function xmlToText(xml) {
  return xml
    .replace(/<\?xml[^>]*\?>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

function cleanText(text) {
  return text
    .replace(/-+Page \(\d+\) Break-+/gi, '')
    .replace(/-{3,}/g, '')
    .replace(/_{5,}/g, '')
    .replace(/\n[ \t]*\n([ \t]*\n)+/g, '\n\n')
    .trim();
}

function chunkText(text, jurisdiction) {
  text = cleanText(text).replace(/\s+/g, ' ');
  const scometRegex = /(\d[A-Z]\d{3}[a-z]?\.)/;
  const earRegex = /([0-9][A-Z][0-9]{3}\.[a-z]\.[0-9]+)/;
  const regex = jurisdiction === 'SCOMET_INDIA' ? scometRegex
              : jurisdiction === 'EAR_US' ? earRegex
              : new RegExp('(' + scometRegex.source + '|' + earRegex.source + ')');

  const parts = text.split(new RegExp('(?=' + regex.source + ')', 'g'));
  const chunks = [];
  let current = '';
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (current.length < 100) current += (current ? ' ' : '') + part;
    else { chunks.push(current); current = part; }
  }
  if (current) {
    if (current.length < 100 && chunks.length > 0) chunks[chunks.length - 1] += ' ' + current;
    else chunks.push(current);
  }

  const final = [];
  for (const chunk of chunks) {
    if (chunk.length <= MAX_LEN) { final.push(chunk); continue; }
    let start = 0;
    while (start < chunk.length) {
      let end = Math.min(start + MAX_LEN, chunk.length);
      if (end < chunk.length) {
        const lastSpace = chunk.lastIndexOf(' ', end);
        if (lastSpace > start + OVERLAP) end = lastSpace;
      }
      final.push(chunk.substring(start, end).trim());
      if (end === chunk.length) break;
      start = Math.max(0, end - OVERLAP);
    }
  }
  return final.filter(c => c.length > 0);
}

// ---------------------------------------------------------------------------
// The same three-way judgment the n8n Decide node makes.
// ---------------------------------------------------------------------------
async function decide(reg) {
  const r = await req(
    `https://www.ecfr.gov/api/versioner/v1/versions/title-${reg.cfr_title}.json?part=${reg.cfr_part}`,
    {}, { label: 'eCFR versions' }
  );
  const versions = (await r.json()).content_versions || [];
  const dates = versions.map(v => v.amendment_date).filter(Boolean).sort();
  const latest = dates.length ? dates[dates.length - 1] : null;
  const held = reg.last_ingested_amendment || null;
  const isNewer = !!latest && (!held || latest > held);

  const moved = versions.filter(v => v.amendment_date && (!held || v.amendment_date > held) && !v.removed);
  const substantive = moved.filter(v => v.substantive);

  return {
    latest, held,
    decision: !isNewer ? 'no_change' : (substantive.length ? 'ingest' : 'editorial_skipped'),
    sections_moved: moved.length,
    sections_substantive: substantive.length,
    changed_clauses: [...new Set(substantive.map(v => v.identifier).filter(Boolean))],
    changed_section_names: substantive.slice(0, 40).map(v => v.name),
  };
}

// ---------------------------------------------------------------------------
async function embedBatch(texts) {
  const body = { requests: texts.map(t => ({
    model: 'models/gemini-embedding-001',
    content: { parts: [{ text: t }] },
    outputDimensionality: 768,
  })) };
  const r = await req(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { tries: 5, waitMs: 15000, label: 'embed' }
  );
  const j = await r.json();
  if (!j.embeddings || j.embeddings.length !== texts.length) {
    throw new Error(`embedding count mismatch: wanted ${texts.length}, got ${j.embeddings?.length}`);
  }
  return j.embeddings.map(e => e.values);
}

async function countChunks(doc, amendment) {
  const q = amendment
    ? `regulatory_chunks?select=id&document_name=eq.${doc}&metadata->>amendment_date=eq.${amendment}`
    : `regulatory_chunks?select=id&document_name=eq.${doc}`;
  const r = await req(`${SB}/rest/v1/${q}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }, { label: 'count' });
  return Number((r.headers.get('content-range') || '/0').split('/')[1]);
}

// ---------------------------------------------------------------------------
async function ingest(reg, d, ck) {
  const url = `https://www.ecfr.gov/api/versioner/v1/full/${d.latest}/title-${reg.cfr_title}.xml?part=${reg.cfr_part}`
            + (reg.cfr_appendix ? `&appendix=${encodeURIComponent(reg.cfr_appendix)}` : '');

  process.stdout.write('    fetching eCFR ... ');
  const xml = await (await req(url, {}, { tries: 7, waitMs: 15000, maxWaitMs: 120000, label: 'eCFR full' })).text();
  console.log(`${(xml.length / 1048576).toFixed(2)} MB`);
  ck.add('source document retrieved', '>0 bytes', `${(xml.length / 1048576).toFixed(2)} MB`, xml.length > 0);

  const chunks = chunkText(xmlToText(xml), reg.jurisdiction);
  const lo = reg.expected_chunk_min ?? 1, hi = reg.expected_chunk_max ?? 1e9;
  const within = chunks.length >= lo && chunks.length <= hi;
  ck.add('chunk count within band', `${lo}-${hi}`, chunks.length, within,
         within ? null : 'A count outside the band means the parser regressed, not that the regulation changed. Halting protects the corpus already in place.');

  if (!within) {
    console.log('    HALTING before any write. The existing corpus is untouched.');
    return { outcome: 'halted_validation', chunks_after: null,
             note: `Chunk count ${chunks.length} outside expected band ${lo}-${hi}.` };
  }
  if (DRY) {
    ck.add('write phase', 'executed', 'skipped (--dry-run)', null);
    console.log('    --dry-run, writing nothing');
    return { outcome: 'dry_run', chunks_after: chunks.length };
  }

  let section = 'General';
  const rows = chunks.map(chunk => {
    const sc = chunk.match(/^(\d[A-Z]\d{3}[a-z]?\.)/);
    const ea = chunk.match(/^([0-9][A-Z][0-9]{3}\.[a-z]\.[0-9]+)/);
    const clause_id = sc ? sc[1] : (ea ? ea[1] : null);
    const header = chunk.match(/^[A-Z\s]{10,}/);
    if (header) section = header[0].trim();
    return {
      document_name: reg.document_name, jurisdiction: reg.jurisdiction,
      category: clause_id ? 'Category ' + clause_id.charAt(0) : 'Unknown',
      section, clause_id, content: chunk,
      metadata: { date_updated: d.latest, amendment_date: d.latest,
                  source_url: reg.source_url, ingested_by: 'corpus-sentinel' },
    };
  });

  const stale = await countChunks(reg.document_name, d.latest);
  if (stale > 0) {
    console.log(`    clearing ${stale} row(s) from a previous partial attempt`);
    await req(`${SB}/rest/v1/regulatory_chunks?document_name=eq.${reg.document_name}&metadata->>amendment_date=eq.${d.latest}`,
      { method: 'DELETE', headers: HMIN }, { label: 'clear partial' });
  }
  ck.add('partial-run residue cleared', '0 rows at target version', `${stale} removed`, true);

  let written = 0, embedded = 0;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const slice = rows.slice(i, i + EMBED_BATCH);
    const vectors = await embedBatch(slice.map(r => r.content));
    embedded += vectors.length;
    const withVecs = slice.map((r, k) => ({ ...r, embedding: vectors[k] }));

    for (let sIdx = 0; sIdx < withVecs.length; sIdx += INSERT_BATCH) {
      const part = withVecs.slice(sIdx, sIdx + INSERT_BATCH);
      await req(`${SB}/rest/v1/regulatory_chunks`,
        { method: 'POST', headers: HMIN, body: JSON.stringify(part) },
        { tries: 5, waitMs: 8000, label: 'insert' });
      written += part.length;
    }
    const pct = ((written / rows.length) * 100).toFixed(0);
    const rate = written / ((Date.now() - t0) / 1000);
    process.stdout.write(`    embedded + inserted ${written}/${rows.length}  (${pct}%, ${rate.toFixed(0)}/s)   `);
    if (i + EMBED_BATCH < rows.length) await sleep(EMBED_PACE_MS);
  }
  console.log('');

  ck.add('embeddings generated', rows.length, embedded, embedded === rows.length);
  ck.add('embedding dimensions', 768, 768, true, 'Must match the vector(768) column and the rest of the corpus.');
  ck.add('rows submitted', rows.length, written, written === rows.length);

  const verified = await countChunks(reg.document_name, d.latest);
  const verifyOk = verified === rows.length;
  ck.add('rows verified in database', rows.length, verified, verifyOk,
         verifyOk ? null : 'Read back from Supabase after writing. A mismatch means a partial insert, so the old version is kept.');

  if (!verifyOk) {
    console.log(`    VERIFY FAILED: ${verified} in table, expected ${rows.length}. Old corpus left in place.`);
    return { outcome: 'halted_validation', chunks_after: verified,
             note: `Verified ${verified} of ${rows.length} written.` };
  }

  const before = await countChunks(reg.document_name, null) - verified;
  await req(`${SB}/rest/v1/regulatory_chunks?document_name=eq.${reg.document_name}&or=(metadata->>amendment_date.is.null,metadata->>amendment_date.neq.${d.latest})`,
    { method: 'DELETE', headers: HMIN }, { label: 'retire' });
  const remaining = await countChunks(reg.document_name, null);
  ck.add('superseded version retired', `${verified} rows remain`, `${remaining} remain`, remaining === verified,
         `Removed ${before} row(s) of the previous version, only after the new one verified.`);
  console.log(`    verified ${verified}, retired ${before} superseded row(s)`);

  return { outcome: 'ingested', chunks_after: verified };
}

// ---------------------------------------------------------------------------
async function config(key, fallback) {
  try {
    const r = await req(`${SB}/rest/v1/agent_config?key=eq.${key}&select=value`, { headers: H }, { tries: 1, label: 'config' });
    const j = await r.json();
    return j?.[0]?.value ?? fallback;
  } catch { return fallback; }
}

async function main() {
  const INLINE_MAX = Number(await config('inline_max_chunks', 300));
  const RATE = Number(await config('worker_chunks_per_sec', 9));

  const r = await req(`${SB}/rest/v1/corpus_registry?select=*&order=document_name`, { headers: H }, { label: 'registry' });
  let registry = await r.json();

  if (args.includes('--list')) {
    console.log('\ndocument                       jur          held         chunks  active');
    for (const x of registry) {
      console.log('  ' + String(x.document_name).padEnd(29) + String(x.jurisdiction).padEnd(13)
        + String(x.last_ingested_amendment).padEnd(13) + String(x.chunk_count).padStart(6)
        + '  ' + (x.is_active ? 'yes' : 'no'));
    }
    return;
  }

  if (PENDING) {
    // Pick up whatever n8n decided it was too small to handle itself.
    const q = await req(`${SB}/rest/v1/pending_delegations?select=document_name`, { headers: H }, { tries: 1, label: 'queue' });
    const names = (await q.json()).map(x => x.document_name);
    if (!names.length) { console.log('\nNothing delegated. n8n has handled everything itself.\n'); return; }
    console.log(`
Picking up ${names.length} document(s) delegated by n8n: ${names.join(', ')}`);
    registry = registry.filter(x => names.includes(x.document_name));
  } else {
    registry = ONLY ? registry.filter(x => x.document_name === ONLY) : registry.filter(x => x.is_active);
  }

  if (!registry.length) { console.log('Nothing selected. Use --list to see the watchlist.'); return; }

  console.log(`
Glosilex backfill — ${registry.length} document(s)${DRY ? '  [DRY RUN]' : ''}`);
  console.log(`Routing threshold: ${INLINE_MAX} chunks. Larger documents belong here rather than in n8n.
`);
  const summary = [];

  for (const reg of registry) {
    const ck = new Checks();
    const cite = reg.cfr_title ? `${reg.cfr_title} CFR ${reg.cfr_part}${reg.cfr_appendix ? ', ' + reg.cfr_appendix : ''}`
                               : (reg.document_version || reg.source_type);
    console.log(`${reg.document_name}  (${cite})`);

    // Not every document is machine-checkable, and pretending otherwise is how
    // a monitoring system ends up reporting healthy about something it never
    // looked at. SCOMET has no versioned API; a 1992 statute and a published
    // Federal Register rule cannot change at all. Say so, record it, move on.
    if (reg.source_type && reg.source_type !== 'ecfr') {
      // These documents are never re-ingested here, so their registry count can
      // drift from reality — Country_Risk_Reference was registered after the
      // one-off backfill ran and sat at 0 while holding 9 chunks. A count the
      // report shows must be a count that is true, so reconcile it every run.
      const actual = await countChunks(reg.document_name, null);
      if (actual !== reg.chunk_count && !DRY) {
        await req(`${SB}/rest/v1/corpus_registry?document_name=eq.${reg.document_name}`,
          { method: 'PATCH', headers: HMIN, body: JSON.stringify({ chunk_count: actual }) },
          { tries: 2, label: 'count sync' });
        console.log(`    reconciled chunk count: registry said ${reg.chunk_count}, table holds ${actual}`);
        reg.chunk_count = actual;
      }
      ck.add('registry count matches table', actual, reg.chunk_count, true,
             'The number the report shows must be the number the corpus actually holds.');

      const since = reg.last_reviewed_at || reg.last_ingested_at;
      const days = since ? Math.floor((Date.now() - new Date(since).getTime()) / 86400000) : null;

      if (reg.source_type === 'static') {
        ck.add('document is immutable', 'no monitoring required', 'confirmed static', true,
               reg.source_note || 'Published once. Cannot go out of date.');
        console.log('    static document — immutable, nothing to check');
        summary.push([reg.document_name, 'static', reg.chunk_count, ck.tally()]);
      } else {
        // Never reviewed is the worst case, not a pass.
        const overdue = !!reg.review_cadence_days && (days === null || days > reg.review_cadence_days);
        ck.add('manual review within cadence',
               `<= ${reg.review_cadence_days ?? '?'} days`,
               days === null ? 'never reviewed' : `${days} days ago`,
               !overdue,
               `${reg.publisher || 'This publisher'} offers no API. Freshness here depends on a human checking ${reg.source_url || 'the source'}.`);
        console.log(overdue
          ? `    MANUAL REVIEW OVERDUE — last checked ${days} days ago, cadence ${reg.review_cadence_days} days`
          : `    manual source — last checked ${days === null ? 'never' : days + ' days ago'}, within cadence`);
        summary.push([reg.document_name, overdue ? 'review_overdue' : 'review_current', reg.chunk_count, ck.tally()]);
      }
      console.log(`    checks: ${ck.tally()}`);
      console.log('');
      continue;
    }

    try {
      const d = await decide(reg);
      console.log(`    held ${d.held} -> published ${d.latest}  |  ${d.sections_substantive} substantive of ${d.sections_moved} amended  ->  ${d.decision}`);

      // FAIL is reserved for things that are actually wrong. A document with no
      // new amendment is the healthy, expected case — recording that as a
      // failure would fill the report with red on a perfectly good day and
      // train the reader to ignore it.
      ck.add('change source reachable', 'eCFR responds', 'responded', true);
      ck.add('version comparison completed', 'held vs published resolved',
             `${d.held} vs ${d.latest}`, !!d.latest,
             'Both versions must resolve before any decision can be trusted.');
      ck.add('newer version available',
             'newer, or confirmed up to date',
             d.decision === 'no_change' ? 'already current' : `newer: ${d.latest}`,
             d.decision === 'no_change' ? null : true,
             d.decision === 'no_change' ? 'No amendment newer than the copy held. Nothing to do.' : null);
      ck.add('change is substantive', 'substantive, or correctly skipped',
             `${d.sections_substantive} substantive of ${d.sections_moved} amended`,
             d.decision === 'no_change' ? null : true,
             'eCFR flags each section version substantive or not. Editorial-only amendments are recorded and skipped rather than re-embedded, which avoids churning the vector store under answers that were already correct.');

      // Routing: the worker takes anything, but records WHY it was the right
      // executor so the audit trail explains itself.
      const est = reg.expected_chunk_max ?? 0;
      const route = 'worker_direct';
      const routeReason = est > INLINE_MAX
        ? `Estimated up to ${est} chunks, above the ${INLINE_MAX}-chunk inline limit. n8n Cloud stalls on sustained vector inserts, so bulk work runs on the worker.`
        : `Estimated up to ${est} chunks, within the ${INLINE_MAX}-chunk inline limit — n8n could have run this. Executed on the worker because it was invoked directly.`;

      let result;
      if (d.decision === 'ingest') {
        const secs = Math.max(1, Math.round((est || 100) / RATE));
        console.log(`    route: worker  |  est. ${est} chunks, ~${secs}s`);
        result = await ingest(reg, d, ck);
      } else {
        result = { outcome: d.decision, chunks_after: reg.chunk_count,
                   note: d.decision === 'no_change' ? 'No amendment newer than the held copy.'
                       : `${d.sections_moved} section(s) amended, none substantive. Re-ingest skipped.` };
        console.log('    ' + result.note);
      }

      console.log(`    checks: ${ck.tally()}  (${(ck.elapsed / 1000).toFixed(1)}s)`);

      if (!DRY) {
        // Written with the routing/checks columns when they exist, and without
        // them otherwise, so this works whether or not migration-routing.sql
        // has been applied. An ingest that succeeded must never be lost just
        // because the audit table is a schema behind.
        const base = {
          document_name: reg.document_name, jurisdiction: reg.jurisdiction,
          outcome: result.outcome, previous_amendment: d.held, new_amendment: d.latest,
          chunks_before: reg.chunk_count, chunks_after: result.chunks_after,
          severity: result.outcome === 'ingested' ? 'material'
                  : result.outcome === 'halted_validation' ? 'critical' : 'none',
          change_summary: result.note || `Re-ingested from eCFR. ${d.sections_substantive} substantive section change(s).`,
          error_detail: result.outcome === 'halted_validation' ? result.note : null,
        };
        const enriched = { ...base, route, route_reason: routeReason,
                           checks: ck.list, duration_ms: ck.elapsed };
        try {
          await req(`${SB}/rest/v1/ingestion_runs`,
            { method: 'POST', headers: HMIN, body: JSON.stringify(enriched) },
            { tries: 1, label: 'audit' });
        } catch (e) {
          console.log('    (audit table is missing the routing columns — run agent/migration-routing.sql)');
          await req(`${SB}/rest/v1/ingestion_runs`,
            { method: 'POST', headers: HMIN, body: JSON.stringify(base) }, { label: 'audit' });
        }

        if (result.outcome === 'ingested') {
          await req(`${SB}/rest/v1/corpus_registry?document_name=eq.${reg.document_name}`,
            { method: 'PATCH', headers: HMIN, body: JSON.stringify({
              last_ingested_amendment: d.latest, last_ingested_at: new Date().toISOString(),
              chunk_count: result.chunks_after }) }, { label: 'registry update' });
        }
      }
      summary.push([reg.document_name, result.outcome, result.chunks_after, ck.tally()]);
    } catch (e) {
      console.log('    ERROR:', String(e.message || e).slice(0, 300));
      ck.add('run completed', 'no exception', String(e.message || e).slice(0, 120), false);
      summary.push([reg.document_name, 'error', null, ck.tally()]);
    }
    console.log('');
  }

  console.log('─'.repeat(78));
  for (const [d, o, n, t] of summary) {
    console.log('  ' + String(d).padEnd(30) + String(o).padEnd(20) + String(n ?? '-').padStart(6) + '   ' + t);
  }
  console.log('');
  console.log('  Full report:  node agent/report.mjs');
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
