// The beat of a soundtrack, from its samples alone (ffmpeg decodes; no model, no network, no Chrome):
// its tempo, every beat, the bars' first beats and where the sections change.
//
//   node beats.mjs <track> [--from s] [--len s] [--out beats.js|beats.json]
//   node beats.mjs --selftest
//
// It prints the tempo and whether it holds, the first bars, the section starts, and what the page
// needs: PROMO_META.bpm, and an AUDIO_AT on a bar's first beat (render.mjs starts the track there,
// so the page's beat 0 is that downbeat). A track that drifts — a live band, a rubato — fits no
// fixed grid: --out beats.js writes `window.BEATS = { beats, downbeats, … }` (seconds into the
// track) for a page that follows the track's own beats, `const B = FILM.beats(BEATS.beats, AUDIO_AT)`.
// A .json --out is the same data for a tool. render.mjs imports analyze() and check() from here:
// with AUDIO=<track> it measures the page's beats against the track's before it renders, and
// `render.mjs beats` does only that.
//
// The method, from the papers rather than from anyone's code. The onset envelope is a log-compressed
// spectral flux over 48 log-spaced bands. The tempo is its autocorrelation peak under a log-normal
// prior at 120 BPM, half the correlation at twice the lag added (Ellis's duple tempo strength). The
// beats are Ellis's dynamic programme (2007): the path over the strongest onsets that keeps the
// period. Then the grid: the period and phase that collect the most onset strength over the whole
// track, the kick (under 90 Hz) deciding between the beat and the offbeat, refined to a fraction of
// a frame on the onsets themselves. The track is steady when, in every sixteen beats the programme
// followed, the grid finds onsets as strong and the programme's beats sit within 25 ms of it: then
// the grid is its beats. Otherwise (an edit, a band speeding up) the programme's beats are kept,
// since they follow it. Downbeats: of a 4/4 bar's four phases, the one where the bass hits and the
// harmony changes. Sections: Foote's novelty (2000), a checkerboard kernel four bars a side along
// the beats' self-similarity (timbre and harmony), its peaks moved to the nearest downbeat. A pulse
// weaker than FLOOR reports no beat, rather than a grid made up.
//
// Measured on songs built sample-exact from Apple Loops, whose beats are therefore known (4/4, 70 to
// 128 BPM: kits, drum machines, a drummer, a house track with its bass on the offbeat, a pad, five
// minutes of one groove), and on synthetic grooves: every steady one's tempo within 0.05 BPM, beats
// F-measure 0.98 to 1.00 and within 12 ms of the truth (median 2 ms early); the five minutes came out
// at exactly 120, no beat more than 2 ms off. A song with an edit (a bar 0.14 s short), one speeding
// from 120 to 131 BPM and a synthetic ramp were all called not steady, their beats still F 0.96 to
// 1.00. Downbeats were right on eight grooves of nine, wrong on a funk groove whose bass leans on
// beat two and on a pad with no drums: a guess, to listen to. Sections: seven real changes of eight
// found (a piano entering quietly was not), none invented. No pulse in pink noise, nor in a drumless
// blues (bass and guitar). 0.1 to 0.2 s for 45 s of audio, 1 s for five minutes. A song built with
// ffmpeg's -stream_loop on the loops' AAC came out with sections 0.14 s short: build test material
// from decoded PCM.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

const SR = 22050, WIN = 1024, HOP = 256, FPS = SR / HOP; // 11.6 ms per frame
export const FLOOR = 0.12; // pulse clarity below which there is no beat to follow: pink noise 0.04 over 30 s but 0.097 over 9 s, a drumless blues 0.03, the weakest groove 0.17
const LAG = 0.006; // the flux peaks this much before the beat is heard: the median over ten tracks

function decode(file, from = 0, len = 0) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(from), ...(len ? ['-t', String(len)] : []), '-i', file,
    '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const err = String(r.stderr);
  if (r.status !== 0) throw new Error(/does not contain any stream/.test(err) ? `${file} has no audio in it` : /No such file/.test(err) ? `${file}: no such file` : `ffmpeg could not read ${file}: ${err.trim().split('\n').pop()}`);
  const b = r.stdout; // copied: a Buffer's offset need not be a multiple of 4
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

