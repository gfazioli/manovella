#!/usr/bin/env node
// mix.mjs — a voice and a music track into one soundtrack: the music under the voice, rising between lines.
//
//   node mix.mjs --voice narration.wav --music track.mp3 --out mix.wav
//                [--at 0.08] [--under 14] [--lift 6] [--length <s>] [--tail <s>] [--fade 1.5]
//
// render.mjs takes one AUDIO. A film that speaks over music gets this file as it, from its start:
// AUDIO=mix.wav AUDIO_AT=0 AUDIO_LUFS=-16 (speech's target, render.mjs §7). The voice is the film's
// clock (narrate.mjs or voice.mjs wrote it: the narration starts where the film starts), so the mix
// is as long as the voice unless --length says otherwise, and the music is taken from --at seconds
// into the track: its first bar (the Studio's musicBeats.at, beats.mjs), so the page's B(0) is a
// downbeat and render.mjs's beat check still finds the track's beat under the voice.
//
// - --under: how far the music sits under the voice while it speaks, in LU (dB of loudness): the two
//   are measured (EBU R128, integrated, as render.mjs measures) and one gain puts the music's level
//   there. 12 to 15 is what a voice-over wants (14, the default); less and the words blur.
// - --lift: how much the music comes up between lines, where nobody speaks: by this, never above its
//   own level (6 dB, the default; 0 keeps it under all along). It goes down 0.35 s before a line
//   begins, so no word starts over loud music, and comes back up over about a second after one ends.
//   A pause shorter than 0.7 s is not a gap: the music does not pump between two sentences.
// - --tail: seconds the mix goes on after the voice's last sample, the music alone (0, the default):
//   the Studio's samples take a moment of it, to hear what the music does where nobody speaks. With
//   --length the mix is as long as that says, and --tail counts for nothing.
// - --fade: the last seconds faded out (1.5 s), and the music's first 50 ms faded in (no click on a
//   bar that starts mid-wave). render.mjs fades the film's last 0.6 s again, which changes nothing here.
// - The voice is laid in the middle of both channels, the music keeps its stereo, 48 kHz 16-bit. Were
//   their sum to clip, the whole mix is turned down by one gain, said: render.mjs sets the loudness
//   after, so only the balance made here matters.
//
// It prints both loudnesses, the music's gain, and what came out, measured on the result: how far
// under the voice the music sat while it spoke, and while it did not. A music track shorter than the
// mix is said, and the rest is silence: pick a longer track, a later --at, or a shorter film.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pcm, wav } from './narrate.mjs';

const RATE = 48000, FRAME = 480; // 10 ms frames for the envelope
const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const stop = (code, m) => { console.error(`mix.mjs: ${m}`); process.exit(code); };
const VOICE = arg('--voice'), MUSIC = arg('--music'), OUT = arg('--out');
if (!VOICE || !MUSIC || !OUT) stop(2, 'usage: mix.mjs --voice narration.wav --music track.mp3 --out mix.wav [--at <s>] [--under 14] [--lift 6] [--length <s>] [--tail <s>] [--fade 1.5]');
const AT = Number(arg('--at', 0)), UNDER = Number(arg('--under', 14)), LIFT = Number(arg('--lift', 6)), FADE = Number(arg('--fade', 1.5)), TAIL = Number(arg('--tail', 0));
if (!(AT >= 0)) stop(2, `--at ${arg('--at')}: seconds into the track, 0 or more`);
if (!(TAIL >= 0)) stop(2, `--tail ${arg('--tail')}: seconds of the music after the voice, 0 or more`);
if (!(UNDER >= 6 && UNDER <= 30)) stop(2, `--under ${arg('--under')}: 6 to 30 LU under the voice (12 to 15 is a voice-over's)`);
if (!(LIFT >= 0 && LIFT <= UNDER)) stop(2, `--lift ${arg('--lift')}: 0 to --under (the music never comes up past its own level)`);

