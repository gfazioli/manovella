/*
 * film.js — engine pieces every film page shares: promo.html, release.html, reel.html.
 * A CLASSIC script like fx.js, loaded before the page's own: <script src="film.js"></script>.
 * Everything stays a pure function of t; the only state is caches of things that never change.
 *
 * Stills and stability
 *   const STAGE = FILM.stage(ctx)        the frame's own context: subpixel jitter + 'high' smoothing
 *   STAGE.begin(opts)                    first thing in seek(t, opts): takes opts.jitter from render.mjs
 *   FILM.draw(ctx, src, x, y, w, h)      a raster (icon, symbol, photo) that holds still under zoom and drift
 *   FILM.load(src) → Promise<Image>      decode a picture before frame 0
 *   FILM.tint(img, rgb) → canvas         a one-colour copy of a template image (an SF Symbol): draw it with FILM.draw
 *
 * Motion (seconds, not beats: a page on a beat grid passes B(n))
 *   FILM.spr(t, t0, f, z)                closed-form spring step 0 → 1, exactly 1 once settled
 *   FILM.track(v0, [[t, v, f, z], …])    a value moved by one spring per key
 *   FILM.camera([[t, x, y, zoom, f, z], …], home)   springs on x, y and LOG zoom → (t) => { x, y, z }
 *   FILM.settle(f, z)                    seconds until spr(…) is exactly 1 (check it against the film's end)
 *   FILM.ease5(x)                        0 → 1 with no velocity or acceleration at either end
 *   FILM.beats(times, at) → B            B(n) on a soundtrack's own beats, for a track that drifts: times from
 *                                        scripts/beats.mjs --out beats.js (BEATS.beats), at = AUDIO_AT
 *
 * Long films: scenes on a timeline, with transitions and chapters
 *   const TL = FILM.timeline({ W, H, scenes, use, under, over, trans })
 *   TL.draw(ctx, t, opts)   TL.duration   TL.chapters   TL.checkpoints   TL.at(t)
 *   FILM.TRANSITIONS                     name → one line. On the 2D canvas: fade, dip, push, cover, zoom, iris, wipe,
 *                                        blur, split, shape, window, stripes, frost, sweep, snap, tiles. As a
 *                                        fragment shader (FILM.GL_TRANSITIONS): whip, zoomblur, liquid, ripple,
 *                                        halftone, flip, cube, page
 *   (documented at FILM.timeline below)
 *
 * Effects (each draws through a frame-sized buffer made once, with the frame's jitter)
 *   FILM.selective(g, { blur, clip, draw })   depth of field: everything blurred by `blur` device px
 *                                        except inside clip(g) — a rack focus when blur follows a spring
 *   FILM.knockout(g, { mask, fill })     fill(g) seen only through mask(g): type as a window onto the UI
 *   FILM.typed(text, t, t0, opts)        how much of a typed line shows at t: a human cadence, pauses
 *                                        after words and punctuation, the same on every worker
 *   FILM.captions(g, t, cues, opts)      the subtitle of the moment, low on the frame: cues [{ t0, t1, lines }]
 *                                        as scripts/narrate.mjs writes them (NARRATION.cues), for a film that is told
 *   FILM.narrated(N, make, opts)         a timeline's scenes on a narration's clock: one a step, each beginning a
 *                                        moment before its sentence and as long as the voice takes
 *
 * Why the stage, measured on a lab film (a slow +66 % zoom and a 0.2 px-a-frame drift, 16 subframes):
 * - Chrome snaps glyphs to whole device pixels vertically, so text in a slow drift or zoom steps a
 *   pixel every few frames: its ink centroid wobbled 0.33-0.37 px RMS. No transform trick changed
 *   it (a 1e-4 rotation or skew, a 4x font scaled down, geometricPrecision, --font-render-hinting).
 *   A different subpixel offset for each of the 16 subframes, on a stratified 4x4 grid, turns the
 *   blend render.mjs already does into a 16-sample antialias as well: 0.11 px in the zoom, 0.05 px
 *   in the drift, at no cost in render time. That is STAGE.
 * - drawImage defaults to imageSmoothingQuality 'low', no mipmaps: the 1024 px app icon drawn at
 *   90-150 px scored 15.6 on a flicker index (mean temporal second difference, x100) and 41.7 in a
 *   drift. 'high' mipmaps a decoded image: 8.9, and 6.6 with the jitter. Chrome ignores the setting
 *   for a canvas or an ImageBitmap source — the same icon from a canvas scored 22.1 — and every
 *   tinted symbol is a canvas. FILM.draw builds a pyramid for those once and blends the two levels
 *   around the on-screen size (trilinear), baked per size so a frame only ever draws from canvases
 *   that stay still. A tinted symbol in a slow drift: its centroid wobbled 0.28 px drawn plainly,
 *   0.03 px with the jitter, 0.002 px with the jitter and FILM.draw (flicker index 4.6, 2.1, 0.7).
 * - A canvas drawn into and then drawn FROM within one frame forces a GPU sync: a first FILM.draw
 *   that mixed the levels in a scratch canvas per call rendered a real 28 s film in 315 s against
 *   178 s. Baked, 179 s.
 * - Chrome's blur filter grows in 2 px steps as its radius animates (a focus pull, a glass surface
 *   in a zoom): the jitter halves the steps.
 */
