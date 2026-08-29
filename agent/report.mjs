/**
 * Glosilex — ingestion report generator
 * ============================================================================
 *
 * Reads ingestion_runs and corpus_registry and writes a standalone HTML report
 * of every decision the agent made and every check it performed.
 *
 * Why this exists: a compliance product is judged on whether it can show its
 * working. "The corpus is current" is a claim. "Here are 47 runs, the version
 * each moved from and to, and the nine checks that passed before anything was
 * deleted" is evidence. An auditor asking how you know your corpus is correct
 * wants the second one.
 *
 *   node agent/report.mjs                    last 50 runs -> agent/report.html
 *   node agent/report.mjs --limit 200
 *   node agent/report.mjs --out C:/path/to/report.html
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

const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const runs = await (await fetch(
  `${SB}/rest/v1/ingestion_runs?select=*&order=run_started_at.desc&limit=${LIMIT}`, { headers: H })).json();
const registry = await (await fetch(
  `${SB}/rest/v1/corpus_registry?select=*&order=document_name`, { headers: H })).json();

if (!Array.isArray(runs)) { console.error('Could not read ingestion_runs:', runs); process.exit(1); }

const totalChecks = runs.reduce((a, r) => a + (r.checks?.length || 0), 0);
const failedChecks = runs.reduce((a, r) => a + (r.checks || []).filter(c => c.result === 'FAIL').length, 0);
const ingested = runs.filter(r => r.outcome === 'ingested').length;
const halted = runs.filter(r => r.outcome === 'halted_validation').length;
const heldChunks = registry.reduce((a, r) => a + (r.chunk_count || 0), 0);

const badge = o => {
  const c = { ingested: 'ok', no_change: 'muted', editorial_skipped: 'warn',
              halted_validation: 'bad', error: 'bad', dry_run: 'muted' }[o] || 'muted';
  return `<span class="pill ${c}">${esc(o)}</span>`;
};

const rows = runs.map(r => {
  const checks = r.checks || [];
  const pass = checks.filter(c => c.result === 'PASS').length;
  const fail = checks.filter(c => c.result === 'FAIL').length;
  const skip = checks.filter(c => c.result === 'SKIP').length;
  const checkRows = checks.map(c => `
      <tr class="c-${String(c.result).toLowerCase()}">
        <td><span class="tick ${String(c.result).toLowerCase()}">${esc(c.result)}</span></td>
        <td>${esc(c.name)}</td>
        <td class="num">${esc(c.expected)}</td>
        <td class="num">${esc(c.actual)}</td>
        <td class="detail">${esc(c.detail || '')}</td>
      </tr>`).join('');

  return `
  <details class="run"${fail ? ' open' : ''}>
    <summary>
      <span class="doc">${esc(r.document_name)}</span>
      ${badge(r.outcome)}
      <span class="ver">${esc(r.previous_amendment)} &rarr; ${esc(r.new_amendment || '—')}</span>
      <span class="counts">${r.chunks_before ?? '—'} &rarr; ${r.chunks_after ?? '—'} chunks</span>
      <span class="checks">${pass} pass${fail ? ` &middot; <b class="bad">${fail} fail</b>` : ''}${skip ? ` &middot; ${skip} skip` : ''}</span>
      <span class="when">${new Date(r.run_started_at).toLocaleString()}</span>
    </summary>
    <div class="body">
      ${r.route ? `<p class="route"><b>Executed by:</b> ${esc(r.route)}${r.duration_ms ? ` &middot; ${(r.duration_ms / 1000).toFixed(1)}s` : ''}<br><span class="why">${esc(r.route_reason || '')}</span></p>` : ''}
      ${r.change_summary ? `<p class="summary">${esc(r.change_summary)}</p>` : ''}
      ${r.impact_assessment ? `<p class="impact"><b>Impact:</b> ${esc(r.impact_assessment)}</p>` : ''}
      ${r.error_detail ? `<p class="err">${esc(r.error_detail)}</p>` : ''}
      ${checks.length ? `<div class="tblwrap"><table class="checks-tbl">
        <thead><tr><th></th><th>Check</th><th>Expected</th><th>Actual</th><th>Why it matters</th></tr></thead>
        <tbody>${checkRows}</tbody></table></div>` : '<p class="muted">No checks recorded — this run predates check recording.</p>'}
    </div>
  </details>`;
}).join('');

const regRows = registry.map(r => `
  <tr><td>${esc(r.document_name)}</td><td>${esc(r.jurisdiction)}</td>
      <td class="num">${esc(r.cfr_title)} CFR ${esc(r.cfr_part)}</td>
      <td class="num">${esc(r.last_ingested_amendment ?? '—')}</td>
      <td class="num">${r.chunk_count ?? 0}</td>
      <td>${r.is_active ? '<span class="tick pass">WATCHED</span>' : '<span class="tick skip">PAUSED</span>'}</td></tr>`).join('');

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
.wrap{max-width:1080px;margin:0 auto;padding:36px 22px 80px}
h1,h2,summary,th,.pill,.tick,.stat b,.stat span{font-family:"Helvetica Neue",Arial,sans-serif}
h1{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px}
.sub{color:var(--soft);margin:0 0 28px}
h2{font-size:18px;font-weight:600;margin:36px 0 12px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.stat{background:var(--card);border:1px solid var(--rule);border-radius:5px;padding:14px 16px}
.stat b{display:block;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
.stat span{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);font-weight:600}
.run{background:var(--card);border:1px solid var(--rule);border-radius:5px;margin-bottom:8px}
.run summary{cursor:pointer;padding:13px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:13.5px}
.run[open] summary{border-bottom:1px solid var(--rule)}
.doc{font-weight:600;min-width:200px}
.ver,.counts{color:var(--soft);font-family:ui-monospace,Menlo,monospace;font-size:12px}
.checks{margin-left:auto;color:var(--soft);font-size:12px}
.when{color:var(--faint);font-size:11.5px;width:100%}
.body{padding:16px}
.route,.summary,.impact,.err{margin:0 0 12px;max-width:74ch}
.why{color:var(--faint);font-size:13.5px}
.err{color:var(--bad)}
.pill,.tick{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:3px 7px;border-radius:3px;white-space:nowrap}
.pill.ok,.tick.pass{background:var(--okbg);color:var(--ok)}
.pill.bad,.tick.fail{background:var(--badbg);color:var(--bad)}
.pill.warn{background:var(--warnbg);color:var(--warn)}
.pill.muted,.tick.skip{background:var(--sunk);color:var(--soft)}
b.bad{color:var(--bad)}
table{width:100%;border-collapse:collapse;font-size:13.5px}
.tblwrap{overflow-x:auto;border:1px solid var(--rule);border-radius:5px;background:var(--card)}
th{text-align:left;padding:9px 12px;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;
color:var(--faint);background:var(--sunk);border-bottom:1px solid var(--rule);font-weight:600}
td{padding:8px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
tr:last-child td{border-bottom:none}
.num{font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
.detail{color:var(--faint);font-size:12.5px;max-width:38ch}
.c-fail{background:var(--badbg)}
.muted{color:var(--faint)}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--rule);
color:var(--faint);font-size:12px;font-family:ui-monospace,Menlo,monospace}
</style></head><body><div class="wrap">
<h1>Glosilex Corpus Report</h1>
<p class="sub">Every ingestion decision the agent made, and every check it ran before touching the corpus.</p>

<div class="stats">
  <div class="stat"><b>${heldChunks.toLocaleString()}</b><span>chunks held</span></div>
  <div class="stat"><b>${registry.length}</b><span>documents watched</span></div>
  <div class="stat"><b>${runs.length}</b><span>runs recorded</span></div>
  <div class="stat"><b>${ingested}</b><span>ingested</span></div>
  <div class="stat"><b>${totalChecks}</b><span>checks run</span></div>
  <div class="stat"><b style="color:${failedChecks ? 'var(--bad)' : 'inherit'}">${failedChecks}</b><span>checks failed</span></div>
</div>
${halted ? `<p class="err" style="margin-top:16px"><b>${halted} run(s) halted on validation.</b> The previous corpus was preserved in each case — nothing was deleted.</p>` : ''}

<h2>Run history</h2>
${rows || '<p class="muted">No runs recorded yet.</p>'}

<h2>Watchlist</h2>
<div class="tblwrap"><table>
<thead><tr><th>Document</th><th>Regime</th><th>Citation</th><th>Version held</th><th>Chunks</th><th>Status</th></tr></thead>
<tbody>${regRows}</tbody></table></div>

<footer>Generated ${new Date().toLocaleString()} from ingestion_runs and corpus_registry.<br>
Glosilex Regulatory Corpus Sentinel.</footer>
</div></body></html>`;

fs.writeFileSync(OUT, html);
console.log(`\nReport written: ${OUT}`);
console.log(`  ${runs.length} runs, ${totalChecks} checks, ${failedChecks} failed`);
console.log(`  ${heldChunks.toLocaleString()} chunks across ${registry.length} documents\n`);
