// Renders a seek(t) page through the installed Chrome (playwright-core, channel 'chrome').
//
//   node render.mjs stills <outdir> t1 t2 …        one PNG per time, in seconds
//   node render.mjs sheet <outdir> [n]             stills at the page's checkpoints (PROMO_META.checkpoints,
//                                                  e.g. a timeline's: each scene settled, each transition
//                                                  half way), or n even times; writes labels.json for contact.mjs
//   node render.mjs looks <outdir> <t> [preset…]   frame t once per fx.js look preset, for choosing
//   node render.mjs loopcheck                      frame 0 against the last subframe (PSNR must be inf)
//   node render.mjs video <out> [workers]          SUB subframes per frame, blended with tmix
//   node render.mjs beats                          AUDIO=<track>: the page's beats against the track's (below)
//
// The page is ./promo.html unless PAGE=<path>, which may carry a hash: PAGE='release.html#square'.
// It must expose window.PROMO_META = { width, height, fps, duration, bpm?, loop?, chapters?, checkpoints?, inputs? },
// window.ready (a promise) and window.seek(t, opts). SUB (default 16) is the number of subframes per frame.
// Each subframe also gets a subpixel offset, opts.jitter = [dx, dy], on a stratified grid, which a
// page with film.js's STAGE applies to everything it draws: the blend that averages the subframes
// is then an antialias as well (text and rasters stop stepping in slow moves). JITTER=0 turns it off.
// SHUTTER (or PROMO_META.shutter), in degrees, is how much of each frame's interval its subframes
// cover: 360 (the default) all of it, the smoothest blur; 180 a film camera's half, crisper moves
// with a cinema cadence; 0 one moment per frame, antialiased but without motion blur.
// SHUTTER_PHASE (or PROMO_META.shutterPhase), in degrees of a frame from -360 to 360, is when the
// shutter opens: 0 (the default) on the frame's own moment, so the blur trails forward from it;
// -SHUTTER/2 centres it on the frame (a 180 shutter at -90), so a move blurs as much before the
// moment as after; a moment before the film's first or past its last wraps in a loop and holds
// the end otherwise.
// A frame whose picture moves fast gets SUB_FAST subframes (default 48) instead of SUB: at 16, a
// fast push showed its 16 moments as copies about 12 px apart. Before the render, every frame is
// captured once at a quarter of its size and the mean difference to the next one (0-255) is its
// speed; above FAST (default 4), and on either side of such a frame, it is fast. SUB_FAST=0 turns
// it off. A resumed render keeps the fast frames it was planned with.
//
// video, the rest of the environment:
//   FROM, TO     seconds: render a range only — a chapter, a transition — and the output is that range
//   PREVIEW=1    a draft: one subframe, no jitter, a fast encode at SCALE=0.5 — about 16x faster
//   SCALE=0.5    scale the output; the page still renders at its own size
//   CHUNK=5      seconds per chunk; the workers take chunks from one queue, so a slow chapter does not
//                hold up a worker that finished early
//   RESUME=1     reuse the chunks a stopped render left in .segments.noindex/, if the page, its scripts, the
//                files it loaded as it opened (pictures, fonts, stylesheets), what PROMO_META.inputs names
//                (files or folders beside the page that it loads later, while it seeks: a frame a step)
//                and these settings are unchanged (checked, refused otherwise)
//   KEEP=1       keep the chunks after a good encode: another format then costs an encode, not a render
//   AUDIO=<file> a track under the video, from AUDIO_AT=<s> into it, faded out over the last 0.6 s and
//                brought to AUDIO_LUFS (default -14, where YouTube and the streaming services play music):
//                loudnorm in two passes on the stretch the film uses and nothing after it, linear (one gain:
//                the mix keeps its dynamics) whenever that gain leaves the true peak at or under -1.5 dBTP,
//                and said before the render when it does not (loudnorm then rides the level instead);
//                never raised by more than 12 dB (a quiet stretch stays quiet rather than pumping up its
//                noise floor), then the file is measured again and both printed.
//                AUDIO_NORM=0 keeps the track as it is. AUDIO=click muxes a metronome on the page's bpm, to
//                hear the cuts land (never normalized: it is a tool, not a soundtrack).
//                Before it renders, the track's beat is measured (beats.mjs, beside this file, on the whole
//                track) and the page's B(n) laid on it from AUDIO_AT: the tempo, whether the page's beats
//                land on the track's (within 35 ms), and the bpm and AUDIO_AT that make them land if they
//                do not. It never stops a render (a track that is not there does, before it starts);
//                `render.mjs beats` prints only that, exit 1 on a miss. The track is checked before the
//                render as well: a file without sound, or AUDIO_AT past its end, stops it there; a track
//                that ends before the film, or a second or more of silence in it, is said, and the
//                render goes on.
//   HEVC=1       an .mp4 as H.265 10-bit (tagged hvc1, so QuickTime and Safari play it) instead of H.264
//   ALPHA=1      a transparent background, for a film laid over other footage in an editor: the page
//                captured on a clear background (with fx.js's look 'transparent', #look=transparent, it
//                draws none), each chunk kept lossless with its alpha (FFV1, 16-bit RGBA) and its
//                subframes averaged on premultiplied colour (on straight colour a moving edge darkens),
//                into a .mov as ProRes 4444 or a .webm as VP9 with alpha; .mp4 and .gif have no alpha
//                and are refused. stills, sheet and looks take it too: PNGs with their alpha. Measured on
//                1 s of promo.html: laid over the page's own colour, every frame within 2 levels of the
//                opaque render of the same range (53.5 dB).
//   WORKERS=n    browsers rendering at once; default a third of the cores (6 on 18). The old habit of 8-12
//                on a laptop kept every core busy for minutes and took the chip to 91 °C.
//   QOS=utility  the macOS QoS class the whole render runs in, Chrome and ffmpeg included (children
//                inherit it): utility (default), background (much cooler, about a third of the
//                speed on one thread: for a long film left to run), or default (full speed, hottest).
//   TEMP_MAX=80  the thermal governor: the chip's hottest die sensor is read every 2 s (scripts/
//                thermo.swift, compiled once, no sudo) and above this many °C the workers hold between
//                frames until it is 8 °C cooler. 0 turns it off. Without swiftc it falls back to macOS's
//                own thermal state (holds at 'serious'). Measured on 8 s of reel.html (M5 Pro): 12 workers
//                at full speed reached 87.9 °C inside a minute; the defaults held 80.0 °C with no pause,
//                in three times as long. README.md beside the skill has the table.
// The extension of <out> picks the format: .mp4 (H.264 or HEVC), .mov (ProRes 422 HQ, for an editor),
// .webm (VP9, for the web), .gif (GIF_FPS=30, GIF_W=960, a palette per film). PROMO_META.chapters
// ([{ t, title }]) becomes chapter marks in an .mp4 or .mov, and a list to paste into a YouTube
// description is printed. Last, the finished file is probed against what was asked (its size, its
// frames, its length, its BT.709 tags, its sound), and a file that does not match fails the render,
// chunks kept.
// Two more guards. A page that loses a WebGL context (Chrome keeps 16 a page and drops the oldest,
// which then draws nothing) fails the capture that would have shown it, a video's chunk unkept. And
// each cut (a page and its hash) keeps its chunks in .segments.noindex/<cut>/: a square cut after the
// master leaves the master's kept chunks alone, and a second render of the same cut while one runs
// stops at once (its fresh start would delete the first one's chunks).
import { chromium } from 'playwright-core';
import { spawn, spawnSync, execFile } from 'node:child_process';
import { constants as osc, cpus, homedir, setPriority } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { constants as fsc, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

const [PAGE_FILE, PAGE_HASH = ''] = (process.env.PAGE || 'promo.html').split('#');
const PAGE = resolve(PAGE_FILE);
const HERE = dirname(PAGE);
const PREVIEW = process.env.PREVIEW === '1', ALPHA = process.env.ALPHA === '1';
const SUB = PREVIEW ? 1 : Number(process.env.SUB || 16);
// The subframes' subpixel offsets. SUB = k*k: a k x k grid in a Latin-square order, so each run of
// k subframes covers every row and column (a time slice of a moving object is still stratified);
// any other SUB: the R2 low-discrepancy sequence. Offsets are in pixels, within [-0.5, 0.5).
function makeJitter(n) {
  const k = Math.round(Math.sqrt(n));
  if (k * k === n) {
    const perm = k === 4 ? [0, 2, 1, 3] : Array.from({ length: k }, (_, i) => i);
    return Array.from({ length: n }, (_, s) => {
      const a = Math.floor(s / k), b = s % k;
      return [(perm[b] + 0.5) / k - 0.5, ((a + b) % k + 0.5) / k - 0.5];
    });
  }
  const g = 1.32471795724474602596, a1 = 1 / g, a2 = 1 / (g * g);
  return Array.from({ length: n }, (_, s) => [((0.5 + a1 * s) % 1) - 0.5, ((0.5 + a2 * s) % 1) - 0.5]);
}
const JITTER = SUB > 1 && process.env.JITTER !== '0' ? makeJitter(SUB) : null;
// the fast frames' count; SUB_FAST=0 (or not above SUB) turns it off, and a draft never has it
const SUB_FAST = PREVIEW ? 0 : Number(process.env.SUB_FAST || 48), FAST = Number(process.env.FAST || 4);
const ADAPT = SUB > 1 && SUB_FAST > SUB;
// a fast frame's offsets: a multiple of SUB repeats SUB's grid, so it antialiases like the frames
// beside it, and each SUB-long run of its subframes (a slice of its interval) is a whole grid
const jitterFor = (n) => (!JITTER ? null : n % SUB ? makeJitter(n) : Array.from({ length: n }, (_, s) => JITTER[s % SUB]));
const [mode, ...args] = process.argv.slice(2);

// ---------------------------------------------------------------- heat
// A video render re-runs itself inside a macOS QoS class, so Chrome and ffmpeg inherit it. On Linux
// and Windows it lowers its own priority instead (below normal), which they inherit the same way.
const QOS = process.env.QOS || 'utility';
if (mode === 'video' && process.platform === 'darwin' && QOS !== 'default' && !process.env.FILM_QOS) {
  const r = spawnSync('taskpolicy', ['-c', QOS, process.execPath, ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, FILM_QOS: QOS } });
  process.exit(r.status ?? 1);
}
if (mode === 'video' && process.platform !== 'darwin' && QOS !== 'default') {
  try { setPriority(0, osc.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed here: the render runs at normal priority */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A reader for the chip's temperature in °C, or for macOS's thermal state (0-3) as a fallback,
 *  or null. The Swift helper is compiled once per version of its source. On Linux, the hottest CPU
 *  sensor (hwmon's coretemp, k10temp…, else a CPU thermal zone); on Windows none: no governor. */
function thermometer() {
  if (process.platform === 'linux') return linuxThermometer();
  if (process.platform !== 'darwin') return null;
  const src = join(dirname(fileURLToPath(import.meta.url)), 'thermo.swift');
  if (existsSync(src)) {
    const dir = join(homedir(), 'Library', 'Caches', 'film-render');
    const bin = join(dir, 'thermo-' + createHash('sha1').update(readFileSync(src)).digest('hex').slice(0, 10));
    if (!existsSync(bin)) {
      console.log('heat: compiling the thermometer, once (scripts/thermo.swift)');
      mkdirSync(dir, { recursive: true }); spawnSync('swiftc', ['-O', src, '-o', bin], { stdio: 'ignore' });
    }
    if (existsSync(bin)) {
      return { unit: '°C', read: () => new Promise((res) => execFile(bin, (e, out) => res(e ? null : Number((out.match(/max ([\d.]+)/) || [])[1]) || null))) };
    }
  }
  const js = 'ObjC.import("Foundation"); $.NSProcessInfo.processInfo.thermalState';
  return { unit: 'state', read: () => new Promise((res) => execFile('osascript', ['-l', 'JavaScript', '-e', js], (e, out) => res(e ? null : Number(out)))) };
}
function linuxThermometer() {
  const ls = (d) => { try { return readdirSync(d); } catch { return []; } };
  const text = (f) => { try { return readFileSync(f, 'utf8').trim(); } catch { return ''; } };
  let files = ls('/sys/class/hwmon').map((h) => join('/sys/class/hwmon', h))
    .filter((d) => /^(coretemp|k10temp|zenpower|cpu_thermal|cpu-thermal|soc_thermal)$/.test(text(join(d, 'name'))))
    .flatMap((d) => ls(d).filter((f) => /^temp\d+_input$/.test(f)).map((f) => join(d, f)));
  if (!files.length) {
    files = ls('/sys/class/thermal').filter((z) => z.startsWith('thermal_zone')).map((z) => join('/sys/class/thermal', z))
      .filter((d) => /x86_pkg_temp|cpu|soc/i.test(text(join(d, 'type')))).map((d) => join(d, 'temp'));
  }
  if (!files.length) return null;
  return { unit: '°C', read: async () => { const t = files.map((f) => Number(text(f)) / 1000).filter((x) => x > 0 && x < 150); return t.length ? Math.max(...t) : null; } };
}
const url = (extra) => {
  const h = [PAGE_HASH, extra].filter(Boolean).join('&');
  return pathToFileURL(PAGE).href + (h ? '#' + h : ''); // 'file://' + a Windows path is no address
};

const CDP = new WeakMap();
// Now and then, on a busy machine, a browser captured its page at its window's own size instead of
// the viewport asked for: 1920x993 (a 1080-high screen less the browser's bars), while the page
// itself said 1920x1080. The encode scaled those frames back up, a shade softer, and the render did
// not repeat. A PNG's size is in its header (IHDR), so a capture is checked once the page
// is ready, and the viewport set again; the reference frame and the subframes are checked later.
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];
// Chrome keeps 16 WebGL contexts a page and, past that, loses the oldest, which draws nothing from
// then on: no exception, only a console warning. promo.html with 16 more contexts lost its card's
// (PSNR 11.8 dB against the right still) and the stills came out without it, exit 0. Every WebGL
// context the page makes is noted before its scripts run, and every capture checks them first.
function watchGL() {
  const refs = [], known = new WeakSet();
  for (const C of [HTMLCanvasElement, OffscreenCanvas]) {
    const get = C.prototype.getContext;
    C.prototype.getContext = function (type, ...rest) {
      const ctx = get.call(this, type, ...rest);
      if (ctx && /webgl/.test(type) && !known.has(ctx)) { known.add(ctx); refs.push(new WeakRef(ctx)); }
      return ctx;
    };
  }
  // [lost, all] among the contexts still alive: held weakly, so one the page lets go can still be freed
  window.__filmGL = () => { const live = refs.map((r) => r.deref()).filter(Boolean); return [live.filter((g) => g.isContextLost()).length, live.length]; };
}
function assertGL([lost, all]) {
  if (lost) throw new Error(`the page lost ${lost} of its ${all} WebGL contexts, and a lost one draws nothing, with no error: Chrome keeps 16 a page and drops the oldest past that. Each fx.js WebGL base (mesh, flow, blobs, aurora…) is one, and so is each canvas the page draws with WebGL: use fewer in one page, or a 2D base for some looks`);
}
/** Every file at a path, itself or all under it, sorted: a folder's order on disk is not a film's.
 *  Links are followed, and a linked folder is walked under its own name: `current -> a` pointed at
 *  `b` is other frames at the same paths, so it must count as itself, not as a folder already seen.
 *  Only a link back to a folder it sits in is not walked (it has no end); a link to nothing stops it. */
function filesUnder(at, above = []) {
  let st; try { st = statSync(at); } catch { throw new Error(`PROMO_META.inputs: ${at} is a link to nothing`); }
  if (!st.isDirectory()) return st.isFile() ? [at] : [];
  const real = realpathSync(at);
  if (above.includes(real)) return [];
  return readdirSync(at).filter((n) => !n.startsWith('.')).sort().flatMap((n) => filesUnder(join(at, n), [...above, real]));
}
// The local files a page asked for and got: what the chunk key hashes beside the page and its scripts.
const LOADED = new Set();
async function openPage(browser, meta, extraHash) {
  const w = meta?.width || 1920, h = meta?.height || 1080;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('requestfinished', (r) => { try { if (r.url().startsWith('file:')) LOADED.add(fileURLToPath(r.url().split('#')[0].split('?')[0])); } catch { /* a file: URL that names no path */ } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  const said = new Set(); // WebGL warnings once each: Chrome repeats some on every draw
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('console:', m.text());
    else if (m.type() === 'warning' && /webgl/i.test(m.text()) && !said.has(m.text())) { said.add(m.text()); console.error('console:', m.text()); }
  });
  await page.addInitScript(watchGL);
  CDP.set(page, await page.context().newCDPSession(page));
  // ALPHA: what the canvas leaves clear stays clear in the capture, the page's own background too
  if (ALPHA) await CDP.get(page).send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (let i = 1; i <= 3; i++) {
    await page.goto(url(extraHash));
    if (ALPHA) await page.addStyleTag({ content: 'html,body{background:transparent!important}' });
    await page.evaluate(() => window.ready);
    const { data } = await CDP.get(page).send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    const [pw, ph] = pngSize(Buffer.from(data, 'base64'));
    if (pw === w && ph === h) break;
    console.log(`a page captured at ${pw}x${ph}, not ${w}x${h}: ${i < 3 ? 'setting its viewport again' : 'left to the checks after it'}`);
    if (i < 3) await page.setViewportSize({ width: w, height: h });
  }
  return page;
}
// A lossless PNG like page.screenshot's, pixel for pixel (measured), but encoded for speed: a frame
// with grain is 2-3 MB of noise, which the default encoder took ~220 ms over, against ~60 ms.
// clip: CDP's, for a smaller picture (opts go to seek). The seek and the WebGL check are one round
// trip, so a context the seek pushed out (a look made on its first frame) stops it before the capture.
const shot = async (page, t, opts = {}, clip) => {
  assertGL(await page.evaluate(async ([tt, o]) => { await window.seek(tt, o); return window.__filmGL(); }, [t, opts]));
  const { data } = await CDP.get(page).send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, ...(clip && { clip }) });
  return Buffer.from(data, 'base64');
};
// a write to ffmpeg's stdin that waits when the pipe is full
const feed = (ff, buf) => ff.stdin.write(buf) || new Promise((r) => ff.stdin.once('drain', r));
const ffmpeg = (argv, opts = {}) => new Promise((res, rej) => {
  const ff = spawn('ffmpeg', argv, { stdio: opts.stdio || ['ignore', 'inherit', 'inherit'] });
  if (opts.onSpawn) opts.onSpawn(ff);
  let err = '';
  if (ff.stderr) ff.stderr.on('data', (d) => (err += d));
  ff.on('close', (c) => (c === 0 || opts.anyExit ? res(err) : rej(new Error('ffmpeg exited ' + c))));
});
// One render of a cut at a time. Each cut (a page and its hash) keeps its chunks in its own folder,
// so a square cut rendered after the master leaves the master's kept chunks alone; two renders of
// the same cut at once would share that folder, and the second one's fresh start would delete the
// first one's chunks. The lock is the kernel's: macOS's open(2) takes O_EXLOCK, a lock held while the
// process lives and gone with it however it ends, so a killed render leaves nothing to take over and
// no two renders can both think they hold it. The file stays: unlinked at exit, a render that had
// looked it up just before could lock the old file while another made and locked a new one.
// Elsewhere the file holds the render's pid, made only if it is not there (wx): a file whose process
// is gone is taken over, and the render removes its own at exit.
const O_EXLOCK = 0x20; // <sys/fcntl.h>: open(2) is given the flags as they are, Node only lacks the name
function lockCut(file, cut) {
  const busy = () => new Error(`another render of ${cut} is running, and this one would delete its chunks: wait for it to finish`);
  if (process.platform === 'darwin') {
    // never closed: the lock lasts as long as the process
    try { openSync(file, fsc.O_RDWR | fsc.O_CREAT | fsc.O_NONBLOCK | O_EXLOCK); } catch (e) { throw e.code === 'EAGAIN' ? busy() : e; }
    return;
  }
  // a pid is the holder only while it lives and is not this process's own: a container starts every
  // render with the same pid, and a lock left by a render stopped with Ctrl-C would otherwise hold forever
  const alive = (pid) => { if (pid === process.pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  const mine = () => { try { if (readFileSync(file, 'utf8') === String(process.pid)) unlinkSync(file); } catch { /* gone */ } };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, String(process.pid), { flag: 'wx' });
      process.on('exit', mine);
      for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { mine(); process.exit(130); });
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid = 0; try { pid = Number(readFileSync(file, 'utf8')); } catch { /* removed meanwhile */ }
      if (pid && alive(pid)) throw new Error(`${busy().message} (process ${pid} holds ${file}; if no render is running, delete that file)`);
      try { unlinkSync(file); } catch { /* another render took it over first: the next attempt says so */ }
    }
  }
  throw busy();
}
// The frames that move fast, one '1' or '0' a frame from F0. Each frame is captured once at a quarter of its
// size, without jitter or grain, on `pages` pages of the first browser at once, and ffmpeg gives
// the mean absolute difference (0-255) between it and the next frame: the speed across the interval
// its subframes span. Measured on reel.html against 16 and 48 subframes (no jitter, no grain,
// lossless): the two part below 52 dB PSNR from a speed of about 6, and agree to 61-68 dB under 2.
async function fastFrames(browser, meta, F0, F1, pages, heat) {
  const n = F1 - F0, per = Math.ceil(n / pages), clip = { x: 0, y: 0, width: meta.width, height: meta.height, scale: 0.25 };
  const parts = await Promise.all(Array.from({ length: Math.ceil(n / per) }, async (_, i) => {
    const a = F0 + i * per, b = Math.min(F1, a + per);
    const page = await openPage(browser, meta);
    let ff, out = '';
    const closed = ffmpeg(['-v', 'error', '-f', 'image2pipe', '-i', '-', '-vf',
      'format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'],
    { stdio: ['pipe', 'pipe', 'inherit'], onSpawn: (p) => { ff = p; p.stdout.on('data', (d) => (out += d)); } });
    try {
      for (let f = a; f <= b; f++) { // b as well: the last frame's interval ends on it
        while (heat.hot) await sleep(500);
        await feed(ff, await shot(page, f / meta.fps, { loopcheck: true }, clip));
      }
    } catch (e) { // a capture that failed (a lost WebGL context): ffmpeg goes quietly, not with a pipe it calls broken
      ff.kill('SIGKILL'); closed.catch(() => {}); throw e;
    }
    ff.stdin.end(); await closed; await page.close();
    return [...out.matchAll(/YAVG=([\d.]+(?:e[-+]?\d+)?)/g)].map((m) => Number(m[1])); // 7.71605e-06: one pixel, one level
  }));
  const v = parts.flat();
  if (v.length !== n) throw new Error(`measuring how fast the frames move: ${v.length} speeds for ${n} frames`);
  // fast: above FAST, or beside a frame that is (a move starts and stops between two captures)
  return v.map((x, i) => +(x > FAST || v[i - 1] > FAST || v[i + 1] > FAST)).join('');
}
// a soundtrack's loudness: loudnorm's first pass on the stretch the film uses, and the second pass's
// filter built from it (linear: one gain for the whole track, unless the true peak would pass -1.5 dBTP)
const LUFS = Number(process.env.AUDIO_LUFS || -14);
// silencedetect rides in the same decode: the stretches under -60 dB for a second or more, in the
// film's seconds (an input -ss starts the clock at 0). One still silent at the end runs to len.
// src ends the input where the film ends (an input -t): under an output -t loudnorm read on past it
// and counted what it read, so five quiet seconds of a louder track measured -21 LUFS for -55, and
// sound the film does not have set its gain.
async function measureLoudness(src, len) {
  const r = await ffmpeg(['-hide_banner', '-nostats', ...src, '-vn',
    '-af', `silencedetect=n=-60dB:d=1,loudnorm=I=${LUFS}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
  // the events are paired first, then held to the film, so an interval never ends past it
  const pairs = [];
  for (const [, k, v] of r.matchAll(/silence_(start|end): (-?[\d.]+(?:e[-+]?\d+)?)/g)) {
    if (k === 'start') pairs.push([Number(v), Infinity]); else if (pairs.at(-1)?.[1] === Infinity) pairs.at(-1)[1] = Number(v);
  }
  const silent = pairs.map(([a, b]) => [Math.max(0, a), Math.min(len, b)]).filter(([a, b]) => b > a);
  return { m: JSON.parse((r.match(/\{[^{}]*"input_i"[^{}]*\}/) || ['null'])[0]), silent };
}
const signed = (dB) => `${dB >= 0 ? '+' : ''}${dB.toFixed(1)} dB`;
function loudnessFilter(m) {
  if (!m || !Number.isFinite(Number(m.input_i))) return null; // silence, which audioCheck has said
  // at most +12 dB: a test sine at -56 LUFS came out at -14.5, its hiss raised 41 dB with it. A capped
  // target invalidates the first pass's offset, which was computed for LUFS, so it is dropped.
  const target = Math.min(LUFS, Number(m.input_i) + 12), capped = target < LUFS;
  if (capped) console.log(`audio: ${m.input_i} LUFS is quiet: raised 12 dB, to ${target.toFixed(1)}, not to ${LUFS}`);
  // linear=true is a wish: loudnorm leaves it, and rides the level, when the range it is asked for is
  // under the measured one, or when the measured one is 0 (what a stretch of a few seconds gives), with
  // peak to spare either way (measured, FFmpeg 9.0.2: a 20 LU track at LRA=11 came out at 16.4 LU). So
  // it is asked for the range the track has, and told of one that is not 0. What is left is the peak:
  // one gain that would pass -1.5 dBTP is not applied, and that is said here, before the render. With
  // 3 s of sound or more loudnorm rides the level instead. With less it reaches the end inside its
  // first buffer and has nothing to ride: it gives the one gain the peak allows and stops short of the
  // target (measured: 2 s at -25.8 LUFS, true peak -3.9, came out at -23.4 for -16).
  const lra = Number(m.input_lra) || 0, gain = target - Number(m.input_i), peak = Number(m.input_tp) + gain;
  const fits = !(peak > -1.5), held = !fits && m.seconds < 3, applied = fits ? gain : held ? -1.5 - Number(m.input_tp) : null;
  if (!fits) console.log(`audio: ${signed(gain)} to reach ${target.toFixed(1)} LUFS would put the true peak at ${peak.toFixed(1)} dBTP, over -1.5: ${held
    ? `one gain of ${signed(applied)}, all the peak allows, which leaves it near ${(Number(m.input_i) + applied).toFixed(1)} LUFS (${m.seconds.toFixed(2)} s of sound is under the 3 s loudnorm needs to ride the level)`
    : 'not one gain, the level is ridden (loudnorm\'s dynamic mode), which changes the dynamics'}`);
  return {
    from: m.input_i, peak: m.input_tp, target, gain: applied, held, // gain: the one gain applied, null when the level is ridden
    filter: `loudnorm=I=${target.toFixed(1)}:TP=-1.5:LRA=${Math.min(50, Math.max(11, Math.ceil(lra)))}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${Math.max(0.1, lra)}:measured_thresh=${m.input_thresh}:offset=${capped ? 0 : m.target_offset}:linear=true`,
  };
}
// The soundtrack's beat against the page's, from AUDIO_AT on (beats.mjs, beside this file)
async function beatCheck(meta, pageBeats) {
  const AUDIO = process.env.AUDIO;
  if (!AUDIO || AUDIO === 'click') { console.log('beats: AUDIO=<track> names the track to measure'); return null; }
  let B;
  try { B = await import(new URL('./beats.mjs', import.meta.url)); } catch { console.log('beats: no beats.mjs beside render.mjs (copy it from the skill\'s scripts/): the beat is not measured'); return null; }
  // the whole track, not the film's stretch of it: an 8 s film on a house track's drumless intro
  // measured 126.96 BPM for 128, and its bars wrong; the whole track takes a second for five minutes
  const at = Number(process.env.AUDIO_AT || 0);
  let A;
  try { A = B.analyze(AUDIO); } catch (e) { console.log(`beats: ${e.message}`); return { ok: false, lines: [] }; }
  if (!pageBeats) {
    console.log(A.bpm ? `beats: the track is ${A.bpm} BPM${A.steady ? ', steady' : `, drifting (${A.drift} ms off one grid)`}; the page has no B(n) to measure: its cuts are its own`
      : `beats: the track has no beat to follow (${A.why})`);
    return null;
  }
  const r = B.check(A, pageBeats, at, meta.duration);
  for (const l of r.lines) console.log(l);
  return r;
}
// Whether a probed video stream carries alpha: ProRes 4444 decodes with an alpha plane; VP9 keeps its
// alpha beside the picture and says so in a tag (alpha_mode, ALPHA_MODE once remuxed). The same test
// is in deliver.mjs (neither script can import the other): change both.
const hasAlpha = (v) => /^(yuva|gbrap|rgba|bgra|argb|abgr)/.test(v.pix_fmt || '') || Object.entries(v.tags || {}).some(([k, x]) => k.toLowerCase() === 'alpha_mode' && x === '1');
// A file's streams and length, from ffprobe. A stream's frames: nb_frames, from the index of an .mp4
// or a .mov; with count, nb_read_packets, every packet read (a demux, no decode), for the formats
// that keep no count (.webm, .gif).
function probeFile(file, count = false) {
  const r = spawnSync('ffprobe', ['-v', 'error', ...(count ? ['-count_packets'] : []), '-show_entries',
    'stream=codec_type,width,height,nb_frames,nb_read_packets,color_primaries,color_transfer,color_space,pix_fmt:stream_tags=alpha_mode:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe ${file}: ${r.error?.message || (r.stderr || '').trim() || 'exited ' + r.status}`);
  const j = JSON.parse(r.stdout);
  return { streams: j.streams || [], duration: Number(j.format?.duration) };
}
// The soundtrack, before the render: its faults used to show only in the finished film. No sound in
// the file, or a stretch that starts past its end, stops the render here; a track that ends before
// the film, or silence in the stretch, is said. Returns loudnorm's first pass on the stretch.
async function audioCheck(file, start, len, src) {
  const p = probeFile(file);
  if (!p.streams.some((s) => s.codec_type === 'audio')) throw new Error(`AUDIO=${file}: the file has no sound in it`);
  if (Number.isFinite(p.duration)) {
    if (start >= p.duration) throw new Error(`AUDIO_AT: the film's sound would start ${start.toFixed(2)} s into a track ${p.duration.toFixed(2)} s long, past its end`);
    const short = start + len - p.duration;
    if (short > 0.05) console.log(`audio: the track ends ${short.toFixed(2)} s before the film does, which is silent from there`);
  }
  const { m, silent } = await measureLoudness(src, len);
  const end = Number.isFinite(p.duration) ? Math.min(len, p.duration - start) : len; // where the track's samples stop
  if (silent.some(([a, b]) => a < 0.05 && b > end - 0.05)) console.log(`audio: the stretch the film uses (${start.toFixed(2)} to ${(start + len).toFixed(2)} s of the track) is silent: is AUDIO_AT right?`);
  else for (const [a, b] of silent) console.log(`audio: silent from ${a.toFixed(2)} to ${b.toFixed(2)} s of the film${a < 0.05 ? ' (the track starts there in silence: is AUDIO_AT right?)' : ''}`);
  return m && { ...m, seconds: end }; // seconds: how much sound loudnorm is given
}

// times as file names that sort: t04.50 in a short film, t004.50 once it runs past 100 s
const stillName = (t, dur) => `t${Number(t).toFixed(2).padStart(dur >= 100 ? 6 : 5, '0')}`;
const clock = (s) => { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; };

// Off macOS a machine may have no GPU (a server, a CI runner): Chrome then draws WebGL in software only
// when allowed to, and the looks and cuts drawn by shaders need it. With a GPU the flag changes nothing.
const GL = process.platform === 'darwin' ? [] : ['--enable-unsafe-swiftshader'];
// Google Chrome; else, on Linux (Chrome has no arm64 build there), Chromium; MANOVELLA_CHROME names either
async function launchChrome(opts = {}) {
  if (process.env.MANOVELLA_CHROME) return chromium.launch({ ...opts, executablePath: process.env.MANOVELLA_CHROME });
  try { return await chromium.launch({ ...opts, channel: 'chrome' }); } catch (e) {
    const alt = process.platform === 'linux' && ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].find((p) => existsSync(p));
    if (!alt) throw e;
    return chromium.launch({ ...opts, executablePath: alt });
  }
}
const browser = await launchChrome({ args: GL });
try {
  const probe = await openPage(browser);
  const META = await probe.evaluate(() => window.PROMO_META);
  const PRESETS = await probe.evaluate(() => (window.FX ? window.FX.PRESETS : null));
  const SCRIPTS = await probe.evaluate(() => [...document.scripts].map((s) => s.getAttribute('src')).filter(Boolean));
  // what the page had loaded once it was ready, taken here: a later pass that seeks (the fast frames)
  // loads more, and a resumed render skips that pass, so a list read later would differ between the two
  const OPENED = [...LOADED];
  // the page's beats, film seconds, where it has a B(n) (the templates' beat → seconds): for the beat check
  const PAGE_BEATS = META ? await probe.evaluate((dur) => {
    if (typeof B !== 'function') return null;
    const out = []; for (let n = 0; n < 20000; n++) { const t = B(n); if (!(t <= dur + 1e-6)) break; out.push(t); }
    return out;
  }, META.duration) : null;
  await probe.close();
  if (!META) throw new Error('the page does not expose window.PROMO_META');
  const { fps: FPS, duration: DUR } = META;
  const shutterIn = process.env.SHUTTER || META.shutter; // an empty SHUTTER= is unset, as for the other variables, not 0
  const SHUTTER = Number(shutterIn ?? 360);
  if (!(SHUTTER >= 0 && SHUTTER <= 360)) throw new Error(`SHUTTER is in degrees, 0 to 360: ${shutterIn}`);
  // subframe s of n in frame f, in seconds. Written so that at 360 it is (f*n + s) / (FPS*n) to the
  // last bit, the time it always was: a slow frame renders byte for byte as before.
  const phaseIn = process.env.SHUTTER_PHASE || META.shutterPhase; // an empty SHUTTER_PHASE= is unset
  const PHASE = Number(phaseIn ?? 0);
  if (!(PHASE >= -360 && PHASE <= 360)) throw new Error(`SHUTTER_PHASE is in degrees of a frame, -360 to 360: ${phaseIn}`);
  // a moment the phase puts outside the film: round the loop, or held at the end it passed
  const inFilm = (t) => (t >= 0 && t < DUR ? t : META.loop === false ? Math.min(Math.max(t, 0), DUR - 1e-6) : ((t % DUR) + DUR) % DUR);
  const subT = PHASE
    ? (f, s, n = SUB) => inFilm((f * n + s * SHUTTER / 360) / (FPS * n) + PHASE / 360 / FPS)
    : (f, s, n = SUB) => (f * n + s * SHUTTER / 360) / (FPS * n);

  if (mode === 'stills') {
    const [out, ...times] = args;
    mkdirSync(out, { recursive: true });
    const page = await openPage(browser, META);
    for (const t of times) writeFileSync(join(out, stillName(t, DUR) + '.png'), await shot(page, Number(t)));
  } else if (mode === 'sheet') {
    const [out, nArg] = args;
    if (!out) throw new Error('usage: render.mjs sheet <outdir> [n]');
    const n = Number(nArg || 12);
    const points = META.checkpoints?.length && !nArg ? META.checkpoints
      : Array.from({ length: n }, (_, i) => ({ t: +((i + 0.5) * DUR / n).toFixed(2), label: '' }));
    mkdirSync(out, { recursive: true });
    const page = await openPage(browser, META);
    const labels = {};
    for (const { t, label } of points) {
      const k = stillName(t, DUR);
      writeFileSync(join(out, k + '.png'), await shot(page, Number(t)));
      labels[k] = label || '';
    }
    writeFileSync(join(out, 'labels.json'), JSON.stringify(labels, null, 2));
    console.log(`${points.length} stills → ${out} (then: node contact.mjs ${out} sheet.png 4)`);
  } else if (mode === 'looks') {
    const [out, tArg, ...only] = args;
    if (!out || tArg === undefined) throw new Error('usage: render.mjs looks <outdir> <t> [preset…]');
    if (!PRESETS) throw new Error('the page does not load fx.js');
    const names = only.length ? only : Object.keys(PRESETS);
    mkdirSync(out, { recursive: true });
    const labels = {};
    for (const [i, name] of names.entries()) {
      if (!PRESETS[name]) throw new Error(`no look preset '${name}' (${Object.keys(PRESETS).join(', ')})`);
      const page = await openPage(browser, META, 'look=' + name); // a look is read once, at load
      const key = `${String(i + 1).padStart(2, '0')}-${name}`; // the sheet keeps the presets' order
      writeFileSync(join(out, key + '.png'), await shot(page, Number(tArg)));
      labels[key] = PRESETS[name];
      await page.close();
    }
    writeFileSync(join(out, 'labels.json'), JSON.stringify(labels, null, 2));
    console.log(`${names.length} looks at t=${tArg}s → ${out} (then: node contact.mjs ${out} looks.png 4)`);
  } else if (mode === 'loopcheck') {
    if (META.loop === false) { console.log('not a loop (PROMO_META.loop is false): nothing to check'); }
    else {
      // Screenshots, the same path the video takes. Reading the canvas back with getImageData
      // flips Chrome to software raster after a few reads and reports false differences.
      const page = await openPage(browser, META);
      const dir = join(HERE, '.loopcheck.noindex');
      mkdirSync(dir, { recursive: true });
      // the last subframe is the last moment the render samples, which a shutter under 360 moves earlier
      const cases = { first: 0, lastSub: subT(Math.round(FPS * DUR) - 1, SUB - 1), lastFrame: (FPS * DUR - 1) / FPS };
      // grain is a new pattern every frame by design; seek leaves it out on request
      for (const [k, t] of Object.entries(cases)) writeFileSync(join(dir, k + '.png'), await shot(page, t, { loopcheck: true }));
      for (const k of ['lastSub', 'lastFrame']) {
        const out = await ffmpeg(['-hide_banner', '-i', join(dir, 'first.png'), '-i', join(dir, k + '.png'),
          '-filter_complex', '[0]format=gbrp[a];[1]format=gbrp[b];[a][b]psnr', '-f', 'null', '-'],
        { stdio: ['ignore', 'ignore', 'pipe'], anyExit: true });
        console.log(k, (out.match(/average:\S+/) || ['no psnr line'])[0]);
      }
      rmSync(dir, { recursive: true, force: true });
    }
  } else if (mode === 'video') {
    const [outArg, workersArg] = args;
    if (!outArg) throw new Error('usage: render.mjs video <out.mp4|.mov|.webm|.gif> [workers]');
    const out = resolve(outArg), ext = extname(out).toLowerCase();
    if (!['.mp4', '.mov', '.webm', '.gif'].includes(ext)) throw new Error(`no output format for '${ext}': .mp4 .mov .webm .gif`);
    if (ALPHA && !['.mov', '.webm'].includes(ext)) throw new Error(`ALPHA=1 needs a .mov (ProRes 4444) or a .webm (VP9): ${ext} has no alpha channel`);
    // each cut's chunks in a folder of their own; .noindex: Spotlight skips the folder. Chunks written
    // and deleted by the thousand kept mds and a dozen mdworkers busy after a render — heat on top
    // of the render's own
    // A cut's name is readable and bounded: a Studio page's hash runs to hundreds of bytes, past the
    // 255 of a file name, so a hash (or a long name) is cut short and a digest of the whole added
    const id = basename(PAGE_FILE) + (PAGE_HASH && '#' + PAGE_HASH);
    const cut = id.replace(/[^\w.-]+/g, '-').slice(0, 40) + (PAGE_HASH || id.length > 40 ? '-' + createHash('sha1').update(id).digest('hex').slice(0, 8) : '');
    const segRoot = join(HERE, '.segments.noindex'), segDir = join(segRoot, cut);
    mkdirSync(segRoot, { recursive: true });
    lockCut(join(segRoot, cut + '.lock'), cut);
    if (existsSync(join(segRoot, 'manifest.json'))) console.log(`${segRoot} holds the chunks of a render.mjs before 0.18.4, which are not reused: delete them`);
    const workers = Number(workersArg || process.env.WORKERS || Math.max(2, Math.round(cpus().length / 3)));
    const FROM = Number(process.env.FROM || 0), TO = Number(process.env.TO || DUR);
    if (!(FROM >= 0 && TO <= DUR + 1e-9 && TO > FROM)) throw new Error(`FROM/TO must lie within 0..${DUR}`);
    const F0 = Math.round(FROM * FPS), F1 = Math.round(TO * FPS), frames = F1 - F0, len = frames / FPS;
    const AUDIO = process.env.AUDIO, withAudio = AUDIO && ext !== '.gif';
    const beat = 60 / (META.bpm || 120), at = Number(process.env.AUDIO_AT || 0) + FROM;
    const src = !withAudio ? null : AUDIO === 'click' // a decaying ping on every beat, higher on each bar's first
      ? ['-f', 'lavfi', '-i', `aevalsrc='0.5*sin(2*PI*if(lt(mod(t+${FROM},${4 * beat}),${beat / 2}),1760,880)*t)*exp(-40*mod(t+${FROM},${beat}))':s=48000:d=${len}`]
      : ['-ss', String(at), '-t', String(len), '-i', AUDIO]; // the stretch the film uses and no more: what is measured, and what is muxed
    let norm = null;
    if (withAudio && AUDIO !== 'click') {
      // a track that is not there failed at the mux, after the whole render: now before it
      if (!existsSync(AUDIO)) throw new Error(`AUDIO=${AUDIO}: no such file`);
      const m = await audioCheck(AUDIO, at, len, src);
      if (process.env.AUDIO_NORM !== '0') norm = loudnessFilter(m);
      await beatCheck(META, PAGE_BEATS);
    }
    // at most CHUNK seconds, and never fewer chunks than workers: a 4 s range in one 5 s chunk kept
    // seven of eight workers idle (163 s, measured)
    const CHUNKF = Math.max(1, Math.min(Math.round(Number(process.env.CHUNK || 5) * FPS), Math.ceil(frames / workers)));
    const SCALE = Number(process.env.SCALE || (PREVIEW ? 0.5 : 1));

    const started = Date.now();
    let done = 0, doneSub = 0, lastLog = 0, since; // since: the workers' start, for the eta
    // the thermal governor: workers hold between frames while the chip is above TEMP_MAX
    const TMAX = Number(process.env.TEMP_MAX ?? 80), thermo = TMAX > 0 ? thermometer() : null;
    const heat = { hot: false, now: null, peak: null, held: 0, since: 0 };
    let governor = null;
    if (thermo) {
      const limit = thermo.unit === '°C' ? TMAX : 2, back = thermo.unit === '°C' ? TMAX - 8 : 1;
      const tick = async () => {
        const v = await thermo.read();
        if (v == null) return;
        heat.now = v; heat.peak = Math.max(heat.peak ?? v, v);
        if (!heat.hot && v >= limit) { heat.hot = true; heat.since = Date.now(); console.log(`heat: ${v} ${thermo.unit} >= ${limit}, workers holding`); }
        else if (heat.hot && v <= back) { heat.hot = false; heat.held += Date.now() - heat.since; console.log(`heat: ${v} ${thermo.unit}, resuming`); }
      };
      await tick();
      governor = setInterval(tick, 2000).unref(); // unref: a render that throws still exits
      console.log(`${workers} workers, QoS ${process.env.FILM_QOS || 'default'}, governor at ${limit} ${thermo.unit}${heat.now != null ? ` (now ${heat.now})` : ''}`);
    } else console.log(`${workers} workers, QoS ${process.env.FILM_QOS || 'default'}, no thermal governor${TMAX > 0 ? ' (no thermometer here)' : ''}`);
    if (SUB > 1 && SHUTTER !== 360) console.log(`shutter ${SHUTTER}°: the ${SUB} subframes cover ${+(SHUTTER / 3.6).toFixed(1)}% of each frame`);
    if (PHASE) console.log(`shutter phase ${PHASE}°: it opens ${Math.abs(PHASE / 3.6).toFixed(1)}% of a frame ${PHASE < 0 ? 'before' : 'after'} the frame's moment`);

    // The chunk cache: keyed by the page and every script it loads, and the settings that change
    // the pixels. A resumed render with any of them different would splice two films together.
    const manifest = join(segDir, 'manifest.json');
    const prior = process.env.RESUME === '1' && existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : null;
    const refuse = () => new Error('RESUME=1, but the page, its scripts, a file it loads or the settings changed since those chunks: run without RESUME');
    // the fast frames, a '1' or '0' each: a resumed render's own, so its chunks match, or measured now.
    // A resume that cannot match is refused before the measuring, not after it
    if (prior && (prior.F0 !== F0 || prior.F1 !== F1 || (ADAPT && prior.fast == null))) throw refuse();
    let fast = null;
    if (ADAPT) {
      if (prior) fast = prior.fast;
      else {
        const t0 = Date.now();
        fast = await fastFrames(browser, META, F0, F1, workers, heat);
        const nf = fast.split('1').length - 1;
        console.log(`fast frames: ${nf} of ${frames} (${(100 * nf / frames).toFixed(1)}%) get ${SUB_FAST} subframes, the rest ${SUB}; measured in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        if (nf > frames * 0.4 && frames >= 4 * FPS) console.log(`  that is most of the film: a look whose noise changes every frame reads as motion; FAST=${FAST * 2} raises the bar, SUB_FAST=0 turns it off`);
      }
    }
    const h = createHash('sha1');
    // The page at the path already resolved: resolved again against its own folder, a PAGE with a
    // directory in it (scripts/film/promo.html) named a file that does not exist, and its inline
    // code dropped out of the key. Same bytes in the same order as before for a bare file name.
    h.update(PAGE_FILE); h.update(readFileSync(PAGE));
    const hashed = new Set([PAGE]);
    for (const f of SCRIPTS.filter((s) => !/^[a-z]+:/i.test(s))) {
      const p = resolve(HERE, f.split('#')[0].split('?')[0]);
      h.update(f); if (existsSync(p)) h.update(readFileSync(p));
      hashed.add(p);
    }
    // The pictures, fonts and stylesheets too: a picture replaced between a stopped
    // render and RESUME=1 left the old one in the kept chunks and the new one in the rest, in a film
    // that passed every check. What the page loaded as it opened is known; what it loads while it
    // seeks (a frame a step) it names in PROMO_META.inputs, files or folders beside it. A page that
    // loads nothing but its scripts keeps the key it had, and the chunks it kept.
    const beside = (f) => relative(HERE, f);
    for (const f of OPENED.filter((x) => !hashed.has(x) && existsSync(x)).sort()) { h.update(beside(f)); h.update(readFileSync(f)); hashed.add(f); }
    for (const name of META.inputs || []) {
      const at = resolve(HERE, name);
      if (!existsSync(at)) throw new Error(`PROMO_META.inputs names ${name}, which is not beside the page (${at})`);
      for (const f of filesUnder(at).filter((x) => !hashed.has(x))) { h.update(beside(f)); h.update(readFileSync(f)); hashed.add(f); }
    }
    // the shutter and its phase only when they are not the default: chunks rendered before they existed are still good
    h.update(JSON.stringify({ PAGE_HASH, SUB, JITTER: !!JITTER, ...(SHUTTER !== 360 && { SHUTTER }), ...(PHASE && { PHASE }), ...(ADAPT && { SUB_FAST, fast }), ...(ALPHA && { ALPHA }), F0, F1, CHUNKF, META }));
    const key = h.digest('hex').slice(0, 16);
    if (prior) {
      if (prior.key !== key) throw refuse();
    } else {
      if (process.env.RESUME === '1') console.log('RESUME=1: no chunks to resume from, rendering from the start');
      rmSync(segDir, { recursive: true, force: true });
    }
    mkdirSync(segDir, { recursive: true });
    writeFileSync(manifest, JSON.stringify({ key, page: PAGE_FILE, SUB, F0, F1, fast }));

    // chunks cut where the frames turn fast or slow, a chunk having one count: CHUNKF frames at most,
    // fewer when fast, so that no chunk holds more subframes than a slow one (one fast chunk of 18
    // frames took a worker 3x as long as the rest, which waited: 51 s for 1 s of film)
    const isFast = (f) => fast?.[f - F0] === '1';
    const fastF = Math.max(1, Math.round(CHUNKF * SUB / SUB_FAST));
    const chunks = [];
    for (let f = F0; f < F1;) {
      const q = isFast(f), most = q ? fastF : CHUNKF, k = chunks.length, sub = q ? SUB_FAST : SUB;
      let e = f + 1;
      while (e < F1 && e - f < most && isFast(e) === q) e++;
      chunks.push({ k, f0: f, f1: e, sub, subs: (e - f) * sub, file: join(segDir, `chunk-${String(k).padStart(4, '0')}.mkv`) });
      f = e;
    }
    // A chunk left by a stopped render is reused only whole: the concat gives each chunk its exact
    // length, so a short one would come out as frozen frames that pass the file check.
    const whole = (c) => {
      if (!existsSync(c.file)) return false;
      let got = NaN;
      try { got = Number(probeFile(c.file, true).streams.find((x) => x.codec_type === 'video')?.nb_read_packets); } catch {}
      if (got === c.f1 - c.f0) return true;
      console.log(`chunk ${c.k}: ${Number.isNaN(got) ? 'unreadable' : `${got} frames of ${c.f1 - c.f0}`}, rendered again`);
      rmSync(c.file, { force: true });
      return false;
    };
    // the longest first, so the last to finish is a short one (the sort is stable: ties keep k's order)
    const todo = chunks.filter((c) => !whole(c)).sort((a, b) => b.subs - a.subs);
    const reused = chunks.length - todo.length;
    const need = todo.reduce((a, c) => a + c.f1 - c.f0, 0), needSub = todo.reduce((a, c) => a + c.subs, 0);
    const log = (force) => {
      const now = Date.now();
      if (!force && now - lastLog < 3000) return;
      lastLog = now;
      const el = (now - started) / 1000, eta = doneSub ? (now - since) / 1000 * (needSub - doneSub) / doneSub : 0; // by subframes: a fast frame is SUB_FAST/SUB as long
      const t = heat.now != null ? `, ${heat.now} ${thermo.unit}${heat.hot ? ' (holding)' : ''}` : '';
      console.log(`${done}/${need} frames${reused ? ` (+${reused} chunks reused)` : ''}, ${el.toFixed(0)}s, eta ${eta.toFixed(0)}s${t}`);
    };
    // A reference frame, drawn here before the workers start: each worker's browser must draw it
    // to the byte, or it is launched again. On a busy machine about one render in four had a browser
    // that drew every frame a shade differently (PSNR 53 dB), so the same render run twice differed.
    // The cause found was a capture at the window's own size, which openPage now sets
    // right; this stays as the check of last resort, for whatever else could make a browser differ.
    const digest = (buf) => createHash('sha1').update(buf).digest('hex');
    const refT = (F0 + F1) / 2 / FPS, refO = JITTER ? { jitter: JITTER[0] } : {};
    let REF = null;
    if (todo.length) { const p = await openPage(browser, META); REF = digest(await shot(p, refT, refO)); await p.close(); }
    let next = 0;
    since = Date.now();
    await Promise.all(Array.from({ length: Math.min(workers, todo.length) }, async () => {
      // a browser per worker: a browser encodes its screenshots on one thread, so eight pages in
      // one browser took turns — 223 ms a frame with grain, 22 ms with a browser each (measured)
      let own, page;
      for (let attempt = 1; ; attempt++) {
        own = await launchChrome({ args: GL });
        page = await openPage(own, META);
        if (digest(await shot(page, refT, refO)) === REF) break;
        if (attempt === 3) { console.log('a worker\'s browser still draws the reference frame differently after 3 launches: rendering on, but this render may not repeat to the byte'); break; }
        console.log(`a worker's browser drew the reference frame differently: launching it again (${attempt}/3)`);
        await own.close();
      }
      try {
        while (next < todo.length) {
          const c = todo[next++], tmp = c.file.replace(/\.mkv$/, '.tmp.mkv'), n = c.sub, J = jitterFor(n);
          let ff;
          // each chunk starts on a frame boundary, so tmix never mixes across chunks
          const blend = `tmix=frames=${n},select='eq(mod(n\\,${n})\\,${n - 1})',setpts=N/${FPS}/TB`;
          // ALPHA: averaged premultiplied, so an edge covered in some subframes keeps its colour, in 16
          // bits, so a pixel covered in one subframe of 48 keeps it too; kept as FFV1, which holds alpha
          const [vf, codec] = ALPHA ? [`format=gbrap16le,premultiply=inplace=1,${blend},unpremultiply=inplace=1`, ['-c:v', 'ffv1', '-pix_fmt', 'gbrap16le']]
            : [blend, ['-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast']];
          const closed = ffmpeg(['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * n), '-i', '-',
            '-vf', vf, '-r', String(FPS), ...codec, tmp],
          { stdio: ['pipe', 'inherit', 'inherit'], onSpawn: (p) => (ff = p) });
          for (let f = c.f0; f < c.f1; f++) {
            while (heat.hot) await sleep(500); // between frames only: a frame's subframes stay together
            for (let s = 0; s < n; s++) {
              const buf = await shot(page, subT(f, s, n), J ? { jitter: J[s] } : {});
              // a subframe at another size never reaches the blend
              const [pw, ph] = pngSize(buf);
              if (pw !== META.width || ph !== META.height) throw new Error(`a subframe came out ${pw}x${ph}, not ${META.width}x${META.height}: RESUME=1 keeps the finished chunks`);
              await feed(ff, buf);
            }
            done++; doneSub += n; log();
          }
          ff.stdin.end();
          await closed;
          renameSync(tmp, c.file); // only a finished chunk has the final name, so RESUME never trusts half of one
        }
      } finally { await own.close(); }
    }));
    log(true);
    if (governor) { clearInterval(governor); if (heat.hot) heat.held += Date.now() - heat.since; }

    const list = join(segDir, 'list.txt');
    // each chunk's exact length: the concat demuxer otherwise takes the Matroska one, rounded to the
    // millisecond, and short chunks (cut where frames turn fast) added up to 245 frames for 240
    writeFileSync(list, chunks.map((c) => `file '${c.file}'\nduration ${(c.f1 - c.f0) / FPS}`).join('\n'));
    // chapters inside the range, shifted to it: ffmetadata for the container, and a YouTube list
    const chaps = (META.chapters || []).filter((c) => c.t < TO && c.t >= FROM - 1e-9).map((c, i, a) => ({ ...c, s: c.t - FROM, e: (a[i + 1] ? a[i + 1].t : TO) - FROM }));
    let metaFile = null;
    if (chaps.length && (ext === '.mp4' || ext === '.mov')) {
      metaFile = join(segDir, 'chapters.txt');
      writeFileSync(metaFile, ';FFMETADATA1\n' + chaps.map((c) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.s * 1000)}\nEND=${Math.round(c.e * 1000)}\ntitle=${c.title.replace(/[=;#\\\n]/g, ' ')}\n`).join(''));
    }
    // the output's size, worked out once: the scale filters are given it, and the file is checked against it
    const even = (x) => Math.trunc(x / 2) * 2, fit = (x) => (SCALE !== 1 ? even(x * SCALE) : x);
    const gf = Number(process.env.GIF_FPS || 30), gw = Number(process.env.GIF_W || 960);
    const [outW, outH] = ext === '.gif' ? [gw, Math.round(gw * META.height / (2 * META.width)) * 2] : [fit(META.width), fit(META.height)];
    const scale = SCALE !== 1 ? `scale=${outW}:${outH}:flags=lanczos,` : '';
    const tags = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
    // the scale filter drops the primaries and the transfer from the frames, and ProRes, VP9 and x265
    // write what the frames say, not the options: .mov and .webm came out 'unknown' without this
    const colr = 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';
    // ALPHA: ProRes 4444 (profile 4, a 16-bit alpha) and VP9's 4:2:0 with alpha; a scaled film is
    // resized on premultiplied colour too, or its edges pick up the black of the clear pixels beside them
    const [movFmt, movProfile, webmFmt] = ALPHA ? ['yuva444p10le', '4', 'yuva420p'] : ['yuv422p10le', '3', 'yuv420p'];
    const resize = ALPHA && scale ? `format=gbrap16le,premultiply=inplace=1,${scale}unpremultiply=inplace=1,` : scale;
    let venc;
    if (ext === '.gif') {
      venc = ['-filter_complex', `fps=${gf},scale=${outW}:${outH}:flags=lanczos,split[a][b];[a]palettegen=stats_mode=full:max_colors=256[p];[b][p]paletteuse=dither=sierra2_4a`, '-loop', '0'];
    } else if (ext === '.mov') {
      venc = ['-vf', `${resize}scale=out_color_matrix=bt709:out_range=tv,format=${movFmt},${colr}`,
        '-c:v', 'prores_ks', '-profile:v', movProfile, '-vendor', 'apl0', ...tags];
    } else if (ext === '.webm') {
      venc = ['-vf', `${resize}scale=out_color_matrix=bt709:out_range=tv,format=${webmFmt},${colr}`,
        '-c:v', 'libvpx-vp9', '-crf', PREVIEW ? '32' : '18', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', PREVIEW ? '5' : '2', ...tags];
    } else if (process.env.HEVC === '1') {
      venc = ['-vf', `${scale}scale=out_color_matrix=bt709:out_range=tv,format=yuv420p10le,${colr}`,
        '-c:v', 'libx265', '-preset', PREVIEW ? 'fast' : 'slow', '-crf', PREVIEW ? '24' : '16', '-tag:v', 'hvc1',
        '-x265-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited:log-level=error', ...tags];
    } else {
      venc = ['-vf', `${scale}scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,${colr}`,
        '-c:v', 'libx264', '-preset', PREVIEW ? 'veryfast' : 'slow', '-crf', PREVIEW ? '20' : '14', '-profile:v', 'high', ...tags,
        // the scale filter drops the primaries/transfer tags, so write them into the bitstream
        '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1'];
    }
    const encoded = withAudio ? join(segDir, 'video' + ext) : out;
    await ffmpeg(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
      ...(metaFile && !withAudio ? ['-i', metaFile, '-map', '0:v', '-map_metadata', '1', '-map_chapters', '1'] : []),
      ...venc, ...(ext === '.gif' ? [] : ['-r', String(FPS)]), ...(ext === '.mp4' || ext === '.mov' ? ['-movflags', '+faststart'] : []), encoded]);
    if (withAudio) {
      let af = `afade=t=in:d=0.02,afade=t=out:st=${Math.max(0, len - 0.6)}:d=0.6`;
      if (norm) af = `${norm.filter},aresample=48000,${af}`; // loudnorm works at 192 kHz: back to 48
      await ffmpeg(['-y', '-loglevel', 'error', '-i', encoded, ...src,
        ...(metaFile ? ['-i', metaFile, '-map_metadata', '2', '-map_chapters', '2'] : []),
        '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
        ...(ext === '.webm' ? ['-c:a', 'libopus', '-b:a', '160k'] : ['-c:a', 'aac', '-b:a', '192k']), '-ac', '2', '-ar', '48000',
        '-af', af,
        '-t', String(len), ...(ext === '.webm' ? [] : ['-movflags', '+faststart']), out]);
      if (norm) { // what the file carries, measured on it: the filter's own report is a promise, not a check
        const r = await ffmpeg(['-hide_banner', '-nostats', '-i', out, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
        const I = (r.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)[0], P = (r.match(/Peak:\s+(-?[\d.]+) dBFS/g) || []).pop()?.match(/-?[\d.]+/)[0];
        console.log(`audio: ${norm.from} LUFS (true peak ${norm.peak} dBTP) → ${I ?? '?'} LUFS in the file (true peak ${P ?? '?'} dBTP); target ${norm.target.toFixed(1)}, ${norm.gain === null ? 'the level ridden, not one gain' : `one gain of ${signed(norm.gain)}${norm.held ? ', held by the peak' : ''}`}`);
      }
    }
    // The file against what was asked, read back from it: a render that ended early, came out at the
    // wrong size or lost its sound used to end here all the same, with exit 0
    const gif = ext === '.gif', got = probeFile(out, !['.mp4', '.mov'].includes(ext));
    const v = got.streams.find((s) => s.codec_type === 'video'), n = Number(v?.nb_read_packets ?? v?.nb_frames);
    // a GIF's frames are the fps filter's, which may round one in or out at either end
    const wantN = gif ? Math.round(len * gf) : frames, outFps = gif ? gf : FPS;
    const bad = [];
    if (!v) bad.push('no video in it');
    else {
      if (v.width !== outW || v.height !== outH) bad.push(`${v.width}x${v.height}, not ${outW}x${outH}`);
      if (Math.abs(n - wantN) > (gif ? 1 : 0)) bad.push(`${n} frames, not ${wantN}`);
      const tags = [v.color_primaries, v.color_transfer, v.color_space];
      if (!gif && tags.some((x) => x !== 'bt709')) bad.push(`colour tagged ${tags.join('/')}, not bt709`);
      if (ALPHA && !hasAlpha(v)) bad.push(`no alpha in it (${v.pix_fmt})`);
    }
    if (!(Math.abs(got.duration - len) <= 1 / outFps + 0.02)) bad.push(`${got.duration} s long, not ${len}`);
    if (withAudio && !got.streams.some((s) => s.codec_type === 'audio')) bad.push('no sound in it, though AUDIO was given');
    // ALPHA with a page that paints its whole frame gives a film whose alpha is solid: said, not refused
    // (a film may open on a full-frame scene), from the first frame's least alpha
    if (ALPHA && !bad.length) {
      const a = spawnSync('ffmpeg', ['-v', 'error', ...(ext === '.webm' ? ['-c:v', 'libvpx-vp9'] : []), '-i', out, '-frames:v', '1',
        '-vf', 'alphaextract,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YMIN:file=-', '-f', 'null', '-'], { encoding: 'utf8' });
      if (Number(/YMIN=(\d+)/.exec(a.stdout)?.[1]) === 255) console.log('warning: ALPHA=1, but its first frame is opaque all over: does the page draw its backdrop? (#look=transparent draws none)');
    }
    if (bad.length) throw new Error(`${out} is not what was asked: ${bad.join('; ')}. The chunks are kept in ${segDir}; if one of them is at fault, RESUME=1 would reuse it: render again without it`);
    console.log(`checked: ${v.width}x${v.height}, ${n} frames, ${got.duration.toFixed(2)} s${gif ? '' : ', BT.709'}${ALPHA ? ', with alpha' : ''}${withAudio ? ', with sound' : ''}`);
    if (process.env.KEEP !== '1') rmSync(segDir, { recursive: true, force: true });
    console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s → ${out}${reused ? ` (${reused} of ${chunks.length} chunks reused)` : ''}`);
    if (heat.peak != null) console.log(`heat: peak ${heat.peak} ${thermo.unit}, workers held ${(heat.held / 1000).toFixed(0)}s`);
    if (chaps.length) {
      console.log('chapters, for a YouTube description (it wants the first at 0:00 and each at least 10 s):');
      for (const c of chaps) console.log(`${clock(c.s)} ${c.title}`);
    }
  } else if (mode === 'beats') {
    const r = await beatCheck(META, PAGE_BEATS);
    if (r && !r.ok) process.exitCode = 1;
  } else {
    console.error('usage: render.mjs stills <dir> t… | sheet <dir> [n] | looks <dir> <t> [preset…] | loopcheck | video <out> [workers] | beats');
    process.exitCode = 2;
  }
} finally {
  await browser.close();
}