/** Integrated loudness (EBU R128) of Int16 samples at RATE, `ch` channels, given to ffmpeg on its stdin;
 *  null when there is too little sound to gate (EBU R128 measures from one 400 ms block). */
function lufs(samples, ch) {
  if (samples.length < RATE * ch * 0.4) return null;
  const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-f', 's16le', '-ar', String(RATE), '-ac', String(ch), '-i', '-', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'],
    { input: Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2), encoding: 'utf8', maxBuffer: 1 << 26 }).stderr || '';
  const m = e.match(/I:\s+(-?[\d.]+) LUFS/g), v = m ? Number(m[m.length - 1].match(/-?[\d.]+/)[0]) : NaN; // the last: the summary
  return Number.isFinite(v) && v > -70 ? v : null;
}

const voice = pcm(resolve(VOICE));
// The voice goes into both channels at full level, which R128 hears 3 LU louder than the same samples
// as mono: it is measured as it will be heard, both channels, or --under would come out 3 LU too far.
const dual = (mono) => { const s = new Int16Array(mono.length * 2); for (let i = 0; i < mono.length; i++) s[i * 2] = s[i * 2 + 1] = mono[i]; return s; };
const len = Math.round((arg('--length') != null ? Number(arg('--length')) : voice.length / RATE + TAIL) * RATE);
if (!(len > RATE)) stop(2, `a mix of ${(len / RATE).toFixed(2)} s: give it a voice, or --length, of a second or more`);
const music = pcm(resolve(MUSIC), 2, ['-ss', String(AT), '-t', String(len / RATE)]);
const have = music.length / 2;
if (have < len - RATE * 0.05) console.log(`the music runs out at ${(have / RATE).toFixed(2)} s of the ${(len / RATE).toFixed(2)} s mix (from ${AT} s into the track): the rest is silence. A longer track, an earlier --at or a shorter film.`);

// their loudness, as render.mjs measures it: the voice where it speaks (the gate leaves the pauses
// out), the music over the stretch the film uses
const vL = lufs(dual(voice.subarray(0, Math.min(voice.length, len))), 2), mL = lufs(music, 2);
if (vL == null) stop(3, `${VOICE} holds no speech to measure`);
if (mL == null) stop(3, `${MUSIC} holds no sound from ${AT} s on`);
const bed = vL - UNDER - mL; // dB on the music while the voice speaks

// where the voice speaks: 10 ms frames over a floor 30 dB under its loud frames, pauses under 0.7 s bridged
const n = Math.ceil(len / FRAME), db = new Float32Array(n);
for (let i = 0; i < n; i++) {
  let s = 0, k = 0;
  for (let j = i * FRAME; j < Math.min((i + 1) * FRAME, voice.length); j++, k++) s += voice[j] * voice[j];
  db[i] = k ? 10 * Math.log10(s / k / 32768 ** 2 + 1e-12) : -120;
}
const loud = db.filter((x) => x > -100).sort(), floor = (loud[Math.floor(loud.length * 0.95)] ?? -20) - 30;
const on = Uint8Array.from(db, (x) => (x > floor ? 1 : 0));
for (let i = 0, last = -1; i < n; i++) if (on[i]) { if (last >= 0 && i - last - 1 < 70) on.fill(1, last + 1, i); last = i; }
// the gain in dB, frame by frame: down 0.35 s ahead of a line (the least of what is coming), down
// fast and up slowly, so a line never starts over the music and the music does not pump
const want = Float32Array.from(on, (x) => bed + (x ? 0 : LIFT)), gain = new Float32Array(n);
const ahead = 35, aDown = 1 - Math.exp(-1 / 12), aUp = 1 - Math.exp(-1 / 30);
let y = Math.min(...want.subarray(0, ahead + 1));
for (let i = 0; i < n; i++) {
  let w = want[i]; for (let j = i + 1; j <= Math.min(n - 1, i + ahead); j++) if (want[j] < w) w = want[j];
  y += (w - y) * (w < y ? aDown : aUp); gain[i] = y;
}