// a radix-2 FFT, in place
const REV = new Uint16Array(WIN), COS = new Float64Array(WIN / 2), SIN = new Float64Array(WIN / 2);
for (let i = 0, bits = Math.log2(WIN); i < WIN; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); REV[i] = r; }
for (let i = 0; i < WIN / 2; i++) { COS[i] = Math.cos(-2 * Math.PI * i / WIN); SIN[i] = Math.sin(-2 * Math.PI * i / WIN); }
function fft(re, im) {
  for (let i = 0; i < WIN; i++) { const j = REV[i]; if (j > i) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let size = 2; size <= WIN; size *= 2) {
    const half = size / 2, step = WIN / size;
    for (let s = 0; s < WIN; s += size) for (let k = 0; k < half; k++) {
      const c = COS[k * step], d = SIN[k * step], a = s + k, b = a + half;
      const tr = re[b] * c - im[b] * d, ti = re[b] * d + im[b] * c;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}

// bands: 48 log-spaced from 30 Hz to 10 kHz, merged where the low ones would share a bin
const EDGES = [...new Set(Array.from({ length: 49 }, (_, i) => Math.round(30 * Math.pow(10000 / 30, i / 48) / (SR / WIN))))];
const LOW = EDGES.findIndex((e) => e * SR / WIN > 150) - 1; // the bands under 150 Hz: kick and bass
const KICK = EDGES.findIndex((e) => e * SR / WIN > 90) - 1; // under 90 Hz: the kick drum, mostly
const PC = Array.from({ length: WIN / 2 }, (_, k) => { const f = k * SR / WIN; return f < 100 || f > 4000 ? -1 : ((Math.round(12 * Math.log2(f / 440)) % 12) + 12) % 12; });

/** Onset strength (all bands, the low ones, the kick's), log band energies and chroma, per frame.
 *  A track read from its start rises from silence, so a beat on its first sample is an onset too:
 *  without that, a groove starting on its downbeat lost its beat at 0 (the first frame had no frame
 *  before it to rise from). */
function features(pcm, fromSilence) {
  let rms = 0; for (const v of pcm) rms += v * v; rms = Math.sqrt(rms / Math.max(1, pcm.length));
  const gain = rms > 1e-5 ? 0.1 / rms : 0, n = Math.max(0, Math.floor((pcm.length - WIN) / HOP) + 1);
  const hann = Float64Array.from({ length: WIN }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / WIN));
  const re = new Float64Array(WIN), im = new Float64Array(WIN), nb = EDGES.length - 1;
  const flux = new Float64Array(n), low = new Float64Array(n), kick = new Float64Array(n), bands = [], chroma = [];
  let prev = fromSilence ? new Float32Array(nb) : null;
  for (let t = 0; t < n; t++) {
    for (let i = 0; i < WIN; i++) { re[i] = pcm[t * HOP + i] * gain * hann[i]; im[i] = 0; }
    fft(re, im);
    const mag = new Float64Array(WIN / 2), L = new Float32Array(nb), C = new Float32Array(12);
    for (let k = 0; k < WIN / 2; k++) { mag[k] = Math.hypot(re[k], im[k]); if (PC[k] >= 0) C[PC[k]] += mag[k]; }
    for (let b = 0; b < nb; b++) {
      let s = 0; const lo = EDGES[b], hi = Math.max(lo + 1, EDGES[b + 1]);
      for (let k = lo; k < hi; k++) s += mag[k];
      L[b] = Math.log1p(100 * s / (hi - lo));
    }
    if (prev) for (let b = 0; b < nb; b++) { const d = L[b] - prev[b]; if (d > 0) { flux[t] += d; if (b < LOW) low[t] += d; if (b < KICK) kick[t] += d; } }
    bands.push(L); chroma.push(C); prev = L;
  }
  return { flux, low, kick, bands, chroma, silent: gain === 0 };
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const zscore = (a) => { const m = mean(a), d = std(a) || 1; return a.map((v) => (v - m) / d); };
const cosine = (a, b) => { let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? s / Math.sqrt(x * y) : 0; };
const frameTime = (f) => (f * HOP + WIN / 2) / SR + LAG; // a frame's centre, where its beat is heard
const peak = (o, f) => { const i = Math.round(f); return Math.max(o[i - 1] ?? 0, o[i] ?? 0, o[i + 1] ?? 0); };

/** The onset strength with its slow swell taken off, in units of its own deviation. */
function envelope(flux) {
  const n = flux.length, w = Math.round(FPS / 2), out = new Float64Array(n), c = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) c[i + 1] = c[i] + flux[i];
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - w), b = Math.min(n, i + w + 1); out[i] = Math.max(0, flux[i] - (c[b] - c[a]) / (b - a)); }
  const d = std(out) || 1; for (let i = 0; i < n; i++) out[i] /= d;
  return out;
}

