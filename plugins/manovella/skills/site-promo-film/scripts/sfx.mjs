#!/usr/bin/env node
// sfx.mjs — the film's small sounds, made in code and timed from the film's own clock.
//
//   node sfx.mjs [page.html[#hash]] [--out sfx.wav] [--only click,cut,key] [--level 0] [--json sfx.json]
//   node sfx.mjs --selftest                      the sounds' timing and levels, with no browser
//
// Optional, and off unless you run it: a film with no sound effects is a film that never called this.
// It reads the page the way render.mjs does (PAGE=<path> works too) and lays one short sound on every picture
// event the page declares, ONE FRAME AFTER it (1 / PROMO_META.fps: the picture shows the event first, the
// ear confirms it, the way a person's does). Nothing is sampled: every sound is synthesised from a formula
// and a seeded hash (narrate.mjs's unit()), so the same page gives the same file to the byte, and there is
// nothing to license.
//
//   click   each of the page's CLICKS (beats through the page's B(), or seconds where it has no B): a soft
//           mouse click, a 4 ms tick over a low thump. At the moment its ripple starts.
//   cut     each scene change of the page's timeline (TL.scenes[i].start, i > 0): a short breath of noise
//           that opens and closes over the transition's length (0.2 to 0.5 s); a transition of no length
//           gets a single soft thud.
//   key     each letter typed. A page that types declares it, beside its CLICKS:
//             const SFX = { typing: [{ t0: <film seconds the line starts>, text: 'brew install acme', cps: 13, seed: 3 }] };
//           t0, text, cps and seed are the ones given to FILM.typed (film.js): the times of the letters are
//           read from FILM.typed itself, so the sound follows the picture whatever the cadence. SFX may
//           also carry `events: [{ t, kind: 'click' | 'cut' | 'key' }]` for anything else (a toggle's snap).
//
// Levels, peak in dBFS at --level 0: click -18, cut -24, key -28 (a key varies by up to 3 dB and a little
// in pitch, by its position in the line, so a line does not machine-gun). --level N moves them all by N dB.
// They are sized to sit under a voice (narrate.mjs's track peaks near -3 dBFS) and a music bed:
//   node mix.mjs --voice narration.wav --music track.mp3 --sfx sfx.wav --out mix.wav
// with no voice and no music, AUDIO=sfx.wav AUDIO_NORM=0 for render.mjs keeps their own level (normalised
// instead, render.mjs would raise this very quiet track 12 dB, the most it ever does).
// The track is the film's clock from 0: render.mjs adds FROM= to AUDIO_AT itself, so a range of the film takes AUDIO_AT=0 (the default).
//
// The file is the film's clock from 0, 48 kHz mono 16-bit, as long as the page's duration. It prints each
// event with its sample: the picture event's time, the sound's first sample, and the gap (one frame).
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unit, wav } from './narrate.mjs';

const RATE = 48000;
/** Peak level of each sound at --level 0, dBFS. */
export const PEAK = { click: -18, cut: -24, key: -28 };

// Google Chrome, as render.mjs finds it: Edge on Windows, Chromium on Linux; MANOVELLA_CHROME names any.
// (Copied, as clickcheck.mjs copies it: this file is run from a film's src/ on its own too.)
async function launchChrome(opts = {}) {
  const { chromium } = await import('playwright-core'); // only a page read needs it: --selftest and build() run without
  opts = { ...opts, args: [...(opts.args || []), ...(process.platform === 'darwin' ? [] : ['--enable-unsafe-swiftshader'])] };
  if (process.env.MANOVELLA_CHROME) return chromium.launch({ ...opts, executablePath: process.env.MANOVELLA_CHROME });
  try { return await chromium.launch({ ...opts, channel: 'chrome' }); } catch (e) {
    if (process.platform === 'win32') return chromium.launch({ ...opts, channel: 'msedge' });
    const alt = process.platform === 'linux' && ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].find((p) => existsSync(p));
    if (!alt) throw e;
    return chromium.launch({ ...opts, executablePath: alt });
  }
}

/** A seeded stream of numbers in [-1, 1): the same on every run, on every machine (integers only: no Math.random). */
const noise = (seed) => { let n = 0; return () => unit(`${seed}:${n++}`) * 2 - 1; };