// the music's own level, sample by sample: its curve, faded in over 50 ms (a bar that starts mid-wave
// does not click), out over --fade and where the track itself ends. The mix and its measure both read it.
const fadeN = Math.max(1, Math.round(FADE * RATE)), inN = Math.round(0.05 * RATE), lin = new Float32Array(len);
for (let i = 0; i < len; i++) {
  const f = i / FRAME, a = Math.min(n - 1, Math.floor(f)), b = Math.min(n - 1, a + 1), g = gain[a] + (gain[b] - gain[a]) * (f - a);
  lin[i] = i < have ? 10 ** (g / 20) * Math.max(0, Math.min(1, i / inN, (len - i) / fadeN, (have - i) / inN)) : 0;
}
// the sum, in floats, the voice in both channels; one gain down for the whole of it, were it to clip
const mix = new Float32Array(len * 2);
let peak = 0;
for (let i = 0; i < len; i++) {
  const v = i < voice.length ? voice[i] : 0;
  for (let c = 0; c < 2; c++) { const s = v + (i < have ? music[i * 2 + c] * lin[i] : 0); mix[i * 2 + c] = s; if (Math.abs(s) > peak) peak = Math.abs(s); }
}
const trim = peak > 32767 * 0.98 ? (32767 * 0.98) / peak : 1;
if (trim < 1) console.log(`the voice and the music together would clip: the whole mix down ${(20 * Math.log10(trim)).toFixed(2)} dB (render.mjs sets the loudness after)`);
writeFileSync(resolve(OUT), wav(Int16Array.from(mix, (s) => Math.max(-32768, Math.min(32767, Math.round(s * trim)))), 2));

// measured on what was written: the music alone under the voice's lines and between them, the voice alone under its lines
const speaking = (i) => on[Math.min(n - 1, Math.floor(i / FRAME))] === 1;
function part(pick) {
  let k = 0; for (let i = 0; i < len; i++) if (pick(i)) k++;
  const m = new Int16Array(k * 2), v = new Int16Array(k);
  for (let i = 0, j = 0; i < len; i++) if (pick(i)) {
    const g = lin[i] * trim;
    if (i < have) { m[j * 2] = Math.round(music[i * 2] * g); m[j * 2 + 1] = Math.round(music[i * 2 + 1] * g); }
    v[j++] = i < voice.length ? Math.round(voice[i] * trim) : 0;
  }
  return { m, v };
}
const speak = part(speaking), gaps = part((i) => !speaking(i));
const mUnder = lufs(speak.m, 2), mGaps = lufs(gaps.m, 2), vOn = lufs(dual(speak.v), 2);
const fmt = (x) => (x == null ? 'too short to measure' : `${x.toFixed(1)} LUFS`);
console.log(`voice ${vL.toFixed(1)} LUFS, music ${mL.toFixed(1)} LUFS from ${AT} s: the music at ${bed >= 0 ? '+' : ''}${bed.toFixed(1)} dB to sit ${UNDER} LU under the voice, ${LIFT ? `up to ${LIFT} dB more between lines` : 'and there between lines too'}`);
console.log(`measured on the mix: the music ${fmt(mUnder)} while the voice speaks (${fmt(vOn)})${mUnder != null && vOn != null ? `, ${(vOn - mUnder).toFixed(1)} LU under it` : ''}; ${fmt(mGaps)} between lines${mUnder != null && mGaps != null ? ` (${(mGaps - mUnder).toFixed(1)} dB up: a short pause does not reach the whole lift)` : ''}`);
console.log(`→ ${resolve(OUT)}: ${(len / RATE).toFixed(2)} s, stereo, 48 kHz. Render with AUDIO=${OUT} AUDIO_AT=0 AUDIO_LUFS=-16`);
