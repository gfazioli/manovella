#!/usr/bin/env node
// Manovella's Studio: a wizard for a film's brief, in a window of its own, on the real engine.
//
//   node studio.mjs [--out ~/Downloads] [--roots <dir>[,<dir>…]] [--product <path>] [--port N] [--no-open]
//                   [--agent claude|codex|copilot|gemini] [--detach]
//   node studio.mjs --wait <state> [--for <seconds>]
//
// It serves the wizard (index.html), the engine pages it previews (../template, ../../release-film/
// template) and a small API on 127.0.0.1, opens the wizard in a window it owns and closes when it is
// done — the Studio's own app where this Mac has built it (openWindow), else a Chrome app window
// with a profile of its own — and waits. It ends by printing exactly one of these lines, then exits 0:
//
//   BRIEF <path>   the user pressed Create: <work root>/<name>-work/brief.json is written (the work
//                  root: --out, else workRoot in settings.json, else ~/Downloads) (an earlier brief
//                  there is kept beside it as brief-<time>.json, never overwritten)
//   CANCELLED      the user pressed Cancel
//   CLOSED         the window went away without a brief
//   TIMEOUT        nobody came back for a long while
//
// So a caller runs it in the background and is woken by its exit (site-promo-film SKILL.md, Studio).
// The first line it prints is `STUDIO <url>`: the address, for a browser of your choice with --no-open.
//
// An agent that is not woken by a background command's exit (Codex, Copilot CLI, Gemini CLI) starts it
// with --detach: the Studio goes on in a process of its own, and this one prints `STUDIO <url>` and
// `STATE <file>`, then exits at once. `--wait <file>` then blocks until the Studio ends and prints its
// line, as above; after --for seconds (default 240, under a shell tool's timeout) it prints `WAITING`
// instead, and the agent waits again. A Studio that stopped without an ending reads as CLOSED.
//
// --agent names who the brief goes back to: the copy names that agent (Claude's and Claude Code's names
// replaced) and the end screen gives the line that starts it on the brief. Without it, Claude Code's own
// environment (CLAUDECODE) names Claude; otherwise the copy says "your agent" and the end screen gives
// every agent's line.
//
// Products are the git repositories two levels deep under the project folders: --roots (or
// MANOVELLA_ROOTS, comma-separated), else projectFolders in settings.json (../scripts/settings.mjs, which
// the Studio's Settings write), else the parent of the repository the command runs in, so a workspace's
// siblings are offered; a repository anywhere else can be chosen with the Mac's folder picker. A linked worktree (whose .git is a file) is skipped. For the product picked,
// it reads the homepage (package.json), the latest tag, whether a film kit exists (scripts/film), and
// guesses the brand accent from the source: an Xcode AccentColor, a web manifest's theme_color, or a
// --brand / --accent / --primary CSS variable. The skill still reads the real brand; this is a hint.
//
// Pictures: the most recent images in the picture folders (pictureFolders in settings.json, else
// ~/Pictures; three levels deep, no photo libraries or app bundles), or one the user drops or chooses; each is converted once with sips
// (ffmpeg off macOS)
// to a JPEG Chrome can decode (HEIC included), at most 3840 px, in the cache. On Create the chosen one
// is copied into the work folder, src/backdrops/. The brief keeps where it came from: a wallpaper
// pack's licence is often personal use only, and the skill asks before a film with it goes out.
// Fonts: the kit's own (../template/fonts, open-licensed, copied into src/fonts on Create) and the
// families installed on this Mac (listed through JXA, used by name: they render only where installed).
//
// Voices: the ones `say` has on this Mac, by language, without the novelty ones (/api/voices), and a few
// seconds of any of them as a WAV to listen to (/api/voice). And the voice models voice.mjs runs: whether
// this Mac has their Python and their weights (/api/voice-models), and a line said by one, at the tone,
// the speed and the human touch chosen, through voice.mjs itself, so what is heard is what the film
// gets (/api/voice-sample, then /api/sample/<id>.wav). Any film's brief may name a voice now. With a track
// chosen, the sample is heard over it (/api/voice-mix: mix.mjs lays the music under it at the level set in the
// wizard, from the track's first bar, and goes on a moment after the line: the film's own mix, in small).
//
// Music: the music library's tracks (at its top, or in a folder of it, or that folder's audio/; the library
// is MANOVELLA_MUSIC, else musicLibrary in settings.json; nothing is searched for) with what their notes file
// says of each (/api/tracks), played from a copy this process can read (/api/audio/<id>: a
// file-provider folder (Google Drive, iCloud Drive, Dropbox) keeps a file 'dataless' until it is opened, and a
// process started from a background shell may not fetch it: EDEADLK; it is copied through a Python that
// turns fetching back on); or a file of the user's, named or dropped. Either is measured once
// (../scripts/beats.mjs: tempo, steady or not, the first bar, the sections), and on Create copied into
// the work folder, src/audio/, and its beat written into the brief as musicBeats. A new track is not
// made here: the brief carries the prompt the Studio wrote for Gemini, which makes it in its app.
//
// Nothing is installed and nothing is rendered: the previews run live in the window, one at a time.
// Remembered choices (the last brief, per product) live in prefs.json under Application Support.
//
// studio.json beside this file is the Studio's identity: its name and its version, which the sidebar
// shows and the window app is built from. Bump the version with every change to the Studio: patch for
// a fix, minor for a feature.
//
// Env: MANOVELLA_WINDOW=chrome opens a Chrome window although the app is built; STUDIO_CHROME_ARGS
// adds arguments to the Chrome it starts (e.g. --headless=new, for a test) and so keeps Chrome too;
// STUDIO_PREFS is another folder for prefs.json and the window's Chrome profile, so a test leaves the
// user's remembered choices alone.
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, createHash } from 'node:crypto';
import { platform } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, readdirSync, copyFileSync, createReadStream, openSync, readSync, closeSync, unlinkSync } from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { HOME, untilde, tl, MANY, prefsDir, readSettings, writeSettings, folder, folders, workRoot } from '../scripts/settings.mjs';
import { cacheDir, findChrome, openInBrowser, userDir } from '../scripts/platform.mjs';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = dirname(HERE);
const ROUTES = { // URL prefix → directories searched in order
  studio: [HERE],
  template: [join(SKILL, 'template')],
  engine: [join(SKILL, 'template')], // the first Studio's name for it
  release: [join(SKILL, '..', 'release-film', 'template'), join(SKILL, 'template')],
};
const SCHEMA = JSON.parse(readFileSync(join(HERE, 'schema.json'), 'utf8'));
const STUDIO = JSON.parse(readFileSync(join(HERE, 'studio.json'), 'utf8')); // name, version: the page and the window app read it
const VOICE = await import(pathToFileURL(join(SKILL, 'scripts', 'voice.mjs')).href); // a URL: a Windows path is none // its models and its Python: what a sample is said with

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
// the work root, where <name>-work and the delivery go: --out for this run, else the settings' (a Settings change moves it)
const outRoot = () => { const o = arg('--out', null); return o ? resolve(untilde(o)) : workRoot(); };
let OUT = outRoot();
// a Linux session with no display (a server, a container) has no window to open: the address alone, as --no-open
// (unless a Chrome is asked for by its arguments, as a test's headless one is)
const HEADLESS = platform() === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY && !process.env.STUDIO_CHROME_ARGS;
const OPEN = !argv.includes('--no-open') && !HEADLESS;
const PORT = Number(arg('--port', 0));
const PRODUCT = arg('--product', null);
const KEY = randomBytes(12).toString('hex');
const PREFS_DIR = prefsDir(); // prefs.json, settings.json, the cache's parent
const PREFS = join(PREFS_DIR, 'prefs.json');
// Before Manovella the Studio was called Film Studio and kept its folder as gf-film-studio: its
// remembered briefs (prefs.json) move over once, on the first start that finds none of Manovella's,
// even when a settings.json was written here first; the cache and the window's profile are rebuilt.
if (!process.env.STUDIO_PREFS) {
  const old = join(dirname(PREFS_DIR), 'gf-film-studio', 'prefs.json');
  if (existsSync(old) && !existsSync(PREFS)) try { mkdirSync(PREFS_DIR, { recursive: true }); renameSync(old, PREFS); } catch { /* the briefs stay where they were: Like last time starts empty */ }
}
const CACHE = process.env.STUDIO_PREFS ? join(PREFS_DIR, 'cache') : cacheDir();