/** Tempo: the autocorrelation's peak between 50 and 220 BPM under a log-normal prior at 120, half
 *  the correlation at twice the lag added: without it a drum break, whose bars repeat, came out at
 *  55 for 110. Clarity: the correlation at that lag, 0 to 1. */
function tempo(o) {
  const m = mean(o), x = Array.from(o, (v) => v - m), n = x.length;
  const ac = (lag) => { let s = 0; for (let i = lag; i < n; i++) s += x[i] * x[i - lag]; return s; };
  const r0 = ac(0) || 1, lo = Math.floor(FPS * 60 / 220), hi = Math.ceil(FPS * 60 / 50);
  const r = new Float64Array(2 * hi + 4); for (let l = lo - 1; l <= 2 * hi + 2; l++) r[l] = ac(l) / r0;
  let best = -1, bestScore = -Infinity;
  for (let l = lo; l <= hi; l++) {
    if (!(r[l] >= r[l - 1] && r[l] >= r[l + 1])) continue;
    const score = (r[l] + 0.5 * r[2 * l]) * Math.exp(-0.5 * (Math.log2(FPS * 60 / l / 120) / 0.9) ** 2);
    if (score > bestScore) { bestScore = score; best = l; }
  }
  if (best < 0) return { period: FPS / 2, clarity: 0 };
  const a = r[best - 1], b = r[best], c = r[best + 1], d = a - 2 * b + c; // the parabola through the peak
  return { period: best + (d ? 0.5 * (a - c) / d : 0), clarity: Math.max(0, b) };
}

/** Ellis's dynamic programme: beat frames on strong onsets, one period apart (fractions of a frame). */
function track(o, P, tightness = 100) {
  const n = o.length, Pr = Math.round(P);
  const g = Array.from({ length: 2 * Pr + 1 }, (_, i) => Math.exp(-0.5 * ((i - Pr) * 32 / P) ** 2));
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < g.length; k++) { const j = i + k - Pr; if (j >= 0 && j < n) s += g[k] * o[j]; } local[i] = s; }
  const cum = new Float64Array(n), back = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = -Infinity, arg = -1;
    for (let j = Math.max(0, i - Math.round(2 * P)); j <= i - Math.round(P / 2); j++) {
      const v = cum[j] - tightness * Math.log((i - j) / P) ** 2;
      if (v > best) { best = v; arg = j; }
    }
    cum[i] = local[i] + (arg >= 0 && best > 0 ? best : 0); back[i] = arg >= 0 && best > 0 ? arg : -1;
  }
  // the last beat: the last peak of the cumulative score holding half the median peak
  const peaks = []; for (let i = 1; i < n - 1; i++) if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1]) peaks.push(i);
  if (!peaks.length) return [];
  const med = peaks.map((i) => cum[i]).sort((a, b) => a - b)[peaks.length >> 1];
  let i = peaks.filter((p) => cum[p] >= 0.5 * med).pop();
  const beats = []; while (i >= 0) { beats.push(i); i = back[i]; }
  beats.reverse();
  // the ends: beats in silence or a fade carry no onset
  const sm = beats.map((b, k) => mean(beats.slice(Math.max(0, k - 2), k + 3).map((x) => local[x])));
  const th = 0.5 * Math.sqrt(mean(sm.map((v) => v * v)));
  let a = 0, z = beats.length; while (a < z && sm[a] < th) a++; while (z > a && sm[z - 1] < th) z--;
  return beats.slice(a, z).map((b) => { // to a fraction of a frame: the parabola through the onset's peak
    let p = b; for (let k = -2; k <= 2; k++) if (o[b + k] > o[p]) p = b + k;
    const y0 = o[p - 1] ?? 0, y1 = o[p], y2 = o[p + 1] ?? 0, d = y0 - 2 * y1 + y2;
    return p + (d < 0 ? 0.5 * (y0 - y2) / d : 0);
  });
}

