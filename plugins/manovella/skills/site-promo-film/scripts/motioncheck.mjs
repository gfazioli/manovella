// Does the film move when it should, and only rest when it means to? Stills cannot say: a film can pass
// every still and hold the same picture for ten seconds.
//
//   node motioncheck.mjs [page#hash] [--no-draft] [--png <file> | --no-png]
//
// Two measurements, one verdict:
//   - the speed of every frame, from render.mjs (`render.mjs speeds`: each frame captured at a quarter of its
//     size, grain and jitter off, the mean difference to the next one, 0-255): the pass that plans the fast
//     frames' 48 subframes, shared, not made again. A stretch of 0.5 s or more under HOLD (default 0.05) is a hold;
//   - freeze detection on a draft of the film, `PREVIEW=1 render.mjs video` and `ffmpeg -vf
//     freezedetect=n=<HOLD>:d=0.5`: the same question asked of the file a viewer would get. ffmpeg's usual
//     -60 dB is 0.255 levels, and a pointer crossing the frame or a counter ticking moves a frame by 0.1 to 0.25
//     (measured on promo.html's cursor-only stretches): they would be called frozen, so the noise is HOLD,
//     about -74 dB. (A look with grain never freezes in the draft, the grain being new every frame: the
//     speeds, taken without it, still see the hold. --no-draft skips the draft.)
// FROM and TO (seconds) limit both to a range, as for render.mjs; PAGE is the page, as for render.mjs.
//
// A pause is a hold of up to PROMO_META.pause seconds (default 1.5): a beat to read, a click's wait. The
// reel's six scenes have eleven, 0.5 to 1.2 s, and the demo three. They are listed and pass. A longer hold
// fails unless the page planned it. The page says so in PROMO_META:
//   holds: [{ t0, t1, label }]    seconds at rest on purpose (an end card, a product left to be read)
//   moves: [{ t0, t1, label }]    seconds in which something must visibly move
// and a timeline's checkpoints say it too: a "... settled" checkpoint (film.js's: a scene at rest) allows a
// hold of up to PROMO_META.holdMax seconds (default 3) round it, and the "a -> b (kind)" checkpoint (a
// transition half way) is a planned move. Every planned move must show as a spike, a frame at SPIKE (default
// 1) or more, in the window round it (declared: its own; a transition: 0.25 s either side), or it fails: a
// cut that was meant to move and did not. Exit 1 on an unplanned hold or a planned move without its spike, 2
// when nothing could be measured.
//
// It prints the film's motion as one character a 0.25 s (' .:-=+*#%@', by mean speed, 0.25 up to 8 and
// beyond), the holds and the moves, and writes the graph as a PNG (default motion.png beside the page): the
// speed of every frame in blue, holds in red (unplanned) or grey (planned), checkpoints as ticks, planned moves
// in green where they spike and red where they do not.
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const argv = process.argv.slice(2), flags = new Set(argv.filter((a) => a.startsWith('--') && a !== '--png'));
const pngAt = argv.indexOf('--png') >= 0 ? argv[argv.indexOf('--png') + 1] : null;
const target = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--png') || process.env.PAGE || 'promo.html';
const [file, hash = ''] = target.split('#');
const pageFile = resolve(file), here = dirname(pageFile);
const L = { hold: Number(process.env.HOLD || 0.05), holdMin: 0.5, spike: Number(process.env.SPIKE || 1), moveWindow: 0.25, holdMax: 3, pause: 1.5 };
const render = join(dirname(fileURLToPath(import.meta.url)), 'render.mjs');
const env = { ...process.env, PAGE: target };
const scratch = join(here, '.motioncheck.noindex');
const fail = (m, code = 2) => { console.log(`motioncheck: ${m}`); process.exit(code); };

if (!existsSync(render)) fail(`render.mjs is not beside this file (${render}): it measures the speeds`);
mkdirSync(scratch, { recursive: true });

// ---------------------------------------------------------------- measured
const speedsFile = join(scratch, 'speeds.json');
let r = spawnSync(process.execPath, [render, 'speeds', speedsFile], { env, stdio: ['ignore', 'inherit', 'inherit'] });
if (r.status !== 0) fail('render.mjs speeds failed (above)');
const S = JSON.parse(readFileSync(speedsFile, 'utf8')), { fps, speeds, F0 } = S;
const t0 = F0 / fps, t1 = (F0 + speeds.length) / fps;
const tOf = (k) => (F0 + k) / fps;

