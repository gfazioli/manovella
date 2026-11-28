// Is every headline in the frame, clear of the others and of what the page keeps clear, big enough for a
// phone, on screen long enough to read and readable on what is behind it? At each moment worth a still (the
// page's PROMO_META.checkpoints: each scene settled, each cut half way; or 8 even times), and at the busiest
// frame between each two of them (the moments in motion: render.mjs's speed pass, the fastest frame between two
// checkpoints, which needs nothing from the page), every headline TYPE.draw draws is checked as the block it
// covers (TYPE.extent):
//   - the safe area: inside the frame less 5 % of the short side on every edge;
//   - a 9:16 frame, the platforms' own bands: Instagram Reels, YouTube Shorts and TikTok draw their interface
//     over the top, the bottom and the sides of a vertical video (the buttons, the caption, the account). The
//     two that publish numbers (below) are applied as fractions of the frame: a block inside a band that BOTH
//     cover fails (it is under an interface everywhere that says where it is); inside a band only one of them
//     covers it is a warning, named. TikTok publishes no pixel numbers (its safe-zone files are images that
//     change with the caption's length and the add-ons): nothing is taken for it. Not judged on other aspects;
//   - overlap: no two headlines' blocks crossing by more than 2 px;
//   - size: at least 9 pt on a phone that shows the film 390 pt wide, where most people watch: 45 px
//     in a 1920-wide film, 25 px in a 1080-wide vertical one (the height it is drawn at, through its
//     transform; not judged before it begins, while it leaves, when its style may draw it invisible,
//     nor at alpha 0). Text inside the product's UI drawn with TYPE.draw (a counter) takes `ui: true`
//     in its spec: no phone minimum, its size stays a check by eye (SKILL §3's UI rule). Captions and
//     the parts' labels are drawn outside TYPE.draw: not checked;
//   - contrast: each colour its words are drawn in at that moment (the ink; the accent for swap's
//     slot and for a 'color' emphasis once it has begun), laid over the median of a 6 px ring round
//     its block in that frame (a translucent ink is as readable as what it makes there), by WCAG's
//     ratio: 3:1 for text of 24 px or more, 4.5:1 under it. flap on its tiles: its letters against
//     its tiles, which is what is read;
//   - the product's size, at the checkpoints (not in motion, where it is arriving): PROMO_META.box, [x, y, w,
//     h] in pixels where the product is in the frame just drawn, the camera and its frame included (stage.html
//     sets it), at least 170 px wide at 1080p, scaled with the short side of the frame, and as much of it as
//     is in the frame. "Early stills always come out too wide and the hero shrinks to a dot." A page without
//     it, or a moment with no product (box null), is not judged.
// Two checks look at every 1/30 s instead of at moments (STEP, in seconds, changes it):
//   - marks: the boxes the page keeps clear (a logo, the product's window). The page names them in
//     PROMO_META.marks, [{ name, box: [x, y, w, h], from?, to? }] for one that stays put, and/or
//     window.__marks(t), called after seek(t), returning [{ name, box }] at t, in frame pixels, and/or a box
//     FILM.mark gives as it draws (its third argument). No headline may
//     cross a mark, nor any text drawn into its box by something other than the mark. Who draws a text is
//     FILM.mark(name, () => { … }) (film.js): what runs inside is the mark's own, and its text may lie in
//     its box. Text drawn BEFORE the mark's first stroke passes under it, which is the fix this rule asks for
//     of a shape that converges onto a logo (SKILL §3): it is not a failure. Seen: every fillText and
//     strokeText on the frame, through its transform and the rectangular clips it drew in (a clip of any
//     other shape is not known: the text counts); text drawn into another canvas (a transition's or a 3D
//     layer's buffer) is counted and not judged;
//   - reading time: a headline stays on screen at least 0.3 s a word plus 0.5 s, from the first moment its
//     block is drawn (alpha 0.5 or more) to the last, so a twelve-word line wants 4.1 s.
// The block is where the headline rests (TYPE.extent): the checkpoints are moments at rest, and a
// style passes beyond it only on its way in or out.
//
//   node layoutcheck.mjs [page#hash]        default ./promo.html; exit 1 if a check fails, 2 if
//                                           nothing could be checked
//
// It wraps the page's TYPE.draw: each call notes the headline, its block through the transform it is
// drawn in and the canvas it is drawn on, then draws through the original, so the film is drawn
// exactly as it would be. A page that draws its words another way (a fillText of its own, as the two
// templates do) has no headline to check, but its marks and its product are: exit 2 only when nothing at
// all was checked, never a pass. A headline drawn into a canvas that is not the page's (a transition's
// buffer, half way through a cut) is listed and not judged: its pixels are not the frame's. Neither are a
// headline under a scene fading out, and one whose ring is mostly another headline: neither says anything of
// contrast. A page whose headlines were all seen and none judged has not been checked: exit 2.
// The moments in motion come from `render.mjs speeds` beside this file (MOTION=0: without them; they cost
// a pass over the film at a quarter of its size).
//
// The frame is copied into a canvas of its own and read there, never with getImageData on the film's
// canvas: a second read moves that canvas to software raster.
//
// The platforms' bands, as published for a 1080x1920 frame:
//   Instagram Reels (Meta's Ads Guide, "Awareness Image Ad Specs on Instagram Reels":
//     https://www.facebook.com/business/ads-guide/update/image/instagram-reels): leave about 14 % of the top,
//     35 % of the bottom and 6 % of each side free of text, logos and other key elements.
//   YouTube Shorts (Google Ads Help, "Use square and vertical video to engage mobile customers", its Safe Zone
//     diagram, 1080x1920: https://support.google.com/google-ads/answer/9128498): 288 px at the top, 672 at the
//     bottom, 48 on the left and 192 on the right. Both are those platforms' guides for ADS; an organic video's
//     interface is the same buttons and caption, and the apps move them: look at the app before posting.
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync, rmSync } from 'node:fs';
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

