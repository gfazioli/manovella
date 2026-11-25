#!/usr/bin/env node
// voice.mjs — a story told by a voice model that runs on this Mac, instead of the Mac's own voice.
//
//   node voice.mjs story.json [--out <dir>] [--audition <takes>] [--recordings]
//   node voice.mjs --setup [chatterbox] [orpheus] [kokoro] [<Hugging Face repo> …]     once on each Mac
//
// `say`'s best voices read fluently and still sound read. A local model sounds closer to a person,
// costs nothing, needs no account and works offline once it is downloaded. This says each step's
// sentence with one (voice-mlx.py, through mlx-audio), trims the silence round it, paces it and
// levels it, into <out>/voice-mlx/NN-<id>.wav; then narrate.mjs takes those recordings (--from) and
// does the rest as it always did: the clock, narration.wav, narration.js, the subtitles. A story
// that has "mlx" is told with this, never with narrate.mjs alone (which stops and says so).
// --recordings stops after the recordings, for a film that lays its lines on beats of its own.
//
//   story.json  "mlx": { "model": "chatterbox", "voice": null, "tempo": 0.88, "level": -18, "seed": 1000,
//                        "tone": "warm" }
//               "human": "natural" beside "mlx" (narrate.mjs's word too)
//                        and, for Kokoro, "lang": "it" (else the voice's first letter says it: below)
//               a step may carry "seed" (its take); the model is given its "say", without `say`'s
//               [[commands]], with the sounds it can make ([chuckle]: narrate.mjs, TAGS)
//
// - WHICH MODEL. Three were chosen by ear. Chatterbox and Orpheus were tried in US English only, and
//   in another language the Mac's voice or a recording stays the way; Kokoro was heard in US English
//   (af_heart, af_bella, am_michael) and in Italian (if_sara), and in no other language:
//     "chatterbox"  mlx-community/chatterbox-turbo-fp16 (3 GB, MIT). One voice, even and calm: a
//                   lesson. Under a second a line, and takes of nearly the same length. Its audio
//                   carries its maker's inaudible watermark.
//     "orpheus"     mlx-community/orpheus-3b-0.1-ft-8bit (3.5 GB, Apache 2.0), in its voice "leah"
//                   unless "voice" names another (tara and others exist; tara's takes varied by a
//                   third in length). Warmer, more inflection: a promo. About five seconds a line.
//     "kokoro"      mlx-community/Kokoro-82M-bf16 (330 MB, Apache 2.0), in its voice "af_heart" unless
//                   "voice" names another (af_bella, am_michael, if_sara: the ones heard). About ten
//                   times smaller than the others and quick (a line in about a second once loaded): a
//                   draft, or a film in Italian. It has no sampling temperature, so TONES does not apply
//                   to it (a tone is accepted, changes nothing and is said to); "tempo" paces it as it
//                   does the others. SEEDS: a seed changes only its noise
//                   (the same line at two seeds came out 4.80 s at both: no spread of lengths to hold the
//                   film's clock to, as Orpheus's Tara had), and the same seed is the same take to within
//                   one 16-bit step, not to the byte (the GPU rounds differently from run to run, so no
//                   --setup hash can tell two Macs apart, and none is recorded for it).
//                   Its text needs more than mlx-audio: `--setup kokoro` also installs misaki, spaCy, an
//                   English text model and the espeak-ng library (wheels pinned in
//                   voice-constraints-kokoro.txt, about 160 MB, nothing from Homebrew), which a Python
//                   made before it lacks until that is run.
//                   THE LANGUAGE is a code Kokoro needs beside the voice (voice-mlx.py passes it as
//                   lang_code): derived from the voice's first letter, Kokoro's own naming (a American
//                   English, b British, e Spanish, f French, h Hindi, i Italian, p Brazilian
//                   Portuguese, j Japanese, z Mandarin), or set outright with "lang" in "mlx" ("it" or
//                   "i"). Only a and i were heard. A line in a language espeak speaks (any but a, b, j,
//                   z) is cut at its sentences when longer than 250 characters, as mlx-audio does not
//                   chunk it and a long one comes out truncated.
//   Any other mlx-audio text-to-speech model is named by its Hugging Face repo.
// - A TAKE IS A SEED: the same model, voice, text and seed give the same audio again on the same Mac
//   and mlx-audio version. The model reads a line a little differently at every seed, so the take
//   the owner heard is the one written in the story; a new seed is a new take, heard before it is
//   kept. --audition N says each step at N seeds from its own on, paced, into voice-mlx/audition
//   (NN-<id>.seed-<seed>.wav, to be listened to; the folder holds the last audition only), prints
//   how long each came out and changes nothing else: who cannot listen picks the take of median
//   length, and says so. Nobody but a person hears whether a name came out right: the draft is
//   listened to.
// - ANOTHER MAC is another setup, and maybe another take. The Python and the models are per Mac
//   (--setup, below); the recordings are not in a repository unless the film's kit puts them there.
//   --setup says a fixed line with each model it is given, prints the SHA-256 of what came out and
//   says whether it is the one recorded here, from the reference Mac (below: an M5 Pro): the same means a
//   seed is the same take on both, and a film approved on one can be said again on the other.
//   Different means it cannot: keep the approved recordings (<out>/voice-mlx) with the film, or
//   have the new takes heard.
// - `tempo` paces the voice (1 as said, 0.85 to 1.15, pitch kept: beyond that it stops sounding like
//   the same person). The models have no speed of their own; about 190 words a minute is theirs, and
//   0.88 gave a lesson's 170. The pace and the level are worked on the recording the model left
//   (voice-mlx/raw): another tempo or level does not say a line again.
// - `level` is the mean each line is brought to: -18 dB is the mean `say` has, so music sits under
//   either alike (the models speak about 6 dB quieter). Their lines peak higher over their mean than
//   `say`'s, and by different amounts: held under -1 dB by gain alone they came out from -18 to
//   -22.4 dB, one sentence quieter than the next. So the gain goes all the way to `level` and a
//   limiter, at the film's sample rate, holds the peaks at -1 dB.
// - The model's text is plain: a pause is punctuation, not [[slnc 250]] (taken out before the model
//   sees it). A name the model would misread is written as it is said in "say" (two words for a
//   CamelCase brand) and as it is spelled in the step's "caption".
// - TONE is how freely the model reads a line, its sampling temperature: "calm" steadier, "warm" the
//   model's own (the default, and every take recorded before tones existed), "bright" livelier
//   (TONES: Chatterbox 0.6 / 0.8 / 0.95, Orpheus 0.5 / 0.6 / 0.72; "temperature" in "mlx" names one
//   outright). A tone is part of the take: the same seed at another tone is another reading, heard
//   before it is kept. Nothing here judges one by ear: the Studio says a sample line at each.
// - SOUNDS: a step's "say" may make one where it is written, in Chatterbox's spelling ([chuckle],
//   [laugh], [sigh], [gasp], [cough], [groan], [sniff], [clear throat], [shush]). Orpheus is given its
//   own (<chuckle>, <sniffle> for [sniff]…), and a sound a model cannot make is left out and said.
//   "human" decides whether they are made at all: "expressive" (or none given) keeps them, "natural"
//   and "clean" read the line plain.
// - HUMAN: with "natural" or "expressive", each line is paced a little apart from the next (within 3 %
//   of "tempo", the same on every run): a person does not say every sentence at one speed; narrate.mjs
//   then varies the pauses between them. "clean", or none, keeps one pace and one pause.
// - WHERE THE PYTHON IS: $VOICE_PYTHON when set, else ~/.local/share/film-voice/venv, which --setup
//   makes: a Python 3.13 venv with mlx-audio at the version below and everything under it at the
//   versions of voice-constraints.txt (an Apple Silicon Mac; `brew install python@3.13` when there
//   is none; 600 MB). A model named after --setup is downloaded then (else
//   at the first story that uses it) into ~/.cache/huggingface. Without the Python, a line that
//   needs saying stops this (exit 3) and names the command: it never falls back to another voice.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shown, stepName, TAGS, ALIAS, TAG_RE, unit } from './narrate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), RATE = 48000;
const MLX_AUDIO = '0.6.5';   // the version the takes below, and every seed in a story, were said with
const VENV = join(homedir(), '.local', 'share', 'film-voice', 'venv');
// The engine the models run on: MLX on an Apple Silicon Mac (venv); elsewhere PyTorch (voice-torch.py), on the
// CPU or a CUDA GPU when torch finds one: Kokoro in venv-torch, Chatterbox and Orpheus in venv-large.
export const MLX = process.env.VOICE_ENGINE ? process.env.VOICE_ENGINE === 'mlx' : process.platform === 'darwin' && process.arch === 'arm64'; // VOICE_ENGINE=torch: a Mac tries the other path (a test)
const TORCH_PYTHON = ['3.12'];   // kokoro 0.9.4 takes 3.10 to 3.12, and the pins (numpy 2.5, networkx 3.7) 3.12 alone
const TORCH_INDEX = 'https://download.pytorch.org/whl/cpu';
// Kokoro's weights as PyTorch reads them (voice-torch.py), beside MLX's bf16 conversion in MODELS
export const KOKORO_TORCH = 'hexgrad/Kokoro-82M';
// Each model's weights for PyTorch, by its MLX name: Chatterbox Turbo's own, and Orpheus's as Canopy Labs
// published them (Apache 2.0) in a copy that asks for no login. They take a venv of their own,
// venv-large, at chatterbox-tts's versions (its torch, its transformers), apart from Kokoro's light one.
export const TORCH_REPO = { 'mlx-community/Kokoro-82M-bf16': KOKORO_TORCH, 'mlx-community/chatterbox-turbo-fp16': 'ResembleAI/chatterbox-turbo', 'mlx-community/orpheus-3b-0.1-ft-8bit': 'unsloth/orpheus-3b-0.1-ft' };
const VENV_LARGE = join(homedir(), '.local', 'share', 'film-voice', 'venv-large');
// Kokoro's light PyTorch venv, apart from MLX's (venv): a Mac trying VOICE_ENGINE=torch leaves MLX's alone
const VENV_TORCH = join(homedir(), '.local', 'share', 'film-voice', 'venv-torch');
const CHATTERBOX_TTS = '0.1.7';
const TORCH_SIZE = { 'mlx-community/chatterbox-turbo-fp16': '4 GB', 'mlx-community/orpheus-3b-0.1-ft-8bit': '6.6 GB' }; // their PyTorch weights, measured
const TORCH_CUDA_INDEX = 'https://download.pytorch.org/whl/cu124';   // torch 2.6.0 (chatterbox-tts's) for CUDA 12.4 and later drivers
// The most a model may write for one line, in its tokens (voice-mlx.py says why): about 48 s of
// Orpheus. Part of a recording's key: a line said under another ceiling is said again.
const CEILING = 4000;
// What the Studio reads too (it imports this file: main() runs only when it is the command)
export const MODELS = { chatterbox: 'mlx-community/chatterbox-turbo-fp16', orpheus: 'mlx-community/orpheus-3b-0.1-ft-8bit', kokoro: 'mlx-community/Kokoro-82M-bf16' };
// What --setup says to compare two Macs: the line, the seed, and the SHA-256 of the WAV the model
// left on the reference Mac (an M5 Pro, macOS 27.2, Python 3.13, mlx-audio 0.6.5).
const PROBE = { text: 'The same words, the same take.', seed: 1000 };
const KNOWN = {
  'mlx-community/chatterbox-turbo-fp16': { voice: null, size: '3 GB', sha256: '49296b111c86534847a352e60d6840088a6ea647ce5244e96b3f710a48d4b0e1' },
  'mlx-community/orpheus-3b-0.1-ft-8bit': { voice: 'leah', size: '3.5 GB', sha256: '0ccd19e0bafc2898317b83995f91bf4894022c0c8d9790e58bcb1894b605f09a' },
  'mlx-community/Kokoro-82M-bf16': { voice: 'af_heart', size: '330 MB', note: 'no hash to compare: Kokoro\'s takes differ by one 16-bit step from run to run on one Mac (its length does not: 2.25 s). Hear it.' },
};
// What Kokoro adds to the Python (see voice-constraints-kokoro.txt): the wheels it pins, and the English
// text model, which no index serves and so comes from its release, at the version those pins were heard with.
const SPACY_MODEL = 'https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl';
const KOKORO = MODELS.kokoro;
const modelOf = (name) => MODELS[name] || name;
// How freely each model reads, per tone (its sampling temperature); null is the model's own default.
// Kokoro is not here: its generate takes no temperature.
export const TONES = {
  calm: { 'mlx-community/chatterbox-turbo-fp16': 0.6, 'mlx-community/orpheus-3b-0.1-ft-8bit': 0.5 },
  warm: null,
  bright: { 'mlx-community/chatterbox-turbo-fp16': 0.95, 'mlx-community/orpheus-3b-0.1-ft-8bit': 0.72 },
};
// The sounds each model makes, in its own spelling. The story writes Chatterbox's ([sniff]); Orpheus
// was trained on <sniffle> and has no [clear throat] or [shush].
const SOUNDS = {
  'mlx-community/chatterbox-turbo-fp16': Object.fromEntries(TAGS.filter((t) => t !== 'yawn').map((t) => [t, `[${t}]`])),
  'mlx-community/orpheus-3b-0.1-ft-8bit': { chuckle: '<chuckle>', laugh: '<laugh>', sigh: '<sigh>', gasp: '<gasp>', cough: '<cough>', groan: '<groan>', sniff: '<sniffle>', yawn: '<yawn>' },
};
/** A step's line as `model` is given it: no [[commands]], its sounds in the model's spelling (or none). */
function forModel(text, model, keep) {
  const own = keep ? SOUNDS[model] || {} : {}, lost = new Set();
  // a sound kept is hidden from shown() behind private-use marks, which it does not know
  const marked = String(text || '').replace(new RegExp(TAG_RE), (m, name) => {
    const k = ALIAS[name.toLowerCase()] || name.toLowerCase();
    if (own[k]) return `\uE000${k}\uE001`;
    if (keep) lost.add(k);
    return m;
  });
  return { text: shown(marked).replace(/\uE000([^\uE001]+)\uE001/g, (m, k) => own[k]), lost: [...lost] };
}
/** A line's own pace: the story's tempo, or with "human" within 3 % of it, the same for the same step on every run. */
const humanTempo = (tempo, human, name) => (!human || human === 'clean' ? tempo : Math.min(1.15, Math.max(0.85, +(tempo * (1 + 0.03 * (2 * unit(name) - 1))).toFixed(4))));
/** The Python that runs the models: $VOICE_PYTHON, or the one --setup makes. */
const venvPython = (venv) => join(venv, ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
/** The Python that says `model` (an MLX name; none: Kokoro's, the light one): $VOICE_PYTHON, or the one --setup makes. */
export const python = (model) => process.env.VOICE_PYTHON || venvPython(MLX ? VENV : model && model !== KOKORO ? VENV_LARGE : VENV_TORCH);
/** Whether that Python has what Kokoro's text needs (`--setup kokoro` installs it): misaki and the espeak-ng loader, looked for in its site-packages. */
export const hasKokoroPackages = () => {
  const root = dirname(dirname(python())), lib = join(root, 'lib');
  const sites = [join(root, 'Lib', 'site-packages')]; // Windows' venv; elsewhere lib/python3.x/site-packages
  try { sites.push(...readdirSync(lib).filter((d) => /^python3/.test(d)).map((d) => join(lib, d, 'site-packages'))); } catch { /* none */ }
  const needs = ['misaki', 'espeakng_loader', ...(MLX ? [] : ['kokoro'])];
  return sites.some((site) => needs.every((p) => existsSync(join(site, p))));
};

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const seconds = (f) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim());
const stop = (code, message) => { console.error(`voice.mjs: ${message}`); process.exit(code); };

