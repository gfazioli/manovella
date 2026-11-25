// A captioned contact sheet of a stills folder, or two or three of them side by side.
//
//   node contact.mjs <stillsDir> <out.png|out.jpg> [columns] [--size WxH] [--font px] [--gap px] [--pad px] [--dark]
//   node contact.mjs --compare <label>=<dir> <label>=<dir> [<label>=<dir>] <out.png> [--dark]
//
// By default the sheet is as tall as its rows make it. --size 1600x1000 makes it exactly that
// (a picture for a page that shows it in a frame of one aspect): the rows are spread evenly over the
// height, the stills keep their own aspect and are never cropped, --font sets the caption's size in
// px (15 by default; at 20 it stays legible when the sheet is shown 700 px wide), --gap the space
// between cells and --pad the margin. A grid that does not fit the size exits 2 and says by how much;
// one that leaves room over says how much, so the columns can be changed. A .jpg is written as JPEG
// (quality 92), anything else as PNG.
// --dark lays the sheet on #15151b with light captions (#E8E8F0) and a hairline round each still, for a
// picture shown on a dark page (the README on GitHub's dark theme, the site's navy home); the default is
// the light sheet (#EFEFF4, dark ink), which suits a contact sheet read in a review.
// Captions come from <stillsDir>/labels.json, keyed by file name without .png
// ({"t04.00": "What you can use."}); a still is titled by its time, a look (01-aura) by its name.
// render.mjs sheet writes that file from a timeline's checkpoints.
// --compare is an A/B choice on one image: a column per folder, in the order given, headed by its
// label; a row per file name the folders share, captioned once from the first folder's labels.json.
// Rows match by name, so the folders hold the same times: `render.mjs stills <dir> t…` at fixed
// times, or `sheet` on pages with the same checkpoints (two looks, two takes, a fix and the stills it
// fixes). A file missing from a folder is named under the sheet, never dropped silently, and stills
// of different sizes are refused (exit 2): a smaller frame scaled up beside a larger one is no
// comparison.
// The page is written to a file and opened with goto: page.setContent() runs on about:blank,
// which may not load file:// images.
import { chromium } from 'playwright-core';
import { readdirSync, writeFileSync, existsSync, readFileSync, rmSync, openSync, readSync, closeSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Google Chrome; else Edge on Windows, Chromium on Linux (Chrome has no arm64 build there); MANOVELLA_CHROME names any.
// Off macOS WebGL is drawn in software where there is no GPU (render.mjs says why). Copied here: this file imports no sibling.
async function launchChrome(opts = {}) {
  opts = { ...opts, args: [...(opts.args || []), ...(process.platform === 'darwin' ? [] : ['--enable-unsafe-swiftshader'])] };
  if (process.env.MANOVELLA_CHROME) return chromium.launch({ ...opts, executablePath: process.env.MANOVELLA_CHROME });
  try { return await chromium.launch({ ...opts, channel: 'chrome' }); } catch (e) {
    if (process.platform === 'win32') return chromium.launch({ ...opts, channel: 'msedge' }); // Edge: every Windows has it
    const alt = process.platform === 'linux' && ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].find((p) => existsSync(p));
    if (!alt) throw e;
    return chromium.launch({ ...opts, executablePath: alt });
  }
}