const target = process.argv[2] || 'promo.html';
const [file, hash = ''] = target.split('#');
// bands: the fraction of the frame each platform covers, top, bottom, left, right
const PLATFORMS = {
  'Instagram Reels': { top: 0.14, bottom: 0.35, left: 0.06, right: 0.06 },
  'YouTube Shorts': { top: 288 / 1920, bottom: 672 / 1920, left: 48 / 1080, right: 192 / 1080 },
};
const LIMITS = { safe: 0.05, overlap: 2, phone: 390, minPt: 9, ring: 6, large: 24, minLarge: 3, min: 4.5, product: 170, vertical: 9 / 16, platforms: PLATFORMS };
const STEP = Number(process.env.STEP || 1 / 30), READ = { perWord: 0.3, base: 0.5 }, MOTION_ON = process.env.MOTION !== '0';
const browser = await launchChrome();
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(resolve(file)).href + (hash ? '#' + hash : '')); // file:///C:/… on Windows
  await page.evaluate(() => window.ready);
  const meta = await page.evaluate(() => {
    // ---- who draws what: every text drawn on a 2D canvas, with the rectangular clips it was drawn in,
    // and the order the frame's strokes came in (a mark's first paint, against a text drawn before it)
    window.__texts = []; window.__markFirst = {}; window.__order = 0; window.__inType = false;
    const CP = CanvasRenderingContext2D.prototype, S = new WeakMap(), scope = () => (window.FILM?.markScope ? window.FILM.markScope() : null);
    const st = (g) => S.get(g) || (S.set(g, { clip: null, path: null, stack: [] }), S.get(g));
    const bbox = (g, x, y, w, h) => {
      const m = g.getTransform(), xs = [], ys = [];
      for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { xs.push(m.a * px + m.c * py + m.e); ys.push(m.b * px + m.d * py + m.f); }
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    };
    const meet = (a, b) => (!a ? b : [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
    const wrap = (name, before) => { const o = CP[name]; CP[name] = function (...a) { before.call(this, ...a); return o.apply(this, a); }; };
    wrap('save', function () { const s = st(this); s.stack.push([s.clip, s.path]); });
    const origRestore = CP.restore;
    CP.restore = function () { const s = st(this), top = s.stack.pop(); if (top) [s.clip, s.path] = top; return origRestore.call(this); };
    wrap('beginPath', function () { st(this).path = null; });
    for (const n of ['rect', 'roundRect']) {
      wrap(n, function (x, y, w, h) { const s = st(this); if (s.path === 'other') return; const b = bbox(this, x, y, w, h); s.path = s.path ? [Math.min(s.path[0], b[0]), Math.min(s.path[1], b[1]), Math.max(s.path[2], b[2]), Math.max(s.path[3], b[3])] : b; });
    }
    for (const n of ['moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'bezierCurveTo', 'quadraticCurveTo', 'closePath']) wrap(n, function () { if (n !== 'closePath') st(this).path = 'other'; });
    wrap('clip', function (...a) { const s = st(this); if (typeof a[0] !== 'object' && Array.isArray(s.path)) s.clip = meet(s.clip, s.path); });
    for (const n of ['fill', 'stroke', 'fillRect', 'strokeRect', 'drawImage']) {
      wrap(n, function () { const sc = scope(); window.__order++; if (sc && window.__markFirst[sc] == null) window.__markFirst[sc] = window.__order; });
    }
    for (const n of ['fillText', 'strokeText']) {
      wrap(n, function (text, x, y) {
        if (window.__inType || !String(text).trim()) return;
        const m = this.measureText(text);
        let box = bbox(this, x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent, m.actualBoundingBoxLeft + m.actualBoundingBoxRight, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
        const c = st(this).clip;
        if (c) box = meet(box, c);
        window.__order++;
        if (box[2] > box[0] && box[3] > box[1]) window.__texts.push({ text: String(text), canvas: this.canvas, box, alpha: this.globalAlpha, scope: scope(), order: window.__order });
      });
    }
    if (window.TYPE?.extent) {
      const draw = TYPE.draw;
      window.__heads = [];
      TYPE.draw = (g, t, spec) => {
        const e = TYPE.extent(spec, t);
        if (e) {
          const m = g.getTransform(), xs = [], ys = [];
          for (const [x, y] of [[e.x, e.y], [e.x + e.width, e.y], [e.x, e.y + e.height], [e.x + e.width, e.y + e.height]]) {
            xs.push(m.a * x + m.c * y + m.e); ys.push(m.b * x + m.d * y + m.f);
          }
          const style = spec.style || 'rise', ink = spec.color ?? [26, 28, 36]; // type.js's own default ink
          // the colours drawn at t: swap's slot in the accent (its line may be nothing else), a
          // 'color' emphasis from when it begins (type.js: just after the arrival settles)
          const text = spec.lines.join(' '), slot = style === 'swap' && text.includes('{}'), E = spec.emphasis;
          const word = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); // type.js's emphasis match
          const marked = E?.mark === 'color' && t >= (E.at ?? TYPE.settled(spec) + 0.15);
          const inkless = (slot && !text.replace(/\{\}/g, '').trim()) || (marked && text.split(/\s+/).every((w) => word(w) === word(String(E.word))));
          const inks = [...(inkless ? [] : [['its ink', ink]]), ...(slot || marked ? [['its accent', spec.accent ?? ink]] : [])];
          window.__order++;
          window.__heads.push({ canvas: g.canvas, lines: spec.lines, style, alpha: g.globalAlpha, tiles: style === 'flap' && spec.tiles !== false,
            inks: inks.map(([k, c]) => [k, Array.isArray(c) ? `rgb(${c.join(',')})` : c]), px: spec.size * Math.hypot(m.a, m.b),
            tall: spec.size * Math.abs(m.a * m.d - m.b * m.c) / Math.hypot(m.a, m.b), // across the baseline
            ui: !!spec.ui, begun: !!TYPE.extent(spec, t - 0.05), // extent opens 50 ms before the arrival
            leaving: spec.out != null && t >= spec.out, // its style may draw it invisible then
            scope: scope(), order: window.__order,
            box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
        }
        window.__inType = true; // the glyphs it draws are the headline's, noted above, not texts of their own
        try { return draw(g, t, spec); } finally { window.__inType = false; }
      };
    }
    const seek0 = window.seek;
    window.seek = (t, o) => { window.__texts = []; window.__markFirst = {}; window.__order = 0; if (window.__heads) window.__heads = []; if (window.FILM?.markDrawn) window.FILM.markDrawn.length = 0; return seek0(t, o); };
    return { ...window.PROMO_META, stale: !!window.TYPE && !window.TYPE.extent, hasTypeDraw: !!window.TYPE?.extent };
  });
  if (!meta.width) throw new Error(`${file} has no PROMO_META: not a film page`);
  if (meta.stale) throw new Error(`${file} loads a type.js without TYPE.extent: copy the kit's type.js beside it`);
  const ratio = meta.width / meta.height, vertical = Math.abs(ratio - LIMITS.vertical) < 0.02;
  const rest = meta.checkpoints?.length ? meta.checkpoints
    : Array.from({ length: 8 }, (_, i) => ({ t: +((i + 0.5) * meta.duration / 8).toFixed(2), label: '' }));
  // the moments in motion: render.mjs's speed pass, the busiest frame between two checkpoints
  let moments = [];
  const renderMjs = join(dirname(fileURLToPath(import.meta.url)), 'render.mjs');
  if (MOTION_ON && existsSync(renderMjs)) {
    const out = join(dirname(resolve(file)), '.layoutcheck.noindex', 'speeds.json');
    const r = spawnSync(process.execPath, [renderMjs, 'speeds', out], { env: { ...process.env, PAGE: target, FROM: '', TO: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.status === 0) { moments = JSON.parse(readFileSync(out, 'utf8')).moments || []; rmSync(dirname(out), { recursive: true, force: true }); }
    else console.log('the speed pass failed (above): only the checkpoints are looked at');
  } else if (MOTION_ON) console.log('render.mjs is not beside layoutcheck.mjs: only the checkpoints are looked at (it finds the moments in motion)');
  const points = [...rest.map((p) => ({ ...p, rest: true })), ...moments.map((p) => ({ ...p, rest: false }))].sort((a, b) => a.t - b.t);
  let seen = 0, judged = 0, sized = 0, products = 0;
  for (const { t, label, rest: atRest } of points) {
    const { rows, product } = await page.evaluate(async ([tt, L]) => {
      if (!window.__heads) { await window.seek(tt); return { rows: [], product: window.PROMO_META.box ?? null }; }
      window.__heads = [];
      await window.seek(tt);
      const product = window.PROMO_META.box ?? null;
      const frame = document.querySelector('canvas'), W = frame.width, H = frame.height;
      const own = document.createElement('canvas'); own.width = W; own.height = H;
      const o = own.getContext('2d', { willReadFrequently: true });
      o.drawImage(frame, 0, 0);
      const data = o.getImageData(0, 0, W, H).data;
      const LIN = Array.from({ length: 256 }, (_, v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      const lum = (r, g, b) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b]; // WCAG relative luminance
      const rgbOf = (css) => { o.clearRect(0, 0, 1, 1); o.fillStyle = css; o.fillRect(0, 0, 1, 1); return o.getImageData(0, 0, 1, 1).data; };
      const inside = (b, x, y) => x >= b[0] && x < b[2] && y >= b[1] && y < b[3];
      // one row per headline: the same one drawn twice in a frame (a reflection, a mask) counts once
      const keys = new Set(), all = window.__heads.filter((r) => {
        const k = JSON.stringify([r.lines, r.canvas === frame, r.box.map(Math.round)]);
        return !keys.has(k) && keys.add(k);
      });
      const onFrame = all.filter((r) => r.canvas === frame), m = L.safe * Math.min(W, H), least = L.minPt * W / L.phone;
      const vertical = Math.abs(W / H - L.vertical) < 0.02;
      return { product, rows: all.map((r) => {
        const out = { text: r.lines.join(' '), style: r.style, px: r.px, fails: [], notes: [], warns: [] };
        if (r.canvas !== frame) { out.notes.push('drawn into a buffer (a transition): not judged'); return out; }
        const [x0, y0, x1, y1] = r.box, others = onFrame.filter((q) => q !== r);
        const edges = [['left', m - x0], ['top', m - y0], ['right', x1 - (W - m)], ['bottom', y1 - (H - m)]].filter(([, d]) => d > 0);
        if (edges.length) out.fails.push(`outside the safe area: ${edges.map(([e, d]) => `${e} by ${Math.ceil(d)} px`).join(', ')}`);
        if (vertical) { // what the platforms draw over a 9:16 video: a band both cover fails, one that only one covers warns
          const px = (name, f) => (name === 'left' || name === 'right' ? W : H) * f;
          const into = { left: (b) => b - x0, top: (b) => b - y0, right: (b) => x1 - (W - b), bottom: (b) => y1 - (H - b) };
          const hard = [], soft = [];
          for (const e of ['top', 'bottom', 'left', 'right']) {
            const bands = Object.entries(L.platforms).map(([name, f]) => [name, px(e, f[e])]);
            const common = Math.min(...bands.map(([, b]) => b)), d = into[e](common);
            if (d > 0) hard.push(`${e} by ${Math.ceil(d)} px`);
            else for (const [name, b] of bands) { const s = into[e](b); if (s > 0) soft.push(`${name} ${e} by ${Math.ceil(s)} px`); }
          }
          if (hard.length) out.fails.push(`under the platforms' own interface (Reels and Shorts both draw there): ${hard.join(', ')}`);
          if (soft.length) out.warns.push(`under one platform's interface: ${soft.join(', ')}`);
        }
        for (const q of others) {
          const w = Math.min(x1, q.box[2]) - Math.max(x0, q.box[0]), h = Math.min(y1, q.box[3]) - Math.max(y0, q.box[1]);
          if (w > L.overlap && h > L.overlap) out.fails.push(`overlaps "${q.lines.join(' ')}" by ${Math.round(w)} x ${Math.round(h)} px`);
        }
        out.ui = r.ui; out.sized = !r.ui && r.alpha > 0.02 && r.begun && !r.leaving;
        if (out.sized && r.tall < least) out.fails.push(`${(r.tall * L.phone / W).toFixed(1)} pt on a phone, under ${L.minPt} (${Math.ceil(least)} px here)`);
        if (r.alpha < 0.98) { out.notes.push(`drawn at ${Math.round(r.alpha * 100)} % (a scene fading): contrast not judged`); return out; }
        const ring = []; // [luminance, index] of each pixel round the block
        let onOther = 0;
        for (let y = Math.max(0, Math.floor(y0 - L.ring)); y < Math.min(H, Math.ceil(y1 + L.ring)); y++) {
          for (let x = Math.max(0, Math.floor(x0 - L.ring)); x < Math.min(W, Math.ceil(x1 + L.ring)); x++) {
            if (inside(r.box, x, y)) continue;
            if (others.some((q) => inside(q.box, x, y))) onOther++;
            const i = (y * W + x) * 4;
            ring.push([lum(data[i], data[i + 1], data[i + 2]), i]);
          }
        }
        if (!ring.length) { out.notes.push('no pixel round it in the frame: contrast not judged'); return out; }
        if (onOther > ring.length / 2) { out.notes.push('its ring is mostly another headline: contrast not judged'); return out; }
        ring.sort((a, b) => a[0] - b[0]);
        const [bgL, bi] = ring[ring.length >> 1], bg = [data[bi], data[bi + 1], data[bi + 2]], need = r.px >= L.large ? L.minLarge : L.min;
        const over = ([cr, cg, cb, ca], under) => [cr, cg, cb].map((v, k) => Math.round(v * ca / 255 + under[k] * (1 - ca / 255)));
        const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        let pairs; // [what, its luminance, the luminance behind it]
        if (r.tiles) { // drawFlap: tiles in the ink at 0.94, letters in the opposite of it
          const c = rgbOf(r.inks[0][1]), tile = over([c[0], c[1], c[2], c[3] * 0.94], bg);
          const glyph = c[0] + c[1] + c[2] > 382 ? [18, 19, 24] : [246, 246, 248];
          pairs = [['its letters on its tiles', lum(...glyph), lum(...tile)]];
        } else pairs = r.inks.map(([k, c]) => [k, lum(...over(rgbOf(c), bg)), bgL]);
        if (!pairs.length) { out.notes.push('no colour of its own drawn at this moment: contrast not judged'); return out; }
        const [which, worst] = pairs.map(([k, f, b]) => [k, ratio(f, b)]).reduce((a, b) => (b[1] < a[1] ? b : a));
        out.contrast = worst;
        if (worst < need) out.fails.push(`contrast ${worst.toFixed(2)}:1 (${which}), under ${need}:1 for ${Math.round(r.px)} px text`);
        return out;
      }) };
    }, [t, LIMITS]);
    const shown = [];
    for (const r of rows) {
      seen++;
      if (r.fails.length) code = 1;
      if (!r.notes.length) judged++;
      if (r.sized && !r.fails.length) sized++;
      const head = `"${r.text.length > 40 ? r.text.slice(0, 39) + '…' : r.text}" ${r.style} ${Math.round(r.px)} px`;
      const tag = r.fails.length ? 'FAIL' : r.notes.length ? '--  ' : 'ok  ';
      const what = [...r.fails, ...r.notes];
      shown.push(`  ${tag} ${head.padEnd(58)} ${what.length ? what.join('; ') : `contrast ${r.contrast.toFixed(1)}:1, inside, alone, ${r.sized ? 'big enough' : (r.ui ? 'UI text: no phone minimum' : 'size not judged (not begun, or leaving)')}`}${r.warns.length ? `; WARNING ${r.warns.join('; ')}` : ''}`);
    }
    // the product's width, where it is at rest: a hero that shrinks to a dot is the commonest miss
    if (atRest && product && product[2] > 0) {
      const W = meta.width, H = meta.height, min = LIMITS.product * Math.min(W, H) / 1080;
      const visible = Math.max(0, Math.min(product[0] + product[2], W) - Math.max(product[0], 0));
      products++;
      const bad = visible < min;
      if (bad) code = 1;
      shown.push(`  ${bad ? 'FAIL' : 'ok  '} the product ${Math.round(visible)} px wide in the frame (${Math.round(product[2])} px drawn)${bad ? `, under ${Math.round(min)} px: a dot on a phone (a nearer camera, a bigger product)` : `, over the ${Math.round(min)} px minimum`}`);
    }
    if (!shown.length) continue;
    console.log(`${t.toFixed(2).padStart(6)} s  ${atRest ? label || '' : label}`);
    for (const l of shown) console.log(l);
  }
  // ---- every 1/30 s: marks and reading time
  const marked = Array.isArray(meta.marks) && meta.marks.length, dynamic = await page.evaluate(() => typeof window.__marks === 'function');
  const drawn = await page.evaluate(() => !!window.FILM?.markDrawn), lookAtMarks = marked || dynamic || drawn, declares = marked || dynamic, lookAtReading = meta.hasTypeDraw;
  let crossings = 0, unjudged = 0, markNames = new Set();
  if (lookAtMarks || lookAtReading) {
    const live = new Map(), crossed = new Map(); // a headline's runs on screen; the times a text is in a mark's box
    const gap = STEP * 2.5;
    const samples = Math.floor(meta.duration / STEP + 1e-6);
    for (let i = 0; i < samples; i++) {
      const t = i * STEP;
      const s = await page.evaluate(async ([tt, M, overlap]) => {
        await window.seek(tt);
        const frame = document.querySelector('canvas'), W = frame.width, H = frame.height;
        let marks = (M || []).filter((m) => (m.from == null || tt >= m.from) && (m.to == null || tt < m.to)).map((m) => ({ name: m.name, box: m.box }));
        if (typeof window.__marks === 'function') marks = marks.concat(window.__marks(tt) || []);
        marks = marks.concat((window.FILM?.markDrawn || []).filter((m) => m.canvas === frame).map((m) => ({ name: m.name, box: m.box }))); // marks that said where they were as they drew
        marks = marks.filter((m) => m.box && m.box[2] > 0 && m.box[3] > 0).map((m) => ({ name: m.name, box: [m.box[0], m.box[1], m.box[0] + m.box[2], m.box[1] + m.box[3]] }));
        const first = window.__markFirst, hit = [];
        const meetOf = (a, b) => [Math.min(a[2], b[2]) - Math.max(a[0], b[0]), Math.min(a[3], b[3]) - Math.max(a[1], b[1])];
        const items = [
          ...(window.__heads || []).filter((h) => h.alpha >= 0.02).map((h) => ({ what: `headline "${h.lines.join(' ')}"`, canvas: h.canvas, box: h.box, scope: h.scope, order: h.order })),
          ...window.__texts.filter((x) => x.alpha >= 0.02).map((x) => ({ what: `text "${x.text.length > 30 ? x.text.slice(0, 29) + '…' : x.text}"`, canvas: x.canvas, box: x.box, scope: x.scope, order: x.order })),
        ];
        let buffers = 0;
        const seenItems = new Set();
        for (const it of items) {
          const key = it.what + it.box.map(Math.round);
          if (seenItems.has(key)) continue; seenItems.add(key);
          if (it.canvas !== frame) { buffers++; continue; }
          for (const m of marks) {
            if (it.scope === m.name) continue; // the mark's own
            if (first[m.name] != null && it.order < first[m.name]) continue; // drawn before it: it passes under
            const [w, h] = meetOf(it.box, m.box);
            if (w > overlap && h > overlap) hit.push({ mark: m.name, what: it.what, by: it.scope, w: Math.round(w), h: Math.round(h) });
          }
        }
        const heads = (window.__heads || []).filter((h) => h.alpha >= 0.5 && !h.ui).map((h) => h.lines.join(' '));
        return { hit, marks: marks.map((m) => m.name), buffers, heads: [...new Set(heads)] };
      }, [t, marked ? meta.marks : [], LIMITS.overlap]);
      for (const n of s.marks) markNames.add(n);
      unjudged += s.buffers;
      for (const h of s.hit) {
        const k = `${h.mark}\u0000${h.what}`, e = crossed.get(k) || { ...h, runs: [] };
        const last = e.runs.at(-1);
        if (last && t - last.to <= gap) { last.to = t; last.max = Math.max(last.max, h.w * h.h); if (h.w * h.h >= last.max) { last.w = h.w; last.h = h.h; } } else e.runs.push({ from: t, to: t, max: h.w * h.h, w: h.w, h: h.h });
        crossed.set(k, e);
      }
      for (const text of s.heads) {
        const e = live.get(text) || { runs: [] }, last = e.runs.at(-1);
        if (last && t - last.to <= gap) last.to = t; else e.runs.push({ from: t, to: t });
        live.set(text, e);
      }
    }
    if (lookAtMarks && (declares || markNames.size)) {
      console.log(`marks: ${[...markNames].join(', ') || 'none drawn'}, ${samples} frames every ${(STEP * 1000).toFixed(0)} ms${unjudged ? ` (${unjudged} texts drawn into buffers, not judged)` : ''}`);
      if (!markNames.size) console.log('  --   the page names marks, but none had a box in any frame: nothing checked');
      for (const e of crossed.values()) {
        code = 1; crossings++;
        for (const r of e.runs) console.log(`  FAIL ${e.what}${e.by ? ` (drawn by ${e.by})` : ''} crosses the mark "${e.mark}": ${r.from.toFixed(2)} s to ${(r.to + STEP).toFixed(2)} s, by up to ${r.w} x ${r.h} px (draw it before the mark, so the mark covers it, or end it before it arrives)`);
      }
      if (markNames.size && !crossings) console.log(`  ok   nothing crosses ${markNames.size === 1 ? 'the mark' : 'a mark'}`);
    }
    if (lookAtReading) {
      let readingJudged = 0;
      for (const [text, e] of live) {
        const words = text.split(/\s+/).filter(Boolean).length, need = READ.perWord * words + READ.base;
        for (const r of e.runs) {
          const on = r.to - r.from + STEP;
          readingJudged++;
          const bad = on < need - 1e-9;
          if (bad) code = 1;
          console.log(`  ${bad ? 'FAIL' : 'ok  '} reading: "${text.length > 40 ? text.slice(0, 39) + '…' : text}" ${on.toFixed(2)} s on screen from ${r.from.toFixed(2)} s, ${words} words need ${need.toFixed(1)} s${bad ? ' (keep it up longer, or cut words)' : ''}`);
        }
      }
      if (!readingJudged) console.log('  --   reading time: no headline on screen at 50 % or more');
    }
  }
  const something = judged > 0 || products > 0 || markNames.size > 0;
  if (!seen && !something) { console.log(`no headline drawn by TYPE.draw, no mark and no product box at ${points.length} moments: nothing to check`); code = 2; }
  else if (!code && seen && !judged && !products && !markNames.size) { console.log(`${seen} headlines at ${points.length} moments, none of them judged (each above says why): nothing checked`); code = 2; }
  else if (code) console.log('a check fails: move it inside the safe area, apart from the others, off the marks, onto a backdrop it reads on, bigger, longer on screen, or the product nearer (the stills show where)');
  else console.log(`${points.length} moments (${moments.length} in motion): ${seen ? `${seen} headlines, ${judged} judged, all inside the safe area, apart and readable; ${sized ? `${sized} sized, all big enough` : 'none sized (UI text, not begun or leaving)'}` : 'no headline drawn by TYPE.draw'}${products ? `; the product big enough at ${products}` : ''}${markNames.size ? '; no text across a mark' : ''}`);
} catch (e) { // a page that could not be checked is never a pass
  console.log(`layoutcheck: ${e.message.split('\n')[0]}`);
  code = 2;
} finally {
  await browser.close();
}
process.exit(code);