(function () {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const ease5 = (x) => { x = clamp(x); return x * x * x * (x * (6 * x - 15) + 10); };
  const rgba = (c, a = 1) => (typeof c === 'string' ? c : `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`);

  // ---------------------------------------------------------------- the stage: jitter on the frame's context
  /** Installs subpixel jitter on the context the film is captured from. Every setTransform on it
   *  gains the subframe's offset, so nothing drawn can forget it; getTransform answers without it,
   *  so a get → set round trip (glass does one) does not add it twice. What must stay on the pixel
   *  grid (the dither and the grain: averaged across shifted copies they would blur away) uses
   *  ctx.rawSetTransform. A full-frame fill should overhang the frame by a pixel or two. */
  function stage(ctx) {
    const P = CanvasRenderingContext2D.prototype;
    const raw = P.setTransform.bind(ctx), get = P.getTransform.bind(ctx);
    const J = [0, 0];
    ctx.setTransform = function (a, b, c, d, e, f) {
      if (a === undefined) { a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; }
      else if (a !== null && typeof a === 'object') ({ a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 } = a);
      raw(a, b, c, d, e + J[0], f + J[1]);
    };
    ctx.resetTransform = () => raw(1, 0, 0, 1, J[0], J[1]);
    ctx.getTransform = () => { const m = get(); m.e -= J[0]; m.f -= J[1]; return m; };
    ctx.rawSetTransform = raw;
    ctx.jitter = J; // live: fx.js and FILM.draw read it
    ctx.imageSmoothingQuality = 'high';
    return {
      /** First in seek(): the subframe's offset from render.mjs, or none (stills, loopcheck). */
      begin(opts = {}) {
        const j = opts.jitter || [0, 0];
        J[0] = j[0]; J[1] = j[1];
        raw(1, 0, 0, 1, J[0], J[1]);
        ctx.imageSmoothingQuality = 'high';
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
      },
      get jitter() { return [J[0], J[1]]; },
    };
  }

  // ---------------------------------------------------------------- rasters
  const load = (src) => new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(new Error('image: ' + src)); i.src = src;
  });
  function tint(img, rgb) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = Array.isArray(rgb) ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : rgb;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }
  const PYR = new WeakMap(), TRI = new WeakMap();
  function pyramid(src) { // each level half the one before, filtered 2:1: built once per source
    let lv = PYR.get(src);
    if (lv) return lv;
    lv = [src];
    let w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, cur = src;
    while (w > 2 && h > 2) {
      w = Math.max(1, Math.round(w / 2)); h = Math.max(1, Math.round(h / 2));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h);
      lv.push(c); cur = c;
    }
    PYR.set(src, lv);
    return lv;
  }
  /** The source reduced by 2^Lq, the two pyramid levels around that size mixed linearly AT that
   *  size ('lighter' adds premultiplied pixels): trilinear filtering, baked. Lq is on a grid of
   *  1/16 octave, so the cache is finite and the final draw is within ±2 % of 1:1. Made once per
   *  size and never drawn into again: a canvas that stays still is cheap to draw from, while one
   *  redrawn per call forced a GPU sync each time (a scratch-canvas version rendered a real 28 s
   *  film in 315 s against 178 s). */
  function trilinear(src, Lq) {
    let m = TRI.get(src);
    if (!m) { m = new Map(); TRI.set(src, m); }
    let c = m.get(Lq);
    if (c) return c;
    if (m.size > 256) m.clear(); // a bound on memory; the output does not depend on it
    const lv = pyramid(src), top = lv.length - 1;
    const Lc = Math.min(Lq, top), i = Math.max(0, Math.min(Math.floor(Lc), top - 1)), f = clamp(Lc - i);
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    const w = Math.max(1, Math.round(sw / 2 ** Lq)), h = Math.max(1, Math.round(sh / 2 ** Lq));
    c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 1 - f; g.drawImage(lv[i], 0, 0, w, h);
    if (f > 0.001) { g.globalAlpha = f; g.drawImage(lv[i + 1], 0, 0, w, h); }
    m.set(Lq, c);
    return c;
  }
  /** Draws a raster where drawImage would, in the current transform, so it holds still under a zoom
   *  or a drift. A decoded image goes straight through with 'high' (Chrome mipmaps it). A canvas
   *  reduced more than 2:1 — a tinted symbol — is drawn from its baked trilinear copy at the nearest
   *  1/16 octave. Any transform, rotations included: the reduction is read off its scale. */
  function draw(ctx, src, x, y, w, h) {
    if (!(w > 0 && h > 0)) return;
    const q = ctx.imageSmoothingQuality;
    ctx.imageSmoothingQuality = 'high';
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    const m = ctx.getTransform();
    const kx = Math.hypot(m.a, m.b), ky = Math.hypot(m.c, m.d); // device pixels per unit, per axis
    const L = Math.log2(Math.max(sw / (w * kx), sh / (h * ky)));
    if ((typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) || !(L > 1)) ctx.drawImage(src, x, y, w, h);
    else ctx.drawImage(trilinear(src, Math.round(L * 16) / 16), x, y, w, h);
    ctx.imageSmoothingQuality = q;
  }

  // ---------------------------------------------------------------- motion
  /** B(n) for a page that follows a soundtrack's own beats rather than a fixed bpm: beat n of the film
   *  is the n-th of the track's beats from `at` (AUDIO_AT) on, in film seconds. A fraction lands that
   *  far between two beats; past either end, the mean of the nearest eight beats carries on. */
  function beats(times, at = 0) {
    const n = times.length;
    if (n < 2) return (x) => x * 0.5;
    let k0 = times.findIndex((x) => x >= at - 0.035);
    if (k0 < 0) k0 = n - 1;
    const per = (a, b) => (times[b] - times[a]) / (b - a);
    return (x) => {
      const i = k0 + x, j = Math.floor(i);
      if (j < 0) return times[0] + i * per(0, Math.min(8, n - 1)) - at;
      if (j >= n - 1) return times[n - 1] + (i - n + 1) * per(Math.max(0, n - 9), n - 1) - at;
      return times[j] + (i - j) * (times[j + 1] - times[j]) - at;
    };
  }
  /** Closed-form step response of a damped spring, 0 → 1, exactly 1 once the residual is < 2e-5. */
  function spr(t, t0, f = 1.8, z = 0.86) {
    const tau = t - t0;
    if (tau <= 0) return 0;
    const w = 2 * Math.PI * f, a = z * w, env = Math.exp(-a * tau);
    if (z >= 1) { const r = env * (1 + w * tau); return r < 2e-5 ? 1 : 1 - r; }
    if (env < 2e-5) return 1;
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - env * (Math.cos(wd * tau) + (a / wd) * Math.sin(wd * tau));
  }
  /** v0, then one spring per [t, value, f, z]; a value with several targets is the sum of one
   *  spring per change, so it can be retargeted mid-flight and still be exact at rest. */
  function track(v0, keys) {
    return (t) => {
      let v = v0, prev = v0;
      for (const [tk, val, f = 1.8, z = 0.86] of keys) { v += (val - prev) * spr(t, tk, f, z); prev = val; }
      return v;
    };
  }
  /** Seconds until spr(t, 0, f, z) returns exactly 1. */
  function settle(f, z) {
    let lo = 0, hi = 60;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (spr(m, 0, f, z) === 1) hi = m; else lo = m; }
    return hi;
  }
  /** Springs on x, y and LOG zoom (a zoom that doubles and one that halves take the same time). */
  function camera(keys, home = { x: 0, y: 0, z: 1 }) {
    const X = track(home.x, keys.map((k) => [k[0], k[1], k[4] ?? 1, k[5] ?? 0.9]));
    const Y = track(home.y, keys.map((k) => [k[0], k[2], k[4] ?? 1, k[5] ?? 0.9]));
    const Z = track(Math.log(home.z), keys.map((k) => [k[0], Math.log(k[3]), k[4] ?? 1, k[5] ?? 0.9]));
    return (t) => ({ x: X(t), y: Y(t), z: Math.exp(Z(t)) });
  }

  // ---------------------------------------------------------------- transitions
  // Each draws the frame from the two scenes' canvases A (leaving) and B (arriving) at progress
  // p ∈ [0, 1], in device pixels, on a context whose transform is the plain pixel grid. They are
  // pure functions of p: anything that moves is a function of p, anything that stays is a param.
  // the buffers already carry the subframe's jitter: compositing them must not add it again
  const grid = (g) => (g.rawSetTransform ? g.rawSetTransform(1, 0, 0, 1, 0, 0) : g.setTransform(1, 0, 0, 1, 0, 0));
  function dirOf(from) { return { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[from] || [1, 0]; }
  // A default given in pixels is a 1080p pixel: a 2160p page gets twice as many, so a feather, a blur
  // or a shadow keeps its share of the frame (it used to halve). A value the film gives is taken as is.
  const unit = (o) => Math.min(o.W, o.H) / 1080;
  // `from` means a side for most kinds, a rectangle for window and a scale for zoom, and a scene's
  // transition inherits the film's default: a side reaching zoom made its scale NaN (B never
  // settled in), one reaching window drew no window at all. Each kind takes only its own type.
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const rgb01 = (c, d) => { const v = Array.isArray(c) ? c : d; return [v[0] / 255, v[1] / 255, v[2] / 255]; };
  const farthest = (W, H, x, y) => Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y));
  const TRANSITIONS = {
    fade: ['a crossfade', 'ease', (g, A, B, p, o, S) => {
      if (!S.sheer) { g.drawImage(A, 0, 0); g.globalAlpha = p; g.drawImage(B, 0, 0); g.globalAlpha = 1; return; }
      // a scene that draws no backdrop: B laid over A leaves all of A showing through it to the last
      // frame, where A goes at once (223 levels, measured). Each by its share, added in a buffer of
      // their own, is a crossfade whatever is opaque
      const m = S.scratch(); m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, o.W, o.H);
      m.globalCompositeOperation = 'lighter';
      m.globalAlpha = 1 - p; m.drawImage(A, 0, 0); m.globalAlpha = p; m.drawImage(B, 0, 0);
      m.globalAlpha = 1; m.globalCompositeOperation = 'source-over';
      g.drawImage(m.canvas, 0, 0);
    }],
    dip: ['through a colour: out, then in (o.color, default the page ink on black)', 'ease', (g, A, B, p, o) => {
      const c = o.color || [0, 0, 0], W = o.W, H = o.H;
      g.drawImage(p < 0.5 ? A : B, 0, 0);
      g.fillStyle = rgba(c, ease5(p < 0.5 ? p * 2 : (1 - p) * 2)); g.fillRect(-2, -2, W + 4, H + 4);
    }],
    push: ['B pushes A off (o.from: right, left, up, down; o.gap px; o.depth: a dip in scale mid-move)', 'spring', (g, A, B, p, o) => {
      const [dx, dy] = dirOf(o.from), W = o.W, H = o.H, gap = o.gap ?? 0;
      const s = 1 - (o.depth ?? 0) * Math.sin(Math.PI * p);
      const place = (img, ox, oy) => { g.save(); g.translate(W / 2 + ox, H / 2 + oy); g.scale(s, s); g.drawImage(img, -W / 2, -H / 2); g.restore(); };
      place(A, -dx * p * (W + gap) * s, -dy * p * (H + gap) * s);
      place(B, dx * (1 - p) * (W + gap) * s, dy * (1 - p) * (H + gap) * s);
    }],
    cover: ['B slides in over A, which sinks back and darkens (o.from)', 'spring', (g, A, B, p, o) => {
      const [dx, dy] = dirOf(o.from), W = o.W, H = o.H, s = 1 - 0.06 * p;
      g.save(); g.translate(W / 2, H / 2); g.scale(s, s); g.drawImage(A, -W / 2, -H / 2); g.restore();
      g.fillStyle = `rgba(0,0,0,${(0.35 * p).toFixed(4)})`; g.fillRect(-2, -2, W + 4, H + 4);
      // B waits just off the frame, but its shadow reaches in: it fades up with the move, or the first
      // frame of the cut darkens that edge at once (44 levels, measured)
      g.save(); if (o.shadow !== false) { g.shadowColor = `rgba(0,0,0,${(0.35 * clamp(p / 0.08)).toFixed(4)})`; g.shadowBlur = 60 * unit(o); }
      g.drawImage(B, dx * (1 - p) * W, dy * (1 - p) * H); g.restore();
    }],
    zoom: ['through a point: A grows past the camera and fades, B settles in from further back (o.at [x, y] px, o.to A\'s final scale, o.from B\'s first, a number)', 'spring', (g, A, B, p, o) => {
      const W = o.W, H = o.H, [cx, cy] = o.at || [W / 2, H / 2], to = o.to ?? 2.4;
      const sa = Math.exp(Math.log(to) * p), sb = Math.exp(Math.log(num(o.from, 0.82)) * (1 - p));
      const ab = clamp((p - 0.1) / 0.55);
      g.save(); g.translate(cx, cy); g.scale(sa, sa); g.translate(-cx, -cy); g.drawImage(A, 0, 0); g.restore();
      g.save(); g.globalAlpha = ease5(ab); g.translate(W / 2, H / 2); g.scale(sb, sb); g.translate(-W / 2, -H / 2); g.drawImage(B, 0, 0); g.restore();
    }],
    iris: ['B inside a circle growing from a point — where the cursor clicked, or a letter\'s counter (o.at [x, y] px, o.r0 its starting radius, o.zoom: A dives in, scaled up to this about the point)', 'spring', (g, A, B, p, o) => {
      const W = o.W, H = o.H, [cx, cy] = o.at || [W / 2, H / 2], r0 = o.r0 ?? 0;
      const R = farthest(W, H, cx, cy);
      const za = Math.exp(Math.log(o.zoom ?? 1) * p); // with a zoom, the hole grows because A comes at the camera
      g.save(); g.translate(cx, cy); g.scale(za, za); g.translate(-cx, -cy); g.drawImage(A, 0, 0); g.restore();
      const rad = Math.max(0.01, (r0 * za) + (R - r0 * za) * p ** 1.6);
      g.save(); g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.clip(); g.drawImage(B, 0, 0); g.restore();
    }],
    wipe: ['a straight edge sweeps B in (o.angle degrees, 0 = left to right; o.feather px)', 'spring', (g, A, B, p, o, S) => {
      const W = o.W, H = o.H, a = ((o.angle ?? 0) * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
      const half = Math.abs(dx) * W / 2 + Math.abs(dy) * H / 2, fe = o.feather ?? 80 * unit(o);
      const pos = -half - fe + p * (2 * half + 2 * fe); // the edge's distance from the centre along the sweep
      g.drawImage(A, 0, 0);
      const m = S.scratch(); m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, W, H);
      m.globalCompositeOperation = 'source-over'; m.drawImage(B, 0, 0);
      m.globalCompositeOperation = 'destination-in';
      const gr = m.createLinearGradient(W / 2 + dx * (pos - fe), H / 2 + dy * (pos - fe), W / 2 + dx * (pos + fe), H / 2 + dy * (pos + fe));
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = gr; m.fillRect(0, 0, W, H); m.globalCompositeOperation = 'source-over';
      g.drawImage(m.canvas, 0, 0);
    }],
    blur: ['a focus pull: A defocuses as B comes into focus (o.max px of blur)', 'ease', (g, A, B, p, o) => {
      const mx = o.max ?? 24 * unit(o);
      g.save(); g.filter = `blur(${(mx * ease5(Math.min(1, p * 1.6))).toFixed(2)}px)`; g.drawImage(A, 0, 0); g.restore();
      g.save(); g.globalAlpha = ease5(p); const b = mx * (1 - ease5(Math.max(0, p * 1.6 - 0.6)));
      if (b > 0.05) g.filter = `blur(${b.toFixed(2)}px)`; g.drawImage(B, 0, 0); g.restore();
    }],
    split: ['A opens like doors along the middle and B is behind (o.axis x or y)', 'spring', (g, A, B, p, o) => {
      const W = o.W, H = o.H, v = o.axis === 'y';
      g.drawImage(B, 0, 0);
      const d = p * (v ? H / 2 : W / 2) * 1.02;
      // each half is clipped where it now is, so it carries its own half of A and nothing else
      g.save(); g.beginPath(); v ? g.rect(0, -d, W, H / 2) : g.rect(-d, 0, W / 2, H); g.clip(); g.drawImage(A, v ? 0 : -d, v ? -d : 0); g.restore();
      g.save(); g.beginPath(); v ? g.rect(0, H / 2 + d, W, H / 2) : g.rect(W / 2 + d, 0, W / 2, H); g.clip(); g.drawImage(A, v ? 0 : d, v ? d : 0); g.restore();
    }],
    shape: ['B through a shape (o.path, a Path2D in a unit box centred on 0) growing from o.at until it covers the frame', 'spring', (g, A, B, p, o) => {
      const W = o.W, H = o.H, [cx, cy] = o.at || [W / 2, H / 2];
      // cubic from nothing: no pop at the start, a third of the frame at half way (a log ramp from a
      // point spends most of the transition as a speck), then it covers (o.cover x the long side)
      const s = Math.max(1e-3, (o.cover ?? 2.2) * Math.max(W, H) * p ** (o.grow ?? 3));
      g.drawImage(A, 0, 0);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.clip(o.path); grid(g); g.drawImage(B, 0, 0); g.restore();
    }],
    window: ['B opens out of a window in A to the whole frame, corners easing square, while A recedes and dims (o.from [x, y, w, h] px, o.r the window\'s corner radius)', 'spring', (g, A, B, p, o) => {
      const W = o.W, H = o.H, k = unit(o), f = Array.isArray(o.from) ? o.from : [W * 0.33, H * 0.3, W * 0.34, H * 0.4], r0 = o.r ?? 18 * k;
      const cx = f[0] + f[2] / 2, cy = f[1] + f[3] / 2, sa = 1 - 0.06 * p;
      g.save(); g.translate(cx, cy); g.scale(sa, sa); g.translate(-cx, -cy); g.drawImage(A, 0, 0); g.restore();
      g.fillStyle = `rgba(0,0,0,${(0.32 * p).toFixed(4)})`; g.fillRect(-2, -2, W + 4, H + 4);
      const x = lerp(f[0], 0, p), y = lerp(f[1], 0, p), w = lerp(f[2], W, p), h = lerp(f[3], H, p), rad = r0 * (1 - p);
      const s = Math.max(w / W, h / H); // B's whole frame, cover-fit into the window as it grows
      g.save(); g.globalAlpha = clamp(p / 0.1); // no pop on the first frame: the window fades up as it starts
      g.beginPath(); g.roundRect(x, y, w, h, rad);
      g.shadowColor = `rgba(0,0,0,${(0.4 * (1 - p)).toFixed(4)})`; g.shadowBlur = 60 * k * (1 - p); g.shadowOffsetY = 20 * k * (1 - p);
      g.fillStyle = '#000'; g.fill(); g.shadowColor = 'transparent';
      g.clip(); g.translate(x + w / 2, y + h / 2); g.scale(s, s); g.drawImage(B, -W / 2, -H / 2);
      g.restore();
    }],
    stripes: ['B arrives in bands, each sliding in a beat after the one above it, A\'s band pushed aside (o.n bands, o.axis y: horizontal bands, x: vertical; o.from)', 'ease', (g, A, B, p, o) => {
      const W = o.W, H = o.H, n = o.n ?? 6, v = o.axis === 'x', [dx, dy] = dirOf(o.from || (v ? 'down' : 'right'));
      const d = 0.07, span = 1 - (n - 1) * d;
      g.drawImage(A, 0, 0);
      for (let i = 0; i < n; i++) {
        const q = ease5(clamp((p - i * d) / span));
        if (q <= 0) continue;
        // bands on whole pixels, edge to edge: an overlap repaints the neighbour's B with this band's A
        // (a light seam on every boundary, measured), a gap shows what is underneath
        const a0 = Math.round(((v ? W : H) * i) / n), a1 = Math.round(((v ? W : H) * (i + 1)) / n);
        const bx = v ? a0 : 0, by = v ? 0 : a0, bw = v ? a1 - a0 : W, bh = v ? H : a1 - a0;
        g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
        g.drawImage(A, -dx * 0.25 * W * q, -dy * 0.25 * H * q);
        g.drawImage(B, dx * W * (1 - q), dy * H * (1 - q));
        g.restore();
      }
    }],
    frost: ['a pane of frosted glass slides across: A goes behind it, B comes out from behind it (o.from right or left; o.pane: its width, a share of the frame; o.blur px; o.tint)', 'ease', (g, A, B, p, o, S) => {
      const W = o.W, H = o.H, pw = (o.pane ?? 0.42) * W, ltr = o.from === 'left', b = o.blur ?? 26 * unit(o), tint = o.tint || [255, 255, 255];
      // the pane's left edge travels from beyond one side to beyond the other; under its middle A gives way
      // to B. Beyond by a pixel more than its width: the light on its edges is 2 px wide, and starting flush
      // with the frame left a column of it on the first frame and on the last (28 and 13 levels, measured)
      const xl = ltr ? -pw - 1 + p * (W + pw + 2) : W + 1 - p * (W + pw + 2), mid = xl + pw / 2;
      const half = (img, leftOf, filter) => {
        g.save(); g.beginPath(); leftOf ? g.rect(-2, -2, mid + 2, H + 4) : g.rect(mid, -2, W - mid + 2, H + 4); g.clip();
        if (filter) g.filter = filter; g.drawImage(img, 0, 0); g.restore();
      };
      half(ltr ? B : A, true); half(ltr ? A : B, false);
      g.save(); g.beginPath(); g.rect(xl, -2, pw, H + 4); g.clip();
      const f = `blur(${b}px) saturate(1.3) brightness(1.04)`;
      half(ltr ? B : A, true, f); half(ltr ? A : B, false, f);
      g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},0.16)`; g.fillRect(xl, -2, pw, H + 4);
      g.restore();
      // its two edges catch the light
      for (const [x, a] of [[xl, 0.55], [xl + pw, 0.3]]) {
        const gr = g.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, `rgba(255,255,255,${(a * 0.4).toFixed(3)})`); gr.addColorStop(1, `rgba(255,255,255,${a})`);
        g.fillStyle = gr; g.fillRect(x - 1, 0, 2, H);
      }
    }],
    sweep: ['a crisp line in the accent sweeps across and leaves B behind it (o.angle degrees, 0 = left to right; o.color; o.width px)', 'ease', (g, A, B, p, o) => {
      const W = o.W, H = o.H, a = ((o.angle ?? 0) * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), lw = o.width ?? 6 * unit(o);
      const half = Math.abs(dx) * W / 2 + Math.abs(dy) * H / 2 + lw, pos = -half + p * 2 * half;
      const px = W / 2 + dx * pos, py = H / 2 + dy * pos, ex = -dy, ey = dx, L = W + H; // a point on the edge, the edge's direction
      g.drawImage(A, 0, 0);
      g.save(); g.beginPath();
      g.moveTo(px + ex * L, py + ey * L); g.lineTo(px - ex * L, py - ey * L);
      g.lineTo(px - ex * L - dx * L, py - ey * L - dy * L); g.lineTo(px + ex * L - dx * L, py + ey * L - dy * L); g.closePath();
      g.clip(); g.drawImage(B, 0, 0); g.restore();
      if (p > 0 && p < 1) {
        g.save(); g.beginPath(); g.moveTo(px + ex * L, py + ey * L); g.lineTo(px - ex * L, py - ey * L);
        g.lineWidth = lw; g.strokeStyle = rgba(o.color || [91, 91, 247]); g.stroke(); g.restore();
      }
    }],
    snap: ['a cut on the move: A leaves accelerating and fades, B lands decelerating from the same side, their speeds matched where they meet (o.from; o.travel, a share of the frame, default 0.12)', 'linear', (g, A, B, p, o, S) => {
      const [dx, dy] = dirOf(o.from), W = o.W, H = o.H, T = (o.travel ?? 0.12) * (dx ? W : H);
      const a = clamp(p / 0.6), b = clamp((p - 0.4) / 0.6), ea = a ** 4, eb = 1 - (1 - b) ** 4; // both 4/0.6 a second where they cross
      const mix = ease5((p - 0.3) / 0.3); // how much of the frame is B: none until 0.3, all of it from 0.6
      // The two are added in a buffer of their own, each by its share, and the sum is laid on the frame.
      // Drawn one over the other they lean on the lower being opaque: B, waiting beneath, showed through
      // a scene that draws no backdrop (transparent: true, over the timeline's `under`) from the first frame.
      const m = S.scratch(); m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, W, H);
      m.globalCompositeOperation = 'lighter';
      // a scene moved off its place, and the strip it has left filled with its own edge, stretched (a
      // backdrop's edge is more backdrop); added, the two meet without a seam at any fraction of a pixel
      const place = (img, x, y) => {
        m.drawImage(img, x, y);
        if (x > 0) m.drawImage(img, 0, 0, 1, H, 0, 0, x, H); else if (x < 0) m.drawImage(img, W - 1, 0, 1, H, W + x, 0, -x, H);
        if (y > 0) m.drawImage(img, 0, 0, W, 1, 0, 0, W, y); else if (y < 0) m.drawImage(img, 0, H - 1, W, 1, 0, H + y, W, -y);
      };
      if (mix < 1) { m.globalAlpha = 1 - mix; place(A, -dx * T * ea, -dy * T * ea); }
      if (mix > 0) { m.globalAlpha = mix; place(B, dx * T * (1 - eb), dy * T * (1 - eb)); }
      m.globalAlpha = 1; m.globalCompositeOperation = 'source-over';
      g.drawImage(m.canvas, 0, 0);
    }],
    tiles: ['the frame as a wall of tiles, each turning over from A to B in a wave from a point — where the cursor clicked (o.at [x, y] px; o.cols tiles across, default 8)', 'linear', (g, A, B, p, o) => {
      const W = o.W, H = o.H, cols = o.cols ?? 8, rows = Math.max(1, Math.round(cols * H / W)), [ax, ay] = o.at || [W / 2, H / 2];
      const far = farthest(W, H, ax, ay), spread = 1.1;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        // tiles on whole pixels, edge to edge: at rest the wall is the scene, with no seam
        const x0 = Math.round((W * i) / cols), x1 = Math.round((W * (i + 1)) / cols), y0 = Math.round((H * j) / rows), y1 = Math.round((H * (j + 1)) / rows);
        const w = x1 - x0, h = y1 - y0, cx = x0 + w / 2;
        const q = ease5(clamp(p * (1 + spread) - (Math.hypot(cx - ax, y0 + h / 2 - ay) / far) * spread));
        const img = q < 0.5 ? A : B, k = Math.abs(Math.cos(Math.PI * q)); // edge-on at half way
        if (q <= 0 || q >= 1) { g.drawImage(img, x0, y0, w, h, x0, y0, w, h); continue; }
        if (k < 0.004) continue;
        g.drawImage(img, x0, y0, w, h, cx - (w * k) / 2, y0, w * k, h);
        g.fillStyle = `rgba(0,0,0,${(0.3 * (1 - k)).toFixed(4)})`; g.fillRect(cx - (w * k) / 2, y0, w * k, h); // turned from the light
      }
    }],
    // ---- the shader kinds: what a 2D canvas cannot draw. One WebGL2 context a page (below).
    whip: ['a whip pan: both scenes on one strip, thrown past the camera and smeared along the move (o.from; o.blur: the smear at its peak, a share of the frame, default 0.22)', 'ease', (g, A, B, p, o, S) => {
      g.drawImage(S.gl('whip', A, B, p, { Dir: dirOf(o.from), K: [o.blur ?? 0.22, 0, 0, 0] }), 0, 0);
    }],
    zoomblur: ['a dive through a point with the speed drawn in: A rushes at the camera in a radial smear, B lands out of one (o.at [x, y] px; o.to A\'s final scale, default 1.7; o.from B\'s first, a number, default 0.8; o.blur)', 'ease', (g, A, B, p, o, S) => {
      const [cx, cy] = o.at || [o.W / 2, o.H / 2];
      g.drawImage(S.gl('zoomblur', A, B, p, { At: [cx / o.W, cy / o.H], K: [o.to ?? 1.7, num(o.from, 0.8), o.blur ?? 0.35, 0] }), 0, 0);
    }],
    liquid: ['A melts into B: both drift along one flow while an uneven front crosses the frame, its edge lit in the accent (o.from: the side B arrives from, default left; o.color; o.amount of drift, default 0.1; o.edge 0-1; o.scale: features across the height)', 'ease', (g, A, B, p, o, S) => {
      const [dx, dy] = dirOf(o.from || 'left');
      g.drawImage(S.gl('liquid', A, B, p, { Dir: [-dx, -dy], Col: rgb01(o.color, [91, 91, 247]), K: [o.scale ?? 2.2, o.amount ?? 0.1, o.edge ?? 0.8, o.lean ?? 0.35] }), 0, 0);
    }],
    ripple: ['a ring of water spreads from a point — where the cursor clicked — and B is what it leaves behind (o.at [x, y] px; o.band: the ring\'s width in frame heights, default 0.16; o.amp: how far it bends the picture, default 0.028; o.shine 0-1)', 'ease', (g, A, B, p, o, S) => {
      const W = o.W, H = o.H, [cx, cy] = o.at || [W / 2, H / 2], band = o.band ?? 0.16;
      g.drawImage(S.gl('ripple', A, B, p, { At: [cx / W, cy / H], K: [farthest(W, H, cx, cy) / H, band, o.amp ?? 0.028, (2 * Math.PI) / (band * 0.5)], Col2: [o.shine ?? 0.6, 0, 0] }), 0, 0);
    }],
    halftone: ['B through a screen of dots that grow until they join, each led by a rim of ink in the accent (o.from: the side they start from, default left, or o.at [x, y] px: from a point; o.step px between dots; o.angle of the screen, default 25; o.color; o.ink 0-1)', 'linear', (g, A, B, p, o, S) => {
      const W = o.W, H = o.H, [dx, dy] = dirOf(o.from || 'left'), at = Array.isArray(o.at) ? o.at : null;
      g.drawImage(S.gl('halftone', A, B, p, {
        At: at ? [at[0] / W, at[1] / H] : [0.5, 0.5], Dir: [-dx, -dy], Col: rgb01(o.color, [91, 91, 247]), Col2: [o.ink ?? 0.85, 0, 0],
        K: [o.step ?? Math.min(W, H) / 26, ((o.angle ?? 25) * Math.PI) / 180, at ? farthest(W, H, at[0], at[1]) / H : 1, at ? 1 : 0],
      }), 0, 0);
    }],
    flip: ['the frame turns over like a card, in perspective: A on its face, B on its back (o.from: right or left, or o.axis x with up or down; o.persp: the camera\'s distance in frame heights, default 2.2; o.depth: how far it steps back mid-turn; o.shade 0-1)', 'ease', (g, A, B, p, o, S) => {
      const x = o.axis === 'x', back = x ? o.from === 'up' : o.from === 'left';
      g.drawImage(S.gl('flip', A, B, p, { K: [o.persp ?? 2.2, o.depth ?? 0.35, back ? -1 : 1, x ? 1 : 0], Col2: [o.shade ?? 0.35, 0, 0] }), 0, 0);
    }],
    cube: ['the frame is one face of a box that turns a quarter and brings B round on the next (o.from: right, left, up, down; o.persp, default 2.2; o.depth: how far the box steps back mid-turn, in half-faces, default 0.6; o.shade 0-1)', 'ease', (g, A, B, p, o, S) => {
      const [dx, dy] = dirOf(o.from);
      g.drawImage(S.gl('cube', A, B, p, { K: [o.persp ?? 2.2, o.depth ?? 0.6, dx + dy, dy ? 1 : 0], Col2: [o.shade ?? 0.45, 0, 0] }), 0, 0);
    }],
    page: ['A is a page that curls off from a corner, its back in paper white, and B is the page beneath (o.from: right or left; o.tilt: how diagonal the curl runs, default 0.42; o.radius of the roll in frame heights, default 0.14; o.back: the paper; o.shadow 0-1)', 'ease', (g, A, B, p, o, S) => {
      g.drawImage(S.gl('page', A, B, p, { Dir: [o.from === 'left' ? -1 : 1, o.tilt ?? 0.42], Col2: rgb01(o.back, [244, 244, 246]), K: [o.radius ?? 0.14, o.shadow ?? 0.4, 0.16, 0] }), 0, 0);
    }],
  };

  // ---------------------------------------------------------------- shader transitions
  // A displacement, a noise front, a surface in perspective: one fragment shader each, a pure
  // function of (uv, p) like the 2D kinds. They share ONE WebGL2 context per frame size, made at the
  // first frame that needs it, so a film without them pays nothing and one with them spends a single
  // context of Chrome's sixteen a page (render.mjs fails a capture past that). The two scenes go up as
  // premultiplied textures and the result comes back onto the frame with drawImage, on the pixel grid:
  // the scenes already carry the subframe's jitter. Every shader returns A exactly at p = 0 and B
  // exactly at p = 1 (a surface at rest samples texel centres), so nothing pops where it starts or
  // ends, and what a turning surface uncovers is transparent: the timeline's `under`, or its fill.
  const GLT_VERT = `#version 300 es
