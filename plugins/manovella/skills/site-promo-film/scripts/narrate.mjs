#!/usr/bin/env node
// narrate.mjs — a tutorial's story becomes a voice, a clock and subtitles.
//
//   node narrate.mjs story.json [--out <dir>] [--from <dir>] [--voice <name>] [--rate <n>]
//
// A tutorial is told before it is drawn: the story is a list of steps, each with the sentence that
// is said while it happens. This says them, measures how long each takes, and lays them end to end.
// The VOICE SETS THE CLOCK: the page reads the times back (narration.js) and gives each scene the
// length of its sentence, so a line rewritten is a film retimed, with nothing to adjust by hand.
//
//   story.json  { "title": "…", "lang": "it-IT", "voice": "Alice", "rate": 175,
//                 "lead": 0.6, "gap": 0.5, "tail": 0.8,
//                 "steps": [ { "id": "open", "chapter": "Open it",          a chapter mark starts here
//                              "say": "Open Acme from the menu bar.",      what is said
//                              "caption": "…",                               what is written, when not the same
//                              "hold": 1.2 },                                seconds after the sentence (else gap)
//                            { "id": "wait", "silence": 2.5, "caption": "…" } ] }   a step nobody speaks over
//              "human": "natural"   the pauses of a person (below); "clean", the default, keeps them even
//
// It writes, into --out (default: the story's folder):
//   voice/NN-<id>.aiff    one file a step, kept: a step whose sentence, voice and rate did not change
//                         is not said again (voice/index.json holds what each file was made from)
//   narration.wav         all of it on one clock, 48 kHz mono: AUDIO=narration.wav for render.mjs
//   narration.js          window.NARRATION = { duration, steps: [{ id, t, dur, end, say, chapter, cues }], cues }
//                         for the page: scene i starts at steps[i].t and lasts steps[i].end - steps[i].t;
//                         FILM.captions(ctx, t, NARRATION.cues) draws the subtitle of the moment
//   captions.srt, .vtt    the same subtitles as files, for YouTube and for a player's own track
//
// The voice is the Mac's (`say`), or yours. --from <dir> takes one recording a step instead, named
// like the files above with any extension ffmpeg reads (01-open.wav, 01-open.m4a): a person's voice,
// or another synthesizer's. Everything after the audio is the same. A voice model that runs on this
// Mac is the third way, and closer to a person than `say`: a story with "mlx" is told by voice.mjs,
// which makes those recordings and calls this with --from. Without --from such a story stops here,
// rather than being said by `say` with nothing to tell the two apart.
//
// Measured on macOS 27 with `say`: the same sentence, voice and rate give the same
// file to the byte, twice out of twice on six lines, so a tutorial renders the same on every run.
// Its files peak at 0 dBTP, so they are laid down 3 dB lower; render.mjs brings the track to its
// loudness after.
//
// The voice, and what makes it better (same day, in English):
// - WHICH ONE is most of it. The voices every Mac has are compact ones, 22 kHz (Samantha, Daniel,
//   Karen), and the Eloquence ones (Eddy, Flo, Reed) are 16 kHz. Better ones are a free download, once
//   on EACH Mac: System Settings, Accessibility, Read & Speak (macOS 27; Spoken Content on older
//   ones; in Italian, Lettura e voce), System voice, Manage Voices. They are
//   then named with their tier ("Zoe (Premium)", "Kate (Enhanced)") and used by that name. A story
//   that names a voice this Mac does not have stops here and says so, rather than being told by
//   whatever voice is the default: a film made on a second Mac would otherwise change its voice.
// - `say` writes 22 kHz unless asked, whatever the voice. A voice that is 48 kHz inside (Tara, Aman)
//   lost everything above 11 kHz that way: 12 to 16 kHz measured -52 dB when asked for 48 kHz and
//   -79 dB (nothing) in the default file. It is asked for 48 kHz here; a 22 kHz voice is not changed.
// - --rate is `say`'s own number, NOT the pace you get: at 175, Samantha and Kate (Enhanced) say 185
//   words a minute and Tara 211; at 130, Kate says 162. It moves in steps, too (Samantha at 120 and
//   at 140 is the same file). The pace that was reached is printed, per step and overall: a lesson
//   is comfortable around 150 to 170 words a minute.
// - A pause is written into the sentence, `[[slnc 280]]` for 280 ms, like every command `say` reads
//   in double brackets (`[[emph +]]`, `[[rate 150]]`). Commands are said to the voice only: they are
//   taken out of the subtitles and of narration.js.
// - A SOUND a voice model can make is written in single brackets where it is made: "[chuckle] that's
//   it." (TAGS: chuckle, laugh, sigh, gasp, cough, groan, sniff, clear throat, shush, yawn; voice.mjs
//   gives each model its own spelling, and drops the ones it cannot make). They are taken out of the
//   subtitles and of narration.js too, and out of what `say` is given: a Mac voice would read them.
// - "human": "natural" (or "expressive", voice.mjs's word for a story that keeps its sounds) varies
//   the pause after each sentence by up to a fifth either way, the same on every run: a person does
//   not leave the same gap after every line. A step's own "hold" is never varied: it was asked for.
//
// Subtitles: a cue is at most two lines of 42 characters, breaks after punctuation where it can, and
// takes the share of its sentence's time that its letters are of the sentence. A cue read faster than
// 20 characters a second, or shown for less than a second, is said: the sentence is too dense to read.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 48000, HEADROOM = 10 ** (-3 / 20);
const LINE = 42; // characters a line: what a subtitle holds at a size that reads on a phone
/** The sounds a voice model makes where the story writes them ([chuckle]): Chatterbox Turbo's set and
 *  Orpheus's yawn. voice.mjs gives each model its own spelling; ALIAS is another spelling of one. */
