// Blender, headless, for a film's 3D: a model made ready for the page, and a hero shot rendered as frames.
// Run it from the skill's own scripts/ folder (it reads the settings, and runs the blender-*.py beside it):
//
//   node blender.mjs where                          which Blender it found, and its version
//   node blender.mjs prepare <model> <out.glb>      a model as a plain GLB the page loads, and <out.glb>.js beside it
//         --tris 60000        the triangle budget, all meshes together (0: no decimation)
//         --size 1            its longest side, in the scene's units (SPACE frames a model of 1)
//         --texture 2048      the longest side of a texture, in pixels (0: as they are)
//         --static            drop a model's animation, keep its first frame as plain geometry
//         --float             centre it in height as well, instead of standing it on the ground
//   node blender.mjs embed <model.glb>              only the .js beside a GLB that is ready
//   node blender.mjs sample <out.glb>               the Acme Pod, the kit's sample model, built from blender-acme.py
//   node blender.mjs render <model|scene.blend> <outdir>    a hero shot: <outdir>/0001.png… with alpha, and sequence.js
//         --seconds 2 | --frames 1-120    how much (a .blend: its own frame range unless given)
//         --fps 60            the film's (a .blend made at another rate keeps its length: its frames are remapped)
//         --size 1920x1080    --engine cycles|eevee    --samples 64    --seed 1
//         --shutter 360       degrees, the film's (PROMO_META.shutter); 0: no motion blur
//         --phase 0           the film's SHUTTER_PHASE: 0, minus half the shutter (centred) or minus all of it
//         --pose yaw,pitch,dist,fov    a model's camera, as the page's SPACE.orbit takes it (28,14,2.9,30)
//         --turntable 4       a model turns once in this many seconds (0: it stands still)
//         --tint Accent=#5B5BF7        a material in the brand's colour (repeatable)
//         --opaque            keep the scene's own background (default: a clear one, for the page to lay on its backdrop)
//         --gpu               Cycles on the GPU: faster, and no longer the same pixels as the CPU's
//         --resume            keep the frames already in <outdir>
//   node blender.mjs --selftest                     its own checks; with no Blender here, the ones that need none
//
// What the formats are. prepare takes .blend .glb .gltf .fbx .obj .stl .ply .usd .usda .usdc .usdz and
// writes a GLB with nothing a loader needs a decoder for (no Draco, no meshopt): blender-prepare.py's
// header lists the steps. The .js beside it is the same file as a classic script (base64), because a
// film's page is opened from disk and Chrome lets a page from file:// fetch nothing: the page loads it
// with <script src="models/acme.glb.js">, and SPACE.load('models/acme.glb') finds it there.
//
// The hero shot, and whose motion blur it carries. A frame of the sequence is a picture: the engine can
// move it, fade it and blur its move across the frame, but not the motion inside it. So that blur is
// Blender's own, set to the film's shutter (--shutter, --phase): shutter/360 of a frame, opening on the
// frame's moment, which is where render.mjs's subframes lie. The other way, 16 Blender frames a film
// frame for the engine to blend, costs sixteen renders a frame for the same picture. A model that only
// turns or is orbited needs no Blender render at all: the page draws it with three.js (space.js), and
// the engine's own subframes blur it.
//
// Reproducible: Cycles on the CPU, a fixed sample count for every pixel, a seed per frame, the denoiser
// on the CPU, and no date or render time left in the PNGs. The same frame rendered twice on one machine
// is the same file (the selftest checks it). What it costs, a 1920x1080 frame of the sample model, 64
// samples, an M1 Max, 52 °C throughout:
//   Cycles on the CPU (the default)   133 s, on 3 of 10 cores; runs on any machine
//   Cycles with --gpu                 13 s after a first frame of 3 minutes (its kernels, built once); two
//                                     runs differ by a few pixels (94 dB), and by 45 dB from the CPU's
//   --engine eevee                    0.5 s, on the GPU, the same file twice; it has no shadow catcher, so a
//                                     model made a stage here casts no shadow on the ground; on Linux it
//                                     needs a GPU and a display or EGL
//
// Cool, like render.mjs: a third of the cores (THREADS=n for another count), macOS's utility QoS
// (QOS=background | default), below-normal priority elsewhere, and the same thermal governor: the die
// is read every 2 s (thermo.swift beside this file) and above TEMP_MAX (80 °C; 0 turns it off) Blender
// waits between frames until it is 8 °C cooler. One render at a time, as for a film.
//
// Blender itself: MANOVELLA_BLENDER for one run, else "blender" in Manovella's settings.json (the
// program, or the .app on macOS), else where each system installs it. It is not a dependency of a
// film: a page with a GLB that is ready needs none. Without it, prepare, sample and render stop with
// exit 3 and say where to get it. Made and tested with Blender 5.3.
//
// Blender MCP, optional. An agent with a Blender MCP server (`claude mcp add blender uvx mcp-for-blender`,
// a Blender left open with its add-on) can build or adjust a model in that Blender while the user
// watches, then save a .blend: `prepare` takes it from there. Nothing here needs it or talks to it.
import { spawn, spawnSync, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as osc, cpus, homedir, setPriority, tmpdir } from 'node:os';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAC, WIN, which } from './platform.mjs';
import { readSettings, untilde } from './settings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODELS = ['.blend', '.glb', '.gltf', '.fbx', '.obj', '.stl', '.ply', '.usd', '.usda', '.usdc', '.usdz'];
class Stop extends Error { constructor(msg, code = 1) { super(msg); this.code = code; } }