in vec2 aPos; out vec2 uv;
void main(){ uv = vec2(aPos.x*.5 + .5, .5 - aPos.y*.5); gl_Position = vec4(aPos, 0., 1.); }`;
  const GLT_HEAD = `#version 300 es
precision highp float;
in vec2 uv; out vec4 frag;
uniform sampler2D uA, uB;
uniform float uP; uniform vec2 uRes, uAt, uDir; uniform vec3 uCol, uCol2; uniform vec4 uK;
#define PI 3.14159265359
vec4 texA(vec2 p){ return texture(uA, p); }
vec4 texB(vec2 p){ return texture(uB, p); }
// 1 inside the frame, and for a pixel beyond its edge: a surface at rest covers every pixel in full
float inside(vec2 p){ vec2 a = 1./uRes, s = smoothstep(-a, vec2(0.), p)*smoothstep(-a, vec2(0.), 1. - p); return s.x*s.y; }
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*f*(f*(f*6. - 15.) + 10.);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 R = mat2(.8, .6, -.6, .8);
  for (int i = 0; i < 4; i++) { v += a*vnoise(p); p = R*p*2.02; a *= .5; } return v; }
// where along its step a pixel starts the taps of a smear (interleaved gradient noise): evenly spaced
// taps comb a thin line into copies of itself; offset per pixel they are a fine grain instead, which the
// subframes average away. It moves nothing at rest, where the taps coincide
float tapAt(){ return fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))); }
`;
  const GLT = {
    // 32 taps along the move, spread by a bell of p: nothing at either end, the whole smear half way
    whip: `void main(){
  vec2 ax = abs(uDir); float sg = uDir.x + uDir.y, spread = uK.x*sin(PI*uP), j = tapAt();
  vec4 acc = vec4(0.);
  for (int i = 0; i < 32; i++) {
    float k = dot(uv, ax) + sg*(uP + ((float(i) + j)/32. - .5)*spread);
    bool next = sg > 0. ? k >= 1. : k < 0.;
    vec2 q = uv*(1. - ax) + clamp(next ? k - sg : k, 0., 1.)*ax;
    acc += next ? texB(q) : texA(q);
  }
  frag = acc/32.;
}`,
    // K: A's final scale, B's first, the smear. Both about uAt, so the point dived into stays put
    zoomblur: `void main(){
  float sa = exp(log(uK.x)*uP), sb = exp(log(uK.y)*(1. - uP)), ba = uK.z*uP, bb = uK.z*(1. - uP);
  vec2 d = uv - uAt; vec4 a = vec4(0.), b = vec4(0.); float j = tapAt();
  for (int i = 0; i < 28; i++) {
    float s = (float(i) + j)/28.;
    a += texA(uAt + d/(sa*(1. + ba*s)));
    b += texB(uAt + d/(sb*(1. + bb*s)));
  }
  frag = mix(a, b, smoothstep(.3, .7, uP))/28.;
}`,
    // K: features across the height, the drift, the edge's light, how much the front leans on uDir. The
    // edge is a line a few pixels wide wherever the front is (its distance read off the field's own
    // slope): a band of fixed width in the field would be a hairline here and a pool of ink there
    liquid: `void main(){
  vec2 asp = vec2(uRes.x/uRes.y, 1.), q = uv*asp*uK.x;
  vec2 w = vec2(fbm(q), fbm(q + vec2(5.2, 1.3)));
  vec2 flow = vec2(fbm(q + 3.*w + vec2(1.7, 9.2)), fbm(q + 3.*w + vec2(8.3, 2.8))) - .47;
  float n = mix(smoothstep(.2, .74, fbm(q*1.3 + 2.*w + vec2(3.1, 1.7))), dot(uv - .5, uDir) + .5, uK.w);
  float th = mix(-.12, 1.12, uP);
  vec4 a = texA(uv + flow*uK.y*uP/asp), b = texB(uv - flow*uK.y*(1. - uP)/asp);
  vec4 c = mix(b, a, smoothstep(th - .1, th + .1, n));
  float dist = abs(n - th)/max(length(vec2(dFdx(n), dFdy(n))), 1e-5), lw = uRes.y/360.;
  float line = (1. - smoothstep(lw*.5, lw*1.5, dist)) + .22*(1. - smoothstep(0., lw*9., dist));
  frag = mix(c, vec4(uCol, 1.), min(line, 1.)*uK.z*sin(PI*uP));
}`,
    // K: the farthest corner, the ring's width (frame heights), the bend, its frequency. Col2.x: shine
    ripple: `void main(){
  vec2 asp = vec2(uRes.x/uRes.y, 1.), d = (uv - uAt)*asp; float r = length(d);
  float x = r - (uP*(uK.x + 3.*uK.y) - uK.y);
  float amp = uK.z*smoothstep(0., .08, uP)*(1. - uP);
  float wave = sin(x*uK.w)*exp(-x*x/(.5*uK.y*uK.y));
  vec2 q = uv + (d/max(r, 1e-4))*wave*amp/asp;
  vec4 c = mix(texB(q), texA(q), smoothstep(-.012, .012, x));
  c.rgb = min(c.rgb + max(wave, 0.)*amp*4.*uCol2.x, vec3(c.a));
  frag = c;
}`,
    // K: the pitch in px, the screen's angle, the farthest corner, 1 = from uAt (else along uDir)
    halftone: `void main(){
  float ca = cos(uK.y), sa = sin(uK.y); mat2 R = mat2(ca, sa, -sa, ca);
  vec2 c0 = uRes*.5, pr = R*(uv*uRes - c0)/uK.x, cell = floor(pr) + .5;
  vec2 cuv = (transpose(R)*(cell*uK.x) + c0)/uRes;
  float s = uK.w > .5 ? length((cuv - uAt)*vec2(uRes.x/uRes.y, 1.))/uK.z : dot(cuv - .5, uDir) + .5;
  float lp = clamp(uP*1.7 - clamp(s, 0., 1.)*.7, 0., 1.); lp = lp*lp*(3. - 2.*lp);
  // the last radius reaches a cell's corner (0.7072 from its centre) and the edge's softness beyond it:
  // at a fine pitch the softness is wide, and a radius fixed at 0.78 left the corners part A at the end
  float aa = min(1.2/uK.x, .3), rad = mix(-aa, .7072 + aa, lp), ring = .1*sin(PI*lp), dd = length(pr - cell);
  vec4 c = mix(texA(uv), vec4(uCol, 1.), (1. - smoothstep(rad + ring - aa, rad + ring + aa, dd))*uCol2.x);
  frag = mix(c, texB(uv), 1. - smoothstep(rad - aa, rad + aa, dd));
}`,
    // a plane through a point on the z axis, turned by PI*p about the vertical; each pixel's ray meets
    // it, and the meeting point is a texel. K: the camera's distance, the step back, the way, the axis
    flip: `void main(){
  bool vert = uK.w > .5;
  vec2 ext = vec2(uRes.x/uRes.y, 1.), xy = (uv - .5)*ext;
  if (vert) { xy = xy.yx; ext = ext.yx; }
  xy.x *= uK.z;
  float c = cos(PI*uP), s = sin(PI*uP), D = uK.x, z0 = uK.y*s;
  float den = D*c - xy.x*s, t = (z0 + D)*c/den;
  float u = t*xy.x*c + (t*D - D - z0)*s, v = t*xy.y;
  bool back = den < 0.;
  vec2 tex = vec2((back ? -u : u)*uK.z/ext.x + .5, v/ext.y + .5);
  if (vert) tex = tex.yx;
  vec4 col = (back ? texB(tex) : texA(tex))*inside(tex)*step(0., t);
  col.rgb *= 1. - uCol2.x*s;
  frag = col;
}`,
    // a box as deep as the frame is wide, turned a quarter about its own centre: A on the face that
    // leaves, B on the one that arrives. K: the camera's distance, the step back, the way, the axis
    cube: `void main(){
  bool vert = uK.w > .5;
  vec2 ext = vec2(uRes.x/uRes.y, 1.), xy = (uv - .5)*ext;
  if (vert) { xy = xy.yx; ext = ext.yx; }
  xy.x *= uK.z;
  float th = .5*PI*uP, c = cos(th), s = sin(th), D = uK.x, h = .5*ext.x;
  vec3 O = vec3(0., 0., -D), dir = vec3(xy, D), C = vec3(0., 0., h + uK.y*h*sin(PI*uP));
  vec4 col = vec4(0.);
  for (int k = 0; k < 2; k++) {
    vec3 n = k == 0 ? vec3(-s, 0., -c) : vec3(c, 0., -s), e = k == 0 ? vec3(c, 0., -s) : vec3(s, 0., c);
    float den = dot(dir, n);
    if (den < -1e-5) {
      vec3 Fc = C + n*h; float t = dot(Fc - O, n)/den; vec3 rel = O + t*dir - Fc;
      vec2 tex = vec2(dot(rel, e)*uK.z/ext.x + .5, rel.y/ext.y + .5);
      if (vert) tex = tex.yx;
      vec4 smp = (k == 0 ? texA(tex) : texB(tex))*inside(tex)*step(0., t);
      smp.rgb *= 1. - uCol2.x*(1. + n.z);
      col += smp*(1. - col.a);
    }
  }
  frag = col;
}`,
    // The curl is a cylinder of radius K.x lying on the page, its axis square to uDir and moving
    // against it. s is a pixel's distance past the axis: behind it the page lies flat, with the part
    // already turned lying on it face down; over the roll a pixel sees the page's face on the way up
    // and its back on the way over; beyond it, B. Col2: the paper. K: radius, shadow, its reach
    page: `vec4 paper(vec4 t){ return vec4(mix(t.rgb, uCol2*t.a, .86), t.a); }