let freezes = null; // [{ from, to }] from the draft, or null: not asked, or none could be made
if (!flags.has('--no-draft')) {
  const draft = join(scratch, 'draft.mp4');
  r = spawnSync(process.execPath, [render, 'video', draft], { env: { ...env, PREVIEW: '1' }, stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) fail('the draft (PREVIEW=1 render.mjs video) failed (above)');
  const f = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', draft, '-vf', `freezedetect=n=${L.hold / 255}:d=0.5`, '-an', '-f', 'null', '-'], { encoding: 'utf8' });
  const out = f.stderr || '';
  freezes = [];
  for (const m of out.matchAll(/freeze_start: ([\d.]+)/g)) freezes.push({ from: Number(m[1]) + t0, to: null });
  const ends = [...out.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => Number(m[1]) + t0);
  freezes.forEach((q, i) => { q.to = ends[i] ?? t1; }); // a freeze to the last frame has no end
  rmSync(draft, { force: true });
}

// ---------------------------------------------------------------- planned
const cps = S.checkpoints || [];
const holdMax = Number(env.HOLD_MAX || S.holdMax || L.holdMax), pause = Number(env.PAUSE || S.pause || L.pause);
const declaredHolds = (S.holds || []).map((h) => [h.t0, h.t1, h.label || 'declared']);
const rests = cps.filter((c) => /settled|rest/i.test(c.label || '')).map((c) => [c.t - holdMax / 2, c.t + holdMax / 2, c.label]);
const allowed = [...declaredHolds, ...rests];
const moves = [
  ...(S.moves || []).map((m) => ({ a: m.t0, b: m.t1, label: m.label || 'declared' })),
  ...cps.filter((c) => /→|->/.test(c.label || '')).map((c) => ({ a: c.t - L.moveWindow, b: c.t + L.moveWindow, label: c.label })),
];

/** [from, to] minus the intervals the page allowed, the pieces of at least holdMin left. */
function unplanned(from, to) {
  let pieces = [[from, to]];
  for (const [a, b] of allowed) pieces = pieces.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [[x, Math.min(y, a)], [Math.max(x, b), y]].filter(([p, q]) => q > p)));
  return pieces.filter(([x, y]) => y - x > pause + 1e-9);
}
// holds by the speeds
const holds = [];
for (let k = 0; k < speeds.length;) {
  if (speeds[k] >= L.hold) { k++; continue; }
  let e = k; while (e < speeds.length && speeds[e] < L.hold) e++;
  if ((e - k) / fps >= L.holdMin - 1e-9) holds.push({ from: tOf(k), to: tOf(e) });
  k = e;
}
const judge = (list) => list.map((h) => ({ ...h, bad: unplanned(h.from, h.to) }));
const byS = judge(holds), byF = freezes && judge(freezes);

const peak = (a, b) => { let m = 0; for (let k = Math.max(0, Math.floor((a - t0) * fps)); k < Math.min(speeds.length, Math.ceil((b - t0) * fps)); k++) m = Math.max(m, speeds[k]); return m; };
const checked = moves.filter((m) => m.b > t0 && m.a < t1).map((m) => ({ ...m, peak: peak(m.a, m.b) }));