// ---------------------------------------------------------------- Blender, per system
/** The program inside a macOS .app, or the path as it is. */
const program = (p) => (MAC && /\.app\/?$/.test(p) ? join(p, 'Contents', 'MacOS', 'Blender') : p);
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
function candidates() {
  if (MAC) return ['/Applications/Blender.app', join(homedir(), 'Applications', 'Blender.app')].map(program).concat(which('blender') || []);
  if (WIN) {
    const out = [];
    for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean)) {
      const dir = join(base, 'Blender Foundation');
      let names = []; try { names = readdirSync(dir); } catch { /* not installed there */ }
      // "Blender 5.3" before "Blender 4.2": the newest first
      names.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const n of names) out.push(join(dir, n, 'blender.exe'));
    }
    return out.concat(which('blender') || []);
  }
  return [which('blender'), '/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender', '/opt/blender/blender',
    '/var/lib/flatpak/exports/bin/org.blender.Blender'].filter(Boolean);
}
const INSTALL = MAC ? 'https://www.blender.org/download/ (or `brew install --cask blender`)'
  : WIN ? 'https://www.blender.org/download/ (or `winget install BlenderFoundation.Blender`)'
    : 'https://www.blender.org/download/ (or `sudo snap install blender --classic`, or your distribution\'s package)';
/** { bin, version, from } or a Stop with exit 3 that says what is needed. */
function findBlender(env = process.env, settings = readSettings()) {
  const named = env.MANOVELLA_BLENDER ? ['MANOVELLA_BLENDER', env.MANOVELLA_BLENDER]
    : typeof settings.blender === 'string' && settings.blender.trim() ? ['"blender" in settings.json', settings.blender.trim()] : null;
  if (named) {
    const bin = program(resolve(untilde(named[1])));
    if (!isFile(bin)) throw new Stop(`${named[0]} names ${named[1]}, which is not there`, 3);
    return { bin, from: named[0], version: versionOf(bin) };
  }
  const tried = [...new Set(candidates())];
  const bin = tried.find(isFile);
  if (!bin) {
    throw new Stop(`Blender is not installed here (looked for ${tried.join(', ') || 'blender on the PATH'}).\n`
      + `It is free (GPL), a download of about 400 MB, 1 GB installed: ${INSTALL}.\n`
      + 'Installed somewhere else: name it with MANOVELLA_BLENDER=<path>, or "blender": "<path>" in Manovella\'s settings.json.\n'
      + 'A film whose model is already a GLB needs no Blender: the page draws it with three.js.', 3);
  }
  return { bin, from: 'found', version: versionOf(bin) };
}
function versionOf(bin) {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  const m = /Blender (\d+)\.(\d+)(?:\.(\d+))?/.exec(r.stdout || '');
  if (!m) throw new Stop(`${bin} did not answer --version as Blender does${r.error ? `: ${r.error.message}` : ''}`, 3);
  return m.slice(1, 4).map((x) => Number(x || 0));
}