// ---- the sounds: each returns Float32 samples that start on a nonzero sample (the event's first sample) and peak at 1
/** A mouse click: a 4 ms tick of high noise and a 2.4 kHz ring over a 150 Hz thump that lasts 40 ms. */
function click(seed) {
  const n = Math.round(0.06 * RATE), out = new Float32Array(n), r = noise(`click:${seed}`);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE, x = r();
    lp += 0.35 * (x - lp);                                            // the noise, high-passed: its own low part is taken away
    const tick = (x - lp) * Math.exp(-t / 0.0012);
    const ring = Math.sin(2 * Math.PI * 2400 * t + 0.6) * Math.exp(-t / 0.004);
    const thump = Math.sin(2 * Math.PI * 150 * t + 1.2) * Math.exp(-t / 0.014);
    out[i] = 0.55 * tick + 0.45 * ring + 0.7 * thump;
  }
  return normalise(out);
}
/** A key: shorter and lighter than a click, a pitch and a level that wander with the key's place in its line. */
function key(seed, space) {
  const n = Math.round(0.035 * RATE), out = new Float32Array(n), r = noise(`key:${seed}`);
  const f = (space ? 1500 : 3000) + 500 * unit(`kf:${seed}`), amp = 10 ** ((-3 * unit(`kg:${seed}`)) / 20);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE, x = r();
    lp += 0.5 * (x - lp);
    out[i] = amp * (0.6 * (x - lp) * Math.exp(-t / 0.0008) + 0.5 * Math.sin(2 * Math.PI * f * t + 0.5) * Math.exp(-t / 0.0025) + (space ? 0.5 : 0.25) * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.008));
  }
  return out; // not normalised: the variation is its level; the caller scales by the sound's peak
}
/** A breath of noise through a band that rises from 500 Hz to 3 kHz while the sound swells and falls over `dur` seconds. */
function breath(seed, dur) {
  const n = Math.round(dur * RATE), out = new Float32Array(n), r = noise(`cut:${seed}`);
  let low = 0, band = 0; // a state-variable filter
  for (let i = 0; i < n; i++) {
    const p = i / n, fc = 500 * Math.pow(6, p), f = 2 * Math.sin(Math.PI * fc / RATE), q = 0.9;
    const x = r(), high = x - low - q * band; band += f * high; low += f * band;
    out[i] = band * Math.sin(Math.PI * p) ** 2 + (i === 0 ? x * 0.2 : 0); // the first sample is nonzero by construction
  }
  return normalise(out);
}
/** A soft thud for a cut that has no length: a 90 Hz body, 60 ms. */
function thud(seed) {
  const n = Math.round(0.08 * RATE), out = new Float32Array(n), r = noise(`thud:${seed}`);
  for (let i = 0; i < n; i++) { const t = i / RATE; out[i] = Math.sin(2 * Math.PI * 90 * t + 1.1) * Math.exp(-t / 0.02) + 0.3 * r() * Math.exp(-t / 0.002); }
  return normalise(out);
}
function normalise(x) { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p ? x.map((v) => v / p) : x; }

/** What the page declares: { fps, duration, events: [{ kind, t, label }] } in film seconds, from its own functions. */
export async function readPage(file, hash = '') {
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(pathToFileURL(resolve(file)).href + (hash ? '#' + hash : ''));
    await page.evaluate(() => window.ready);
    return await page.evaluate(() => {
      const META = window.PROMO_META, events = [], has = (n) => { try { return typeof eval(n) !== 'undefined'; } catch { return false; } };
      const beat = has('B') ? (b) => eval('B')(b) : (b) => b; // a page with no B counts CLICKS in seconds
      if (has('CLICKS')) eval('CLICKS').forEach((c, i) => events.push({ kind: 'click', t: beat(c), label: `click ${i + 1}` }));
      if (has('TL')) {
        const scenes = eval('TL').scenes;
        scenes.forEach((s, i) => { if (i > 0) events.push({ kind: 'cut', t: s.start, dur: s.tr ? s.tr.dur : 0, label: `cut to ${s.id || i}${s.tr ? ` (${s.tr.kind})` : ''}` }); });
      }
      if (has('SFX')) {
        const S = eval('SFX');
        for (const e of S.events || []) events.push({ kind: e.kind, t: e.t, dur: e.dur, label: e.label || e.kind });
        for (const [j, ty] of (S.typing || []).entries()) {
          // each letter's time: the first t at which FILM.typed shows n letters (found by bisection: it only grows with t)
          const o = { cps: ty.cps ?? 14, seed: ty.seed ?? 1 }, last = ty.t0 + ty.text.length / o.cps * 3 + 10;
          for (let n = 1; n <= ty.text.length; n++) {
            let lo = ty.t0, hi = last;
            for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (window.FILM.typed(ty.text, m, ty.t0, o).n >= n) hi = m; else lo = m; }
            events.push({ kind: 'key', t: hi, space: ty.text[n - 1] === ' ', label: `key ${j + 1}.${n} "${ty.text[n - 1]}"` });
          }
        }
      }
      return { fps: META.fps, duration: META.duration, events: events.sort((a, b) => a.t - b.t) };
    });
  } finally { await browser.close(); }
}