// ---------------------------------------------------------------- said
const secs = (x) => `${x.toFixed(2)} s`;
const level = ' .:-=+*#%@';
let line = '';
console.log(`motion, one character a quarter second from ${secs(t0)} (' .:-=+*#%@': mean speed 0.25 to 8 and beyond)`);
for (let a = t0; a < t1 - 1e-9; a += 0.25) {
  const part = speeds.slice(Math.round((a - t0) * fps), Math.round((a + 0.25 - t0) * fps));
  const mean = part.reduce((x, y) => x + y, 0) / Math.max(1, part.length);
  line += level[Math.max(0, Math.min(9, Math.round(Math.log2(Math.max(mean, 0.25) / 0.25) / Math.log2(32) * 9)))];
  if (line.length === 120) { console.log(`  ${line}`); line = ''; }
}
if (line) console.log(`  ${line}`);
let code = 0;
const say = (name, list) => {
  if (!list) return;
  const long = list.filter((h) => h.to - h.from > pause + 1e-9), short = list.length - long.length;
  console.log(`${long.some((h) => h.bad.length) ? '--  ' : 'ok  '} ${name}: ${list.length ? `${short} pause${short === 1 ? '' : 's'} of ${L.holdMin} to ${pause} s${long.length ? `, ${long.length} longer` : ''}` : `no hold of ${L.holdMin} s or more`}`);
  for (const h of long) {
    const bad = h.bad.length;
    if (bad) code = 1;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${name}: hold ${secs(h.from)} to ${secs(h.to)} (${(h.to - h.from).toFixed(2)} s)${bad ? ` unplanned from ${h.bad.map(([x, y]) => `${secs(x)} to ${secs(y)}`).join(', ')}` : ' planned'}`);
  }
};
say('speeds', byS);
say('freezedetect', byF);
if (!freezes) console.log('--   freezedetect: not run (--no-draft)');
for (const m of checked) {
  const spiked = m.peak >= L.spike;
  if (!spiked) code = 1;
  console.log(`${spiked ? 'ok  ' : 'FAIL'} move "${m.label}" ${secs(m.a)} to ${secs(m.b)}: ${spiked ? `spike ${m.peak.toFixed(1)}` : `top speed ${m.peak.toFixed(2)}, under ${L.spike}: nothing moves`}`);
}
if (!checked.length) console.log('--   no planned move to look for (PROMO_META.moves, or a timeline\'s cuts)');

// ---------------------------------------------------------------- drawn
if (!flags.has('--no-png')) {
  const out = resolve(pngAt || join(here, 'motion.png'));
  const data = { t0, t1, fps, speeds, holds: byS, freezes: byF || [], moves: checked, spike: L.spike, hold: L.hold, cps };
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 420 } });
    await page.setContent('<canvas id=c width=1600 height=420></canvas><style>body{margin:0}</style>');
    await page.evaluate((D) => {
      const c = document.getElementById('c'), g = c.getContext('2d'), W = 1600, H = 420, L = 70, R = 20, T = 40, B = 60;
      const x = (t) => L + (t - D.t0) / (D.t1 - D.t0) * (W - L - R);
      const top = Math.max(8, Math.ceil(Math.max(...D.speeds)));
      const y = (v) => T + (H - T - B) * (1 - Math.sqrt(Math.min(v, top) / top)); // square root: a slow drift and a whip both show
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.font = '12px system-ui'; g.textBaseline = 'middle';
      for (const v of [0, 0.25, 1, 4, 16, 64, 255].filter((q) => q <= top)) { g.fillStyle = '#ddd'; g.fillRect(L, y(v), W - L - R, 1); g.fillStyle = '#666'; g.textAlign = 'right'; g.fillText(String(v), L - 6, y(v)); }
      const band = (a, b, col) => { g.fillStyle = col; g.fillRect(x(a), T, Math.max(1, x(b) - x(a)), H - T - B); };
      for (const h of D.holds) { band(h.from, h.to, 'rgba(120,120,120,0.16)'); for (const [a, b] of h.bad) band(a, b, 'rgba(220,40,40,0.28)'); }
      for (const q of D.freezes) for (const [a, b] of q.bad) { g.fillStyle = 'rgba(220,40,40,0.9)'; g.fillRect(x(a), H - B + 30, Math.max(1, x(b) - x(a)), 5); }
      for (const m of D.moves) { g.fillStyle = m.peak >= D.spike ? 'rgba(40,160,80,0.22)' : 'rgba(220,40,40,0.3)'; g.fillRect(x(Math.max(m.a, D.t0)), T, Math.max(2, x(Math.min(m.b, D.t1)) - x(Math.max(m.a, D.t0))), H - T - B); }
      g.strokeStyle = '#2a62d9'; g.lineWidth = 1.4; g.beginPath();
      D.speeds.forEach((v, k) => { const px = x(D.t0 + k / D.fps); k ? g.lineTo(px, y(v)) : g.moveTo(px, y(v)); });
      g.stroke();
      g.strokeStyle = '#c33'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(L, y(D.hold)); g.lineTo(W - R, y(D.hold)); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#222'; g.textAlign = 'center'; g.textBaseline = 'top';
      const step = [0.5, 1, 2, 5, 10, 30, 60].find((s) => (D.t1 - D.t0) / s <= 24) || 120;
      for (let t = Math.ceil(D.t0 / step) * step; t <= D.t1 + 1e-9; t += step) { g.fillStyle = '#aaa'; g.fillRect(x(t), H - B, 1, 5); g.fillStyle = '#222'; g.fillText(`${+t.toFixed(2)} s`, x(t), H - B + 8); }
      g.save(); g.textAlign = 'left'; g.font = '11px system-ui';
      D.cps.filter((p) => p.t >= D.t0 && p.t <= D.t1).forEach((p, i) => { g.fillStyle = '#444'; g.fillRect(x(p.t), T - 8, 1, 8); if (p.label) { g.fillText(p.label.length > 22 ? p.label.slice(0, 21) + '…' : p.label, x(p.t) + 3, T - 24 + (i % 2) * 11); } });
      g.restore();
      g.fillStyle = '#222'; g.font = '13px system-ui'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillText('speed of each frame (mean level difference to the next, 0-255, square-root scale); dashed: a hold under ' + D.hold + '; grey: planned hold, red: unplanned; green: a planned move that spikes, red: one that does not', L, H - 8);
    }, data);
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    console.log(`graph → ${out}`);
  } finally { await browser.close(); }
}
rmSync(scratch, { recursive: true, force: true });
console.log(code ? 'the film holds where it did not plan to, or a planned move does not move: see above (declare a hold in PROMO_META.holds, or fix the motion)'
  : `${speeds.length} frames (${secs(t0)} to ${secs(t1)}): every hold planned, every planned move a spike`);
process.exit(code);