// ---------------------------------------------------------------- the agent the brief goes back to
// The copy (studio.js, index.html, the schema's labels) is written naming Claude and Claude Code; served to
// another agent's user it names that agent instead, or "your agent" (capitalised where a sentence begins).
// `run` starts the agent on a brief, for a Studio opened outside a session: the end screen shows it.
const ask = (cli) => `${cli} "Use the site-promo-film skill on the brief {path}"`;
const AGENTS = {
  claude: { name: 'Claude', app: 'Claude Code', run: 'claude "/manovella:site-promo-film brief {path}"' },
  codex: { name: 'Codex', app: 'Codex', run: ask('codex') },
  copilot: { name: 'Copilot', app: 'Copilot CLI', run: ask('copilot -i') },
  gemini: { name: 'Gemini CLI', app: 'Gemini CLI', run: ask('gemini -i') }, // not just Gemini: the copy names the Gemini app, for music
};
const AGENT_ASKED = arg('--agent', '').toLowerCase();
if (AGENT_ASKED && !AGENTS[AGENT_ASKED]) console.error(`--agent ${AGENT_ASKED}: not one of ${Object.keys(AGENTS).join(', ')}; the copy names ${process.env.CLAUDECODE ? 'Claude' : '"your agent"'}`);
const AGENT = AGENTS[AGENT_ASKED] || (process.env.CLAUDECODE ? AGENTS.claude : null);
// Off macOS the copy's "this Mac" is this computer, where it speaks of the machine (its voices, fonts, models).
const ON_MAC = platform() === 'darwin';
function agentCopy(text) {
  if (!ON_MAC) text = text.replace(/\bthis Mac\b/g, 'this computer').replace(/\beach Mac\b/g, 'each computer');
  if (AGENT === AGENTS.claude) return text;
  return text.replace(/\bClaude Code\b/g, AGENT?.app || 'your agent').replace(/\bClaude\b/g, AGENT?.name || 'your agent')
    .replace(/(^|[.!?]\s+|['"`>]\s*)your agent/g, '$1Your agent');
}
// the schema's strings one by one, so each starts a sentence where it starts
const copyOf = (v) => (typeof v === 'string' ? agentCopy(v) : Array.isArray(v) ? v.map(copyOf)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyOf(x)])) : v);
const SCHEMA_COPY = AGENT === AGENTS.claude && ON_MAC ? SCHEMA : copyOf(SCHEMA);

// ---------------------------------------------------------------- --detach and --wait
// The state file is a detached Studio's: its log from the start, its pid and address once it listens, its
// heartbeat (`at`, every 5 s while it runs) and its last line once it ends (finish). --wait judges a Studio
// by its heartbeat, not by its pid: a sandbox may hide the pid, and a pid is reused.
const STATE = arg('--state', null);
function writeState(patch) {
  if (!STATE) return;
  writeFileSync(`${STATE}.part`, JSON.stringify({ ...readJSON(STATE), ...patch }), { mode: 0o600 }); // its address holds the key
  renameSync(`${STATE}.part`, STATE);
}
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
if (argv.includes('--wait')) {
  const file = resolve(untilde(arg('--wait', ''))), secs = argv.includes('--for') ? Number(arg('--for', NaN)) : 240;
  if (!(secs >= 0)) { console.error(`--for takes seconds, a number: ${arg('--for', '(none)')}`); process.exit(2); }
  for (const until = Date.now() + secs * 1000; ; await sleep(1000)) {
    const s = readJSON(file);
    if (!s) { console.error(`no Studio state at ${file}`); process.exit(2); }
    if (s.end) { console.log(s.end); process.exit(0); }
    if (s.at && Date.now() - s.at > 15_000) { // no heartbeat for three beats: gone without a line (killed, the machine slept…)
      console.log('CLOSED'); console.error(`the Studio stopped without an ending; its log: ${s.log}`); process.exit(0);
    }
    if (Date.now() >= until) { console.log('WAITING'); process.exit(0); }
  }
}
if (argv.includes('--detach')) {
  const runs = join(CACHE, 'runs'), id = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  try { mkdirSync(runs, { recursive: true }); } catch (e) {
    console.error(`cannot write ${runs} (${e.code}): run --detach outside the agent's sandbox, which must also let it listen on 127.0.0.1`);
    process.exit(1);
  }
  for (const f of readdirSync(runs)) { // a week's runs are kept, to read a log back
    try { if (Date.now() - statSync(join(runs, f)).mtimeMs > 7 * 86400_000) unlinkSync(join(runs, f)); } catch { /* gone meanwhile */ }
  }
  const state = join(runs, `${id}.json`), log = join(runs, `${id}.log`);
  let out;
  try { out = openSync(log, 'a', 0o600); writeFileSync(state, JSON.stringify({ log }), { mode: 0o600 }); } catch (e) {
    console.error(`cannot write ${runs} (${e.code}): run --detach outside the agent's sandbox, which must also let it listen on 127.0.0.1`);
    process.exit(1);
  }
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...argv.filter((a) => a !== '--detach'), '--state', state],
    { detached: true, stdio: ['ignore', out, out], windowsHide: true });
  let gone = false;
  child.on('exit', () => { gone = true; });
  child.on('error', (e) => { gone = true; console.error(`the Studio could not be started: ${e.message}`); });
  child.unref();
  const t0 = Date.now();
  while (!gone && Date.now() - t0 < 60_000) {
    const s = readJSON(state);
    if (s?.url) { console.log(`STUDIO ${s.url}`); console.log(`STATE ${state}`); process.exit(0); }
    await sleep(100);
  }
  if (!gone) child.kill(); // too slow to start: not left to open a window nobody waits for
  console.error(`the Studio did not start (in an agent's sandbox: run --detach outside it); its log, ${log}:\n${readFileSync(log, 'utf8').split('\n').slice(-20).join('\n')}`);
  process.exit(1);
}

async function gitTop(dir) {
  try { return (await run('git', ['-C', dir, 'rev-parse', '--show-toplevel'])).stdout.trim(); } catch { return null; }
}
async function roots() {
  const given = arg('--roots', process.env.MANOVELLA_ROOTS || '');
  if (given) return given.split(',').map((s) => resolve(untilde(s.trim()))).filter(Boolean);
  const set = folders(readSettings().projectFolders);
  if (set.length) return set;
  const top = await gitTop(process.cwd());
  return [top ? dirname(top) : process.cwd()];
}

// ---------------------------------------------------------------- products
function scan(root, depth = 2, found = []) {
  let entries = [];
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return found; }
  const git = entries.find((e) => e.name === '.git');
  if (git && !git.isDirectory()) return found; // a linked worktree or a submodule: its main repository is listed
  if (git) found.push(root); // and on: a workspace repository can hold the products' own, ignored by it
  if (depth === 0) return found;
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
    scan(join(root, e.name), depth - 1, found);
  }
  return found;
}
function readJSON(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }
function prefs() { return readJSON(PREFS) || { byProduct: {} }; }