/** The track: Int16 samples at RATE for `duration` seconds, and the events as laid (their first sample). */
export function build({ fps, duration, events }, { only = ['click', 'cut', 'key'], level = 0 } = {}) {
  const total = Math.ceil(duration * RATE), mix = new Float32Array(total), laid = [];
  const lin = (kind) => 10 ** ((PEAK[kind] + level) / 20);
  events.filter((e) => only.includes(e.kind)).forEach((e, i) => {
    const at = Math.round((e.t + 1 / fps) * RATE); // one frame after the picture event
    const x = e.kind === 'click' ? click(i) : e.kind === 'key' ? key(i, e.space) : e.dur > 0.05 ? breath(i, Math.min(0.5, Math.max(0.2, e.dur))) : thud(i);
    const g = lin(e.kind);
    for (let j = 0; j < x.length && at + j < total; j++) mix[at + j] += x[j] * g;
    laid.push({ kind: e.kind, label: e.label, event: +e.t.toFixed(4), frame: Math.round(e.t * fps), sample: at, sound: +(at / RATE).toFixed(5), peak: +(PEAK[e.kind] + level).toFixed(1) });
  });
  return { samples: Int16Array.from(mix, (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)))), laid };
}

/** No browser: the sounds from events given as numbers, held to what the header promises. */
function selftest() {
  const page = { fps: 60, duration: 3, events: [{ kind: 'click', t: 0.5, label: 'a' }, { kind: 'cut', t: 1, dur: 0.4, label: 'b' }, { kind: 'cut', t: 1.5, dur: 0, label: 'c' }, { kind: 'key', t: 2, label: 'd' }, { kind: 'key', t: 2.1, space: true, label: 'e' }] };
  const one = build(page), two = build(page), peakOf = (s, a, b) => { let p = 0; for (let i = a; i < b; i++) p = Math.max(p, Math.abs(s[i])); return 20 * Math.log10(p / 32767); };
  const cases = [
    ['the same events give the same samples, twice', () => Buffer.from(one.samples.buffer).equals(Buffer.from(two.samples.buffer))],
    ['each sound starts one frame after its event (sample = (t + 1/60) x 48000)', () => one.laid.every((e, i) => e.sample === Math.round((page.events[i].t + 1 / 60) * RATE))],
    ['its first sample is nonzero, and there is silence before it', () => one.laid.every((e) => one.samples[e.sample] !== 0) && one.samples.subarray(0, one.laid[0].sample).every((v) => v === 0)],
    ['a click peaks at -18 dBFS, within 0.1 dB', () => Math.abs(peakOf(one.samples, one.laid[0].sample, one.laid[0].sample + 2880) + 18) < 0.1],
    ['a cut peaks at -24 dBFS, within 0.1 dB', () => Math.abs(peakOf(one.samples, one.laid[1].sample, one.laid[1].sample + 19200) + 24) < 0.1],
    ['--level moves them: -6 dB halves a click', () => Math.abs(peakOf(build(page, { level: -6 }).samples, one.laid[0].sample, one.laid[0].sample + 2880) + 24) < 0.1],
    ['--only leaves the others out', () => build(page, { only: ['click'] }).laid.length === 1],
    ['the track is as long as the page', () => one.samples.length === 3 * RATE],
  ];
  let bad = 0;
  for (const [name, f] of cases) { const ok = f(); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`); }
  console.log(bad ? `\n${bad} failed` : '\nall passed');
  process.exitCode = bad ? 1 : 0;
}

async function main() {
  if (process.argv[2] === '--selftest') return selftest();
  const argv = process.argv.slice(2), valued = ['--out', '--only', '--level', '--json'];
  const arg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
  const spec = argv.find((a, i) => !a.startsWith('--') && !valued.includes(argv[i - 1])) || process.env.PAGE || 'promo.html';
  const [file, hash = ''] = spec.split('#'), out = resolve(arg('--out', 'sfx.wav'));
  const only = String(arg('--only', 'click,cut,key')).split(',').map((s) => s.trim()).filter(Boolean), level = Number(arg('--level', 0));
  if (only.some((k) => !(k in PEAK))) { console.error(`sfx.mjs: --only takes ${Object.keys(PEAK).join(', ')}`); process.exit(2); }
  if (!Number.isFinite(level) || level < -30 || level > 6) { console.error('sfx.mjs: --level is dB from -30 to 6 (0 sits under a voice)'); process.exit(2); }
  if (!existsSync(file)) { console.error(`sfx.mjs: ${file}: no such page`); process.exit(2); }
  const page = await readPage(file, hash), { samples, laid } = build(page, { only, level });
  if (!laid.length) { console.error(`sfx.mjs: ${file} declares nothing to sound (no CLICKS, no timeline cuts, no SFX): nothing written`); process.exit(1); }
  writeFileSync(out, wav(samples));
  if (arg('--json')) writeFileSync(resolve(arg('--json')), JSON.stringify(laid, null, 1) + '\n');
  const frame = (s) => s.toFixed(4).padStart(8);
  for (const e of laid) console.log(`${e.kind.padEnd(5)} ${e.label.padEnd(30)} picture ${frame(e.event)} s (frame ${e.frame})  sound from sample ${String(e.sample).padStart(8)} = ${frame(e.sound)} s  peak ${e.peak} dBFS`);
  const by = (k) => laid.filter((e) => e.kind === k).length;
  console.log(`${laid.length} sounds (${by('click')} clicks, ${by('cut')} cuts, ${by('key')} keys), each one frame (${(1000 / page.fps).toFixed(1)} ms at ${page.fps} fps) after its picture event → ${out}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
