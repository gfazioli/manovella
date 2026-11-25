// The last step of a film: the finished files leave the work folder for a folder of their own,
// and the work folder goes to the Trash once the film is out and its source is safe.
//
//   node deliver.mjs <folder> <file>[=<name>] …        copy the finished videos and their covers into <folder>
//   node deliver.mjs trash <work> --kit <dir>           move the work folder to the Trash, once every source
//                                                      file in it is committed and pushed under <dir>
//   node deliver.mjs trash <work> [--kit <dir>] --discard
//                                                      the same, when the user has seen what would be lost
//                                                      and said it can go
//   … trash <work> --root <dir>                        a film begun before the work root changed: the root
//                                                      it is in (the guard below holds against that one)
//   node deliver.mjs --selftest                         drives every refusal on a scratch tree
//
// Two folders, by convention: <work root>/<name>-work/ holds everything made along the way (the
// source in src/, stills, sheets, drafts, the renders) and <name>/ only what gets used: each format
// and aspect of the film, its covers, its chapter list. The second goes where the user's
// instructions keep finished media, else to the work root; the first is thrown away once the film
// is released. The work root is ~/Downloads unless workRoot in Manovella's settings.json says
// otherwise (settings.mjs; FILM_DOWNLOADS, for a test, wins over both).
//
// deliver:
//   - Videos (.mp4 .mov .webm .gif) are probed: size, fps, duration, frames, codec, colour tags. A
//     video with chapters gets <name>-chapters.txt beside it, ready for a YouTube description.
//   - Covers (.png .jpg) go through ImageOptim when /Applications/ImageOptim.app is installed
//     (optional: headless, waited for, quit only if it was not
//     already open; without it they land as rendered), then each is compared with its original: same dimensions, the SSIM printed, a
//     warning under 0.995 (a gradient can band in a 256-colour palette) and over 2 MB (YouTube
//     refuses a thumbnail that size). OPTIM=0 skips it, for an image whose pixels must not change:
//     asked, never assumed.
//   - Text files (.txt .srt .vtt), a tutorial's subtitles among them, are copied byte for byte, named like the film.
//   - <file>=<name> delivers under another name: stills/t00.00.png=acme-2.4-poster.png
//   - Files are cloned (APFS: no extra space), never moved and never overwritten. Everything is
//     checked before anything is copied: a name already delivered with other content, a draft
//     (draft, preview or wip in the name), a folder inside the work folder (it would go to the
//     Trash with it) are refused. What was delivered is recorded in <work>/.delivered.json, so a
//     second run skips it and trash knows which renders left.
// trash:
//   - Only a folder inside the work root whose name ends in -work and which holds a film page (an
//     .html setting PROMO_META): a delivery folder never does.
//   - Source: every .html .js .mjs .cjs .swift .py .sh .css .svg .md .json in it, and every other
//     file in a page's own folder, whatever it is (a picture, a font, a track: what the page
//     draws is its source too), outside node_modules and dot folders (package*.json and
//     labels.json are the tools' own). Each must be under --kit <dir> with the same bytes, at the
//     same path relative to the page or anywhere else, in a commit some remote branch contains. A
//     file the kit's .gitignore ignores is generated: skipped. So is what the tools write to be
//     looked at and can write again: folders named stills*, sheet*, looks*, poster*, drafts*, and
//     contact*.png, sheet*.png, looks*.png (code in them is still source).
//   - Renders: every video in it that is not a draft must have been delivered, and its delivered
//     copy must still be where it went, with the same bytes.
//   - A loose file at the top of the folder that is none of those (a poster, notes, a track) must
//     have been delivered too, or it is listed as kept nowhere.
//   - The other folders beside the source are listed with how many files and how much they hold,
//     and not checked: look at that line before the folder goes.
//   - What would be lost is listed and refused, unless --discard. DRY=1 checks and reports and
//     moves nothing. The move is /usr/bin/trash (macOS 15+), Finder before that; on Linux `gio trash`,
//     else trash-cli's trash-put; on Windows the Recycle Bin, through PowerShell.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const VIDEO = ['.mp4', '.mov', '.webm', '.gif'];
const IMAGE = ['.png', '.jpg', '.jpeg'];
const TEXT = ['.txt', '.srt', '.vtt']; // copied byte for byte: never optimised or probed (a tutorial's subtitle files ride beside its film)
const SOURCE = ['.html', '.js', '.mjs', '.cjs', '.swift', '.py', '.sh', '.css', '.svg', '.md', '.json'];
const TOOLS_OWN = ['package.json', 'package-lock.json', 'labels.json'];
const DRAFT = /draft|preview|\bwip\b/i;
// What render.mjs and contact.mjs write to be looked at, and write again from the source: by folder, or by name
const REVIEW_DIR = /^(stills|sheets?|looks|posters?|drafts)/i, REVIEW_FILE = /^(contact|sheet|looks).*\.png$/i;
// the work root: FILM_DOWNLOADS (a test's), else workRoot in Manovella's settings.json, else ~/Downloads. Read
// here rather than imported from settings.mjs, whose workRoot() it mirrors: this file is copied into a film's
// src/ on its own (the guide's by-hand start), and an import of a sibling would stop it there.
function workRoot() {
  const home = homedir(), ex = (p) => resolve(p === '~' ? home : /^~[\\/]/.test(p) ? join(home, p.slice(2)) : p);
  if (process.env.FILM_DOWNLOADS) return ex(process.env.FILM_DOWNLOADS);
  const env = process.env; // the settings' folder, as scripts/platform.mjs has it (not imported: see above)
  const prefs = env.STUDIO_PREFS ? ex(env.STUDIO_PREFS)
    : platform() === 'darwin' ? join(home, 'Library', 'Application Support', 'manovella')
      : platform() === 'win32' ? join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'manovella')
        : join(env.XDG_CONFIG_HOME || join(home, '.config'), 'manovella');
  try {
    const w = JSON.parse(readFileSync(join(prefs, 'settings.json'), 'utf8')).workRoot;
    if (typeof w === 'string' && w.trim() && statSync(ex(w.trim())).isDirectory()) return ex(w.trim());
  } catch { /* no file, or no such folder: the default */ }
  return join(home, 'Downloads');
}
const WORK_ROOT = workRoot();
const DRY = process.env.DRY === '1';