/** The fixed grid: the period near P0 (±2 %, steps of 0.02 %) and the phase (half-frame steps) whose
 *  beats collect the most onset strength between frames a and z, then the kick picks the beat or the
 *  offbeat. Fitting the whole track at once keeps the phase where the programme lost it for a section
 *  (a drummer's bridge, a house track's offbeat bass: F 0.45 and 0.35 there, 0.98 and 1.00 here). */
function comb(o, kick, P0, a, z) {
  let best = { score: -1 };
  for (let P = P0 * 0.98; P <= P0 * 1.02; P += P0 * 0.0002) {
    const k0 = Math.floor(a / P), k1 = Math.ceil(z / P);
    for (let ph = 0; ph < P; ph += 0.5) {
      let s = 0; for (let k = k0; k <= k1; k++) s += peak(o, ph + k * P);
      s /= k1 - k0 + 1;
      if (s > best.score) best = { score: s, P, ph };
    }
  }
  // all the bands put a house track on its offbeat bass and stabs; the kick does not (its onsets on
  // the beat against the offbeat: 1.22 there, 1.56 to 5.5 on eight grooves already on the beat)
  const sum = (o2, ph) => { let s = 0; for (let k = Math.floor(a / best.P); k <= Math.ceil(z / best.P); k++) s += peak(o2, ph + k * best.P); return s; };
  if (sum(kick, best.ph + best.P / 2) > sum(kick, best.ph)) best.ph = (best.ph + best.P / 2) % best.P;
  // then to a fraction of a frame: a weighted line through the strong onsets within two frames of the
  // grid, each at the parabola through its peak (an 18 s groove at 123 came out at 123.11 without it)
  for (let pass = 0; pass < 2; pass++) {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = Math.floor(a / best.P); k <= Math.ceil(z / best.P); k++) {
      const c = Math.round(best.ph + k * best.P); let p = c;
      for (let d = -2; d <= 2; d++) if ((o[c + d] ?? 0) > (o[p] ?? 0)) p = c + d;
      if (!(o[p] >= 1.5)) continue;
      const y0 = o[p - 1] ?? 0, y2 = o[p + 1] ?? 0, dd = y0 - 2 * o[p] + y2, y = p + (dd < 0 ? 0.5 * (y0 - y2) / dd : 0), w = o[p];
      sw += w; sx += w * k; sy += w * y; sxx += w * k * k; sxy += w * k * y;
    }
    const den = sw * sxx - sx * sx;
    if (sw < 8 || !den) break;
    const P = (sw * sxy - sx * sy) / den;
    if (!(Math.abs(P / best.P - 1) < 0.005)) break; // a line through the wrong onsets: keep the comb's
    best.ph = ((sy - P * sx) / sw % P + P) % P; best.P = P;
  }
  return best;
}

function beatMeans(rows, frames, dim) { // a feature averaged over each beat, to the next one
  return frames.map((f, k) => {
    const a = Math.max(0, f), b = Math.min(rows.length, k + 1 < frames.length ? frames[k + 1] : f + (k ? f - frames[k - 1] : 40));
    const v = new Float64Array(dim); let c = 0;
    for (let i = a; i < b; i++, c++) for (let d = 0; d < dim; d++) v[d] += rows[i][d];
    return v.map((x) => x / Math.max(1, c));
  });
}

