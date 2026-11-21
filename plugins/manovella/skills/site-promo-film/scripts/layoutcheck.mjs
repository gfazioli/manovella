// Is every headline in the frame, clear of the others, and readable on what is behind it? At each
// moment worth a still (the page's PROMO_META.checkpoints: each scene settled, each cut half way; or
// 8 even times), every headline TYPE.draw draws is checked as the block it covers (TYPE.extent):
//   - the safe area: inside the frame less 5 % of the short side on every edge;
//   - overlap: no two headlines' blocks crossing by more than 2 px;
//   - contrast: each colour its words are drawn in at that moment (the ink; the accent for swap's
//     slot and for a 'color' emphasis once it has begun), laid over the median of a 6 px ring round
//     its block in that frame (a translucent ink is as readable as what it makes there), by WCAG's
//     ratio: 3:1 for text of 24 px or more, 4.5:1 under it. flap on its tiles: its letters against
//     its tiles, which is what is read.
// The block is where the headline rests (TYPE.extent): the checkpoints are moments at rest, and a
// style passes beyond it only on its way in or out.
//
//   node layoutcheck.mjs [page#hash]        default ./promo.html; exit 1 if a headline fails, 2 if
//                                           nothing could be checked
//
// It wraps the page's TYPE.draw: each call notes the headline, its block through the transform it is
// drawn in and the canvas it is drawn on, then draws through the original, so the film is drawn
// exactly as it would be. Only text drawn by TYPE.draw is seen: a page that draws its words another
// way (a fillText of its own, as the two templates do) has nothing to check: exit 2, never a pass.
// A headline drawn into a canvas that is not the page's (a transition's buffer, half way through a
// cut) is listed and not judged: its pixels are not the frame's. Neither are a headline under a
// scene fading out, and one whose ring is mostly another headline: neither says anything of contrast.
// A page whose headlines were all seen and none judged has not been checked: exit 2.
//
// The frame is copied into a canvas of its own and read there, never with getImageData on the film's
// canvas: a second read moves that canvas to software raster.
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';

const [file, hash = ''] = (process.argv[2] || 'promo.html').split('#');
const LIMITS = { safe: 0.05, overlap: 2, ring: 6, large: 24, minLarge: 3, min: 4.5 };
const browser = await chromium.launch({ channel: 'chrome' });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://' + resolve(file) + (hash ? '#' + hash : ''));
  await page.evaluate(() => window.ready);
  const meta = await page.evaluate(() => {
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
          window.__heads.push({ canvas: g.canvas, lines: spec.lines, style, alpha: g.globalAlpha, tiles: style === 'flap' && spec.tiles !== false,
            inks: inks.map(([k, c]) => [k, Array.isArray(c) ? `rgb(${c.join(',')})` : c]), px: spec.size * Math.hypot(m.a, m.b),
            box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
        }
        return draw(g, t, spec);
      };
    }
    return { ...window.PROMO_META, stale: !!window.TYPE && !window.TYPE.extent };
  });
  if (!meta.width) throw new Error(`${file} has no PROMO_META: not a film page`);
  if (meta.stale) throw new Error(`${file} loads a type.js without TYPE.extent: copy the kit's type.js beside it`);
  const points = meta.checkpoints?.length ? meta.checkpoints
    : Array.from({ length: 8 }, (_, i) => ({ t: +((i + 0.5) * meta.duration / 8).toFixed(2), label: '' }));
  let seen = 0, judged = 0;
  for (const { t, label } of points) {
    const rows = await page.evaluate(async ([tt, L]) => {
      if (!window.__heads) return [];
      window.__heads = [];
      await window.seek(tt);
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
      const onFrame = all.filter((r) => r.canvas === frame), m = L.safe * Math.min(W, H);
      return all.map((r) => {
        const out = { text: r.lines.join(' '), style: r.style, px: r.px, fails: [], notes: [] };
        if (r.canvas !== frame) { out.notes.push('drawn into a buffer (a transition): not judged'); return out; }
        const [x0, y0, x1, y1] = r.box, others = onFrame.filter((q) => q !== r);
        const edges = [['left', m - x0], ['top', m - y0], ['right', x1 - (W - m)], ['bottom', y1 - (H - m)]].filter(([, d]) => d > 0);
        if (edges.length) out.fails.push(`outside the safe area: ${edges.map(([e, d]) => `${e} by ${Math.ceil(d)} px`).join(', ')}`);
        for (const q of others) {
          const w = Math.min(x1, q.box[2]) - Math.max(x0, q.box[0]), h = Math.min(y1, q.box[3]) - Math.max(y0, q.box[1]);
          if (w > L.overlap && h > L.overlap) out.fails.push(`overlaps "${q.lines.join(' ')}" by ${Math.round(w)} x ${Math.round(h)} px`);
        }
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
      });
    }, [t, LIMITS]);
    if (!rows.length) continue;
    console.log(`${t.toFixed(2).padStart(6)} s  ${label || ''}`);
    for (const r of rows) {
      seen++;
      if (r.fails.length) code = 1;
      if (!r.notes.length) judged++;
      const head = `"${r.text.length > 40 ? r.text.slice(0, 39) + '…' : r.text}" ${r.style} ${Math.round(r.px)} px`;
      const tag = r.fails.length ? 'FAIL' : r.notes.length ? '--  ' : 'ok  ';
      const what = [...r.fails, ...r.notes];
      console.log(`  ${tag} ${head.padEnd(58)} ${what.length ? what.join('; ') : `contrast ${r.contrast.toFixed(1)}:1, inside, alone`}`);
    }
  }
  if (!seen) { console.log(`no headline drawn by TYPE.draw at ${points.length} moments: nothing to check`); code = 2; }
  else if (!code && !judged) { console.log(`${seen} headlines at ${points.length} moments, none of them judged (each above says why): nothing checked`); code = 2; }
  else console.log(code ? 'a headline fails: move it inside the safe area, apart from the others, or onto a backdrop it reads on (the stills show where)'
    : `${seen} headlines at ${points.length} moments, ${judged} judged: all inside the safe area, apart and readable`);
} catch (e) { // a page that could not be checked is never a pass
  console.log(`layoutcheck: ${e.message.split('\n')[0]}`);
  code = 2;
} finally {
  await browser.close();
}
process.exit(code);