const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
function colorsetHex(c) { // Xcode: components as "0.357", "0x5B" or "91"
  const v = (s) => { s = String(s); if (/^0x/i.test(s)) return parseInt(s, 16); const f = parseFloat(s); return f <= 1 && s.includes('.') ? f * 255 : f; };
  const k = c?.color?.components; if (!k) return null;
  return '#' + [k.red, k.green, k.blue].map((x) => hex2(v(x))).join('').toUpperCase();
}
async function guessAccent(repo) {
  let files = [];
  try { files = (await run('git', ['-C', repo, 'ls-files'], { maxBuffer: 64 << 20 })).stdout.split('\n'); } catch { return null; }
  const small = (f) => { try { return statSync(join(repo, f)).size < 200_000; } catch { return false; } };
  // the product's own film kit first: the accent its last film was made with
  const kit = files.filter((f) => /^scripts\/film\/[^/]+\.html$/.test(f)).sort((a, b) => /promo/.test(b) - /promo/.test(a));
  for (const f of kit) {
    const m = readFileSync(join(repo, f), 'utf8').match(/\baccent:\s*hex\('(#[0-9a-fA-F]{6})'\)/);
    if (m) return { hex: m[1].toUpperCase(), from: `${f}, its last film` };
  }
  const accent = files.find((f) => /AccentColor\.colorset\/Contents\.json$/.test(f));
  if (accent) {
    const j = readJSON(join(repo, accent));
    const any = j?.colors?.find((c) => !c.appearances) || j?.colors?.[0];
    const h = any && colorsetHex(any);
    if (h) return { hex: h, from: accent };
  }
  for (const f of files.filter((f) => /(^|\/)(site\.webmanifest|manifest\.json|manifest\.webmanifest)$/.test(f)).slice(0, 5)) {
    const j = readJSON(join(repo, f));
    if (/^#[0-9a-f]{6}$/i.test(j?.theme_color || '')) return { hex: j.theme_color.toUpperCase(), from: `${f} theme_color` };
  }
  const re = /--(?:[a-z]+-)?(?:brand|accent|primary)(?:-color)?(?:-500)?\s*:\s*(#[0-9a-fA-F]{6})\b/;
  for (const f of files.filter((f) => /\.(css|scss|sass|less)$/.test(f) && !/(^|\/)(vendor|dist|build)\//.test(f)).slice(0, 400)) {
    if (!small(f)) continue;
    const m = readFileSync(join(repo, f), 'utf8').match(re);
    if (m) return { hex: m[1].toUpperCase(), from: `${f} ${m[0].split(':')[0].trim()}` };
  }
  return null;
}
async function product(path) {
  const pkg = readJSON(join(path, 'package.json'));
  const out = { name: basename(path), path, homepage: null, remote: null, tag: null, kit: false, accent: null };
  if (pkg?.homepage) out.homepage = pkg.homepage;
  try { out.remote = (await run('git', ['-C', path, 'remote', 'get-url', 'origin'])).stdout.trim().replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/').replace(/^https:\/\/[^@/]+@/, 'https://'); } catch {}
  try { out.tag = (await run('git', ['-C', path, 'describe', '--tags', '--abbrev=0'])).stdout.trim(); } catch {}
  out.kit = existsSync(join(path, 'scripts', 'film'));
  out.accent = await guessAccent(path);
  out.last = prefs().byProduct?.[path] || null;
  return out;
}

// ---------------------------------------------------------------- fonts
const FONT_DIR = join(SKILL, 'template', 'fonts');
const KIT_FONTS = JSON.parse(readFileSync(join(FONT_DIR, 'fonts.json'), 'utf8')).families;
const NOT_TEXT = /^(Apple Braille|Apple Color Emoji|Apple Symbols|Bodoni Ornaments|Webdings|Wingdings( 2| 3)?|Zapf Dingbats|Symbol|LastResort|GB18030 Bitmap)$/;
let MAC_FONTS = null;
/** The families installed on this Mac that set Latin text, each with its styles and a file: JXA, once. */
async function macFonts() {
  if (MAC_FONTS) return MAC_FONTS;
  if (platform() !== 'darwin') return (MAC_FONTS = []);
  const js = `ObjC.import('AppKit');
const fm = $.NSFontManager.sharedFontManager, out = [];
for (const f of ObjC.deepUnwrap(fm.availableFontFamilies)) {
  if (f.startsWith('.')) continue;
  const members = ObjC.deepUnwrap(fm.availableMembersOfFontFamily(f)) || [];
  if (!members.length) continue;
  const font = $.NSFont.fontWithNameSize(members[0][0], 12);
  if (!font || font.isNil()) continue;
  const cs = font.coveredCharacterSet;
  if (!(cs.characterIsMember(65) && cs.characterIsMember(97) && cs.characterIsMember(224))) continue;
  const u = font.fontDescriptor.objectForKey('NSCTFontFileURLAttribute');
  out.push({ family: f, styles: members.map((m) => m[1]), file: u.isNil() ? null : u.path.js });
}
JSON.stringify(out)`;
  try { MAC_FONTS = JSON.parse((await run('osascript', ['-l', 'JavaScript', '-e', js], { maxBuffer: 16 << 20 })).stdout).filter((f) => !NOT_TEXT.test(f.family)); } catch { MAC_FONTS = []; }
  return MAC_FONTS;
}

// ---------------------------------------------------------------- voices
// `say -v ?` prints "Name (maybe a locale in words)   it_IT    # a sentence in its language". The
// novelty voices (bells, a pipe organ, an alien) are not for telling anything.
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Zarvox|Junior|Ralph|Fred|Kathy)$/;
// the Eloquence voices: 16 kHz and plainly synthetic (measured: nothing above 6 kHz), the last a lesson should be told by
const ELOQUENCE = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)$/;
const HEARD = { it: 'In questo tutorial vediamo un passo alla volta.', en: 'In this tutorial we take it one step at a time.' };
let VOICES = null, SYSLANG = null;
async function voices() {
  if (VOICES) return VOICES;
  if (platform() !== 'darwin') return (VOICES = []);
  try {
    const seen = new Set();
    VOICES = (await run('say', ['-v', '?'], { maxBuffer: 4 << 20 })).stdout.split('\n').flatMap((l) => {
      const m = l.match(/^(.+?)\s+([a-z]{2,3}_[A-Z0-9]{2,4})\s+#\s?(.*)$/);
      if (!m || seen.has(m[1]) || NOVELTY.test(m[1].replace(/\s*\(.*$/, ''))) return [];
      seen.add(m[1]);
      const short = m[1].replace(/\s*\(.*$/, ''), quality = (m[1].match(/\((Enhanced|Premium)\)/) || [])[1] || null;
      // tier: 0 Premium, 1 Enhanced (both a download, per Mac), 2 the compact voice every Mac has, 3 Eloquence
      return [{ name: m[1], short, lang: m[2], quality, tier: quality === 'Premium' ? 0 : quality === 'Enhanced' ? 1 : ELOQUENCE.test(short) ? 3 : 2, sample: m[3] }];
    });
  } catch { VOICES = []; }
  try { SYSLANG = ((await run('defaults', ['read', '-g', 'AppleLanguages'])).stdout.match(/"([a-z]{2,3}-[A-Z0-9]{2,4})"/) || [])[1]?.replace('-', '_') || null; } catch {}
  return VOICES;
}
/** A few seconds of a voice, as a WAV a browser plays: its own greeting, and a line a tutorial would say. */
async function heard(name, rate) {
  const v = (await voices()).find((x) => x.name === name);
  if (!v) return null;
  const text = `${v.sample} ${HEARD[v.lang.slice(0, 2)] || ''}`.trim(), out = join(CACHE, 'voice', `${idOf(JSON.stringify([name, rate, text, 48000]))}.wav`); // its rate in the name: a sample kept from when they were 22 kHz is not played again
  if (!existsSync(out)) { mkdirSync(dirname(out), { recursive: true }); await run('say', ['-v', name, '-r', String(rate), '--file-format=WAVE', '--data-format=LEI16@48000', '-o', out, text]); } // 48 kHz asked for: `say` writes 22 kHz otherwise, and a voice that is 48 kHz inside would be heard at half of it
  return out;
}

// ---------------------------------------------------------------- sound: a file to read, a file to play
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|aiff?|flac|ogg)$/i;
const AUDIO_MIME = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.flac': 'audio/flac', '.ogg': 'audio/ogg' };
const ls = (d) => { try { return readdirSync(d); } catch { return []; } };
const LOCAL = new Map(); // path:mtime:size → the promise of a path this process can read
/** `path`, or a copy of it in the cache when it cannot be read here: a file-provider file (Google Drive, iCloud Drive, Dropbox) that is still
 *  'dataless' fails with EDEADLK in a process started from a background shell (fetching is turned off
 *  for it), so a Python that turns it back on (setiopolicy_np) copies it. The original is only read. */
function local(path) {
  const st = statSync(path), key = `${path}:${st.mtimeMs}:${st.size}`;
  if (!LOCAL.has(key)) LOCAL.set(key, (async () => {
    try { const fd = openSync(path, 'r'); try { readSync(fd, Buffer.alloc(1), 0, 1, 0); } finally { closeSync(fd); } return path; } catch (e) {
      if (e.code !== 'EDEADLK' || platform() !== 'darwin') throw e;
    }
    const out = join(CACHE, 'files', `${idOf(key)}${extname(path).toLowerCase()}`);
    if (!existsSync(out)) {
      mkdirSync(dirname(out), { recursive: true });
      await run('python3', ['-I', '-c', 'import ctypes, shutil, sys; ctypes.CDLL(None).setiopolicy_np(3, 0, 2); shutil.copyfile(sys.argv[1], sys.argv[2])', path, `${out}.part`], { timeout: 180_000 });
      renameSync(`${out}.part`, out);
    }
    return out;
  })().catch((e) => { LOCAL.delete(key); throw e; }));
  return LOCAL.get(key);
}
/** A file to a player, whole or the bytes it asks for: WebKit plays audio only from a server that answers a Range. */
function sendFile(req, res, path, type) {
  const size = statSync(path).size, m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  const head = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'max-age=3600' };
  if (m && (m[1] || m[2])) {
    const a = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2])), b = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (a >= size || a > b) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...head, 'content-length': b - a + 1, 'content-range': `bytes ${a}-${b}/${size}` });
    return createReadStream(path, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { ...head, 'content-length': size });
  createReadStream(path).pipe(res);
}

// ---------------------------------------------------------------- music: the music library's tracks
/** The music library: MANOVELLA_MUSIC, else musicLibrary in settings.json (read again at each use, as every
 *  setting is: a Settings change counts at once). Nothing is auto-detected. A path that is no folder is none. */
const musicLibrary = () => folder(process.env.MANOVELLA_MUSIC || readSettings().musicLibrary);
/** Where finished films go when the library takes them (deliverToLibrary): the library, else null. */
const deliveryLibrary = () => (readSettings().deliverToLibrary ? musicLibrary() : null);
/** Where a film named `name` is delivered: into the music library when it takes films, in the product's folder
 *  there (matched by name, as its tracks are; else one named after it) under video/; otherwise in the work
 *  root. The brief carries it (deliver), the name step checks it, Review shows it. */
function deliveryDir(name, productName) {
  const lib = deliveryLibrary();
  if (!lib) return join(OUT, name);
  const own = norm(productName), dir = own && ls(lib).find((d) => !d.startsWith('.') && norm(d) === own && folder(join(lib, d)));
  return join(lib, dir || String(productName || 'Films').replace(/[/\\]/g, '-'), 'video', name);
}
const TRACKS = new Map(); // id → { path, name, brand, about, upload }: ids are unguessable, as the pictures' are
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** What a folder's notes file says of each track: a paragraph that starts with the file's name. The first
 *  paragraph that names none is the folder's own (how they were made). */