void main(){
  float asp = uRes.x/uRes.y, r = uK.x;
  vec2 box = vec2(asp, 1.), q = uv*box, d = normalize(uDir);
  vec2 near = vec2(d.x > 0. ? asp : 0., d.y > 0. ? 1. : 0.);
  float s = dot(q, d) - mix(dot(near, d) + 1e-3, dot(box - near, d) - r, uP);
  vec4 col;
  if (s < 0.) {
    col = texA(uv);
    vec2 q3 = q + d*(PI*r - 2.*s);
    col = mix(col, paper(texA(q3/box)), inside(q3/box));
  } else {
    col = texB(uv);
    col.rgb *= 1. - uK.y*exp(-max(s - r, 0.)/uK.z)*(1. - smoothstep(.75, 1., uP));
    if (s < r) {
      float x = s/r, phi = asin(x), edge = 1. - smoothstep(1. - 3./(r*uRes.y), 1., x);
      vec2 q1 = q + d*(r*phi - s), q2 = q + d*(r*(PI - phi) - s);
      vec4 f = texA(q1/box); f.rgb *= 1. - .35*x*x;
      col = mix(col, f, inside(q1/box)*edge);
      vec4 b = paper(texA(q2/box)); b.rgb *= .58 + .42*sqrt(1. - x*x);
      col = mix(col, b, inside(q2/box)*edge);
    }
  }
  frag = col;
}`,
  };
  const GLT_STAGES = new Map();
  function gltStage(W, H) {
    const key = `${W}x${H}`;
    let S = GLT_STAGES.get(key);
    if (S) return S;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error(`film: the shader transitions (${Object.keys(GLT).join(', ')}) draw with WebGL2, which this browser does not offer — pick one of the others`);
    const sh = (type, src, kind) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`film: ${kind} shader: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, GLT_VERT, 'transition');
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one triangle over the frame
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); // as the 2D canvas holds them: no round trip through straight alpha
    const tex = [0, 1].map((i) => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      return t;
    });
    const progs = new Map();
    const program = (kind) => {
      let P = progs.get(kind);
      if (P) return P;
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, GLT_HEAD + GLT[kind], kind));
      gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`film: ${kind} program: ${gl.getProgramInfoLog(p)}`);
      const locs = {};
      P = { p, U: (n) => (n in locs ? locs[n] : (locs[n] = gl.getUniformLocation(p, n))) };
      progs.set(kind, P);
      return P;
    };
    S = {
      cv,
      /** The frame of `kind` at p from the two scenes' canvases; u: At, Dir (vec2), Col, Col2 (vec3), K (vec4). */
      run(kind, A, B, p, u = {}) {
        const P = program(kind);
        gl.useProgram(P.p);
        [A, B].forEach((img, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[i]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); });
        gl.uniform1i(P.U('uA'), 0); gl.uniform1i(P.U('uB'), 1);
        gl.uniform1f(P.U('uP'), p); gl.uniform2f(P.U('uRes'), W, H);
        gl.uniform2fv(P.U('uAt'), u.At || [0.5, 0.5]); gl.uniform2fv(P.U('uDir'), u.Dir || [1, 0]);
        gl.uniform3fv(P.U('uCol'), u.Col || [0, 0, 0]); gl.uniform3fv(P.U('uCol2'), u.Col2 || [0, 0, 0]);
        gl.uniform4fv(P.U('uK'), u.K || [0, 0, 0, 0]);
        gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
        return cv;
      },
    };
    GLT_STAGES.set(key, S);
    return S;
  }


  // ---------------------------------------------------------------- effects
  // One frame-sized buffer per target size, made once and staged, so it takes the frame's jitter.
  const FXBUF = new Map();
  function fxbuf(g, slot) {
    const W = g.canvas.width, H = g.canvas.height, k = `${W}x${H}:${slot}`;
    let b = FXBUF.get(k);
    if (!b) { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); b = { c, g: x, st: stage(x) }; FXBUF.set(k, b); }
    b.g.rawSetTransform(1, 0, 0, 1, 0, 0); b.g.clearRect(0, 0, W, H);
    b.st.begin({ jitter: g.jitter || [0, 0] });
    b.g.setTransform(g.getTransform()); // the caller's camera, so draw(g) works unchanged
    return b;
  }
  /** Depth of field: draw(ctx) once into a buffer, lay it down blurred by `blur` device pixels, then
   *  sharp inside clip(ctx) (a path in the caller's coordinates: the tile, the window in focus). A
   *  spring on `blur` is a rack focus. Blur quantizes in 2 px steps without the jitter (measured). */
  function selective(g, { blur = 8, clip, draw: paint }) {
    const b = fxbuf(g, 'sel');
    paint(b.g);
    g.save(); grid(g);
    if (blur > 0.05) g.filter = `blur(${blur.toFixed(2)}px)`;
    g.drawImage(b.c, 0, 0); g.filter = 'none';
    g.restore();
    if (clip) { g.save(); clip(g); g.clip(); grid(g); g.drawImage(b.c, 0, 0); g.restore(); }
  }
  /** fill(ctx) seen only through mask(ctx): letters as windows onto a picture or the product's UI.
   *  Both draw in the caller's coordinates. The mask's alpha is what shows the fill. */
  function knockout(g, { mask, fill }) {
    const b = fxbuf(g, 'ko');
    fill(b.g);
    b.g.save(); b.g.globalCompositeOperation = 'destination-in'; mask(b.g); b.g.restore();
    g.save(); grid(g); g.drawImage(b.c, 0, 0); g.restore();
  }
  const hash01 = (n) => { let h = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  /** How much of `text` a person has typed t - t0 seconds in: { shown, n, done, caret } where caret
   *  blinks at 1 Hz once done and stays solid while typing. cps is the average pace; a word's first
   *  letter and anything after punctuation wait longer, so it reads as typed, not printed.
   *  Deterministic (a hash, not Math.random): every worker and every re-render agree. */
  function typed(text, t, t0, { cps = 14, seed = 1 } = {}) {
    let at = t0, n = 0;
    for (; n < text.length; n++) {
      const ch = text[n], prev = text[n - 1] || '';
      let d = (1 / cps) * (0.55 + 0.9 * hash01(seed * 7919 + n));
      if (prev === ' ') d *= 1.6;
      if (/[.,;:!?]/.test(prev)) d += 0.18;
      if (at + d > t) break;
      at += d;
    }
    const done = n >= text.length;
    return { shown: text.slice(0, n), n, done, caret: !done || Math.floor((t - at) * 2) % 2 === 0, doneAt: done ? at : null };
  }

  /** The subtitle of the moment, drawn on the frame's own pixels (not in the camera's world), low and
   *  centred: on a plate, or outlined when plate is false. cues are [{ t0, t1, lines: ['…', '…'] }] in
   *  film seconds, in order, as narrate.mjs writes them. It fades in and out over `fade` seconds, but
   *  not between two cues that follow each other without a gap: one sentence, shown in two parts, does
   *  not blink. Call it last, in the timeline's `over`, so no cut moves it. Returns the cue, or null.
   *  o: size (px; 4.2 % of the frame's short side), family, weight (600), color, plate ([r, g, b] or
   *  false), alpha (0.72), bottom (the gap under it, a share of the height: 0.075), width (the widest
   *  it may be, a share of the frame's: 0.86), fade (0.12). */
  function captions(g, t, cues, o = {}) {
    let lo = 0, hi = cues.length - 1, i = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (t < cues[m].t0) hi = m - 1; else if (t >= cues[m].t1) lo = m + 1; else { i = m; break; } }
    if (i < 0) return null;
    const c = cues[i], W = g.canvas.width, H = g.canvas.height, fade = o.fade ?? 0.12;
    const joined = (a, b) => a && b && Math.abs(a.t1 - b.t0) < 0.02;
    const a = Math.min(joined(cues[i - 1], c) ? 1 : clamp((t - c.t0) / fade), joined(c, cues[i + 1]) ? 1 : clamp((c.t1 - t) / fade));
    if (a <= 0.002) return c;
    const family = o.family && o.family !== 'system-ui' ? `"${o.family}", system-ui` : 'system-ui';
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    let size = o.size ?? Math.round(Math.min(W, H) * 0.042);
    const widest = () => { g.font = `${o.weight ?? 600} ${size}px ${family}`; return Math.max(...c.lines.map((l) => g.measureText(l).width)); };
    let w = widest();
    const room = W * (o.width ?? 0.86) - size * 1.1;
    if (w > room) { size *= room / w; w = widest(); } // a line too long for the frame is set smaller, never cut
    const lh = size * 1.3, px = size * 0.55, py = size * 0.34, bh = (c.lines.length - 1) * lh + size + 2 * py, by = H * (1 - (o.bottom ?? 0.075)) - bh;
    g.globalAlpha *= a; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    if (o.plate !== false) { g.fillStyle = rgba(o.plate || [14, 14, 18], o.alpha ?? 0.72); g.beginPath(); g.roundRect(W / 2 - w / 2 - px, by, w + 2 * px, bh, size * 0.32); g.fill(); }
    else { g.lineJoin = 'round'; g.lineWidth = size * 0.18; g.strokeStyle = rgba(o.stroke || [0, 0, 0], 0.8); c.lines.forEach((l, k) => g.strokeText(l, W / 2, by + py + size * 0.8 + k * lh)); }
    g.fillStyle = rgba(o.color || [255, 255, 255]);
    c.lines.forEach((l, k) => g.fillText(l, W / 2, by + py + size * 0.8 + k * lh));
    g.restore();
    return c;
  }

  /** A told film's scenes, for FILM.timeline: one for each step of a narration (narrate.mjs's
   *  NARRATION), on its clock. make(step, i) returns the scene — { draw(g, lt, info), in?, … } — and
   *  this gives it its id, its chapter and its length: scene i begins `ahead` seconds before step i is
   *  said (the picture changes, then the voice speaks) and lasts until the next begins, the transition
   *  into the next counted in, so the timeline's overlaps never move a scene off its sentence. The
   *  voice starts at lt = step.t - scene start: FILM.narrated passes it as step.at.
   *  opts: ahead (0.3), kind and dur of the transition a scene does not name (fade, 0.5). */
  function narrated(N, make, { ahead = 0.3, kind = 'fade', dur = 0.5 } = {}) {
    // a scene never begins more than half of the step before it ahead of its sentence: a 0.2 s silent step with
    // lead 0 and gap 0 would otherwise start both scenes at 0 and the first would last nothing
    const start = N.steps.map((s, i) => (i ? Math.max(0, s.t - ahead, N.steps[i - 1].t + 0.5 * (s.t - N.steps[i - 1].t)) : 0));
    const scenes = N.steps.map((s, i) => {
      const sc = make({ ...s, at: s.t - start[i] }, i) || {}, tr = i ? { kind, dur, ...(sc.in || {}) } : null;
      // a transition never longer than the steps it joins leave room for: a step of half a second is still a scene
      if (tr) tr.dur = Math.min(tr.dur, 0.45 * Math.min(start[i] - start[i - 1], (i + 1 < N.steps.length ? start[i + 1] : N.duration) - start[i]));
      return { id: s.id, ...(s.chapter ? { chapter: s.chapter } : {}), ...sc, ...(tr ? { in: tr } : {}) };
    });
    scenes.forEach((sc, i) => {
      const next = scenes[i + 1], ov = next ? (next.in.kind === 'cut' ? 0 : next.in.dur) : 0;
      sc.dur = (next ? start[i + 1] + ov : N.duration) - start[i];
    });
    return scenes;
  }

  // ---------------------------------------------------------------- the timeline
  /**
   * A long film as scenes. Each scene draws the WHOLE frame (backdrop included) at its own local
   * time, with its own camera, on the context it is given — the page's helpers that draw on a
   * global `ctx` get it through `use(g)`. Consecutive scenes overlap by their transition's length;
   * outside a transition the scene draws straight onto the frame, so a long hold costs what a
   * short film costs. During one, both scenes draw into two frame-sized canvases (made once, each
   * with its own stage, so they take the same jitter) and the transition composites them.
   *
   *   FILM.timeline({
   *     W, H,
   *     scenes: [{ id, dur, draw(g, lt, info), chapter?: 'Title', in?: { kind, dur, ease, …params } }, …],
   *     trans: { kind: 'fade', dur: 0.8 },   // the default transition into each scene after the first
   *     use: (g) => { ctx = g; },            // point the page's helpers at the context being drawn
   *     under: (g, t) => …,                   // optional: beneath every scene (a continuous backdrop,
   *                                          //   for scenes marked transparent: true)
   *     over: (g, t) => …,                    // optional: above every scene (the cursor, captions)
   *   })
   *
   * info = { t (global), lt, scene, role: 'solo' | 'out' | 'in', p (transition progress) }.
   * A scene with transparent: true draws no backdrop and lets `under` show through, which keeps the
   * backdrop continuous across the cut. Join such scenes with fade, dip, push, frost, snap, tiles or a
   * shader kind: the other kinds (cover, zoom, iris, wipe, blur, split, shape, window, stripes, sweep)
   * lay one scene over the other and take the upper for opaque, so what the lower still shows through
   * it goes at once on the cut's last frame (transcheck.mjs --sheer measures each). The transition's `ease` is 'ease' (symmetric, ease5) or
   * 'spring' (critically damped, settled exactly at the end); each kind has its own default.
   * TL.chapters → [{ t, title }] for the mp4's chapter marks and a YouTube description;
   * TL.checkpoints → times worth a still (each scene settled, each transition half way).
   */
  function timeline(cfg) {
    const { W, H, use = () => {}, under = null, over = null } = cfg;
    const scenes = [];
    let end = 0;
    cfg.scenes.forEach((s, i) => {
      if (!(s.dur > 0)) throw new Error(`timeline: scene ${s.id || i} needs a positive dur`);
      let tr = null, ov = 0;
      if (i) {
        tr = { ...(cfg.trans || { kind: 'cut' }), ...(s.in || {}) };
        if (tr.kind !== 'cut' && !TRANSITIONS[tr.kind]) throw new Error(`timeline: no transition '${tr.kind}' (${Object.keys(TRANSITIONS).join(', ')}, cut)`);
        ov = tr.kind === 'cut' ? 0 : tr.dur ?? 0.8;
        const prev = scenes[i - 1];
        if (ov > prev.dur - (prev.tr ? prev.tr.dur : 0) || ov > s.dur) {
          throw new Error(`timeline: the ${tr.kind} into ${s.id || i} (${ov}s) is longer than a scene it joins`);
        }
      }
      const start = i ? end - ov : 0;
      scenes.push({ ...s, i, start, end: start + s.dur, tr: tr && { ...tr, dur: ov } });
      end = start + s.dur;
    });
    const duration = end;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); return { c, g, st: stage(g) }; };
    let bufs = null, scr = null;
    const buffers = () => (bufs ||= [mk(), mk()]);
    const scratch = () => { if (!scr) { const c = document.createElement('canvas'); c.width = W; c.height = H; scr = c.getContext('2d'); } return scr; };
    const gl = (kind, A, B, p, u) => gltStage(W, H).run(kind, A, B, p, u); // the shader kinds' frame, as a canvas
    const at = (t) => {
      let i = scenes.length - 1;
      while (i > 0 && t < scenes[i].start) i--;
      return { i, scene: scenes[i], lt: t - scenes[i].start };
    };
    function progress(tr, lt) {
      const e = tr.ease || TRANSITIONS[tr.kind][1];
      if (typeof e === 'function') return clamp(e(clamp(lt / tr.dur)));
      if (e === 'linear') return clamp(lt / tr.dur); // a kind that eases its own parts (snap, tiles, halftone)
      if (e === 'spring') return spr(lt, 0, (tr.f ?? 13.5 / (2 * Math.PI * tr.dur)), 1); // exactly 1 at dur
      // clamped: a hair before its end ease5 answers 1.0000000000000002, and a canvas ignores an alpha
      // set to 1 - p when that is negative: the scene meant to be gone was drawn in full
      return clamp(ease5(lt / tr.dur));
    }
    function paint(g, s, t, role, p) {
      use(g);
      g.save();
      s.draw(g, t - s.start, { t, lt: t - s.start, scene: s, role, p });
      g.restore();
    }
    function draw(ctx, t, opts = {}) {
      const { i, scene: B } = at(t);
      const A = i ? scenes[i - 1] : null;
      const inTrans = A && B.tr && B.tr.kind !== 'cut' && t < A.end;
      if (under) { use(ctx); ctx.save(); under(ctx, t); ctx.restore(); }
      if (!inTrans) paint(ctx, B, t, 'solo', 1);
      else {
        const p = progress(B.tr, t - B.start);
        const [a, b] = buffers();
        for (const [buf, s, role] of [[a, A, 'out'], [b, B, 'in']]) {
          buf.g.rawSetTransform(1, 0, 0, 1, 0, 0); buf.g.clearRect(0, 0, W, H);
          buf.st.begin(opts); // the same subframe jitter as the frame
          paint(buf.g, s, t, role, p);
        }
        ctx.save(); grid(ctx);
        // what a scene scaled below the frame uncovers: `under`, or a fill, never the previous subframe
        if (!under) { ctx.fillStyle = rgba(B.tr.bg || [0, 0, 0]); ctx.fillRect(-2, -2, W + 4, H + 4); }
        TRANSITIONS[B.tr.kind][2](ctx, a.c, b.c, p, { W, H, ...B.tr }, { scratch, gl, sheer: !!(A.transparent || B.transparent) });
        ctx.restore();
      }
      if (over) { use(ctx); ctx.save(); over(ctx, t); ctx.restore(); }
      use(ctx);
    }
    const chapters = scenes.filter((s) => s.chapter).map((s) => ({ t: s.start, title: s.chapter }));
    const checkpoints = [];
    scenes.forEach((s, i) => {
      const next = scenes[i + 1];
      const free0 = s.start + (s.tr ? s.tr.dur : 0), free1 = next ? next.start : s.end;
      checkpoints.push({ t: +(free0 + (free1 - free0) * 0.6).toFixed(3), label: `${s.id || i} settled` });
      if (next && next.tr && next.tr.dur > 0) { // where it is half done: a spring is, well before half its time
        let lo = 0, hi = next.tr.dur;
        for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (progress(next.tr, m) < 0.5) lo = m; else hi = m; }
        checkpoints.push({ t: +(next.start + hi).toFixed(3), label: `${s.id || i} → ${next.id || i + 1} (${next.tr.kind})` });
      }
    });
    return { draw, duration, scenes, chapters, checkpoints, at };
  }

  const exported = { stage, draw, load, tint, pyramid, trilinear, spr, track, settle, camera, ease5, beats, timeline, selective, knockout, typed, captions, narrated };
  exported.TRANSITIONS = Object.fromEntries(Object.entries(TRANSITIONS).map(([k, v]) => [k, v[0]]));
  exported.GL_TRANSITIONS = Object.keys(GLT); // the kinds drawn by a shader: one WebGL2 context a page between them
  window.FILM = Object.assign(window.FILM || {}, exported);
})();