const fail = (msg) => { console.error('refused: ' + msg); process.exit(1); };
const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: 'utf8', ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const inside = (a, b) => a === b || a.startsWith(b + sep); // a is b, or under it
// a path under another, as git writes it (with /) on every system: what is said and what git is asked
const relTo = (from, to) => relative(from, to).split(sep).join('/');
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
// A path printed as a command to paste, quoted when it has a space or a quote in it (in double quotes
// on Windows, whose shells take no single ones); and the line that opens a folder there.
const WIN = platform() === 'win32';
const q = (p) => (/^[\w@%+=:,./~-]+$/.test(p) ? p : WIN ? `"${p}"` : `'${p.replace(/'/g, `'\\''`)}'`);
const openLine = (p) => (WIN ? `start "" "${p}"` : `${platform() === 'darwin' ? 'open' : 'xdg-open'} ${q(p)}`);
const clock = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.floor(s % 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(r).padStart(2, '0')}`;
};
// a folder's size on disk: du's, or the files' sizes added up where there is no du (Windows)
const kb = (dir) => {
  const k = Number((run('du', ['-sk', dir]).stdout || '').split('\t')[0]);
  if (k) return k * 1024;
  const all = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? all(join(d, e.name)) : e.isFile() ? statSync(join(d, e.name)).size : 0), 0);
  try { return all(dir); } catch { return 0; }
};
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p);
  }
  return out;
}
/** The film's work folder a file came from: its nearest ancestor named *-work. */
function workOf(file) {
  for (let d = dirname(file); d !== dirname(d); d = dirname(d)) if (basename(d).endsWith('-work')) return d;
  return null;
}
const readManifest = (work) => {
  const f = join(work, '.delivered.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
};
function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-show_chapters', file]);
  if (r.status !== 0) fail(`${file}: ffprobe cannot read it (${r.stderr.trim() || 'is ffmpeg installed?'})`);
  return JSON.parse(r.stdout);
}
const dims = (file) => { const v = probe(file).streams[0]; return `${v.width}×${v.height}`; };
// Whether a probed video stream carries alpha: ProRes 4444 decodes with an alpha plane; VP9 keeps its
// alpha beside the picture and says so in a tag (alpha_mode, ALPHA_MODE once remuxed). The same test
// is in render.mjs (neither script can import the other): change both.
const hasAlpha = (v) => /^(yuva|gbrap|rgba|bgra|argb|abgr)/.test(v.pix_fmt || '') || Object.entries(v.tags || {}).some(([k, x]) => k.toLowerCase() === 'alpha_mode' && x === '1');