export const TAGS = ['chuckle', 'laugh', 'sigh', 'gasp', 'cough', 'groan', 'sniff', 'clear throat', 'shush', 'yawn'];
export const ALIAS = { sniffle: 'sniff' };
const NAMES = [...TAGS, ...Object.keys(ALIAS)].join('|'), TAG = `[\\[<](?:${NAMES})[\\]>]`;
/** A sound as written in a story, its name captured. */
export const TAG_RE = new RegExp(`[\\[<](${NAMES})[\\]>]`, 'gi');
// Only where a command or a sound stood is the spacing touched: the rest is the writer's (French sets a space before ! and ?).
const cut = (re) => (text) => String(text || '').replace(re, (m, at, all) => (at === 0 || /^[.,;:!?…]/.test(all.slice(at + m.length)) ? '' : ' ')).trim();
/** A sentence without the commands `say` reads in double brackets, or the sounds a model makes: what is shown, and what is counted. */
export const shown = cut(new RegExp(`\\s*(?:\\[\\[[^\\]]*\\]\\]|${TAG})\\s*`, 'gi'));
/** A sentence without the sounds, its [[commands]] kept: what `say` is given. */
export const untagged = cut(new RegExp(`\\s*${TAG}\\s*`, 'gi'));
/** A number in [0, 1) from a key, the same on every run (FNV-1a, then mixed: keys a letter apart land far
 *  apart): what a "human" story varies by. */