async function notesOf(dir, files) {
  const out = {};
  for (const f of files.filter((x) => /notes?\.(txt|md)$/i.test(x))) {
    let text = '';
    try { text = readFileSync(await local(join(dir, f)), 'utf8'); } catch { continue; }
    for (const para of text.split(/\n\s*\n/)) {
      const [first, ...rest] = para.trim().split('\n'), name = first.trim();
      if (files.includes(name)) out[name] = rest.map((l) => l.trim()).join(' ').replace(/\s+/g, ' ').trim();
      else if (!out._folder && para.trim()) out._folder = para.trim().replace(/\s+/g, ' ');
    }
  }
  return out;
}
/** The library's tracks: at its top (brand null), and in each folder of it (a brand's, or any group), directly
 *  or in its audio/; never in a dot-folder or one musicLibraryIgnore names. The product's own folder first,
 *  the tracks at the top last. */
async function listTracks(productName) {
  const store = musicLibrary();
  if (!store) return { store: null, tracks: [] };
  const ign = readSettings().musicLibraryIgnore, skip = new Set(Array.isArray(ign) ? ign.map(String) : []), own = norm(productName), tracks = [];
  const groups = ls(store).filter((d) => !d.startsWith('.') && !skip.has(d));
  for (const [dir, brand] of [[store, null], ...groups.flatMap((d) => [[join(store, d), d], [join(store, d, 'audio'), d]])]) {
    const files = ls(dir).filter((f) => !f.startsWith('.'));
    if (!files.some((f) => AUDIO_EXT.test(f))) continue;
    const notes = await notesOf(dir, files);
    for (const name of files.filter((f) => AUDIO_EXT.test(f))) {
      const path = join(dir, name);
      let st; try { st = statSync(path); } catch { continue; }
      const id = idOf(`${path}:${st.mtimeMs}:${st.size}`);
      TRACKS.set(id, { path, name, brand, about: notes[name] || null });
      tracks.push({ id, name, brand, own: !!own && !!brand && norm(brand) === own, bytes: st.size, mtime: st.mtimeMs, about: notes[name] || null, folder: notes._folder || null });
    }
  }
  tracks.sort((a, b) => b.own - a.own || !a.brand - !b.brand || (a.brand || '').localeCompare(b.brand || '') || a.name.localeCompare(b.name));
  // where they are: the path, with ~ for the home folder
  return { store: tl(store), tracks };
}

// ---------------------------------------------------------------- voice models: what this Mac has, and a line to hear
function voiceKit() {
  const hub = process.env.HF_HUB_CACHE || join(process.env.HF_HOME || join(HOME, '.cache', 'huggingface'), 'hub');
  return {
    // silicon: MLX runs here, every model; else PyTorch, Kokoro alone (its own weights, voice.mjs KOKORO_TORCH)
    silicon: VOICE.MLX, python: existsSync(VOICE.python()),
    // a model is there when its weights are, and Kokoro's text packages too (a Python from before `--setup kokoro` has none)
    models: Object.fromEntries(Object.entries(VOICE.MODELS).map(([k, r]) => {
      const repo = VOICE.MLX ? r : k === 'kokoro' ? VOICE.KOKORO_TORCH : null;
      return [k, !!repo && existsSync(join(hub, `models--${repo.replace('/', '--')}`, 'snapshots')) && (k !== 'kokoro' || VOICE.hasKokoroPackages())];
    })),
    setup: `node ${join(SKILL, 'scripts', 'voice.mjs')} --setup ${VOICE.MLX ? Object.keys(VOICE.MODELS).join(' ') : 'kokoro'}`,
  };
}
/** The voices a model offers by name (Orpheus's, Kokoro's), and whether it has a tone to set (Kokoro reads at no temperature). */
const speakersOf = (model) => SCHEMA.voices.filter((v) => v.model === model && v.speaker).map((v) => v.speaker);
const toned = (model) => SCHEMA.fields.voiceModel.options.find((o) => o.value === model)?.tone !== false;
/** A queue: queue(job) runs job once the ones before it are over, and is job's own promise; one that fails
 *  does not hold up the next. */
function serial() {
  let last = Promise.resolve();
  return (job) => { const mine = last.then(job); last = mine.catch(() => {}); return mine; };
}
const SAMPLES = new Map(); // id → the WAV a sample line, or a line over its music, became
// One heavy thing at a time: a voice model (two would load 6 GB at once), and no mix's ffmpeg beside one.
const heavy = serial();
/** One line said by voice.mjs as a film's story would be (--recordings: trimmed, paced, levelled), once per
 *  setting: one made already is answered at once, without waiting its turn. The story's folder is the model's
 *  take (model, voice, tone, words): another speed or touch there is a new cut of the same recording, a second
 *  instead of the model loaded again. */
async function sample(o) {
  const id = idOf(JSON.stringify(['sample', o])), wav = join(CACHE, 'voice-model', 'heard', `${id}.wav`);
  const dir = join(CACHE, 'voice-model', idOf(JSON.stringify([o.model, o.speaker, o.tone, o.text, o.human === 'expressive'])));
  if (!existsSync(wav)) await heavy(async () => {
    if (existsSync(wav)) return; // made by the same request, asked twice
    mkdirSync(dirname(wav), { recursive: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'story.json'), JSON.stringify({ title: 'sample', human: o.human, mlx: { model: o.model, ...(o.speaker ? { voice: o.speaker } : {}), tone: o.tone, tempo: o.tempo, seed: 1000 }, steps: [{ id: 'sample', say: o.text }] }));
    await run(process.execPath, [join(SKILL, 'scripts', 'voice.mjs'), join(dir, 'story.json'), '--recordings', '--out', dir], { timeout: 300_000, maxBuffer: 16 << 20 });
    copyFileSync(join(dir, 'voice-mlx', '01-sample.wav'), wav);
  });
  SAMPLES.set(id, wav);
  return id;
}
/** The few seconds of a macOS voice a query names (?voice=, and ?rate=, the number `say` takes: 90 to 300, 175
 *  unless given): its WAV, or null. What /api/voice plays and /api/voice-mix lays over the music. */
const macSample = (q) => { const rate = Number(q.get('rate')) || 175; return q.get('voice') && rate >= 90 && rate <= 300 ? heard(q.get('voice'), Math.round(rate)) : null; };

/** A sample (a model's line, a macOS voice's greeting) over a track, as mix.mjs will lay the film's voice over its
 *  music: `under` LU under the voice, `lift` dB up where nobody speaks, and 2.4 s on after the line (--tail), so
 *  what the music does between lines is heard too. The track starts on its first bar when its measure is there, or
 *  comes within a moment: a library is measured one track at a time, and a ▶ neither waits for all of it nor holds
 *  the queue meanwhile; else from its start. Once per sample, track, start and setting, a mix made already answered
 *  at once; its id plays through /api/sample, as a sample's does. */
async function mixed(voice, music, under, lift) {
  const measured = Promise.resolve().then(() => beatsOf(music)).then((b) => b.at || 0, () => 0);
  const at = await Promise.race([measured, new Promise((ok) => setTimeout(ok, 1500, 0))]);
  const vs = statSync(voice), ms = statSync(music);
  const id = idOf(JSON.stringify(['mix', voice, vs.mtimeMs, vs.size, music, ms.mtimeMs, ms.size, at, under, lift])), out = join(CACHE, 'voice-model', 'mixed', `${id}.wav`);
  if (!existsSync(out)) await heavy(async () => {
    if (existsSync(out)) return;
    mkdirSync(dirname(out), { recursive: true });
    await run(process.execPath, [join(SKILL, 'scripts', 'mix.mjs'), '--voice', voice, '--music', await local(music), '--out', `${out}.part`, '--at', String(at), '--under', String(under), '--lift', String(lift), '--tail', '2.4', '--fade', '1.2'], { timeout: 120_000, maxBuffer: 16 << 20 });
    renameSync(`${out}.part`, out);
  });
  SAMPLES.set(id, out);
  return id;
}

// ---------------------------------------------------------------- pictures from the Mac
/** The picture folders: the settings', else ~/Pictures. Desktop and Downloads only when added there: they hold
 *  screenshots of the user's own conversations as often as backdrops. */
const imgDirs = () => { const set = folders(readSettings().pictureFolders); return set.length ? set : [userDir('pictures')]; };
const IMG_EXT = /\.(jpe?g|png|heic|heif|webp|tiff?)$/i;
// packages are not folders of pictures, and a film's work folder holds its own renders, not backdrops
const SKIP_DIR = /\.(photoslibrary|app|bundle|framework|key|pages|numbers|xcassets|imageset|appiconset|iconset|lproj|noindex)$|^node_modules$|-work$/;
const IMAGES = new Map(); // id → { path, name, upload }: ids are unguessable, so the picture routes need no key
const idOf = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
function listImages() {
  const found = [];
  const walk = (d, depth) => {
    let e; try { e = readdirSync(d, { withFileTypes: true }); } catch { return; } // a folder macOS does not let us read
    for (const x of e) {
      if (x.name.startsWith('.')) continue;
      const f = join(d, x.name);
      if (x.isDirectory()) { if (!SKIP_DIR.test(x.name) && depth > 0) walk(f, depth - 1); } else if (IMG_EXT.test(x.name)) {
        try { const st = statSync(f); if (st.size > 30_000) found.push({ path: f, mtime: st.mtimeMs, bytes: st.size }); } catch {}
      }
    }
  };
  imgDirs().forEach((d) => walk(d, 3));
  found.sort((a, b) => b.mtime - a.mtime);
  return found.slice(0, 160).map((f) => {
    const id = idOf(f.path + f.mtime);
    IMAGES.set(id, { path: f.path, name: basename(f.path) });
    return { id, name: basename(f.path), dir: tl(dirname(f.path)), mtime: f.mtime, bytes: f.bytes };
  });
}
let convBusy = 0; const convWait = [];
function convert(cmd, args) { // three at a time: a folder of 5K pictures would otherwise start a hundred at once
  return new Promise((ok, ko) => {
    const go = () => { convBusy++; execFile(cmd, args, (e, out) => { convBusy--; if (convWait.length) convWait.shift()(); e ? ko(e) : ok(out); }); };
    convBusy < 3 ? go() : convWait.push(go);
  });
}
/** The picture as a JPEG Chrome decodes (sips reads HEIC, PNG, TIFF, WebP), never upscaled: 'thumb' at
 *  most 480 px, 'full' at most 3840. Made once, in the cache. */
