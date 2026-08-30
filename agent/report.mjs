/**
 * Glosilex — corpus freshness & ingestion report
 * ============================================================================
 *
 * Writes a standalone HTML report answering the questions an administrator
 * actually has:
 *
 *   - What is the newest version the governing body has published?
 *   - What version do we actually hold?
 *   - Do we need to update, and if not, WHY not?
 *   - When did we last refresh (a different question from the version date)?
 *   - Where do I click to check the source myself?
 *   - Is anything in the corpus that nothing is watching?
 *
 * The last one matters most. A monitoring system that silently omits part of
 * what it monitors reports healthy while being blind.
 *
 *   node agent/report.mjs                    -> agent/report.html
 *   node agent/report.mjs --limit 200
 *   node agent/report.mjs --out C:/path/report.html
 *   node agent/report.mjs --no-live          skip the live eCFR check (faster)
 * ============================================================================
 */
import fs from 'fs';
import path from 'path';

const FALLBACK_ENV = 'E:/Job/AI PM/HelloPM/Flagship course/Assignments/Build with AI/semishield-docs/ingest-pipeline/.env';
const env = { ...process.env };
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  for (const p of [path.resolve('.env'), path.resolve('agent/.env'), FALLBACK_ENV]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY };

const args = process.argv.slice(2);
const val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const LIMIT = Number(val('--limit') || 50);
const OUT = val('--out') || path.resolve('agent/report.html');
const LIVE = !args.includes('--no-live');

const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtStamp = d => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never';
const daysSince = d => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;