// ---------------------------------------------------------------- heat (render.mjs has the same thermometer: change both)
const QOS = process.env.QOS || 'utility';
const THREADS = Math.max(1, Number(process.env.THREADS) || Math.round(cpus().length / 3));
function thermometer() {
  if (process.platform === 'linux') {
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
  if (!MAC) return null;
  const src = join(HERE, 'thermo.swift');
  if (existsSync(src)) {
    const dir = join(homedir(), 'Library', 'Caches', 'film-render');
    const bin = join(dir, 'thermo-' + createHash('sha1').update(readFileSync(src)).digest('hex').slice(0, 10));
    if (!existsSync(bin)) {
      console.log('heat: compiling the thermometer, once (scripts/thermo.swift)');
      mkdirSync(dir, { recursive: true }); spawnSync('swiftc', ['-O', src, '-o', bin], { stdio: 'ignore' });
    }
    if (existsSync(bin)) return { unit: '°C', read: () => new Promise((res) => execFile(bin, (e, out) => res(e ? null : Number((out.match(/max ([\d.]+)/) || [])[1]) || null))) };
  }
  const js = 'ObjC.import("Foundation"); $.NSProcessInfo.processInfo.thermalState';
  return { unit: 'state', read: () => new Promise((res) => execFile('osascript', ['-l', 'JavaScript', '-e', js], (e, out) => res(e ? null : Number(out)))) };
}

/** Blender in the background on `scripts`, with `args` as a JSON file: its lines that start with
 *  MANOVELLA go to onSay, the rest is kept and shown only if it fails (VERBOSE=1 shows it all). */
async function runBlender(bl, { file, scripts, args, onSay = () => {} }) {
  const work = mkdtempSync(join(tmpdir(), 'manovella-blender-'));
  try {
    const argsFile = join(work, 'args.json'), report = join(work, 'report.json');
    writeFileSync(argsFile, JSON.stringify({ ...args, report }));
    // a model from somewhere else never runs its own scripts (--disable-autoexec), and no user add-on is loaded
    const argv = ['-b', '--factory-startup', '--disable-autoexec', '-noaudio', '--python-exit-code', '1', '-t', String(THREADS),
      ...(file ? [file] : []), ...scripts.flatMap((s) => ['-P', join(HERE, s)]), '--', argsFile];
    const [cmd, full] = MAC && QOS !== 'default' ? ['taskpolicy', ['-c', QOS, bl.bin, ...argv]] : [bl.bin, argv];
    let log = '';
    const code = await new Promise((res, rej) => {
      const p = spawn(cmd, full, { stdio: ['ignore', 'pipe', 'pipe'] });
      if (!MAC && QOS !== 'default') { try { setPriority(p.pid, osc.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed here: normal priority */ } }
      const take = () => { // a stream's lines, whole: each stream keeps its own unfinished one
        let part = '';
        return (d) => {
          part += d;
          const lines = part.split(/\r?\n/); part = lines.pop();
          for (const l of lines) {
            if (l.startsWith('MANOVELLA ')) { try { onSay(JSON.parse(l.slice(10))); } catch { /* not ours after all */ } }
            else { log += l + '\n'; if (process.env.VERBOSE === '1') console.log(l); }
          }
        };
      };
      p.stdout.on('data', take()); p.stderr.on('data', take());
      p.on('error', rej); p.on('close', res);
    });
    if (code !== 0 || !existsSync(report)) {
      const tail = log.trim().split('\n').filter((l) => !/^(Blender \d|Read prefs|Blender quit)|\| INFO|DeprecationWarning|^\s+\w+\.use_nodes = /.test(l)).slice(-12).join('\n');
      throw new Stop(`Blender ${bl.version.join('.')} stopped (exit ${code}):\n${tail}`);
    }
    return JSON.parse(readFileSync(report, 'utf8'));
  } finally { rmSync(work, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- a GLB, read here
/** What a GLB holds, from its own JSON: meshes, triangles, materials, animations (name, seconds), textures. */
function readGLB(file) {
  const b = readFileSync(file);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546C67) throw new Stop(`${file} is not a GLB (no glTF header)`);
  const len = b.readUInt32LE(12);
  if (b.readUInt32LE(16) !== 0x4E4F534A) throw new Stop(`${file}: its first chunk is not JSON`);
  const j = JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
  const acc = j.accessors || [];
  let tris = 0;
  for (const m of j.meshes || []) {
    for (const p of m.primitives || []) {
      const n = p.indices != null ? acc[p.indices].count : acc[p.attributes.POSITION].count;
      tris += (p.mode ?? 4) === 4 ? n / 3 : 0;
    }
  }
  return {
    bytes: b.length, triangles: Math.round(tris), meshes: (j.meshes || []).length,
    materials: (j.materials || []).map((m) => m.name),
    animations: (j.animations || []).map((a) => ({ name: a.name, seconds: Math.max(0, ...a.samplers.map((s) => acc[s.input].max?.[0] ?? 0)) })),
    textures: (j.images || []).length,
    needs: (j.extensionsRequired || []),
  };
}
/** The GLB as a classic script beside it: the page loads it with <script src>, SPACE.load finds it by its file name. */
function embed(glb) {
  const out = glb + '.js', name = basename(glb);
  writeFileSync(out, `/* ${name} for a page opened from disk (file:// fetches nothing): blender.mjs wrote it, SPACE.load('…/${name}') reads it */\n`
    + `(window.SPACE_ASSETS = window.SPACE_ASSETS || {})[${JSON.stringify(name)}] = "${readFileSync(glb).toString('base64')}";\n`);
  return out;
}
/** A PNG without its text chunks. Blender writes the date into each frame, and Cycles its render times: the
 *  same frame rendered twice was the same pixels in two different files, and a frame said when it was made. */
function plainPNG(file) {
  const b = readFileSync(file), keep = [b.subarray(0, 8)];
  let dropped = false;
  for (let i = 8; i < b.length;) {
    const n = b.readUInt32BE(i), type = b.toString('latin1', i + 4, i + 8);
    if (['tEXt', 'zTXt', 'iTXt', 'tIME'].includes(type)) dropped = true; else keep.push(b.subarray(i, i + 12 + n));
    i += 12 + n;
  }
  if (dropped) writeFileSync(file, Buffer.concat(keep));
}
const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

// ---------------------------------------------------------------- the command line
function parse(argv, takes) {
  const pos = [], o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const k = a.slice(2);
    if (!(k in takes)) throw new Stop(`no option ${a} here (${Object.keys(takes).map((x) => '--' + x).join(' ')})`, 2);
    if (takes[k] === false) { o[k] = true; continue; }
    const v = argv[++i];
    if (v === undefined) throw new Stop(`${a} needs a value`, 2);
    if (takes[k] === 'many') (o[k] ||= []).push(v); else o[k] = v;
  }
  return { pos, o };
}
const num = (v, d, what) => { if (v === undefined) return d; const n = Number(v); if (!Number.isFinite(n)) throw new Stop(`${what} is a number: ${v}`, 2); return n; };
function modelArg(p, what = 'a model') {
  if (!p) throw new Stop(`name ${what}`, 2);
  const f = resolve(p), ext = extname(f).toLowerCase();
  if (!MODELS.includes(ext)) throw new Stop(`${p}: not a model this takes (${MODELS.join(' ')})`, 2);
  if (!isFile(f)) throw new Stop(`${p}: no such file`, 2);
  return { file: f, blend: ext === '.blend' };
}

async function prepare(argv, { sample = false } = {}) {
  const { pos, o } = parse(argv, { tris: 1, size: 1, texture: 1, static: false, float: false });
  const src = sample ? null : modelArg(pos[0]);
  const outArg = pos[sample ? 0 : 1];
  if (!outArg || extname(outArg).toLowerCase() !== '.glb') throw new Stop(`usage: blender.mjs ${sample ? 'sample' : 'prepare <model>'} <out.glb>`, 2);
  const out = resolve(outArg);
  const bl = findBlender();
  mkdirSync(dirname(out), { recursive: true });
  const r = await runBlender(bl, {
    file: src?.blend ? src.file : null,
    scripts: sample ? ['blender-acme.py', 'blender-prepare.py'] : ['blender-prepare.py'],
    args: { input: src && !src.blend ? src.file : null, out, name: sample ? 'Acme Pod' : basename(outArg, '.glb'),
      tris: num(o.tris, sample ? 0 : 60000, '--tris'), size: num(o.size, 1, '--size'), texture: num(o.texture, 2048, '--texture'),
      static: !!o.static, ground: !o.float },
  });
  const g = readGLB(out), js = embed(out);
  console.log(`${basename(out)}: ${g.triangles.toLocaleString('en')} triangles${r.tris_in !== g.triangles ? ` (from ${r.tris_in.toLocaleString('en')})` : ''} in ${g.meshes} meshes, ${kb(g.bytes)}; ${r.size.map((v) => +v.toFixed(3)).join(' x ')} (wide, high, deep)`);
  console.log(`  materials: ${g.materials.join(', ') || 'none'}${g.textures ? `; ${g.textures} textures` : ''}`);
  console.log(`  ${g.animations.length ? 'animations: ' + g.animations.map((a) => `${a.name} ${a.seconds.toFixed(2)} s`).join(', ') : 'no animation: plain geometry, transforms applied'}`);
  for (const n of r.notes) console.log(`  note: ${n}`);
  if (g.needs.length) console.log(`  warning: the file requires ${g.needs.join(', ')}, which the page's loader may not have`);
  console.log(`  and ${basename(js)} beside it (${kb(statSync(js).size)}): <script src="…/${basename(js)}"></script>, then SPACE.load('…/${basename(out)}')`);
  return { out, glb: g, report: r };
}

async function render(argv) {
  const { pos, o } = parse(argv, { seconds: 1, frames: 1, fps: 1, size: 1, engine: 1, samples: 1, seed: 1, shutter: 1, phase: 1, pose: 1, turntable: 1, tint: 'many', opaque: false, gpu: false, resume: false });
  const src = modelArg(pos[0], 'a model or a .blend');
  if (!pos[1]) throw new Stop('usage: blender.mjs render <model|scene.blend> <outdir> [options]', 2);
  const out = resolve(pos[1]);
  const fps = num(o.fps, src.blend ? undefined : 60, '--fps');
  let frames;
  if (o.frames) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(o.frames);
    if (!m || (m[2] && Number(m[2]) < Number(m[1]))) throw new Stop(`--frames is a frame or a range, 1-120: ${o.frames}`, 2);
    frames = [Number(m[1]), Number(m[2] ?? m[1])];
  }
  if (src.blend && o.turntable !== undefined) throw new Stop('--turntable turns a model on the stage made for it; a .blend is rendered with its own animation', 2);
  const turntable = num(o.turntable, src.blend ? 0 : 4, '--turntable');
  if (!frames && o.seconds) {
    if (!fps) throw new Stop('--seconds needs --fps for a .blend (its own rate is only known once it is open): give --frames or --fps', 2);
    frames = [1, Math.max(1, Math.round(num(o.seconds, 0, '--seconds') * fps))];
  }
  if (!frames && !src.blend) frames = [1, Math.max(1, Math.round((turntable || 2) * fps))];
  const shutter = num(o.shutter, 360, '--shutter'), phase = num(o.phase, 0, '--phase');
  if (!(shutter >= 0 && shutter <= 360)) throw new Stop(`--shutter is in degrees, 0 to 360: ${o.shutter}`, 2);
  // Blender opens its shutter on the frame, round it, or before it: the three phases a film's SHUTTER_PHASE can match
  const position = phase === 0 ? 'START' : Math.abs(phase + shutter / 2) < 1e-6 ? 'CENTER' : Math.abs(phase + shutter) < 1e-6 ? 'END' : null;
  if (!position) throw new Stop(`--phase ${phase}: Blender's shutter opens on the frame (0), centred on it (${-shutter / 2}) or ends on it (${-shutter}); give the film one of those`, 2);
  let size;
  if (o.size) { const m = /^(\d+)x(\d+)$/.exec(o.size); if (!m) throw new Stop(`--size is WxH, 1920x1080: ${o.size}`, 2); size = [Number(m[1]), Number(m[2])]; } else if (!src.blend) size = [1920, 1080];
  let pose;
  if (o.pose) {
    const v = o.pose.split(',').map(Number);
    if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) throw new Stop(`--pose is yaw,pitch,dist,fov: ${o.pose}`, 2);
    if (src.blend) throw new Stop('--pose places the camera made for a model; a .blend is rendered through its own', 2);
    pose = { yaw: v[0], pitch: v[1], dist: v[2], fov: v[3] };
  }
  const tint = {};
  for (const t of o.tint || []) {
    const m = /^(.+)=#?([0-9a-f]{6})$/i.exec(t);
    if (!m) throw new Stop(`--tint is Material=#RRGGBB: ${t}`, 2);
    tint[m[1]] = [0, 2, 4].map((i) => parseInt(m[2].slice(i, i + 2), 16));
  }
  const engine = o.engine?.toLowerCase();
  if (engine && !['cycles', 'eevee'].includes(engine)) throw new Stop(`--engine is cycles or eevee: ${o.engine}`, 2);
  const bl = findBlender();
  mkdirSync(out, { recursive: true });
  const hold = join(out, '.hold');
  rmSync(hold, { force: true });

  // the thermal governor: while the die is above TEMP_MAX the hold file is there, and Blender waits between frames
  const TMAX = Number(process.env.TEMP_MAX ?? 80), thermo = TMAX > 0 ? thermometer() : null;
  const heat = { hot: false, now: null, peak: null, held: 0, since: 0 };
  let governor = null;
  if (thermo) {
    const limit = thermo.unit === '°C' ? TMAX : 2, back = thermo.unit === '°C' ? TMAX - 8 : 1;
    const tick = async () => {
      const v = await thermo.read();
      if (v == null) return;
      heat.now = v; heat.peak = Math.max(heat.peak ?? v, v);
      if (!heat.hot && v >= limit) { heat.hot = true; heat.since = Date.now(); writeFileSync(hold, ''); console.log(`heat: ${v} ${thermo.unit} >= ${limit}, Blender holding after this frame`); }
      else if (heat.hot && v <= back) { heat.hot = false; heat.held += Date.now() - heat.since; rmSync(hold, { force: true }); console.log(`heat: ${v} ${thermo.unit}, resuming`); }
    };
    await tick();
    governor = setInterval(tick, 2000);
    console.log(`Blender ${bl.version.join('.')}, ${THREADS} threads, QoS ${MAC ? QOS : 'below normal'}, governor at ${limit} ${thermo.unit}${heat.now != null ? ` (now ${heat.now})` : ''}`);
  } else console.log(`Blender ${bl.version.join('.')}, ${THREADS} threads, QoS ${MAC ? QOS : 'below normal'}, no thermal governor${TMAX > 0 ? ' (no thermometer here)' : ''}`);

  const started = Date.now();
  let done = 0;
  let r;
  try {
    r = await runBlender(bl, {
      file: src.blend ? src.file : null, scripts: ['blender-render.py'],
      args: { input: src.blend ? null : src.file, out, frames, fps, size, engine, samples: num(o.samples, 64, '--samples'), seed: num(o.seed, 1, '--seed'),
        shutter, position, pose, turntable, tint, opaque: !!o.opaque, gpu: !!o.gpu, resume: !!o.resume, hold },
      onSay: (m) => {
        if (m.note) console.log(`note: ${m.note}`);
        if (m.frame == null) return;
        done++;
        if (m.file && !m.reused) plainPNG(m.file);
        const total = frames ? frames[1] - frames[0] + 1 : null;
        console.log(`frame ${m.frame}${total ? ` (${done}/${total})` : ''}: ${m.reused ? 'kept' : m.seconds + ' s'}${heat.now != null ? `, ${heat.now} ${thermo.unit}` : ''}`);
      },
    });
  } finally {
    if (governor) clearInterval(governor);
    rmSync(hold, { force: true });
  }
  if (heat.hot) heat.held += Date.now() - heat.since;
  const name = basename(out), first = readFileSync(join(out, '0001.png'));
  const [w, h] = [first.readUInt32BE(16), first.readUInt32BE(20)], alpha = first[25] === 6 && r.transparent; // --opaque: RGBA still, all of it solid
  // the sequence as a classic script, for the page: <script src="<dir>/sequence.js">, then SPACE.sequence('<name>')
  const seq = { name, frames: r.frames, fps: r.fps, width: w, height: h, alpha, shutter: r.shutter, phase, engine: r.engine, samples: r.samples, seed: r.seed, blender: r.blender };
  writeFileSync(join(out, 'sequence.js'), `/* a hero shot rendered by blender.mjs: SPACE.sequence(${JSON.stringify(name)}) draws frame floor(t * fps) of it */\n(window.SPACE_SEQUENCES = window.SPACE_SEQUENCES || {})[${JSON.stringify(name)}] = ${JSON.stringify(seq)};\n`);
  const took = r.seconds.length ? r.seconds.reduce((a, b) => a + b, 0) / r.seconds.length : 0;
  console.log(`${r.frames} frames at ${r.fps} fps (${(r.frames / r.fps).toFixed(2)} s), ${w}x${h}${alpha ? ' with alpha' : ''}, ${r.engine === 'CYCLES' ? `Cycles on the ${r.device === 'CPU' ? 'CPU' : `GPU (${r.device})`}, ${r.samples} samples, seed ${r.seed}` : `EEVEE, ${r.samples} samples`}, shutter ${r.shutter}° (${r.position.toLowerCase()}) → ${out}`);
  console.log(`  ${took.toFixed(1)} s a frame, ${((Date.now() - started) / 1000).toFixed(0)} s in all${heat.peak != null ? `; heat: peak ${heat.peak} ${thermo.unit}, held ${(heat.held / 1000).toFixed(0)} s` : ''}`);
  console.log(`  in the page: <script src="${name}/sequence.js"></script>, const HERO = await SPACE.sequence('${name}'), HERO.draw(ctx, t, { x, y, w, h })`);
  if (r.shutter && r.fps) console.log(`  its motion blur is Blender's, ${r.shutter}° of a frame: give the film the same (PROMO_META.shutter ${r.shutter}${phase ? `, shutterPhase ${phase}` : ''}) and the same fps`);
  return { out, seq, report: r };
}

// ---------------------------------------------------------------- its own checks
async function selftest() {
  let n = 0;
  const ok = (cond, what) => { if (!cond) throw new Stop(`selftest: ${what}`); n++; };
  const dir = mkdtempSync(join(tmpdir(), 'manovella-blender-test-'));
  try {
    // 1. without Blender: the parts that need none
    const tiny = { asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [{ count: 4 }, { count: 6 }, { count: 2, max: [1.5] }], materials: [{ name: 'Accent' }],
      animations: [{ name: 'Dial', samplers: [{ input: 2 }], channels: [] }] };
    let json = Buffer.from(JSON.stringify(tiny)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
    const head = Buffer.alloc(20); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + json.length, 8); head.writeUInt32LE(json.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
    const glb = join(dir, 'tiny.glb'); writeFileSync(glb, Buffer.concat([head, json]));
    const g = readGLB(glb);
    ok(g.triangles === 2 && g.materials[0] === 'Accent' && g.animations[0].name === 'Dial' && g.animations[0].seconds === 1.5, 'a GLB is read: triangles, materials, animations');
    const js = embed(glb), box = {};
    new Function('window', readFileSync(js, 'utf8'))(box);
    ok(Buffer.from(box.SPACE_ASSETS['tiny.glb'], 'base64').equals(readFileSync(glb)), 'the .js beside a GLB holds the GLB, byte for byte');
    let said = null; try { findBlender({ MANOVELLA_BLENDER: join(dir, 'no-blender') }, {}); } catch (e) { said = e; }
    ok(said?.code === 3 && /MANOVELLA_BLENDER/.test(said.message), 'a Blender named and missing stops with exit 3 and says which');
    said = null; try { findBlender({}, { blender: join(dir, 'no-blender') }); } catch (e) { said = e; }
    ok(said?.code === 3 && /settings\.json/.test(said.message), 'the "blender" setting is read');
    said = null; try { await render([glb, join(dir, 'x'), '--phase', '-45']); } catch (e) { said = e; }
    ok(said?.code === 2 && /--phase/.test(said.message), 'a shutter phase Blender cannot match is refused before Blender starts');

    // 2. with Blender
    let bl; try { bl = findBlender(); } catch (e) {
      if (e.code !== 3) throw e;
      console.log(`blender.mjs --selftest: ${n} checks that need no Blender passed; the rest is skipped:\n${e.message}`);
      return;
    }
    console.log(`Blender ${bl.version.join('.')} at ${bl.bin} (${bl.from})`);
    const quiet = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };
    const acme = await quiet(() => prepare([join(dir, 'acme.glb')], { sample: true }));
    ok(acme.glb.triangles > 2000 && acme.glb.triangles < 30000, `the sample is a model: ${acme.glb.triangles} triangles`);
    ok(['Shell', 'Band', 'Metal', 'Rubber', 'Accent'].every((m) => acme.glb.materials.includes(m)), `its materials keep their names: ${acme.glb.materials}`);
    ok(acme.glb.animations.length === 1 && acme.glb.animations[0].name === 'Dial' && Math.abs(acme.glb.animations[0].seconds - 1.5) < 0.05, `its animation is Dial, 1.5 s: ${JSON.stringify(acme.glb.animations)}`);
    ok(Math.abs(Math.max(...acme.report.size) - 1) < 1e-3, `its longest side is 1: ${acme.report.size}`);
    ok(acme.glb.bytes < 400e3 && !acme.glb.needs.length, `it is small and needs no decoder: ${acme.glb.bytes} bytes`);
    // another format, over the budget: a sphere of 79,600 triangles written here as an .obj, three units across, off centre
    const N = 200, v = [], f = [];
    for (let i = 0; i <= N; i++) for (let k = 0; k < N; k++) { const a = Math.PI * i / N, b = 2 * Math.PI * k / N; v.push(`v ${(5 + 1.5 * Math.sin(a) * Math.cos(b)).toFixed(5)} ${(1.5 * Math.cos(a)).toFixed(5)} ${(1.5 * Math.sin(a) * Math.sin(b)).toFixed(5)}`); }
    for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) { const p = i * N + k + 1, q = i * N + (k + 1) % N + 1; if (i > 0) f.push(`f ${p} ${q} ${q + N}`); if (i < N - 1) f.push(`f ${p} ${q + N} ${p + N}`); }
    writeFileSync(join(dir, 'ball.obj'), v.concat(f).join('\n') + '\n');
    const ball = await quiet(() => prepare([join(dir, 'ball.obj'), join(dir, 'ball.glb'), '--tris', '5000']));
    ok(ball.report.tris_in === f.length, `an .obj is imported whole: ${ball.report.tris_in} of ${f.length} triangles`);
    ok(ball.glb.triangles <= 5000 * 1.05 && ball.glb.triangles > 2500, `and decimated to its budget: ${ball.glb.triangles} for 5000`);
    ok(ball.report.size.every((s) => Math.abs(s - 1) < 0.02) && ball.glb.materials.includes('Neutral'), `scaled to 1 and given a material: ${ball.report.size}, ${ball.glb.materials}`);
    // a hero shot: two frames, small, twice: with alpha, at the size asked, the same files both times
    const shot = (to) => quiet(() => render([join(dir, 'acme.glb'), join(dir, to), '--frames', '1-2', '--fps', '30', '--size', '320x180', '--samples', '8', '--tint', 'Accent=#E8833A']));
    const a = await shot('hero'), b = await shot('hero-again');
    ok(a.seq.frames === 2 && a.seq.width === 320 && a.seq.height === 180 && a.seq.alpha, `a hero shot: ${JSON.stringify(a.seq)}`);
    ok(['0001.png', '0002.png'].every((p) => readFileSync(join(a.out, p)).equals(readFileSync(join(b.out, p)))), 'the same shot rendered twice is the same files');
    ok(!readFileSync(join(a.out, '0001.png')).equals(readFileSync(join(a.out, '0002.png'))), 'a turntable moves between two frames');
    const box2 = {}; new Function('window', readFileSync(join(a.out, 'sequence.js'), 'utf8'))(box2);
    ok(box2.SPACE_SEQUENCES.hero.fps === 30 && box2.SPACE_SEQUENCES.hero.shutter === 360, 'sequence.js says what the page needs');
    console.log(`blender.mjs --selftest: ${n} checks passed`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const [verb, ...rest] = process.argv.slice(2);
try {
  if (verb === 'where') { const b = findBlender(); console.log(`Blender ${b.version.join('.')} at ${b.bin} (${b.from})`); }
  else if (verb === 'prepare') await prepare(rest);
  else if (verb === 'sample') await prepare(rest, { sample: true });
  else if (verb === 'embed') { const f = modelArg(rest[0], 'a .glb'); const g = readGLB(f.file); console.log(`${basename(embed(f.file))} written (${g.triangles.toLocaleString('en')} triangles, ${kb(g.bytes)})`); }
  else if (verb === 'render') await render(rest);
  else if (verb === '--selftest') await selftest();
  else { console.error('usage: blender.mjs where | prepare <model> <out.glb> | embed <model.glb> | sample <out.glb> | render <model|scene.blend> <outdir> | --selftest   (options: the top of this file)'); process.exitCode = 2; }
} catch (e) {
  if (!(e instanceof Stop)) throw e;
  console.error(e.message);
  process.exitCode = e.code;
}
