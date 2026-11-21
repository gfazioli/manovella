/*
 * type.js — headlines and kinetic type: how the words arrive, hold and leave.
 * A CLASSIC script, after film.js (it uses FILM.spr, FILM.settle and FILM.typed):
 *   <script src="film.js"></script> <script src="type.js"></script>
 * Everything is a pure function of t, like the engine: a headline drawn twice at the same t is the
 * same headline, on every worker. The only state is a cache of measurements, which never change.
 *
 *   await TYPE.load('Fraunces', faces, 'fonts/')  every face of a family (fonts/fonts.json lists them),
 *                                                 registered and loaded before frame 0
 *   TYPE.draw(ctx, t, spec)                       one headline at t, in ctx's current transform
 *   TYPE.settled(spec) → seconds                  when the last unit of its arrival is exactly at rest
 *   TYPE.measure(spec) → { width, height }        its settled size, for layout
 *   TYPE.extent(spec, t) → { x, y, width, height } | null   the block it rests in, as drawn (wider
 *                                                 than measure for flap's cells and swap's widest
 *                                                 word); null before it arrives and once it has left.
 *                                                 What scripts/layoutcheck.mjs checks
 *   TYPE.STYLES, TYPE.MARKS                       name → one line on what it does
 *
 * spec = {
 *   lines: ['Your product,', 'on {}.'],   one string per line; {} is swap's slot
 *   x, y, align: 'left'|'center'|'right', valign: 'top'|'middle'   the block's anchor (world units)
 *   size, family: 'system-ui', weight: 700, lh: 1.08 (× size), ls: 0 (em; -0.02 is tight)
 *   color: [r, g, b] or css, accent: the slot's words, the mark, the caret (default color)
 *   style: 'rise', at: 0.5, out: null     seconds: the arrival starts / the leaving starts (null: stays)
 *   pace: 1                               > 1 quicker, < 1 calmer: springs and staggers together
 *   emphasis: { word: 'stage', mark: 'highlight'|'underline'|'color', at }   at: default just after
 *                                         the arrival settles. Every style carries all three: on a
 *                                         flap board the word's tiles take the accent, a line under
 *                                         them, or its letters; swap marks any word but its slot's
 *   words: ['teams', 'makers'], every: 1.6   swap: the slot's words, seconds each one stays
 *   minWeight: 120                        weight: where the swell starts (a variable family)
 *   tiles: true                           flap: the letters on tiles, a split across each
 * }
 *
 * Rules the styles keep, from the films (site-promo-film §3, §5):
 * - Springs with damping 0.78 or more: at most ~2 % overshoot. Nothing bounces.
 * - Anything sliding through a clip travels at least 1.3 em, or a descender lingers in the box.
 * - Blur is in device pixels: a filter ignores the transform, so it is scaled by the zoom here.
 * - One style per film carries the headlines; a second, if any, is for one moment (a number).
 */