export function unit(key) {
  let h = 2166136261;
  for (const c of String(key)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** The pause after step i, as a share of the story's gap: 1, or with "human" between 0.8 and 1.2, the same on every run. */
export const humanGap = (story, i) => (!story.human || story.human === 'clean' ? 1 : 0.8 + 0.4 * unit(`gap:${i}`));

/** The name of step i's recording, without its extension: what --from looks for, and what voice.mjs writes. */
export const stepName = (s, i) => `${String(i + 1).padStart(2, '0')}-${String(s.id || `step-${i + 1}`).replace(/[^a-z0-9-]+/gi, '-')}`;

/** A sentence as cues [{ t0, t1, lines }] over [t0, t1], each at most two lines of LINE characters. */
export function cuesOf(text, t0, t1, { line = LINE, linger = 0.25 } = {}) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  // As few cues as hold the sentence, and of even length: filling each to the brim left the last two
  // words alone on screen for under a second ("e perché."). A cue ends at a breath when one is near.
  const max = line * 2 - 4, all = words.join(' ').length, n = Math.ceil(all / max), target = all / n, chunks = [];
  const breath = /[.,;:!?…]$/;
  // from word i on, is there a breath the cue could still reach without overflowing? Then it waits for it:
  // "…the first commit with / Acme, without ever…" left a preposition hanging at the end of a cue
  const reaches = (cur, i) => { let s = cur; for (let j = i; j < words.length; j++) { s += ` ${words[j]}`; if (s.length > max) return false; if (breath.test(words[j])) return true; } return false; };
  let cur = '';
  words.forEach((w, i) => {
    const next = cur ? `${cur} ${w}` : w, more = chunks.length < n - 1;
    const here = cur && more && cur.length >= target * 0.7 && (breath.test(cur) || (next.length > target * 1.1 && !reaches(cur, i)));
    if (cur && (next.length > max || here)) { chunks.push(cur); cur = w; } else cur = next;
  });
  if (cur) chunks.push(cur);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  let at = t0;
  return chunks.map((c, i) => {
    const end = i === chunks.length - 1 ? t1 + linger : at + ((t1 - t0) * c.length) / total;
    const cue = { t0: +at.toFixed(3), t1: +end.toFixed(3), lines: twoLines(c, line) };
    at = end;
    return cue;
  });
}
function twoLines(s, line) { // one line when it fits, else broken at the space that leaves the longer half shortest
  if (s.length <= line) return [s];
  let best = -1, len = Infinity;
  for (let i = s.indexOf(' '); i >= 0; i = s.indexOf(' ', i + 1)) { const m = Math.max(i, s.length - i - 1); if (m < len) { best = i; len = m; } }
  return best < 0 ? [s] : [s.slice(0, best), s.slice(best + 1)];
}

/** The story on one clock, from each step's measured seconds of voice (0 for a silent step). */
export function plan(story, seconds) {
  const lead = story.lead ?? 0.6, gap = story.gap ?? 0.5, tail = story.tail ?? 0.8;
  let t = lead;
  const steps = story.steps.map((s, i) => {
    const dur = s.say ? seconds[i] : s.silence ?? 0, after = s.hold ?? gap * humanGap(story, i);
    const end = t + dur + after;
    const text = shown(s.caption ?? s.say);
    const cues = cuesOf(text, t, t + dur, { linger: Math.min(0.25, after * 0.5) });
    const step = { id: s.id || `step-${i + 1}`, t: +t.toFixed(3), dur: +dur.toFixed(3), end: +end.toFixed(3), say: shown(s.say) || null, ...(s.chapter ? { chapter: s.chapter } : {}), cues };
    t = end;
    return step;
  });
  // the film ends `tail` after the last word (or after the last step's own hold, when that is longer)
  const last = steps[steps.length - 1], held = story.steps[story.steps.length - 1].hold ?? 0;
  last.end = +(last.t + last.dur + Math.max(held, tail)).toFixed(3);
  return { title: story.title || null, lang: story.lang || null, duration: last.end, steps, cues: steps.flatMap((s) => s.cues) };
}

const stamp = (s, sep) => { const ms = Math.round(s * 1000), p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`; };
export const srt = (cues) => cues.map((c, i) => `${i + 1}\n${stamp(c.t0, ',')} --> ${stamp(c.t1, ',')}\n${c.lines.join('\n')}\n`).join('\n');
// WebVTT reads < > and & as markup: "Run git clone <repository-url>" lost its placeholder in a player, while the
// subtitle drawn on the frame kept it. Its cue text is escaped; SubRip has no escape, and is written as it is.
const vttText = (l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const vtt = (cues) => `WEBVTT\n\n${cues.map((c) => `${stamp(c.t0, '.')} --> ${stamp(c.t1, '.')}\n${c.lines.map(vttText).join('\n')}\n`).join('\n')}`;

/** What is hard to read: [{ cue, why }]. */
export function dense(cues) {
  return cues.flatMap((c) => {
    const chars = c.lines.join(' ').length, secs = c.t1 - c.t0, why = [];
    if (secs < 1) why.push(`on screen ${secs.toFixed(2)} s`);
    if (chars / secs > 20) why.push(`${(chars / secs).toFixed(0)} characters a second`);
    return why.length ? [{ cue: c, why: why.join(', ') }] : [];
  });
}

/** Any audio ffmpeg reads → Int16Array at RATE, `ch` channels interleaved; `extra` goes before -i (a -ss, a -t). */
export function pcm(file, ch = 1, extra = []) {
  const b = execFileSync('ffmpeg', ['-v', 'error', ...extra, '-i', file, '-f', 's16le', '-ac', String(ch), '-ar', String(RATE), '-'], { maxBuffer: 2 ** 31 });
  return new Int16Array(b.buffer, b.byteOffset, b.length >> 1);
}
/** Int16 samples at RATE, `ch` channels interleaved → a WAV file's bytes. */
export function wav(samples, ch = 1) {
  const h = Buffer.alloc(44), n = samples.length * 2;
  h.write('RIFF', 0); h.writeUInt32LE(36 + n, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2 * ch, 28); h.writeUInt16LE(2 * ch, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(n, 40);
  return Buffer.concat([h, Buffer.from(samples.buffer, samples.byteOffset, n)]);
}

function main() {
  const argv = process.argv.slice(2), valued = ['--out', '--from', '--voice', '--rate'];
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const file = argv.find((a, i) => !a.startsWith('--') && !valued.includes(argv[i - 1]));
  if (!file) { console.error('usage: narrate.mjs story.json [--out <dir>] [--from <dir of recordings>] [--voice <name>] [--rate <the rate given to say: 175 is its own, lower is slower>]'); process.exit(2); }
  const story = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(story.steps) || !story.steps.length) throw new Error('the story has no steps');
  const out = resolve(arg('--out') || dirname(file)), from = arg('--from') && resolve(arg('--from'));
  const voice = arg('--voice') || story.voice || null, rate = Number(arg('--rate') || story.rate || 175);
  if (story.mlx && !from) {
    console.error(`narrate.mjs: this story is told by a voice model ("mlx": ${JSON.stringify(story.mlx.model ?? null)}), not by \`say\`.\n  Tell it with: node ${join(dirname(fileURLToPath(import.meta.url)), 'voice.mjs')} ${file}`);
    process.exit(3);
  }
  if (!from && process.platform !== 'darwin') { // `say` is the Mac's: elsewhere a voice model, or recordings
    console.error('narrate.mjs: a story told by `say` needs macOS. Here, tell it with a voice model ("mlx" in story.json, then\n'
      + `  node ${join(dirname(fileURLToPath(import.meta.url)), 'voice.mjs')} ${file}), or bring recordings with --from.`);
    process.exit(3);
  }
  if (voice && !from) {
    // A voice this Mac does not have: `say -v` does not fail on one, it speaks with the default voice
    // and exits 0 (macOS 27), so the story would be told by another voice and nothing would say so.
    // A name is taken as `say` takes it: as listed, or without what follows it in brackets
    // ("Kate" is "Kate (Enhanced)", "Samantha" is "Samantha (English (US))").
    const bare = (n) => n.replace(/\s*\(.*$/, '');
    const have = execFileSync('say', ['-v', '?'], { encoding: 'utf8' }).split('\n').map((l) => (l.match(/^(.+?)\s+[a-z]{2,3}_[A-Z0-9]{2,4}\s+#/) || [])[1]).filter(Boolean);
    if (!have.includes(voice) && !have.some((h) => bare(h) === voice)) {
      const near = have.filter((h) => bare(h) === bare(voice));
      console.error(`narrate.mjs: the voice "${voice}" is not on this Mac.${near.length ? ` It has ${near.map((h) => `"${h}"`).join(', ')}.` : ''}\n`
        + '  Download it once on each Mac that tells this story: System Settings › Accessibility › Read & Speak (Spoken Content on older macOS) › System voice › Manage Voices…\n'
        + '  or name another with --voice (say -v \'?\' lists them), or bring recordings with --from.');
      process.exit(3);
    }
  }
  const dir = join(out, 'voice'); mkdirSync(dir, { recursive: true });
  const indexFile = join(dir, 'index.json'), index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {};

  const clips = story.steps.map((s, i) => {
    if (!s.say) return null;
    const base = stepName(s, i);
    if (from) { // your recording of this step
      const hit = readdirSync(from).find((f) => f.replace(/\.[^.]+$/, '') === base);
      if (!hit) throw new Error(`--from ${from}: no recording named ${base}.* for "${s.say.slice(0, 50)}"`);
      return pcm(join(from, hit));
    }
    const made = createHash('sha1').update(JSON.stringify([s.say, voice, rate, RATE])).digest('hex'), f = join(dir, `${base}.aiff`);
    if (index[base] !== made || !existsSync(f)) { // said only when the sentence, the voice or the pace changed
      // at RATE, asked for: `say` writes 22 kHz by default, which halves a voice that is 48 kHz inside
      execFileSync('say', [...(voice ? ['-v', voice] : []), '-r', String(rate), '--file-format=AIFF', `--data-format=BEI16@${RATE}`, '-o', f, untagged(s.say)]);
      index[base] = made;
    }
    return pcm(f);
  });
  if (!from) writeFileSync(indexFile, JSON.stringify(index, null, 1) + '\n');

  const N = plan(story, clips.map((c) => (c ? c.length / RATE : 0)));
  const track = new Int16Array(Math.ceil(N.duration * RATE));
  clips.forEach((c, i) => {
    if (!c) return;
    const at = Math.round(N.steps[i].t * RATE);
    for (let j = 0; j < c.length && at + j < track.length; j++) track[at + j] = Math.round(c[j] * HEADROOM);
  });
  writeFileSync(join(out, 'narration.wav'), wav(track));
  writeFileSync(join(out, 'narration.js'), `// made by narrate.mjs from ${file.split('/').pop()}: run it again rather than editing this\nwindow.NARRATION = ${JSON.stringify(N, null, 1)};\n`);
  writeFileSync(join(out, 'captions.srt'), srt(N.cues));
  writeFileSync(join(out, 'captions.vtt'), vtt(N.cues));

  const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  for (const [i, s] of N.steps.entries()) {
    const words = (s.say || '').split(/\s+/).filter(Boolean).length;
    console.log(`${clock(s.t).padStart(7)}  ${s.dur.toFixed(2).padStart(5)} s  ${s.say ? `${Math.round((words / s.dur) * 60)} wpm`.padStart(7) : ' silent'}  ${s.chapter ? `[${s.chapter}] ` : ''}${(s.say || story.steps[i].caption || '').slice(0, 70)}`);
  }
  const spoken = N.steps.reduce((n, s) => n + (s.say ? s.dur : 0), 0), words = N.steps.reduce((n, s) => n + (s.say || '').split(/\s+/).filter(Boolean).length, 0);
  const pace = spoken ? Math.round((words / spoken) * 60) : 0;
  console.log(`${clock(N.duration)} in all: ${N.steps.length} steps, ${spoken.toFixed(1)} s spoken at ${pace} words a minute, ${N.cues.length} subtitles${from ? `, from the recordings in ${from}` : voice ? `, voice ${voice} at rate ${rate}` : `, the Mac's default voice at rate ${rate}`}`);
  if (pace > 185 && (!from || story.mlx)) console.log(`brisk for a lesson (${pace} words a minute; 150 to 170 is comfortable): ${story.mlx ? 'a lower "tempo" in the story\'s "mlx" (0.85 at the least), or a comma where a breath belongs' : 'a lower --rate, or pauses ([[slnc 280]]) between sentences'}`);
  for (const d of dense(N.cues)) console.log(`hard to read (${d.why}): ${d.cue.lines.join(' / ')}`);
  console.log(`→ ${join(out, 'narration.wav')}, narration.js, captions.srt, captions.vtt`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