async function prepared(id, kind) {
  const img = IMAGES.get(id);
  if (!img) return null;
  const out = join(CACHE, kind, `${id}.jpg`);
  if (existsSync(out)) return out;
  mkdirSync(dirname(out), { recursive: true });
  const max = kind === 'thumb' ? 480 : 3840;
  if (platform() !== 'darwin') { // ffmpeg, the film's own tool, where there is no sips: never upscaled either
    await convert('ffmpeg', ['-v', 'error', '-y', '-i', img.path, '-frames:v', '1', '-vf', `scale=w='min(${max},iw)':h='min(${max},ih)':force_original_aspect_ratio=decrease`,
      '-q:v', kind === 'thumb' ? '5' : '2', out]);
    return out;
  }
  const dims = String(await convert('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', img.path])).match(/pixelWidth: (\d+)[\s\S]*pixelHeight: (\d+)/);
  const big = dims && Math.max(+dims[1], +dims[2]) > max;
  await convert('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', kind === 'thumb' ? '78' : '92', ...(big ? ['-Z', String(max)] : []), img.path, '--out', out]);
  return out;
}

// ---------------------------------------------------------------- the brief
const SLUG = /^[a-z0-9][a-z0-9.-]{0,62}$/;
function check(body) {
  const err = [], F = SCHEMA.fields, b = {};
  const opt = (k) => F[k].options.map((o) => o.value);
  for (const k of ['kind', 'tone', 'fps', 'resolution', 'music']) {
    const v = body[k] ?? F[k].default;
    if (!opt(k).includes(v)) err.push(`${k}: ${JSON.stringify(v)} is not one of ${opt(k).join(', ')}`); else b[k] = v;
  }
  // a length: one of the kind's own, or any whole number of seconds in the kind's range (one typed in the wizard)
  const durs = F.duration.byKind[b.kind] || [], span = F.duration.range?.[b.kind];
  b.duration = body.duration ?? durs[0];
  if (!durs.includes(b.duration) && !(span && Number.isInteger(b.duration) && b.duration >= span[0] && b.duration <= span[1])) err.push(`duration: ${b.duration} does not fit a ${b.kind} (${durs.join(', ')}${span ? `, or any whole number of seconds from ${span[0]} to ${span[1]}` : ''})`);
  for (const k of ['aspects', 'files']) {
    const v = body[k] ?? F[k].default;
    if (!Array.isArray(v) || v.length < (F[k].min || 0) || v.some((x) => !opt(k).includes(x))) err.push(`${k}: ${JSON.stringify(v)}`);
    else b[k] = opt(k).filter((x) => v.includes(x)); // the schema's order
  }
  const formats = body.formats || [];
  const ids = SCHEMA.formats.map((f) => f.id);
  if (!Array.isArray(formats) || formats.length > 3 || formats.some((f) => !ids.includes(f))) err.push(`formats: ${JSON.stringify(formats)} (up to three of ${ids.join(', ')})`);
  else b.formats = formats;
  // what the product is shown in: one of the frames (a device, a window, the UI alone), or null: each format's own
  const frame = body.frame ?? null;
  if (frame !== null && !SCHEMA.frames.some((f) => f.id === frame)) err.push(`frame: ${JSON.stringify(frame)} is not one of ${SCHEMA.frames.map((f) => f.id).join(', ')}`); else b.frame = frame;
  // the backdrop: one of the looks, or a picture (the look is then 'photo')
  const bd = body.backdrop || null;
  if (bd) {
    const img = IMAGES.get(bd.image);
    if (!img) err.push('backdrop: that picture is not known to this Studio any more: choose it again');
    const S = SCHEMA.picture;
    if (!S.blur.some((o) => o.value === (bd.blur ?? 0)) || !S.treatment.some((o) => o.value === (bd.treatment ?? 'none'))) err.push(`backdrop: ${JSON.stringify(bd)}`);
    b.backdrop = { image: bd.image, name: img?.name || null, original: img && !img.upload ? img.path : null, blur: bd.blur ?? 0, treatment: bd.treatment ?? 'none', drift: !!bd.drift, tone: ['light', 'dark'].includes(bd.tone) ? bd.tone : null };
  } else b.backdrop = null;
  const look = body.look ?? null;
  if (look !== null && !(look === 'photo' ? b.backdrop : SCHEMA.looks.some((l) => l.id === look))) err.push(`look: ${JSON.stringify(look)}`); else b.look = look;
  // the type: a set from the kit, or a display family of its own (the kit's or the Mac's); null: the brand's
  const ty = body.type || null;
  b.type = null;
  if (ty) {
    const set = ty.set ? SCHEMA.typesets.find((x) => x.id === ty.set) : null;
    if (ty.set && !set) err.push(`type.set: ${JSON.stringify(ty.set)}`);
    const face = (f, role) => {
      if (!f || !f.family) return null;
      const source = f.source || (KIT_FONTS[f.family] ? 'kit' : f.family === 'system-ui' ? 'system' : 'mac');
      if (source === 'kit' && !KIT_FONTS[f.family]) err.push(`type.${role}: no kit family '${f.family}'`);
      if (source === 'mac' && !(MAC_FONTS || []).some((m) => m.family === f.family)) err.push(`type.${role}: '${f.family}' is not installed on this Mac`);
      return { family: f.family, source, weight: Number(f.weight) || 700 };
    };
    b.type = {
      set: set ? set.id : null,
      display: face(ty.display || set?.display, 'display'),
      text: face(ty.text || set?.text || { family: 'system-ui' }, 'text'),
      mono: face(ty.mono || set?.mono || { family: 'ui-monospace', source: 'system' }, 'mono'),
    };
    if (!b.type.display) err.push('type: a display family');
  }
  // the motion: a headline style, an emphasis, a family of transitions, a pace, a shutter; null: my pick
  const mo = body.motion || {}, M = SCHEMA.motion;
  const pick = (v, list, k) => { if (v == null) return null; if (!list.includes(v)) err.push(`motion.${k}: ${JSON.stringify(v)}`); return v; };
  b.motion = {
    text: pick(mo.text, M.text.map((x) => x.id), 'text'),
    emphasis: pick(mo.emphasis, M.emphasis.map((x) => x.value).filter(Boolean), 'emphasis'),
    transition: pick(mo.transition, M.transitions.map((x) => x.id), 'transition'),
    pace: pick(mo.pace ?? 'measured', M.pace.map((x) => x.value), 'pace'),
    shutter: pick(mo.shutter ?? 360, M.shutter.map((x) => x.value), 'shutter'),
  };
  const accent = body.accent ?? null;
  if (accent !== null && !/^#[0-9A-F]{6}$/i.test(accent)) err.push(`accent: ${JSON.stringify(accent)}`); else b.accent = accent && accent.toUpperCase();
  const hint = body.accentHint ?? null; // the colour the previews used, when the brand is to be read
  b.accentHint = /^#[0-9A-F]{6}$/i.test(hint || '') ? hint.toUpperCase() : null;
  b.accentFrom = typeof body.accentFrom === 'string' ? body.accentFrom.slice(0, 300) : null;
  const scheme = body.scheme ?? 'analogous';
  if (!SCHEMA.schemes.includes(scheme)) err.push(`scheme: ${scheme}`); else b.scheme = scheme;
  const p = body.product || {};
  if (!p.name || (!p.path && !p.url)) err.push('product: a name, and a repository or a URL');
  b.product = { name: String(p.name || '').slice(0, 80), path: p.path || null, url: p.url || null, homepage: p.homepage || null, kit: !!p.kit };
  if (b.product.path && !existsSync(b.product.path)) err.push(`product.path: ${b.product.path} does not exist`);
  if (b.kind === 'release') b.release = { tag: String(body.release?.tag || p.tag || '').slice(0, 60) || null };
  if (b.kind === 'tutorial') b.tutorial = { task: String(body.task || '').slice(0, 4000) }; // what it teaches
  // the voice-over, any film's: who says it, how, and how it is written on the frame (null: no voice)
  const one = (k) => { const v = body[k] ?? F[k].default; if (!opt(k).includes(v)) err.push(`${k}: ${JSON.stringify(v)} is not one of ${opt(k).join(', ')}`); return v; };
  const voice = one('voice');
  b.voice = null;
  if (voice !== 'none') {
    const model = voice === 'model' ? one('voiceModel') : null; // a voice model's, said by voice.mjs: US English, and Italian with Kokoro's Sara
    const speaker = model && speakersOf(model).length ? body.voiceSpeaker ?? speakersOf(model)[0] : null, vm = model ? SCHEMA.voices.find((x) => x.model === model && (x.speaker || null) === speaker) : null;
    if (model && !vm) err.push(`voiceSpeaker: ${JSON.stringify(speaker)} is not a voice of ${model}`);
    const named = voice === 'mac' ? String(body.voiceName || '').slice(0, 80) || null : null, v = named && (VOICES || []).find((x) => x.name === named);
    if (named && !v) err.push(`voiceName: '${named}' is not a voice of this Mac`);
    b.voice = {
      kind: voice, model, speaker, tone: model && toned(model) ? one('voiceTone') : null, tempo: model ? one('voiceTempo') : null,
      name: named, quality: v ? v.quality || 'compact' : null, lang: v ? v.lang.replace('_', '-') : model ? vm?.lang || 'en-US' : null, rate: voice === 'mac' ? one('voiceRate') : null,
      human: one('voiceHuman'), script: String(body.voiceScript || '').trim().slice(0, 4000) || null, captions: one('captions'),
    };
  }
  if (b.duration === 0 && (b.kind === 'promo' || b.kind === 'film') && !b.voice) err.push(`duration: a ${b.kind} lasts as long as its voice only when it has one`);
  if (!SLUG.test(body.name || '')) err.push(`name: ${JSON.stringify(body.name)} (lowercase letters, digits, dots and dashes)`);
  else b.name = body.name;
  // the music: a track of the brand's library (musicTrack, its id here) or a file named; the prompt for a new one
  b.musicFile = b.music === 'track' ? String(body.musicFile || '').slice(0, 500) || null : null;
  b.musicSource = null;
  if (b.music === 'track' && body.musicTrack) {
    const tr = TRACKS.get(body.musicTrack);
    if (!tr) err.push('musicTrack: that track is not known to this Studio any more: choose it again');
    else { b.musicFile = tr.path; b.musicSource = { brand: tr.brand, file: tr.name, about: tr.about, upload: !!tr.upload }; }
  }
  b.musicPrompt = b.music === 'generate' ? String(body.musicPrompt || '').trim().slice(0, 3000) || null : null;
  b.musicMix = b.voice && (b.music === 'track' || b.music === 'generate') ? { under: one('musicUnder'), lift: one('musicLift') } : null;
  b.reference = String(body.reference || '').slice(0, 500);
  b.notes = String(body.notes || '').slice(0, 4000);
  b.recipe = String(body.recipe || 'custom').slice(0, 40);
  b.request = String(body.request || '').slice(0, 1000);
  return { err, brief: b };
}

// A track's beat, measured once per file and version (a second for five minutes of audio), in a process
// of its own, one at a time: analyze() is synchronous, and in this one it held up every preview the
// wizard was loading while the music step measured its library.
const BEATS = new Map(); // path:mtime:size → the promise of its measure
// the track first: beats.mjs runs its own command when the process's first argument names it
const MEASURE = `const { analyze } = await import(process.argv[2]); const A = analyze(process.argv[1]);
process.stdout.write(JSON.stringify({ bpm: A.bpm, steady: A.steady, drift: A.drift, at: A.downbeats[0] ?? null, sections: A.sections.map((s) => s.t), duration: A.duration, why: A.why || null }));`;
const measuring = serial();
function beatsOf(path) {
  const p = resolve(untilde(path)), st = statSync(p), key = `${p}:${st.mtimeMs}:${st.size}`;
  if (!BEATS.has(key)) {
    const job = measuring(async () => JSON.parse((await run(process.execPath, ['--input-type=module', '-e', MEASURE, await local(p), pathToFileURL(join(SKILL, 'scripts', 'beats.mjs')).href], { maxBuffer: 4 << 20, timeout: 180_000 })).stdout));
    BEATS.set(key, job.catch((e) => { BEATS.delete(key); throw e; })); // a measure that failed is tried again next time
  }
  return BEATS.get(key);
}

async function writeBrief(b) {
  const work = join(OUT, `${b.name}-work`);
  const brief = {
    schema: SCHEMA.version, createdAt: new Date().toISOString(), studio: 'manovella site-promo-film',
    ...b, work, deliver: deliveryDir(b.name, b.product?.name),
  };
  mkdirSync(work, { recursive: true });
  if (b.musicFile) { // the track beside the film (src/audio), and its beat, for PROMO_META.bpm and AUDIO_AT; null when it cannot be read
    brief.musicBeats = null;
    const from = resolve(untilde(b.musicFile));
    try {
      if (existsSync(from) && statSync(from).isFile()) {
        const dir = join(work, 'src', 'audio'), name = b.musicSource?.file || basename(from), ext = extname(name).toLowerCase() || extname(from).toLowerCase();
        const file = join(dir, `${name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track'}${ext}`);
        mkdirSync(dir, { recursive: true }); copyFileSync(await local(from), file);
        brief.musicFile = file; brief.musicSource = { ...(b.musicSource || {}), path: b.musicSource?.upload ? null : from };
        brief.musicBeats = await beatsOf(from); // the copy is the same bytes: its measure, made already in the wizard
      }
    } catch { brief.musicBeats = null; } // not audio ffmpeg reads, or a file that went: Claude asks
  }
  if (b.backdrop) { // the picture, as prepared: what the previews showed is what the film gets
    const src = await prepared(b.backdrop.image, 'full');
    const dir = join(work, 'src', 'backdrops'); mkdirSync(dir, { recursive: true });
    const file = join(dir, `${(b.backdrop.name || 'picture').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'picture'}.jpg`);
    copyFileSync(src, file);
    brief.backdrop = { ...b.backdrop, file };
  }
  if (b.type) { // the kit's faces and their licences beside the page; a Mac family is used by name
    for (const role of ['display', 'text', 'mono']) {
      const f = b.type[role];
      if (!f) continue;
      if (f.source === 'kit') {
        const fam = KIT_FONTS[f.family], dir = join(work, 'src', 'fonts', fam.slug);
        mkdirSync(dir, { recursive: true });
        for (const face of fam.faces) copyFileSync(join(FONT_DIR, face.file), join(work, 'src', 'fonts', face.file));
        copyFileSync(join(FONT_DIR, fam.slug, 'OFL.txt'), join(dir, 'OFL.txt'));
        brief.type[role] = { ...f, faces: fam.faces, base: 'fonts/' };
      } else if (f.source === 'mac') brief.type[role] = { ...f, file: (MAC_FONTS || []).find((m) => m.family === f.family)?.file || null };
    }
  }
  const file = join(work, 'brief.json');
  if (existsSync(file)) {
    const stamp = new Date(statSync(file).mtime).toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
    renameSync(file, join(work, `brief-${stamp}.json`)); // kept, never overwritten
  }
  writeFileSync(file, JSON.stringify(brief, null, 2) + '\n');
  const P = prefs();
  P.byProduct = P.byProduct || {};
  P.last = brief;
  if (b.product.path) P.byProduct[b.product.path] = brief;
  mkdirSync(PREFS_DIR, { recursive: true });
  writeFileSync(PREFS, JSON.stringify(P, null, 2) + '\n');
  return file;
}

/** A file dropped in the wizard, kept in the cache under its hash: { id, name, path }, or null when the
 *  answer is already sent (not a POST, not that kind of file). */
async function saveUpload(req, res, { ext, max, fallback, refused }) {
  if (req.method !== 'POST') { json(res, 405, {}); return null; }
  const name = decodeURIComponent(req.headers['x-name'] || fallback).slice(0, 200);
  if (!ext.test(name)) { json(res, 400, { error: refused }); return null; }
  const buf = await rawBody(req, max), id = idOf(buf);
  const dir = join(CACHE, 'uploads'); mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}${extname(name).toLowerCase()}`); writeFileSync(path, buf);
  return { id, name, path };
}

// ---------------------------------------------------------------- the server
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
function serveFile(res, route, rel) {
  for (const dir of ROUTES[route] || []) {
    const p = resolve(dir, '.' + sep + rel);
    if (p !== dir && !p.startsWith(dir + sep)) break; // nothing outside the route's own folder
    if (existsSync(p) && statSync(p).isFile()) {
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(route === 'studio' && (AGENT !== AGENTS.claude || !ON_MAC) && /\.(js|html)$/.test(p) ? agentCopy(readFileSync(p, 'utf8')) : readFileSync(p));
      return;
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
}
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const rawBody = (req, max) => new Promise((ok, ko) => {
  const parts = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > max) { req.destroy(); ko(new Error('too large')); } else parts.push(c); });
  req.on('end', () => ok(Buffer.concat(parts))); req.on('error', ko);
});
const body = (req) => new Promise((ok, ko) => {
  let s = ''; req.on('data', (c) => { s += c; if (s.length > 1 << 20) { req.destroy(); ko(new Error('too large')); } }); // answered, not left waiting
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { ko(e); } }); req.on('error', ko);
});

let win = null, done = false, lastPing = 0, byeTimer = null; // win: the window's process, the Studio's own app or Chrome
function finish(line) { // every ending comes through here, so the window goes on every one of them
  if (done) return; done = true;
  console.log(line);
  try { writeState({ end: line }); } catch (e) { console.error(`the state file: ${e.message}`); } // --wait then reads CLOSED
  if (win && win.exitCode === null) win.kill('SIGTERM');
  server.close();
  setTimeout(() => process.exit(0), 400).unref();
}

let ROOTS = [], LIST = null;
/** The products the step offers: the repositories under ROOTS, listed once per set of folders. */
function products(P = prefs()) {
  LIST = LIST || ROOTS.flatMap((r) => scan(r)).sort((a, b) => basename(a).localeCompare(basename(b), 'en', { sensitivity: 'base' }));
  return LIST.map((p) => ({ name: basename(p), path: p, last: !!P.byProduct?.[p] }));
}
// ---------------------------------------------------------------- the Settings: what they show and change
// Each folder setting (MANY): whether it is a list, what settings.json says (set) and what this run uses (used),
// both lists of absolute folders, one at most for a single folder; and the command line or the environment
// variable that overrides it for this run (lockedBy), which the Settings show instead of a control.
const givenBy = () => ({
  projectFolders: arg('--roots', null) ? '--roots' : process.env.MANOVELLA_ROOTS ? 'MANOVELLA_ROOTS' : null,
  musicLibrary: process.env.MANOVELLA_MUSIC ? 'MANOVELLA_MUSIC' : null,
  workRoot: arg('--out', null) ? '--out' : process.env.FILM_DOWNLOADS ? 'FILM_DOWNLOADS' : null,
});
const asWritten = (v) => [...new Set((v ? [].concat(v) : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => resolve(untilde(x.trim()))))];
function settingsView() {
  const s = readSettings(), list = (v) => (v ? [].concat(v) : []), by = givenBy();
  const used = { projectFolders: ROOTS, pictureFolders: imgDirs(), musicLibrary: musicLibrary(), workRoot: OUT };
  return { file: join(PREFS_DIR, 'settings.json'), deliverToLibrary: !!s.deliverToLibrary, ...Object.fromEntries(Object.entries(MANY).map(([k, many]) =>
    [k, { many, set: asWritten(s[k]), missing: asWritten(s[k]).filter((f) => !folder(f)), used: list(used[k]), lockedBy: by[k] || null }])) };
}
/** Writes what the Settings changed: the folders of a setting (none: back to its default; a single one keeps
 *  the first), each of which must be there. Then the run follows what depends on it: the products, the work root. */
async function saveSettings(b) {
  const patch = {}, by = givenBy(), s = readSettings();
  for (const [k, many] of Object.entries(MANY)) if (k in b) {
    if (by[k]) return { error: `given for this run by ${by[k]}` }; // the file would change and the run would not
    // a folder must be there, unless it was in the file already: one on a drive not mounted now is kept
    const want = asWritten(b[k]), had = asWritten(s[k]), bad = want.find((f) => !folder(f) && !had.includes(f));
    if (bad) return { error: `not a folder: ${bad}` };
    const got = want.map(tl);
    patch[k] = !got.length ? null : many ? got : got[0];
  }
  if ('deliverToLibrary' in b) patch.deliverToLibrary = b.deliverToLibrary ? true : null; // off: the key goes
  writeSettings(patch);
  if ('projectFolders' in patch) { ROOTS = await roots(); LIST = null; }
  if ('workRoot' in patch) OUT = outRoot();
  return { settings: settingsView(), roots: ROOTS, out: OUT, library: deliveryLibrary(), products: products() };
}
// The Studio answers only to its own address: a page on another site can make the browser send requests
// to 127.0.0.1 (DNS rebinding gives it the right to read the answers), so the Host must be ours, and a
// request that says where it came from (any POST from a browser) must come from our own page.
const server = createServer(async (req, res) => {
  const port = server.address()?.port, origin = req.headers.origin;
  if (![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(req.headers.host)
    || (req.method !== 'GET' && req.method !== 'HEAD' && origin !== undefined && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`)) {
    res.writeHead(403, { 'content-type': 'text/plain' }); return res.end('this Studio answers only to its own address');
  }
  // An address that is not one (a stray '%', a bare '//') is the caller's mistake and gets a 400. It used
  // to throw inside this async handler, which nothing catches: the Studio exited 1 with the wizard open.
  let url, rel;
  try { url = new URL(req.url, 'http://x'); rel = decodeURIComponent(url.pathname.split('/').slice(2).join('/')); }
  catch { res.writeHead(400, { 'content-type': 'text/plain' }); return res.end('bad address'); }
  const [, route, ...rest] = url.pathname.split('/');
  if (url.pathname === '/') { res.writeHead(302, { location: `/studio/index.html${url.search}` }); return res.end(); }
  if (route === 'images') { // /images/thumb/<id>.jpg, /images/full/<id>.jpg
    const [kind, file] = rest, id = (file || '').replace(/\.jpg$/, '');
    if (!['thumb', 'full'].includes(kind) || !IMAGES.has(id)) { res.writeHead(404); return res.end(); }
    try {
      const p = await prepared(id, kind);
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'max-age=3600' });
      return createReadStream(p).pipe(res);
    } catch (e) { res.writeHead(500); return res.end(String(e.message)); }
  }
  if (route !== 'api') return serveFile(res, route, rel);
  if (req.headers['x-studio-key'] !== KEY && url.searchParams.get('k') !== KEY) return json(res, 403, { error: 'key' });
  lastPing = Date.now();
  try {
    switch (rest[0]) {
      case 'ping': clearTimeout(byeTimer); return json(res, 200, { ok: true });
      case 'bye': // the page went away: closed, or reloading — a reload pings again within a moment
        clearTimeout(byeTimer); byeTimer = setTimeout(() => finish('CLOSED'), 5000); return json(res, 200, { ok: true });
      case 'context': {
        const P = prefs();
        return json(res, 200, { studio: { name: STUDIO.name, version: STUDIO.version }, agent: AGENT, app: AGENT?.app || 'your agent', agents: Object.values(AGENTS), platform: platform(), home: HOME, sep, schema: SCHEMA_COPY, roots: ROOTS, out: OUT, library: deliveryLibrary(), products: products(P), preselect: PRODUCT ? resolve(untilde(PRODUCT)) : await gitTop(process.cwd()), last: P.last || null });
      }
      case 'product': {
        const p = resolve(untilde(url.searchParams.get('path') || ''));
        if (!existsSync(join(p, '.git'))) return json(res, 404, { error: 'not a repository' });
        return json(res, 200, await product(p));
      }
      case 'images': return json(res, 200, { images: listImages(), dirs: imgDirs().map(tl) });
      case 'upload': {
        const up = await saveUpload(req, res, { ext: IMG_EXT, max: 150 << 20, fallback: 'picture.jpg', refused: 'not a picture: jpg, png, heic, webp or tiff' });
        if (!up) return;
        IMAGES.set(up.id, { path: up.path, name: up.name, upload: true });
        return json(res, 200, { id: up.id, name: up.name });
      }
      case 'voices': // ?fresh: read them again, after a voice was downloaded with the Studio open
        if (url.searchParams.has('fresh')) VOICES = null;
        return json(res, 200, { voices: await voices(), lang: SYSLANG });
      case 'voice': { // a few seconds of one, to listen to before choosing it
        const file = await macSample(url.searchParams);
        if (!file) return json(res, 404, { error: 'no such voice' });
        return sendFile(req, res, file, 'audio/wav');
      }
      case 'voice-models': return json(res, 200, voiceKit());
      case 'voice-sample': { // a line said by a voice model, as the film would say it: { id } once it is there
        const q = url.searchParams, model = q.get('model'), kit = voiceKit();
        const speakers = speakersOf(model), o = { model, speaker: speakers.length ? q.get('speaker') || speakers[0] : null, tone: q.get('tone') || 'warm', tempo: Number(q.get('tempo') || 1), human: q.get('human') || 'natural', text: String(q.get('text') || '').trim().slice(0, 300) };
        const offered = (k, v) => SCHEMA.fields[k].options.some((x) => x.value === v);
        if (!offered('voiceModel', model) || (o.speaker && !speakers.includes(o.speaker)) || !offered('voiceTone', o.tone) || !offered('voiceTempo', o.tempo) || !offered('voiceHuman', o.human) || !o.text) return json(res, 400, { error: 'not a sample the schema offers' });
        if (!toned(model)) o.tone = 'warm'; // no tone to read at: one sample serves every tone asked for
        if (!kit.silicon && model !== 'kokoro') return json(res, 409, { error: 'silicon', message: 'Chatterbox and Orpheus run on an Apple Silicon Mac; here, Kokoro.' });
        if (!kit.python) return json(res, 409, { error: 'setup', message: agentCopy(`Not set up on this Mac: Claude does it at the first film that speaks (a 600 MB Python, then 330 MB to 3.5 GB a model), or now: `) + kit.setup });
        if (!kit.models[model]) return json(res, 409, { error: 'download', message: agentCopy(`${model} is not on this Mac yet: ${SCHEMA.fields.voiceModel.options.find((x) => x.value === model).size}, downloaded once, at the first film that uses it (or now: `) + `${kit.setup}).` });
        try { return json(res, 200, { id: await sample(o) }); } catch (e) { return json(res, 500, { error: 'said', message: String(e.stderr || e.message || e).trim().split('\n').slice(-3).join(' ') }); }
      }
      case 'voice-mix': { // a sample over the music chosen, as the film will mix them: ?sample=<id> (a model's line) or ?voice=&rate= (a macOS voice's greeting), ?track=<id> or ?path=, ?under=&lift=
        const q = url.searchParams, F = SCHEMA.fields, under = Number(q.get('under')), lift = Number(q.get('lift'));
        if (!F.musicUnder.options.some((o) => o.value === under) || !F.musicLift.options.some((o) => o.value === lift)) return json(res, 400, { error: 'not a mix the schema offers' });
        const voice = q.get('sample') ? SAMPLES.get(q.get('sample')) : await macSample(q);
        if (!voice || !existsSync(voice)) return json(res, 404, { error: 'no such sample', message: 'the line is no longer here to mix' });
        const tr = TRACKS.get(q.get('track') || ''), music = tr ? tr.path : q.get('path') ? resolve(untilde(q.get('path'))) : null;
        if (!music || !existsSync(music) || !statSync(music).isFile()) return json(res, 404, { error: 'no such track', message: 'the track is no longer there' });
        try { return json(res, 200, { id: await mixed(voice, music, under, lift) }); } catch (e) { return json(res, 500, { error: 'mixed', message: String(e.stderr || e.message || e).trim().split('\n').slice(-2).join(' ') }); }
      }
      case 'sample': { // /api/sample/<id>.wav
        const file = SAMPLES.get((rest[1] || '').replace(/\.wav$/, ''));
        return file && existsSync(file) ? sendFile(req, res, file, 'audio/wav') : json(res, 404, { error: 'no such sample' });
      }
      case 'tracks': return json(res, 200, await listTracks(url.searchParams.get('product') || ''));
      case 'audio': { // /api/audio/<id>: a track to play, from a copy this process can read
        const tr = TRACKS.get(rest[1] || '');
        if (!tr) return json(res, 404, { error: 'no such track' });
        try { return sendFile(req, res, await local(tr.path), AUDIO_MIME[extname(tr.path).toLowerCase()] || 'application/octet-stream'); } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
      }
      case 'upload-audio': { // a track of the user's, dropped: kept in the cache, and copied into the work folder on Create
        const up = await saveUpload(req, res, { ext: AUDIO_EXT, max: 300 << 20, fallback: 'track.mp3', refused: 'not audio: mp3, m4a, aac, wav, aiff, flac or ogg' });
        if (!up) return;
        TRACKS.set(up.id, { path: up.path, name: up.name, brand: null, about: null, upload: true });
        return json(res, 200, { id: up.id, name: up.name });
      }
      case 'fonts': return json(res, 200, { kit: Object.entries(KIT_FONTS).map(([family, f]) => ({ family, axes: f.axes, faces: f.faces })), mac: await macFonts() });
      case 'beats': { // a track's tempo and bars, for the line under its field (?path) or its row (?track)
        const tr = TRACKS.get(url.searchParams.get('track') || ''), p = tr ? tr.path : resolve(untilde(url.searchParams.get('path') || ''));
        if (!existsSync(p)) return json(res, 404, { error: 'no such file' });
        if (!statSync(p).isFile()) return json(res, 404, { error: 'a folder' });
        try { return json(res, 200, await beatsOf(p)); } catch (e) { return json(res, 422, { error: 'not audio ffmpeg can read' }); }
      }
      case 'exists': { // is there a work folder with this name already, or a delivered film? and where it would go
        const n = url.searchParams.get('name') || '', to = SLUG.test(n) ? deliveryDir(n, url.searchParams.get('product') || '') : null;
        return json(res, 200, { work: SLUG.test(n) && existsSync(join(OUT, `${n}-work`)), deliver: !!to && existsSync(to), to });
      }
      case 'brief': {
        if (req.method !== 'POST') return json(res, 405, {});
        await macFonts(); // a Mac family in the brief is checked against what is installed
        await voices(); // and a voice against the ones this Mac has
        // and a track of the library against the ones listed (a Studio started again knows none: it lists them)
        if (!TRACKS.size) await listTracks('').catch(() => {});
        const { err, brief } = check(await body(req));
        if (err.length) return json(res, 400, { errors: err });
        const file = await writeBrief(brief);
        json(res, 200, { ok: true, path: file });
        return setTimeout(() => finish(`BRIEF ${file}`), 1200); // the page shows where it went first
      }
      case 'settings': {
        if (req.method !== 'POST') return json(res, 200, settingsView());
        const r = await saveSettings(await body(req));
        return json(res, r.error ? 400 : 200, r);
      }
      case 'choose-folder': { // the Mac's own folder picker: for the Settings, and a product outside the project folders
        if (req.method !== 'POST') return json(res, 405, {});
        // a test names the folder the picker would return ('' for Cancel)
        if (process.env.STUDIO_CHOOSE_FOLDER != null) { const f = folder(process.env.STUDIO_CHOOSE_FOLDER); return json(res, 200, f ? { path: f } : { cancelled: true }); }
        if (platform() !== 'darwin') return json(res, 501, { error: 'no folder picker here: type the path' });
        const prompt = String((await body(req)).prompt || 'Choose a folder').replace(/["\\]/g, '').slice(0, 120);
        try { // osascript's own dialog, brought to the front; Cancel is an error for osascript
          const f = folder((await run('osascript', ['-e', 'activate', '-e', `POSIX path of (choose folder with prompt "${prompt}")`])).stdout.trim());
          return json(res, 200, f ? { path: f } : { cancelled: true });
        } catch { return json(res, 200, { cancelled: true }); }
      }
      case 'cancel': json(res, 200, { ok: true }); return setTimeout(() => finish('CANCELLED'), 300);
      default: return json(res, 404, { error: 'no such call' });
    }
  } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
});