/** Analyses a track, or the stretch of it from `from`, `len` long. Times are seconds into the track. */
export function analyze(file, { from = 0, len = 0 } = {}) {
  const pcm = decode(file, from, len), duration = pcm.length / SR;
  const out = { file, from, duration: +duration.toFixed(3), bpm: null, steady: false, drift: null, clarity: 0, beats: [], downbeats: [], bar: null, sections: [] };
  if (duration < 4) return { ...out, why: 'shorter than 4 s' };
  const F = features(pcm, from === 0);
  if (F.silent) return { ...out, why: 'silent' };
  const o = envelope(F.flux), T = tempo(o);
  out.clarity = +T.clarity.toFixed(3);
  if (T.clarity < FLOOR) return { ...out, why: `no steady pulse (clarity ${out.clarity}, under ${FLOOR})` };
  const dp = track(o, T.period);
  if (dp.length < 8) return { ...out, why: 'too few beats' };
  // the grid. The programme's mean beat starts its search, not the median: beats alternating long
  // and short (a flam, a swing) put a drum break's median at 113 BPM for 110.
  const P0 = (dp[dp.length - 1] - dp[0]) / (dp.length - 1);
  const G = comb(o, envelope(F.kick), P0, dp[0], dp[dp.length - 1]), grid = [];
  // the grid runs from the first strong onset to the last (the programme trims a sparse end: a funk
  // track lost its last six beats), and a beat fitted up to 30 ms before 0 is the one at 0 (a groove
  // starting on its first beat had it at -2 ms, and the beat check read the page's beat 0 as 498 ms off)
  let first = 0, last = o.length - 1; while (first < last && o[first] < 1) first++; while (last > first && o[last] < 1) last--;
  const lo = Math.max(-WIN / 2 / HOP - (LAG + 0.03) * FPS, Math.min(dp[0], first) - G.P / 2), hi = Math.max(dp[dp.length - 1], last) + G.P / 4;
  for (let k = Math.ceil((lo - G.ph) / G.P); G.ph + k * G.P <= hi; k++) grid.push(G.ph + k * G.P);
  // steady or not: in each sixteen beats the programme followed, how far its beats sit from the grid
  // (or its offbeats: the programme takes an offbeat bass for the beat at times), counted where its
  // beats are on real onsets (a drumless breakdown leaves it guessing), and off when the grid there
  // finds much weaker onsets than the programme did: an edit, a tempo that moves. A first test that
  // only shifted the grid within an eighth of a beat passed an edit 0.14 s short as steady.
  let worst = 0, moved = false;
  const h = G.P / 2, off = dp.map((f) => { let x = ((f - G.ph) % h + h) % h; return Math.abs(x > h / 2 ? x - h : x); });
  for (let w = 0; w + 8 <= dp.length; w += 16) {
    const ds = dp.slice(w, w + 16), at = mean(ds.map((f) => peak(o, f)));
    if (at < 1.5) continue;
    const gs = grid.filter((f) => f >= ds[0] - G.P / 2 && f <= ds[ds.length - 1] + G.P / 2);
    const onGrid = Math.max(mean(gs.map((f) => peak(o, f))), mean(gs.map((f) => peak(o, f + h))));
    worst = Math.max(worst, off.slice(w, w + 16).sort((x, y) => x - y)[(ds.length - 1) >> 1]);
    if (onGrid < 0.6 * at) moved = true;
  }
  out.drift = Math.round(1000 * worst / FPS); // ms
  out.steady = !moved && out.drift <= 25;
  const beats = out.steady ? grid : dp; // a drifting track keeps the programme's beats, which follow it
  out.bpm = +(60 * FPS / (out.steady ? G.P : P0)).toFixed(2); // a drifting track's: its mean tempo
  out.beats = beats.map((f) => +Math.max(0, from + frameTime(f)).toFixed(3));
  // downbeats: of the four phases, the one where the bass hits and the harmony and timbre change
  const frames = beats.map(Math.round);
  const bass = zscore(frames.map((f) => Math.max(...[-1, 0, 1, 2].map((d) => F.low[f + d] || 0))));
  const ch = beatMeans(F.chroma, frames, 12), tb = beatMeans(F.bands, frames, F.bands[0].length);
  const change = zscore(frames.map((_, k) => (k ? 2 - cosine(ch[k], ch[k - 1]) - cosine(tb[k], tb[k - 1]) : 0)));
  const phase = [0, 1, 2, 3].map((p) => mean(bass.filter((_, k) => k % 4 === p)) + mean(change.filter((_, k) => k % 4 === p && k)));
  const order = [0, 1, 2, 3].sort((a, b) => phase[b] - phase[a]);
  out.bar = { phase: order[0], margin: +(phase[order[0]] - phase[order[1]]).toFixed(2) };
  out.downbeats = out.beats.filter((_, k) => k % 4 === order[0]);
  // sections: similarity on an absolute scale (log energy per band, chroma per bin), not a cosine of
  // z-scores, which blew a click track's rounding noise up into sections; a kernel only where it fits
  // whole (a lopsided one found sections in a click track's first bar), so a change within four bars
  // of either end goes unseen. Real changes scored 0.07 to 0.35 (a piano entering quietly, 0.02),
  // nothing else above 0.026: 0.04 is the floor.
  const X = tb.map((L, k) => ({ L, C: ch[k].map((c) => c / (Math.max(...ch[k]) || 1)) }));
  const sim = (x, y) => { let a = 0, b = 0; for (let i = 0; i < x.L.length; i++) a += (x.L[i] - y.L[i]) ** 2; for (let i = 0; i < 12; i++) b += (x.C[i] - y.C[i]) ** 2; return Math.exp(-(a / x.L.length + b / 12) / 0.5); };
  const M = X.length, K = 16, nov = new Float64Array(M);
  for (let i = K; i <= M - K; i++) {
    let s = 0, w = 0;
    for (let a = -K; a < K; a++) for (let b = -K; b < K; b++) {
      const g = Math.exp(-0.5 * (((a + 0.5) / (K / 2)) ** 2 + ((b + 0.5) / (K / 2)) ** 2)), sign = (a < 0) === (b < 0) ? 1 : -1;
      s += sign * g * sim(X[i + a], X[i + b]); w += g;
    }
    nov[i] = s / w;
  }
  const th = Math.max(0.04, mean([...nov]) + std([...nov]));
  for (let i = K; i <= M - K; i++) {
    if (nov[i] < th) continue;
    let top = true; for (let j = Math.max(0, i - 8); j <= Math.min(M - 1, i + 8); j++) if (nov[j] > nov[i]) top = false;
    if (!top) continue;
    const k = Math.round((i - order[0]) / 4) * 4 + order[0], b = k >= 0 && k < M && Math.abs(k - i) <= 2 ? k : i;
    if (!out.sections.some((s) => s.beat === b)) out.sections.push({ t: out.beats[b], beat: b, bar: Math.floor((b - order[0]) / 4) + 1, novelty: +nov[i].toFixed(3) });
  }
  return out;
}

