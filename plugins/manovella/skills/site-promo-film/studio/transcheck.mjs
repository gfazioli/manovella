// Every transition, checked on the Studio's stage in headless Chrome: does it start on the scene it
// leaves and end on the one it brings (a cut that does not is a pop on its first or last frame), does
// its shader compile, how long does a frame of it take. And, on request, a still of each half way and
// of each headline style a third of the way in: the stills docs/transitions.jpg and docs/text.jpg
// are made of. --type <dir> does the same for each type set (docs/type.jpg): its headline and a
// line of text, on the stage in text mode, with the set's labels.json (family + family, and what it is for).
//
//   node <skill>/studio/transcheck.mjs [--shots <dir>] [--text <dir>] [--type <dir>] [--look aura] [--size 1920x1080] [--o <json>] [kind…]
//
// --size is the stage's own, and the stills' (any aspect: a sheet of stills for a page that shows it in a
// frame of one shape asks for the aspect its grid gives each, see contact.mjs --size).
//
// --sheer checks the other case instead: two scenes that draw no backdrop (transparent: true) over the
// timeline's `under`. Only some kinds are right there (SHEER below, and the timeline's own note): those
// must pass, the rest are listed with the pop they make.
// --o gives the kinds checked options of their own, over the stage's: --o '{"step":10}' halftone is a
// fine screen, whose corners stayed part of the leaving scene at the end until its last radius grew.
//
// Run it from a folder where playwright-core is installed, like selftest.mjs. It starts the Studio's
// own server (nothing opens) for the stage, and lists the kinds from schema.json, so a transition the
// Studio does not offer is not checked: add it there. Exit 0 when every kind passes.
//   node contact.mjs <dir> sheet.png 6      the stills as one captioned sheet
//
// What it measures, per kind and per direction (the stage goes to an end card, and back):
//   start   the cut's first frame against the scene before it      must be identical (0 levels)
//   +4 ms   a quarter of a frame in: how hard it starts (a spring starts fast; that is not a pop)
//   -4 ms, end   the same at the other end: the cut's last moment against the scene after it
// The scenes of the stage's `trans` mode stand still, which is what makes "identical" a fair demand.
//
// Traps it was built on:
// - Reading a canvas back with getImageData moves it, in Chrome, from GPU to software raster after the
//   second read, and its pixels shift a little: the third frame of ANY page differed from the second
//   (4 levels on the stage, 52 on a cut), on code nobody had touched, and every kind "failed". The
//   film's canvas is never read here: each frame is copied to a canvas of this script's own, made
//   with willReadFrequently, and that one is read. render.mjs captures through CDP and is not affected.
// - With the film's canvas in software and the two scenes' buffers still on the GPU, a cut and the
//   frame after it differ by that same raster difference, at both ends of every kind: the copy fixes
//   that too.
// - Found with it, in kinds that had shipped: cover's shadow reached into the frame while the scene
//   was still outside it (44 levels on the first frame), frost's lit edges were 2 px wide and started
//   flush with the frame (28 and 13 levels on the first and the last), and a side inherited from the
//   film's default (`from: 'right'`) made zoom's scale NaN and window's rectangle a string.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(join(process.cwd(), 'noop.js'))('playwright-core');
const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(HERE, 'schema.json'), 'utf8'));
const argv = process.argv.slice(2), valued = ['--shots', '--text', '--type', '--look', '--size', '--o'];
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const only = argv.filter((a, i) => !a.startsWith('--') && !valued.includes(argv[i - 1]));
const SHOTS = arg('--shots') && resolve(arg('--shots')), TEXT = arg('--text') && resolve(arg('--text')), TYPES = arg('--type') && resolve(arg('--type'));
const LOOK = arg('--look', 'aura'), [W, H] = arg('--size', '1920x1080').split('x').map(Number), GIVEN = arg('--o', '');
const kinds = SCHEMA.motion.transitions.filter((t) => !only.length || only.includes(t.id));
for (const d of [SHOTS, TEXT, TYPES]) if (d) mkdirSync(d, { recursive: true });

