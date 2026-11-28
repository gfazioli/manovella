#!/usr/bin/env node
// words.mjs — the second each word of a voice-over starts, so an action can land on the word that names it.
//
//   node words.mjs story.json [--out <dir>] [--from <dir>]
//   node words.mjs --selftest                            the matching and the edges, with no model
//   node voice.mjs --setup words                         once on each machine: the speech-to-text model
//
// narrate.mjs times a film per step (`step.t`, the second its sentence starts). This adds the words of each
// sentence: it reads the recordings narrate.mjs laid down, has a local speech-to-text model (Whisper, MIT) say
// when each word starts and ends, matches that to the sentence the story says, and writes
//   words.json     the cache: per step, the words with their seconds into the step's recording, and what the
//                  model heard (a step whose recording, text and model did not change is not heard again)
//   narration.js   (narrate.mjs, run again by this) with `words: [{ w, t, end }]` beside each step's `t`: film seconds
// The page uses them as it uses `step.t`: FILM.word(NARRATION, 'open', 'menu') is the film second the word "menu"
// starts in step "open" (an optional third argument: which one, 0 for the first), and inside FILM.narrated's
// make(step), `step.word('menu')` is that second in the scene's own time, as `step.at` is the sentence's.
//
// The recordings are voice-mlx/ for a story with "mlx" (voice.mjs), voice/ for `say`'s, or the folder --from names:
// a person's recordings too. Run it after voice.mjs or narrate.mjs, and again when a line changes.
//
// WHICH MODEL: Whisper base, word times from its cross-attention (the method both engines share). On an Apple Silicon
// Mac through MLX (mlx-audio, already in voice.mjs's venv), elsewhere through PyTorch on the CPU (venv-torch);
// `voice.mjs --setup words` downloads it and says its size (tiny was measured 50 ms worse, small no better).
// What the model hears is matched to the sentence the story says letter by letter, never trusted as the text: a name
// it misspells ("Acme" heard as "ACK me") still lands on its own word, and a word it missed gets a time between
// its neighbours'. The sentence says how much of its letters the model heard (coverage), and a step under 80 % is
// said: the recording is not the sentence.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MLX, python, runWords, WORD_MODELS } from './voice.mjs';
import { pcm, shown, stepName } from './narrate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const METHOD = 'letters+onsets-1'; // part of a step's key: the matching or the edges changed, so the words are made again
const LETTER = /[\p{L}\p{N}]/u;
const letters = (s) => [...String(s).normalize('NFC').toLowerCase()].filter((c) => LETTER.test(c)).join('');

/** The sentence's words, each with the second it starts and ends, from the words a model heard.
 *  known: the sentence as a string; heard: [{ w, t0, t1 }]. The two are matched letter by letter (the longest common
 *  run of letters, in order), so a word heard as two, two as one, or misspelt, still lands where it is said; a known
 *  word with no letter heard gets a time between its neighbours', in proportion to its letters.
 *  Returns { words: [{ w, t0, t1 }], coverage } (coverage: the share of the sentence's letters that were heard). */