/** The page's beats (film seconds) against the track's, the track started at `at`: for render.mjs. */
export function check(A, pageBeats, at, dur) {
  if (!Number.isFinite(at) || at < 0) return { ok: false, lines: [`beats: AUDIO_AT must be seconds into the track, 0 or more`] };
  if (!A.bpm) return { ok: true, lines: [`beats: the track has no beat to follow (${A.why}): the cuts keep the film's own grid`] };
  const end = A.from + A.duration - at; // where the track runs out, in film seconds
  if (end <= 0) return { ok: false, lines: [`beats: AUDIO_AT=${at} is past the track's end (${(A.from + A.duration).toFixed(2)} s)`] };
  const tb = A.beats.map((t) => t - at).filter((t) => t > -0.5 && t < dur + 0.5), lines = [];
  const near = (t) => tb.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), Infinity);
  const errs = pageBeats.filter((t) => t >= 0 && t <= Math.min(dur, end - 0.1)).map((t) => ({ t, e: t - near(t) }));
  const off = errs.find((x) => !(Math.abs(x.e) <= 0.035)), worst = errs.reduce((m, x) => Math.max(m, Math.abs(x.e)), 0);
  const nextBar = A.downbeats.find((t) => t >= at - 0.035), onBar = nextBar != null && Math.abs(nextBar - at) <= 0.035;
  const what = `${A.bpm} BPM, ${A.steady ? `steady` : `drifting (${A.drift} ms off one grid)`}`;
  if (!off) lines.push(`beats: the page's ${errs.length} beats land on the track's (${what}), within ${Math.round(1000 * worst)} ms`);
  else lines.push(`beats: the page's beats leave the track's (${what}) at ${off.t.toFixed(2)} s, ${Math.round(1000 * off.e)} ms off (${Math.round(1000 * worst)} at worst)`);
  if (off && A.steady) lines.push(`  bpm: ${A.bpm} in PROMO_META, and AUDIO_AT on a bar's first beat: ${A.downbeats.filter((t) => t >= at - 0.035).slice(0, 3).join(', ') || A.downbeats.slice(0, 3).join(', ')}`);
  if (off && !A.steady) lines.push(`  no fixed bpm follows it: node beats.mjs <track> --out beats.js, then const B = FILM.beats(BEATS.beats, ${at})`);
  if (!off && !onBar && nextBar != null) lines.push(`  t = 0 is on a beat but not a bar's first (a guess from the bass and the harmony): AUDIO_AT=${nextBar} starts on one`);
  if (end < dur) lines.push(`  the track runs out ${(dur - end).toFixed(2)} s before the film ends`);
  return { ok: !off, lines };
}