const TMP = mkdtempSync(join(tmpdir(), 'film-transcheck-'));
const srv = spawn('node', [join(HERE, 'studio.mjs'), '--no-open', '--out', join(TMP, 'out'), '--roots', TMP], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, STUDIO_PREFS: join(TMP, 'prefs') } });
const origin = await new Promise((ok) => srv.stdout.on('data', (d) => { const m = String(d).match(/STUDIO (\S+)/); if (m) ok(new URL(m[1]).origin); }));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if ((m.type() === 'error' && !/Failed to load resource/.test(m.text())) || /webgl/i.test(m.text())) errors.push(m.text()); });
const TONE = SCHEMA.looks.find((l) => l.id === LOOK)?.tone || 'light'; // the look's own tone, as the Studio passes it: a dark look draws its UI and ink for a dark page
const stage = (hash, n) => page.goto(`${origin}/studio/stage.html?n=${n}#${hash}&look=${LOOK}&tone=${TONE}&accent=5B5BF7&w=${W}&h=${H}`);
const save = (dir, name, png) => writeFileSync(join(dir, `${name}.png`), Buffer.from(png.split(',')[1], 'base64'));

let failed = 0;
const labels = {};
// the kinds that are right when a scene is not opaque; the others lay one scene over the other
const SHEER = ['fade', 'dip', 'push', 'frost', 'snap', 'tiles', 'whip', 'zoomblur', 'liquid', 'ripple', 'halftone', 'flip', 'cube', 'page'];
if (argv.includes('--sheer')) {
  await stage('mode=stage', 0);
  const r = await page.evaluate(async () => {
    await window.ready;
    const W = 480, H = 270, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), st = FILM.stage(g), P = new Path2D(); P.rect(-0.5, -0.5, 1, 1);
    const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
    const sg = sc.getContext('2d', { willReadFrequently: true }); sg.globalCompositeOperation = 'copy';
    const diff = (a, b) => { let mx = 0; for (let j = 0; j < a.length; j++) mx = Math.max(mx, Math.abs(a[j] - b[j])); return mx; };
    const out = {};
    for (const kind of Object.keys(FILM.TRANSITIONS)) { // a white card, then an orange one elsewhere, on a blue `under`
      const TL = FILM.timeline({ W, H, under: (c) => { c.fillStyle = '#204080'; c.fillRect(-2, -2, W + 4, H + 4); }, scenes: [
        { id: 'a', dur: 1, transparent: true, draw: (c) => { c.fillStyle = '#fff'; c.fillRect(60, 60, 90, 50); } },
        { id: 'b', dur: 1, transparent: true, draw: (c) => { c.fillStyle = '#f80'; c.fillRect(300, 150, 90, 50); }, in: { kind, dur: 0.5, path: P } }] });
      const grab = (t) => { st.begin({}); TL.draw(g, t, {}); sg.drawImage(cv, 0, 0); return sg.getImageData(0, 0, W, H).data; };
      const A = grab(0.49), first = grab(0.5), last = grab(1 - 1e-6), B = grab(1.01);
      out[kind] = [diff(A, first), diff(B, last)];
    }
    return out;
  });
  for (const [k, [s, e]] of Object.entries(r)) {
    const clean = s === 0 && e <= 2, must = SHEER.includes(k);
    if (must !== clean) failed++; // a kind that should be right and is not, or one that has become right: move it into SHEER
    console.log(`${clean ? 'ok  ' : must ? 'FAIL' : 'pops'} ${k.padEnd(9)} start ${s}  end ${e}${must === clean ? '' : must ? '   listed as right for scenes that are not opaque' : '   right now: add it to SHEER, and to the timeline\'s note'}`);
  }
  await browser.close(); srv.kill(); rmSync(TMP, { recursive: true, force: true });
  console.log(failed ? `${failed} not as listed` : `as listed: ${SHEER.length} kinds right for scenes that are not opaque, ${Object.keys(r).length - SHEER.length} that pop`);
  process.exit(failed ? 1 : 0);
}
for (const [i, k] of kinds.entries()) {
  errors.length = 0;
  await stage(`mode=trans&trans=${k.id}${GIVEN ? `&o=${encodeURIComponent(GIVEN)}` : ''}`, i);
  let r;
  try {
    r = await page.evaluate(async () => {
      await window.ready;
      const c = document.querySelector('canvas'), M = window.PROMO_META;
      // the copy that is read: the film's own canvas stays as the render has it (the first trap above)
      const sc = document.createElement('canvas'); sc.width = c.width; sc.height = c.height;
      const sg = sc.getContext('2d', { willReadFrequently: true }); sg.globalCompositeOperation = 'copy';
      const grab = (t) => { window.seek(t); sg.drawImage(c, 0, 0); return sg.getImageData(0, 0, c.width, c.height).data; };
      const diff = (a, b) => { let mx = 0, sum = 0; for (let j = 0; j < a.length; j++) { const d = Math.abs(a[j] - b[j]); if (d > mx) mx = d; sum += d; } return [mx, +(sum / a.length).toFixed(3)]; };
      const seams = M.seams.map(([s0, s1]) => {
        const A = grab(s0 - 0.01), first = grab(s0), early = grab(s0 + 0.004), late = grab(s1 - 0.004), last = grab(s1 - 1e-5), B = grab(s1 + 0.01);
        return { start: diff(A, first), early: diff(A, early), late: diff(B, late), end: diff(B, last) };
      });
      const [s0, s1] = M.seams[0], t0 = performance.now();
      for (let j = 0; j < 20; j++) window.seek(s0 + (s1 - s0) * (j + 0.5) / 20);
      sg.drawImage(c, 0, 0); sg.getImageData(0, 0, 1, 1); // wait for the GPU
      const ms = +((performance.now() - t0) / 20).toFixed(1);
      window.seek(M.thumb);
      return { seams, ms, png: c.toDataURL('image/png') };
    });
  } catch (e) { console.log(`FAIL ${k.id}: ${e.message.split('\n')[0]}`); failed++; continue; }
  const name = `${String(i + 1).padStart(2, '0')}-${k.id}`;
  if (SHOTS) { save(SHOTS, name, r.png); labels[name] = k.fits; }
  const ok = r.seams.every((s) => s.start[0] === 0 && s.end[0] <= 2) && !errors.length;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${k.id.padEnd(9)} ${String(r.ms).padStart(5)} ms a frame${k.gl ? ', shader' : ''}   `
    + r.seams.map((s, j) => `${j ? 'back ' : 'there'} start ${s.start[0]} (+4 ms ${s.early[0]})  end ${s.end[0]} (-4 ms ${s.late[0]})`).join('   ')
    + (errors.length ? `   ${errors.join('; ').slice(0, 300)}` : ''));
}
if (SHOTS) writeFileSync(join(SHOTS, 'labels.json'), JSON.stringify(labels, null, 1) + '\n');

if (TEXT) { // each headline style where it differs most from the others, larger, on the same stage
  const tl = {};
  for (const [i, x] of SCHEMA.motion.text.entries()) {
    await stage(`mode=text&style=${x.id}`, 100 + i);
    const png = await page.evaluate(async () => { await window.ready; window.seek(window.PROMO_META.thumb); return document.querySelector('canvas').toDataURL('image/png'); });
    const name = `${String(i + 1).padStart(2, '0')}-${x.id}`;
    save(TEXT, name, png); tl[name] = x.fits;
  }
  writeFileSync(join(TEXT, 'labels.json'), JSON.stringify(tl, null, 1) + '\n');
  console.log(`${SCHEMA.motion.text.length} headline styles → ${TEXT}`);
}

if (TYPES) { // each type set's headline and text line, in the Studio's own stage (the type step's preview), larger
  const tl = {}, q = encodeURIComponent;
  for (const [i, x] of SCHEMA.typesets.entries()) {
    const { display: d, text: t } = x;
    await stage(`mode=text&display=${q(d.family)}&dsrc=${q(d.source)}&dw=${d.weight}&text=${q(t.family)}&tsrc=${q(t.source)}`, 200 + i);
    // settled, not a third of the way in: a face is judged at rest (the headline has landed by 2.4 s and leaves at 3.35)
    const png = await page.evaluate(async () => { await window.ready; window.seek(2.4); return document.querySelector('canvas').toDataURL('image/png'); });
    const name = `${String(i + 1).padStart(2, '0')}-${x.id}`;
    save(TYPES, name, png); tl[name] = `${d.family} + ${t.family}. ${x.about}`;
  }
  writeFileSync(join(TYPES, 'labels.json'), JSON.stringify(tl, null, 1) + '\n');
  console.log(`${SCHEMA.typesets.length} type sets → ${TYPES}`);
}

await browser.close();
srv.kill();
rmSync(TMP, { recursive: true, force: true }); // its own scratch folder
console.log(failed ? `${failed} failed` : `all ${kinds.length} passed`);
process.exit(failed ? 1 : 0);