const raw = process.argv.slice(2), args = [], opts = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i] === '--dark') opts.dark = true;
  else if (['--size', '--font', '--gap', '--pad'].includes(raw[i])) opts[raw[i].slice(2)] = raw[++i];
  else args.push(raw[i]);
}
// a still's time: 4.50s, or 2:03.45 once a film runs past a minute
const clock = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}` : `${s.toFixed(2)}s`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const labelsOf = (dir) => { const f = join(dir, 'labels.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; };
const stills = (dir) => readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const caption = (f, labels) => {
  const k = f.replace(/\.png$/, '');
  const title = /^t\d/.test(k) ? clock(Number(k.slice(1))) : k.replace(/^\d+-/, '');
  return `<b>${esc(title)}</b> ${esc(labels[k] || '')}`;
};
const STYLE = opts.dark
  ? `body{margin:0;padding:24px;background:#15151b;font:500 15px system-ui;color:#E8E8F0}`
  : `body{margin:0;padding:24px;background:#EFEFF4;font:500 15px system-ui;color:#1A1C24}`;
const IMG = `figure{margin:0}img{width:100%;display:block;border-radius:8px;box-shadow:${opts.dark ? '0 0 0 1px rgba(255,255,255,.08)' : '0 1px 0 rgba(0,0,0,.12)'}}`;

/** One folder, `cols` stills a row, each captioned under it. With `fixed` ({ width, height }) the sheet is that size. */
function grid(dir, cols, o = {}, fixed) {
  const labels = labelsOf(dir);
  const cells = stills(dir).map((f) => `<figure><img src="${esc(f)}"><figcaption>${caption(f, labels)}</figcaption></figure>`).join('');
  const font = Number(o.font || 15), gap = Number(o.gap || 18), pad = Number(o.pad || 24);
  const box = fixed
    ? `html,body{height:100%}body{box-sizing:border-box;width:${fixed.width}px;height:${fixed.height}px;overflow:hidden;padding:${pad}px;font-size:${font}px}.g{height:100%;align-content:space-between}`
    : `body{padding:${pad}px;font-size:${font}px}`;
  return `<!doctype html><meta charset=utf-8><style>
${STYLE}
${box}
.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:${gap}px}
${IMG}
figcaption{padding:7px 2px 0;line-height:1.25}b{margin-right:6px}</style><div class=g>${cells}</div>`;
}

/** What [{ label, dir }] share by file name, and what one of them lacks. */
function match(columns) {
  const files = columns.map((c) => stills(c.dir));
  const all = [...new Set(files.flat())].sort();
  const shared = all.filter((f) => files.every((list) => list.includes(f)));
  const missing = columns.flatMap((c, i) => all.filter((f) => !files[i].includes(f)).map((f) => `${f} is not in ${c.label}`));
  return { shared, missing };
}

/** Folders side by side: a labelled column each, a captioned row per shared still, the missing ones under it. */
function compare(columns, shared, missing) {
  const labels = labelsOf(columns[0].dir);
  const cell = (c, f) => `<figure><img src="${esc(pathToFileURL(join(c.dir, f)).href)}"></figure>`;
  const row = (f) => `<p class=cap>${caption(f, labels)}</p>${columns.map((c) => cell(c, f)).join('')}`;
  const heads = columns.map((c) => `<h2>${esc(c.label)}</h2>`).join('');
  const note = missing.length ? `<ul class=miss>${missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  return `<!doctype html><meta charset=utf-8><style>
${STYLE}
.g{display:grid;grid-template-columns:repeat(${columns.length},1fr);column-gap:18px}
h2{margin:0 2px 10px;font:700 22px system-ui}.cap{grid-column:1/-1;margin:14px 2px 7px}.cap:first-of-type{margin-top:0}
${IMG}
b{margin-right:6px}.miss{margin:22px 0 0;padding-left:20px;color:${opts.dark ? '#F0A090' : '#8A3A2E'}}</style><div class=g>${heads}${shared.map(row).join('')}</div>${note}`;
}

/** A PNG's [width, height], from its header. */
function size(file) {
  const b = Buffer.alloc(24), fd = openSync(file, 'r');
  try { readSync(fd, b, 0, 24, 0); } finally { closeSync(fd); }
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

/** `html`, written into `dir` and screenshot whole into `out`. */
async function shoot(html, dir, out, fixed) {
  const page = join(dir, '.contact.html');
  writeFileSync(page, html);
  const browser = await launchChrome();
  try {
    const p = await browser.newPage({ viewport: fixed || { width: 1920, height: 400 } }); // without a size, fullPage grows it to the grid
    await p.goto(pathToFileURL(page).href, { waitUntil: 'load' });
    const type = /\.jpe?g$/i.test(out) ? { type: 'jpeg', quality: 92 } : {};
    if (fixed) {
      // every cell must lie inside the sheet (the body hides what overflows): say what does not, and what is left over
      const m = await p.evaluate(() => {
        const cs = [...document.querySelectorAll('figure')].map((f) => f.getBoundingClientRect());
        const rows = new Map(); // a row's height is its tallest cell's
        for (const c of cs) rows.set(Math.round(c.top), Math.max(rows.get(Math.round(c.top)) || 0, c.height));
        return { bottom: Math.max(...cs.map((c) => c.bottom)), right: Math.max(...cs.map((c) => c.right)), rows: rows.size, used: [...rows.values()].reduce((a, h) => a + h, 0), pad: parseFloat(getComputedStyle(document.body).paddingTop), sh: document.body.scrollHeight, sw: document.body.scrollWidth };
      });
      const over = Math.max(m.bottom - (fixed.height - m.pad), m.right - (fixed.width - m.pad), m.sh - fixed.height, m.sw - fixed.width);
      if (over > 0.5) { console.error(`the grid does not fit ${fixed.width}x${fixed.height}: it overflows by ${Math.ceil(over)} px (fewer columns, a smaller --font or --gap)`); process.exitCode = 2; return; } // the finally below cleans up
      console.log(`${m.rows} rows, ${Math.round(m.used)} px of the ${fixed.height - 2 * m.pad} inside the margins: ${Math.round(fixed.height - 2 * m.pad - m.used)} px spread between them`);
    }
    await p.screenshot({ path: out, fullPage: !fixed, ...type });
  } finally {
    await browser.close();
    rmSync(page, { force: true });
  }
}

const USAGE = 'usage: contact.mjs <stillsDir> <out.png> [columns]';
const USAGE_COMPARE = 'usage: contact.mjs --compare <label>=<dir> <label>=<dir> [<label>=<dir>] <out.png>';
const die = (message) => { console.error(message); process.exit(2); };

if (args[0] === '--compare') {
  if (['size', 'font', 'gap', 'pad'].some((k) => k in opts)) die('--size, --font, --gap and --pad are for one folder, not --compare');
  const out = args.length > 1 ? resolve(args.at(-1)) : null, pairs = args.slice(1, -1);
  if (!out || pairs.length < 2 || pairs.length > 3) die(USAGE_COMPARE);
  const columns = pairs.map((p) => {
    const [label, ...rest] = p.split('='), dir = resolve(rest.join('='));
    if (!label || !rest.length) die(`not a <label>=<dir>: ${p}\n${USAGE_COMPARE}`);
    if (!existsSync(dir)) die(`no folder ${dir} (${label})`);
    return { label, dir };
  });
  const { shared, missing } = match(columns);
  if (!shared.length) die(`the folders share no still by name: nothing to lay side by side (${columns.map((c) => `${c.label}: ${stills(c.dir).length}`).join(', ')})`);
  const sizes = columns.map((c) => ({ label: c.label, sizes: [...new Set(shared.map((f) => size(join(c.dir, f)).join('×')))] }));
  if (new Set(sizes.flatMap((c) => c.sizes)).size > 1) die(`the stills differ in size (${sizes.map((c) => `${c.label} ${c.sizes.join(' and ')}`).join(', ')}): render them at one size to compare them`);
  const scratch = mkdtempSync(join(tmpdir(), 'contact-')); // the page names its stills by absolute URL
  try { await shoot(compare(columns, shared, missing), scratch, out); } finally { rmSync(scratch, { recursive: true, force: true }); }
  for (const m of missing) console.log(`  ${m}`);
  const rows = `${shared.length} row${shared.length === 1 ? '' : 's'}`;
  const tail = missing.length ? `, ${missing.length} stills not in every folder, named under the sheet` : '';
  console.log(`comparison → ${out} (${columns.map((c) => c.label).join(' | ')}, ${rows}${tail})`);
} else {
  const [dirArg, outArg, colsArg] = args;
  if (!dirArg || !outArg) die(`${USAGE}\n       ${USAGE_COMPARE.slice(7)}`);
  const dir = resolve(dirArg), out = resolve(outArg);
  const given = 'size' in opts, [, w, h] = /^(\d+)x(\d+)$/.exec(opts.size || '') || [];
  if (given && !(w > 0 && h > 0)) die(`--size is WxH, in whole px: ${opts.size}`);
  const fixed = given ? { width: +w, height: +h } : null;
  await shoot(grid(dir, Number(colsArg || 3), opts, fixed), dir, out, fixed);
  if (!process.exitCode) console.log('contact sheet →', out);
}