async function get(q) {
  try {
    const r = await fetch(`${SB}/rest/v1/${q}`, { headers: H, signal: AbortSignal.timeout(45000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const runs = await get(`ingestion_runs?select=*&order=run_started_at.desc&limit=${LIMIT}`) || [];
const registry = await get('corpus_registry?select=*&order=jurisdiction,document_name') || [];
const orphans = await get('unregistered_corpus_documents?select=*') || null;

// ---------------------------------------------------------------------------
// Live check: what has the governing body actually published?
// Only eCFR is machine-checkable. Everything else says so plainly rather than
// guessing.
// ---------------------------------------------------------------------------
const live = {};
if (LIVE) {
  const ecfr = registry.filter(r => r.source_type === 'ecfr' && r.cfr_title && r.cfr_part);
  process.stdout.write(`Checking ${ecfr.length} document(s) against eCFR`);
  const pool = 4;
  for (let i = 0; i < ecfr.length; i += pool) {
    await Promise.all(ecfr.slice(i, i + pool).map(async r => {
      try {
        const res = await fetch(
          `https://www.ecfr.gov/api/versioner/v1/versions/title-${r.cfr_title}.json?part=${r.cfr_part}`,
          { signal: AbortSignal.timeout(40000) });
        if (!res.ok) return;
        const j = await res.json();
        const dates = (j.content_versions || []).map(v => v.amendment_date).filter(Boolean).sort();
        if (dates.length) live[r.document_name] = dates[dates.length - 1];
      } catch { /* leave unknown */ }
      process.stdout.write('.');
    }));
  }
  process.stdout.write('\n');
}

// ---------------------------------------------------------------------------
// The assessment each row needs
// ---------------------------------------------------------------------------
function assess(r) {
  const held = r.last_ingested_amendment;

  if (r.source_type === 'static') {
    return {
      published: r.document_version || fmtDate(held),
      publishedRaw: held,
      status: 'STATIC', cls: 'muted',
      reason: `Published once and immutable — it cannot go out of date. ${r.source_note || ''}`.trim(),
    };
  }

  if (r.source_type === 'manual') {
    const since = daysSince(r.last_reviewed_at || r.last_ingested_at);
    const cadence = r.review_cadence_days;
    const overdue = cadence && since !== null && since > cadence;
    return {
      published: 'human check required',
      publishedRaw: null,
      status: overdue ? 'REVIEW OVERDUE' : 'REVIEW CURRENT',
      cls: overdue ? 'bad' : 'ok',
      reason: overdue
        ? `${r.publisher || 'The publisher'} offers no API, so freshness cannot be established automatically. Last confirmed ${since} days ago against a ${cadence}-day cadence — a human needs to check the source now.`
        : `${r.publisher || 'The publisher'} offers no API. Last confirmed ${since === null ? 'never' : since + ' days'} ago, within the ${cadence}-day review cadence. Nothing automated can improve on this; the check is deliberately human.`,
    };
  }

  // eCFR — machine-checkable
  const pub = live[r.document_name];
  if (!pub) {
    return { published: LIVE ? 'eCFR did not respond' : 'not checked', publishedRaw: null,
             status: 'UNKNOWN', cls: 'warn',
             reason: LIVE
               ? 'The eCFR versioner API did not answer for this document during this run, so its freshness could not be established. Re-run the report.'
               : 'Live checking was disabled with --no-live, so the published version was not fetched.' };
  }
  if (!held) {
    return { published: pub, publishedRaw: pub, status: 'UPDATE NEEDED', cls: 'bad',
             reason: `No copy held at all — this document has never been ingested. eCFR publishes ${fmtDate(pub)}.` };
  }
  if (pub > held) {
    const behind = Math.round((new Date(pub) - new Date(held)) / 86400000);
    return { published: pub, publishedRaw: pub, status: 'UPDATE NEEDED', cls: 'bad',
             reason: `eCFR published an amendment on ${fmtDate(pub)}; the corpus holds ${fmtDate(held)}. The corpus is ${behind} days behind the law.` };
  }
  return { published: pub, publishedRaw: pub, status: 'UP TO DATE', cls: 'ok',
           reason: `The most recent amendment eCFR has published is ${fmtDate(pub)}, and that is exactly the version held. There is nothing newer to ingest.` };
}

const assessed = registry.map(r => ({ ...r, a: assess(r) }));

// ---------------------------------------------------------------------------
const heldChunks = registry.reduce((a, r) => a + (r.chunk_count || 0), 0);
const needUpdate = assessed.filter(r => r.a.status === 'UPDATE NEEDED').length;
const overdue = assessed.filter(r => r.a.status === 'REVIEW OVERDUE').length;
const totalChecks = runs.reduce((a, r) => a + (r.checks?.length || 0), 0);
const failedChecks = runs.reduce((a, r) => a + (r.checks || []).filter(c => c.result === 'FAIL').length, 0);
const halted = runs.filter(r => r.outcome === 'halted_validation').length;

const byJur = {};
for (const r of registry) {
  const j = r.jurisdiction || 'UNKNOWN';
  byJur[j] = byJur[j] || { docs: 0, chunks: 0, stale: 0 };
  byJur[j].docs++; byJur[j].chunks += r.chunk_count || 0;
  if (r.a?.status === 'UPDATE NEEDED' || r.a?.status === 'REVIEW OVERDUE') byJur[j].stale++;
}
// recompute with assessment attached
for (const k of Object.keys(byJur)) byJur[k].stale = 0;
for (const r of assessed) {
  const j = r.jurisdiction || 'UNKNOWN';
  if (r.a.status === 'UPDATE NEEDED' || r.a.status === 'REVIEW OVERDUE') byJur[j].stale++;
}

const badge = o => {
  const c = { ingested: 'ok', no_change: 'muted', editorial_skipped: 'warn', delegated: 'warn',
              halted_validation: 'bad', error: 'bad', dry_run: 'muted' }[o] || 'muted';
  return `<span class="pill ${c}">${esc(o)}</span>`;
};

const watchRows = assessed.map(r => `
  <tr>
    <td>
      <a href="${esc(r.source_url || '#')}" target="_blank" rel="noopener" class="doclink">${esc(r.document_name)}</a>
      <div class="cite">${r.cfr_title ? esc(r.cfr_title) + ' CFR ' + esc(r.cfr_part) : esc(r.document_version || '')}${r.cfr_appendix ? ', ' + esc(r.cfr_appendix) : ''}</div>
      <div class="pubr">${esc(r.publisher || '')}</div>
    </td>
    <td><span class="jur">${esc(r.jurisdiction)}</span><div class="cite">${esc(r.source_type)}</div></td>
    <td class="num">${esc(typeof r.a.published === 'string' && !r.a.publishedRaw ? r.a.published : fmtDate(r.a.publishedRaw))}</td>
    <td class="num">${fmtDate(r.last_ingested_amendment)}</td>
    <td class="num">${fmtStamp(r.last_ingested_at)}</td>
    <td><span class="tick ${r.a.cls}">${esc(r.a.status)}</span></td>
    <td class="num">${(r.chunk_count || 0).toLocaleString()}</td>
  </tr>
  <tr class="reason-row"><td colspan="7"><span class="rlabel">Why:</span> ${esc(r.a.reason)}</td></tr>`).join('');

const runRows = runs.map(r => {
  const checks = r.checks || [];
  const pass = checks.filter(c => c.result === 'PASS').length;
  const fail = checks.filter(c => c.result === 'FAIL').length;
  const skip = checks.filter(c => c.result === 'SKIP').length;
  const checkRows = checks.map(c => `
      <tr class="c-${String(c.result).toLowerCase()}">
        <td><span class="tick ${String(c.result).toLowerCase() === 'pass' ? 'ok' : String(c.result).toLowerCase() === 'fail' ? 'bad' : 'muted'}">${esc(c.result)}</span></td>
        <td>${esc(c.name)}</td><td class="num">${esc(c.expected)}</td><td class="num">${esc(c.actual)}</td>
        <td class="detail">${esc(c.detail || '')}</td>
      </tr>`).join('');
  return `
  <details class="run"${fail ? ' open' : ''}>
    <summary>
      <span class="doc">${esc(r.document_name)}</span>${badge(r.outcome)}
      <span class="ver">${fmtDate(r.previous_amendment)} &rarr; ${fmtDate(r.new_amendment)}</span>
      <span class="counts">${r.chunks_before ?? '—'} &rarr; ${r.chunks_after ?? '—'} chunks</span>
      <span class="checks">${pass} pass${fail ? ` &middot; <b class="bad">${fail} fail</b>` : ''}${skip ? ` &middot; ${skip} skip` : ''}</span>
      <span class="when">${fmtStamp(r.run_started_at)}</span>
    </summary>
    <div class="body">
      ${r.route ? `<p class="route"><b>Executed by:</b> ${esc(r.route)}${r.duration_ms ? ` &middot; ${(r.duration_ms / 1000).toFixed(1)}s` : ''}<br><span class="why">${esc(r.route_reason || '')}</span></p>` : ''}
      ${r.change_summary ? `<p class="summary">${esc(r.change_summary)}</p>` : ''}
      ${r.impact_assessment ? `<p class="impact"><b>Impact:</b> ${esc(r.impact_assessment)}</p>` : ''}
      ${r.error_detail ? `<p class="err">${esc(r.error_detail)}</p>` : ''}
      ${checks.length ? `<div class="tblwrap"><table>
        <thead><tr><th></th><th>Check</th><th>Expected</th><th>Actual</th><th>Why it matters</th></tr></thead>
        <tbody>${checkRows}</tbody></table></div>` : '<p class="muted">No checks recorded — this run predates check recording.</p>'}
    </div>
  </details>`;
}).join('');

const orphanBlock = orphans === null
  ? `<p class="muted">Reconciliation view not found — run <code>agent/migration-full-coverage.sql</code> to enable it.</p>`
  : orphans.length === 0
    ? `<p class="okline">Every document in the corpus is on the watchlist. No blind spots.</p>`
    : `<p class="err"><b>${orphans.length} document(s) in the corpus are watched by nothing.</b> They are being served to users with no freshness guarantee.</p>
       <div class="tblwrap"><table><thead><tr><th>Document</th><th>Regime</th><th>Chunks</th></tr></thead><tbody>
       ${orphans.map(o => `<tr><td>${esc(o.document_name)}</td><td>${esc(o.jurisdiction)}</td><td class="num">${o.chunks}</td></tr>`).join('')}
       </tbody></table></div>`;

const jurRows = Object.entries(byJur).sort((a, b) => b[1].chunks - a[1].chunks).map(([j, v]) => `
  <tr><td><span class="jur">${esc(j)}</span></td><td class="num">${v.docs}</td>
      <td class="num">${v.chunks.toLocaleString()}</td>
      <td>${v.stale ? `<span class="tick bad">${v.stale} need attention</span>` : '<span class="tick ok">all current</span>'}</td></tr>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Glosilex Corpus Report</title>
<style>
:root{--bg:#F6F7F9;--card:#fff;--ink:#141A22;--soft:#4A5568;--faint:#7B8698;--rule:#DCE0E7;
--ok:#0B6E5F;--okbg:#E2F0ED;--bad:#A62F1B;--badbg:#F8E7E3;--warn:#8A5A00;--warnbg:#F8EFDC;--sunk:#EDEFF3;}
@media(prefers-color-scheme:dark){:root{--bg:#0D1116;--card:#151B23;--ink:#E6EAF0;--soft:#A9B4C2;
--faint:#77828F;--rule:#28313C;--ok:#39BFA6;--okbg:#12312C;--bad:#E4735C;--badbg:#37201B;
--warn:#D9A441;--warnbg:#332714;--sunk:#1D242E;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 Georgia,"Times New Roman",serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1240px;margin:0 auto;padding:36px 22px 80px}
h1,h2,summary,th,.pill,.tick,.stat b,.stat span,.jur,.rlabel{font-family:"Helvetica Neue",Arial,sans-serif}
h1{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px}
.sub{color:var(--soft);margin:0 0 26px;max-width:76ch}
h2{font-size:18px;font-weight:600;margin:38px 0 6px}
.h2note{color:var(--faint);font-size:13.5px;margin:0 0 12px;max-width:80ch}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:12px}
.stat{background:var(--card);border:1px solid var(--rule);border-radius:5px;padding:14px 16px}
.stat b{display:block;font-size:25px;font-weight:700;font-variant-numeric:tabular-nums}
.stat span{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:13.5px}
.tblwrap{overflow-x:auto;border:1px solid var(--rule);border-radius:5px;background:var(--card)}
th{text-align:left;padding:9px 12px;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;
color:var(--faint);background:var(--sunk);border-bottom:1px solid var(--rule);font-weight:600;white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
.reason-row td{border-bottom:1px solid var(--rule);padding-top:0;color:var(--faint);font-size:12.5px}
.rlabel{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-right:6px}
.num{font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
.doclink{color:var(--ink);font-weight:600;text-decoration:none;border-bottom:1px solid var(--rule)}
.doclink:hover{color:var(--ok);border-color:var(--ok)}
.cite,.pubr{font-size:11.5px;color:var(--faint);font-family:ui-monospace,Menlo,monospace}
.pubr{font-family:"Helvetica Neue",Arial,sans-serif}
.jur{font-size:10px;font-weight:600;letter-spacing:.07em;padding:2px 6px;border-radius:3px;background:var(--sunk);color:var(--soft)}
.pill,.tick{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;padding:3px 7px;border-radius:3px;white-space:nowrap;display:inline-block}
.pill.ok,.tick.ok{background:var(--okbg);color:var(--ok)}
.pill.bad,.tick.bad{background:var(--badbg);color:var(--bad)}
.pill.warn,.tick.warn{background:var(--warnbg);color:var(--warn)}
.pill.muted,.tick.muted{background:var(--sunk);color:var(--soft)}
b.bad{color:var(--bad)}
.run{background:var(--card);border:1px solid var(--rule);border-radius:5px;margin-bottom:8px}
.run summary{cursor:pointer;padding:13px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:13.5px}
.run[open] summary{border-bottom:1px solid var(--rule)}
.doc{font-weight:600;min-width:190px}
.ver,.counts{color:var(--soft);font-family:ui-monospace,Menlo,monospace;font-size:12px}
.checks{margin-left:auto;color:var(--soft);font-size:12px}
.when{color:var(--faint);font-size:11.5px;width:100%}
.body{padding:16px}
.route,.summary,.impact,.err,.okline{margin:0 0 12px;max-width:78ch}
.why{color:var(--faint);font-size:13.5px}
.err{color:var(--bad)}
.okline{color:var(--ok)}
.detail{color:var(--faint);font-size:12.5px;max-width:38ch}
.c-fail{background:var(--badbg)}
.muted{color:var(--faint)}
code{font-family:ui-monospace,Menlo,monospace;font-size:.87em;background:var(--sunk);padding:1px 5px;border-radius:3px}
.legend{background:var(--card);border:1px solid var(--rule);border-left:3px solid var(--ok);
border-radius:0 5px 5px 0;padding:14px 18px;margin:12px 0 20px;font-size:13.5px;max-width:80ch}
.legend b{font-family:"Helvetica Neue",Arial,sans-serif}
footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--rule);
color:var(--faint);font-size:12px;font-family:ui-monospace,Menlo,monospace}
</style></head><body><div class="wrap">
<h1>Glosilex Corpus Report</h1>
<p class="sub">What the law says today, what the corpus holds, and every check the agent ran before changing anything.</p>

<div class="stats">
  <div class="stat"><b>${heldChunks.toLocaleString()}</b><span>chunks held</span></div>
  <div class="stat"><b>${registry.length}</b><span>documents tracked</span></div>
  <div class="stat"><b>${Object.keys(byJur).length}</b><span>jurisdictions</span></div>
  <div class="stat"><b style="color:${needUpdate ? 'var(--bad)' : 'inherit'}">${needUpdate}</b><span>need update</span></div>
  <div class="stat"><b style="color:${overdue ? 'var(--bad)' : 'inherit'}">${overdue}</b><span>review overdue</span></div>
  <div class="stat"><b style="color:${failedChecks ? 'var(--bad)' : 'inherit'}">${failedChecks}</b><span>checks failed</span></div>
</div>

<h2>Coverage by jurisdiction</h2>
<p class="h2note">Glosilex claims dual-jurisdiction coverage. This table is where that claim is either true or not.</p>
<div class="tblwrap"><table>
<thead><tr><th>Regime</th><th>Documents</th><th>Chunks</th><th>Freshness</th></tr></thead>
<tbody>${jurRows}</tbody></table></div>

<h2>Blind-spot check</h2>
<p class="h2note">Any document present in the corpus but absent from the watchlist is being served to users with nothing monitoring it.</p>
${orphanBlock}

<h2>Corpus freshness</h2>
<div class="legend">
  <b>The two dates mean different things.</b><br>
  <b>Published version</b> — the newest amendment the governing body has issued${LIVE ? ', fetched live from eCFR when this report was generated' : ' (live check skipped this run)'}.<br>
  <b>Version held</b> — the version of the document sitting in our corpus. This is a <i>document</i> date, not an activity date.<br>
  <b>Last refreshed</b> — when our pipeline last wrote this document into Supabase. This is an <i>activity</i> timestamp.<br>
  A document can be refreshed today and still hold a 2024 version, if 2024 is the newest amendment that exists. That is correct, not stale.
</div>
<div class="tblwrap"><table>
<thead><tr><th>Document</th><th>Regime</th><th>Published version</th><th>Version held</th><th>Last refreshed</th><th>Status</th><th>Chunks</th></tr></thead>
<tbody>${watchRows}</tbody></table></div>

<h2>Run history</h2>
<p class="h2note">${totalChecks} checks recorded across ${runs.length} runs${halted ? `. ${halted} run(s) halted on validation — the previous corpus was preserved each time.` : '.'}</p>
${runRows || '<p class="muted">No runs recorded yet.</p>'}

<footer>Generated ${new Date().toLocaleString('en-GB')} from corpus_registry, ingestion_runs and ${LIVE ? 'a live eCFR check' : 'cached data (--no-live)'}.<br>
Glosilex Regulatory Corpus Sentinel.</footer>
</div></body></html>`;

fs.writeFileSync(OUT, html);
console.log(`\nReport written: ${OUT}`);
console.log(`  ${registry.length} documents, ${heldChunks.toLocaleString()} chunks, ${Object.keys(byJur).length} jurisdictions`);
console.log(`  ${needUpdate} need update, ${overdue} review overdue, ${failedChecks} checks failed`);
if (orphans && orphans.length) console.log(`  WARNING: ${orphans.length} corpus document(s) not on the watchlist`);
console.log('');