(function () {
  'use strict';
  const F = () => window.FILM;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const GENERIC = /^(system-ui|ui-monospace|ui-serif|ui-sans-serif|serif|sans-serif|monospace|cursive|fantasy)$/;
  const fam = (f) => (f || 'system-ui').split(',').map((s) => s.trim()).map((s) => (GENERIC.test(s) || /^["']/.test(s) ? s : `"${s}"`)).join(', ');
  const font = (w, size, family) => `${Math.round(w)} ${size}px ${fam(family)}`;
  const css = (c, a = 1) => (typeof c === 'string' ? c : `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+a.toFixed(4)})`);
  const zoomOf = (g) => { const m = g.getTransform(); return Math.hypot(m.a, m.b); };
  const hash01 = (n) => { let h = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const toLab = (c) => { // OKLab, for a colour change that does not pass through grey
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const [r, g, b] = c.map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const fromLab = ([L, A, B]) => {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const g = (v) => 255 * clamp(v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
    return [g(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), g(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), g(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
  };
  const mixLab = (a, b, p) => { const A = toLab(a), B = toLab(b); return fromLab([0, 1, 2].map((i) => lerp(A[i], B[i], p))); };
  const rgbOf = (c) => {
    if (Array.isArray(c)) return c;
    const m = String(c).match(/^#([0-9a-f]{6})$/i);
    return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
  };

  // ---------------------------------------------------------------- fonts
  /** Registers every face of a family (fonts.json's records: file, weight, style, stretch,
   *  unicodeRange) and resolves once ALL are loaded. A face left to load on first use would be drawn
   *  in the fallback on that frame — a still that disagrees with the video. */
  async function load(family, faces, base = 'fonts/') {
    const list = faces.map((f) => new FontFace(family, `url("${base}${f.file}")`, {
      style: f.style || 'normal', weight: f.weight || '400', ...(f.stretch ? { stretch: f.stretch } : {}), ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}),
    }));
    list.forEach((f) => document.fonts.add(f));
    await Promise.all(list.map((f) => f.load()));
    return family;
  }

  // ---------------------------------------------------------------- layout, measured once
  const MC = document.createElement('canvas').getContext('2d');
  const LAYOUT = new Map();
  /** Lines → words → letters, at the settled weight, with the slot (swap) as wide as words[0]. */
  function layout(spec, slotWord) {
    const size = spec.size, w = spec.weight ?? 700, family = spec.family || 'system-ui', ls = (spec.ls || 0) * size, lhPx = (spec.lh || 1.08) * size;
    const key = JSON.stringify([spec.lines, size, w, family, ls, lhPx, spec.align, slotWord]);
    let L = LAYOUT.get(key);
    if (L) return L;
    MC.font = font(w, size, family); MC.letterSpacing = '0px';
    const mw = (s) => MC.measureText(s).width;
    const lines = spec.lines.map((raw, li) => {
      const text = slotWord != null ? raw.replace('{}', slotWord) : raw;
      const slotAt = slotWord != null ? raw.indexOf('{}') : -1;
      const words = [];
      let i = 0;
      for (const part of text.split(/( +)/)) {
        if (!part) continue;
        if (/^ +$/.test(part)) { i += part.length; continue; }
        const x = mw(text.slice(0, i)) + i * ls;
        const letters = [...part].map((ch, k) => ({ ch, x: mw(text.slice(0, i + k)) + (i + k) * ls - x, w: mw(ch) }));
        const isSlot = slotAt >= 0 && i === slotAt;
        words.push({ text: part, i, x, w: mw(part) + (part.length - 1) * ls, letters, slot: isSlot });
        i += part.length;
      }
      const width = text.length ? mw(text) + (text.length - 1) * ls : 0;
      return { text, words, width, base: li * lhPx + size * 0.84 };
    });
    L = { lines, width: Math.max(0, ...lines.map((l) => l.width)), height: spec.lines.length * lhPx, size, ls, lhPx };
    if (LAYOUT.size > 400) LAYOUT.clear();
    LAYOUT.set(key, L);
    return L;
  }
  const lineX = (spec, line) => spec.x - (spec.align === 'center' ? line.width / 2 : spec.align === 'right' ? line.width : 0);
  const topY = (spec, L) => (spec.valign === 'middle' ? spec.y - L.height / 2 : spec.y);

  // ---------------------------------------------------------------- the styles
  // unit: what moves on its own ('word', 'letter', 'line'); stagger: seconds between units at pace 1;
  // f, z: the arrival's spring; of, oz, ostagger: the leaving's.
  const STYLE = {
    rise: { about: 'each word slides up through its own clip, one after the other: the classic', unit: 'word', stagger: 0.09, f: 2.0, z: 0.86, of: 2.6, oz: 0.95, ostagger: 0.04 },
    focus: { about: 'each word pulls into focus: blur, a fade and a short rise, gone at rest', unit: 'word', stagger: 0.11, f: 2.0, z: 0.86, of: 2.6, oz: 0.95, ostagger: 0.05 },
    cascade: { about: 'letter by letter, each rising and turning upright a moment after the last', unit: 'letter', stagger: 0.026, f: 2.4, z: 0.8, of: 3.0, oz: 1, ostagger: 0.01 },
    weight: { about: 'each word arrives thin and swells to its weight as the spacing tightens (a variable family)', unit: 'word', stagger: 0.14, f: 1.3, z: 0.9, of: 2.2, oz: 1, ostagger: 0.05 },
    track: { about: 'a title: the line closes in from wide letter-spacing, out of a soft blur, slowly', unit: 'line', stagger: 0.28, f: 0.62, z: 1, of: 1.4, oz: 1, ostagger: 0.1 },
    wipe: { about: 'a soft edge sweeps along each line and leaves it written', unit: 'line', stagger: 0.16, f: 0.95, z: 1, of: 1.6, oz: 1, ostagger: 0.08 },
    settle: { about: 'each word drops in from the camera: a little larger, soft, then exactly in place', unit: 'word', stagger: 0.1, f: 1.6, z: 0.9, of: 2.4, oz: 1, ostagger: 0.04 },
    split: { about: 'the lines slide in from opposite sides and meet: kinetic, for a bold film', unit: 'line', stagger: 0.12, f: 1.7, z: 0.9, of: 2.4, oz: 1, ostagger: 0.06 },
    flap: { about: 'a split-flap board: every letter flips through the alphabet and lands', unit: 'letter', stagger: 0.03, f: 2, z: 1, of: 2.6, oz: 1, ostagger: 0.01 },
    type: { about: 'typed by a person, with a caret; it leaves by being deleted', unit: 'line', stagger: 0.25, f: 2, z: 1, of: 2, oz: 1, ostagger: 0 },
    swap: { about: 'one word of the line keeps changing in its slot, the rest of the line making room', unit: 'word', stagger: 0.09, f: 2.0, z: 0.86, of: 2.6, oz: 0.95, ostagger: 0.04 },
    odometer: { about: 'numbers roll into place digit by digit, like a counter; the rest fades in', unit: 'letter', stagger: 0.05, f: 0.75, z: 1, of: 2.4, oz: 1, ostagger: 0.01 },
    decode: { about: 'each letter flickers through others in the accent and locks into its own, left to right: a line resolving out of noise', unit: 'letter', stagger: 0.035, f: 1.4, z: 1, of: 3.0, oz: 1, ostagger: 0.01 },
  };
  // decode: what a letter flickers through — its own kind, so the line keeps its shape (no I or l: too thin
  // to stand in for a wide letter); anything else (a space, punctuation) is itself from the start
  const POOLS = [[/\p{Lu}/u, 'ABCDEFGHJKMNPQRSTUVWXYZ'], [/\p{Ll}/u, 'abcdeghkmnopqsuvwxyz'], [/\d/, '0123456789']];
  const poolOf = (ch) => (POOLS.find(([re]) => re.test(ch)) || [])[1] || null;
  const GLYPH_W = new Map();
  const glyphW = (g, ch) => { const k = `${g.font}|${ch}`; let w = GLYPH_W.get(k); if (w === undefined) { if (GLYPH_W.size > 4000) GLYPH_W.clear(); w = g.measureText(ch).width; GLYPH_W.set(k, w); } return w; };
  const MARKS = {
    highlight: 'a marker sweeps behind the word, in the accent',
    underline: 'a line draws itself under the word, in the accent',
    color: 'the word turns to the accent',
  };

  /** The units of a layout in reading order: [{ line, word, letter, index, n }]. */
  function units(L, unit) {
    const out = [];
    L.lines.forEach((line, li) => {
      if (unit === 'line') { out.push({ li, line }); return; }
      line.words.forEach((word, wi) => {
        if (unit === 'word') out.push({ li, line, wi, word });
        else word.letters.forEach((letter, ci) => out.push({ li, line, wi, word, ci, letter }));
      });
    });
    out.forEach((u, i) => { u.index = i; u.n = out.length; });
    return out;
  }
  function timing(spec) {
    const S = STYLE[spec.style || 'rise'];
    if (!S) throw new Error(`type: no style '${spec.style}' (${Object.keys(STYLE).join(', ')})`);
    const pace = spec.pace || 1;
    return { S, pace, at: spec.at ?? 0.5, out: spec.out ?? null, f: S.f * pace, z: S.z, of: S.of * pace, oz: S.oz, st: S.stagger / pace, ost: S.ostagger / pace };
  }
  /** Seconds until the arrival is exactly over: the last unit's spring at rest. */
  function settled(spec) {
    const T = timing(spec), style = spec.style || 'rise';
    const slot = style === 'swap' ? (spec.words || [''])[0] : null;
    const L = layout(spec, slot), n = units(L, T.S.unit).length;
    if (style === 'type') {
      let at = T.at;
      for (const line of L.lines) { const r = F().typed(line.text, 1e9, at, { cps: 15 * T.pace, seed: 3 }); at = r.doneAt + T.st; }
      return at;
    }
    if (style === 'flap') { const chars = L.lines.reduce((s, l) => s + l.text.length, 0); return T.at + (chars - 1) * T.st + 9 * 0.06 / T.pace; }
    return T.at + Math.max(0, n - 1) * T.st + F().settle(T.f, T.z);
  }
  function measure(spec) { const L = layout(spec, spec.style === 'swap' ? (spec.words || [''])[0] : null); return { width: L.width, height: L.height }; }

  // ---------------------------------------------------------------- drawing
  function draw(g, t, spec) {
    const T = timing(spec), style = spec.style || 'rise', spr = F().spr;
    if (t < T.at - 0.05) return null;
    const ink = spec.color || [26, 28, 36], acc = spec.accent || ink, size = spec.size, family = spec.family || 'system-ui', W8 = spec.weight ?? 700;
    const k = zoomOf(g);
    if (style === 'swap') return drawSwap(g, t, spec, T, ink, acc, k);
    const L = layout(spec, null), top = topY(spec, L), U = units(L, T.S.unit);
    const pin = (u) => spr(t, T.at + u.index * T.st, T.f, T.z);
    const pout = (u) => (T.out == null ? 0 : spr(t, T.out + u.index * T.ost, T.of, T.oz));
    g.save();
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = font(W8, size, family); g.letterSpacing = `${L.ls}px`;
    const marks = spec.emphasis && spec.emphasis.word ? emphasisOf(spec, L, T) : null, mp = marks ? marks.p(t) : 0;
    // a highlight goes under the letters and an underline over them; a flap board marks its own tiles (drawFlap)
    const mark = marks && style !== 'flap' ? marker(g, spec, marks.word, lineX(spec, marks.line) + marks.word.x, top + marks.line.base, mp, acc) : null;
    if (mark) mark('under');
    // the colour mark, worked out once a frame: the word's ink on its way to the accent, null while there is none
    const tint = marks && spec.emphasis.mark === 'color' && mp > 0.001 ? emphInk(ink, acc, mp) : null;
    const wordColor = (u, a) => css(tint && marks.word === u.word ? tint : ink, a);
    // A style that draws its line whole (track, wipe, split, type) takes the colour mark by drawing the line
    // again inside the word's own box: the same glyphs in the same place, so nothing shifts as the colour
    // comes. x: where the line starts as drawn; extra: the spacing added between its letters (track);
    // again(rgb): the line once more, in that colour. These four never turned the word before.
    const recolor = (line, x, y, extra, again) => {
      if (!tint || marks.line !== line) return;
      const w = marks.word, pad = size * 0.04 + extra / 2;
      g.save(); g.beginPath();
      g.rect(x + w.x + w.i * extra - pad, y - size * 1.1, w.w + (w.text.length - 1) * extra + pad * 2, size * 1.5); g.clip();
      again(tint);
      g.restore();
    };
    const X = (u) => lineX(spec, u.line), Y = (u) => top + u.line.base;

    if (style === 'rise' || style === 'focus' || style === 'settle' || style === 'weight') {
      for (const u of U) {
        const pi = pin(u), po = pout(u);
        if (pi <= 0.0005 || po >= 0.9995) continue;
        const x = X(u) + u.word.x, y = Y(u);
        g.save();
        if (style === 'rise') {
          const off = (1 - pi) * size * 1.3 - po * size * 1.3;
          g.beginPath(); g.rect(x - size * 0.12, y - size * 1.02, u.word.w + size * 0.24, size * 1.34); g.clip();
          g.fillStyle = wordColor(u, 1); g.fillText(u.word.text, x, y + off);
        } else if (style === 'focus') {
          const a = clamp(pi * 1.3) * clamp(1 - po * 1.5), b = ((1 - clamp(pi)) * 0.14 + clamp(po) * 0.08) * size * k;
          g.globalAlpha *= a; if (b > 0.05) g.filter = `blur(${b.toFixed(2)}px)`;
          g.fillStyle = wordColor(u, 1); g.fillText(u.word.text, x, y + (1 - clamp(pi, 0, 1.2)) * size * 0.12 - clamp(po) * size * 0.04);
        } else if (style === 'settle') {
          const s = 1 + 0.14 * (1 - pi) + 0.06 * po, a = clamp(pi * 1.5) * (1 - po), b = ((1 - clamp(pi)) * 0.1 + po * 0.06) * size * k;
          const cx = x + u.word.w / 2, cy = y - size * 0.34;
          g.globalAlpha *= a; if (b > 0.05) g.filter = `blur(${b.toFixed(2)}px)`;
          g.translate(cx, cy); g.scale(s, s); g.translate(-cx, -cy);
          g.fillStyle = wordColor(u, 1); g.fillText(u.word.text, x, y);
        } else { // weight: thin to its weight while the spacing closes; drawn from its settled left edge
          const pw = spr(t, T.at + u.index * T.st + 0.05, T.f * 0.85, 0.92), w0 = spec.minWeight ?? 120;
          const wt = lerp(w0, W8, pw) - (W8 - w0) * po;
          g.font = font(clamp(wt, 1, 1000), size, family); g.letterSpacing = `${L.ls + size * 0.1 * (1 - pw) + size * 0.04 * po}px`;
          g.globalAlpha *= clamp(pi * 1.4) * (1 - po);
          g.fillStyle = wordColor(u, 1); g.fillText(u.word.text, x, y + (1 - clamp(pi, 0, 1.1)) * size * 0.18);
        }
        g.restore();
      }
    } else if (style === 'cascade') {
      g.letterSpacing = '0px';
      for (const u of U) {
        const pi = pin(u), po = pout(u);
        if (pi <= 0.0005 || po >= 0.9995) continue;
        const x = X(u) + u.word.x + u.letter.x, y = Y(u);
        g.save();
        g.globalAlpha *= clamp(pi * 1.7) * (1 - po);
        g.translate(x + u.letter.w / 2, y + (1 - pi) * size * 0.5 - po * size * 0.22);
        g.rotate((1 - pi) * -0.12 + po * 0.05);
        g.fillStyle = wordColor(u, 1); g.fillText(u.letter.ch, -u.letter.w / 2, 0);
        g.restore();
      }
    } else if (style === 'decode') {
      g.letterSpacing = '0px';
      // the flicker changes 22 times a second, on a clock that starts with the headline: a hash of the
      // letter and that step, so a frame drawn twice, or on another worker, shows the same letters
      const step = Math.floor((t - T.at) * 22 * T.pace), a0 = g.globalAlpha; // a0: the alpha it is drawn under (a scene fading)
      for (const u of U) {
        const pi = pin(u), po = pout(u);
        if (pi <= 0.0005 || po >= 0.9995) continue;
        const x = X(u) + u.word.x + u.letter.x, y = Y(u), pool = poolOf(u.letter.ch);
        g.globalAlpha = a0 * clamp(pi * 3) * (1 - po);
        if (pi > 0.72 || !pool) { g.fillStyle = wordColor(u, 1); g.fillText(u.letter.ch, x, y); continue; } // locked
        // of three it could flicker to, the one nearest its own width: an m in the cell of an i runs
        // into its neighbours, and the line reads as a smudge instead of as letters changing
        let ch = pool[0], off = Infinity;
        for (let j = 0; j < 3; j++) {
          const c = pool[Math.floor(hash01(u.index * 131 + step + j * 977) * pool.length)], d = Math.abs(glyphW(g, c) - u.letter.w);
          if (d < off) { ch = c; off = d; }
        }
        g.fillStyle = css(acc); g.fillText(ch, x + (u.letter.w - glyphW(g, ch)) / 2, y); // in the letter's own cell
      }
      g.globalAlpha = a0;
    } else if (style === 'track' || style === 'wipe' || style === 'split') {
      for (const u of U) {
        const pi = pin(u), po = pout(u);
        if (pi <= 0.0005 || po >= 0.9995) continue;
        const line = u.line, y = Y(u);
        g.save();
        if (style === 'track') {
          const extra = size * (0.55 * (1 - pi) + 0.12 * po), w = line.width + extra * Math.max(0, line.text.length - 1);
          const x = spec.x - (spec.align === 'center' ? w / 2 : spec.align === 'right' ? w : 0);
          const b = ((1 - pi) * 0.06 + po * 0.03) * size * k;
          g.globalAlpha *= smooth(pi * 1.2) * (1 - smooth(po));
          if (b > 0.05) g.filter = `blur(${b.toFixed(2)}px)`;
          g.letterSpacing = `${L.ls + extra}px`;
          g.fillStyle = css(ink); g.fillText(line.text, x, y);
          recolor(line, x, y, extra, (rgb) => { g.fillStyle = css(rgb); g.fillText(line.text, x, y); });
          g.restore();
          continue;
        }
        const x = lineX(spec, line);
        if (style === 'wipe') { // the fill itself carries the edge: a gradient along the line, no buffer
          const fe = size * 0.9, e = x - fe + pi * (line.width + 2 * fe), ex = x - fe + po * (line.width + 2 * fe);
          const g0 = x - fe * 2, span = line.width + fe * 4, at = (v) => clamp((v - g0) / span);
          const swept = (rgb) => {
            const gr = g.createLinearGradient(g0, 0, g0 + span, 0);
            gr.addColorStop(0, css(rgb, po > 0 ? 0 : 1));
            if (po > 0) { gr.addColorStop(at(ex - fe), css(rgb, 0)); gr.addColorStop(at(ex), css(rgb, 1)); }
            gr.addColorStop(at(e - fe), css(rgb, 1)); gr.addColorStop(at(e), css(rgb, 0)); gr.addColorStop(1, css(rgb, 0));
            g.fillStyle = gr; g.fillText(line.text, x, y);
          };
          swept(rgbOf(ink) || [0, 0, 0]);
          recolor(line, x, y, 0, swept);
        } else { // split: alternate sides, a fade over the first third
          const side = u.li % 2 ? 1 : -1, dx = side * (1 - pi) * Math.max(size * 3, line.width * 0.45) - side * po * size * 1.5;
          g.globalAlpha *= clamp(pi * 1.6) * (1 - po);
          g.fillStyle = css(ink); g.fillText(line.text, x + dx, y);
          recolor(line, x + dx, y, 0, (rgb) => { g.fillStyle = css(rgb); g.fillText(line.text, x + dx, y); });
        }
        g.restore();
      }
    } else if (style === 'flap') {
      drawFlap(g, t, spec, L, top, U, T, ink, k, marks, acc);
    } else if (style === 'type') {
      drawTyped(g, t, spec, L, top, T, ink, acc, recolor);
    } else if (style === 'odometer') {
      drawOdometer(g, t, spec, L, top, U, T, wordColor);
    }
    if (mark) mark('over');
    g.restore();
    return { width: L.width, height: L.height };
  }

  /** The block a headline rests in, in its own units: measure()'s, except where a style draws wider
   *  than its letters (flap's cells; swap's slot, which takes its widest word; type's caret, 0.1 em
   *  past the last letter). Null before the
   *  arrival starts and once the leaving is over (type's: deleted at 42 letters a second, then its
   *  caret). On the way in and out a style may pass beyond it (split slides in from the side, track
   *  starts wide, settle starts larger, a word leaving swap's slot shows above it): this is where it
   *  rests. */
  function extent(spec, t) {
    const T = timing(spec), style = spec.style || 'rise';
    if (t < T.at - 0.05) return null;
    const words = spec.words && spec.words.length ? spec.words : ['—'];
    const L = layout(spec, style === 'swap' ? words[0] : null);
    const left = style === 'type' ? T.out + (L.lines.reduce((n, l) => n + l.text.length, 0) + 18) / (42 * T.pace) // drawTyped's `emptied`
      : T.out + Math.max(0, units(L, T.S.unit).length - 1) * T.ost + F().settle(T.of, T.oz);
    if (T.out != null && t >= left) return null;
    const width = style === 'flap' ? Math.max(...L.lines.map((l) => flapWidth(l, spec.size)))
      : style === 'swap' ? Math.max(...words.map((w) => layout(spec, w).width)) : L.width;
    const caret = style === 'type' ? spec.size * 0.1 : 0; // drawTyped's bar: 0.04 em out, 0.06 em wide
    return { x: spec.x - (spec.align === 'center' ? width / 2 : spec.align === 'right' ? width : 0), y: topY(spec, L), width: width + caret, height: L.height };
  }

  // the emphasis: which word (never swap's slot, whose changing word is in the accent already), and its
  // progress after the arrival
  // Found once for a layout and what the spec says of its emphasis and its timing (EMPH, by layout): a frame is
  // drawn sixteen times a render, and each draw then only asks p(t), instead of matching the word and working out
  // when the arrival settles again.
  const EMPH = new WeakMap(), LETTERS = new WeakMap();
  function emphasisOf(spec, L, T) {
    const E = spec.emphasis, key = `${E.word}|${E.mark}|${E.at}|${spec.style}|${spec.pace}|${spec.at}|${spec.out}`;
    let known = EMPH.get(L);
    if (!known) EMPH.set(L, known = new Map());
    if (!known.has(key)) known.set(key, findEmphasis(spec, L, T));
    return known.get(key);
  }
  function findEmphasis(spec, L, T) {
    const E = spec.emphasis, target = String(E.word).toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''), spr = F().spr;
    for (const [li, line] of L.lines.entries()) for (const [wi, word] of line.words.entries()) {
      if (word.slot || word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') !== target) continue;
      const at = E.at ?? settled(spec) + 0.15;
      // it leaves with the headline: on the leaving's own spring, or, typed, as the deleting (42 letters a
      // second, from the end) reaches the word: a mark used to stand a moment under letters already gone
      const after = L.lines.slice(li + 1).reduce((n, l) => n + l.text.length, 0) + line.text.length - word.i;
      const gone = (t) => (T.out == null ? 0 : spec.style === 'type' ? clamp((t - T.out) * 42 * T.pace / after) : spr(t, T.out, T.of, 1));
      // cell: where the word starts counted in characters, as a flap board counts its cells; word.i counts UTF-16
      // units, so an emoji earlier in the line put the board's mark one cell to the right
      return { line, word, li, wi, at, cell: [...line.text.slice(0, word.i)].length, p: (t) => spr(t, at, E.mark === 'color' ? 1.4 : 1.1, 1) - gone(t) };
    }
    return null;
  }
  /** The mark's colour at progress p: from the ink to the accent, in OKLab. */
  const emphInk = (ink, acc, p) => mixLab(rgbOf(ink) || [0, 0, 0], rgbOf(acc) || [0, 0, 0], clamp(p));
  /** The word's own letters, without the punctuation round them: from and to among word.letters, and the
   *  box they take from the word's left edge. A mark under a comma or a full stop reads as a mistake. */
  function lettersOf(word) {
    let box = LETTERS.get(word);
    if (box) return box;
    const Ls = word.letters, is = (l) => /[\p{L}\p{N}]/u.test(l.ch), a = Math.max(0, Ls.findIndex(is)), back = [...Ls].reverse().findIndex(is), b = back < 0 ? Ls.length - 1 : Ls.length - 1 - back;
    LETTERS.set(word, box = { a, b, x: Ls[a].x, w: Ls[b].x + Ls[b].w - Ls[a].x });
    return box;
  }
  /** The two halves of a word's mark, for a style to draw its letters between: mark('under'), then mark('over'). */
  const marker = (g, spec, word, wx, y, p, acc) => (layer) => drawMarks(g, spec, word, wx, y, p, acc, layer);
  /** A highlight (layer 'under': before the letters) or an underline ('over'), at progress p, for the word
   *  whose left edge is at wx on the baseline y. The colour mark is the letters' own, not drawn here. */
  function drawMarks(g, spec, word, wx, y, p, acc, layer) {
    const mark = spec.emphasis.mark || 'highlight';
    if (mark === 'color' || (mark === 'highlight') !== (layer === 'under') || p <= 0.001) return;
    const size = spec.size, box = lettersOf(word), x = wx + box.x, ww = box.w;
    const rgb = rgbOf(acc) || [91, 91, 247];
    g.save();
    if (mark === 'highlight') {
      const pad = size * 0.08, w = (ww + pad * 2) * clamp(p);
      g.beginPath(); g.roundRect(x - pad, y - size * 0.74, Math.max(0, w), size * 0.9, size * 0.12);
      g.fillStyle = css(rgb, 0.3); g.fill();
    } else {
      const w = ww * clamp(p), h = Math.max(1.5, size * 0.065);
      g.beginPath(); g.roundRect(x, y + size * 0.12, Math.max(0, w), h, h / 2);
      g.fillStyle = css(rgb, 1); g.fill();
    }
    g.restore();
  }

  // flap: a split-flap board. Every character has a cell of the same width, as on a real board, its
  // tile in the ink and its letter in the opposite; each flips through a run of glyphs before it
  // lands, the flap shown as the glyph folding about the split. Spaces are blank tiles.
  const FLAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLAP_CELL = 0.66, FLAP_GAP = 0.07; // em: a cell, the gap after it
  const flapWidth = (line, size) => { const cw = size * FLAP_CELL, gap = size * FLAP_GAP; return [...line.text].length * (cw + gap) - gap; };
  // The emphasis on a board is the board's own: the word's tiles turn to the accent (highlight), a line
  // draws itself under them (underline), or its letters turn (colour). The marker and the line used to be
  // drawn where the word would sit as running text: the one hidden behind the tiles, the other across them.
  function drawFlap(g, t, spec, L, top, U, T, ink, k, M, acc) {
    const size = spec.size, step = 0.06 / T.pace, cw = size * FLAP_CELL, gap = size * FLAP_GAP, pitch = cw + gap;
    const inkRGB = rgbOf(ink) || [26, 28, 36], light = inkRGB.reduce((s, v) => s + v, 0) > 382;
    const glyphRGB = spec.tiles === false ? inkRGB : (light ? [18, 19, 24] : [246, 246, 248]), accRGB = rgbOf(acc) || [91, 91, 247];
    const tile = spec.tiles === false ? null : css(inkRGB, 0.94), glyph = css(glyphRGB);
    const mark = M ? spec.emphasis.mark || 'highlight' : null, mp = M ? clamp(M.p(t)) : 0, span = M ? lettersOf(M.word) : null;
    const from = M ? M.cell + span.a : 0, to = M ? M.cell + span.b : -1; // the word's letters, as cells of its line
    g.letterSpacing = '0px';
    let index = 0;
    L.lines.forEach((line, li) => {
      const chars = [...line.text], width = flapWidth(line, size);
      const x0 = spec.x - (spec.align === 'center' ? width / 2 : spec.align === 'right' ? width : 0), y = top + line.base;
      const here = mp > 0.001 && M.li === li, marked = (ci) => here && ci >= from && ci <= to;
      if (here && mark === 'highlight' && !tile) { // no tiles to turn: a marker behind the cells
        g.beginPath(); g.roundRect(x0 + from * pitch - size * 0.04, y - size * 0.86, ((to - from + 1) * pitch - gap + size * 0.08) * mp, size * 1.1, size * 0.09);
        g.fillStyle = css(accRGB, 0.3); g.fill();
      }
      chars.forEach((target, ci) => {
        const i = index++, t0 = T.at + i * T.st, tau = t - t0;
        const po = T.out == null ? 0 : F().spr(t, T.out + i * T.ost, T.of, T.oz);
        if (tau < 0 || po >= 0.9995) return;
        const x = x0 + ci * pitch, mid = y - size * 0.31;
        const n = target === ' ' ? 0 : 3 + Math.floor(hash01(i * 131 + 7) * 6), kf = Math.floor(tau / step);
        const landed = kf >= n, phi = landed ? 1 : (tau - kf * step) / step;
        const pick = FLAP[Math.floor(hash01(i * 977 + kf * 31) * FLAP.length)];
        const ch = landed ? target : (target === target.toUpperCase() ? pick : pick.toLowerCase());
        g.save();
        g.globalAlpha *= clamp(tau / (step * 1.5)) * (1 - po);
        if (tile) { g.beginPath(); g.roundRect(x, y - size * 0.86, cw, size * 1.1, size * 0.09); g.fillStyle = marked(ci) && mark === 'highlight' ? css(emphInk(inkRGB, accRGB, mp), 0.94) : tile; g.fill(); }
        if (ch !== ' ') {
          const gw = g.measureText(ch).width, sx = Math.min(1, (cw * 0.9) / Math.max(1, gw));
          const sy = landed ? 1 : Math.max(0.06, Math.abs(Math.cos(Math.PI * phi))); // folding about the split
          g.translate(x + cw / 2, mid); g.scale(sx, sy); g.translate(-(x + cw / 2), -mid);
          g.fillStyle = marked(ci) && mark === 'color' ? css(emphInk(glyphRGB, accRGB, mp)) : glyph; g.fillText(ch, x + (cw - gw) / 2, y);
        }
        g.restore();
        if (tile) { // the split across the tile
          g.save(); g.globalAlpha *= clamp(tau / (step * 1.5)) * (1 - po);
          g.fillStyle = light ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.45)';
          g.fillRect(x, mid - Math.max(0.5, size * 0.01), cw, Math.max(1, size * 0.02));
          g.restore();
        }
      });
      if (here && mark === 'underline') { // under the word's tiles, drawn from its first
        const h = Math.max(1.5, size * 0.065);
        g.beginPath(); g.roundRect(x0 + from * pitch, y + size * 0.3, ((to - from + 1) * pitch - gap) * mp, h, h / 2);
        g.fillStyle = css(accRGB); g.fill();
      }
    });
  }

  // type: FILM.typed's human cadence, line after line, a caret; it leaves by being deleted, from the end
  function drawTyped(g, t, spec, L, top, T, ink, acc, recolor) {
    const size = spec.size, cps = 15 * T.pace;
    let at = T.at;
    const typed = L.lines.map((line) => { const r = F().typed(line.text, t, at, { cps, seed: 3 }); at = (r.doneAt ?? 1e9) + T.st; return r; });
    const shown = typed.reduce((s, r) => s + r.n, 0);
    const gone = T.out != null && t > T.out ? Math.floor((t - T.out) * 42 * T.pace) : 0;
    let keep = Math.max(0, shown - gone);
    const vis = typed.map((r) => { const v = Math.min(r.n, keep); keep -= v; return v; });
    MC.font = font(spec.weight ?? 700, size, spec.family); MC.letterSpacing = '0px';
    let caret = null;
    L.lines.forEach((line, li) => {
      const x = lineX(spec, line), y = top + line.base, v = vis[li];
      if (v > 0) {
        g.fillStyle = css(ink); g.fillText(line.text.slice(0, v), x, y);
        recolor(line, x, y, 0, (rgb) => { g.fillStyle = css(rgb); g.fillText(line.text.slice(0, v), x, y); });
      }
      // the caret sits after the last line that holds anything, or on the first while nothing does
      if (v > 0 || li === 0) caret = { x: x + (v ? MC.measureText(line.text.slice(0, v)).width + v * L.ls : 0), y };
    });
    const allDone = typed[typed.length - 1].done && gone === 0;
    const blinkOn = allDone ? typed[typed.length - 1].caret : true;
    const emptied = T.out != null && gone >= shown + 18; // gone a moment after the last letter
    if (caret && blinkOn && !emptied) { g.fillStyle = css(acc); g.fillRect(caret.x + size * 0.04, caret.y - size * 0.78, Math.max(2, size * 0.06), size * 0.92); }
  }

  // odometer: each digit column rolls up through whole turns to its digit; anything else fades in
  function drawOdometer(g, t, spec, L, top, U, T, inkOf) { // inkOf(u, alpha): a letter's colour, the emphasis's when its word carries one
    const size = spec.size, lh = size * 1.0; // the window (below) is 0.94 em: one digit at rest, two only while turning
    g.letterSpacing = '0px';
    // MC keeps the font of the last layout it measured, which a cached layout never resets: without
    // this, every digit was centred with another headline's widths and slid out of its own window
    MC.font = font(spec.weight ?? 700, size, spec.family); MC.letterSpacing = '0px';
    let col = 0;
    for (const u of U) {
      const ch = u.letter.ch, x = lineX(spec, u.line) + u.word.x + u.letter.x, y = top + u.line.base;
      const po = T.out == null ? 0 : F().spr(t, T.out + u.index * T.ost, T.of, T.oz);
      if (po >= 0.9995) continue;
      g.save(); g.globalAlpha *= 1 - po;
      if (/[0-9]/.test(ch)) {
        const p = F().spr(t, T.at + col * T.st, T.f, T.z), turns = 1 + (col % 3), target = +ch, steps = turns * 10 + target;
        const pos = steps * p, base = Math.floor(pos), frac = pos - base;
        g.beginPath(); g.rect(x - size * 0.1, y - size * 0.82, u.letter.w + size * 0.2, size * 0.94); g.clip();
        g.fillStyle = inkOf(u, 1);
        if (p > 0) for (let d = 0; d < 2; d++) { // the column moves up: the next digit comes from below
          const digit = (base + d) % 10, dy = (d - frac) * lh;
          const cw = MC.measureText(String(digit)).width; // tabular cells: every digit centred in the column
          g.fillText(String(digit), x + (u.letter.w - cw) / 2, y + dy);
        }
        col++;
      } else {
        g.globalAlpha *= clamp(F().spr(t, T.at + u.index * T.st * 0.4, 1.6, 1) * 1.4);
        g.fillStyle = inkOf(u, 1); g.fillText(ch, x, y);
      }
      g.restore();
    }
  }

  // swap: the line arrives like rise; then the slot's word changes every `every` seconds, the slot's
  // width following on a spring and the rest of the line moving with it
  function drawSwap(g, t, spec, T, ink, acc, k) {
    const words = spec.words && spec.words.length ? spec.words : ['—'], every = (spec.every ?? 1.6) / T.pace, size = spec.size, family = spec.family || 'system-ui', W8 = spec.weight ?? 700;
    const Ls = words.map((w) => layout(spec, w));
    const L0 = Ls[0], top = topY(spec, L0), spr = F().spr;
    const start = settled({ ...spec, style: 'rise' }) + 0.6 / T.pace;
    // which change is under way: j → j+1 from the boundary b_j = start + j·every (cycling)
    let j = 0, s = 0;
    if (t > start) { const q = (t - start) / every; j = Math.floor(q); s = spr(t, start + j * every, 1.6 * T.pace, 0.9); }
    const a = words[j % words.length], b = words[(j + 1) % words.length], ia = j % words.length, ib = (j + 1) % words.length;
    g.save(); g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.font = font(W8, size, family);
    const U = units(L0, 'word');
    const pin = (i) => spr(t, T.at + i * T.st, T.f, T.z), pout = (i) => (T.out == null ? 0 : spr(t, T.out + i * T.ost, T.of, T.oz));
    // the emphasis, on a word that is not the slot's: it follows its word as the slot's width moves the line.
    // (The style returned before any mark was drawn: an emphasis chosen with it did nothing.)
    const M = spec.emphasis && spec.emphasis.word ? emphasisOf(spec, L0, T) : null, mp = M ? M.p(t) : 0;
    const tint = M && spec.emphasis.mark === 'color' ? emphInk(ink, acc, mp) : null; // the colour mark, once a frame
    L0.lines.forEach((line, li) => {
      const la = Ls[ia].lines[li], lb = Ls[ib].lines[li];
      const slotA = la.words.find((w) => w.slot), slotB = lb.words.find((w) => w.slot);
      const wA = slotA ? slotA.w : 0, wB = slotB ? slotB.w : 0, wNow = lerp(wA, wB, s);
      const width = la.width + (wNow - wA);
      const x0 = spec.x - (spec.align === 'center' ? width / 2 : spec.align === 'right' ? width : 0), y = top + line.base;
      la.words.forEach((word, wi) => {
        const u = U.find((q) => q.li === li && q.wi === wi), pi = pin(u ? u.index : 0), po = pout(u ? u.index : 0);
        if (pi <= 0.0005 || po >= 0.9995) return;
        const after = slotA && word.x > slotA.x ? wNow - wA : 0, x = x0 + word.x + after;
        const off = (1 - pi) * size * 1.3 - po * size * 1.3, mark = M && M.li === li && M.wi === wi ? marker(g, spec, word, x, y, mp, acc) : null;
        if (mark) mark('under');
        g.save(); g.beginPath(); g.rect(x - size * 0.12, y - size * 1.02, (word.slot ? Math.max(wA, wB) : word.w) + size * 0.24, size * 1.34); g.clip();
        if (!word.slot) { g.fillStyle = css(mark && tint ? tint : ink); g.fillText(word.text, x, y + off); }
        else {
          g.fillStyle = css(acc);
          if (s <= 0) g.fillText(a, x, y + off);
          else { g.fillText(a, x, y + off - s * size * 1.3); g.fillText(b, x, y + off + (1 - s) * size * 1.3); }
        }
        g.restore();
        if (mark) mark('over');
      });
    });
    g.restore();
    return { width: L0.width, height: L0.height };
  }

  window.TYPE = {
    load, draw, settled, measure, extent,
    STYLES: Object.fromEntries(Object.entries(STYLE).map(([k, v]) => [k, v.about])),
    MARKS,
  };
})();