// ------------------------------------------------------------------ deliver
async function deliver(folderArg, specs) {
  if (!folderArg || !specs.length) usage();
  const folder = resolve(folderArg);
  if (basename(folder).endsWith('-work')) fail(`${basename(folder)} ends in -work, the name of a folder that is thrown away`);
  const items = specs.map((s) => {
    const i = s.lastIndexOf('=');
    const renamed = i > 0 && !s.slice(i + 1).includes('/');
    return { from: resolve(renamed ? s.slice(0, i) : s), name: renamed ? s.slice(i + 1) : basename(s) };
  });
  // Every check first: nothing is copied unless everything can be.
  const names = new Set();
  const manifests = new Map();
  for (const it of items) {
    const ext = extname(it.name).toLowerCase();
    if (!existsSync(it.from) || !statSync(it.from).isFile()) fail(`${it.from}: no such file`);
    if (extname(it.from).toLowerCase() !== ext) fail(`${it.name}: a new name keeps the format (${extname(it.from)})`);
    it.kind = VIDEO.includes(ext) ? 'video' : IMAGE.includes(ext) ? 'image' : TEXT.includes(ext) ? 'text' : null;
    if (!it.kind) fail(`${it.name}: not something to deliver (${[...VIDEO, ...IMAGE, ...TEXT].join(' ')})`);
    if (DRAFT.test(it.name)) fail(`${it.name}: a draft is not delivered. Render the master, or rename the file if it is one`);
    if (names.has(it.name)) fail(`${it.name}: named twice`);
    if (!it.name.startsWith(basename(folder))) fail(`${it.name} does not start with ${basename(folder)}: the film gets a folder of its own, named after it`);
    names.add(it.name);
    it.work = workOf(it.from);
    const home = it.work || dirname(it.from);
    if (inside(folder, home)) fail(`${folder} is inside ${home}, where the film was made: it would go to the Trash with it`);
    if (inside(it.from, folder)) fail(`${it.from} is already inside ${folder}`);
    it.to = join(folder, it.name);
    it.sourceSha = sha(it.from);
    if (it.work && !manifests.has(it.work)) manifests.set(it.work, readManifest(it.work));
    if (existsSync(it.to)) {
      const was = (manifests.get(it.work) || []).find((e) => e.to === it.to);
      const now = sha(it.to);
      if (now !== it.sourceSha && !(was && was.sourceSha === it.sourceSha && was.sha === now)) {
        fail(`${it.to} is already delivered, with other content. Deliver the new cut under a new name (-v2), or move the old one to the Trash first`);
      }
      it.skip = true;
    }
    if (it.kind === 'video') {
      it.probe = probe(it.from);
      const ch = it.probe.chapters || [];
      if (ch.length) {
        const text = ch.map((c) => `${clock(Number(c.start_time))} ${c.tags?.title || ''}`.trim()).join('\n') + '\n';
        const to = join(folder, it.name.replace(/\.[^.]+$/, '') + '-chapters.txt');
        if (names.has(basename(to))) fail(`${basename(to)}: named twice`);
        names.add(basename(to));
        if (existsSync(to) && readFileSync(to, 'utf8') !== text) fail(`${to} is already delivered, with other content`);
        it.chapters = { to, text, list: ch };
      }
    }
  }

  // Covers are optimised on a staged copy before they land, so a folder on a synced drive
  // receives the final bytes once and its trash never gets the originals.
  const images = items.filter((it) => !it.skip && it.kind === 'image');
  const stage = mkdtempSync(join(tmpdir(), 'deliver-stage-'));
  let optim = null;
  try {
    for (const it of images) copyFileSync(it.from, (it.staged = join(stage, it.name)), constants.COPYFILE_FICLONE);
    if (images.length) optim = await imageOptim(images.map((i) => i.staged));
    mkdirSync(folder, { recursive: true });
    for (const it of items) {
      if (!it.skip) {
        const src = it.staged || it.from;
        copyFileSync(src, it.to, constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL);
        if (sha(it.to) !== sha(src)) fail(`${it.to}: the copy differs from ${src}`);
      }
      if (it.chapters) writeFileSync(it.chapters.to, it.chapters.text);
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  console.log(`delivered → ${folder}`);
  for (const it of items) {
    const size = statSync(it.to).size;
    const tag = it.skip ? '  (already there)' : '';
    if (it.kind === 'video') {
      const v = it.probe.streams.find((s) => s.codec_type === 'video');
      const audio = it.probe.streams.some((s) => s.codec_type === 'audio');
      const [n, d] = String(v.avg_frame_rate || v.r_frame_rate).split('/').map(Number);
      const fps = d ? n / d : n;
      const dur = Number(it.probe.format.duration);
      const frames = v.nb_frames ? Number(v.nb_frames) : null;
      const tags = [v.color_primaries, v.color_transfer, v.color_space].filter(Boolean);
      const bits = (v.pix_fmt || '').match(/(10|12)le$/)?.[1], alpha = hasAlpha(v); // ProRes 4444 decodes 12-bit
      console.log(`  ${it.name}  ${v.width}×${v.height}  ${+fps.toFixed(3)} fps  ${dur.toFixed(2)} s  ${frames ?? '?'} frames  ${v.codec_name}` +
        `${bits ? ` ${bits}-bit` : ''}${alpha ? ' alpha' : ''}  ${tags.length ? tags[0] : 'untagged'}  ${audio ? 'audio' : 'no audio'}  ${mb(size)}${tag}`);
      if (frames != null && Math.abs(frames - Math.round(fps * dur)) > 1) console.log(`    warning: ${frames} frames in ${dur.toFixed(2)} s at ${fps} fps`);
      if (extname(it.name) !== '.gif' && !(tags.length === 3 && tags.every((t) => t === 'bt709'))) {
        console.log(`    warning: colour tags ${tags.join('/') || 'missing'}, not BT.709: players will guess the colours`);
      }
      if (it.chapters) {
        const c = it.chapters.list;
        console.log(`  ${basename(it.chapters.to)}  ${c.length} chapters, for a YouTube description`);
        if (Number(c[0].start_time) !== 0) console.log('    warning: YouTube wants the first chapter at 0:00');
        const short = c.filter((x) => Number(x.end_time) - Number(x.start_time) < 10);
        if (short.length) console.log(`    warning: YouTube wants each chapter 10 s or longer (${short.map((x) => x.tags?.title || x.id).join(', ')})`);
      }
    } else if (it.kind === 'image' && !it.skip) {
      const before = statSync(it.from).size;
      const a = dims(it.from), b = dims(it.to);
      const ssim = optim === 'ImageOptim' ? ssimOf(it.from, it.to) : null;
      console.log(`  ${it.name}  ${b}  ${mb(before)} → ${mb(size)}${ssim != null ? `  SSIM ${ssim.toFixed(4)}` : ''}`);
      if (a !== b) fail(`${it.to}: ${a} became ${b} in ImageOptim`);
      if (ssim != null && ssim < 0.995) console.log('    warning: look at it before using it: a gradient can band in a palette');
      if (size > 2 * 1048576) console.log('    warning: over 2 MB, which YouTube refuses for a thumbnail');
    } else {
      console.log(`  ${it.name}  ${mb(size)}${tag}`);
    }
  }
  if (optim) console.log(`covers: ${optim}`);
  for (const [work, entries] of manifests) {
    const mine = items.filter((it) => it.work === work);
    const kept = entries.filter((e) => !mine.some((it) => it.to === e.to));
    const now = mine.map((it) => ({ name: it.name, from: it.from, to: it.to, sourceSha: it.sourceSha, sha: sha(it.to) }));
    writeFileSync(join(work, '.delivered.json'), JSON.stringify([...kept, ...now], null, 2) + '\n');
  }
  console.log(`\n  ${openLine(folder)}`);
  for (const work of manifests.keys()) {
    console.log(`\nthe work folder stays, ${mb(kb(work))}: ${work}\n  once the film is out: node deliver.mjs trash ${q(work)} --kit <repo>/scripts/film`);
  }
  if (items.some((it) => !it.work)) console.log('\nnote: some files came from outside a *-work folder, so nothing records that they were delivered');
}

async function imageOptim(files) {
  const app = '/Applications/ImageOptim.app';
  if (process.env.OPTIM === '0') return 'as rendered (OPTIM=0)';
  if (process.platform !== 'darwin' || !existsSync(app)) return 'as rendered: ImageOptim is not installed';
  const wasOpen = run('pgrep', ['-x', 'ImageOptim']).status === 0;
  run('open', ['-g', '-a', app, ...files]);
  const queue = () => {
    const r = run('osascript', ['-e', 'tell application "ImageOptim" to do queuecount command']);
    if (r.status !== 0) fail(`ImageOptim does not answer: ${r.stderr.trim()}`);
    return r.stdout.trim();
  };
  await sleep(3000); // the files reach the queue after open returns
  const t0 = Date.now();
  for (let zeros = 0; zeros < 2;) {
    if (Date.now() - t0 > 600e3) fail('ImageOptim did not finish in 10 minutes');
    zeros = queue() === '0' ? zeros + 1 : 0;
    if (zeros < 2) await sleep(zeros ? 3000 : 2000);
  }
  if (!wasOpen) run('osascript', ['-e', 'quit app "ImageOptim"']);
  return 'ImageOptim';
}
function ssimOf(a, b) {
  const r = run('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', '[0]format=rgb24[x];[1]format=rgb24[y];[x][y]ssim', '-f', 'null', '-']);
  const m = r.stderr.match(/All:([\d.]+)/);
  return m ? Number(m[1]) : null;
}

// ------------------------------------------------------------------ trash
/** The folder to the Trash, never deleted outright: macOS's trash or Finder, Linux's gio or trash-cli,
 *  Windows' Recycle Bin (the path given through the environment, so no quoting reaches PowerShell). */
function toTrash(dir) {
  if (platform() === 'darwin') {
    return existsSync('/usr/bin/trash') ? run('/usr/bin/trash', [dir])
      : run('osascript', ['-e', `tell application "Finder" to delete (POSIX file ${JSON.stringify(dir)})`]);
  }
  if (WIN) {
    return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName Microsoft.VisualBasic; '
      + "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:MANOVELLA_TRASH, 'OnlyErrorDialogs', 'SendToRecycleBin')"],
    { env: { ...process.env, MANOVELLA_TRASH: dir } });
  }
  const gio = run('gio', ['trash', dir]);
  if (!gio.error) return gio;
  const cli = run('trash-put', [dir]);
  return cli.error ? { status: 1, stderr: 'no trash here: install gio (glib) or trash-cli' } : cli;
}
function trash(workArg, flags) {
  if (!workArg) usage();
  const work = resolve(workArg);
  if (!existsSync(work) || !statSync(work).isDirectory()) fail(`${work}: no such folder`);
  const base = flags.root ? resolve(flags.root) : WORK_ROOT;
  if (work === base || !inside(work, base)) fail(`${work} is not inside ${base}: only a film's work folder there is thrown away (one begun before the work root changed: --root <the folder it is in>)`);
  if (!basename(work).endsWith('-work')) {
    fail(`${basename(work)} does not end in -work. A folder from before the split: deliver its finished files first, then rename it <name>-work`);
  }
  const files = walk(work);
  // A film page, or the script that sets its PROMO_META (a kit may keep it in a shared .js). A
  // delivery folder never holds either. The folder they sit in is the one a kit mirrors.
  const pages = files.filter((f) => /\.(html|js)$/.test(f) && readFileSync(f, 'utf8').includes('PROMO_META'));
  if (!pages.length) fail(`${work} holds no film source (an .html or .js setting PROMO_META): is it a delivery folder?`);
  const segs = pages.map((p) => dirname(p).split(sep));
  let n = 0;
  while (segs.every((s) => n < s.length && s[n] === segs[0][n])) n++;
  const root = segs[0].slice(0, n).join(sep) || sep;

  // A source file is safe when its content is a blob some remote branch of the kit's repository
  // reaches: at any path, in any commit, so a kit that was edited after the film, or reorganised,
  // still counts. Objects are compared as git hashes them, never by path, so no path has to agree.
  const lost = [];
  const kit = flags.kit ? resolve(flags.kit) : null;
  const git = (argv) => run('git', ['-C', kit, ...argv], { maxBuffer: 1 << 30 });
  const objects = (...refs) => new Set(git(['rev-list', '--objects', ...refs]).stdout.split('\n')
    .map((l) => (l.match(/^[0-9a-f]{40}(?:[0-9a-f]{24})?(?= |$)/) || [])[0]).filter(Boolean)); // each record starts with an id
  let repo = null, pushed = null, anywhere = null, bySha = null;
  if (kit) {
    if (!existsSync(kit) || !statSync(kit).isDirectory()) fail(`--kit ${kit}: no such folder`);
    repo = git(['rev-parse', '--show-toplevel']).stdout.trim();
    if (!repo) fail(`--kit ${kit} is not in a git repository`);
    pushed = objects('--remotes');
  }
  // Source is code wherever it is, and everything else in the page's own folder: a picture the page
  // draws exists nowhere else either. Not the tools' own files, not a video (a
  // render, below), not what the tools write to be looked at (code in such a folder still counts).
  const isVideo = (f) => VIDEO.includes(extname(f).toLowerCase());
  const review = (f) => REVIEW_FILE.test(basename(f)) || relative(work, dirname(f)).split(sep).some((d) => REVIEW_DIR.test(d));
  // A render counts as delivered only while its copy is still where it went, with the bytes it
  // left with: the manifest records a delivery, not that the copy survived it.
  const manifest = readManifest(work);
  const kept = (e) => typeof e.to === 'string' && existsSync(e.to) && sha(e.to) === e.sha;
  const delivered = new Set(manifest.filter(kept).map((e) => e.sourceSha));
  const gone = new Map(manifest.filter((e) => !kept(e)).map((e) => [e.sourceSha, e.to]));
  // A page's own folder, not the folder the pages have in common: with an older page kept in
  // another folder that is the whole work folder, and every still and original in it became source.
  const pageDirs = [...new Set(pages.map((p) => dirname(p)))], withPage = (f) => pageDirs.some((d) => inside(f, d));
  // A file that is not code and was delivered is safe where it went, wherever it sits here: with the
  // page at the top of the work folder (a folder from before src/), a delivered poster is beside it.
  const sources = files.filter((f) => !TOOLS_OWN.includes(basename(f)) && !isVideo(f)
    && (SOURCE.includes(extname(f).toLowerCase()) || (withPage(f) && !review(f) && !delivered.has(sha(f)))));
  let current = 0, history = 0, generated = 0;
  for (const f of sources) {
    const rel = relTo(root, f);
    if (!kit) { lost.push(`${rel}  (source, no --kit given)`); continue; }
    const blob = git(['hash-object', '--no-filters', '--', f]).stdout.trim();
    const same = rel.startsWith('..') ? null : join(kit, rel);
    if (pushed.has(blob)) {
      if (same && existsSync(same) && sha(same) === sha(f)) current++; else history++;
      continue;
    }
    if (same && git(['check-ignore', '-q', '--', rel]).status === 0) { generated++; continue; }
    // lost: say why, since the fix differs
    anywhere ??= objects('--all');
    if (!bySha) { bySha = new Map(); for (const k of walk(kit)) bySha.set(sha(k), k); }
    const why = anywhere.has(blob) ? `committed in ${basename(repo)}, not on any remote branch: push it (or fetch)`
      : bySha.has(sha(f)) ? `in the kit as ${relTo(kit, bySha.get(sha(f)))}, not committed`
      : same && existsSync(same) ? `differs from the kit's ${rel}`
      : 'not in the kit';
    lost.push(`${rel}  (source, ${why})`);
  }
  for (const f of files.filter((x) => isVideo(x) && !DRAFT.test(relative(work, x)))) {
    const s = sha(f);
    if (delivered.has(s)) continue;
    lost.push(`${relTo(work, f)}  (render, ${gone.has(s) ? `its delivered copy is gone or changed: ${gone.get(s)}` : 'never delivered'})`);
  }
  // What is left is neither source nor a render. A loose file at the top (a poster, notes, a track)
  // must have been delivered; the folders beside the source are counted and shown, not judged: a
  // folder of stills is in every work folder, and refusing them all would make --discard a habit.
  const isSource = new Set(sources), beside = new Map();
  for (const f of files.filter((x) => !isSource.has(x) && !isVideo(x) && !TOOLS_OWN.includes(basename(x)) && !SOURCE.includes(extname(x).toLowerCase()) && !withPage(x))) {
    const rel = relTo(work, f), top = rel.split('/')[0];
    if (top !== rel) { const b = beside.get(top) || { n: 0, bytes: 0 }; b.n++; b.bytes += statSync(f).size; beside.set(top, b); continue; }
    if (review(f)) continue;
    const s = sha(f);
    if (delivered.has(s)) continue;
    lost.push(`${rel}  (loose file, ${gone.has(s) ? `its delivered copy is gone or changed: ${gone.get(s)}` : 'kept nowhere: deliver it, or put it with the source'})`);
  }

  console.log(`${work}  ${mb(kb(work))}`);
  if (kit) console.log(`  kit: ${kit}, in ${repo}`);
  console.log(`  source: ${sources.length} files: ${current} in the kit, ${history} only in its pushed history, ${generated} generated (ignored by it), ${sources.length - current - history - generated} kept nowhere`);
  console.log(`  delivered from it: ${manifest.length} files, ${delivered.size} still in place`);
  if (beside.size) console.log(`  beside the source, not checked: ${[...beside].map(([d, b]) => `${d}/ ${b.n} file${b.n === 1 ? '' : 's'}, ${mb(b.bytes)}`).join(' · ')}`);
  if (lost.length) {
    console.log(`\nexists nowhere else, and goes with the folder:\n${lost.map((l) => '  ' + l).join('\n')}`);
    if (!flags.discard) fail(`${lost.length} file(s) above would be lost. Commit them to the kit, deliver them, or pass --discard once the user has seen this list and said they can go`);
  }
  if (DRY) { console.log('\nDRY=1: nothing moved'); return; }
  const r = toTrash(work);
  if (r.status !== 0 || existsSync(work)) fail(`the move to the Trash failed: ${(r.stderr || r.error?.message || '').trim() || 'the folder is still there'}`);
  console.log(`\nmoved to the Trash: ${work}`);
}

