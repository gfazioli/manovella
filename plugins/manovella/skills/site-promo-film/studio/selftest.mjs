// The Studio, driven end to end in headless Chrome: a promo brief through all ten steps (a picture
// dropped in as the backdrop, a type set, a headline style, an emphasis, a family of cuts, a pace, a
// shutter, a soundtrack whose beat it measures: a synthetic groove at 123 BPM, made here with ffmpeg,
// named as a file and then taken from a music library made here, and a voice model's voice with its
// tone, speed, touch, lines and subtitles), each step's parts as a deck of cards that say what is chosen in
// them, and a release brief, then the ways it ends (Cancel with its own Chrome, a window closed, a wrong
// key, a path that escapes, a brief that fails the schema), and the window it opens: the Studio's own
// app where it is built (a stand-in app under a temporary HOME, so no real window opens), ended on
// Cancel, its exit read as CLOSED, and Chrome kept by MANOVELLA_WINDOW=chrome. Nothing touches the
// user's own prefs or Downloads: the prefs, the cache and the window's profile live in a temporary
// folder. Along the way: the brand's colour read or chosen and put back, the three storyboards'
// slots, what stays under a row of cards while a list scrolls, the palette's schemes against the
// looks they repaint, every headline style with every emphasis (measured on the stage, in pixels),
// the viewer's motion blur, a voice mixed over the track chosen, a length typed, the reference, the
// Settings window with About as its first pane, and the device the product is shown in: its card in
// the format step, the previews that follow it, and each frame of the schema drawn on the stage.
//
//   node <skill>/studio/selftest.mjs [--shots <dir>] [--roots <dir>[,<dir>…]]
//
// Run it from a folder where playwright-core is installed (a film's work folder `src/` has it): it
// is loaded from the current directory, like render.mjs drives the installed Chrome. --shots keeps
// a screenshot of every step, to look at — the wizard is a UI, and a passing run proves the flow,
// not the picture. Exit 0 when every check passes.
//
// Traps it was built on:
// - A tile is queued before its card is on the page: a queue that started at once skipped every
//   tile as gone, and the shimmer never stopped. pump() yields a turn first.
// - The finish screen's class was `.done`, as was a finished step in the sidebar: the steps grew
//   to 112 px. Classes here are scoped by meaning (`.sent`).
// - Only a hash differs between two looks of stage.html, and a hash change does not reload a page:
//   every preview URL carries a fresh query.
// - A hover is previewed after a pause; one still pending from the last step replaced, a second
//   later, the aspect just clicked in this one. It now needs its card still on the page.
// - A nowrap request line in the footer widened the whole main column past the window (a `1fr`
//   column is at least its content): `minmax(0, 1fr)` on .app, and an explicit column on .main —
//   its implicit one grew as soon as the motion made the request line long (1480 → 1603 px).
// - Thumbnails of a style taken when it has nearly settled all look alike: a style's still is a third
//   of the way in, at a size that fills the tile, on a quiet backdrop.
// - A choice redraws its whole step, and took the focus and the caret with it: the website field lost
//   both half a second into a URL (what was typed next went nowhere), Enter on a card left the focus
//   on the page. The step now hands them back, when the last input was the keyboard — after a click
//   the focus stays on the page, so Enter still means Continue.
// - A preview asked for while paused was given a start later than the pause: it showed a time before
//   its own range, and the clock read -1.7 s. It now stands on its still.
// - With a headline style chosen, the motion step answered a click on a cut with the headline again
//   (the pointer, still on the card, then hovered the cut back: a flash). The viewer stays on the
//   last thing touched. A test that leaves the pointer on the card cannot see this: move it away.
// - An address that is not one (a stray '%') threw inside the server's async handler and ended the
//   Studio, exit 1, with the wizard open.
// - The music library is a stand-in made here (MANOVELLA_MUSIC): the user's own library is never listed by
//   a test, and a folder named in musicLibraryIgnore (settings.json under STUDIO_PREFS) must not be offered. A voice model
//   says its sample only where this Mac has one (voice.mjs --setup): elsewhere the 409 that says so is
//   what is checked. And a brief remembered from before a transition or a look
//   was retired threw on "Like last time", reading its label.
// - A deck whose cards came and went with a choice (the voice's reading, its lines and its mix, there only
//   with a voice) moved the cards under the pointer: a step's cards are counted under every choice that
//   used to change them. And a control lives in one card's panel now: open the card before reaching for it.
//
// - What sticks is judged where it is drawn, not where it is laid out: under a row of cards the
//   open panel's title and filter are looked for with elementFromPoint right under the row, and
//   the gap between the row and the panel is probed for tiles of the list scrolling by. Laid out,
//   they were always "there".
// - A mark is drawn once its headline has settled, so a frame taken early shows none whatever the
//   style does: the marks are counted on the frame just before the headline leaves (the page's
//   duration less 1.3 s), as the accent's pixels the mark adds over the same frame without it.
// - A check of a fix must fail without the fix, not stop the run: a wait for what the fix brings
//   is short and caught, so the checks after it are still made (and seen to fail) on the old code.
// - A step remembers the card left open, so Review's Edit is only seen to open its row's card when
//   another one was left open there: with the right one open already, an Edit that names no card passes.
// - A device is looked for where the page says the product is (PROMO_META.box, through the camera of
//   that frame), as the dark glass along the middle of its sides, clear of its rounded corners: a
//   sample of the whole frame cannot tell a phone from a window, their headline is the darkest thing.
//
// The cuts themselves (does each start on the scene it leaves and end on the one it brings, does its
// shader compile, how long does a frame take) are transcheck.mjs, beside this file.
import { createRequire } from 'node:module';
import { spawn, spawnSync, execSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { mkdtempSync, readFileSync, mkdirSync, existsSync, rmSync, writeFileSync, chmodSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(join(process.cwd(), 'noop.js'))('playwright-core');
const STUDIO = join(dirname(fileURLToPath(import.meta.url)), 'studio.mjs');
const IDENTITY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'studio.json'), 'utf8'));
const SCHEMA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'schema.json'), 'utf8'));
const ICON = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'icon-1024.png'));
const PICTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'looks.jpg'); // one of the kit's own pictures
const { synth } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'beats.mjs')).href);
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const SHOTS = arg('--shots');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const TMP = mkdtempSync(join(tmpdir(), 'manovella-test-'));
const ROOTS = arg('--roots');
const TRACK = join(TMP, 'groove.wav'); synth(TRACK); // 123 BPM, its first bar at 0.4 s, a chord from bar 9 (16.0 s)
// a music library with one brand's track and its notes, a track at its top, and a folder never offered
// because musicLibraryIgnore (in the settings file under STUDIO_PREFS) names it
const BRAND = join(TMP, 'brand');
mkdirSync(join(BRAND, 'Acme', 'audio'), { recursive: true }); mkdirSync(join(BRAND, 'Songs', 'audio'), { recursive: true });
mkdirSync(join(TMP, 'prefs'), { recursive: true });
writeFileSync(join(TMP, 'prefs', 'settings.json'), JSON.stringify({ musicLibraryIgnore: ['Songs'] }));
writeFileSync(join(BRAND, 'Acme', 'audio', 'acme-music-groove.wav'), readFileSync(TRACK));
writeFileSync(join(BRAND, 'loose-groove.wav'), readFileSync(TRACK));
writeFileSync(join(BRAND, 'Acme', 'audio', 'acme-music-notes.txt'), 'Acme video music, made for the test.\n\nacme-music-groove.wav\n  A synthetic groove, 123 BPM.\n');
writeFileSync(join(BRAND, 'Songs', 'audio', 'song.wav'), readFileSync(TRACK));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a folder under the home as the Studio shows it: ~/Pictures, or ~\Pictures on Windows
const tilded = (name) => `~${sep}${name}`;
// the machine as the copy names it: this Mac on macOS, this computer elsewhere
const MACHINE = process.platform === 'darwin' ? 'Mac' : 'computer';
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

// given: the folders the wizards' runs are given (--out, --roots, the music library), which the Settings then show
// and do not change; false, a run that takes them from its settings.json, as a user's does
function start(extra = [], env = {}, { given = true, cwd } = {}) {
  const p = spawn('node', [STUDIO, ...(given ? ['--out', join(TMP, 'out'), ...(ROOTS ? ['--roots', ROOTS] : [])] : []), ...extra],
    // CLAUDECODE: the copy names Claude, as these checks read it, wherever the test runs from (another agent's below)
    { cwd, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, STUDIO_PREFS: join(TMP, 'prefs'), MANOVELLA_MUSIC: given ? BRAND : '', CLAUDECODE: '1', ...env } });
  const lines = [];
  let code = null;
  p.on('exit', (c) => { code = c; });
  const url = new Promise((ok) => p.stdout.on('data', (d) => {
    for (const l of String(d).split('\n').filter(Boolean)) { lines.push(l); if (l.startsWith('STUDIO ')) ok(l.slice(7)); }
  }));
  return { p, lines, url, code: () => code };
}

// studio.json is what the window app is built from (the studio-window kit), and the page shows its version
check(/^\d+\.\d+\.\d+$/.test(IDENTITY.version || '') && IDENTITY.name === 'Manovella' && IDENTITY.id === 'manovella' && IDENTITY.ping === '/api/ping', `the Studio has a name, an id, a semver version and a ping path (${IDENTITY.version})`);
// one version for Manovella: the Studio's is the plugin's and its marketplace entry's (where this copy has them)
{
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const plugin = join(root, '.claude-plugin', 'plugin.json'), market = join(root, '..', '..', '.claude-plugin', 'marketplace.json');
  const versions = [IDENTITY.version];
  if (existsSync(plugin)) versions.push(JSON.parse(readFileSync(plugin, 'utf8')).version);
  if (existsSync(market)) versions.push(JSON.parse(readFileSync(market, 'utf8')).plugins.find((p) => p.name === 'manovella')?.version);
  check(versions.length > 1 && versions.every((v) => v === IDENTITY.version), `studio.json, plugin.json and the marketplace say one version (${versions.join(', ')})`);
}
check(ICON.toString('ascii', 1, 4) === 'PNG' && ICON.readUInt32BE(16) === 1024 && ICON.readUInt32BE(20) === 1024, 'and a 1024 px PNG icon for its window app');
// the voices the Studio offers are the ones voice.mjs says, in the tones it reads
{
  const V = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'voice.mjs')).href);
  const F = SCHEMA.fields;
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  check(same(F.voiceModel.options.map((o) => o.value), Object.keys(V.MODELS)) && same(F.voiceTone.options.map((o) => o.value), Object.keys(V.TONES)), 'the schema offers the models and the tones voice.mjs has');
  // every voice card is of a model the schema offers, and a named voice is one of voiceSpeaker's; the models with no tone are the ones voice.mjs has no TONES temperature for
  const models = F.voiceModel.options.map((o) => o.value), named = SCHEMA.voices.filter((v) => v.speaker);
  check(SCHEMA.voices.every((v) => models.includes(v.model)) && models.every((m) => SCHEMA.voices.some((v) => v.model === m)), 'the schema: every voice is of a model it offers, and every model has a voice');
  check(same(named.map((v) => v.speaker), F.voiceSpeaker.options.map((o) => o.value)) && new Set(named.map((v) => v.speaker)).size === named.length, 'the schema: the named voices are voiceSpeaker\'s options, each once');
  check(F.voiceModel.options.every((o) => (o.tone === false) === !Object.values(V.TONES).some((t) => t && V.MODELS[o.value] in t)) && SCHEMA.voices.every((v) => !v.sample || /\{product\}/.test(v.sample)), 'the schema: a model has no tone exactly when voice.mjs has no temperature for it, and a voice\'s own sample line names the product');
}