/** Says `lines` [{ out, text, seed }] with `model` (and its `voice`, at `temperature` when not null, in `lang` when named), one WAV each. */
function say(model, voice, lines, scratch, temperature = null, lang = null) {
  const py = python(model), short = Object.keys(MODELS).find((k) => MODELS[k] === model) || model;
  if (!existsSync(py)) stop(3, MLX ? `no Python with mlx-audio at ${py}.\n  Make it, once on each Mac: node ${join(HERE, 'voice.mjs')} --setup\n  (or point VOICE_PYTHON at one). Not using another voice.`
    : `no Python for ${short} at ${py}.\n  Make it, once on each machine: node ${join(HERE, 'voice.mjs')} --setup ${short}\n  (or point VOICE_PYTHON at one). Not using another voice.`);
  const spec = join(scratch, 'lines.json');
  writeFileSync(spec, JSON.stringify({ model: MLX ? model : TORCH_REPO[model] || model, voice: voice ?? null, max_tokens: CEILING, temperature, lang, lines }));
  const r = spawnSync(py, [join(HERE, MLX ? 'voice-mlx.py' : 'voice-torch.py'), spec], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  rmSync(spec, { force: true });
  if (r.status !== 0) stop(3, `the voice model did not run (${model}).\n${String(r.stderr || r.error?.message || '').trim().split('\n').slice(-4).join('\n')}`);
}

/** Once on each Mac: the Python that runs the models, then each model named, downloaded and tried. */
function setup(names) {
  if (!MLX) return setupTorch(names);
  if (process.platform !== 'darwin' || process.arch !== 'arm64') stop(3, 'the voice models run on MLX, which is an Apple Silicon Mac\'s. On this machine a story is told by `say` or by recordings (narrate.mjs --from).');
  if (process.env.VOICE_PYTHON) stop(2, `VOICE_PYTHON is set (${process.env.VOICE_PYTHON}): --setup makes ${VENV}, which it would not be used from. Unset it, or keep your own Python.`);
  if (!existsSync(join(VENV, 'bin', 'python'))) {
    const found = [process.env.VOICE_SETUP_PYTHON, 'python3.13', '/opt/homebrew/bin/python3.13', '/usr/local/bin/python3.13'].filter(Boolean)
      .find((p) => spawnSync(p, ['--version'], { encoding: 'utf8' }).status === 0);
    if (!found) stop(3, 'no python3.13 on this Mac (the version mlx-audio was run with here). Install it: brew install python@3.13\n  or name another with VOICE_SETUP_PYTHON=<python>.');
    mkdirSync(dirname(VENV), { recursive: true });
    console.log(`making ${VENV} with ${found}`);
    if (spawnSync(found, ['-m', 'venv', VENV], { stdio: 'inherit' }).status !== 0) stop(3, `could not make the venv at ${VENV}.`);
  }
  const py = join(VENV, 'bin', 'python');
  console.log(`mlx-audio ${MLX_AUDIO} into ${VENV} (600 MB the first time, a few minutes; nothing to do after that)…`);
  // Asked for every time, under voice-constraints.txt (every package at the version the recorded
  // takes were said with): a venv left at other versions, by hand or by a later day's `pip install`,
  // would say every seed differently.
  const pip = (...a) => spawnSync(py, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', ...a], { stdio: 'inherit' }).status === 0;
  if (!pip('-c', join(HERE, 'voice-constraints.txt'), `mlx-audio==${MLX_AUDIO}`)) stop(3, `pip could not install mlx-audio ${MLX_AUDIO} into ${VENV}.`);
  if (spawnSync(py, ['-c', 'import mlx_audio.tts.utils'], { stdio: ['ignore', 'ignore', 'inherit'] }).status !== 0) stop(3, `mlx-audio ${MLX_AUDIO} is installed in ${VENV} and does not import.`);
  console.log(`the Python that runs the voice models: ${py} (mlx-audio ${MLX_AUDIO})`);
  if (names.some((n) => modelOf(n) === MODELS.kokoro)) {   // only for whoever asks for Kokoro: spaCy alone is most of 160 MB
    console.log('Kokoro\'s text packages (misaki, spaCy, espeak-ng; about 160 MB the first time)…');
    if (!pip('--only-binary=:all:', '-c', join(HERE, 'voice-constraints.txt'), '-c', join(HERE, 'voice-constraints-kokoro.txt'), 'misaki', 'spacy', 'num2words', 'phonemizer-fork', 'espeakng-loader')) stop(3, `pip could not install Kokoro's text packages into ${VENV}.`);
    if (!pip('--only-binary=:all:', '--no-deps', SPACY_MODEL)) stop(3, `pip could not install the English text model (${SPACY_MODEL}) into ${VENV}.`);
  }
  const scratch = mkdtempSync(join(tmpdir(), 'film-voice-'));
  try {
    for (const name of names) {
      const model = modelOf(name), known = KNOWN[model], wav = join(scratch, 'probe.wav');
      console.log(`${model}: saying one line (a first run downloads the model${known?.size ? `: about ${known.size}` : ''})…`);
      say(model, known?.voice ?? null, [{ out: wav, text: PROBE.text, seed: PROBE.seed }], scratch);
      const sha = createHash('sha256').update(readFileSync(wav)).digest('hex');
      const verdict = !known?.sha256 ? known?.note || 'no take recorded for this model to compare it with'
        : sha === known.sha256 ? 'THE SAME take as on the Mac this was written on: a seed in a story is the same recording here'
          : 'NOT the take of the Mac this was written on: a story approved elsewhere is not said the same here. Keep its recordings with the film, or have the new takes heard.';
      console.log(`${model}: ${seconds(wav).toFixed(2)} s, sha256 ${sha}\n  ${verdict}`);
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  if (!names.length) console.log('no model named: each is downloaded at the first story that uses it (or now: --setup chatterbox orpheus).');
}

/** Once on each machine without MLX: a Python 3.12 venv with PyTorch (CPU) and Kokoro, then one line said. */
function setupTorch(names) {
  if (process.platform === 'darwin' && process.arch !== 'arm64') stop(3, 'PyTorch has no build for an Intel Mac since 2.3: there a story is told by `say`, or by recordings (narrate.mjs --from).');
  if (process.env.VOICE_PYTHON) stop(2, `VOICE_PYTHON is set (${process.env.VOICE_PYTHON}): --setup makes ${VENV_TORCH} and ${VENV_LARGE}, which it would not be used from. Unset it, or keep your own Python.`);
  const unknown = names.filter((n) => !TORCH_REPO[modelOf(n)]);
  if (unknown.length) stop(2, `${unknown.join(', ')}: not a model voice.mjs knows (kokoro, chatterbox, orpheus).`);
  const large = names.filter((n) => modelOf(n) !== KOKORO).map(modelOf);
  if (!names.length || names.some((n) => modelOf(n) === KOKORO)) setupKokoro();
  if (large.length) setupLarge(large);
}
/** A venv at `venv` from a Python kokoro and chatterbox-tts both take: VOICE_SETUP_PYTHON, python3.12…, or Windows' launcher (py -3.12). */
function makeVenv(venv) {
  // each candidate asked for its path and version: a python3 of the right version will do too (Debian's 3.11…)
  const probe = (cmd, pre = []) => {
    const r = spawnSync(cmd, [...pre, '-c', 'import sys; print(sys.executable); print("%d.%d" % sys.version_info[:2])'], { encoding: 'utf8' });
    const [exe, ver] = r.status === 0 ? r.stdout.trim().split(/\r?\n/) : [];
    return { name: [cmd, ...pre].join(' '), exe, ver };
  };
  const tries = [process.env.VOICE_SETUP_PYTHON && [process.env.VOICE_SETUP_PYTHON], ...TORCH_PYTHON.map((v) => [`python${v}`]), ['python3'], ['python'],
    ...(process.platform === 'win32' ? TORCH_PYTHON.map((v) => ['py', [`-${v}`]]) : [])].filter(Boolean).map(([cmd, pre]) => probe(cmd, pre));
  const found = tries.find((t) => t.exe && TORCH_PYTHON.includes(t.ver))?.exe;
  if (!found) stop(3, `no Python ${TORCH_PYTHON.join(', ')} here (${tries.map((t) => `${t.name}: ${t.ver || 'none'}`).join(', ')}). Install 3.12 beside it: the simplest on any system is uv (https://docs.astral.sh/uv/):\n  uv python install 3.12, then VOICE_SETUP_PYTHON="$(uv python find 3.12)" node voice.mjs --setup …\n  (or apt install python3.12-venv where the distribution has it; on Windows, python.org's installer).`);
  mkdirSync(dirname(venv), { recursive: true });
  console.log(`making ${venv} with ${found}`);
  if (spawnSync(found, ['-m', 'venv', venv], { stdio: 'inherit' }).status !== 0) {
    rmSync(venv, { recursive: true, force: true }); // a half-made venv (no pip) would be taken for one next time
    stop(3, `could not make the venv at ${venv} (on Debian and Ubuntu: apt install python3.12-venv).`);
  }
}
/** `venv`'s Python, the venv made, or made again when the one there is not whole (no pip) or of another Python. */
function ensureVenv(venv) {
  const py = venvPython(venv);
  if (existsSync(py)) {
    const r = spawnSync(py, ['-c', 'import sys, pip; print("%d.%d" % sys.version_info[:2])'], { encoding: 'utf8' });
    if (r.status === 0 && TORCH_PYTHON.includes(r.stdout.trim())) return py;
    console.log(`${venv} is not whole, or not of Python ${TORCH_PYTHON.join(', ')}: making it again`);
    rmSync(venv, { recursive: true, force: true });
  }
  makeVenv(venv);
  return py;
}
/** A constraints file beside voice.mjs, or a stop: a copy in a work folder may lack it, and unpinned is not heard. */
function pinsFile(name) {
  const f = join(HERE, name);
  if (!existsSync(f)) stop(3, `${name} is not beside ${join(HERE, 'voice.mjs')}: run --setup from the skill's own scripts/, or copy voice-constraints*.txt beside it.`);
  return f;
}
/** Chatterbox Turbo and Orpheus, in venv-large: PyTorch for CUDA where nvidia-smi answers, else for the CPU (slow), then one line said by each. */
function setupLarge(models) {
  const py = ensureVenv(VENV_LARGE);
  const cuda = spawnSync('nvidia-smi', ['-L'], { encoding: 'utf8' }).status === 0;
  if (!cuda) console.log('no NVIDIA GPU here (nvidia-smi): these models will run on the CPU, a line in tens of seconds (Chatterbox) to minutes (Orpheus).');
  const pip = (...a) => spawnSync(py, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', ...a], { stdio: 'inherit' }).status === 0;
  const pinned = ['-c', pinsFile('voice-constraints-large.txt')];
  console.log(`PyTorch for ${cuda ? 'CUDA' : 'the CPU'}, then chatterbox-tts ${CHATTERBOX_TTS} and SNAC, into ${VENV_LARGE} (2 to 4 GB the first time)…`);
  // torch first, at chatterbox-tts's own version, from PyTorch's index for this machine (an Intel Mac's from PyPI)
  // PyTorch's index beside PyPI's, which serves torch's own dependencies at the pinned versions: of the two
  // torch 2.6.0 builds, pip takes the index's (+cu124, +cpu), whose local label sorts after the plain one
  const index = process.platform === 'darwin' ? [] : ['--extra-index-url', cuda ? TORCH_CUDA_INDEX : TORCH_INDEX];
  if (!pip(...pinned, ...index, 'torch==2.6.0', 'torchaudio==2.6.0')) stop(3, `pip could not install PyTorch into ${VENV_LARGE}.`);
  // a venv made on the CPU before a GPU came keeps its +cpu torch, which satisfies the pin: the CUDA build, over it
  if (cuda && spawnSync(py, ['-c', 'import sys, torch; sys.exit(0 if torch.cuda.is_available() else 1)']).status !== 0) {
    console.log('this venv\'s PyTorch is the CPU\'s: putting the CUDA build in its place…');
    if (!pip('--force-reinstall', '--no-deps', '--index-url', TORCH_CUDA_INDEX, 'torch==2.6.0+cu124', 'torchaudio==2.6.0+cu124')) stop(3, `pip could not install PyTorch for CUDA into ${VENV_LARGE}.`);
  }
  if (!pip(...pinned, `chatterbox-tts==${CHATTERBOX_TTS}`, 'snac')) stop(3, `pip could not install chatterbox-tts and SNAC into ${VENV_LARGE}.`);
  console.log(`the Python that says ${models.map((m) => Object.keys(MODELS).find((k) => MODELS[k] === m)).join(' and ')}: ${py}${cuda ? '' : ' (on the CPU)'}`);
  const scratch = mkdtempSync(join(tmpdir(), 'film-voice-'));
  try {
    for (const model of models) {
      const wav = join(scratch, 'probe.wav'), known = KNOWN[model];
      console.log(`${TORCH_REPO[model]}: saying one line through PyTorch (a first run downloads the model: about ${TORCH_SIZE[model]})…`);
      say(model, known?.voice ?? null, [{ out: wav, text: PROBE.text, seed: PROBE.seed }], scratch);
      console.log(`${TORCH_REPO[model]}: ${seconds(wav).toFixed(2)} s. Hear it: the same voice as on MLX, another take.`);
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
function setupKokoro() {
  const py = ensureVenv(VENV_TORCH);
  const pip = (...a) => spawnSync(py, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', ...a], { stdio: 'inherit' }).status === 0;
  const pins = pinsFile('voice-constraints-torch.txt');
  console.log(`PyTorch for the CPU, then Kokoro and its text packages, into ${VENV_TORCH} (about 1 GB the first time)…`);
  // torch by itself first, from PyTorch's CPU index (PyPI's Linux wheel brings CUDA's 2 GB); an Intel Mac's comes from PyPI
  if (!pip('-c', pins, ...(process.platform === 'darwin' ? [] : ['--extra-index-url', TORCH_INDEX]), 'torch')) stop(3, `pip could not install PyTorch into ${VENV_TORCH}.`);
  if (!pip('-c', pins, 'kokoro', 'soundfile', 'misaki', 'spacy', 'num2words', 'phonemizer-fork', 'espeakng-loader')) stop(3, `pip could not install Kokoro into ${VENV_TORCH}.`);
  if (!pip('--no-deps', SPACY_MODEL)) stop(3, `pip could not install the English text model (${SPACY_MODEL}) into ${VENV_TORCH}.`);
  if (spawnSync(py, ['-c', 'import kokoro, soundfile'], { stdio: ['ignore', 'ignore', 'inherit'] }).status !== 0) stop(3, `Kokoro is installed in ${VENV_TORCH} and does not import.`);
  console.log(`the Python that says Kokoro: ${py}`);
  const scratch = mkdtempSync(join(tmpdir(), 'film-voice-'));
  try {
    const wav = join(scratch, 'probe.wav');
    console.log(`${KOKORO}: saying one line through PyTorch (a first run downloads the model: about 330 MB)…`);
    say(KOKORO, KNOWN[KOKORO].voice, [{ out: wav, text: PROBE.text, seed: PROBE.seed }], scratch);
    console.log(`${KOKORO}: ${seconds(wav).toFixed(2)} s (2.25 s on MLX: the same voice and words through another engine). Hear it.`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

function main() {
  const argv = process.argv.slice(2), valued = ['--out', '--audition'];
  if (argv[0] === '--setup') return setup(argv.slice(1));
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const file = argv.find((a, i) => !a.startsWith('--') && !valued.includes(argv[i - 1]));
  if (!file) stop(2, 'usage: voice.mjs story.json [--out <dir>] [--audition <takes>] [--recordings]\n       voice.mjs --setup [chatterbox] [orpheus] [<Hugging Face repo> …]');
  const story = JSON.parse(readFileSync(resolve(file), 'utf8')), M = story.mlx;
  if (!M || !M.model) stop(2, `${file} has no "mlx": { "model": … }: it is a story for narrate.mjs (the Mac's voice, or recordings).`);
  if (!Array.isArray(story.steps) || !story.steps.length) stop(2, 'the story has no steps');
  const model = modelOf(M.model), voice = M.voice ?? KNOWN[model]?.voice ?? null, tempo = Number(M.tempo ?? 1), level = Number(M.level ?? -18);
  if (!(tempo >= 0.85 && tempo <= 1.15)) stop(2, `tempo ${M.tempo} is outside 0.85 to 1.15, where the stretch stops sounding like the same person.`);
  if (M.tone != null && !(M.tone in TONES)) stop(2, `tone ${JSON.stringify(M.tone)} is not one of ${Object.keys(TONES).join(', ')}.`);
  if (model === KOKORO && (M.temperature != null || TONES[M.tone])) console.log(`kokoro has no sampling temperature: ${M.temperature != null ? `temperature ${M.temperature}` : `tone ${M.tone}`} changes nothing (tempo, voice and lang do).`);
  const temperature = model === KOKORO ? null : M.temperature != null ? Number(M.temperature) : TONES[M.tone]?.[model] ?? null; // Kokoro has none
  if (temperature != null && !(temperature >= 0.3 && temperature <= 1.2)) stop(2, `temperature ${M.temperature} is outside 0.3 to 1.2, where a model stops reading and starts mumbling or droning.`);
  const lang = M.lang ? String(M.lang) : null;
  if (lang && model !== KOKORO) stop(2, `"lang" is Kokoro's: ${M.model} is told its language by its text.`);
  const human = story.human ?? null;
  if (human != null && !['clean', 'natural', 'expressive'].includes(human)) stop(2, `human ${JSON.stringify(human)} is not one of clean, natural, expressive.`);
  if (!(level <= -6 && level >= -40)) stop(2, `level ${M.level} dB is not a mean a line can be brought to (-18 is \`say\`'s).`);
  const out = resolve(opt('--out') || dirname(resolve(file))), dir = join(out, 'voice-mlx');
  mkdirSync(join(dir, 'raw'), { recursive: true });

  // The model leaves silence round a line and speaks quieter than `say`: trim both ends, pace it,
  // then one gain to `level` and a limiter at -1 dB for the peaks that gain lifts over it.
  const TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse';
  const paced = (tp) => [TRIM, ...(tp === 1 ? [] : [`atempo=${tp}`])].join(',');
  // The limiter works at the film's rate, after the resampling: resampled after it, a line limited at
  // the model's 24 kHz came out with new peaks over the ceiling (-0.8 dB).
  const LIMIT = `aresample=${RATE},alimiter=limit=0.891:attack=5:release=50:level=0`;   // -1 dB, and no make-up gain of its own
  const cut = (raw, to, filters) => run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', filters, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', to]);
  const finish = (raw, to, filters) => {
    const heard = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', raw, '-af', `${filters},volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const mean = Number((heard.match(/mean_volume: (-?[\d.]+) dB/) || [])[1]);
    if (!Number.isFinite(mean)) stop(3, `${raw} holds no speech.`);
    cut(raw, to, `${filters},volume=${(level - mean).toFixed(2)}dB,${LIMIT}`);
  };

  // The steps that are spoken, named as narrate.mjs names a step's recording (its --from finds them by it).
  const keep = human == null || human === 'expressive';
  const steps = story.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.say).map(({ s, i }) => {
    const name = stepName(s, i), { text, lost } = forModel(s.say, model, keep);
    if (lost.length) console.log(`${name}: ${model} cannot make ${lost.map((k) => `[${k}]`).join(', ')}: left out`);
    return { name, text, seed: Number(s.seed ?? M.seed ?? 1000), filters: paced(humanTempo(tempo, human, name)) }; // its trim and its pace
  });
  if (!steps.length) stop(2, 'no step of the story is spoken.');

  const takes = Number(opt('--audition') || 0);
  if (takes) { // each step at a few seeds, paced (the level does not change a length), to hear and to measure: the story and its recordings are not touched
    // Said into a folder of their own and put in the last audition's place only once all of them are
    // there (an afternoon of takes is not left to pile up, and a run that stops keeps what was there
    // to listen to). What is replaced is not lost: a take is its seed, and comes back to the byte.
    const heard = join(dir, 'audition'), next = join(dir, 'audition.next');
    rmSync(next, { recursive: true, force: true }); mkdirSync(next);
    const tries = steps.flatMap((p) => Array.from({ length: takes }, (_, k) => ({ p, seed: p.seed + k, raw: join(next, `${p.name}.seed-${p.seed + k}.raw.wav`), wav: join(next, `${p.name}.seed-${p.seed + k}.wav`) })));
    say(model, voice, tries.map((t) => ({ out: t.raw, text: t.p.text, seed: t.seed })), dir, temperature, lang);
    for (const p of steps) {
      const mine = tries.filter((t) => t.p === p).map((t) => {
        cut(t.raw, t.wav, p.filters); rmSync(t.raw);
        const dur = seconds(t.wav);   // a take of silence alone is trimmed to nothing: no length to compare
        if (!(dur > 0)) stop(3, `the model said nothing for "${p.text.slice(0, 40)}" at seed ${t.seed}.`);
        return { seed: t.seed, dur };
      });
      const median = [...mine].sort((a, b) => a.dur - b.dur)[Math.floor((mine.length - 1) / 2)];
      console.log(`${p.name.padEnd(14)} ${mine.map((m) => `${m.seed}: ${m.dur.toFixed(2)} s`).join('   ')}   median: seed ${median.seed}`);
    }
    rmSync(heard, { recursive: true, force: true }); renameSync(next, heard);
    console.log(`to listen to: ${heard}`);
    return;
  }

  // Two keys a step: it is said again only when what the model is given changed (the model, its voice,
  // the take, the words, the ceiling), and cut again when that or what is done to the recording did (the trim, the
  // pace, the level, the limiter).
  const sha = (...parts) => createHash('sha1').update(JSON.stringify(parts)).digest('hex');
  const indexFile = join(dir, 'index.json'), index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {};
  for (const p of steps) {
    p.raw = join(dir, 'raw', `${p.name}.wav`); p.wav = join(dir, `${p.name}.wav`);
    // a temperature or a lang enters the key only when one is asked for: a take said before tones existed keeps its key
    // and the engine, when it is not MLX: a take said through PyTorch is another recording
    p.keys = { raw: sha(model, voice, p.seed, p.text, CEILING, ...(temperature == null ? [] : [temperature]), ...(lang ? [lang] : []), ...(MLX ? [] : ['torch'])) };
    p.keys.wav = sha(p.keys.raw, p.filters, level, LIMIT, RATE);
    const was = index[p.name] ?? {};
    p.resay = was.raw !== p.keys.raw || !existsSync(p.raw);
    p.recut = p.resay || was.wav !== p.keys.wav || !existsSync(p.wav);
  }
  const resay = steps.filter((p) => p.resay), recut = steps.filter((p) => p.recut);
  const save = () => writeFileSync(indexFile, JSON.stringify(index, null, 1) + '\n');
  if (recut.length) {
    // What is about to be written over is forgotten first: were the model or ffmpeg to stop half-way,
    // the index would still call the new file by the old key, and a later run with the old words, take
    // or level put back would keep it as the old one.
    for (const p of recut) { if (p.resay) delete index[p.name]; else index[p.name] = { raw: p.keys.raw }; }
    save();
    if (resay.length) {
      say(model, voice, resay.map((p) => ({ out: p.raw, text: p.text, seed: p.seed })), dir, temperature, lang);
      for (const p of resay) index[p.name] = { raw: p.keys.raw };
      save();
    }
    for (const p of recut) { finish(p.raw, p.wav, p.filters); index[p.name] = p.keys; }
    save();
  }
  console.log(`${steps.length} steps by ${model}${voice ? `, ${voice}` : ''} at tempo ${tempo}${temperature == null ? '' : `, temperature ${temperature}${M.tone ? ` (${M.tone})` : ''}`}${human ? `, ${human}` : ''} (${resay.length} said, ${recut.length} cut now) → ${dir}`);
  if (argv.includes('--recordings')) return;

  // The rest is narrate.mjs's, from these recordings.
  const r = spawnSync(process.execPath, [join(HERE, 'narrate.mjs'), resolve(file), '--out', out, '--from', dir], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