// ---------------------------------------------------------------- a groove with known beats, for the self-test
/** Writes a synthetic groove: kick on every beat, snare on 2 and 4, hats on the offbeats, a bass note
 *  on each bar's first beat, a held chord from bar `change` on; `lead` seconds of silence first; the
 *  tempo rising by `drift` (0.1: 10 %) over the length, or pink noise. Returns its true beats. */
export function synth(file, { bpm = 123, lead = 0.4, bars = 16, change = 9, drift = 0, noise = false } = {}) {
  const b0 = bpm / 60, len = lead + bars * 4 / (b0 * (1 + drift / 2)), K = (b0 * drift) / (2 * (len - lead));
  const src = noise ? `anoisesrc=color=pink:amplitude=0.3:d=${len.toFixed(3)}`
    : `aevalsrc=exprs='st(0,t-${lead});st(1,${b0}*ld(0)+${K}*ld(0)*ld(0));st(2,(ld(1)-floor(ld(1)))/(${b0}+${2 * K}*ld(0)));`
      + `st(3,mod(floor(ld(1)),4));st(4,(ld(1)+0.5-floor(ld(1)+0.5))/(${b0}+${2 * K}*ld(0)));`
      + `gte(ld(0),0)*(0.9*sin(2*PI*60*ld(2))*exp(-18*ld(2))+(eq(ld(3),1)+eq(ld(3),3))*0.45*(2*random(5)-1)*exp(-22*ld(2))`
      + `+0.2*(2*random(6)-1)*exp(-70*ld(4))+eq(ld(3),0)*0.5*sin(2*PI*98*ld(2))*exp(-3*ld(2))`
      + `+gte(ld(1),${4 * (change - 1)})*0.1*(sin(2*PI*220*t)+sin(2*PI*277.18*t)+sin(2*PI*329.63*t)))':s=${SR}:d=${len.toFixed(3)}`;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-ac', '1', file]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  const beats = [];
  for (let k = 0; k < bars * 4; k++) beats.push(lead + (K ? (-b0 + Math.sqrt(b0 * b0 + 4 * K * k)) / (2 * K) : k / b0));
  return noise ? { beats: [], downbeats: [], change: null } : { beats, downbeats: beats.filter((_, k) => k % 4 === 0), change: beats[4 * (change - 1)] };
}

