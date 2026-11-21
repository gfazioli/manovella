#!/usr/bin/env node
// The promo site: `node scripts/site.mjs build [out]` copies site/ (plus the engine files the live
// demo needs, straight from the plugin) into `out` (default _site/); `serve [out] [--port 4173]`
// builds it afresh and serves it. Node built-ins only.
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync, statSync, createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(ROOT, 'plugins/manovella/skills/site-promo-film');
const TEMPLATE = join(SKILL, 'template');
const DOCS = join(SKILL, 'docs');

const FONT_URL = /url\(['"]?(fonts\/[^)'"]+)/g;

function copy(from, to) {
  if (!existsSync(from)) throw new Error(`missing source: ${from}`);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}
const read = (f) => readFileSync(f, 'utf8');
// The files a page names, comments aside: what gets copied follows the page, with no list to keep.
const uses = (text, re) => [...new Set([...text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '').matchAll(re)].map((m) => m[1]))];

function build(out) {
  // `out` is cleared first, so it has to be empty, missing, or a build of this script: never `.`, site/ or ~.
  if (existsSync(out) && readdirSync(out).length && !existsSync(join(out, 'demo/promo.html'))) {
    throw new Error(`${out} is neither empty nor an earlier build: refusing to clear it`);
  }
  rmSync(out, { recursive: true, force: true });
  cpSync(join(ROOT, 'site'), out, { recursive: true });

  // The live demo: the engine's own page and what it loads (its faces too, once uncommented),
  // copied from the plugin, never duplicated into site/.
  const page = read(join(TEMPLATE, 'promo.html'));
  copy(join(TEMPLATE, 'promo.html'), join(out, 'demo/promo.html'));
  for (const f of [...uses(page, /<script src="([^"]+)"/g), ...uses(page, FONT_URL)]) copy(join(TEMPLATE, f), join(out, 'demo', f));
  // The site's faces (base.css, which every page links), from the kit, each with its licence beside it.
  for (const f of uses(read(join(ROOT, 'site/base.css')), FONT_URL)) {
    copy(join(TEMPLATE, f), join(out, f));
    copy(join(TEMPLATE, dirname(f), 'OFL.txt'), join(out, dirname(f), 'OFL.txt'));
  }
  // The engine's pictures any page shows (img/… from the home, ../img/… from the guide), from its docs.
  const pages = readdirSync(join(ROOT, 'site'), { recursive: true }).filter((f) => f.endsWith('.html'));
  for (const p of pages) for (const f of uses(read(join(ROOT, 'site', p)), /(?:src|href)="(?:\.\.\/)?img\/([^"]+)"/g)) copy(join(DOCS, f), join(out, 'img', f));
  faqLd(join(out, 'index.html'));
  stampVersion(out);
  checkCounts(read(join(out, 'index.html')));
  if (process.env.VERCEL) analytics(out);
  console.log(`built ${out}`);
}

// Vercel Web Analytics, on Vercel's builds only: its script is served at that path there and
// nowhere else, so a local build stays free of a 404. Every page but the engine's demo, which the
// home embeds and which is not a visit of its own. The script sets no cookie, and writes to
// storage only when a page identifies a visitor, which no page does (guide/privacy.html).
const ANALYTICS = '<script defer src="/_vercel/insights/script.js"></script>\n';
function analytics(out) {
  const files = readdirSync(out, { recursive: true }).filter((f) => f.endsWith('.html') && !f.startsWith('demo'));
  for (const f of files) {
    const s = read(join(out, f));
    if (!s.includes('</body>')) throw new Error(`${f}: no </body> for the analytics script`);
    writeFileSync(join(out, f), s.replace('</body>', `${ANALYTICS}</body>`));
  }
}

// The guide's version is the plugin's, written at build time: no request to GitHub, nothing to bump by hand.
function stampVersion(out) {
  const { version } = JSON.parse(read(join(ROOT, 'plugins/manovella/.claude-plugin/plugin.json')));
  const files = readdirSync(out, { recursive: true }).filter((f) => /\.(html|js)$/.test(f) && !f.startsWith('demo'));
  for (const f of files) { const s = read(join(out, f)); if (s.includes('%%VERSION%%')) writeFileSync(join(out, f), s.replaceAll('%%VERSION%%', version)); }
}

// The home's catalogue counts are the engine's: a look, format, cut, type set, headline style or device added there fails the build here.
function checkCounts(page) {
  const schema = JSON.parse(read(join(SKILL, 'studio/schema.json')));
  const want = { looks: schema.looks.length, formats: schema.formats.length, cuts: schema.motion.transitions.length, 'type sets': schema.typesets.length, 'headline styles': schema.motion.text.length, devices: schema.frames.length };
  for (const [what, n] of Object.entries(want)) if (!page.includes(`<b>${n} ${what}</b>`)) throw new Error(`index.html: the catalogue should say <b>${n} ${what}</b>`);
}

// The home's FAQPage structured data, read from its #faq questions, so they are written once.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', rsquo: '’', lsquo: '‘', mdash: '—', ndash: '–', hellip: '…' };
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e] ?? m).replace(/\s+/g, ' ').trim();
function faqLd(file) {
  const page = read(file), slot = '<script type="application/ld+json" id="faq-ld"></script>';
  if (!page.includes(slot)) return;
  const qa = [...page.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="a">([\s\S]*?)<\/div>\s*<\/details>/g)];
  if (!qa.length) throw new Error('index.html has a FAQ slot but no questions in #faq');
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa.map(([, q, a]) => (
    { '@type': 'Question', name: text(q), acceptedAnswer: { '@type': 'Answer', text: text(a) } })) };
  writeFileSync(file, page.replace(slot, `<script type="application/ld+json" id="faq-ld">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`));
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

function serve(out, port) {
  createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    let file = normalize(join(out, p));
    if (file !== out && !file.startsWith(out + sep)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`http://localhost:${port}/  (${out})`));
}

const [cmd, ...rest] = process.argv.slice(2);
const pi = rest.indexOf('--port');
const port = pi >= 0 ? Number(rest.splice(pi, 2)[1]) : 4173;
const out = resolve(rest[0] || join(ROOT, '_site'));
if (cmd !== 'build' && cmd !== 'serve') { console.error('usage: site.mjs build [out] | serve [out] [--port 4173]'); process.exit(1); }
try { build(out); } catch (e) { console.error(`site.mjs: ${e.message}`); process.exit(1); }
if (cmd === 'serve') serve(out, port);