ROOTS = await roots();
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/?k=${KEY}`;
  console.log(`STUDIO ${url}`);
  writeState({ pid: process.pid, url, at: Date.now() });
  if (STATE) setInterval(() => { try { writeState({ at: Date.now() }); } catch { /* the next beat */ } }, 5000).unref(); // the heartbeat --wait reads
  if (!OPEN) return;
  win = openWindow(url);
  win?.on('exit', () => { if (!done) finish('CLOSED'); }); // the window went away without a brief
});

// The window, ours to close. The Studio's own app where this Mac has built it — studio.json and
// icon-1024.png here, made into ~/Applications/Manovella.app by the studio-window kit — so the Dock
// shows it under its own name, version and icon instead of as one more Google Chrome. The app pings
// the server itself, quits when its window closes (its exit reads as CLOSED, as Chrome's did) and
// when the server is gone; finish() ends it with SIGTERM. Else a Chrome app window on a profile of
// its own; else the default browser, with no window of our own to close. MANOVELLA_WINDOW=chrome
// keeps Chrome, and so does STUDIO_CHROME_ARGS (a test's headless Chrome).
function openWindow(url) {
  const app = join(HOME, 'Applications', `${STUDIO.name}.app`, 'Contents', 'MacOS', STUDIO.name);
  if (platform() === 'darwin' && existsSync(app) && process.env.MANOVELLA_WINDOW !== 'chrome' && !process.env.STUDIO_CHROME_ARGS) return spawn(app, ['--url', url], { stdio: 'ignore' });
  const bin = findChrome();
  if (!bin) { // the default browser, with no window of ours to close; or, without a desktop, the address alone
    if (!openInBrowser(url)) console.error(`no browser to open here: open ${url}`);
    return null;
  }
  const profile = process.env.STUDIO_PREFS ? join(PREFS_DIR, 'chrome') : join(CACHE, 'chrome');
  mkdirSync(profile, { recursive: true });
  return spawn(bin, [
    `--app=${url}`, `--user-data-dir=${profile}`, `--window-size=${STUDIO.width || 1480},${STUDIO.height || 940}`,
    '--no-first-run', '--no-default-browser-check', '--hide-crash-restore-bubble', '--disable-sync',
    // never touch the macOS keychain: a Chrome started from a background session cannot reach it and pops "Keychain Not Found"
    '--use-mock-keychain',
    // the window is ours: keep its heartbeat on time even when it is behind another window
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ...(process.env.STUDIO_CHROME_ARGS || '').split(' ').filter(Boolean),
  ], { stdio: 'ignore' });
}

// Nobody there: a window that stopped pinging (closed with Chrome left running), or never came.
const START = Date.now();
setInterval(() => {
  const now = Date.now();
  if (!lastPing && now - START > (OPEN ? 3 : 30) * 60_000) finish('TIMEOUT');
  if (lastPing && now - lastPing > (win ? 45_000 : 180_000)) finish('CLOSED');
  if (now - START > 3 * 3600_000) finish('TIMEOUT');
}, 5000).unref();
process.on('SIGINT', () => finish('CANCELLED'));
process.on('SIGTERM', () => finish('CANCELLED'));