function selftest() {
  const dir = mkdtempSync(join(tmpdir(), 'beats-test-')); let failed = 0;
  const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failed++; };
  const fm = (det, ref, tol = 0.05) => { const used = new Set(); let hit = 0;
    for (const d of det) { const i = ref.findIndex((r, j) => !used.has(j) && Math.abs(r - d) <= tol); if (i >= 0) { used.add(i); hit++; } }
    const P = hit / Math.max(1, det.length), R = hit / Math.max(1, ref.length); return P + R ? 2 * P * R / (P + R) : 0; };
  try {
    const f1 = join(dir, 'steady.wav'), T1 = synth(f1), A = analyze(f1);
    ok(Math.abs(A.bpm - 123) <= 0.1 && A.steady, `a steady 123 BPM groove: ${A.bpm} BPM, ${A.steady ? 'steady' : 'not steady'} (${A.drift} ms)`);
    const F1 = fm(A.beats, T1.beats);
    ok(F1 >= 0.97, `its beats: F ${F1.toFixed(2)} within 50 ms`);
    ok(Math.abs(A.downbeats[0] - 0.4) <= 0.03, `its first bar after 0.4 s of silence: ${A.downbeats[0]} s`);
    ok(A.sections.length === 1 && Math.abs(A.sections[0].t - T1.change) <= 0.06, `one section, where the chord comes in at ${T1.change.toFixed(2)} s: ${JSON.stringify(A.sections.map((s) => s.t))}`);
    const page = (bpm) => Array.from({ length: 40 }, (_, n) => n * 60 / bpm);
    const good = check(A, page(123), A.downbeats[0], 18), bad = check(A, page(120), A.downbeats[0], 18);
    ok(good.ok && !bad.ok && bad.lines.join(' ').includes('bpm: 123'), `check: a page at 123 lands, one at 120 is told 123 (${bad.lines[0].replace(/^beats: /, '')})`);
    const f2 = join(dir, 'drift.wav'), T2 = synth(f2, { bpm: 110, drift: 0.1, bars: 12 }), D = analyze(f2);
    ok(D.bpm && !D.steady, `a groove from 110 to 121 BPM: ${D.steady ? 'steady' : 'not steady'} (${D.drift} ms off one grid)`);
    const F2 = fm(D.beats, T2.beats);
    ok(F2 >= 0.9, `its beats follow it: F ${F2.toFixed(2)}`);
    const f3 = join(dir, 'noise.wav'); synth(f3, { noise: true }); const N = analyze(f3);
    ok(!N.bpm, `pink noise: no beat (${N.why})`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  console.log(failed ? `${failed} failed` : 'all passed');
  return failed ? 1 : 0;
}

const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
if (process.argv[1] && import.meta.url.endsWith('/' + basename(process.argv[1]))) {
  const usage = () => { console.error('usage: node beats.mjs <track> [--from s] [--len s] [--out beats.js|beats.json] | --selftest'); process.exit(2); };
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args.splice(i, 2)[1]; return v == null || v.startsWith('--') ? usage() : v; };
  if (args[0] === '--selftest') process.exit(selftest());
  const outFile = opt('--out'), from = Number(opt('--from') || 0), len = Number(opt('--len') || 0), [file] = args;
  if (!file || !(from >= 0) || !(len >= 0)) usage();
  let A;
  try { A = analyze(file, { from, len }); } catch (e) { console.error(`error: ${e.message}`); process.exit(1); }
  console.log(`${basename(file)}, ${clock(A.from)}–${clock(A.from + A.duration)}`);
  if (!A.bpm) console.log(`no beat to follow: ${A.why}. The film keeps its own grid; place the cuts by ear.`);
  else {
    console.log(A.steady
      ? `${A.bpm} BPM, steady: every four bars within ${A.drift} ms of one grid (pulse ${A.clarity})`
      : `about ${A.bpm} BPM, NOT steady: it leaves one grid by ${A.drift} ms (pulse ${A.clarity})`);
    console.log(`bars from ${A.downbeats[0].toFixed(3)} s: ${A.downbeats.slice(0, 4).map((t) => t.toFixed(3)).join(' ')} … (a guess from the bass and the harmony${A.bar.margin < 0.3 ? ', a weak one: listen' : ''})`);
    if (A.sections.length) console.log(`sections: ${A.sections.map((s) => `${clock(s.t)} (bar ${s.bar})`).join(' · ')}`);
    console.log(A.steady
      ? `for the page: bpm: ${A.bpm} in PROMO_META; AUDIO_AT=${A.downbeats[0].toFixed(3)} starts on the first bar${A.sections[0] ? `, AUDIO_AT=${A.sections[0].t.toFixed(3)} on the first section` : ''}`
      : `for the page: no fixed bpm follows it: --out beats.js, then const B = FILM.beats(BEATS.beats, AUDIO_AT)`);
  }
  if (outFile) {
    const data = { file: basename(file), bpm: A.bpm, steady: A.steady, drift: A.drift, beats: A.beats, downbeats: A.downbeats, sections: A.sections.map((s) => s.t) };
    try { writeFileSync(outFile, extname(outFile) === '.js' ? `window.BEATS = ${JSON.stringify(data)};\n` : JSON.stringify(data) + '\n'); } catch (e) { console.error(`error: ${e.message}`); process.exit(1); }
    console.log(`→ ${outFile}`);
  }
}