// off macOS, WebGL in software where there is no GPU (render.mjs says why)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: process.platform === 'darwin' ? [] : ['--enable-unsafe-swiftshader'] });
// a page at rest: no thumbnail still loading, the viewer not busy
// (STUDIO_TEST_IDLE: longer, in ms, where the previews are drawn in software, as on a CI runner without a GPU)
const idleOn = (page) => page.waitForFunction(() => !document.querySelector('.thumb.wait') && !document.querySelector('#viewer.busy'), null, { timeout: Number(process.env.STUDIO_TEST_IDLE) || 60000 });
async function wizard(name, steps) {
  const s = start(['--no-open']);
  const page = await browser.newPage({ viewport: { width: 1480, height: 940 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const idle = () => idleOn(page);
  const shot = async (n) => SHOTS && page.screenshot({ path: join(SHOTS, `${name}-${n}.png`) });
  await page.goto(await s.url);
  await page.waitForSelector('.card');
  await idle();
  await steps({ page, idle, shot });
  await page.waitForSelector('.sent', { timeout: 10000 });
  await shot('sent');
  await sleep(2000);
  await page.close();
  check(errors.length === 0, `${name}: no page errors ${errors.join('; ')}`);
  check(s.code() === 0, `${name}: the Studio exited 0 (${s.code()})`);
  const line = s.lines.find((l) => l.startsWith('BRIEF '));
  check(!!line, `${name}: it printed BRIEF`);
  return line ? JSON.parse(readFileSync(line.slice(6), 'utf8')) : {};
}
// a step's deck: a card opened when it is not (one is open at a time), the line a card shows of what is chosen in
// it, the cards there are (the open one starred), and whether the open card and the top of its panel are in sight
const openFold = async (page, id) => { const it = `.dcard[data-fold="${id}"]`; if (!(await page.$(`${it}.open`))) await page.click(it); await page.waitForSelector(`${it}.open`); };
const foldSum = (page, id) => page.$eval(`.dcard[data-fold="${id}"]`, (c) => [c.querySelector('.dfig').textContent, c.querySelector('.dcap').textContent].filter(Boolean).join(' · '));
const deckIds = (page) => page.$$eval('.dcard', (c) => c.map((x) => x.dataset.fold + (x.classList.contains('open') ? '*' : '')).join(' '));
const inSight = (page, id) => page.evaluate((id) => {
  const pane = document.querySelector('#pane').getBoundingClientRect(), card = document.querySelector(`.dcard[data-fold="${id}"].open`), panel = document.querySelector('.dpanel');
  const under = document.querySelector('.audition')?.getBoundingClientRect().bottom ?? pane.top; // what is stuck at the top of the pane covers what is behind it
  return !!card && !!panel && card.getBoundingClientRect().top >= under - 1 && panel.getBoundingClientRect().top < pane.bottom - 40;
}, id);
const presetNow = (page) => page.textContent('.dcard[data-fold="preset"] .dfig'); // the voice's preset, as its card says it
// a row of cards that sticks, at the scroll the pane is at: whether the open panel's title and its filter are right
// under the row, and how many points of the gap between the row and the panel show a tile of the list scrolling by
const stack = (page) => page.evaluate(() => {
  const p = document.querySelector('#pane'), pr = p.getBoundingClientRect(), card = document.querySelector('.dcard.open').getBoundingClientRect();
  const under = (el) => { const r = el?.getBoundingClientRect(); return !!r && r.height > 0 && r.top >= card.bottom - 1 && r.top - card.bottom < 44 && (document.elementFromPoint(r.left + 6, r.top + r.height / 2) || p).closest('.section') === el.closest('.section'); };
  let inGap = 0;
  for (let x = pr.left + 16; x < pr.right - 16; x += 20) if (document.elementFromPoint(x, card.bottom + 5)?.closest('.card')) inGap++;
  return { at: Math.round(p.scrollTop), title: under(document.querySelector('.dpanel .section')), filter: under(document.querySelector('.dpanel .section .seg')), inGap };
});
const scrollPane = async (page, y) => { await page.$eval('#pane', (p, y) => { p.scrollTop = y; }, y); await page.waitForTimeout(90); };
// On the stage, in the Studio's own page: every headline style with each mark, as the accent's pixels the mark adds
// to the frame just before the headline leaves (960 x 540, text mode, a red accent on the plain look)
const marksOf = (page) => page.evaluate(async () => {
  const load = (hash) => new Promise((ok) => { const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;left:-9999px;width:960px;height:540px;visibility:hidden'; f.onload = async () => { await f.contentWindow.ready; ok(f); }; f.src = `/studio/stage.html?n=${Math.random()}#${hash}&accent=FF0000&look=plain&w=960&h=540`; document.body.append(f); });
  const red = (f) => { const w = f.contentWindow; w.seek(w.PROMO_META.duration - 1.3); const c = f.contentDocument.querySelector('canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i] - d[i + 1] > 50 && d[i] - d[i + 2] > 50) n++; f.remove(); return n; };
  const out = {};
  for (const style of Object.keys(TYPE.STYLES)) {
    const none = red(await load(`mode=text&style=${style}`));
    out[style] = {};
    for (const mark of Object.keys(TYPE.MARKS)) out[style][mark] = red(await load(`mode=text&style=${style}&emph=${mark}`)) - none;
  }
  return out;
});
// On the stage, in the Studio's own page: every frame the schema offers, drawn at the page's own still (960 x 540,
// the plain look). What the page says it drew, and how (touched or clicked), and what is there, read in a copy of the
// frame at the box the page says the product is in (a MacBook's with its base, an iMac's with its stand; where in it
// a Mac's parts are, META.parts: its top, what it stands on, an iMac's chin): the share of dark samples along the middle of the top and the
// sides, just inside (`rim`: a device's black glass, a terminal; a window's edge and an iMac's bezel are light), in
// the middle of the box (`core`: a screen is lit, a terminal is not), the share of aluminium along a MacBook's base
// (`base`), and the box itself, small, to tell one frame's drawing from another's (`sig`: a window and the UI alone
// are the same app, 3.8 apart on average; one drawn in the other's place is 0). An iMac's own two: `chin`, how much
// of the band under its display is one flat colour from side to side, and not the bezel's (0 where it is the
// bezel's: no chin); `stand`, how much of the row under its body is as a stand leaves it, the stand's colour across
// the middle and another beside it (with nothing under the body the row is much the same right across: 0.38).
const framesOf = (page) => page.evaluate(async () => {
  const S = (await (await fetch('/api/context', { headers: { 'x-studio-key': new URLSearchParams(location.search).get('k') } })).json()).schema, W = 960, H = 540;
  const out = [];
  for (const fr of S.frames) {
    const f = await new Promise((ok, no) => { // loaded and ready, or said to have failed: never waited on for good
      const el = document.createElement('iframe'), late = setTimeout(() => no(new Error(`${fr.id}: the stage never became ready`)), 20000);
      el.style.cssText = `position:fixed;left:-9999px;width:${W}px;height:${H}px;visibility:hidden`;
      el.onload = () => Promise.resolve(el.contentWindow.ready).then(() => { clearTimeout(late); ok(el); }, (e) => { clearTimeout(late); no(new Error(`${fr.id}: ${e?.message || e}`)); });
      el.src = `/studio/stage.html?n=${Math.random()}#ui=${fr.stage}&look=plain&w=${W}&h=${H}`; document.body.append(el);
    });
    const w = f.contentWindow, M = w.PROMO_META; w.seek(M.thumb);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(f.contentDocument.querySelector('canvas'), 0, 0);
    const d = g.getImageData(0, 0, W, H).data, product = M.product, box = M.box, touched = M.touch === !!fr.touch, parts = M.parts || {}; f.remove();
    if (!box) { out.push({ id: fr.id, stage: fr.stage, product, touched }); continue; }
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rgb = (x, y) => { const i = (Math.round(clamp(y, 0, H - 1)) * W + Math.round(clamp(x, 0, W - 1))) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const lum = (x, y) => rgb(x, y).reduce((a, v) => a + v, 0) / 3, far = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const share = (pts, is) => +(pts.filter(([x, y]) => is(lum(x, y))).length / pts.length).toFixed(2), dark = (l) => l < 70;
    const [bx, by, bw, bh] = box, top = parts.top || { x: 0, y: 0, w: 1, h: 1 }, lw = bw * top.w, lx = bx + bw * top.x, lh = bh * top.h; // a Mac's top, as the page says it, or the box
    const inset = Math.min(lw, lh) * 0.012, rim = [], core = [], base = [], sig = [];
    for (let k = 0.2; k <= 0.8; k += 0.02) rim.push([lx + lw * k, by + inset], [lx + inset, by + lh * k], [lx + lw - inset, by + lh * k]);
    for (let u = 0.4; u <= 0.6; u += 0.02) for (let v = 0.4; v <= 0.6; v += 0.02) core.push([lx + lw * u, by + lh * v]);
    const under = parts.under, baseY = under ? by + bh * (under.y + under.h * 0.55) : by + bh; // across what a Mac stands on, just under its middle
    for (let k = 0.2; k <= 0.8; k += 0.02) base.push([bx + bw * k, baseY]);
    for (let v = 0.5; v < 16; v++) for (let u = 0.5; u < 24; u++) sig.push(Math.round(lum(bx + bw * u / 24, by + bh * v / 16)));
    const got = { rim: share(rim, dark), core: share(core, dark) };
    if (under) got.base = share(base, (l) => l > 110 && l < 236);
    if (parts.chin) { // an iMac: one flat colour across its chin, not the bezel's; under its body the stand's colour in the middle, as wide as the page says, and not beside it
      const chinY = by + bh * (parts.chin.y + parts.chin.h / 2), half = under.w / top.w / 2, band = [], row = [];
      for (let k = 0.04; k <= 0.96; k += 0.02) band.push(rgb(lx + lw * k, chinY));
      for (let k = 0.2; k <= 0.8; k += 0.02) if (Math.abs(k - 0.5) < half * 0.84 || Math.abs(k - 0.5) > half * 1.18) row.push([Math.abs(k - 0.5) < half * 0.84, rgb(lx + lw * k, baseY)]);
      const chinIs = rgb(lx + lw / 2, chinY), standIs = rgb(lx + lw / 2, baseY), bezel = rgb(lx + lw * 0.3, by + inset);
      got.chin = far(chinIs, bezel) > 40 ? +(band.filter((c) => far(c, chinIs) < 24).length / band.length).toFixed(2) : 0;
      got.stand = +(row.filter(([mid, c]) => (far(c, standIs) < 24) === mid).length / row.length).toFixed(2);
    }
    out.push({ id: fr.id, stage: fr.stage, product, touched, ...got, sig });
  }
  return out;
});
// a shot from the top of the step, its cards: once a panel just opened has unfolded, and with the pointer off the tiles (a tile under it would play)
// A promo that speaks, in a square: for every frame the schema offers, the lowest the product comes over the loop
// (PROMO_META.box, the camera pushing in included) against the top of the subtitle's plate (FILM.captions: one line,
// 7.5 % off the bottom, the plate 1.68 times its size). Negative: clear of it, by that many pixels.
const subsClear = (page) => page.evaluate(async () => {
  const S = (await (await fetch('/api/context', { headers: { 'x-studio-key': new URLSearchParams(location.search).get('k') } })).json()).schema, W = 540, H = 540;
  const out = {};
  for (const fr of S.frames) {
    const f = await new Promise((ok, no) => { const el = document.createElement('iframe'), late = setTimeout(() => no(new Error(`${fr.id}: the stage never became ready`)), 20000); el.style.cssText = `position:fixed;left:-9999px;width:${W}px;height:${H}px;visibility:hidden`; el.onload = () => Promise.resolve(el.contentWindow.ready).then(() => { clearTimeout(late); ok(el); }, (e) => { clearTimeout(late); no(e); }); el.src = `/studio/stage.html?n=${Math.random()}#ui=${fr.stage}&look=plain&say=1&w=${W}&h=${H}`; document.body.append(el); });
    const w = f.contentWindow, top = H * 0.925 - 1.68 * Math.round(Math.min(W, H) * 0.042);
    let low = -Infinity;
    for (let t = 0.5; t < 6.6; t += 0.25) { w.seek(t); const b = w.PROMO_META.box; if (b) low = Math.max(low, b[1] + b[3]); }
    out[fr.id] = +(low - top).toFixed(1); f.remove();
  }
  return out;
});
// The Device tiles' close-up (on=product) of every frame: the product is the whole picture there, so it is there from
// the loop's first moment, and the loop's last moment is its first. In a 48 x 27 copy of the frame: the share of it
// that is not the plain look's flat canvas at the start (0 with nothing on it; a light UI on it, a tenth), and the mean
// difference (0-255) between the start and the end.
const closeLoop = (page) => page.evaluate(async () => {
  const S = (await (await fetch('/api/context', { headers: { 'x-studio-key': new URLSearchParams(location.search).get('k') } })).json()).schema, out = {};
  for (const fr of S.frames) {
    const f = await new Promise((ok, no) => { const el = document.createElement('iframe'), late = setTimeout(() => no(new Error(`${fr.id}: the stage never became ready`)), 20000); el.style.cssText = 'position:fixed;left:-9999px;width:480px;height:270px;visibility:hidden'; el.onload = () => Promise.resolve(el.contentWindow.ready).then(() => { clearTimeout(late); ok(el); }, (e) => { clearTimeout(late); no(e); }); el.src = `/studio/stage.html?n=${Math.random()}#ui=${fr.stage}&on=product&look=plain&w=480&h=270`; document.body.append(el); });
    const w = f.contentWindow, D = w.PROMO_META.duration, c = document.createElement('canvas'); c.width = 48; c.height = 27; const g = c.getContext('2d');
    const at = (t) => { w.seek(t); g.clearRect(0, 0, 48, 27); g.drawImage(f.contentDocument.querySelector('canvas'), 0, 0, 48, 27); return g.getImageData(0, 0, 48, 27).data; };
    const apart = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return +(d / a.length).toFixed(2); };
    const start = at(0.02), there = (d) => { let n = 0; for (let i = 0; i < d.length; i += 4) n += Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 72 ? 1 : 0; return +(n / (d.length / 4)).toFixed(2); };
    out[fr.id] = { there: there(start), seam: apart(start, at(D - 0.02)) };
    f.remove();
  }
  return out;
});
const paneTop = async (page) => { await page.mouse.move(700, 40); await page.$eval('#pane', (p) => { p.scrollTop = 0; }); await page.waitForTimeout(900); };
const pickProduct = async (page) => { // the first repository listed: any product makes the same brief
  await page.click('.plist button');
  await page.waitForTimeout(800);
};

// ---------------------------------------------------------------- a promo, through every step
const promo = await wizard('promo', async ({ page, idle, shot }) => {
  check(await page.textContent('#ver') === `v${IDENTITY.version}`, `promo: the sidebar names the Studio's version (${await page.textContent('#ver')})`);
  // About: the app's About menu item opens it (the kit sends studio:menu), and so does the brand; while it
  // is open the wizard's keys are its own (Enter on a link is no Continue), and Esc closes it. Opened twice at
  // once, as a double click does, it is built once.
  const about = JSON.parse(readFileSync(join(dirname(STUDIO), 'about.json'), 'utf8'));
  const playing = () => page.getAttribute('#play', 'aria-label');
  const playBefore = await playing();
  let abGets = 0; page.on('request', (r) => { if (new URL(r.url()).pathname.endsWith('/about.json')) abGets++; });
  await page.evaluate(() => { for (let i = 0; i < 2; i++) dispatchEvent(new CustomEvent('studio:menu', { detail: { id: 'about' } })); });
  await page.waitForSelector('#settings-dlg[open] .ab-app');
  const playBehind = await playing(); await shot('about');
  const ab = JSON.stringify(await page.evaluate(() => ({ version: document.querySelector('.ab-ver')?.textContent, links: document.querySelectorAll('.ab-links a').length,
    apps: document.querySelectorAll('.ab-app').length, sponsors: document.querySelectorAll('.ab-sp:not(.ab-slot)').length,
    outside: [...document.querySelectorAll('#set-about a')].every((a) => a.target === '_blank' && /^https:/.test(a.href)) })));
  const abWant = JSON.stringify({ version: `Version ${IDENTITY.version}`, links: about.links.length, apps: about.apps.length, sponsors: about.sponsors.length, outside: true });
  check(ab === abWant && abGets === 1, `About: the version, the links, apps and sponsors of about.json, every link to the browser; opened twice at once, built once (${ab}, ${abGets} fetch)`);
  const step0 = await page.textContent('#eyebrow');
  await page.focus('.ab-links a'); await page.keyboard.press('b'); await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('play').getAttribute('aria-label') === 'Pause the preview', null, { timeout: 1500 }).catch(() => {}); // close is heard a moment later
  check(playBefore === 'Pause the preview' && playBehind === 'Play the preview' && await playing() === 'Pause the preview', `About: the preview pauses behind it and plays again once it closes (${playBefore} → ${playBehind} → ${await playing()})`);
  check(!(await page.$('#settings-dlg[open]')) && await page.textContent('#eyebrow') === step0 && !(await page.$('#blur[aria-pressed="true"]')), 'About: the wizard ignores its keys while it is open, and Esc closes it');
  await page.click('#brand'); await page.waitForSelector('#settings-dlg[open] #set-about .ab-app');
  const box = await page.$eval('#settings-dlg', (d) => { const r = d.getBoundingClientRect(); return { x: r.right - 3, y: r.bottom - 3 }; });
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(200); // its own margin, inside the box
  const kept = !!(await page.$('#settings-dlg[open]'));
  await page.mouse.click(5, 5); await page.waitForTimeout(200);
  check(kept && !(await page.$('#settings-dlg[open]')), 'About: the brand opens it too, a click on its own margin keeps it, one on the backdrop closes it');
  // Settings: the gear opens them, and the app menu's item; what this run was given is shown, not changed.
  // A Mac's settings window: a sidebar (a search, About with the icon and the version, a row a pane, each with
  // its tile) and one pane showing, with its tile, its name and what it is for. About is its first pane: the gear,
  // after the brand showed About, opens on a setting all the same.
  await page.click('#settings'); await page.waitForSelector('#settings-dlg[open] .set-pane:not(.ab-pane)');
  const setWin = await page.evaluate(() => {
    const d = document.querySelector('#settings-dlg'), side = d.querySelector('.set-side').getBoundingClientRect(), main = d.querySelector('.set-main').getBoundingClientRect();
    const shown = [...d.querySelectorAll('.set-pane')].filter((p) => !p.hidden).map((p) => p.id), head = d.querySelector('.set-pane:not([hidden]) .set-head');
    return { rows: [...d.querySelectorAll('.set-side [data-pane]')].map((b) => `${b.dataset.pane}${b.getAttribute('aria-current') === 'true' ? '*' : ''}`).join(' '), tiles: d.querySelectorAll('.set-nav .tile svg').length,
      about: d.querySelector('.set-about').textContent, beside: side.right <= main.left + 1 && side.width > 180 && main.width > side.width, shown: shown.join(), head: `${head?.querySelector('h2').textContent}|${!!head?.querySelector('.tile.big svg')}|${head?.querySelector('p').textContent.length > 10}`, search: !!d.querySelector('.set-search'),
      named: [...d.querySelectorAll('.set-side [data-pane]')].every((b) => (b.getAttribute('aria-label') || '').length > 3 && !!b.title) };
  });
  // narrow, the sidebar is down to its tiles: each row keeps its name on the button itself
  await page.setViewportSize({ width: 720, height: 940 });
  const narrow = await page.evaluate(() => [...document.querySelectorAll('#settings-dlg .set-nav')].map((b) => `${getComputedStyle(b.lastElementChild).display}:${b.getAttribute('aria-label')}`).join(' '));
  await page.setViewportSize({ width: 1480, height: 940 });
  check(narrow === 'none:Projects none:Pictures none:Music library none:Work folder' && setWin.named, `Settings: in a narrow window the rows are tiles alone, and each button still says which pane it is (${narrow})`);
  check(setWin.rows === 'about projectFolders* pictureFolders musicLibrary workRoot' && setWin.tiles === 4 && setWin.about === `About Manovella${IDENTITY.version}` && setWin.beside && setWin.shown === 'set-projectFolders' && setWin.head === 'Projects|true|true' && setWin.search,
    `Settings: a sidebar (a search, About with the version, a row a pane with its tile) beside one pane, which has its tile, its name and what it is for (${JSON.stringify(setWin)})`);
  await page.click('[data-pane="musicLibrary"]');
  const paneNow = async () => (await page.$$eval('.set-pane', (p) => p.filter((x) => !x.hidden).map((x) => x.id))).join();
  const onMusic = await paneNow();
  await page.fill('.set-search', 'pictures'); await page.waitForTimeout(100);
  const found = `${(await page.$$eval('.set-nav', (b) => b.filter((x) => !x.hidden).map((x) => x.dataset.pane))).join()}|${await paneNow()}`;
  await page.fill('.set-search', ''); await page.click('[data-pane="projectFolders"]');
  check(onMusic === 'set-musicLibrary' && found === 'pictureFolders|set-pictureFolders', `Settings: a row shows its pane, alone; the search keeps the rows that hold what is typed and shows the first (${onMusic}; ${found})`);
  const sets = (await page.$$eval('#settings-dlg .set-pane:not(.ab-pane)', (x) => x.map((s) => `${s.id.slice(4)}:${s.querySelector('.set-lock') ? 'given' : s.querySelector('.set-acts button')?.textContent}`))).join(' ');
  check(sets === `projectFolders:${ROOTS ? 'given' : 'Choose…'} pictureFolders:Choose… musicLibrary:given workRoot:given`, `Settings: the folders this run was given (--roots, --out, MANOVELLA_MUSIC) shown, not changed (${sets})`);
  const refused = await page.evaluate(async () => { const r = await fetch('/api/settings', { method: 'POST', headers: { 'x-studio-key': new URLSearchParams(location.search).get('k'), 'content-type': 'application/json' }, body: JSON.stringify({ workRoot: '/tmp' }) }); return `${r.status} ${(await r.json()).error}`; });
  check(refused === '400 given for this run by --out', `Settings: a setting this run was given is not written, the file would change and the run would not (${refused})`);
  const playIn = await playing(); await shot('settings'); await page.keyboard.press('Escape');
  await page.evaluate(() => dispatchEvent(new CustomEvent('studio:menu', { detail: { id: 'settings' } }))); await page.waitForSelector('#settings-dlg[open]');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => document.getElementById('play').getAttribute('aria-label') === 'Pause the preview', null, { timeout: 1500 }).catch(() => {});
  check(playIn === 'Play the preview' && await playing() === 'Pause the preview' && !(await page.$('#settings-dlg[open]')), 'Settings: studio:menu settings (⌘,) opens them too; the preview pauses behind them and plays again');
  // every option the Studio offers is one the engine has, and the other way round: a look, a style or
  // a transition added to one and not the other is a tile that draws nothing, or a choice never offered
  const drift = await page.evaluate(async () => {
    const S = (await (await fetch('/api/context', { headers: { 'x-studio-key': new URLSearchParams(location.search).get('k') } })).json()).schema, M = S.motion, out = [];
    const same = (what, a, b) => { const x = a.filter((v) => !b.includes(v)), y = b.filter((v) => !a.includes(v)); if (x.length || y.length) out.push(`${what}: only in the schema [${x}], only in the engine [${y}]`); };
    same('looks', S.looks.map((l) => l.id), Object.keys(FX.PRESETS));
    same('headline styles', M.text.map((t) => t.id), Object.keys(TYPE.STYLES));
    same('marks', M.emphasis.map((t) => t.value).filter(Boolean), Object.keys(TYPE.MARKS));
    same('transitions', M.transitions.map((t) => t.id), Object.keys(FILM.TRANSITIONS));
    same('shader cuts', M.transitions.filter((t) => t.gl).map((t) => t.id), FILM.GL_TRANSITIONS);
    for (const t of M.transitions) if (!M.families.some((f) => f.value === t.family)) out.push(`transition ${t.id} has no family`);
    const F = S.fields, has = (k, v) => F[k].options.some((o) => o.value === v);
    for (const r of S.recipes) {
      const s = r.set, m = s.motion || {}, kind = s.kind || F.kind.default;
      if (s.duration != null && !F.duration.byKind[kind].includes(s.duration)) out.push(`recipe ${r.id}: ${s.duration} s does not fit a ${kind}`);
      for (const k of ['aspects', 'files']) for (const v of s[k] || []) if (!has(k, v)) out.push(`recipe ${r.id}: ${k} ${v}`);
      for (const f of s.formats || []) if (!S.formats.some((x) => x.id === f)) out.push(`recipe ${r.id}: format ${f}`);
      if (m.text && !TYPE.STYLES[m.text]) out.push(`recipe ${r.id}: style ${m.text}`);
      if (m.transition && !FILM.TRANSITIONS[m.transition]) out.push(`recipe ${r.id}: cut ${m.transition}`);
      if (s.voicePreset && !S.voicePresets.some((p) => p.id === s.voicePreset)) out.push(`recipe ${r.id}: voice preset ${s.voicePreset}`);
    }
    for (const p of S.voicePresets) for (const [k, v] of Object.entries(p.set)) if (!has(k, v)) out.push(`voice preset ${p.id}: ${k} ${v}`);
    for (const f of S.formats) if (f.stage && f.stage !== 'none' && !S.frames.some((x) => x.stage === f.stage)) out.push(`format ${f.id}: a stage the stand-in cannot draw (${f.stage}), so it would fall back to the window`); // stage.html, ui=: words alone, or one of the frames' (each checked to be drawn as itself)
    return out;
  });
  check(drift.length === 0, `the schema and the engine name the same looks, styles, marks and transitions, and every recipe is made of them ${drift.join('; ')}`);
  check(await page.textContent('#why') === 'Pick a recipe to start' && await page.$eval('#next', (b) => b.disabled), 'promo: Continue is off, and the page says what it waits for');
  await shot('1');
  await page.click('.card:has-text("Promo loop")'); await idle();
  await page.click('#next'); await page.waitForSelector('.deck');
  check(await deckIds(page) === 'repo* site colour name', `promo: the product step is a deck of four cards, the repository's open on arrival (${await deckIds(page)}: ${await foldSum(page, 'repo')})`);
  await pickProduct(page); await idle();
  const picked = await page.textContent('.plist button.sel .pn'), named = await page.textContent('.dcard[data-fold="name"] .dfig');
  check((await foldSum(page, 'repo')).startsWith(`${picked} · `) && /^Not used/.test(await foldSum(page, 'site')) && /^[a-z0-9.-]+-promo$/.test(named), `promo: each card says what is chosen in it: the repository, no website, the film's name as it is written (${await foldSum(page, 'repo')} | ${named})`);
  await paneTop(page); await shot('2');
  // a card follows its field as it is typed in: the field is not redrawn under the typing, and keeps the focus
  await openFold(page, 'name'); await page.fill('.dpanel input[type=text]', 'acme-cut'); await page.evaluate(() => { document.querySelector('.dpanel input[type=text]').dataset.same = '1'; });
  await page.keyboard.type('-v2');
  check(await page.textContent('.dcard[data-fold="name"] .dfig') === 'acme-cut-v2' && await page.evaluate(() => document.activeElement?.dataset.same === '1' && document.activeElement.value === 'acme-cut-v2'), `promo: the name's card follows the name as it is typed, the field left as it is (${await page.textContent('.dcard[data-fold="name"] .dfig')})`);
  await page.fill('.dpanel input[type=text]', named);
  await page.click('.dcard[data-fold="name"]');
  check(await deckIds(page) === 'repo site colour name' && !(await page.$('.dpanel')), 'promo: a click on the open card closes it: the step at a glance, its four choices and nothing to scroll');
  await shot('2-closed');
  // the brand's colour. Read from the brand: its controls show the colour guessed from the source and cannot be
  // set (they could: a colour was chosen with the box ticked). Unticked: they can, and that is the film's accent.
  // Ticked again, or Back to the brand's colour: the guess is back, the card saying one thing (it read "Read from
  // the brand · the previews use #FF0000, chosen in the Studio", and the guess was gone for good)
  await openFold(page, 'colour');
  const colourNow = () => page.evaluate(() => ({ ticked: document.querySelector('.check input').checked, off: [...document.querySelectorAll('.color input')].every((i) => i.disabled), hex: document.querySelector('.color input[type=text]').value }));
  const soon = { timeout: 3000 }, c0 = await colourNow(), sum0 = await foldSum(page, 'colour');
  await page.$eval('.color input[type=text]', (i) => { i.value = '#00AA55'; i.dispatchEvent(new Event('change')); }); // a script's change, which a disabled field would not get from a person
  await page.waitForTimeout(400);
  const c0b = await colourNow(), sum0b = await foldSum(page, 'colour');
  if (await page.isChecked('.check input')) await page.click('.check input');
  await page.waitForSelector('.color input[type=text]:not([disabled])', soon).catch(() => {});
  await page.fill('.color input[type=text]', '#1F8FFF'); await page.keyboard.press('Tab'); await page.waitForTimeout(600);
  const c1 = await colourNow(), sum1 = await foldSum(page, 'colour'), dot1 = await page.$eval('.dcard[data-fold="colour"] .dswatch', (i) => i.style.background);
  const backBtn = await page.locator('.color button.e').isVisible();
  await page.click('.check input'); await page.waitForSelector('.color input[type=text][disabled]', soon).catch(() => {});
  const c2 = await colourNow(), sum2 = await foldSum(page, 'colour');
  await page.click('.check input'); await page.waitForSelector('.color input[type=text]:not([disabled])', soon).catch(() => {});
  const c3 = await colourNow();
  if (backBtn) await page.click('.color button.e'); else await page.click('.check input');
  await page.waitForSelector('.color input[type=text][disabled]', soon).catch(() => {});
  const c4 = await colourNow(), sum4 = await foldSum(page, 'colour');
  check(c0.ticked && c0.off && c0b.ticked && sum0b === sum0 && /^Read from the brand · /.test(sum0) && !/chosen in the Studio/.test(sum0),
    `colour: read from the brand, the picker and the field are off and show the brand's colour; nothing sets one (${JSON.stringify(c0)}: ${sum0})`);
  check(!c1.ticked && !c1.off && c1.hex === '#1F8FFF' && sum1 === '#1F8FFF · chosen in the Studio' && dot1 === 'rgb(31, 143, 255)', `colour: unticked, a colour is chosen and the card says it alone (${sum1})`);
  check(c2.ticked && c2.off && c2.hex === c0.hex && sum2 === sum0 && c3.hex === '#1F8FFF' && c4.ticked && c4.hex === c0.hex && sum4 === sum0,
    `colour: ticked again, the brand's colour is back, as it was; unticked, the one chosen; Back to the brand's colour, the brand's (${c2.hex} → ${c3.hex} → ${c4.hex}${backBtn ? '' : ', no guess for this product: the box'})`);
  await page.click('#next'); await idle();
  // the format step is a deck too, of two cards: the formats, open on arrival, and the device the product is shown in
  check(await deckIds(page) === 'formats* device' && await foldSum(page, 'formats') === 'Claude picks three · three storyboards, each on its own format' && await foldSum(page, 'device') === 'Claude picks · each format keeps its own frame' && await page.locator('.dphead .slots .slot').count() === 3,
    `format: a deck of two cards, the formats' open on arrival with the three storyboards at the top of its panel, each card saying what is chosen in it (${await deckIds(page)}: ${await foldSum(page, 'formats')} | ${await foldSum(page, 'device')})`);
  await page.click('.card:has-text("Bento")'); await page.click('.card:has-text("Terminal")'); await idle(); await shot('3');
  check(await foldSum(page, 'formats') === 'Bento, Terminal · storyboards 1 and 2; Claude picks the third', `format: the formats' card follows the formats picked (${await foldSum(page, 'formats')})`);
  // three storyboards, as slots that fill in the order the formats are clicked; a fourth is refused in a box of its
  // own, in sight and clear of the cards (it was a line of small orange text right against the first row)
  const slots = () => page.$$eval('.slot', (s) => s.map((x) => `${x.querySelector('.slot-k').textContent}: ${x.querySelector('b').textContent}${x.classList.contains('next') ? ' (next)' : ''}`).join(' | '));
  const two = await slots();
  await page.click('.card:has(.lbl:text-is("Zoom-through"))'); await idle();
  const three = await slots();
  await page.$eval('#pane', (p) => { p.scrollTop = p.scrollHeight; }); await page.waitForTimeout(100);
  await page.click('.card:has(.lbl:text-is("Before / after"))'); await page.waitForTimeout(500);
  const fourth = await page.evaluate(() => {
    const w = document.querySelector('.slot-warn, .pane .warn'), p = document.querySelector('#pane').getBoundingClientRect(), r = w.getBoundingClientRect(), cs = getComputedStyle(w);
    const firstRow = Math.min(...[...document.querySelectorAll('.pane .grid .card')].map((c) => c.getBoundingClientRect().top).filter((t) => t >= r.bottom - 1));
    const lit = (c) => /\d/.test(c) && !/, 0\)$/.test(c) && c !== 'rgba(0, 0, 0, 0)';
    return { text: w.textContent, seen: r.height > 0 && r.top >= p.top - 1 && r.bottom <= p.bottom, boxed: lit(cs.backgroundColor) && parseFloat(cs.borderTopWidth) >= 1 && parseFloat(cs.paddingTop) >= 6, size: parseFloat(cs.fontSize),
      onTop: (document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) || w).closest('.slot-warn, .warn') === w, clear: firstRow - r.bottom, picked: document.querySelectorAll('.card.sel').length };
  });
  await shot('3-fourth');
  check(two === 'Storyboard 1: Bento | Storyboard 2: Terminal | Storyboard 3: Claude picks (next)' && three === 'Storyboard 1: Bento | Storyboard 2: Terminal | Storyboard 3: Zoom-through',
    `formats: three storyboards as slots, filled in the order the formats are clicked, the next one marked (${two} → ${three})`);
  check(/Before \/ after/.test(fourth.text) && fourth.seen && fourth.onTop && fourth.boxed && fourth.size >= 13 && fourth.picked === 3,
    `formats: a fourth is refused where it is seen, scrolled to the last card or not: in a box of its own, over the cards, naming the format (${JSON.stringify(fourth)})`);
  await page.$eval('#pane', (p) => { p.scrollTop = 0; }); await page.waitForTimeout(150);
  const gap = await page.evaluate(() => { const w = document.querySelector('.slot-warn, .pane .warn').getBoundingClientRect(); return Math.min(...[...document.querySelectorAll('.pane .grid .card')].map((c) => c.getBoundingClientRect().top)) - w.bottom; });
  check(gap >= 8, `formats: and it does not touch the cards under it (${gap.toFixed(1)} px clear of the first row)`);
  await page.click('.slot.on >> nth=2', { timeout: 3000 }).catch(() => {}); await idle();
  check(await slots() === two && await page.locator('.slot-warn:not([hidden])').count() === 0, `formats: a slot's × drops its format, and the box goes (${await slots()})`);
  // promo (a format picked by hand) -> Tutorial -> promo: the tutorial's one format was never a choice, so it does not come back as one
  await page.click('#steps li[data-step=film] button'); await page.click('.card:has(.lbl:text-is("Tutorial"))'); await idle();
  await page.click('.card:has-text("Promo loop")'); await idle(); await page.click('#steps li[data-step=format] button'); await idle();
  const back = await page.textContent('#steps li[data-step=format]');
  check(/Claude picks three/.test(back) && !/Tutorial/.test(back), `promo: promo -> Tutorial -> promo does not keep the tutorial's format as a choice (${back.replace(/\s+/g, ' ').trim()})`);
  // the stand-in product takes the first format's shape: what the stage page was asked for, and what it drew
  // (the share of dark samples over a light look: a terminal is a dark quarter of the frame, a window is light)
  const stand = () => page.evaluate(() => {
    const n = (x) => +(new URL(x.contentWindow.location.href).searchParams.get('n') || 0); // each load's ?n= counts up: the newer is the one asked for
    const f = [...document.querySelectorAll('#liveA, #liveB')].filter((x) => x.contentWindow?.location.pathname.endsWith('/stage.html')).sort((a, b) => n(b) - n(a))[0];
    if (!f) return null;
    const w = f.contentWindow, small = document.createElement('canvas'), g = small.getContext('2d');
    w.seek(3.95); small.width = small.height = 20; g.drawImage(w.document.querySelector('canvas'), 0, 0, 20, 20);
    const d = g.getImageData(0, 0, 20, 20).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 120) dark++;
    return { ui: w.PROMO_META.product, dark: dark / 400 };
  });
  const fmtCard = (name) => page.click(`.card:has(.lbl:text-is("${name}"))`);
  await fmtCard('Terminal'); await page.click('#next'); await idle();
  const term = await stand();
  // the device: a card of its own in the format step. Left to Claude, each format keeps its own frame (the previews
  // take the first format's shape, a terminal here); one chosen is what every preview shows from then on, whatever
  // the first format is, and its card, the sidebar and the request line say it
  await page.click('#steps li[data-step=format] button'); await idle();
  await openFold(page, 'device'); await page.mouse.move(700, 40); await idle();
  const tiles = (await page.$$eval('.dpanel .grid .card .lbl', (c) => c.map((x) => x.textContent))).join(', ');
  const dev0 = { sum: await foldSum(page, 'device'), left: await page.getAttribute('.dpanel .option', 'aria-pressed'), picked: await page.locator('.dpanel .grid .card[aria-pressed="true"]').count(), head: await page.textContent('.dphead .section').catch(() => ''), viewer: await stand() };
  await paneTop(page); await shot('3-device');
  // the choice to leave it to Claude, and the frames, apart: as the formats' card has them, a title between, not one against the other
  const leftApart = await page.evaluate(() => { const o = document.querySelector('.dpanel > .option')?.getBoundingClientRect(), g = document.querySelector('.dpanel > .grid')?.getBoundingClientRect(); return o && g ? Math.round(g.top - o.bottom) : null; });
  check(leftApart >= 24, `device: the choice to leave it to Claude stands apart from the frames' tiles, a title between them (${leftApart} px)`);
  await page.click('.dpanel .card:has(.lbl:text-is("iPhone"))'); await page.mouse.move(700, 40); await idle(); await page.waitForTimeout(700);
  const side = async () => (await page.textContent('#steps li[data-step=format] .v')).trim();
  const dev1 = { sum: await foldSum(page, 'device'), side: await side(), line: await page.textContent('#request'), left: await page.getAttribute('.dpanel .option', 'aria-pressed'), picked: await page.textContent('.dpanel .grid .card[aria-pressed="true"] .lbl').catch(() => ''), about: await page.textContent('#about h3'), viewer: await stand() };
  await paneTop(page); await shot('3-device-iphone');
  await page.click('#next'); await idle();
  const onPhone = await stand(); // the looks, with a terminal as the first format: the device wins
  await page.click('#steps li[data-step=format] button'); await idle();
  const cardKept = await deckIds(page);
  await page.click('.dpanel .option', { timeout: 3000 }).catch(() => {}); await page.mouse.move(700, 40); await idle(); await page.waitForTimeout(500);
  const dev2 = { sum: await foldSum(page, 'device'), side: await side(), line: await page.textContent('#request'), viewer: await stand() };
  check(tiles === SCHEMA.frames.map((f) => f.label).join(', ') && /^Mac window, MacBook, iMac, /.test(tiles) && dev0.sum === 'Claude picks · each format keeps its own frame' && dev0.left === 'true' && dev0.picked === 0 && dev0.head.startsWith(`${SCHEMA.frames.length} frames, `) && dev0.viewer?.ui === 'terminal',
    `device: its card holds the schema's frames as tiles, the iMac beside the MacBook, under the choice to leave it to Claude, which is the one made on arrival: the preview keeps the first format's shape (${tiles}; ${JSON.stringify(dev0)})`);
  check(dev1.sum === 'iPhone · the product’s own layout on it, tapped' && dev1.side === 'Terminal · iPhone' && /, terminal, shown on an iPhone, /.test(dev1.line) && dev1.left === 'false' && dev1.picked === 'iPhone' && dev1.about === 'iPhone' && dev1.viewer?.ui === 'iphone',
    `device: a frame chosen, its card says it, and so do the sidebar, the request line and the preview beside it (${JSON.stringify(dev1)})`);
  check(onPhone?.ui === 'iphone' && cardKept === 'formats device*', `device: the previews of the steps after it show the product in the device chosen, whatever the first format is, and the step comes back on the card left open (${JSON.stringify(onPhone)}; ${cardKept})`);
  check(dev2.sum === dev0.sum && dev2.side === 'Terminal' && !/shown/.test(dev2.line) && dev2.viewer?.ui === 'terminal', `device: left to Claude again, the card, the sidebar and the request line drop it and the preview is the first format's shape again (${JSON.stringify(dev2)})`);
  // every frame the schema offers is one the stage draws, and draws as itself: where the page says the product is,
  // an iPhone, an iPad and a MacBook's lid are black glass round a lit screen (and a MacBook stands on its base), an
  // iMac is a light bezel round one, over a chin of one colour and on a stand narrower than itself, a window, a page
  // and the UI alone have a light edge and are three different drawings, a terminal is dark all through
  const drawn = await framesOf(page), is = { iphone: (f) => f.rim >= 0.9 && f.core <= 0.3, ipad: (f) => f.rim >= 0.9 && f.core <= 0.3, macbook: (f) => f.rim >= 0.9 && f.core <= 0.3 && f.base >= 0.9,
    imac: (f) => f.rim <= 0.1 && f.core <= 0.3 && f.chin >= 0.9 && f.stand >= 0.9,
    window: (f) => f.rim <= 0.1 && f.core <= 0.3, browser: (f) => f.rim <= 0.1 && f.core <= 0.3, bare: (f) => f.rim <= 0.1 && f.core <= 0.3, terminal: (f) => f.rim >= 0.9 && f.core >= 0.9 };
  const apart = (a, b) => a.sig.reduce((n, v, i) => n + Math.abs(v - b.sig[i]), 0) / a.sig.length;
  const same = drawn.flatMap((a, i) => drawn.slice(i + 1).filter((b) => a.sig && b.sig && apart(a, b) < 1.5).map((b) => `${a.id} = ${b.id}`));
  const said = (f) => ['rim', 'core', 'base', 'chin', 'stand'].filter((k) => k in f).map((k) => `${k} ${f[k]}`).join(' '); // what was measured of it
  const wrong = drawn.filter((f) => f.product !== f.stage || !f.touched || !is[f.stage]?.(f)).map((f) => `${f.id}: drew ${f.product}${f.touched ? '' : ', touched not as the schema says'}, ${said(f)}`);
  check(drawn.length === SCHEMA.frames.length && wrong.length === 0 && same.length === 0, `device: each of the schema's frames is drawn on the stage as itself, a device as its glass round a lit screen, an iMac as its white bezel over its chin and its stand (${wrong.concat(same).join('; ') || drawn.map((f) => `${f.id} ${said(f)}`).join(', ')})`);
  const near = await closeLoop(page);
  check(Object.keys(near).length === SCHEMA.frames.length && Object.values(near).every((d) => d.there >= 0.08 && d.seam < 3), `device: seen from near, as its tile and its hover show it, every frame is there from the loop's first moment and its loop is seamless, the device never fading out and in (${Object.entries(near).map(([k, d]) => `${k} ${d.there}/${d.seam}`).join(', ')})`);
  const clear = await subsClear(page);
  check(Object.keys(clear).length === SCHEMA.frames.length && Object.values(clear).every((d) => d < 0), `device: in a promo that speaks, every frame ends above the subtitle, in a square too, the camera pushed in (${Object.entries(clear).map(([k, d]) => `${k} ${d}`).join(', ')})`);
  await openFold(page, 'formats');
  await page.click('#steps li[data-step=format] button'); await fmtCard('Terminal'); await fmtCard('Kinetic type'); await page.click('#next'); await idle();
  const words = await stand();
  await page.click('#steps li[data-step=format] button'); await fmtCard('Kinetic type'); await idle();
  await page.click('.card:has-text("Bento")'); await page.click('.card:has-text("Terminal")'); await idle();
  await page.click('#next'); await idle();
  const win = await stand();
  // a Browser walkthrough first: the browser, as the Device card says a walkthrough keeps
  await page.click('#steps li[data-step=format] button'); await openFold(page, 'formats'); await fmtCard('Bento'); await fmtCard('Terminal'); await fmtCard('Browser walkthrough'); await page.click('#next'); await idle();
  const web = await stand();
  await page.click('#steps li[data-step=format] button'); await openFold(page, 'formats'); await fmtCard('Browser walkthrough'); await fmtCard('Bento'); await fmtCard('Terminal'); await page.click('#next'); await idle();
  check(web?.ui === 'browser', `promo: a Browser walkthrough first, its looks are shown in the browser (${JSON.stringify(web)})`);
  check(term?.ui === 'terminal' && term.dark > 0.12 && words?.ui === 'none' && win?.ui === 'window' && win.dark < 0.05, `promo: the looks are shown on the first format's shape: a terminal, the headline alone, else the window (${JSON.stringify({ term, words, win })})`);
  // the film's own device, for the rest of the wizard and the brief: a MacBook
  await page.click('#steps li[data-step=format] button'); await idle();
  await openFold(page, 'device'); await page.click('.dpanel .card:has(.lbl:text-is("MacBook"))'); await page.mouse.move(700, 40); await idle();
  await page.click('#next'); await idle();
  check((await stand())?.ui === 'macbook', 'device: a MacBook chosen, the looks are shown on it');
  check(await page.$$eval('.pane .card', (c) => c.length) === 23 && /^kit\* mine( palette)?$/.test(await deckIds(page)), `promo: twenty-three look tiles, in the first card of the look's deck (${await deckIds(page)})`);
  await page.click('.card:has(.lbl:text-is("aurora"))'); await idle();
  check(/^aurora · dark, WebGL$/.test(await foldSum(page, 'kit')), `promo: the looks' card says the look chosen (${await foldSum(page, 'kit')})`);
  // a row of cards stays at the top of the pane while its long panel scrolls: what is chosen in sight, the next card in reach
  await page.$eval('#pane', (p) => { p.scrollTop = p.scrollHeight; });
  const stuck = await page.evaluate(() => { const p = document.querySelector('#pane'), r = p.getBoundingClientRect(), c = [...document.querySelectorAll('.dcard')].map((x) => x.getBoundingClientRect()); return p.scrollTop > 300 && c.every((x) => x.top >= r.top - 1 && x.bottom < r.top + 200); });
  check(stuck, 'promo: scrolled to the last look, the cards are still at the top of the pane');
  // and under the row stays the head of the open panel, its title and its filter: the card, its bridge and the top
  // of its panel are one shape at any scroll, the list sliding under the head. Only the row used to stay: the title
  // and the filter scrolled away, and tiles showed in the gap under the row, the open card's bridge over them.
  const lookStacks = [];
  for (const y of [0, 70, 380, 1300]) { await scrollPane(page, y); lookStacks.push(await stack(page)); if (y === 380) await shot('4-scrolled'); }
  check(lookStacks.every((s) => s.title && s.filter && !s.inGap), `promo: at any scroll, the looks' title and filter are right under the row of cards, and nothing of the list shows between the row and the panel (${JSON.stringify(lookStacks)})`);
  await paneTop(page); await shot('4');
  // a hover is a look, not a choice: the tile plays, the note beside the viewer follows, and both go back
  await page.hover('.card:has(.lbl:text-is("lava"))'); await page.waitForTimeout(1500);
  check(await page.textContent('#about h3') === 'lava' && !!(await page.$('.card:has(.lbl:text-is("lava")) canvas.live')), 'promo: the tile under the pointer plays, and the viewer shows it');
  await page.mouse.move(700, 40); await page.waitForTimeout(1300);
  check(await page.textContent('#about h3') === 'aurora' && !(await page.$('canvas.live')), 'promo: the pointer gone, the viewer returns to the look chosen');
  // paused, a new preview stands on its still: the stage settled, 3.95 s in
  await page.click('#play'); await page.click('.card:has(.lbl:text-is("night"))'); await page.mouse.move(700, 40); await idle(); await page.waitForTimeout(700);
  check(/^(3\.9|4\.0) \/ 8\.0 s$/.test(await page.textContent('#time')), `promo: paused, a new preview stands on its still (${await page.textContent('#time')})`);
  check(await page.getAttribute('#play', 'aria-label') === 'Play the preview', 'promo: the play button says what it does now');
  check(/^(3\.9|4\.0) of 8\.0 seconds$/.test(await page.getAttribute('#scrub', 'aria-valuetext')), `promo: the scrubber says where it is, not only how long the preview is (${await page.getAttribute('#scrub', 'aria-valuetext')})`);
  await page.click('#play'); await page.click('.card:has(.lbl:text-is("aurora"))'); await idle();
  // a picture of yours: a tab of its own, the picker first, then the folders' most recent
  await openFold(page, 'mine'); await page.waitForSelector('.pane .srcline code');
  const picFrom = await page.textContent('.pane .srcline');
  check(picFrom === `Or one of the most recent in ${tilded('Pictures')}, three levels deep.Change folders…` && await page.$eval('.pane .drop', (d) => !!(d.compareDocumentPosition(document.querySelector('.pane .srcline')) & 4)), `promo: Your pictures: the picker first, then where the pictures come from (${picFrom})`);
  await page.setInputFiles('#file', PICTURE); await page.waitForSelector('.picopts', { timeout: 20000 }); await idle();
  await page.click('.picopts .seg button:has-text("Duotone")'); await idle(); await paneTop(page); await shot('4b');
  check(/^looks\.jpg · sharp, duotone, Ken Burns$/.test(await foldSum(page, 'mine')) && /^Not used · /.test(await foldSum(page, 'kit')), `promo: a picture chosen, its card says how it is treated, and the looks' card that it is not used (${await foldSum(page, 'mine')} | ${await foldSum(page, 'kit')})`);
  await page.click('#next'); await idle();
  check(await page.$$eval('.pane .card .specimen', (c) => c.length) >= 10, 'promo: type sets with specimens');
  // any family: its weight is set in the card it is picked in, and the cards stay two (the weight had a section of its own, there only then)
  await openFold(page, 'family'); await page.click('.fonts button'); await idle();
  const fam = await page.textContent('.fonts button.sel .fn');
  check(await deckIds(page) === 'sets family*' && await page.locator('.dpanel .field:has(.flabel:has-text("Headline weight")) .seg button').count() === 7 && (await foldSum(page, 'family')).startsWith(`${fam} · weight 700, from the kit`) && /^None picked/.test(await foldSum(page, 'sets')),
    `promo: a family picked by hand has its weight in the same card, and the type's cards stay two (${await deckIds(page)}: ${await foldSum(page, 'family')})`);
  await openFold(page, 'sets');
  await page.click('.card:has(.lbl:text-is("Fraunces"))'); await idle(); await paneTop(page); await shot('5');
  check(/^Fraunces · /.test(await foldSum(page, 'sets')) && /^None picked/.test(await foldSum(page, 'family')), `promo: a set chosen, its card says it (${await foldSum(page, 'sets')})`);
  await page.click('#next'); await idle();
  check(await deckIds(page) === 'headlines* cuts pace' && await page.$$eval('.pane .card', (c) => c.length) === 13, `promo: the motion is a deck of three cards, thirteen headline styles in the first (${await deckIds(page)})`);
  await openFold(page, 'cuts'); await idle();
  check(await page.$$eval('.pane .card', (c) => c.length) === 24, 'promo: twenty-four cuts in the second');
  check(await page.$$eval('.pane .card .chip', (c) => c.filter((x) => x.textContent === 'shader').length) === 8, 'promo: eight of the cuts are drawn by a shader, and say so');
  await page.click('.seg.filters button:has-text("Depth")'); await idle();
  check(await page.$$eval('.pane .card', (c) => c.length) === 6, 'promo: the cuts filter by family (six that work in depth)');
  await page.click('.seg.filters button:has-text("All")'); await idle();
  await openFold(page, 'headlines'); await page.click('.card:has(.lbl:text-is("Cascade"))'); await page.click('.seg button:has-text("Highlight")');
  await openFold(page, 'cuts'); await idle();
  // a shader cut, with a headline style already chosen: the viewer goes to the cut and stays on it.
  // The pointer is moved off the card first: left there, its hover would hide a viewer gone back to the headline
  await page.click('.card:has(.lbl:text-is("Cube"))'); await page.mouse.move(700, 40); await idle(); await page.waitForTimeout(900);
  check(await page.$$eval('#marks i', (m) => m.length) === 2 && !(await page.$('#viewer.error')), 'promo: a click on a cut plays the cut, its two seams marked on the scrubber');
  check(/ \/ 4\.4 s$/.test(await page.textContent('#time')), `promo: at the measured pace the cut's preview runs 4.4 s (${await page.textContent('#time')})`);
  // a card opened is a thing touched: the viewer goes to the headline with the headlines, and back to the cut with the cuts
  await openFold(page, 'headlines'); await page.mouse.move(700, 40); await idle(); await page.waitForTimeout(900);
  const onText = await page.textContent('#time');
  await openFold(page, 'cuts'); await page.mouse.move(700, 40); await idle(); await page.waitForTimeout(900);
  check(/ \/ 4\.6 s$/.test(onText) && / \/ 4\.4 s$/.test(await page.textContent('#time')), `promo: the viewer follows the card opened, the headline or the cut (${onText} → ${await page.textContent('#time')})`);
  await page.click('.card:has(.lbl:text-is("Window"))'); await openFold(page, 'pace'); await page.click('.seg button:has-text("Brisk")'); await page.mouse.move(700, 40); await idle(); await page.waitForTimeout(900);
  check(/ \/ 4\.0 s$/.test(await page.textContent('#time')), `promo: a brisk pace shortens the cut as well (${await page.textContent('#time')})`);
  await page.click('.seg button:has-text("Cinema")'); await page.waitForTimeout(800);
  check(await page.getAttribute('#blur', 'aria-pressed') === 'true', 'promo: picking a shutter turns the viewer\'s motion blur on');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  check(wide <= 1480, `promo: nothing widens the page past the window (${wide} px)`);
  const motion = [await foldSum(page, 'headlines'), await foldSum(page, 'cuts'), await foldSum(page, 'pace')].join(' | ');
  check(motion === 'Cascade · highlight on one word | Window · depth | Brisk · cinema motion blur (180°)', `promo: the motion's cards say the style and its emphasis, the cut, the pace and the shutter (${motion})`);
  await shot('6');
  // a row that sticks, a long panel scrolled under it: another card opens at the start of its panel, not where the last was scrolled to
  await openFold(page, 'cuts'); await page.$eval('#pane', (p) => { p.scrollTop = p.scrollHeight; }); await page.waitForTimeout(100);
  await page.click('.dcard[data-fold="headlines"]'); await idle();
  const fromTop = await page.evaluate(() => { const c = document.querySelector('.dcard.open'), p = document.querySelector('.dpanel'), d = p.parentElement; return d.classList.contains('stick') && d.getBoundingClientRect().top + p.offsetTop - d.offsetTop >= c.getBoundingClientRect().bottom - 1; });
  check(fromTop, 'promo: in a row of cards that sticks, a card opened shows its panel from the start, its first choices in sight');
  await openFold(page, 'cuts'); await idle(); await paneTop(page); await shot('6-cuts');
  // the cuts' title and family filter stay under the row as well, and the headlines' emphasis: it sat under thirteen
  // tiles, out of sight until the panel was scrolled to its end
  await scrollPane(page, 520); const cutStack = await stack(page); await shot('6-cuts-scrolled');
  await openFold(page, 'headlines'); await idle();
  const emphSeen = [];
  for (const y of [0, 400, 5000]) {
    await scrollPane(page, y);
    emphSeen.push(await page.evaluate(() => { const p = document.querySelector('#pane').getBoundingClientRect(), card = document.querySelector('.dcard.open').getBoundingClientRect(), b = [...document.querySelectorAll('.dpanel .seg button')].find((x) => x.textContent === 'Highlight'), r = b?.getBoundingClientRect(); return !!r && r.top >= card.bottom - 1 && r.bottom <= p.bottom && r.top - card.bottom < 60 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button') === b; }));
  }
  await shot('6-headlines-scrolled');
  check(cutStack.title && cutStack.filter && !cutStack.inGap && emphSeen.every(Boolean), `promo: the cuts' title and filter stay under the row too, and the headlines' emphasis is in sight at the top, in the middle and at the end of its list (${JSON.stringify(cutStack)}; ${emphSeen})`);
  await openFold(page, 'cuts'); await idle(); await paneTop(page);
  await page.click('#next'); await idle();
  // the music: what the Studio does not make, said first; a file of mine, measured; the library
  check(await page.textContent('#title') === 'Which music?' && /not made here/.test(await page.textContent('#lede')), 'promo: the music has a step of its own, which says first that the Studio does not make it');
  await page.click('.seg button:has-text("A file of mine")');
  await page.fill('input[placeholder="~/Music/track.mp3"]', TRACK);
  await page.waitForFunction(() => /BPM|No |Not /.test(document.querySelector('.desc.beat')?.textContent || ''), null, { timeout: 20000 });
  const beatLine = await page.textContent('.desc.beat');
  check(/^123(\.0\d)? BPM, steady · first bar at 0\.(39|40|41) s · sections at 0:16\.0$/.test(beatLine), `promo: the track's beat, measured under its field (${beatLine})`);
  await page.$eval('.desc.beat', (e) => e.scrollIntoView({ block: 'center' })); await shot('7a');
  await page.click('.seg button:has-text("Your music library")');
  await page.waitForFunction(() => { const m = [...document.querySelectorAll('.tracks .track .tm')]; return m.length === 2 && m.every((e) => /BPM/.test(e.textContent)); }, null, { timeout: 30000 }); // measured one at a time
  const tracks = await page.$$eval('.tracks .track', (t) => t.map((x) => `${x.querySelector('.tn').textContent}|${x.querySelector('.tm').textContent}|${x.querySelector('.ta')?.textContent || ''}`));
  check(tracks.length === 2 && /^GrooveAcme\|0:\d\d · 123(\.\d+)? BPM\|A synthetic groove, 123 BPM\.$/.test(tracks[0]) && /^Loose groove\|0:\d\d · 123(\.\d+)? BPM\|$/.test(tracks[1]), `promo: the music library's tracks, a brand's folder first and one at its top, measured, with their notes, and never a folder named in musicLibraryIgnore (${tracks.join('; ')})`);
  await page.click('.tracks .track .pick'); await page.waitForTimeout(300);
  check(await page.getAttribute('.tracks .track .pick', 'aria-pressed') === 'true', 'promo: a track of the library is chosen with a click');
  await shot('7');
  await page.click('#next'); await idle();
  // the voice, a step of its own. Beside the line to hear, the ▶ of the voice chosen; under them five cards, the same
  // five whoever speaks: a preset, who speaks, how it reads, the lines and subtitles, the music under them
  const FIVE = 'preset who reading lines mix', cards8 = async () => (await deckIds(page)).replace('*', '');
  check(await page.textContent('#title') === 'Which voice?' && (await page.textContent('#lede')).startsWith(`Made on this ${MACHINE}`) && await deckIds(page) === 'preset* who reading lines mix' && await page.locator('.presets .vcard').count() === 6,
    `promo: the voice has a step of its own: five cards, the presets' open on arrival, in reach before any voice (${await deckIds(page)})`);
  const quiet = [await foldSum(page, 'who'), await foldSum(page, 'reading'), await foldSum(page, 'lines'), await foldSum(page, 'mix')];
  check(quiet.every((x) => /^No voice · /.test(x)) && await page.locator('.dcard.na').count() === 5, `promo: without a voice the cards keep their place and say there is nothing to set (${quiet.join(' | ')})`);
  await openFold(page, 'lines');
  check(/^No voice/.test(await page.textContent('.dpanel .note')) && await page.locator('.dpanel textarea').count() === 0, 'promo: and one of them opened says so, with the way to a voice');
  await page.click('.dpanel .note button'); await page.waitForSelector('.dcard[data-fold="who"].open');
  const counts = [await cards8()];
  await page.click('.seg button:has-text("My own recordings")'); await idle(); counts.push(await cards8());
  const mine = [await foldSum(page, 'who'), await foldSum(page, 'reading'), await foldSum(page, 'lines')].join(' | ');
  await page.click('.seg button:has-text("A voice model")'); await idle(); counts.push(await cards8());
  check(counts.every((c) => c === FIVE) && /^My own recordings · .+ \| As recorded · .+ \| Claude writes them · subtitles in the film and as a file$/.test(mine), `promo: no voice, my own recordings, a voice model: the same five cards, none comes or goes (${counts.join(' / ')}; ${mine})`);
  check(/^Leah/.test(await page.textContent('.models .vcard.sel .vn')) && await presetNow(page) === 'Promo' && await foldSum(page, 'who') === 'Leah · a voice model, Orpheus', `promo: a promo's model voice is Leah unless another is picked, the Promo preset as it stands (${await foldSum(page, 'who')}, ${await presetNow(page)})`);
  // hearing and setting together: the ▶ of the voice chosen and the line it says stay in sight above whichever card is
  // open, so a voice, a preset or a reading changed in a card is heard without leaving it
  const hearing = [];
  for (const [id, has] of [['preset', '.presets .vcard'], ['who', '.models .vcard'], ['reading', '.field:has(.flabel:text-is("Tone")) .seg'], ['lines', 'textarea'], ['mix', '.field:has(.flabel:text-is("The music under the voice")) .seg']]) {
    await openFold(page, id);
    const strip = await page.evaluate(() => {
      const a = document.querySelector('.audition'), p = document.querySelector('#pane').getBoundingClientRect(), r = a?.getBoundingClientRect();
      return !!r && r.top >= p.top - 1 && r.bottom < p.bottom && !!a.querySelector('button.play') && !!a.querySelector('input[aria-label="The line to hear"]') && !!a.querySelector('#sample-note') && /Leah/.test(a.querySelector('.au-who').textContent);
    });
    hearing.push(strip && await page.locator(`.dpanel ${has}`).count() > 0 ? '' : id); // the strip, and the card's own controls under it
  }
  check(hearing.every((x) => !x), `promo: the line to hear and the ▶ of the voice chosen are beside each other, in sight with every card open: a reading is set and heard in one place (${hearing.filter(Boolean).join(', ') || 'all five'})`);
  const kitHere = await page.evaluate(async () => { const k = await (await fetch('/api/voice-models', { headers: { 'x-studio-key': new URLSearchParams(location.search).get('k') } })).json(); return { python: !!k.python, orpheus: !!(k.python && k.models?.orpheus) }; });
  check(await page.$eval('.audition button.play', (b) => !b.disabled) === kitHere.orpheus && await page.locator('.audition .warn').count() === (kitHere.python ? 0 : 1), `promo: that ▶ plays where this Mac has the model, and where the voice models are not set up the strip says so (${JSON.stringify(kitHere)})`);
  // a track is chosen (the library's): the strip says the ▶ plays the line over it, at the level set in With the
  // music, and offers the voice alone. The ▶ used to say the line alone whatever music was chosen
  const bed = () => page.textContent('.audition .au-bed').catch(() => '');
  const bed0 = await bed(), key0 = await page.getAttribute('.audition button.play', 'data-play').catch(() => '');
  await page.click('.audition .au-bed button', { timeout: 3000 }).catch(() => {});
  const bed1 = await bed(), key1 = await page.getAttribute('.audition button.play', 'data-play').catch(() => '');
  await page.click('.audition .au-bed button', { timeout: 3000 }).catch(() => {});
  check(/^Heard over Groove, 14 LU under the voice, 6 dB up between lines: the film’s own mix\. Hear the voice alone$/.test(bed0) && /^Heard alone, without Groove\. Hear it over the music$/.test(bed1) && (!kitHere.orpheus || (/\+track=[0-9a-f]+:14:6$/.test(key0 || '') && !/\+track/.test(key1 || ''))) && await bed() === bed0,
    `promo: with a track chosen, the strip's ▶ plays the line over it, as the film mixes them, or the voice alone when asked (${bed0} | ${bed1})`);
  // the mix itself, made by mix.mjs through /api/voice-mix: here a macOS voice's greeting over the library's track
  // (no model needed): stereo, 48 kHz, 2.4 s longer than the voice, the music still there after the line; made once
  const mix = await page.evaluate(async () => {
    const k = new URLSearchParams(location.search).get('k'), hd = { 'x-studio-key': k }, get = async (u) => (await fetch(u, { headers: hd })).json();
    const v = (await get('/api/voices')).voices[0], tr = (await get('/api/tracks?product=')).tracks[0];
    if (!v || !tr) return { none: true };
    const q = `voice=${encodeURIComponent(v.name)}&rate=175&track=${tr.id}`, r = await fetch(`/api/voice-mix?${q}&under=14&lift=6`, { headers: hd }), j = await r.json().catch(() => ({}));
    if (!r.ok) return { status: r.status, said: j.message || j.error };
    const wav = await (await fetch(`/api/sample/${j.id}.wav?k=${k}`)).arrayBuffer(), D = new DataView(wav), alone = await (await fetch(`/api/voice?k=${k}&${q}`)).arrayBuffer();
    const secs = (wav.byteLength - 44) / D.getUint32(28, true), voice = (alone.byteLength - 44) / new DataView(alone).getUint32(28, true), s = new Int16Array(wav.slice(44));
    let tail = 0; for (let i = Math.floor((secs - 2) * 48000) * 2; i < Math.floor((secs - 1.3) * 48000) * 2; i++) tail = Math.max(tail, Math.abs(s[i])); // the music alone, before it fades
    return { status: r.status, ch: D.getUint16(22, true), hz: D.getUint32(24, true), longer: +(secs - voice).toFixed(2), tail, again: (await get(`/api/voice-mix?${q}&under=14&lift=6`)).id === j.id, other: (await get(`/api/voice-mix?${q}&under=18&lift=0`)).id !== j.id,
      bad: (await fetch(`/api/voice-mix?${q}&under=3&lift=6`, { headers: hd })).status, gone: (await fetch(`/api/voice-mix?${q.replace(tr.id, 'nope')}&under=14&lift=6`, { headers: hd })).status };
  });
  check(mix.none || (mix.status === 200 && mix.ch === 2 && mix.hz === 48000 && Math.abs(mix.longer - 2.4) < 0.2 && mix.tail > 150 && mix.again && mix.other && mix.bad === 400 && mix.gone === 404),
    `voice mix: a voice over the track chosen, mixed by mix.mjs: stereo, 48 kHz, 2.4 s of the music after the line, made once a setting; a level the schema does not offer and a track not there are refused (${JSON.stringify(mix)})`);
  await openFold(page, 'who'); await paneTop(page); await shot('8a'); // a model's voice: the line and its ▶, the five cards, the voices
  await openFold(page, 'preset'); await page.click('.presets .vcard:has(.vn:text-is("Launch")) .pick'); await idle();
  if (kitHere.orpheus) { // Launch's sample asked for, then another preset: it is given up, and no ▶ (Launch's own, in its card) waits for it
    let held = null; await page.route('**/api/voice-sample*', (r) => { held = r; }); // held, never answered: nothing is said for real
    await page.click('.audition button.play'); await page.waitForSelector('.audition button.play.wait');
    await page.click('.presets .vcard:has(.vn:text-is("Promo")) .pick'); await idle();
    check(!!held && await page.locator('[data-play].wait, [data-play].on').count() === 0 && await page.textContent('#sample-note') === '', 'promo: another preset chosen gives up the sample of the one before: no ▶ waits for it, and the strip no longer says it is being made');
    await held?.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Held by the test.' }) }); await page.unroute('**/api/voice-sample*'); await page.waitForTimeout(300);
    check(!!held && await page.textContent('#sample-note') === '', `promo: and the sample given up, failing later, says nothing of itself (${await page.textContent('#sample-note')})`);
    await page.click('.presets .vcard:has(.vn:text-is("Launch")) .pick'); await idle();
  }
  await openFold(page, 'reading');
  const tone = () => page.getAttribute('.field:has(.flabel:text-is("Tone")) .seg button:has-text("Bright")', 'aria-pressed');
  check(await presetNow(page) === 'Launch' && await tone() === 'true' && await foldSum(page, 'reading') === 'Bright · normal speed, natural' && await page.textContent('#steps li.on .v') === 'Launch', `promo: a preset sets the voice and its reading at once, each card says its part, and the step is named after it (${await presetNow(page)}: ${await foldSum(page, 'reading')})`);
  await page.click('.field:has(.flabel:text-is("Tone")) .seg button:has-text("Bright")'); await page.click('.field:has(.flabel:text-is("Human touch")) .seg button:has-text("Expressive")');
  check(/Bright · Normal · Expressive$/.test(await page.textContent('.audition .au-who')), `promo: what the ▶ beside the line says follows the reading (${await page.textContent('.audition .au-who')})`);
  await openFold(page, 'lines'); await page.fill('textarea[placeholder^="the lines"]', 'Meet Acme.\nShip it today.');
  check(/^Your lines · /.test(await foldSum(page, 'lines')) && await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'), `promo: the lines' card follows the lines as they are typed (${await foldSum(page, 'lines')})`);
  await page.click('.seg button:has-text("In the film only")');
  await openFold(page, 'mix'); await page.click('.field:has(.flabel:text-is("The music under the voice")) .seg button:has-text("Present")');
  await page.mouse.move(700, 40); await idle(); await page.waitForTimeout(800);
  check(await page.evaluate(() => { const c = document.querySelector('#screen'), g = c.getContext('2d'); return !!c && !!g; }) && /Told by Leah/.test(await page.textContent('#about h3')), 'promo: the note beside the viewer says who tells it');
  // the step at a glance: five cards, one open, each saying what is chosen in it
  const said8 = [await deckIds(page), await foldSum(page, 'preset'), await foldSum(page, 'who'), await foldSum(page, 'reading'), await foldSum(page, 'lines'), await foldSum(page, 'mix')];
  check(said8[0] === 'preset who reading lines mix*' && /^Custom · /.test(said8[1]) && said8[2] === 'Leah · a voice model, Orpheus' && said8[3] === 'Bright · normal speed, expressive' && said8[4] === 'Your lines · subtitles in the film only' && said8[5] === 'Present · 10 LU under the voice, 6 dB up between lines',
    `promo: the voice's five cards, one open, each saying what is chosen in it (${said8.join(' | ')})`);
  await page.click('.dcard[data-fold="mix"]'); await idle();
  const glance = await page.evaluate(() => { const p = document.querySelector('#pane'); return !document.querySelector('.dcard.open, .dpanel') && p.scrollHeight <= p.clientHeight; });
  check(glance, 'promo: and a click on the open one closes it: the step at a glance, with nothing to scroll');
  check(await presetNow(page) === 'Custom' && /^Leah/.test(await page.textContent('#steps li.on .v')), 'promo: a setting changed by hand leaves the preset, and the step says the voice');
  await shot('8'); // all closed: the overview
  await page.click('#next'); await idle();
  await openFold(page, 'film'); check(await page.locator('.seg button:has-text("From the voice")').count() === 1, 'promo: a film that speaks may last as long as its voice');
  await openFold(page, 'picture'); await page.click('.seg button:has-text("9:16")'); await idle(); await page.waitForTimeout(1500); await shot('9');
  await page.focus('.dcard[data-fold="direction"]'); await page.keyboard.press('Space'); await idle();
  check(await page.evaluate(() => document.activeElement?.matches('.dcard[data-fold="direction"].open')),
    'promo: Space on a closed card opens it and the focus stays on the card, where the next key belongs');
  await openFold(page, 'picture');
  const under = await page.evaluate(() => { const p = document.querySelector('.deck .dpanel'), c = document.querySelector('.dcard.open'), row = [...document.querySelectorAll('.dcard')].filter((x) => Math.abs(x.offsetTop - c.offsetTop) < 2); return !!p && p.previousElementSibling === row[row.length - 1] && p.id === c.getAttribute('aria-controls'); });
  check(under && await page.locator('.dcard').count() === 4, 'promo: the output is a deck of four cards, the open one\'s panel right under its row');
  check(/^16:9 \+ 1:1 \+ 9:16 · 1080p · 60 fps · /.test(await foldSum(page, 'picture')), `promo: the output's picture card says its aspects, size, rate and files (${await foldSum(page, 'picture')})`);
  const [w, h] = await page.evaluate(() => { const c = document.querySelector('#screen'); return [c.width, c.height]; });
  check(h > w, `promo: the clicked aspect is the one previewed (${w}x${h} on screen)`);
  await page.click('#next'); await idle(); await page.waitForTimeout(800); await shot('10'); // after the step's arrival
  // back to the start and forth again: the steps made stay made, and the recipe already chosen, clicked
  // again, starts nothing over (it used to: a length, the formats, the motion and the sound were gone)
  const rows = () => page.$$eval('.summary .r', (r) => r.map((x) => `${x.querySelector('.k').textContent}=${x.querySelector('.v').textContent}`).join('|'));
  const before = await rows();
  await page.click('#steps li[data-step=film] button'); await idle();
  check(await page.$$eval('#steps li', (l) => l.map((x) => (x.classList.contains('on') ? 'on' : x.classList.contains('done') ? 'done' : 'todo')).join(' ')) === 'on done done done done done done done done todo', 'promo: back at the first step, the steps made still read as made');
  await page.click('.card:has-text("Promo loop")'); await idle();
  await page.click('#steps li[data-step=review] button'); await idle(); await page.waitForTimeout(400);
  check(await rows() === before, 'promo: the chosen recipe clicked again changes nothing');
  await page.click('#steps li[data-step=film] button'); await idle();
  await page.click('.card:has-text("Film in chapters")'); await idle();
  await page.click('#steps li[data-step=review] button'); await idle(); await page.waitForTimeout(400);
  const other = await rows();
  check(/Film=Film in chapters/.test(other) && /Length=1 min/.test(other) && /Headlines=Cascade, highlight/.test(other) && /Cuts=Window/.test(other) && /Pace=Brisk/.test(other) && /Music=Groove/.test(other) && /Voice=Leah/.test(other), `promo: another recipe takes its own kind and length, and keeps what was set by hand (${other.slice(0, 60)}…)`);
  await page.click('#steps li[data-step=film] button'); await idle();
  await page.click('.card:has-text("Promo loop")'); await idle();
  await page.click('#steps li[data-step=review] button'); await idle(); await page.waitForTimeout(400);
  const sound = await page.textContent('.summary .r:has(.k:text-is("Music")) .v'), voice = await page.textContent('.summary .r:has(.k:text-is("Voice")) .v');
  check(/^Groove \(Acme\) — 123(\.\d+)? BPM$/.test(sound), `promo: the review gives the track, its brand and its tempo (${sound})`);
  check(voice === 'Leah (Orpheus)' && await page.textContent('.summary .r:has(.k:text-is("Reading")) .v') === 'bright, normal, expressive' && /told by Leah \(bright, expressive\), subtitles in the film, music: Groove\.$/.test(await page.textContent('#request')), `promo: and the voice, as the request line does (${voice})`);
  // Edit on a row: the step it is set in, the card it is in open and in sight, with the top of its panel
  const landed = [];
  for (const [row, title, card, has] of [['Mix', 'Which voice?', 'mix', '.field:has(.flabel:text-is("Between lines"))'], ['Reading', 'Which voice?', 'reading', '.field:has(.flabel:text-is("Tone"))'], ['Voice', 'Which voice?', 'who', '.models'],
    ['Cuts', 'Which motion?', 'cuts', '.grid .card'], ['Pace', 'Which motion?', 'pace', '.field:has(.flabel:text-is("Motion blur"))'], ['Type', 'Which type?', 'sets', '.specimen'], ['Backdrop', 'Which look?', 'mine', '.picopts'], ['Colour', 'Which product?', 'colour', '.color']]) {
    await page.click(`.summary .r:has(.k:text-is("${row}")) .e`); await idle();
    if (!(await page.textContent('#title') === title && await inSight(page, card) && !!(await page.$(`.dpanel ${has}`)))) landed.push(row);
    await page.click('#steps li[data-step=review] button'); await page.waitForSelector('.summary .r');
  }
  check(landed.length === 0, `review: Edit on a row opens the card it is set in and brings it into sight, in every step that has cards (${landed.join(', ') || 'the voice, the motion, the type, the look, the product'})`);
  // the device has a row of its own, and its Edit opens the Device card whichever was left open in the format step;
  // the formats' opens theirs
  const devRow = await page.textContent('.summary .r:has(.k:text-is("Device")) .v').catch(() => '');
  await page.click('#steps li[data-step=format] button'); await idle(); await openFold(page, 'formats');
  await page.click('#steps li[data-step=review] button'); await page.waitForSelector('.summary .r');
  await page.click('.summary .r:has(.k:text-is("Device")) .e', { timeout: 3000 }).catch(() => {}); await idle(); await page.waitForTimeout(600); // the step has arrived: its tiles are made already, and nothing else waits for its way in
  const devEdit = `${await page.textContent('#title')}, ${await inSight(page, 'device') ? 'in sight' : 'out of sight'}, ${await page.locator('.dpanel .grid .card').count()} tiles, ${await page.textContent('.dpanel .grid .card[aria-pressed="true"] .lbl', { timeout: 2000 }).catch(() => 'none')} marked`;
  await page.click('#steps li[data-step=review] button'); await page.waitForSelector('.summary .r');
  await page.click('.summary .r:has(.k:text-is("Formats")) .e'); await idle(); await page.waitForTimeout(600);
  const fmtEdit = await page.textContent('#title') === 'Which format?' && await inSight(page, 'formats') && await page.locator('.dpanel .slots .slot').count() === 3;
  check(devRow === 'MacBook' && devEdit === `Which format?, in sight, ${SCHEMA.frames.length} tiles, MacBook marked` && fmtEdit, `review: the device has its row, whose Edit opens the Device card in sight, the frame chosen marked in it, though the formats' was the one left open; and the formats' row opens theirs (${devRow}; ${devEdit}; ${fmtEdit})`);
  await page.click('#steps li[data-step=review] button'); await idle();
  await page.click('#next');
});
check(promo.kind === 'promo' && promo.duration === 15, 'promo: kind and duration in the brief');
check(JSON.stringify(promo.formats) === '["bento","terminal"]', 'promo: formats in the order picked');
check(promo.frame === 'macbook', `promo: the device chosen is the brief's frame (${promo.frame})`);
check(JSON.stringify(promo.aspects) === '["16:9","1:1","9:16"]', 'promo: aspects in the schema order');
check(/^[a-z0-9.-]+-promo$/.test(promo.name || '') && promo.work?.endsWith(`${promo.name}-work`), 'promo: name and work folder');
check(promo.look === 'photo' && promo.backdrop?.treatment === 'duotone' && existsSync(promo.backdrop?.file || '/nope'), 'promo: the picture, duotone, copied into src/backdrops');
check(promo.type?.set === 'fraunces' && promo.type?.display?.family === 'Fraunces' && existsSync(join(promo.work || '/nope', 'src', 'fonts', 'fraunces', 'OFL.txt')), 'promo: Fraunces, its faces and licence in src/fonts');
check(promo.music === 'track' && promo.musicFile === join(promo.work || '/nope', 'src', 'audio', 'acme-music-groove.wav') && existsSync(promo.musicFile) && promo.musicSource?.brand === 'Acme' && promo.musicSource?.path === join(BRAND, 'Acme', 'audio', 'acme-music-groove.wav') && /synthetic groove/.test(promo.musicSource?.about || ''), `promo: the library's track, copied into src/audio, where it came from beside it (${promo.musicFile})`);
check(promo.deliver === join(TMP, 'out', promo.name), `promo: the brief's delivery folder is the one the Review showed, in the work root here (${promo.deliver})`);
check(Math.abs((promo.musicBeats?.bpm ?? 0) - 123) <= 0.1 && Math.abs((promo.musicBeats?.at ?? 0) - 0.4) <= 0.03 && promo.musicBeats?.steady === true, `promo: and its beat, measured on the copy (${JSON.stringify(promo.musicBeats)})`);
const V = promo.voice || {};
check(V.kind === 'model' && V.model === 'orpheus' && V.speaker === 'leah' && V.tone === 'bright' && V.tempo === 1 && V.human === 'expressive' && V.lang === 'en-US' && V.script === 'Meet Acme.\nShip it today.' && V.captions === 'burned' && V.name === null && V.rate === null, `promo: the voice-over in the brief (${JSON.stringify(V)})`);
check(promo.musicMix?.under === 10 && promo.musicMix?.lift === 6 && promo.musicPrompt === null && promo.tutorial === undefined, `promo: the music under the voice, as chosen (${JSON.stringify(promo.musicMix)})`);
check(promo.motion?.text === 'cascade' && promo.motion?.emphasis === 'highlight' && promo.motion?.transition === 'window' && promo.motion?.pace === 'brisk' && promo.motion?.shutter === 180, 'promo: the motion, as picked');

// ---------------------------------------------------------------- a release
const rel = await wizard('release', async ({ page, idle }) => {
  await page.click('.card:has-text("Release film")'); await idle();
  await page.click('#next'); await pickProduct(page);
  await openFold(page, 'version'); await page.fill('input[placeholder="v2.4.0"]', 'v9.8.7');
  check(await deckIds(page) === 'repo site version* colour name' && /^v9\.8\.7 · /.test(await foldSum(page, 'version')) && /-9\.8\.7-whats-new$/.test(await page.textContent('.dcard[data-fold="name"] .dfig')), `release: the version has a card of its own, which follows the tag as it is typed, and the name's with it (${await foldSum(page, 'version')} | ${await page.textContent('.dcard[data-fold="name"] .dfig')})`);
  await page.click('#next'); await idle();
  check(JSON.stringify(await page.$$eval('.pane .card .lbl', (c) => c.map((x) => x.textContent))) === '["What\'s new"]', 'release: one format');
  // its one format is not a choice: the formats' card keeps its place and says so, and the device is still chosen
  check(await deckIds(page) === 'formats* device' && await foldSum(page, 'formats') === 'What\'s new · the one format of a release film' && await page.locator('.dcard[data-fold="formats"].na').count() === 1 && await page.locator('.dcard[data-fold="device"].na').count() === 0 && await page.locator('.slot').count() === 0,
    `release: the same two cards, the formats' in its place and saying it holds no choice, the device's open to one (${await deckIds(page)}: ${await foldSum(page, 'formats')})`);
  await openFold(page, 'device'); await page.click('.dpanel .card:has(.lbl:text-is("iPad"))'); await page.mouse.move(700, 40); await idle();
  check(await foldSum(page, 'device') === 'iPad · the product’s own layout on it, tapped' && (await page.textContent('#steps li[data-step=format] .v')).trim() === 'What\'s new · iPad', `release: a release film chooses its device too (${await foldSum(page, 'device')})`);
  for (let i = 0; i < 8; i++) { await page.click('#next'); await idle(); } // look, type, motion, music, voice, output, review, create
});
check(rel.kind === 'release' && rel.release?.tag === 'v9.8.7' && rel.duration === 0, 'release: kind, tag, length from the changes');
check(rel.frame === 'ipad' && JSON.stringify(rel.formats) === '["whatsnew"]', `release: its device in the brief, beside its one format (${rel.frame})`);
check(/-9\.8\.7-whats-new$/.test(rel.name || ''), `release: named <product>-<version>-whats-new (${rel.name})`);
check(rel.motion?.transition === 'window' && rel.motion?.shutter === 360 && rel.type === null && rel.backdrop === null, 'release: the recipe\'s cut, the brand\'s own type, no picture');

// ---------------------------------------------------------------- a website, with the keyboard
const web = await wizard('website', async ({ page, idle, shot }) => {
  await page.click('.card:has-text("Promo loop")'); await idle();
  await page.click('#next');
  // what counts as an address: single-character labels and an IP with a port pass, a bare word is still being typed
  const note = () => page.textContent('input[type=url] + .desc');
  await openFold(page, 'site');
  await page.fill('input[type=url]', 'acme'); await page.waitForTimeout(900);
  check(/^An address/.test(await note()), `website: a bare word is not taken as an address (${await note()})`);
  await openFold(page, 'colour'); await openFold(page, 'site');
  check(await page.inputValue('input[type=url]') === 'acme' && /^An address/.test(await note()), `website: an address still being typed stays in its field, with its hint, when another card opens and this one again (${await page.inputValue('input[type=url]')}: ${await note()})`);
  await page.fill('input[type=url]', 'acme.'); await openFold(page, 'colour'); await openFold(page, 'site'); // before the field is judged
  check(await page.inputValue('input[type=url]') === 'acme.', `website: and so does what was typed just before, not yet judged (${await page.inputValue('input[type=url]')})`);
  await page.waitForTimeout(900);
  for (const [typed, want] of [['www.x.com', 'https://www.x.com'], ['127.0.0.1:3000', 'https://127.0.0.1:3000'], ['foo.i.ua', 'https://foo.i.ua']]) {
    await page.fill('input[type=url]', typed); await page.waitForTimeout(900);
    check((await note()).includes(want), `website: ${typed} is an address (${await note()})`);
  }
  await page.fill('input[type=url]', '');
  await page.click('input[type=url]');
  await page.keyboard.type('https://example.app', { delay: 15 }); await page.waitForTimeout(900); // the step redraws once the address is one
  check(await page.evaluate(() => document.activeElement?.type) === 'url', 'website: the field keeps the focus when the step redraws');
  await page.keyboard.type('/pricing', { delay: 15 }); await page.waitForTimeout(900);
  check(await page.inputValue('input[type=url]') === 'https://example.app/pricing', `website: and what is typed next lands in it (${await page.inputValue('input[type=url]')})`);
  check(await foldSum(page, 'site') === 'example.app · https://example.app/pricing' && /^Not used/.test(await foldSum(page, 'repo')), `website: the website's card says the address, the repository's that it is not used (${await foldSum(page, 'site')})`);
  await openFold(page, 'colour');
  await page.click('.check input'); // a website has no source to read a colour from here: unticked, one is chosen
  await page.fill('.color input[type=text]', '#E8833A'); await page.keyboard.press('Tab'); await page.waitForTimeout(900);
  check(await foldSum(page, 'colour') === '#E8833A · chosen in the Studio' && await page.$eval('.dcard[data-fold="colour"] .dswatch', (i) => i.style.background) === 'rgb(232, 131, 58)', `website: the colour's card says the colour chosen, and shows it (${await foldSum(page, 'colour')})`);
  // the window keeps its violet (the dark-only Studio's, light enough for the navy); the brand's colour
  // is the previews', and the dot beside the product
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  const dot = await page.evaluate(() => document.querySelector('.steps .v .swatch')?.style.background || '');
  check(accent.toUpperCase() === '#B794FF' && dot === 'rgb(232, 131, 58)', `website: the Studio keeps its violet (${accent}), the brand's colour is the swatch beside the product (${dot})`);
  // Space is the focused control's own: on the checkbox it ticks the checkbox, twice here to leave it as it was
  await page.focus('.check input'); await page.keyboard.press('Space');
  const ticked = await page.isChecked('.check input');
  await page.keyboard.press('Space');
  check(ticked && !(await page.isChecked('.check input')) && await page.getAttribute('#play', 'aria-label') === 'Pause the preview', 'website: Space on a checkbox ticks it, and leaves the preview playing');
  await page.click('#next'); await idle();
  await page.focus('.card:has(.lbl:text-is("Bento"))'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  check(await page.evaluate(() => document.activeElement?.querySelector?.('.lbl')?.textContent) === 'Bento' && await page.getAttribute('.card:has(.lbl:text-is("Bento"))', 'aria-pressed') === 'true', 'website: a card chosen with Enter keeps the focus, and says it is pressed');
  check(await page.$$eval('#steps button[aria-current="step"]', (x) => x.length) === 1, 'website: the sidebar names the current step');
  await page.keyboard.press('f'); await page.waitForTimeout(600);
  const wide = await page.$eval('#screen', (c) => c.getBoundingClientRect().width);
  check(wide > 800 && await page.getAttribute('#theatre', 'aria-pressed') === 'true', `website: F gives the preview the room (${Math.round(wide)} px wide)`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check(await page.getAttribute('#theatre', 'aria-pressed') === 'false', 'website: and Esc gives it back');
  await page.click('#next'); await idle(); // the look
  // the palette: each scheme shows the colours it derives from the accent, the card and the panel say what a scheme
  // is and where a film uses its colours, and the preview is drawn in the one under the pointer. It was five bare
  // names, and on a look that takes the accent alone a click seemed to change nothing
  // a note a button leaves beside the viewer keeps its own time: Motion blur pressed just as the pointer left a
  // tile used to cancel the viewer's way back from the tile's look to the step's own preview and note
  await page.hover('.card:has(.lbl:text-is("lava"))'); await page.waitForTimeout(1200);
  const overTile = await page.textContent('#about h3');
  await page.click('#blur'); await page.waitForTimeout(900);
  const backTo = await page.textContent('#about h3');
  await page.click('#blur'); await page.mouse.move(700, 40);
  check(overTile === 'lava' && backTo === 'Looks', `viewer: Motion blur pressed as the pointer leaves a tile still lets the viewer and its note go back to the step's own (${overTile} → ${backTo})`);
  await openFold(page, 'palette'); await page.mouse.move(700, 40); await idle();
  const schemes = await page.$$eval('.scheme', (b) => b.map((x) => ({ k: x.dataset.scheme, sw: [...x.querySelectorAll('.sw i')].map((i) => i.style.background), says: x.querySelector('small')?.textContent || '' })));
  const liveHash = () => page.evaluate(() => { const n = (x) => +(new URL(x.contentWindow.location.href).searchParams.get('n') || 0), f = [...document.querySelectorAll('#liveA, #liveB')].filter((x) => x.contentWindow?.location.pathname.endsWith('/stage.html')).sort((a, b) => n(b) - n(a))[0]; return f ? f.contentWindow.location.hash : ''; });
  await page.click('.scheme[data-scheme="complementary"]', { timeout: 3000 }).catch(() => {}); await page.mouse.move(700, 40); await idle(); await page.waitForTimeout(500);
  const pal = { card: await foldSum(page, 'palette'), hash: await liveHash(), note: await page.textContent('.dpanel .note').catch(() => ''), about: await page.textContent('#about h3') };
  await paneTop(page); await shot('4-palette');
  check(schemes.length === 5 && schemes.every((s) => s.sw.length === 4 && s.sw[0] === 'rgb(232, 131, 58)' && s.says.length > 8) && new Set(schemes.map((s) => s.sw.slice(1).join())).size === 5,
    `palette: each of the five schemes shows the accent and the three colours it derives, and says what it is (${schemes.map((s) => `${s.k}: ${s.says}`).join('; ')})`);
  check(pal.card === 'complementary · its opposite: contrast' && /scheme=complementary/.test(pal.hash) && /ui=window/.test(pal.hash) && pal.about === 'Palette' && /^aura, shown until a look is picked, is painted with them/.test(pal.note),
    `palette: a scheme chosen, its card says what it does, and the preview is the stand-in window drawn in it (${pal.card}; ${pal.hash.slice(0, 80)}…)`);
  // which looks a scheme repaints is the engine's to say (FX.companions, read off each preset), and the panel says it:
  // measured, the backdrop of exactly those looks changes between two schemes, and of no other
  const painted = await page.evaluate(async () => {
    const C = Object.fromEntries(Object.keys(FX.PRESETS).map((k) => [k, FX.companions(k)])), S = (await (await fetch('/api/context', { headers: { 'x-studio-key': new URLSearchParams(location.search).get('k') } })).json()).schema, wrong = [];
    const frame = (look, scheme) => new Promise((ok) => { const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;left:-9999px;width:480px;height:270px;visibility:hidden';
      f.onload = async () => { const w = f.contentWindow; await w.ready; w.seek(3.95); const c = document.createElement('canvas'); c.width = 48; c.height = 27; const g = c.getContext('2d'); g.drawImage(f.contentDocument.querySelector('canvas'), 0, 0, 48, 27); f.remove(); ok(g.getImageData(0, 0, 48, 27).data); };
      f.src = `/studio/stage.html?n=${Math.random()}&gl=0.5#ui=none&look=${look}&tone=${S.looks.find((l) => l.id === look).tone}&accent=E8833A&scheme=${scheme}&w=480&h=270`; document.body.append(f); });
    for (const look of Object.keys(C)) {
      const a = await frame(look, 'analogous'), b = await frame(look, 'complementary');
      let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
      if ((d / a.length > 0.5) !== (C[look].length > 0)) wrong.push(`${look}: ${(d / a.length).toFixed(2)} for [${C[look]}]`);
    }
    return { looks: Object.keys(C).length, painted: Object.values(C).filter((x) => x.length).length, wrong };
  });
  check(painted.looks === 23 && painted.painted > 5 && painted.wrong.length === 0, `palette: the looks said to be painted with a scheme's colours are the ones whose backdrop changes with it, and no other (${painted.painted} of ${painted.looks}${painted.wrong.length ? `; ${painted.wrong.join('; ')}` : ''})`);
  await page.click('#next'); await idle(); await page.click('#next'); await idle(); // the type, the motion
  // every headline style carries every mark: measured on the stage, as the accent's pixels a mark adds once the
  // headline has settled. Swap drew none, a flap board hid the marker behind its tiles and laid the line across
  // them, and track, wipe, split, typed and odometer never turned the word to the accent; track and odometer left
  // the stage before any mark of theirs was due
  const marks = await marksOf(page), least = { highlight: 4000, underline: 500, color: 1500 };
  const dull = Object.entries(marks).flatMap(([style, m]) => Object.entries(least).filter(([mark, n]) => !(m[mark] >= n)).map(([mark]) => `${style} ${mark} ${m[mark]}`));
  check(Object.keys(marks).length === 13 && dull.length === 0, `emphasis: each of the thirteen headline styles draws each of the three marks on the stage (${dull.length ? `not: ${dull.join(', ')}` : `the least: ${Math.min(...Object.values(marks).map((m) => m.underline))} px of underline, ${Math.min(...Object.values(marks).map((m) => m.color))} of colour, ${Math.min(...Object.values(marks).map((m) => m.highlight))} of highlight`})`);
  // a flap board counts its cells in characters: with an emoji before it (two UTF-16 units, one cell) the word's
  // mark still lies under the word's own tiles. Here an underline for "now" in "🚀 Go now": cells 5 to 7
  const flap = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('2d'), size = 60, x0 = 20, pitch = size * (0.66 + 0.07);
    c.width = 900; c.height = 200; g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 200);
    TYPE.draw(g, 30, { lines: ['🚀 Go now'], x: x0, y: 40, align: 'left', size, family: 'system-ui', weight: 700, color: [20, 20, 20], accent: [255, 0, 0], style: 'flap', at: 0, emphasis: { word: 'now', mark: 'underline' } });
    const d = g.getImageData(0, 106, 900, 12).data; // the rows under the tiles, where the line is: the rocket has red of its own
    let from = 1e9, to = -1;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 80 && d[i + 2] < 80) { const x = (i / 4) % 900; from = Math.min(from, x); to = Math.max(to, x); }
    return { from, to, want: [Math.round(x0 + 5 * pitch), Math.round(x0 + 7 * pitch + size * 0.66)] };
  });
  check(Math.abs(flap.from - flap.want[0]) <= 3 && Math.abs(flap.to - flap.want[1]) <= 3, `emphasis: on a flap board the mark is under its word's tiles when an emoji comes before it in the line (${flap.from} to ${flap.to} px, the tiles ${flap.want.join(' to ')})`);
  // Motion blur says whether it is on, and blends what moves: a cut held half way, drawn with it off and on
  await openFold(page, 'cuts'); await page.click('.card:has(.lbl:text-is("Push"))'); await page.mouse.move(700, 40); await idle(); await page.waitForTimeout(900);
  if (await page.getAttribute('#blur', 'aria-pressed') === 'true') await page.click('#blur');
  await page.click('#play');
  const seam = await page.$eval('#marks i', (m) => { const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(seam.x, seam.y); await page.mouse.move(700, 40); await page.waitForTimeout(400);
  const frameNow = () => page.evaluate(() => { const c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d'); g.drawImage(document.querySelector('#screen'), 0, 0, 96, 54); return Array.from(g.getImageData(0, 0, 96, 54).data); });
  const sharp = await frameNow(), offSays = `${await page.textContent('#blur')}|${await page.getAttribute('#blur', 'title')}`;
  await page.click('#blur'); await page.waitForTimeout(500);
  const soft = await frameNow(), onSays = `${await page.textContent('#blur')}|${await page.getAttribute('#blur', 'title')}`, said = await page.textContent('#about h3');
  let blurred = 0; for (let i = 0; i < sharp.length; i++) blurred += Math.abs(sharp[i] - soft[i]);
  await page.click('#blur'); await page.click('#play');
  check(/^Motion blur ?off\|Off: /.test(offSays) && /^Motion blur ?on\|On: /.test(onSays) && said === 'Motion blur' && blurred / sharp.length > 0.04, // held still, the two frames would be the same to the bit
    `motion blur: the button says whether it is on and what it does, the note beside the viewer too, and on a cut held half way the frame is a blend (${offSays.split('|')[0]} → ${onSays.split('|')[0]}; ${(blurred / sharp.length).toFixed(2)} a channel)`);
  for (let i = 0; i < 3; i++) { await page.click('#next'); await idle(); } // the music, the voice, the output
  // a length typed: a promo's in seconds, within its range (out of it, the range is said and the last one stays), a
  // film's in minutes and seconds; the card, the request line and the brief follow. The lengths were a fixed list
  await openFold(page, 'film'); await page.click('.seg button:has-text("Custom")', { timeout: 3000 }).catch(() => {});
  const secs = '.len input[aria-label="Seconds"]', fillLen = (sel, v) => page.fill(sel, v, { timeout: 3000 }).catch(() => {});
  await fillLen(secs, '45');
  const len1 = `${await foldSum(page, 'film')} | ${(await page.textContent('#request')).slice(0, 22)} | ${await page.textContent('#len-note').catch(() => '')}`;
  await fillLen(secs, '95');
  const len2 = `${await foldSum(page, 'film')} | ${await page.textContent('#len-note').catch(() => '')} | ${await page.getAttribute('#len-note', 'class').catch(() => '')}`;
  await fillLen(secs, '45');
  await page.click('.seg button:has-text("Film in chapters")'); await idle();
  await fillLen('.len input[aria-label="Minutes"]', '2'); await fillLen(secs, '30');
  const len3 = `${await foldSum(page, 'film')} | ${(await page.textContent('#request')).slice(0, 20)}`;
  // from 2 min 0 s to 45 s, as a person types it: 0 in the minutes, Tab, 45 in the seconds. The total on the way,
  // 0 s, is out of range: it is said, and the 0 stays while the focus is on the pair. (Leaving the minutes put
  // the 2 back, and the 45 then made 2 min 45 s.) Once the focus leaves the pair, the fields read what was taken
  const mins = '.len input[aria-label="Minutes"]';
  await fillLen(mins, '2'); await fillLen(secs, '0');
  await page.click(mins, { clickCount: 3, timeout: 3000 }).catch(() => {}); await page.keyboard.type('0'); await page.keyboard.press('Tab');
  const onWay = await page.evaluate(() => ({ m: document.querySelector('.len input[aria-label="Minutes"]')?.value, on: document.activeElement?.getAttribute('aria-label'), warn: !!document.querySelector('#len-note')?.classList.contains('warn') }));
  await page.keyboard.type('45');
  const typed45 = await foldSum(page, 'film');
  await page.click('#len-est'); // the focus leaves the pair
  const left = await page.$$eval('.len input', (i) => i.map((x) => x.value).join(':'));
  check(onWay.m === '0' && onWay.on === 'Seconds' && onWay.warn && typed45 === 'Film in chapters · 45 s' && left === '0:45',
    `length: 2 min 0 s becomes 45 s as it is typed, 0 in the minutes then 45 in the seconds: the 0 stays on the way, out of range and said so (${JSON.stringify(onWay)} → ${typed45}, fields ${left})`);
  await fillLen(mins, '2'); await fillLen(secs, '30');
  await page.click('.seg button:has-text("Promo loop")'); await idle();
  const len4 = `${await foldSum(page, 'film')} | ${await page.locator('.len').count()}`;
  await page.click('.seg button:has-text("Custom")', { timeout: 3000 }).catch(() => {}); await fillLen(secs, '45'); await shot('9-length');
  check(len1 === 'Promo loop · 45 s | A 45 s promo loop of E | 45 s, a loop' && /^Promo loop · 45 s \| From 3 s to 1 min: it stays 45 s until then\. \| .*warn/.test(len2) && len3 === 'Film in chapters · 2 min 30 s | A 2 min 30 s film of' && len4 === 'Promo loop · 15 s | 0',
    `length: a promo's typed in seconds, a film's in minutes and seconds; out of range it says so and keeps the last; another kind takes its own again (${len1} / ${len2} / ${len3} / ${len4})`);
  // the reference: what it is, said on the field and on its card, which never reads "Nothing yet"
  const ref0 = `${await page.textContent('.dcard[data-fold="claude"] .dtitle')}: ${await foldSum(page, 'claude')}`;
  await openFold(page, 'claude');
  const refLabels = (await page.$$eval('.dpanel .flabel', (l) => l.map((x) => x.textContent))).join(' | '), refDesc = await page.textContent('.dpanel .field .desc').catch(() => '');
  await page.fill('.dpanel input[type=text]', 'Linear’s launch film'); await shot('9-reference');
  const ref1 = await foldSum(page, 'claude');
  check(ref0 === 'Reference and notes: Claude picks a reference · a real, named one, and says what it takes' && refLabels === 'A reference to take after | Notes for Claude' && /A film, a site or a style/.test(refDesc) && ref1 === 'After “Linear’s launch film” · and says what it takes from it',
    `reference: its card says who picks it while it is empty, the field what a reference is, and the card follows what is typed (${ref0} → ${ref1})`);
  for (let i = 0; i < 2; i++) { await page.click('#next'); await idle(); } // review, create
});
check(web.duration === 45 && web.kind === 'promo' && web.scheme === 'complementary' && web.reference === 'Linear’s launch film', `website: a length typed, the scheme and the reference in the brief (${web.duration} s, ${web.scheme}, ${web.reference})`);
check(rel.voice === null && rel.music === 'none' && rel.musicMix === null, 'release: silent unless a sound is chosen');
check(web.product?.url === 'https://example.app/pricing' && web.product?.name === 'Example' && web.name === 'example-promo', `website: the address, and a name from it (${web.product?.url}, ${web.name})`);
check(web.accent === '#E8833A' && JSON.stringify(web.formats) === '["bento"]', 'website: the colour chosen and the format picked with the keyboard');
check(web.frame === null, `website: no device chosen, the brief leaves the frame to each format (${web.frame})`);

// ---------------------------------------------------------------- a tutorial: a lesson, a voice model or a voice to hear, subtitles
// macOS only: this tutorial is told by a macOS voice, which no other system has (the model's tutorials below run everywhere)
const tut = process.platform !== 'darwin' ? null : await wizard('tutorial', async ({ page, idle, shot }) => {
  await page.click('.card:has(.lbl:text-is("Tutorial"))'); await idle();
  await page.click('#next'); await pickProduct(page);
  await page.click('#next'); await idle(); await page.waitForTimeout(600);
  check(JSON.stringify(await page.$$eval('.pane .card .lbl', (c) => c.map((x) => x.textContent))) === '["Tutorial"]', 'tutorial: one format, shown told');
  await shot('3');
  // a tutorial of an iPhone app belongs in an iPhone: the device is chosen here too, and the stage is told on it
  await openFold(page, 'device'); await page.click('.dpanel .card:has(.lbl:text-is("iPhone"))'); await page.mouse.move(700, 40); await idle(); await page.waitForTimeout(600);
  const toldOn = await page.evaluate(() => { const n = (x) => +(new URL(x.contentWindow.location.href).searchParams.get('n') || 0), f = [...document.querySelectorAll('#liveA, #liveB')].filter((x) => x.contentWindow?.location.pathname.endsWith('/stage.html')).sort((a, b) => n(b) - n(a))[0]; return f ? `${f.contentWindow.PROMO_META.product} ${new URLSearchParams(f.contentWindow.location.hash.slice(1)).get('mode')}` : ''; });
  await paneTop(page); await shot('3-device');
  check(await deckIds(page) === 'formats device*' && await foldSum(page, 'formats') === 'Tutorial · the one format of a tutorial' && toldOn === 'iphone tutorial', `tutorial: its device is chosen in the same card, and the stage is told on it (${await foldSum(page, 'formats')}; ${toldOn})`);
  await page.click('#steps li[data-step=output] button'); await idle();
  await openFold(page, 'lesson'); await page.fill('textarea[placeholder^="the task"]', 'Make the first commit: open, stage, commit.');
  // a track named by its path, its beat still being measured when the voice step is reached: the strip's ▶ plays
  // over it all the same. (It waited for the measure: the strip said no track was chosen, and stayed so.)
  let beatsHeld = null; await page.route('**/api/beats?path=*', (r) => { beatsHeld = r; }); // held: the measure never lands
  await page.click('#steps li[data-step=music] button'); await idle();
  const musicWas = await page.textContent('.pane > .seg button.sel span');
  await page.click('.seg button:has-text("A file of mine")'); await page.fill('input[placeholder="~/Music/track.mp3"]', TRACK); await page.waitForTimeout(700);
  await page.click('#steps li[data-step=voice] button'); await idle();
  const unmeasured = await page.textContent('.audition .au-bed').catch(() => '');
  check(!!beatsHeld && /^Heard over groove\.wav, \d+ LU under the voice/.test(unmeasured), `tutorial: a track named by its path is what the strip's ▶ plays over, measured yet or not (${unmeasured})`);
  await beatsHeld?.continue(); await page.unroute('**/api/beats?path=*');
  await page.click('#steps li[data-step=music] button'); await idle();
  await page.click(`.pane > .seg button:has(span:text-is("${musicWas}"))`); await idle();
  await page.click('#steps li[data-step=voice] button'); await idle();
  // told by a voice model unless another voice is chosen: which voice, its pace, and none of the Mac's voices listed
  const pressed = (text) => page.locator(`.seg button:has-text("${text}")`).first().getAttribute('aria-pressed');
  const inField = (label, text) => page.locator(`.field:has(.flabel:text-is("${label}")) .seg button:has-text("${text}")`).first(); // by its field: a preset's line names readings too
  const lesson = [await presetNow(page), await foldSum(page, 'who'), await foldSum(page, 'reading'), await page.locator('.presets .vcard.sel .vn').textContent()].join(' | ');
  await openFold(page, 'who');
  const model = await pressed('A voice model') === 'true' && /^Chatterbox/.test(await page.textContent('.models .vcard.sel .vn')) && await page.locator('.voices').count() === 0;
  await openFold(page, 'reading');
  check(model && lesson === 'Lesson | Chatterbox · a voice model, Chatterbox | Warm · slow speed, clean read | Lesson' && await inField('Speed', 'Slow').getAttribute('aria-pressed') === 'true' && await inField('Human touch', 'Clean read').getAttribute('aria-pressed') === 'true', `tutorial: told by a voice model by default (Chatterbox, slow, a clean read: the Lesson preset), with no list of this Mac's voices under it (${lesson})`);
  // Kokoro's Sara: a card of the model's own, whose ▶ line is Italian, with no tone to set; then Leah, as the checks below go on
  await openFold(page, 'who'); await page.click('.models .vcard:has(.vn:text("Sara")) .pick'); await idle();
  const sara = [await page.inputValue('.au-box input[type=text]'), await page.textContent('.models .vcard.sel .vm'), await foldSum(page, 'who'), await foldSum(page, 'reading')].join(' | ');
  await openFold(page, 'reading');
  check(/^Ecco .+\. Tutto quello che ti serve/.test(sara) && /Kokoro · it-IT/.test(sara) && /Sara · a voice model, Kokoro/.test(sara) && await page.locator('.field:has(.flabel:text-is("Tone"))').count() === 0 && await inField('Speed', 'Slow').count() === 1, `kokoro: Sara's ▶ says an Italian line, her card names the model and the language, and there is no Tone to set (${sara})`);
  await openFold(page, 'who'); await page.click('.models .vcard:has(.vn:text("Leah")) .pick'); await idle();
  await openFold(page, 'reading'); await inField('Speed', 'Brisk').click(); await idle();
  await openFold(page, 'lines'); // another card open: Review's Edit on Reading opens its own all the same
  await shot('7-model');
  await page.click('#steps li[data-step=review] button'); await idle(); await page.waitForTimeout(600);
  const told = await page.$$eval('.summary .r', (r) => r.map((x) => `${x.querySelector('.k').textContent}=${x.querySelector('.v').textContent}`).join('|'));
  check(/Voice=Leah \(Orpheus\)\|Reading=warm, brisk, clean read/.test(told), `tutorial: the review names the voice, and its reading on a row of its own (${told.match(/Voice=[^|]+\|[^|]+/)?.[0]})`);
  await page.click('.summary .r:has(.k:text-is("Reading")) .e'); await page.waitForSelector('.dpanel .field:has(.flabel:text-is("Tone"))');
  check(await inSight(page, 'reading'), 'review: Edit on the reading opens its card, whichever was left open');
  await page.click('#steps li[data-step=review] button'); await page.waitForSelector('.summary .r');
  await page.click('#steps li[data-step=voice] button'); await idle();
  check(await deckIds(page) === 'preset who reading* lines mix', `tutorial: back in the step, the card left open is the one open (${await deckIds(page)})`);
  // and this Mac's own voices, from here on (by its hint: :has-text ignores case, and the model's hint says "this Mac" too), chosen
  // with the keyboard: the card's panel changes, the cards stay five, and the focus stays on the choice
  await openFold(page, 'who');
  await page.focus('.seg button:has-text("spoken by macOS")'); await page.keyboard.press('Space'); await idle();
  check(/^A macOS voice/.test(await page.evaluate(() => document.activeElement?.textContent || '')) && await deckIds(page) === 'preset who* reading lines mix' && await page.locator('.models').count() === 0, `tutorial: a choice made with the keyboard keeps the focus on itself when its card changes, and the cards are the same five (${await page.evaluate(() => document.activeElement?.textContent)}; ${await deckIds(page)})`);
  await page.waitForSelector('.voices .voice', { timeout: 15000 });
  const heard = await page.evaluate(async () => { // the voice chosen by default, heard: the sample its ▶ plays
    const k = new URLSearchParams(location.search).get('k'), short = document.querySelector('.voices .voice.sel .fn').textContent;
    const list = (await (await fetch('/api/voices', { headers: { 'x-studio-key': k } })).json()).voices, v = list.find((x) => x.short === short && x.lang === document.querySelector('.field select').value);
    const r = await fetch(`/api/voice?k=${k}&voice=${encodeURIComponent(v.name)}&rate=175`), b = await r.arrayBuffer();
    // listed best first, and the note under them says what this Mac lacks in that language (a Premium voice is a download, per Mac)
    const lang = document.querySelector('.field select').value, mine = list.filter((x) => x.lang === lang).sort((a, c) => a.tier - c.tier);
    const want = mine.map((x) => x.short), shown = [...document.querySelectorAll('.voices .voice .fn')].map((e) => e.textContent);
    const tiers = list.every((x) => x.tier === (x.quality === 'Premium' ? 0 : x.quality === 'Enhanced' ? 1 : /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)$/.test(x.short) ? 3 : 2));
    const best = mine[0].tier, more = document.querySelector('.desc.more');
    const again = (await (await fetch('/api/voices?fresh=1', { headers: { 'x-studio-key': k } })).json()).voices;
    Object.assign(window, { __voices: { lang, tiers, order: JSON.stringify(want) === JSON.stringify(shown), first: shown[0] === short, best, lacks: more.classList.contains('lacks'), says: more.textContent, again: again.length === list.length, hz: new DataView(b).getUint32(24, true) } });
    return { n: list.length, novelty: list.filter((x) => /^(Bells|Zarvox|Bad News)$/.test(x.short)).length, status: r.status, type: r.headers.get('content-type'), bytes: b.byteLength, head: new TextDecoder().decode(b.slice(0, 4)), name: v.name };
  });
  check(heard.n > 20 && heard.novelty === 0 && heard.status === 200 && heard.type === 'audio/wav' && heard.head === 'RIFF' && heard.bytes > 20000, `tutorial: this Mac's voices are listed (${heard.n}, no novelty ones) and one is heard (${heard.name}: ${heard.bytes} bytes of WAV)`);
  const vv = await page.evaluate(() => window.__voices);
  check(vv.tiers && vv.order && vv.first && vv.again && vv.hz === 48000, `tutorial: the voices are listed best first, the first is the one chosen, read again they are the same, and one is heard at ${vv.hz} Hz`);
  check(vv.lacks === vv.best > 0 && (vv.best === 0 ? /needs it there too/ : /free download, once on each Mac: System Settings/).test(vv.says) && (vv.best > 0) === /Look again/.test(vv.says), `tutorial: under them, what this Mac lacks in that language and where it is downloaded (${['a Premium voice is here', 'the best is Enhanced', 'only compact voices', 'only synthetic voices'][vv.best]})`);
  check(/voice model \(above\)/.test(vv.says) === vv.lang.startsWith('en') && !/good first one/.test(vv.says), `tutorial: no Mac voice is recommended by name, and ${vv.lang.startsWith('en') ? 'in English the note points at the voice model' : `in ${vv.lang} nothing is said of the models, tried in English only`}`);
  // a macOS voice is heard from beside the cards too, with its reading open: its ▶ plays, and a pace changed stops what
  // was playing (the sample of the pace before), as a line or a reading changed stops a model's
  const macCards = [await foldSum(page, 'who'), await foldSum(page, 'preset')].join(' | ');
  check(/ · a macOS voice/.test(macCards) && /\| None · a preset is a voice model’s$/.test(macCards), `tutorial: the cards say whose voice it is, and that a preset is a model's (${macCards})`);
  await openFold(page, 'preset');
  if (await page.locator('.presets [data-play]').count()) { // a model preset's sample asked for, then the macOS voice's own ▶: the strip stops saying the sample is coming
    let held = null; await page.route('**/api/voice-sample*', (r) => { held = r; }); // held, never answered: nothing is said for real
    await page.locator('.presets [data-play]').first().click(); await page.waitForSelector('.presets [data-play].wait');
    const making = await page.textContent('#sample-note');
    await page.click('.audition button.play'); await page.waitForTimeout(300);
    check(!!held && /^Saying it/.test(making) && await page.textContent('#sample-note') === '', `tutorial: the macOS voice's ▶, pressed while a preset's sample is being made, takes over, and the strip stops saying the sample is coming (${making} → ${await page.textContent('#sample-note')})`);
    await held?.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); await page.unroute('**/api/voice-sample*');
    await page.click('.audition button.play'); await page.waitForTimeout(200); // the greeting paused: the check below plays it
  }
  await openFold(page, 'reading');
  check(await page.locator('.audition input').count() === 0 && /own/.test(await page.textContent('.audition .au-say')) && await page.locator('.dpanel .field').count() === 2, 'tutorial: a macOS voice says a greeting of its own: no line to type, its pace and its pauses in How it reads');
  await page.click('.audition button.play');
  const playing = await page.waitForSelector('.audition button.play.on', { timeout: 20000 }).then(() => true, () => false);
  await page.click('.seg button:has-text("Calm"):has-text("unhurried")'); await page.waitForTimeout(300);
  check(playing && await page.locator('[data-play].on').count() === 0 && await foldSum(page, 'reading') === 'Calm pace · even pauses', `tutorial: the ▶ beside the cards plays the voice with its reading open, and a pace changed stops the sample of the pace before (${await foldSum(page, 'reading')})`);
  await openFold(page, 'lines'); await page.click('.seg button:has-text("As a file only")'); await idle(); await page.waitForTimeout(700);
  await openFold(page, 'mix'); // another card open: Review's Edit on Subtitles must open its own
  await shot('7');
  await page.click('#steps li[data-step=review] button'); await idle(); await page.waitForTimeout(600);
  const rows = await page.$$eval('.summary .r', (r) => r.map((x) => `${x.querySelector('.k').textContent}=${x.querySelector('.v').textContent}`).join('|'));
  check(/Length=from the story/.test(rows) && /Lesson=Make the first commit/.test(rows) && /Voice=[^|]+\|Reading=calm pace, even pauses/.test(rows) && /Subtitles=As a file only/.test(rows), `tutorial: the review tells the lesson, the voice and the subtitles (${rows.match(/Length=[^|]+\|Lesson=[^|]+\|Voice=[^|]+/)?.[0]})`);
  check(/^A tutorial of .+: Make the first commit: open, stage, commit\., as long as its story,/.test(await page.textContent('#request')), 'tutorial: and so does the request line');
  await page.click('.summary .r:has(.k:text-is("Reading")) .e'); await idle();
  check(await page.textContent('#title') === 'Which voice?' && await inSight(page, 'reading') && await page.locator('.dpanel .field').count() === 2, 'review: a macOS voice\'s pace is on the Reading row, and its Edit opens How it reads, where the pace is set');
  await page.click('#steps li[data-step=review] button'); await page.waitForSelector('.summary .r');
  await page.click('.summary .r:has(.k:text-is("Subtitles")) .e'); await idle();
  check(await page.textContent('#title') === 'Which voice?' && await inSight(page, 'lines') && await foldSum(page, 'lines') === 'From the lesson · subtitles as a file only', `review: Edit takes you to the card its line is in, open (${await foldSum(page, 'lines')})`);
  await page.click('#steps li[data-step=review] button'); await page.waitForSelector('.summary .r');
  await page.click('#next');
});
if (tut) {
check(tut.frame === 'iphone', `tutorial: the device it is told on is the brief's frame (${tut.frame})`);
check(tut.kind === 'tutorial' && tut.duration === 0 && JSON.stringify(tut.formats) === '["tutorial"]' && tut.fps === 30 && /-tutorial$/.test(tut.name || ''), `tutorial: kind, one format, length from the story, 30 fps, named <product>-tutorial (${tut.name})`);
const TV = tut.voice || {};
check(TV.kind === 'mac' && TV.model === null && TV.tempo === null && !!TV.name && /^[a-z]{2,3}-[A-Z0-9]{2,4}$/.test(TV.lang || '') && TV.rate === 130 && ['Premium', 'Enhanced', 'compact'].includes(TV.quality) && TV.captions === 'file' && /first commit/.test(tut.tutorial?.task || ''), `tutorial: the lesson, the voice with its language and pace, the subtitles in the brief (${JSON.stringify(TV)})`);
}

// a tutorial sent without its voice step ever opened: the brief names the model, its pace and its language
const model = await wizard('tutorial-model', async ({ page, idle }) => {
  await page.click('.card:has(.lbl:text-is("Tutorial"))'); await idle();
  await page.click('#next'); await pickProduct(page);
  await page.click('#steps li[data-step=review] button'); await idle(); await page.waitForTimeout(600);
  await page.click('#next');
});
const MV = model.voice || {};
check(MV.kind === 'model' && MV.model === 'chatterbox' && MV.speaker === null && MV.tempo === 0.88 && MV.tone === 'warm' && MV.human === 'clean' && MV.lang === 'en-US' && MV.name === null && MV.rate === null && MV.captions === 'both', `tutorial: left as it opens, the brief is a voice model's, read as the lesson voice always was (${JSON.stringify(MV)})`);

// Sara chosen in the voice step: the brief names Kokoro, her voice, her language, and no tone
const kokoro = await wizard('tutorial-kokoro', async ({ page, idle }) => {
  await page.click('.card:has(.lbl:text-is("Tutorial"))'); await idle();
  await page.click('#next'); await pickProduct(page);
  await page.click('#steps li[data-step=voice] button'); await idle();
  await openFold(page, 'who');
  await page.click('.models .vcard:has(.vn:text("Sara")) .pick'); await idle();
  // off macOS no voice of macOS is offered, only the models'
  check(process.platform === 'darwin' || await page.locator('.seg button:has-text("spoken by macOS")').count() === 0, 'kokoro: off macOS, no macOS voice is offered');
  await page.click('#steps li[data-step=review] button'); await idle(); await page.waitForTimeout(600);
  await page.click('#next');
});
const KV = kokoro.voice || {};
check(KV.kind === 'model' && KV.model === 'kokoro' && KV.speaker === 'if_sara' && KV.tone === null && KV.lang === 'it-IT', `kokoro: the brief names the model, Sara's voice, Italian, and no tone (${JSON.stringify(KV)})`);

// ---------------------------------------------------------------- a brief remembered from an older schema
{
  writeFileSync(join(TMP, 'prefs', 'prefs.json'), JSON.stringify({ byProduct: {}, last: {
    request: 'A film like the last one.', recipe: 'loop', kind: 'promo', duration: 15, aspects: ['16:9'], files: ['mp4'], formats: ['bento', 'retired-format'],
    frame: 'retired-frame', tone: 'premium', fps: 60, resolution: 1080, music: 'track', musicFile: '/Music/old-song.mp3', look: 'retired-look', motion: { text: 'retired-style', transition: 'retired-cut', pace: 'measured', shutter: 360 },
    product: { name: 'Acme', url: 'https://acme.example/pricing' }, name: 'acme-promo',
    tutorial: { task: '', voice: 'mac', voiceName: 'Samantha', rate: 130, captions: 'file' }, // schema 2 kept a voice under the tutorial
  } }));
  const st = start(['--no-open']), at = new URL(await st.url);
  const pg = await browser.newPage({ viewport: { width: 1480, height: 940 } });
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(at.href); await pg.waitForSelector('.option');
  await pg.click('.option'); await pg.waitForTimeout(600);
  const line = await pg.textContent('#request');
  check(errs.length === 0 && /^A 15 s promo loop of Acme \(acme\.example\/pricing\), 16:9, bento,/.test(line) && !/retired/.test(line) && !(await pg.$eval('#next', (x) => x.disabled)), `a brief remembered from an older schema still opens, what it names that is gone left open (${errs.join('; ') || line})`);
  check(new RegExp(`told by (Samantha|this ${MACHINE}’s voice), subtitles as a file, music: old-song\\.mp3\\.$`).test(line), `and its voice (schema 2's, under the tutorial) and its track come back (${line.slice(-80)})`);
  await pg.click('#next'); await pg.waitForTimeout(500);
  check(await pg.inputValue('input[type=url]') === 'https://acme.example/pricing', `and its website is in the website field (${await pg.inputValue('input[type=url]')})`);
  await fetch(at.origin + '/api/cancel', { method: 'POST', headers: { 'x-studio-key': at.searchParams.get('k') } });
  await pg.close(); await sleep(800);
}

// ---------------------------------------------------------------- a remembered brief's device
{
  writeFileSync(join(TMP, 'prefs', 'prefs.json'), JSON.stringify({ byProduct: {}, last: {
    request: 'An iPad film like the last one.', recipe: 'loop', kind: 'promo', duration: 15, aspects: ['16:9'], files: ['mp4'], formats: ['bento'], frame: 'ipad',
    tone: 'premium', fps: 60, resolution: 1080, music: 'none', product: { name: 'Acme', url: 'https://acme.example' }, name: 'acme-promo',
  } }));
  const st = start(['--no-open']), at = new URL(await st.url);
  const pg = await browser.newPage({ viewport: { width: 1480, height: 940 } });
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(at.href); await pg.waitForSelector('.option');
  await pg.click('.option'); await pg.waitForTimeout(600);
  const line = await pg.textContent('#request');
  await pg.click('#steps li[data-step=format] button'); await pg.waitForSelector('.deck');
  const back = `${await foldSum(pg, 'device')} | ${(await pg.textContent('#steps li[data-step=format] .v')).trim()}`;
  await openFold(pg, 'device');
  const marked = await pg.textContent('.dpanel .grid .card[aria-pressed="true"] .lbl').catch(() => '');
  check(errs.length === 0 && /, bento, shown on an iPad, /.test(line) && back === 'iPad · the product’s own layout on it, tapped | Bento · iPad' && marked === 'iPad', `a remembered brief brings its device back: the request line, the format step's card and sidebar, the frame marked among the tiles (${errs.join('; ') || `${back}; ${marked}`})`);
  await fetch(at.origin + '/api/cancel', { method: 'POST', headers: { 'x-studio-key': at.searchParams.get('k') } });
  await pg.close(); await sleep(800);
}

// ---------------------------------------------------------------- the ways it ends
// the Chrome processes started on the Studio's own profile: pgrep, or Windows' process list through PowerShell
const chromes = () => (process.platform === 'win32'
  ? Number(spawnSync('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Process -Filter "Name=\'chrome.exe\'" | Where-Object { $_.CommandLine -like "*$env:PROFILE_DIR*" } | Measure-Object).Count'],
    { encoding: 'utf8', env: { ...process.env, PROFILE_DIR: join(TMP, 'prefs', 'chrome') } }).stdout.trim() || 0)
  : Number(execSync(`pgrep -f '${join(TMP, 'prefs', 'chrome')}' | wc -l`).toString().trim()));
const before = chromes();
let s = start([], { STUDIO_CHROME_ARGS: '--headless=new' });
const url = new URL(await s.url), k = url.searchParams.get('k');
await sleep(6000);
check(chromes() > before, 'its own Chrome is running');
check((await fetch(url.origin + '/api/context')).status === 403, 'a call without the key is refused');
const ctx = await (await fetch(url.origin + '/api/context', { headers: { 'x-studio-key': k } })).json();
// it answers only to its own address: the Host is checked on every route (fetch cannot set it, http can), and
// a POST that names an Origin must name the Studio's own (a request that names none, curl or the app, passes)
const ask = (path, { host = url.host, origin, method = 'GET', body } = {}) => new Promise((ok, no) => {
  const r = httpRequest({ host: url.hostname, port: url.port, path, method, headers: { host, 'x-studio-key': k, ...(origin ? { origin } : {}), ...(body ? { 'content-type': 'application/json' } : {}) } }, (res) => { res.resume(); res.on('end', () => ok(res.statusCode)); });
  r.on('error', no); r.end(body);
});
const evil = `evil.example:${url.port}`, badBrief = JSON.stringify({ kind: 'promo', name: 'Bad Name', duration: 2 });
check(await ask('/studio/index.html', { host: evil }) === 403 && await ask('/api/context', { host: evil }) === 403, 'a foreign Host is refused on a static route and on an API route');
check(await ask('/studio/index.html') === 200 && await ask('/api/context') === 200 && await ask('/api/context', { host: `localhost:${url.port}` }) === 200, 'the Studio\'s own Host passes, by 127.0.0.1 or localhost');
check(await ask('/api/brief', { method: 'POST', body: badBrief, origin: 'http://evil.example' }) === 403, 'a POST from a foreign Origin is refused');
check(await ask('/api/brief', { method: 'POST', body: badBrief, origin: url.origin }) === 400 && await ask('/api/brief', { method: 'POST', body: badBrief }) === 400, 'a POST from its own Origin, or with none, gets through to the brief check (400 for the bad name)');
check(ctx.studio?.name === IDENTITY.name && ctx.studio?.version === IDENTITY.version, `the API hands the page the Studio's name and version (${JSON.stringify(ctx.studio)})`);
const fonts = await (await fetch(url.origin + '/api/fonts', { headers: { 'x-studio-key': k } })).json();
check(fonts.kit.length >= 20 && Array.isArray(fonts.mac), `fonts: the kit's ${fonts.kit.length} families, ${fonts.mac.length} on this Mac`);
const pics = await (await fetch(url.origin + '/api/images', { headers: { 'x-studio-key': k } })).json();
check(Array.isArray(pics.images), `pictures: ${pics.images.length} recent ones listed`);
check((await fetch(url.origin + '/engine/..%2F..%2FSKILL.md')).status === 404, 'a path out of its folder is refused');
check((await fetch(url.origin + '/studio/%E0%A4%A')).status === 400 && (await fetch(url.origin + '/api/ping', { headers: { 'x-studio-key': k } })).status === 200, 'an address that is not one gets a 400, and the Studio carries on');
check((await fetch(url.origin + '/api/beats?path=' + encodeURIComponent(join(TMP, 'nope.mp3')), { headers: { 'x-studio-key': k } })).status === 404, 'beats: a track that is not there is a 404');
const tl = await (await fetch(url.origin + '/api/tracks?product=acme', { headers: { 'x-studio-key': k } })).json();
check(tl.tracks?.length === 2 && tl.tracks[0].own === true && tl.tracks[0].brand === 'Acme' && /^Acme video music/.test(tl.tracks[0].folder || '') && tl.tracks[1].brand === null && tl.tracks[1].own === false, `tracks: the music library's, the product's own folder marked and first, a track at its top last, the folder's note kept (${JSON.stringify(tl.tracks?.map((t) => t.name))})`);
// the library from settings.json, with MANOVELLA_MUSIC unset (not passed on): musicLibrary, delivering into it only
// when asked; and an older file's brandLibrary, read as the music library and delivering into it, as it did then
for (const [what, file, delivers] of [['musicLibrary', { musicLibrary: BRAND, musicLibraryIgnore: ['Songs'] }, false], ['an older brandLibrary', { brandLibrary: BRAND, brandLibraryIgnore: ['Songs'] }, true]]) {
  writeFileSync(join(TMP, 'prefs', 'settings.json'), JSON.stringify(file));
  const sl = start(['--no-open'], { MANOVELLA_MUSIC: undefined }), sat = new URL(await sl.url), sk = { headers: { 'x-studio-key': sat.searchParams.get('k') } };
  const fromSettings = await (await fetch(sat.origin + '/api/tracks?product=acme', sk)).json();
  const ctx = await (await fetch(sat.origin + '/api/context', sk)).json(), view = await (await fetch(sat.origin + '/api/settings', sk)).json();
  const to = async (product) => (await (await fetch(`${sat.origin}/api/exists?name=acme-promo&product=${product}`, sk)).json()).to;
  const into = [await to('acme'), await to('Zeta')], want = delivers ? [join(BRAND, 'Acme', 'video', 'acme-promo'), join(BRAND, 'Zeta', 'video', 'acme-promo')] : [join(TMP, 'out', 'acme-promo'), join(TMP, 'out', 'acme-promo')];
  check(JSON.stringify(into) === JSON.stringify(want), `deliver: ${what}: a film goes ${delivers ? 'into the library, in the product\'s folder (matched by name, or named after it) under video/' : 'into the work root'} (${into.join(', ')})`);
  check(fromSettings.tracks?.length === 2 && fromSettings.tracks[0].brand === 'Acme' && view.musicLibrary.set[0] === BRAND && view.deliverToLibrary === delivers && ctx.library === (delivers ? BRAND : null),
    `tracks: ${what} in settings.json finds the library, its ignore list still hides Songs, and films are delivered into it: ${delivers} (${JSON.stringify(fromSettings.tracks?.map((t) => `${t.brand}/${t.name}`))}, ${ctx.library})`);
  await fetch(sat.origin + '/api/cancel', { method: 'POST', ...sk });
  for (let i = 0; i < 40 && sl.code() === null; i++) await sleep(200);
}
writeFileSync(join(TMP, 'prefs', 'settings.json'), JSON.stringify({ musicLibraryIgnore: ['Songs'] }));
const part = await fetch(`${url.origin}/api/audio/${tl.tracks[0].id}?k=${k}`, { headers: { range: 'bytes=0-99' } });
check(part.status === 206 && part.headers.get('content-range') === `bytes 0-99/${statSync(TRACK).size}` && (await part.arrayBuffer()).byteLength === 100 && part.headers.get('content-type') === 'audio/wav', `audio: a track answers a Range, as WebKit asks before it plays (${part.status} ${part.headers.get('content-range')})`);
const kit = await (await fetch(url.origin + '/api/voice-models', { headers: { 'x-studio-key': k } })).json();
check(typeof kit.python === 'boolean' && typeof kit.models?.chatterbox === 'boolean' && /voice\.mjs --setup/.test(kit.setup || ''), `voice models: what this Mac has (python ${kit.python}, chatterbox ${kit.models?.chatterbox}, orpheus ${kit.models?.orpheus})`);
check((await fetch(url.origin + '/api/voice-sample?model=chatterbox&tone=shouty&text=Hi', { headers: { 'x-studio-key': k } })).status === 400, 'voice sample: a setting the schema does not offer is refused');
{
  const q = new URLSearchParams({ model: 'chatterbox', tone: 'warm', tempo: '1', human: 'clean', text: 'The same words, the same take.' });
  const r = await fetch(`${url.origin}/api/voice-sample?${q}`, { headers: { 'x-studio-key': k } }), j = await r.json();
  if (kit.silicon && kit.python && kit.models.chatterbox) {
    const wav = r.ok ? await (await fetch(`${url.origin}/api/sample/${j.id}.wav?k=${k}`)).arrayBuffer() : new ArrayBuffer(0);
    check(r.status === 200 && wav.byteLength > 48000 && new TextDecoder().decode(wav.slice(0, 4)) === 'RIFF' && new DataView(wav).getUint32(24, true) === 48000, `voice sample: a line said by Chatterbox through voice.mjs, 48 kHz (${wav.byteLength} bytes)`);
  } else check(r.status === 409 && /Claude|setup|Apple Silicon/.test(j.message || ''), `voice sample: on a Mac without the model, a 409 that says what is missing (${j.message})`);
}
check((await fetch(url.origin + '/api/voice-sample?model=kokoro&speaker=leah&text=Hi', { headers: { 'x-studio-key': k } })).status === 400, 'voice sample: a voice of another model is refused');
{ // Kokoro says Sara's Italian line through voice.mjs when this Mac has it (the model, and the packages --setup kokoro adds)
  const has = kit.python && kit.models.kokoro && spawnSync((await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'voice.mjs')).href)).python(), ['-c', 'import misaki, espeakng_loader'], { stdio: 'ignore' }).status === 0;
  const q = new URLSearchParams({ model: 'kokoro', speaker: 'if_sara', tone: 'bright', tempo: '1', human: 'clean', text: 'Ecco Manovella. Tutto quello che ti serve.' });
  const r = await fetch(`${url.origin}/api/voice-sample?${q}`, { headers: { 'x-studio-key': k } }), j = await r.json();
  if (kit.silicon && has) {
    const wav = r.ok ? await (await fetch(`${url.origin}/api/sample/${j.id}.wav?k=${k}`)).arrayBuffer() : new ArrayBuffer(0);
    check(r.status === 200 && wav.byteLength > 48000 && new TextDecoder().decode(wav.slice(0, 4)) === 'RIFF' && new DataView(wav).getUint32(24, true) === 48000, `voice sample: Sara's Italian line said by Kokoro through voice.mjs, 48 kHz (${wav.byteLength} bytes)`);
  } else check(r.status === 409 || r.status === 500, `voice sample: on a Mac without Kokoro (or its packages), it says so instead of a WAV (${r.status} ${j.message || ''})`);
}
const bad = await fetch(url.origin + '/api/brief', { method: 'POST', headers: { 'x-studio-key': k }, body: JSON.stringify({ kind: 'promo', name: 'Bad Name', duration: 2 }) });
const badSays = (await bad.json()).errors || [];
check(bad.status === 400 && badSays.length === 3 && badSays.some((e) => /^duration: 2 does not fit a promo \(6, 10, 15, 30, 0, or any whole number of seconds from 3 to 60\)$/.test(e)), `a brief that fails the schema is refused, with every reason: a length is one of its kind's, or within its range (${badSays.find((e) => /^duration/.test(e))})`);
for (const [kind, duration, ok] of [['promo', 61, false], ['promo', 7.5, false], ['film', 29, false], ['release', 20, false], ['film', 900, true]]) { // by range, per kind: only the last would pass, and it lacks a name
  const r = await fetch(url.origin + '/api/brief', { method: 'POST', headers: { 'x-studio-key': k }, body: JSON.stringify({ kind, name: 'Bad Name', duration, product: { name: 'Acme', url: 'https://acme.example' } }) });
  const said = (await r.json()).errors || [];
  check(r.status === 400 && said.some((e) => /^duration/.test(e)) === !ok, `a ${kind} of ${duration} s is ${ok ? 'a length it takes' : 'refused'} (${said.find((e) => /^duration/.test(e)) || 'no word on its length'})`);
}
const framed = await fetch(url.origin + '/api/brief', { method: 'POST', headers: { 'x-studio-key': k }, body: JSON.stringify({ kind: 'promo', name: 'acme-promo', frame: 'toaster', product: { name: 'Acme', url: 'https://acme.example' } }) });
const framedSays = (await framed.json()).errors || [];
check(framed.status === 400 && framedSays.length === 1 && framedSays[0] === `frame: "toaster" is not one of ${SCHEMA.frames.map((f) => f.id).join(', ')}`, `a brief whose frame the schema does not have is refused, with the frames it has (${framedSays.join('; ')})`);
const mute = await fetch(url.origin + '/api/brief', { method: 'POST', headers: { 'x-studio-key': k }, body: JSON.stringify({ kind: 'promo', name: 'acme-promo', duration: 0, product: { name: 'Acme', url: 'https://acme.example' } }) });
check(mute.status === 400 && /as long as its voice/.test(JSON.stringify(await mute.json())), 'a promo as long as its voice, with no voice, is refused');
await fetch(url.origin + '/api/cancel', { method: 'POST', headers: { 'x-studio-key': k } });
await sleep(2500);
check(s.lines.includes('CANCELLED') && s.code() === 0, 'Cancel: CANCELLED, exit 0');
check(chromes() === before, 'Cancel: its Chrome went with it');

s = start(['--no-open']);
const page = await browser.newPage();
await page.goto(await s.url); await page.waitForSelector('.card');
await page.close({ runBeforeUnload: true });
await sleep(7000);
check(s.lines.includes('CLOSED') && s.code() === 0, 'a window that goes away: CLOSED, exit 0');
if (s.code() === null) s.p.kill();

// ---------------------------------------------------------------- another agent: --detach, --wait, its name in the copy
// An agent that no background exit wakes starts the Studio detached and waits on its state file until the
// line comes. With --agent the copy names that agent and never Claude, and the end screen gives its command;
// with no agent known (no --agent, no CLAUDECODE) it says "your agent" and gives every agent's command.
{
  const env = { ...process.env, STUDIO_PREFS: join(TMP, 'prefs'), MANOVELLA_MUSIC: BRAND, CLAUDECODE: '' };
  const studio = (...a) => spawnSync('node', [STUDIO, ...a], { encoding: 'utf8', env });
  const detach = (...a) => {
    const d = studio('--detach', '--no-open', '--out', join(TMP, 'out'), ...(ROOTS ? ['--roots', ROOTS] : []), ...a);
    return { d, at: d.stdout.match(/^STUDIO (\S+)$/m)?.[1], state: d.stdout.match(/^STATE (.+)$/m)?.[1] };
  };
  // every step's text, from the first to the end screen, through the shortest brief: a promo loop of the first product
  const toSent = async (at) => {
    const pg = await browser.newPage({ viewport: { width: 1480, height: 940 } }), errs = [], texts = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    const idle = () => idleOn(pg);
    await pg.goto(at); await pg.waitForSelector('.card'); await idle();
    await pg.click('.card:has-text("Promo loop")'); await idle();
    await pg.click('#next'); await pickProduct(pg);
    for (let i = 0; i < 9 && !(await pg.$('.sent')); i++) { texts.push(await pg.evaluate(() => document.body.innerText)); await pg.click('#next'); await idle(); }
    await pg.waitForSelector('.sent', { timeout: 10000 });
    texts.push(await pg.evaluate(() => document.body.innerText));
    await pg.close();
    return { texts, sent: texts.at(-1), errs };
  };
  const context = async (at) => (await fetch(new URL('/api/context', at), { headers: { 'x-studio-key': new URL(at).searchParams.get('k') } })).json();

  const a = detach('--agent', 'codex');
  check(a.d.status === 0 && !!a.at && !!a.state, `--detach: back at once with STUDIO and STATE (${a.d.status}: ${a.d.stdout.trim()} ${a.d.stderr.trim()})`);
  if (a.at && a.state) {
    const w = studio('--wait', a.state, '--for', '1');
    check(w.status === 0 && w.stdout.trim() === 'WAITING', `--wait: WAITING while the Studio is open (${w.stdout.trim()})`);
    const ctx = await context(a.at);
    check(ctx.agent?.name === 'Codex' && ctx.schema.fields.notes.label === 'Notes for Codex' && !/Claude/.test(JSON.stringify(ctx.schema)), `--agent codex: the schema's copy names Codex (${ctx.schema.fields.notes.label})`);
    const r = await toSent(a.at);
    const named = r.texts.filter((t) => /Claude/.test(t));
    check(r.errs.length === 0 && named.length === 0 && r.texts.some((t) => /Codex picks three/.test(t)), `--agent codex: no step names Claude, and they name Codex (${named.length} naming Claude; ${r.errs.join('; ')})`);
    check(/Back to Codex: it is reading the brief/.test(r.sent) && /codex "Use the site-promo-film skill on the brief [^"]+brief\.json"/.test(r.sent), `--agent codex: the end screen sends the user back to Codex, with its command (${r.sent.replace(/\s+/g, ' ').slice(-220)})`);
    const end = studio('--wait', a.state, '--for', '20');
    check(/^BRIEF .+brief\.json$/.test(end.stdout.trim()) && existsSync(end.stdout.trim().slice(6)), `--wait: the brief's line once it is created (${end.stdout.trim()})`);
  }

  const b = detach();
  if (b.at && b.state) {
    const ctx = await context(b.at);
    const r = await toSent(b.at);
    check(ctx.agent === null && ctx.agents.length === 4 && r.texts.every((t) => !/Claude/.test(t)) && r.texts.some((t) => /Your agent picks three/.test(t)), `no agent known: the copy says "your agent" (${ctx.agent})`);
    check(process.platform === 'darwin' || r.texts.every((t) => !/this Mac|each Mac/.test(t)), 'off macOS no step says "this Mac": it says this computer');
    check(/Back to your agent: it is reading the brief/.test(r.sent) && ['claude "/manovella:site-promo-film brief', 'codex "', 'copilot -i "', 'gemini -i "'].every((c) => r.sent.includes(c)), `no agent known: the end screen sends the user back to "your agent" and gives every agent's command (${r.sent.replace(/\s+/g, ' ').slice(-300)})`);
    studio('--wait', b.state, '--for', '20');
  } else check(false, `--detach without --agent: ${b.d.stderr.trim()}`);

  // a Studio that stopped without an ending (killed): its heartbeat stops, and within 15 s --wait reads
  // CLOSED and says where its log is; and --for takes a number of seconds, or says so
  const c = detach('--agent', 'gemini');
  const pid = c.state && JSON.parse(readFileSync(c.state, 'utf8')).pid;
  const bad = c.state && studio('--wait', c.state, '--for', '50s');
  check(bad?.status === 2 && /--for takes seconds/.test(bad.stderr), `--wait --for 50s: refused, not taken as 240 (${bad?.status}: ${bad?.stderr.trim()})`);
  if (pid) { process.kill(pid, 'SIGKILL'); await sleep(500); }
  const gone = c.state && studio('--wait', c.state, '--for', '25');
  check(!!pid && gone.stdout.trim() === 'CLOSED' && /log/.test(gone.stderr), `--wait: a Studio gone without a line reads CLOSED (${gone?.stdout.trim()}; ${gone?.stderr.trim()})`);
}

// ---------------------------------------------------------------- the window: the Studio's own app, where it is built
const until = async (f, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) if (f()) return true; return false; };
// macOS only: the app is a macOS bundle, and its stand-in a bash script.
if (process.platform === 'darwin') {
// A stand-in for ~/Applications/Manovella.app under a temporary HOME: it writes down how it was
// started and the SIGTERM that ends it, and exits by itself (its window closed) when told to.
const HOME = join(TMP, 'home'), BIN = join(HOME, 'Applications', `${IDENTITY.name}.app`, 'Contents', 'MacOS');
mkdirSync(BIN, { recursive: true });
writeFileSync(join(BIN, IDENTITY.name), `#!/bin/bash
cd "$(dirname "$0")"
echo "ARGS $*" >> log
trap 'echo TERM >> log; exit 0' TERM
while [ ! -e close ]; do sleep 0.2; done
echo CLOSE >> log
`);
chmodSync(join(BIN, IDENTITY.name), 0o755);
const log = () => (existsSync(join(BIN, 'log')) ? readFileSync(join(BIN, 'log'), 'utf8') : '');
const reset = () => { rmSync(join(BIN, 'log'), { force: true }); rmSync(join(BIN, 'close'), { force: true }); };
const appEnv = { HOME, STUDIO_CHROME_ARGS: undefined, MANOVELLA_WINDOW: undefined }; // undefined: not passed on

reset();
s = start([], appEnv);
const appUrl = await s.url, ak = new URL(appUrl).searchParams.get('k');
check(await until(() => log().includes('ARGS')), 'with the app built, the Studio opens in it');
check(log().split('\n')[0] === `ARGS --url ${appUrl}`, `and hands it the page's address (${log().split('\n')[0]})`);
await fetch(new URL(appUrl).origin + '/api/cancel', { method: 'POST', headers: { 'x-studio-key': ak } });
await until(() => s.code() !== null);
await until(() => log().includes('TERM'), 3000);
check(s.lines.includes('CANCELLED') && s.code() === 0 && log().includes('TERM'), 'Cancel: CANCELLED, and the app is ended with SIGTERM');

reset();
s = start([], appEnv);
await s.url;
await until(() => log().includes('ARGS'));
writeFileSync(join(BIN, 'close'), '');
await until(() => s.code() !== null);
check(s.lines.includes('CLOSED') && s.code() === 0 && log().includes('CLOSE') && !log().includes('TERM'), 'the app quitting (its window closed): CLOSED, exit 0');

// The switch can be tried only with a headless Chrome, and STUDIO_CHROME_ARGS keeps Chrome by itself
// too: this proves the app is passed over, not which of the two did it (telling them apart would mean
// opening a visible Chrome, which a test does not do).
reset();
const chromesBefore = chromes();
s = start([], { HOME, MANOVELLA_WINDOW: 'chrome', STUDIO_CHROME_ARGS: '--headless=new' });
const chUrl = new URL(await s.url);
await sleep(5000);
check(chromes() > chromesBefore && !log(), 'MANOVELLA_WINDOW=chrome with the app built: its Chrome runs, the app is never started');
await fetch(chUrl.origin + '/api/cancel', { method: 'POST', headers: { 'x-studio-key': chUrl.searchParams.get('k') } });
await until(() => s.code() !== null);
await sleep(1000);
check(s.lines.includes('CANCELLED') && chromes() === chromesBefore, 'and Cancel takes that Chrome with it');

// Before Manovella the remembered briefs lived under gf-film-studio: the first start without STUDIO_PREFS
// moves them, under the temporary HOME, with the stand-in app as its window, even when a settings.json
// was written in Manovella's folder first.
reset();
const support = join(HOME, 'Library', 'Application Support');
mkdirSync(join(support, 'gf-film-studio'), { recursive: true });
writeFileSync(join(support, 'gf-film-studio', 'prefs.json'), '{"last":{}}\n');
mkdirSync(join(support, 'manovella'), { recursive: true });
writeFileSync(join(support, 'manovella', 'settings.json'), '{}\n');
s = start([], { ...appEnv, STUDIO_PREFS: undefined });
const mvUrl = new URL(await s.url);
check(readFileSync(join(support, 'manovella', 'prefs.json'), 'utf8') === '{"last":{}}\n' && !existsSync(join(support, 'gf-film-studio', 'prefs.json')),
  'the remembered briefs move from gf-film-studio to manovella on the first start, a settings.json there or not');
await fetch(mvUrl.origin + '/api/cancel', { method: 'POST', headers: { 'x-studio-key': mvUrl.searchParams.get('k') } });
await until(() => s.code() !== null);
}

// ---------------------------------------------------------------- the Settings, saved and followed
// A run that is given no folders, as a user's: it lists the repositories round the folder it starts in (here
// an empty one), and the folder picker answers with STUDIO_CHOOSE_FOLDER: a folder that holds a repository
// and a picture, and is no repository itself.
{
  const projects = join(TMP, 'projects'), prefs = join(TMP, 'prefs-settings'), cwd = join(TMP, 'cwd');
  for (const d of [prefs, cwd, projects]) mkdirSync(d, { recursive: true });
  const here = realpathSync(cwd); // where the Studio finds itself started: /var is /private/var on a Mac
  execSync(`git init -q "${join(projects, 'acme-site')}"`);
  // its brand's colour, where the Studio reads one: a web manifest's theme_color, in the index
  writeFileSync(join(projects, 'acme-site', 'manifest.json'), JSON.stringify({ name: 'Acme', theme_color: '#0A84FF' }));
  execSync(`git -C "${join(projects, 'acme-site')}" add manifest.json`);
  writeFileSync(join(projects, 'backdrop.jpg'), readFileSync(PICTURE));
  const saved = () => { try { return JSON.parse(readFileSync(join(prefs, 'settings.json'), 'utf8')); } catch { return {}; } };
  s = start(['--no-open'], { STUDIO_PREFS: prefs, STUDIO_CHOOSE_FOLDER: projects, MANOVELLA_ROOTS: '', FILM_DOWNLOADS: '' }, { given: false, cwd });
  const at = new URL(await s.url), page = await browser.newPage({ viewport: { width: 1480, height: 940 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(at.href); await page.waitForSelector('.card');
  await page.click('.card:has-text("Promo loop")'); await page.click('#next'); await page.waitForSelector('.pane .srcline');
  const from0 = await page.textContent('.pane .srcline'), none = await page.textContent('.plist');
  check(from0.startsWith(`From ${here}, two levels deep.`) && /No repository matches/.test(none), `settings: the product step says where its list comes from (${from0.slice(0, 140)})`);
  await page.click('.srcline button:has-text("Choose a repository…")'); await page.waitForSelector('.pane .warn button');
  check((await page.textContent('.pane .warn')).startsWith(`${projects} is not a git repository.`), 'settings: a folder chosen as the repository that is none says so');
  await page.click('.pane .warn button'); await page.waitForSelector('.plist button .pn');
  const listed = await page.$$eval('.plist button .pn', (x) => x.map((e) => e.textContent));
  check(listed.join() === 'acme-site' && JSON.stringify(saved().projectFolders) === JSON.stringify([here, projects]) && (await page.textContent('.pane .srcline')).startsWith(`From ${here}, ${projects}, two`),
    `settings: and offers to list the repositories in it: saved in settings.json, and the list follows (${listed.join()}; ${JSON.stringify(saved().projectFolders)})`);
  await page.click('.plist button'); await page.waitForSelector('.plist button.sel');
  // a product whose source gives a colour: the previews use it and the card says where it is from; a colour chosen
  // takes its place as the film's accent; Back to the brand's colour brings the guess back, with where it is from.
  // (A colour once chosen, the guess was gone: the box could be ticked, and the card then read "Read from the
  // brand · the previews use #FF0000, chosen in the Studio".)
  await page.waitForFunction(() => /#0A84FF/.test(document.querySelector('.dcard[data-fold="colour"] .dcap')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  await openFold(page, 'colour');
  const guessed = await foldSum(page, 'colour');
  await page.click('.check input'); await page.fill('.color input[type=text]', '#FF0000'); await page.keyboard.press('Tab'); await page.waitForTimeout(500);
  const chosen = `${await foldSum(page, 'colour')} | ${await page.textContent('.color button.e').catch(() => '')}`;
  await page.click('.color button.e', { timeout: 3000 }).catch(() => page.click('.check input')); await page.waitForTimeout(500);
  const restored = `${await foldSum(page, 'colour')} | ${await page.inputValue('.color input[type=text]')} | ${await page.isChecked('.check input')}`;
  check(guessed === 'Read from the brand · the previews use #0A84FF, guessed from manifest.json theme_color' && chosen === '#FF0000 · chosen in the Studio | Back to the brand’s colour, #0A84FF' && restored === `${guessed} | #0A84FF | true`,
    `colour: the brand's colour, guessed from the source, comes back after another was chosen, and the card never says both (${guessed} → ${chosen} → ${restored})`);
  await openFold(page, 'repo');
  // the dialog: the defaults marked, a folder added, the work folder chosen and put back
  await page.click('#settings'); await page.waitForSelector('#settings-dlg[open] .set-pane:not(.ab-pane)');
  const rows = (k) => page.$$eval(`#set-${k} .set-row`, (r) => r.map((x) => x.textContent.replace('×', ' x').trim()));
  const r0 = JSON.stringify([await rows('projectFolders'), await rows('pictureFolders'), await rows('musicLibrary'), await rows('workRoot')]);
  check(r0 === JSON.stringify([[`${here} x`, `${projects} x`], [`${tilded('Pictures')}default`], ['None: the music step takes a file of yours, or a new track.'], [`${tilded('Downloads')}default`]]), `settings: each setting with its folders, the defaults marked (${r0})`);
  await page.click('[data-pane="pictureFolders"]');
  await page.click('#set-pictureFolders .set-acts button'); await page.waitForFunction((p) => document.querySelector('#set-pictureFolders code')?.textContent === p, projects);
  // a picture folder on a drive not mounted now: shown, marked, and kept when another is added
  const gone = join(TMP, 'unmounted', 'Backdrops');
  writeFileSync(join(prefs, 'settings.json'), JSON.stringify({ ...saved(), pictureFolders: [gone] }));
  await page.keyboard.press('Escape'); await page.click('#settings'); await page.waitForSelector('#set-pictureFolders .chip');
  const marked = await page.textContent('#set-pictureFolders .set-row');
  await page.click('#set-pictureFolders .set-acts button'); await until(() => (saved().pictureFolders || []).length === 2);
  check(/not found/.test(marked) && JSON.stringify(saved().pictureFolders) === JSON.stringify([gone, projects]), `settings: a folder not there now is marked, and kept when another is added (${JSON.stringify(saved().pictureFolders)})`);
  await page.click('[data-pane="workRoot"]');
  await page.click('#set-workRoot .set-acts button'); await page.waitForFunction((p) => document.querySelector('#set-workRoot code')?.textContent === p, projects);
  check(await page.evaluate(() => document.activeElement === document.querySelector('#set-workRoot .set-acts button') && !document.querySelector('#set-workRoot').hidden), 'settings: a change redraws its pane, which stays the one showing, the focus on its own button');
  const s1 = saved();
  check(JSON.stringify(s1.pictureFolders) === JSON.stringify([gone, projects]) && s1.workRoot === projects, `settings: a picture folder added and the work folder chosen, saved (${JSON.stringify(s1)})`);
  check((await foldSum(page, 'name')).includes(` · ${projects}/`), `settings: and the product step names the new work folder at once, on the name's card (${await foldSum(page, 'name')})`);
  // a music library chosen: then, and only then, the choice to deliver finished films into it
  await page.click('[data-pane="musicLibrary"]');
  check(!(await page.$('#set-musicLibrary .set-opt')), 'settings: no delivery choice without a music library');
  await page.click('#set-musicLibrary .set-acts button'); await page.waitForSelector('#set-musicLibrary .set-opt input');
  await page.click('#set-musicLibrary .set-info');
  check(await page.evaluate(() => { const m = document.querySelector('#set-musicLibrary .set-more'); return !m.hidden && /<Brand>\/video\/<name>\//.test(m.textContent) && document.querySelector('#set-musicLibrary .set-opt input').getAttribute('role') === 'switch'; }), 'settings: the delivery choice is a switch, and its ⓘ says where a film then goes');
  await page.click('#set-musicLibrary .set-opt input'); await until(() => saved().deliverToLibrary === true); // the box ticks before the file is written
  const s2 = saved();
  check(s2.musicLibrary === projects && s2.deliverToLibrary === true, `settings: a music library chosen, and delivering into it ticked, saved (${JSON.stringify(s2)})`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'settings-dialog.png') });
  await page.click('#set-musicLibrary .set-opt input');
  check(await until(() => !('deliverToLibrary' in saved())), 'settings: unticked, the key goes from the file');
  await page.click('[data-pane="workRoot"]');
  await page.click('#set-workRoot .x'); await page.waitForFunction(() => document.querySelector('#set-workRoot .chip')?.textContent === 'default');
  check(!('workRoot' in saved()) && JSON.stringify(await rows('workRoot')) === JSON.stringify([`${tilded('Downloads')}default`]), 'settings: × puts the work folder back to its default, and takes the key out of the file');
  await page.keyboard.press('Escape');
  // the look step, Your pictures: the added folder's
  await page.click('#steps li[data-step=look] button'); await openFold(page, 'mine');
  await page.waitForSelector('.pics .pic span');
  const pics = await page.$$eval('.pics .pic span', (x) => x.map((e) => e.textContent));
  check(pics.join() === 'backdrop.jpg' && (await page.textContent('.pane .srcline')).includes(projects), `settings: Your pictures are the added folder's (${pics.join()})`);
  check(errors.length === 0, `settings: no page errors ${errors.join('; ')}`);
  await page.close();
  await fetch(at.origin + '/api/cancel', { method: 'POST', headers: { 'x-studio-key': at.searchParams.get('k') } });
  await until(() => s.code() !== null);
  // --product names a repository outside the project folders: it is still the product, at the head of the list
  s = start(['--no-open', '--product', join(projects, 'acme-site')], { STUDIO_PREFS: join(TMP, 'prefs-product'), MANOVELLA_ROOTS: '', FILM_DOWNLOADS: '' }, { given: false, cwd });
  const at2 = new URL(await s.url), page2 = await browser.newPage({ viewport: { width: 1480, height: 940 } });
  await page2.goto(at2.href); await page2.waitForSelector('.card');
  await page2.click('.card:has-text("Promo loop")'); await page2.click('#next'); await page2.waitForSelector('.plist button.sel .pn');
  check(await page2.textContent('.plist button.sel .pn') === 'acme-site' && /^From /.test(await page2.textContent('.pane .srcline')), '--product outside the project folders: still the product, at the head of the list');
  await page2.close();
  await fetch(at2.origin + '/api/cancel', { method: 'POST', headers: { 'x-studio-key': at2.searchParams.get('k') } });
  await until(() => s.code() !== null);
}

await browser.close();
if (!failed) rmSync(TMP, { recursive: true, force: true }); // its own scratch folder; kept when something failed, to look at
console.log(failed ? `${failed} failed — the run's folder is kept: ${TMP}` : 'all passed');
process.exit(failed ? 1 : 0);