export function alignWords(known, heard) {
  const words = String(known).split(/\s+/).filter((w) => letters(w));
  const k = words.map(letters), K = k.join('');
  // every heard letter gets a time: spread evenly over its word's own span
  const H = [], ht = [], hs = []; // hs: a letter that starts a heard word
  for (const h of heard) {
    const l = [...letters(h.w)];
    l.forEach((c, i) => { H.push(c); hs.push(i === 0); ht.push([h.t0 + ((h.t1 - h.t0) * i) / l.length, h.t0 + ((h.t1 - h.t0) * (i + 1)) / l.length]); });
  }
  // the longest common subsequence of the two letter strings, by dynamic programming (a sentence is a few hundred letters)
  // A letter that starts a word, matched to one that starts a heard word, counts a little more: of two equal runs of
  // letters, the one that keeps the words whole wins ("one three" heard for "one two three" must not lend two its t).
  const n = K.length, m = H.length, L = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  const ks = []; k.forEach((w) => [...w].forEach((_, o) => ks.push(o === 0)));
  const gain = (i, j) => 1 + (ks[i] && hs[j] ? 0.4 : 0);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = Math.max(L[i + 1][j], L[i][j + 1], K[i] === H[j] ? L[i + 1][j + 1] + gain(i, j) : 0);
  const at = new Array(n).fill(-1); // the heard letter each known letter is matched to; a match only where skipping the letter would lose (a tie goes to the later word)
  for (let i = 0, j = 0; i < n && j < m;) { if (K[i] === H[j] && L[i + 1][j] < L[i][j] - 1e-4 && L[i][j] - (L[i + 1][j + 1] + gain(i, j)) > -1e-4) { at[i++] = j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  const out = [];
  let pos = 0, matched = 0;
  words.forEach((w, wi) => {
    const own = at.slice(pos, pos + k[wi].length).map((j, o) => [o, j]).filter(([, j]) => j >= 0);
    pos += k[wi].length; matched += own.length;
    if (!own.length) { out.push({ w, t0: null, t1: null }); return; }
    const [o0, j0] = own[0], [o1, j1] = own[own.length - 1], per = (ht[j0][1] - ht[j0][0]) || 0;
    // the word starts where its first MATCHED letter does, less the unmatched letters before it at the pace heard there
    out.push({ w, t0: Math.max(0, ht[j0][0] - o0 * per), t1: ht[j1][1] + (k[wi].length - 1 - o1) * per });
  });
  // a word nothing was heard of: between the neighbours that were, by its share of the letters in the gap
  for (let i = 0; i < out.length; i++) {
    if (out[i].t0 !== null) continue;
    let a = i; while (out[a].t0 === null && a < out.length - 1) a++;
    const lo = i ? out[i - 1].t1 : 0, hi = out[a].t0 !== null ? out[a].t0 : (heard.length ? heard[heard.length - 1].t1 : lo);
    const gap = out.slice(i, out[a].t0 === null ? a + 1 : a), total = gap.reduce((s, g) => s + letters(g.w).length, 0);
    let t = lo;
    for (const g of gap) { const d = ((hi - lo) * letters(g.w).length) / total; g.t0 = t; g.t1 = t + d; t += d; }
    i += gap.length - 1;
  }
  // in order, never overlapping, and no word ends before it starts
  for (let i = 0; i < out.length; i++) {
    if (i && out[i].t0 < out[i - 1].t0) out[i].t0 = out[i - 1].t0;
    if (out[i].t1 < out[i].t0) out[i].t1 = out[i].t0;
  }
  const r = (x) => +x.toFixed(3);
  return { words: out.map((o) => ({ w: o.w, t0: r(o.t0), t1: r(o.t1) })), coverage: n ? matched / n : 1 };
}

/** Each word's edges pulled onto the sound itself. Whisper's times come from attention, 20 ms apart, and a word after a
 *  pause is started early, in the silence before it (measured: 260 to 360 ms early after a comma; a sentence's first
 *  word at 0). A word cannot start in silence: where the recording is quiet at the estimated start, the start moves
 *  to the first frame that is not, and the end to the last one that is. Quiet is under -40 dB from the recording's
 *  loud frames (its 95th percentile), over 5 ms frames. A start already in sound does not move.
 *  samples: Int16Array mono at `rate`; words: [{ w, t0, t1 }] in seconds. */
export function refine(words, samples, rate = 48000) {
  const F = Math.round(rate * 0.005), n = Math.floor(samples.length / F), db = new Float32Array(n);
  for (let i = 0; i < n; i++) { let e = 0; for (let j = i * F; j < (i + 1) * F; j++) e += samples[j] * samples[j]; db[i] = 10 * Math.log10(e / F / 32768 ** 2 + 1e-12); }
  const sorted = [...db].sort((a, b) => a - b), thr = (sorted[Math.floor(n * 0.95)] ?? 0) - 40, loud = (i) => i >= 0 && i < n && db[i] > thr;
  const r = (x) => +x.toFixed(3);
  return words.map((w, k) => {
    const a = Math.max(0, Math.floor((w.t0 * rate) / F)), b = Math.min(n - 1, Math.max(a, Math.ceil((w.t1 * rate) / F) - 1));
    let i = a; while (i <= b && !loud(i)) i++;          // the first frame in sound, from the estimated start on
    if (i > b) return w;                                // no sound in the whole span: leave it
    // a pause of 100 ms or more inside the span, with sound after it, is the breath before the word (the word before
    // it was given its tail): the word starts after the last such pause
    for (let q = i, run = 0; q <= b; q++) {
      if (loud(q)) { if (run >= 20) i = q; run = 0; } else run++;
    }
    let j = b; while (j > i && !loud(j)) j--;           // the last
    const t0 = Math.max((i * F) / rate, k ? words[k - 1].t0 : 0), t1 = Math.max(t0, ((j + 1) * F) / rate);
    return { w: w.w, t0: r(t0), t1: r(Math.min(t1, w.t1 + 0.1)) };
  });
}

/** The language Whisper is told: the story's `lang` ("it-IT" → "it"), else Kokoro's "mlx.lang", else it listens and decides. */
const langOf = (story) => { const l = String(story.lang || '').split(/[-_]/)[0].toLowerCase(); return /^[a-z]{2,3}$/.test(l) ? l : null; };

/** No model, no recording of a voice: the matching and the edges, on words and sound made up here. */
function selftest() {
  const heard = (s) => s.split(' ').map((w, i) => { const [a, b] = w.split('@'); return { w: a, t0: +b, t1: +b + 0.3 }; }), near = (a, b) => Math.abs(a - b) < 0.011;
  const RATE = 48000, burst = (from, to) => (i) => (i >= from * RATE && i < to * RATE ? 8000 * Math.sin(i * 0.3) : 0);
  const cases = [
    ['a word heard as two lands on its own: "Acme" heard as "ACK me"', () => { const a = alignWords('Open Acme now', heard('Open@0 ACK@0.5 me@0.7 now@1')); return a.words.length === 3 && near(a.words[1].t0, 0.5) && near(a.words[2].t0, 1); }],
    ['two heard as one: "the menu bar" heard as "themenu bar"', () => { const a = alignWords('the menu bar', heard('themenu@0 bar@0.6')); return a.words.length === 3 && near(a.words[0].t0, 0) && near(a.words[2].t0, 0.6); }],
    ['a word the model missed gets a time between its neighbours', () => { const a = alignWords('one two three', heard('one@0 three@1')); return a.words[1].t0 > a.words[0].t0 && a.words[1].t1 <= a.words[2].t0 + 1e-6 && a.coverage < 1; }],
    ['punctuation and case do not matter, and the words keep the story\'s spelling', () => { const a = alignWords('Hello, World!', heard('hello@0 world@0.5')); return a.words[0].w === 'Hello,' && near(a.words[1].t0, 0.5) && a.coverage === 1; }],
    ['accents: "è più" is matched', () => alignWords('è più veloce', heard('e@0 piu@0.2 veloce@0.5')).coverage > 0.7],
    ['a recording that says another sentence has a low coverage', () => alignWords('open the menu bar', heard('zzz@0 qqq@1')).coverage < 0.3],
    ['no words heard gives times for all, in order', () => { const a = alignWords('a b c', []); return a.words.length === 3 && a.words.every((w) => Number.isFinite(w.t0)); }],
    ['refine: a start in the silence before a word moves onto its sound', () => { const x = Int16Array.from({ length: 2 * RATE }, (_, i) => burst(0.5, 0.8)(i)), r = refine([{ w: 'a', t0: 0.2, t1: 0.9 }], x); return near(r[0].t0, 0.5) && near(r[0].t1, 0.8); }],
    ['refine: a start already in sound does not move', () => { const x = Int16Array.from({ length: 2 * RATE }, (_, i) => burst(0, 1)(i)), r = refine([{ w: 'a', t0: 0.3, t1: 0.9 }], x); return near(r[0].t0, 0.3); }],
    ['refine: a pause of 100 ms or more inside the span puts the start after it', () => { const x = Int16Array.from({ length: 2 * RATE }, (_, i) => burst(0, 0.5)(i) + burst(0.8, 1.2)(i)), r = refine([{ w: 'and', t0: 0.3, t1: 1.2 }], x); return near(r[0].t0, 0.8); }],
  ];
  let bad = 0;
  for (const [name, f] of cases) { const ok = f(); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`); }
  console.log(bad ? `\n${bad} failed` : '\nall passed');
  process.exitCode = bad ? 1 : 0;
}

function main() {
  if (process.argv[2] === '--selftest') return selftest();
  const argv = process.argv.slice(2), valued = ['--out', '--from'];
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const file = argv.find((a, i) => !a.startsWith('--') && !valued.includes(argv[i - 1]));
  const stop = (code, m) => { console.error(`words.mjs: ${m}`); process.exit(code); };
  if (!file) stop(2, 'usage: words.mjs story.json [--out <dir>] [--from <dir of recordings>]');
  const engine = MLX ? 'mlx' : 'torch', { repo } = WORD_MODELS[engine];
  const story = JSON.parse(readFileSync(resolve(file), 'utf8'));
  if (!Array.isArray(story.steps) || !story.steps.length) stop(2, 'the story has no steps');
  const out = resolve(arg('--out') || dirname(resolve(file)));
  const dir = arg('--from') ? resolve(arg('--from')) : story.mlx ? join(out, 'voice-mlx') : join(out, 'voice');
  if (!existsSync(dir)) stop(3, `${dir}: no recordings there. Tell the story first (voice.mjs ${file}, or narrate.mjs), or name them with --from.`);
  const py = python();
  if (!existsSync(py)) stop(3, `no Python for the speech-to-text model at ${py}.\n  Make it, once on each machine: node ${join(HERE, 'voice.mjs')} --setup words`);

  const indexFile = join(out, 'words.json'), cache = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : { steps: {} };
  const lang = langOf(story);
  const todo = [], steps = {};
  story.steps.forEach((s, i) => {
    if (!s.say) return;
    const name = stepName(s, i), rec = readdirSync(dir).find((f) => f.replace(/\.[^.]+$/, '') === name);
    if (!rec) stop(3, `${dir}: no recording named ${name}.* for "${s.say.slice(0, 50)}"`);
    const text = shown(s.say), key = createHash('sha1').update(readFileSync(join(dir, rec))).update(JSON.stringify([text, repo, lang, METHOD])).digest('hex');
    const had = cache.steps?.[name];
    if (had && had.key === key) steps[name] = had; else todo.push({ name, text, key, wav: join(dir, rec) });
  });
  if (todo.length) {
    const scratch = mkdtempSync(join(tmpdir(), 'film-words-'));
    try {
      // 16 kHz mono, what Whisper reads, made once here so both engines are given the same samples
      const lines = todo.map((t, i) => {
        const wav = join(scratch, `${i}.wav`), r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', t.wav, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { encoding: 'utf8' });
        if (r.status !== 0) stop(3, `ffmpeg cannot read ${t.wav}: ${r.stderr}`);
        t.dur = +((statSync(wav).size - 44) / 2 / 16000).toFixed(3); // the recording's seconds, which narrate.mjs checks the words against
        return { wav, lang, text: t.text };
      });
      const res = join(scratch, 'out.json'), err = runWords(py, { engine, model: repo, out: res, lines });
      if (err) stop(3, err);
      const heard = JSON.parse(readFileSync(res, 'utf8'));
      todo.forEach((t, i) => {
        const a = alignWords(t.text, heard[i].words);
        steps[t.name] = { key: t.key, say: t.text, dur: t.dur, heard: heard[i].text, coverage: +a.coverage.toFixed(3), words: refine(a.words, pcm(t.wav)) };
      });
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(indexFile, JSON.stringify({ model: repo, engine, steps }, null, 1) + '\n');
  for (const [name, s] of Object.entries(steps)) {
    console.log(`${name}: ${s.words.length} words, ${(s.coverage * 100).toFixed(0)} % of its letters heard${s.coverage < 0.8 ? `. WARNING: the model heard "${s.heard}": is this the sentence?` : ''}`);
    console.log(`  ${s.words.map((w) => `${w.w} ${w.t0.toFixed(2)}`).join('  ')}`);
  }
  console.log(`${todo.length} heard now, ${Object.keys(steps).length - todo.length} kept (${repo}, ${engine}) → ${indexFile}`);
  // narrate.mjs lays the words into narration.js: its recordings are the ones just heard
  const args = [join(HERE, 'narrate.mjs'), resolve(file), '--out', out, '--from', dir];
  const n = spawnSync(process.execPath, args, { stdio: 'inherit' });
  process.exit(n.status ?? 1);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