// ------------------------------------------------------------------ selftest
function selftest() {
  const T = mkdtempSync(join(tmpdir(), 'deliver-selftest-'));
  const D = join(T, 'Downloads'), W = join(D, 'demo-work'), S = join(W, 'src');
  const put = (f, s) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, s); };
  const ff = (argv) => { const r = run('ffmpeg', ['-y', '-loglevel', 'error', ...argv]); if (r.status !== 0) throw new Error(r.stderr); };
  const g = (dir, ...argv) => {
    const r = run('git', ['-C', dir, '-c', 'user.name=selftest', '-c', 'user.email=selftest@example.invalid', '-c', 'core.hooksPath=/dev/null', ...argv]);
    if (r.status !== 0) throw new Error(`git ${argv.join(' ')}: ${r.stderr}`);
  };
  try {
    put(join(S, 'film.html'), '<script>window.PROMO_META = { width: 64, height: 64 }</script>');
    put(join(S, 'kit.js'), '// the kit\n');
    put(join(S, 'assets.js'), '// generated\n');
    put(join(S, 'package.json'), '{}\n');
    put(join(W, 'demo.srt'), '1\n00:00:00,000 --> 00:00:01,000\nHello\n');
    put(join(T, 'chapters.txt'), ';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=10000\ntitle=One\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=10000\nEND=20000\ntitle=Two\n');
    const tagged = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
    ff(['-f', 'lavfi', '-i', 'color=c=gray:s=64x64:r=10:d=20', '-i', join(T, 'chapters.txt'), '-map', '0:v', '-map_chapters', '1', ...tagged, join(W, 'demo.mp4')]);
    ff(['-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=10:d=2', ...tagged, join(W, 'demo-preview.mp4')]);
    mkdirSync(join(W, 'v2'));
    ff(['-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=10:d=2', ...tagged, join(W, 'v2', 'x.mp4')]);
    ff(['-f', 'lavfi', '-i', 'testsrc2=s=64x36', '-frames:v', '1', join(W, 'poster.png')]);
    mkdirSync(join(T, 'elsewhere-work')); put(join(T, 'elsewhere-work', 'f.html'), 'PROMO_META');
    put(join(T, 'prefs', 'settings.json'), JSON.stringify({ workRoot: D })); // Manovella's settings, the test's own
    put(join(D, 'demo-film', 'f.html'), 'PROMO_META');
    put(join(D, 'loose-work', 'x.txt'), 'no page here');
    // the kit: a repository with a remote, the page and kit.js committed, assets.js ignored
    const R = join(T, 'remote.git'), K = join(T, 'repo'), KF = join(K, 'scripts', 'film');
    mkdirSync(R); g(R, 'init', '-q', '--bare');
    mkdirSync(K); g(K, 'init', '-q', '-b', 'main'); g(K, 'remote', 'add', 'origin', R);
    put(join(KF, 'film.html'), readFileSync(join(S, 'film.html'))); put(join(KF, 'kit.js'), readFileSync(join(S, 'kit.js')));
    put(join(KF, '.gitignore'), 'assets.js\nnode_modules/\n');
    g(K, 'add', '-A'); g(K, 'commit', '-q', '-m', 'kit');

    const env = { FILM_DOWNLOADS: D, OPTIM: '0' };
    const cases = [
      ['deliver refuses a draft', 1, 'draft', [join(D, 'demo'), join(W, 'demo-preview.mp4')]],
      ['deliver refuses a folder inside the work folder', 1, 'Trash with', [join(W, 'demo'), join(W, 'demo.mp4')]],
      ['deliver refuses a folder named -work', 1, 'thrown away', [join(D, 'final-work'), join(W, 'demo.mp4')]],
      ['deliver refuses a missing file', 1, 'no such file', [join(D, 'demo'), join(W, 'nope.mp4')]],
      ['deliver refuses a folder not named after the film', 1, 'a folder of its own', [join(D, 'video'), join(W, 'demo.mp4')]],
      ['deliver copies, probes and writes the chapters', 0, 'demo-chapters.txt', [join(D, 'demo'), join(W, 'demo.mp4'), join(W, 'poster.png') + '=demo-poster.png']],
      ['deliver copies a subtitle file byte for byte', 0, 'demo.srt', [join(D, 'demo'), join(W, 'demo.mp4'), join(W, 'demo.srt')]],
      ['the delivered .srt is the same bytes', 'check', () => sha(join(D, 'demo', 'demo.srt')) === sha(join(W, 'demo.srt'))],
      ['the delivered video is the same bytes', 'check', () => sha(join(D, 'demo', 'demo.mp4')) === sha(join(W, 'demo.mp4'))],
      ['the chapter list is YouTube\'s', 'check', () => readFileSync(join(D, 'demo', 'demo-chapters.txt'), 'utf8') === '0:00 One\n0:10 Two\n'],
      ['a path with a space is printed quoted, ready to paste', 0, openLine(join(T, 'My Drive', 'demo')), [join(T, 'My Drive', 'demo'), join(W, 'poster.png') + '=demo-poster.png']],
      ['a second run skips what is there', 0, 'already there', [join(D, 'demo'), join(W, 'demo.mp4'), join(W, 'poster.png') + '=demo-poster.png']],
      ['deliver refuses other content under a delivered name', 1, 'other content', [join(D, 'demo'), join(W, 'v2', 'x.mp4') + '=demo.mp4']],
      ['trash refuses a folder outside the work root', 1, 'not inside', ['trash', join(T, 'elsewhere-work')]],
      ['the work root is workRoot in settings.json when FILM_DOWNLOADS is not set', 1, `not inside ${D}`, ['trash', join(T, 'elsewhere-work')], { FILM_DOWNLOADS: '', STUDIO_PREFS: join(T, 'prefs') }],
      ['a copy of this file on its own runs, as the guide copies it into src/', 'check', () => {
        put(join(T, 'alone', 'deliver.mjs'), readFileSync(SELF));
        const r = run(process.execPath, [join(T, 'alone', 'deliver.mjs'), 'trash', join(T, 'elsewhere-work')], { env: { ...process.env, ...env, FILM_DOWNLOADS: '', STUDIO_PREFS: join(T, 'prefs') } });
        return r.status === 1 && `${r.stdout}${r.stderr}`.includes(`not inside ${D}`);
      }],
      ['trash refuses a name without -work', 1, 'does not end in -work', ['trash', join(D, 'demo-film')]],
      ['the work root moved on: the film begun under the old one is refused, and the refusal says --root', 1, '--root <the folder it is in>', ['trash', join(D, 'demo-film')], { FILM_DOWNLOADS: join(T, 'elsewhere') }],
      ['with --root it is judged against that root, and the other checks still hold', 1, 'does not end in -work', ['trash', join(D, 'demo-film'), '--root', D], { FILM_DOWNLOADS: join(T, 'elsewhere') }],
      ['trash refuses a folder with no film source', 1, 'no film source', ['trash', join(D, 'loose-work')]],
      ['trash refuses with no kit', 1, 'kit.js  (source, no --kit given)', ['trash', W], { DRY: '1' }],
      ['trash refuses a kit committed but not pushed', 1, 'not on any remote branch', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['push', 'do', () => g(K, 'push', '-q', 'origin', 'main')],
      ['trash refuses an undelivered render', 1, 'v2/x.mp4  (render, never delivered)', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['drop it', 'do', () => rmSync(join(W, 'v2'), { recursive: true })],
      ['trash passes: pushed kit, generated file skipped, render delivered', 0, '1 generated (ignored by it), 0 kept nowhere', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['the delivered copy is replaced', 'do', () => { renameSync(join(D, 'demo', 'demo.mp4'), join(T, 'demo-delivered.mp4')); put(join(D, 'demo', 'demo.mp4'), 'another cut'); }],
      ['trash refuses a render whose delivered copy changed', 1, 'demo.mp4  (render, its delivered copy is gone or changed', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['the delivered copy is removed', 'do', () => rmSync(join(D, 'demo', 'demo.mp4'))],
      ['trash refuses a render whose delivered copy is gone', 1, 'its delivered copy is gone or changed', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['put it back', 'do', () => renameSync(join(T, 'demo-delivered.mp4'), join(D, 'demo', 'demo.mp4'))],
      ['the kit is edited after the film', 'do', () => { put(join(KF, 'kit.js'), '// the kit, edited\n'); g(K, 'commit', '-qam', 'edit'); g(K, 'push', '-q', 'origin', 'main'); }],
      ['a version only in the kit\'s pushed history is safe', 0, '1 in the kit, 1 only in its pushed history', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['change the page after the commit', 'do', () => put(join(S, 'film.html'), '<script>window.PROMO_META = { width: 65 }</script>')],
      ['trash refuses a page that differs from the kit', 1, "differs from the kit's film.html", ['trash', W, '--kit', KF], { DRY: '1' }],
      ['copy it into the kit, uncommitted', 'do', () => put(join(KF, 'next', 'film.html'), readFileSync(join(S, 'film.html')))],
      ['trash refuses a kit file not committed', 1, 'in the kit as next/film.html, not committed', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['trash --discard lists the loss and goes on', 0, 'film.html  (source, in the kit as', ['trash', W, '--kit', KF, '--discard'], { DRY: '1' }],
      ['DRY moved nothing', 'check', () => existsSync(W)],
      // every file, not only code: from a folder that passes again
      ['put the page back, drop the uncommitted copy', 'do', () => { put(join(S, 'film.html'), readFileSync(join(KF, 'film.html'))); rmSync(join(KF, 'next'), { recursive: true }); }],
      ['it passes again', 0, '0 kept nowhere', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['a picture the page draws, nowhere else', 'do', () => put(join(S, 'assets', 'room.jpg'), 'a picture')],
      ['trash refuses a picture in the source folder that the kit does not have', 1, 'assets/room.jpg  (source, not in the kit)', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['commit and push it', 'do', () => { put(join(KF, 'assets', 'room.jpg'), 'a picture'); g(K, 'add', '-A'); g(K, 'commit', '-q', '-m', 'picture'); g(K, 'push', '-q', 'origin', 'main'); }],
      ['a pushed picture is safe', 0, '2 in the kit, 1 only in its pushed history, 1 generated (ignored by it), 0 kept nowhere', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['frames the kit ignores, stills the tools wrote', 'do', () => { put(join(S, 'frames', 'f1.jpg'), 'a frame'); put(join(S, 'stills', 't00.00.png'), 'a still'); put(join(KF, '.gitignore'), 'assets.js\nnode_modules/\nframes/\n'); g(K, 'commit', '-qam', 'ignore frames'); g(K, 'push', '-q', 'origin', 'main'); }],
      ['ignored frames are generated, stills are not counted', 0, '2 in the kit, 1 only in its pushed history, 2 generated (ignored by it), 0 kept nowhere', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['notes at the top of the folder', 'do', () => put(join(W, 'notes.txt'), 'ideas')],
      ['trash refuses a loose file that was never delivered', 1, 'notes.txt  (loose file, kept nowhere', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['notes away; a folder of originals and one of stills beside the source', 'do', () => { rmSync(join(W, 'notes.txt')); put(join(W, 'codex', 'original.png'), 'an original'); put(join(W, 'stills', 'a.png'), 'a still'); put(join(W, 'contact.png'), 'a sheet'); put(join(W, 'sheet.png'), 'a sheet'); put(join(S, 'looks.png'), 'the looks'); }],
      ['folders beside the source are listed, not refused', 0, 'beside the source, not checked: codex/ 1 file, 0.0 MB · stills/ 1 file, 0.0 MB', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['an older page in a folder of its own, in the kit', 'do', () => { const old = '<script>window.PROMO_META = { width: 1 }</script>'; put(join(W, 'v1', 'film.html'), old); put(join(KF, 'v1', 'film.html'), old); g(K, 'add', '-A'); g(K, 'commit', '-q', '-m', 'v1'); g(K, 'push', '-q', 'origin', 'main'); }],
      ['two pages in two folders do not make the whole work folder source', 0, 'beside the source, not checked: codex/ 1 file, 0.0 MB · stills/ 1 file, 0.0 MB', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['code in a drafts folder', 'do', () => put(join(W, 'drafts', 'old.html'), '<p>an older page</p>')],
      ['trash still refuses code, wherever it is', 1, 'drafts/old.html  (source, not in the kit)', ['trash', W, '--kit', KF], { DRY: '1' }],
      ['that page away; both delivered copies of the poster removed', 'do', () => { rmSync(join(W, 'drafts'), { recursive: true }); rmSync(join(D, 'demo', 'demo-poster.png')); rmSync(join(T, 'My Drive', 'demo', 'demo-poster.png')); }],
      ['a folder from before src/: the page at its top, a cover beside it', 'do', () => { put(join(D, 'flat-work', 'film.html'), readFileSync(join(KF, 'film.html'))); ff(['-f', 'lavfi', '-i', 'testsrc2=s=64x36', '-frames:v', '1', join(D, 'flat-work', 'cover.png')]); }],
      ['trash refuses the cover while it is not delivered', 1, 'cover.png  (source, not in the kit)', ['trash', join(D, 'flat-work'), '--kit', KF], { DRY: '1' }],
      ['deliver it', 0, 'flat-cover.png', [join(D, 'flat'), join(D, 'flat-work', 'cover.png') + '=flat-cover.png']],
      ['a delivered cover beside a page at the top is safe', 0, '0 kept nowhere', ['trash', join(D, 'flat-work'), '--kit', KF], { DRY: '1' }],
      ['trash refuses a loose file whose delivered copy is gone', 1, 'poster.png  (loose file, its delivered copy is gone or changed', ['trash', W, '--kit', KF], { DRY: '1' }],
    ];
    let bad = 0;
    for (const [name, want, needle, argv, extra] of cases) {
      let ok, got = '';
      if (want === 'check') ok = needle();
      else if (want === 'do') { needle(); continue; }
      else {
        const r = run(process.execPath, [SELF, ...argv], { env: { ...process.env, ...env, ...extra } });
        got = (r.stdout || '') + (r.stderr || '');
        ok = r.status === want && got.includes(needle);
      }
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : '\n' + got.replace(/^/gm, '        ')}`);
    }
    console.log(bad ? `\n${bad} failed` : '\nall passed');
    process.exitCode = bad ? 1 : 0;
  } finally {
    rmSync(T, { recursive: true, force: true });
  }
}

function usage() {
  console.error('usage: deliver.mjs <folder> <file>[=<name>] … | trash <work> [--kit <dir>] [--discard] | --selftest');
  process.exit(2);
}

const argv = process.argv.slice(2);
if (argv[0] === '--selftest') selftest();
else if (argv[0] === 'trash') {
  const flags = { kit: null, discard: false, root: null };
  const rest = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--kit') flags.kit = argv[++i];
    else if (argv[i] === '--discard') flags.discard = true;
    else if (argv[i] === '--root') flags.root = argv[++i];
    else rest.push(argv[i]);
  }
  if (rest.length !== 1) usage();
  trash(rest[0], flags);
} else if (argv.length) await deliver(argv[0], argv.slice(1));
else usage();
