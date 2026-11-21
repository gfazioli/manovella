'use strict';
/*
 * The Studio's wizard: ten steps, one brief.
 *
 * Every control comes from schema.json (fields, recipes, formats, frames, looks, typesets, motion, picture),
 * served with /api/context. The previews are the engine's own pages — the templates, and stage.html
 * for looks, type and motion — played by calling their seek(t) in one of two hidden frames and
 * painted into the viewer's canvas: a new preview cross-fades in over the last one instead of
 * flashing, and with Motion blur on each painted frame is the mean of five moments, the way the
 * render blends its sixteen. Tiles are single frames, taken one at a time in a third hidden frame;
 * the tile under the pointer plays, and when the pointer leaves the viewer returns to the choice.
 * The window keeps Manovella's violet whatever the product; the product's colour is where the film
 * is (the previews, the tiles) and a swatch beside its name in the steps. A choice redraws its step,
 * and whoever was typing or tabbing keeps their place in it. A step with more than one thing to choose
 * shows them as a deck of cards (deck): each says what is chosen in it, one opens at a time, and what a
 * long panel keeps in reach (a list's title, its filter) stays at its top while the list scrolls.
 * The brief is POSTed to /api/brief; studio.mjs writes it and exits, and the window goes with it.
 */
(() => {
  const KEY = new URLSearchParams(location.search).get('k') || '';
  const $ = (s, el = document) => el.querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  // a link out of the Studio: the window app opens it in the browser, and a Chrome window keeps the Studio
  const extLink = (href, attrs, ...kids) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', ...attrs }, ...kids);
  async function api(path, opts = {}) {
    const r = await fetch('/api/' + path, { ...opts, headers: { 'x-studio-key': KEY, 'content-type': 'application/json', ...(opts.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { data: j, status: r.status });
    return j;
  }
  const debounce = (fn, ms) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const slug = (s) => String(s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[^a-z0-9.]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 50);
  const SLUG = /^[a-z0-9][a-z0-9.-]{0,62}$/;
  const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const tilde = (p) => String(p || '').replace(/^\/Users\/[^/]+/, '~');
  const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

  let CTX, SCHEMA, F, FONTS = { kit: [], mac: [] }, VOICES = null, SYSLANG = null; // VOICES: this Mac's, once the server has listed them
  const S = {}; // the brief being built
  const FIELD_KEYS = ['kind', 'duration', 'task', 'captions', 'voice', 'voiceModel', 'voiceSpeaker', 'voiceTone', 'voiceTempo', 'voiceHuman', 'voiceName', 'voiceRate', 'voiceScript', 'aspects', 'tone', 'fps', 'resolution', 'files', 'music', 'musicFile', 'musicUnder', 'musicLift', 'reference', 'notes'];
  // a release and a tutorial have one format each; the other kinds choose
  const FIXED = { release: 'whatsnew', tutorial: 'tutorial' };
  /** A kind's length when none fits: its third (15 s for a promo, 3 min for a film), never "as long as its voice". */
  const defaultDuration = (kind) => { const ok = F.duration.byKind[kind]; return ok[Math.min(2, ok.length - 1)]; };
  // A length is one of its kind's own (schema.json, duration.byKind) or one typed, within the kind's range
  // (duration.range; duration.units is how it is typed: a promo's in seconds, a film's and a tutorial's in minutes
  // and seconds; a release has neither, its changes set it). Typed is what the number itself says: a length that is
  // none of its kind's own. lengthOpen: the kind and length Custom was opened on by hand, so that its fields show
  // while the length is still one of the kind's own; it follows what is typed in them, and any other change of the
  // kind or the length leaves it behind. The choice of a length sets it, and is the one place that clears it.
  let lengthOpen = null;
  const lengthKey = () => `${S.kind}:${S.duration}`;
  /** [least, most] seconds a typed length may be for this kind; null where none is taken (or the server that
   *  answers is older than this page and would refuse one). */
  const durRange = (kind) => F.duration.range?.[kind] || null;
  const inRange = (kind, d) => { const r = durRange(kind); return !!r && Number.isInteger(d) && d >= r[0] && d <= r[1]; };
  const typedLength = (kind, d) => d > 0 && !F.duration.byKind[kind].includes(d);
  /** Whether a length chosen for the kind `was` stays with `kind`: one of its own, or one typed that it takes. */
  const keepsLength = (kind, d, was) => F.duration.byKind[kind].includes(d) || (typedLength(was, d) && inRange(kind, d));
  const isCustom = () => !!durRange(S.kind) && (typedLength(S.kind, S.duration) || lengthOpen === lengthKey());
  /** Seconds, as the wizard says them: the schema's own words for its lengths, else 45 s, 2 min, 2 min 30 s. */
  const durLabel = (d) => opt('duration', d)?.label || (d < 60 ? `${d} s` : d % 60 ? `${Math.floor(d / 60)} min ${d % 60} s` : `${d / 60} min`);
  const lengthLabel = (kind, d) => (kind === 'release' ? 'from the changes' : kind === 'tutorial' && !d ? 'from the story' : !d ? 'from the voice' : durLabel(d));
  /** A length with the shape its kind gives the film: '15 s, a loop', '3 min, in chapters'; brief, a chip's '15 s loop'. */
  const lengthWords = (kind, d, brief) => { const shape = { promo: brief ? 'loop' : 'a loop', film: 'in chapters' }[kind]; return durLabel(d) + (shape ? `${brief ? ' ' : ', '}${shape}` : ''); };
  function defaults() {
    for (const k of FIELD_KEYS) { const d = F[k].default; S[k] = Array.isArray(d) ? d.slice() : (d ?? ''); }
    Object.assign(S, { formats: [], frame: null, look: null, scheme: 'analogous', backdrop: null, type: null, motion: { text: null, emphasis: null, transition: null, pace: 'measured', shutter: 360 } });
    // the music's own: where it comes from in the music step (library, file, generate: S.music is 'track' for both of the first two)
    Object.assign(S, { musicFrom: 'none', musicTrack: null, musicUpload: null, musicPrompt: '', musicPromptTouched: false, sampleText: '' });
  }

  const recipe = () => SCHEMA.recipes.find((r) => r.id === S.recipe);
  const opt = (k, v) => F[k].options.find((o) => o.value === v);
  const toned = (model) => opt('voiceModel', model)?.tone !== false; // a model with no sampling temperature has no tone to set (Kokoro)
  const aspectDims = (a) => { const o = opt('aspects', a || S.aspects[0] || '16:9'); return [o.w, o.h]; };
  const fmt = (id) => SCHEMA.formats.find((f) => f.id === id);
  const frameOf = (id) => SCHEMA.frames.find((f) => f.id === id) || null; // what the product is shown in, when it is chosen: a device, a window, the UI alone
  const typeset = (id) => SCHEMA.typesets.find((t) => t.id === id);
  const textStyle = (id) => SCHEMA.motion.text.find((t) => t.id === id);
  const transition = (id) => SCHEMA.motion.transitions.find((t) => t.id === id);
  const paceFactor = (v) => (SCHEMA.motion.pace.find((p) => p.value === v) || {}).factor || 1;
  const shutterOpt = (v) => SCHEMA.motion.shutter.find((o) => o.value === v) || SCHEMA.motion.shutter[0];
  const voiceOf = (name) => (VOICES || []).find((v) => v.name === name) || null;
  let voiceLang = null; // the language whose voices are listed
  /** The voice when none was chosen: the best this Mac has in the language listed, else in its own, else in English. */
  function defaultVoice() {
    const langs = [...new Set((VOICES || []).map((v) => v.lang))].sort();
    if (!langs.length) return null;
    voiceLang = voiceOf(S.voiceName)?.lang || (langs.includes(voiceLang) ? voiceLang : langs.includes(SYSLANG) ? SYSLANG : langs.includes('en_US') ? 'en_US' : langs[0]);
    return voicesIn(voiceLang)[0].name;
  }
  // Premium, then Enhanced, then the compact ones every Mac has, the synthetic ones last (the server's tier):
  // the order they are listed in, and the first is the default. Alphabetical made Eddy the voice of en_US.
  const voicesIn = (lang) => (VOICES || []).filter((v) => v.lang === lang).sort((a, b) => a.tier - b.tier);
  const player = new Audio(); // one voice at a time
  const typeNow = () => (S.type && S.type.display ? S.type : null);
  const typeName = () => { const t = typeNow(); return t ? (t.set ? typeset(t.set).label : t.display.family) : null; };

  // ---------------------------------------------------------------- the request, in one line
  function request() {
    if (!S.recipe) return 'Pick a recipe to start.';
    const who = S.product ? S.product.name + (S.product.url && !S.product.path ? ` (${S.product.url.replace(/^https?:\/\//, '')})` : '') : '…';
    const p = [];
    if (S.kind === 'release') p.push(`A release film for ${who} ${S.release?.tag || '(the latest tag)'}`);
    else if (S.kind === 'tutorial') p.push(`A tutorial of ${who}${S.task.trim() ? `: ${S.task.trim().split('\n')[0].slice(0, 90)}` : ''}, ${S.duration ? `about ${durLabel(S.duration)}` : 'as long as its story'}`);
    else if (S.kind === 'film') p.push(S.duration ? `A ${durLabel(S.duration)} film of ${who} in chapters` : `A film of ${who} in chapters, as long as its voice`);
    else p.push(S.duration ? `A ${S.duration} s promo loop of ${who}` : `A promo of ${who}, as long as its voice`);
    p.push(S.aspects.join(' plus '));
    if (!FIXED[S.kind]) p.push(S.formats.length ? S.formats.map((f) => fmt(f).label.toLowerCase()).join(', then ') : 'three storyboards on formats of your pick');
    const shown = frameOf(S.frame)?.says;
    if (shown) p.push(`shown ${shown}`);
    if (S.backdrop) p.push(`on my picture ${S.backdrop.name}${S.backdrop.treatment !== 'none' ? ` (${S.backdrop.treatment})` : ''}`);
    else p.push(S.look ? `the ${S.look} look` : 'the look chosen on a sheet of the first real frame');
    if (!S.readBrand && S.accent) p.push(`accent ${S.accent}${S.scheme !== 'analogous' ? ` (${S.scheme})` : ''}`);
    if (typeNow()) p.push(`set in ${typeName()}`);
    const m = S.motion;
    if (m.text) p.push(`headlines that ${textStyle(m.text).label.toLowerCase()}${m.emphasis ? ` with a ${m.emphasis === 'color' ? 'colour' : m.emphasis}` : ''}`);
    if (m.transition) p.push(`${transition(m.transition).label.toLowerCase()} cuts`);
    if (m.pace !== 'measured') p.push(m.pace);
    if (m.shutter !== 360) p.push(`${shutterOpt(m.shutter).label.toLowerCase()} motion blur (${m.shutter}°)`);
    p.push(opt('tone', S.tone).label.toLowerCase());
    if (S.fps !== 60 || S.resolution !== 1080) p.push(`${S.resolution}p${S.fps}`);
    p.push(S.files.map((f) => opt('files', f).label).join(' + '));
    if (S.voice !== 'none') {
      p.push(`told by ${voiceName()}${S.voice === 'model' ? ` (${[toned(S.voiceModel) && S.voiceTone !== 'warm' && opt('voiceTone', S.voiceTone).label.toLowerCase(), S.voiceTempo !== 1 && opt('voiceTempo', S.voiceTempo).label.toLowerCase(), opt('voiceHuman', S.voiceHuman).label.toLowerCase()].filter(Boolean).join(', ')})` : ''}`);
      p.push({ both: 'subtitles in the film and as a file', burned: 'subtitles in the film', file: 'subtitles as a file', none: 'no subtitles' }[S.captions]);
    } else if (S.kind === 'tutorial') p.push('no voice');
    p.push(musicName(true));
    return p.join(', ') + '.';
  }

  /** Who says it, in a few words: a model's voice by its name, a Mac's by its own, or the user's recordings. */
  function voiceName(model, o = S) {
    if (o.voice === 'model') { const x = modelOf(o), m = opt('voiceModel', o.voiceModel).label; return x?.speaker ? `${x.label}${model ? ` (${m})` : ''}` : m; }
    if (S.voice === 'mac') return voiceOf(S.voiceName)?.short || 'this Mac’s voice';
    return S.voice === 'mine' ? 'my own recordings' : 'no voice';
  }
  /** The music, in a few words; `line`: as the request line says it. */
  function musicName(line) {
    if (S.music === 'none') return 'no music';
    if (S.music === 'click') return 'a metronome';
    if (S.music === 'generate') return line ? 'new music made with Gemini' : 'a new track, made with Gemini';
    const tr = S.musicFrom === 'library' ? trackById(S.musicTrack) : null;
    const name = tr ? trackTitle(tr) : S.musicFrom === 'file' && S.musicUpload ? S.musicUpload.name : (S.musicFile || '').trim().split('/').pop();
    return `${line ? 'music: ' : ''}${name || 'a track'}`;
  }

  // ---------------------------------------------------------------- previews: pages, ranges, tiles
  let nonce = 0;
  /** A new query every time: a hash change alone would not reload the page. `gl` is the share of the
   *  frame's pixels a WebGL backdrop is drawn at (fx.js, GL_SHARE): a preview needs what it shows. */
  function pageURL(spec, gl = 1) {
    const hash = spec.hash ? new URLSearchParams(Object.entries(spec.hash).filter(([, v]) => v != null && v !== '')).toString() : '';
    return `/${spec.page}?n=${++nonce}${gl < 1 ? `&gl=${gl}` : ''}${hash ? '#' + hash : ''}`;
  }
  /** The page from url() in a hidden frame, loaded and ready. A page whose script threw has a hoisted
   *  seek() but no window.ready (WebKit, now and then: "Cannot access 'STAGE' before initialization"
   *  on the first seek): it gets one more try, from url() again, since a fresh ?n= is what reloads it,
   *  while it is still wanted() and no newer load has the frame: that navigation is not its to replace. */
  async function loadFrame(frame, url, wanted = () => true) {
    const mine = frame.loads = (frame.loads || 0) + 1;
    for (let tries = 2; ; ) {
      const win = await new Promise((ok, ko) => {
        const to = setTimeout(() => ko(new Error('the page took too long')), 25000);
        frame.onload = () => { clearTimeout(to); ok(frame.contentWindow); };
        frame.src = url();
      });
      try {
        if (typeof win.ready?.then !== 'function') throw new Error('the page did not start');
        await win.ready;
        return win;
      } catch (e) { if (!--tries || frame.loads !== mine || !wanted()) throw e; }
    }
  }
  function range(spec, M) { // [from, to, still] in the page's own seconds
    const dur = M.duration;
    if (spec.chapter && M.chapters) {
      const i = M.chapters.findIndex((c) => c.title === spec.chapter);
      if (i >= 0) {
        const a = M.chapters[i].t, b = M.chapters[i + 1]?.t ?? dur;
        if (spec.around) { // a transition: its frame is the timeline's own half-way checkpoint
          const cut = (M.checkpoints || []).filter((c) => c.label.includes('→')).sort((x, y) => Math.abs(x.t - a) - Math.abs(y.t - a))[0];
          return [Math.max(0, a + spec.around[0]), Math.min(dur, a + spec.around[1]), cut ? cut.t : a];
        }
        const cp = (M.checkpoints || []).find((c) => c.t > a && c.t < b && /settled$/.test(c.label));
        return [a, b, spec.thumb ?? (cp ? cp.t : (a + b) / 2)];
      }
    }
    const from = spec.from ?? 0, to = Math.min(spec.to ?? dur, dur);
    return [from, to, spec.thumb ?? M.thumb ?? from + (to - from) * 0.45];
  }

  // tiles: one frame each, taken in turn in the hidden frame; a tile no longer on screen is skipped
  const frames = new Map(), queue = [];
  let working = false;
  function thumbInto(el, spec, width = 400) {
    const key = JSON.stringify([spec.page, spec.hash, spec.chapter, spec.around, spec.thumb, width]);
    el.classList.add('wait');
    const put = (url) => { el.style.backgroundImage = `url(${url})`; el.classList.remove('wait'); };
    if (frames.has(key)) return put(frames.get(key));
    queue.push({ key, el, spec, width, put });
    pump();
  }
  async function pump() {
    if (working) return;
    working = true;
    await new Promise((r) => setTimeout(r, 0)); // a tile is queued before its card is on the page
    const frame = $('#renderer');
    while (queue.length) {
      const job = queue.shift();
      if (!job.el.isConnected) continue;
      if (frames.has(job.key)) { job.put(frames.get(job.key)); continue; }
      try {
        const win = await loadFrame(frame, () => pageURL(job.spec, 0.25), () => job.el.isConnected); // a tile is a few hundred pixels wide
        const M = win.PROMO_META, t = range(job.spec, M)[2];
        win.seek(t);
        const c = win.document.querySelector('canvas');
        const out = document.createElement('canvas');
        out.width = job.width; out.height = Math.round(job.width * c.height / c.width);
        const g = out.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.drawImage(c, 0, 0, out.width, out.height);
        const url = URL.createObjectURL(await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.85))); // a short URL, kept for the session: a data URL was 30 KB of text in a style at every redraw
        frames.set(job.key, url);
        if (job.el.isConnected) job.put(url);
      } catch (e) { job.el.classList.remove('wait'); job.el.classList.add('nopreview'); console.warn('tile', e); }
    }
    frame.src = 'about:blank'; // let its WebGL contexts go
    working = false;
  }

  // ---------------------------------------------------------------- the viewer
  // Two hidden frames take turns: the next preview loads in the one not showing, then cross-fades in.
  // Each is painted into an accumulation canvas of the viewer's size (the mean of its subframes when
  // Motion blur is on), and the screen is those canvases laid over each other.
  //   live.want    the preview asked for last, and the only one allowed to arrive: a hover still loading
  //                when the step asked for its own again used to land a moment later, over it
  //   live.base    what the step itself shows: where the viewer returns when the pointer leaves a tile
  //   live.mirror  the tile under the pointer: it plays the viewer's frames while they are its own
  const screen = $('#screen'), sg = screen.getContext('2d'), glow = $('#glow').getContext('2d');
  const scrubEl = $('#scrub'), fillEl = $('#scrub-fill'), knobEl = $('#knob'), timeEl = $('#time'), marksEl = $('#marks');
  const live = { gen: 0, cur: null, next: null, want: null, base: null, mirror: null, playing: true, pausedAt: 0, drag: null, theatre: false, blur: store.get('studio.blur', false), last: 0, n: 0, W: 1920, H: 1080 };
  const accOf = () => { const c = document.createElement('canvas'); c.width = screen.width; c.height = screen.height; return c; };
  const mod = (x, m) => ((x % m) + m) % m;
  const spanOf = (L) => Math.max(0.1, L.to - L.from);
  let hoverTimer = 0, revertTimer = 0, hovering = false, aboutBase = null;
  function hover(spec, el) {
    clearTimeout(hoverTimer); clearTimeout(revertTimer);
    hoverTimer = setTimeout(() => {
      if (el && !el.isConnected) return;
      if (live.mirror && live.mirror.el !== el) live.mirror.c?.remove();
      live.mirror = el ? { key: JSON.stringify(spec), el, c: null } : null;
      showLive(spec, true);
    }, 220);
  }
  /** The pointer left a tile. Unless it lands on another within a moment, the viewer and the note
   *  beside it go back to the step's own: a hover is a look, not a choice. */
  function unhover(el) {
    clearTimeout(hoverTimer); clearTimeout(revertTimer);
    if (live.mirror && live.mirror.el === el) { live.mirror.c?.remove(); live.mirror = null; }
    revertTimer = setTimeout(() => { if (live.base) showLive(live.base, true); if (aboutBase) about(...aboutBase); }, 260);
  }
  async function showLive(spec, fromHover = false) {
    if (!fromHover) { clearTimeout(hoverTimer); clearTimeout(revertTimer); live.base = spec; }
    if (!spec) return;
    const key = JSON.stringify(spec);
    if (key === live.want) return; // on screen already, or on its way
    live.want = key;
    const my = ++live.gen, viewer = $('#viewer');
    viewer.classList.remove('error');
    if (live.next) { // one still fading in: kept if it is most of the way there, dropped if it has barely begun
      if (live.next.instant || performance.now() - live.next.fade0 >= 140) live.cur = live.next;
      live.next = null;
    }
    if (live.cur && live.cur.key === key) { viewer.classList.remove('busy'); return; } // back to what is showing: what was loading is not wanted any more
    const frame = live.cur && live.cur.frame === $('#liveA') ? $('#liveB') : $('#liveA');
    viewer.classList.add('busy');
    try {
      const win = await loadFrame(frame, () => pageURL(spec, glShare()), () => my === live.gen);
      if (my !== live.gen) return;
      const M = win.PROMO_META, [from, to, still] = range(spec, M);
      const resized = M.width !== live.W || M.height !== live.H;
      if (resized) sizeFrame(M.width, M.height);
      const now = performance.now();
      // Paused, a new preview shows its still, the moment worth looking at. It used to be given a start
      // later than the pause, so it showed a time before its own range, and the clock read -1.7 s.
      const t0 = live.playing ? now : live.pausedAt - (clamp(still, from, to - 0.001) - from) * 1000;
      live.next = { frame, win, canvas: win.document.querySelector('canvas'), from, to, t0, key, fade0: now, acc: accOf(), instant: resized || !live.cur, seams: (M.seams || []).map(([a, b]) => [a - from, b - from]) };
      viewer.classList.remove('busy');
    } catch (e) {
      if (my === live.gen) { live.want = null; viewer.classList.remove('busy'); viewer.classList.add('error'); $('#failed').textContent = `The preview did not load: ${e.message}`; }
    }
  }
  function sizeFrame(W, H) {
    live.W = W; live.H = H;
    const box = $('#viewer').clientWidth || 560;
    const maxH = live.theatre ? Math.max(260, innerHeight - 330) : Math.max(220, Math.min(560, innerHeight - 360));
    const s = Math.min(box / W, maxH / H), cw = Math.round(W * s), ch = Math.round(H * s), dpr = Math.min(2, devicePixelRatio || 1);
    const fr = $('#frame'); fr.style.width = `${cw}px`; fr.style.height = `${ch}px`;
    $('.stage').style.setProperty('--frame-h', `${ch}px`); // the glow is the picture's light, not the bar's
    screen.width = Math.round(cw * dpr); screen.height = Math.round(ch * dpr);
    for (const L of [live.cur, live.next]) if (L) L.acc = accOf();
  }
  addEventListener('resize', debounce(() => {
    sizeFrame(live.W, live.H);
    reflowDeck();
  }, 150));
  const nowT = (L, now) => L.from + mod(((live.playing ? now : live.pausedAt) - L.t0) / 1000, spanOf(L));
  // The pace the viewer keeps. A frame used to be painted every 32 ms whatever it cost: a 60 fps film
  // previewed at 30 looked stepped, and a frame that cost more (a WebGL look in WebKit took 50 ms, and
  // five times that with Motion blur) dropped to a stutter. Now each painted frame is timed: under
  // about 8 ms it plays at 60, else at 30; Motion blur takes as many moments (two to five) as fit in
  // the frame's time. A paused preview is painted again only when something in it changed.
  const pace = { frame: 6, seek: 2, fast: true };
  /** The share of the film's pixels a WebGL backdrop is drawn at for the viewer: about its own. */
  const glShare = () => { const need = Math.max(screen.width, screen.height) / 1920; return [0.5, 0.75].find((q) => q >= need * 0.85) || 1; };
  // into L.acc: one moment, or the mean of up to five across the share of a 60 fps frame the shutter
  // keeps open, the way render.mjs spreads its sixteen
  function paint(L, now) {
    const g = L.acc.getContext('2d'), t = nowT(L, now), open = S.motion.shutter / 360;
    const k = live.blur ? Math.max(2, Math.min(5, Math.floor((pace.fast ? 14 : 28) / Math.max(0.5, pace.seek)))) : 1;
    g.imageSmoothingQuality = 'high';
    const t0 = performance.now();
    for (let i = 0; i < k; i++) {
      // over a frame of the film's own rate, as the render's: a 30 fps film gathers twice the time a 60 fps one does
      // (it was always a sixtieth of a second, so a 30 fps film's blur showed at half its length)
      try { L.win.seek(t + i * open / ((S.fps || 60) * k)); } catch { return t; }
      g.globalAlpha = 1 / (i + 1); // a running mean: the i-th moment weighs 1/(i+1) of what is there
      g.drawImage(L.canvas, 0, 0, L.acc.width, L.acc.height);
    }
    g.globalAlpha = 1;
    pace.seek = pace.seek * 0.8 + ((performance.now() - t0) / k) * 0.2;
    return t;
  }
  function tick(now) {
    requestAnimationFrame(tick);
    if (!live.cur && !live.next) return;
    if (now - live.last < (pace.fast ? 1000 / 60 : 1000 / 30) - 4) return; // 4 ms of slack: a 120 Hz display's ticks land on either side
    // paused, settled, and nothing asked of it: the same frame again would only warm the Mac
    const still = !live.playing && !live.next && `${live.cur.key}|${live.pausedAt - live.cur.t0}|${live.blur}|${S.motion.shutter}|${S.fps}|${screen.width}`;
    if (still && still === live.painted && !live.mirror) return;
    live.last = now; live.painted = still;
    const t0 = performance.now();
    let t = 0;
    if (live.next) {
      const N = live.next, p = N.instant ? 1 : clamp((now - N.fade0) / 280);
      if (live.cur && p < 1) paint(live.cur, now);
      t = paint(N, now);
      sg.globalAlpha = 1; if (live.cur && p < 1) sg.drawImage(live.cur.acc, 0, 0);
      sg.globalAlpha = p * p * (3 - 2 * p); sg.drawImage(N.acc, 0, 0); sg.globalAlpha = 1;
      if (p >= 1) { live.cur = N; live.next = null; }
      live.shown = N;
    } else {
      t = paint(live.cur, now);
      sg.drawImage(live.cur.acc, 0, 0);
      live.shown = live.cur;
    }
    pace.frame = pace.frame * 0.85 + (performance.now() - t0) * 0.15;
    pace.fast = pace.fast ? pace.frame < 11 : pace.frame < 7; // apart, so it does not flip every other frame
    const L = live.shown, span = spanOf(L), f = clamp((t - L.from) / span), pc = `${(f * 100).toFixed(2)}%`;
    fillEl.style.width = pc; knobEl.style.left = pc;
    timeEl.textContent = `${(t - L.from).toFixed(1)} / ${span.toFixed(1)} s`;
    const pct = Math.round(f * 100);
    if (pct !== live.pct) { // the position, as a number and in words: where it is, of how long
      live.pct = pct; scrubEl.setAttribute('aria-valuenow', String(pct));
      scrubEl.setAttribute('aria-valuetext', `${(t - L.from).toFixed(1)} of ${span.toFixed(1)} seconds`);
    }
    if (live.marked !== L) { // where this preview's transitions are, on the scrubber
      live.marked = L;
      marksEl.replaceChildren(...L.seams.map(([a, b]) => h('i', { style: { left: `${(a / span) * 100}%`, width: `${((b - a) / span) * 100}%` } })));
      live.pct = -1; // another preview: its position is said afresh
    }
    if (live.n++ % 3 === 0) glow.drawImage(screen, 0, 0, 32, 18); // the room takes the film's light
    const m = live.mirror; // the tile under the pointer plays what the viewer plays
    if (m && m.key === L.key) {
      const th = m.el.isConnected && m.el.querySelector('.thumb');
      if (!th) live.mirror = null;
      else {
        if (!m.c) {
          const dpr = Math.min(2, devicePixelRatio || 1), c = m.c = h('canvas', { class: 'live' });
          c.width = Math.round(th.clientWidth * dpr); c.height = Math.round(th.clientHeight * dpr);
          th.append(c); requestAnimationFrame(() => c.classList.add('on'));
        }
        // cover-fit, as the tile's own still is: a portrait preview in a 16:9 tile is cropped, not squeezed
        const c = m.c, ar = c.width / c.height, sr = screen.width / screen.height;
        const sw = sr > ar ? screen.height * ar : screen.width, sh = sr > ar ? screen.height : screen.width / ar;
        c.getContext('2d').drawImage(screen, (screen.width - sw) / 2, (screen.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      }
    }
  }
  requestAnimationFrame(tick);
  const ICON = {
    pause: '<svg viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1"/><rect x="7" y="1.5" width="3" height="9" rx="1"/></svg>',
    play: '<svg viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z"/></svg>',
    grow: '<svg viewBox="0 0 12 12"><path d="M7 1h4v4H9.6V3.4L7.5 5.5l-1-1L8.6 2.4H7zM5 11H1V7h1.4v1.6l2.1-2.1 1 1-2.1 2.1H5z"/></svg>',
    shrink: '<svg viewBox="0 0 12 12"><path d="M10.5 5.5h-4v-4h1.4v1.6L10 1l1 1-2.1 2.1h1.6zM1.5 6.5h4v4H4.1V8.9L2 11l-1-1 2.1-2.1H1.5z"/></svg>',
  };
  function setPlaying(p) {
    if (p === live.playing) return;
    const now = performance.now();
    for (const L of [live.cur, live.next]) if (L && p) L.t0 += now - live.pausedAt;
    if (!p) live.pausedAt = now;
    live.playing = p;
    const b = $('#play'), what = p ? 'Pause the preview' : 'Play the preview';
    b.innerHTML = p ? ICON.pause : ICON.play; b.title = `${what} (Space)`; b.setAttribute('aria-label', what);
  }
  // the scrubber: press to jump, drag to scrub, and the preview carries on from there if it was playing
  /** Every layer to the same share of its own range. */
  function seekTo(f) {
    const ref = live.playing ? performance.now() : live.pausedAt;
    for (const X of [live.cur, live.next]) if (X) X.t0 = ref - clamp(f, 0, 0.9995) * spanOf(X) * 1000;
  }
  const shareAt = (e) => { const r = scrubEl.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  scrubEl.addEventListener('pointerdown', (e) => {
    if (!live.cur && !live.next) return;
    scrubEl.setPointerCapture(e.pointerId); scrubEl.classList.add('drag');
    live.drag = { was: live.playing }; setPlaying(false); seekTo(shareAt(e));
  });
  scrubEl.addEventListener('pointermove', (e) => { if (live.drag) seekTo(shareAt(e)); });
  const dropScrub = () => { if (!live.drag) return; const { was } = live.drag; live.drag = null; scrubEl.classList.remove('drag'); if (was) setPlaying(true); };
  scrubEl.addEventListener('pointerup', dropScrub); scrubEl.addEventListener('pointercancel', dropScrub);
  /** A step along the preview from the keyboard, in seconds. It pauses, so the frame can be looked at. */
  function nudge(dt) {
    const L = live.next || live.cur;
    if (!L) return;
    setPlaying(false);
    seekTo((mod((live.pausedAt - L.t0) / 1000, spanOf(L)) + dt) / spanOf(L));
  }
  // Motion blur: what it is for and whether it is on, said on the button and, when it is pressed, beside the viewer.
  // (It read "Motion blur" either way, white when on, and a frame at rest looks the same with it: it seemed to do nothing.)
  const blurBtn = $('#blur');
  const showBlur = () => {
    blurBtn.setAttribute('aria-pressed', String(live.blur));
    $('#blur-state').textContent = live.blur ? 'on' : 'off';
    blurBtn.title = `${live.blur ? 'On: each frame is the mean of several moments, as the render blends its sixteen' : 'Off: every frame is one sharp moment'}. It shows where something moves fast: a cut, a headline arriving (B)`;
  };
  blurBtn.addEventListener('click', () => {
    live.blur = !live.blur; store.set('studio.blur', live.blur); showBlur();
    aside('Motion blur', live.blur
      ? `On. Each frame is now the mean of several moments across the shutter (${S.motion.shutter}° of a frame at ${S.fps} fps), the way the render blends its sixteen: what moves fast leaves a trail, as in a camera.`
      : 'Off. Every frame is one sharp moment: quicker to draw, and crisper than the film will be.',
    h('p', { class: 'note' }, 'Watch a cut, or a headline arriving: a frame at rest looks the same either way. The render always blurs; this only sets what the preview shows.'));
  });
  showBlur();
  // the larger preview: the choices step aside and the film takes the room; F or Esc brings them back
  const theatreBtn = $('#theatre');
  function setTheatre(on) {
    live.theatre = on; $('#body').classList.toggle('theatre', on);
    const what = on ? 'Back to the choices' : 'A larger preview';
    theatreBtn.innerHTML = on ? ICON.shrink : ICON.grow; theatreBtn.title = `${what} (F${on ? ', Esc' : ''})`;
    theatreBtn.setAttribute('aria-label', what); theatreBtn.setAttribute('aria-pressed', String(on));
    sizeFrame(live.W, live.H);
    if (!on) reflowDeck();
  }
  theatreBtn.innerHTML = ICON.grow;
  theatreBtn.addEventListener('click', () => setTheatre(!live.theatre));

  /** The stage, with every choice so far, and the overrides a tile or a hover needs. */
  function stageSpec(o = {}) {
    const bd = o.backdrop !== undefined ? o.backdrop : S.backdrop;
    const look = o.look ?? (bd ? 'photo' : S.look || 'dots');
    const [w, h] = aspectDims(o.aspect || (S.aspects.includes(viewAspect) ? viewAspect : null));
    const L = SCHEMA.looks.find((l) => l.id === look);
    const mode = o.mode ?? (S.kind === 'tutorial' ? 'tutorial' : undefined); // a tutorial's own stage: told, with its subtitles
    // the stand-in is in the frame chosen (a device, a window, the UI alone), or the one a tile offers; with none
    // chosen it takes the shape of the first format: a terminal, words alone, else a window (stage.html, ui=)
    const hash = { mode, on: o.on, ui: o.ui ?? frameOf(o.frame !== undefined ? o.frame : S.frame)?.stage ?? fmt(S.formats[0])?.stage, look: look === 'photo' ? null : look, tone: L?.tone, accent: S.accent ? S.accent.slice(1) : null, scheme: o.scheme ?? S.scheme, w, h };
    if (look === 'photo' && bd) Object.assign(hash, { image: `/images/full/${bd.image}.jpg`, blur: bd.blur, treat: bd.treatment, drift: bd.drift ? 1 : 0 });
    const ty = o.type !== undefined ? o.type : typeNow();
    if (ty && ty.display) Object.assign(hash, { display: ty.display.family, dsrc: ty.display.source, dw: ty.display.weight, text: ty.text?.family, tsrc: ty.text?.source });
    Object.assign(hash, { style: o.style ?? S.motion.text ?? 'rise', emph: o.emph !== undefined ? o.emph : S.motion.emphasis, pace: paceFactor(o.pace ?? S.motion.pace), trans: o.trans });
    const lang = (S.voice === 'model' ? 'en' : voiceOf(S.voiceName)?.lang || SYSLANG || 'en').slice(0, 2), cap = S.captions === 'none' || S.captions === 'file' ? 'none' : 'plate';
    if (mode === 'tutorial') Object.assign(hash, { lang, cap });
    else if (!mode && S.voice !== 'none') Object.assign(hash, { say: 1, lang, cap }); // a film that speaks: its lines written under the stage
    return { page: 'studio/stage.html', hash, from: 0, to: o.mode === 'text' || o.mode === 'trans' ? undefined : 8 }; // a headline's or a cut's own length (the page's)
  }
  let viewAspect = null; // the aspect last clicked in Output: the previews show it while it is chosen
  /** A template's own demo (a recipe's, a format's) in the choices made so far: the product's colour and,
   *  once one is picked, the look. They used to play in the templates' stand-in violet whatever had been
   *  chosen, so a format seen after the colour and the look said nothing of the film it would make. */
  const ours = (spec) => spec && { ...spec, hash: { ...(spec.hash || {}), accent: S.accent ? S.accent.slice(1) : null, scheme: S.accent ? S.scheme : null, ...(S.look && !S.backdrop ? { look: S.look } : {}) } };

  // ---------------------------------------------------------------- shared bits of UI
  function card({ spec, tall, label, sub, chips = [], sel, badge, off, onclick, onhover, none, body, i }) {
    let th = body;
    if (!th) {
      th = h('div', { class: 'thumb' + (tall ? ` ${tall}` : '') });
      if (spec) thumbInto(th, spec, tall ? 260 : 400); else th.append(h('div', { class: 'none' }, none || 'No demo yet'));
    }
    return h('button', {
      class: `card${sel ? ' sel' : ''}${off ? ' off' : ''}`, 'aria-pressed': String(!!sel), style: i != null ? { '--i': i } : null, onclick,
      // what a hover says beside the viewer is a look, not the step's own note: about() keeps them apart
      onmouseenter: onhover && ((e) => { hovering = true; try { onhover(e.currentTarget); } finally { hovering = false; } }),
      onmouseleave: onhover && ((e) => unhover(e.currentTarget)),
    },
      th, badge ? h('span', { class: 'badge' }, badge) : null,
      h('div', { class: 'txt' }, h('div', { class: 'lbl' }, label), sub ? h('div', { class: 'sub' }, sub) : null,
        chips.length ? h('div', { class: 'chips' }, chips.map((c) => h('span', { class: 'chip' + (c.acc ? ' acc' : '') + (c.isNew ? ' new' : '') }, c.t || c))) : null));
  }
  function option({ title, text, sel, onclick }) {
    return h('button', { class: `option${sel ? ' sel' : ''}`, 'aria-pressed': String(!!sel), onclick }, h('i', { class: 'dot' }), h('div', null, h('b', null, title), h('span', null, text)));
  }
  function seg(options, value, onpick, small) { // a segmented control: [{ value, label, hint }]
    return h('div', { class: 'seg' }, options.map((o) => h('button', { class: (o.value === value ? 'sel' : '') + (small ? ' sm' : ''), 'aria-pressed': String(o.value === value), onclick: () => onpick(o.value) }, h('span', null, o.label), o.hint && !small ? h('small', null, o.hint) : null)));
  }
  function about(title, ...paras) {
    if (!hovering) aboutBase = [title, ...paras]; // the step's own note: what unhover() puts back
    $('#about').replaceChildren(h('h3', null, title), ...paras.filter(Boolean).map((p) => (p.nodeType ? p : h('p', null, p))));
  }
  /** A word beside the viewer that is not the step's own note (what a button just did): the step's comes back after
   *  a while, or at the next hover or choice. */
  let asideTimer = 0; // its own: on the hover's timer, a button pressed just as the pointer left a tile cancelled the viewer's way back to the choice
  function aside(title, ...paras) {
    const was = hovering; hovering = true;
    try { about(title, ...paras); } finally { hovering = was; }
    const mine = $('#about h3');
    clearTimeout(asideTimer); asideTimer = setTimeout(() => { if (aboutBase && $('#about h3') === mine) about(...aboutBase); }, 9000); // unless another note took its place
  }
  const tallClass = () => ({ '1:1': 'sq', '4:5': 'p45', '9:16': 'p916' }[S.aspects.includes(viewAspect) ? viewAspect : S.aspects[0]] || '');
  const section = (text, extra) => h('div', { class: 'section' }, text, extra || null);
  // A step's parts as a deck of cards (as Mac apps' settings decks have them): a card a part of the step, saying at a glance
  // what is chosen in it, its value large and the rest under it; one open at a time, its controls in a panel right
  // under its row, card and panel one shape. All closed, the step is an overview of its choices, without scrolling.
  // A deck holds as long as its cards stay put, so a step's cards are the same whatever is chosen in them: a part
  // that does not apply keeps its place and says so (`na`), it never comes and goes (the voice's did, and a card
  // appeared or went under the pointer). FOLD[step] remembers the open one: the deck's first on arrival (or the one
  // it names), then the one left open, and a click inside it keeps it open; '' is every card closed.
  // A panel starts with its head (.dphead): the rounded top it shares with its card, holding what the card keeps in
  // reach over a long list (`head`: the list's title, its filter, the headlines' emphasis). Under one row of cards
  // (.stick) the row stays at the top of the pane and the head right under it, so at any scroll the card, its bridge
  // and the top of its panel are one shape, and the list slides under the head. Before, only the row stayed: tiles
  // showed in the gap under it and the open card's bridge hung over them.
  const FOLD = {};
  let unfold = false; // the next panel drawn unfolds: a click opened it, not a render
  let SAYS = []; // what writes each card's line again: refresh() calls them, so a card follows a field as it is typed in
  /** A card of a step's deck. summary: 'value · the rest', the line a closed card shows, or what returns it;
   *  more: { na: the part holds no choice as things stand, raw: its value is shown as written (a file name),
   *  swatch: () => a colour to show beside its title, head: (el) => what its panel keeps at its top }. */
  const deckCard = (id, title, summary, fill, more) => ({ id, title, summary, fill, ...more });
  /** Bring el into the pane's view, clear of the hear-it strip stuck to its top: as tall as its notes make it. */
  function inSight(el, block) {
    const pane = $('#pane');
    pane.style.setProperty('--stuck', `${pane.querySelector('.audition')?.offsetHeight || 0}px`);
    el?.scrollIntoView({ block });
  }
  /** Open a card, or close it, and keep it in view: what closed above it may have moved it out of view. A row that
   *  sticks is in view at any scroll, so the panel it opens is brought back to its start: it opened where the last
   *  one had been scrolled to, its first choices under the row. (The focus needs nothing: a redraw finds the control
   *  again by what it is.) */
  function toggleFold(step, id, open) {
    FOLD[step] = open ? '' : id; unfold = !open;
    render();
    const pane = $('#pane'), card = pane.querySelector(`[data-fold="${id}"]`), panel = !open && pane.querySelector('.dpanel');
    inSight(card, 'nearest');
    if (panel) { // where the panel starts as laid out, not as it unfolds
      const d = card.parentElement, top = d.getBoundingClientRect().top + panel.offsetTop - d.offsetTop;
      const under = card.getBoundingClientRect().bottom + parseFloat(getComputedStyle(d).rowGap || 0);
      if (top < under - 1) pane.scrollTop -= under - top;
    }
  }
  const deckCols = (n) => Math.min(n, ($('#pane')?.clientWidth || 640) < 520 || n === 4 ? 2 : 3);
  /** A deck takes its columns from the pane's width: after a resize, or the larger preview giving the pane back. */
  function reflowDeck() {
    const p = $('#pane'), d = p?.querySelector('.deck');
    if (d && p.clientWidth && +d.style.getPropertyValue('--cols') !== deckCols(d.querySelectorAll('.dcard').length)) render();
  }
  // What a row of cards that sticks needs kept true, by two observers made once and pointed at each deck drawn,
  // so nothing is measured at a keystroke or a scroll. --row, the row's height: where the head of its panel stops
  // under it (a card is as tall as its lines make it, and they change as a field is typed in). And .under, the
  // row stuck and the list going under the head, which then wears an edge: a mark at the deck's top (.dmark) has
  // left the pane by its top.
  const rowWatch = new ResizeObserver((es) => { const c = es[es.length - 1].target; c.parentElement?.style.setProperty('--row', `${c.offsetHeight}px`); });
  const stuckWatch = new IntersectionObserver((es) => { const e = es[es.length - 1]; e.target.parentElement?.classList.toggle('under', !e.isIntersecting && !!e.rootBounds && e.boundingClientRect.top < e.rootBounds.top); }, { root: $('#pane') });
  function watchDeck() {
    rowWatch.disconnect(); stuckWatch.disconnect();
    const d = $('#pane .deck.stick');
    if (d) { rowWatch.observe(d.querySelector('.dcard')); stuckWatch.observe(d.querySelector('.dmark')); }
  }
  function deck(step, cards, first = cards[0].id) {
    if (FOLD[step] == null || (FOLD[step] && !cards.some((c) => c.id === FOLD[step]))) FOLD[step] = first; // on arrival, or its card gone (a release's version)
    const n = cards.length, cols = deckCols(n), at = cards.findIndex((c) => c.id === FOLD[step]);
    const rowEnd = at < 0 ? -1 : Math.min(n, (Math.floor(at / cols) + 1) * cols) - 1, col = at % cols;
    const panel = at < 0 ? null : h('section', { class: ['dpanel', unfold && 'unfold', col === 0 && 'first', col === cols - 1 && 'last'].filter(Boolean).join(' '), id: `fold-${step}-${cards[at].id}`, style: `--col:${col}`, 'aria-label': cards[at].title });
    if (panel) {
      const head = h('div', { class: 'dphead-in' });
      cards[at].head?.(head);
      panel.append(h('div', { class: `dphead${head.childNodes.length ? '' : ' bare'}` }, head));
      cards[at].fill(panel); unfold = false;
    }
    const stick = n <= cols; // one row of cards: it stays at the top of the pane while a long panel (the looks, the cuts) scrolls under it
    return h('div', { class: `deck${panel ? ' has-open' : ''}${stick ? ' stick' : ''}`, style: `--cols:${cols}` }, stick ? h('i', { class: 'dmark', 'aria-hidden': 'true' }) : null, cards.flatMap((c, i) => {
      const open = i === at, fig = h('span', { class: 'dfig' }), cap = h('span', { class: 'dcap' }), dot = c.swatch ? h('i', { class: 'dswatch', 'aria-hidden': 'true' }) : null;
      const say = () => {
        const [value, ...rest] = String(typeof c.summary === 'function' ? c.summary() : c.summary).split(' · ');
        fig.textContent = value; cap.textContent = rest.join(' · ');
        if (dot) dot.style.background = c.swatch();
      };
      say(); SAYS.push(say);
      const card = h('button', { class: `dcard${open ? ' open' : ''}${c.na ? ' na' : ''}${c.raw ? ' raw' : ''}`, style: stick ? `grid-column:${i + 1}` : null, 'data-fold': c.id, 'aria-expanded': String(open), 'aria-controls': open ? panel.id : null, onclick: () => toggleFold(step, c.id, open) },
        h('span', { class: 'dhead' }, dot, h('span', { class: 'dtitle' }, c.title), h('span', { class: 'chev', 'aria-hidden': 'true' })), fig, cap);
      return i === rowEnd ? [card, panel] : [card];
    }));
  }

  // ---------------------------------------------------------------- step 1: the recipe
  // TOUCHED: the choices made by hand ('duration', 'formats', 'motion.text', …). A recipe fills the rest.
  const TOUCHED = new Set();
  const setMotion = (k, v) => { S.motion = { ...S.motion, [k]: v }; TOUCHED.add(`motion.${k}`); };
  function applyRecipe(r) {
    // The recipe already chosen, clicked again (back at the first step, to look at it): nothing changes.
    // It used to start over, and a length, three formats, a motion and the notes were gone without a word.
    if (S.recipe === r.id) return;
    const was = S.kind, mine = [...TOUCHED].filter((k) => k !== 'kind').map((k) => [k, k.startsWith('motion.') ? S.motion[k.slice(7)] : S[k]]);
    const keep = { product: S.product, name: S.name, nameTouched: S.nameTouched, accent: S.accent, accentFrom: S.accentFrom, readBrand: S.readBrand, brandAccent: S.brandAccent, ownAccent: S.ownAccent, release: S.release, backdrop: S.backdrop, type: S.type, look: S.look, sampleText: S.sampleText };
    const sound = { musicFrom: S.musicFrom, musicTrack: S.musicTrack, musicUpload: S.musicUpload, musicPrompt: S.musicPrompt, musicPromptTouched: S.musicPromptTouched }; // the music's own, kept with it when it was chosen
    defaults();
    const set = recipeSet(r);
    const motion = set.motion; delete set.motion;
    Object.assign(S, keep, set, { recipe: r.id });
    if (motion) S.motion = { ...S.motion, ...motion };
    // another recipe: what was set by hand stays, where it still fits the film this one makes
    TOUCHED.delete('kind');
    for (const [k, v] of mine) {
      if (k === 'duration') { if (keepsLength(S.kind, v, was)) S.duration = v; else TOUCHED.delete(k); }
      // a release's or a tutorial's one format is the recipe's, not a choice: it must not come back as a hand-made one in the next promo
      else if (k === 'formats') { if (!FIXED[S.kind]) S.formats = v.filter((f) => f !== 'whatsnew'); else TOUCHED.delete(k); }
      else if (k.startsWith('motion.')) S.motion = { ...S.motion, [k.slice(7)]: v };
      else S[k] = v;
    }
    if (TOUCHED.has('music')) Object.assign(S, sound);
    modelVoice(); // a voice kept from the last recipe is this film's kind's
    if (!S.duration && (S.kind === 'promo' || S.kind === 'film') && S.voice === 'none') S.duration = defaultDuration(S.kind); // "as long as its voice" kept from a film that spoke, in one that does not
    if (S.kind === 'release' && !S.release?.tag) S.release = { tag: S.product?.tag || null };
    autoName();
  }
  /** A remembered brief, taken as far as today's schema still has what it names: a transition, a look
   *  or a format retired since is left to Claude instead of breaking the wizard (the request line read
   *  its label, and "Like last time" threw). */
  function applyBrief(b) {
    defaults();
    TOUCHED.clear(); // a brief is a starting point, like a recipe: nothing in it was set by hand here
    const has = (list, v, k = 'id') => list.some((x) => x[k] === v);
    for (const k of ['kind', 'tone', 'fps', 'resolution', 'music']) if (has(F[k].options, b[k], 'value')) S[k] = b[k];
    const durs = F.duration.byKind[S.kind];
    S.duration = durs.includes(b.duration) || inRange(S.kind, b.duration) ? b.duration : durs.includes(S.duration) ? S.duration : durs[Math.min(2, durs.length - 1)]; // one of its kind's, or one typed, kept as typed
    for (const k of ['aspects', 'files']) {
      const v = F[k].options.map((o) => o.value).filter((x) => (Array.isArray(b[k]) ? b[k] : []).includes(x));
      if (v.length >= (F[k].min || 1)) S[k] = v;
    }
    for (const k of ['reference', 'notes']) if (typeof b[k] === 'string') S[k] = b[k];
    // the music: a library track is named again by its path (its id lasts one Studio run); a new one keeps its prompt
    const was = b.musicSource?.path || (typeof b.musicFile === 'string' ? b.musicFile : '');
    S.musicFrom = b.music === 'track' ? 'file' : has(F.music.options, b.music, 'value') ? b.music : 'none';
    S.musicFile = b.music === 'track' ? was || '' : '';
    if (typeof b.musicPrompt === 'string' && b.musicPrompt) { S.musicPrompt = b.musicPrompt; S.musicPromptTouched = true; }
    if (b.musicMix) for (const [k, v] of [['musicUnder', b.musicMix.under], ['musicLift', b.musicMix.lift]]) if (has(F[k].options, v, 'value')) S[k] = v;
    S.recipe = has(SCHEMA.recipes, b.recipe) ? b.recipe : 'custom';
    S.formats = FIXED[S.kind] ? [FIXED[S.kind]] : (Array.isArray(b.formats) ? b.formats : []).filter((f) => f !== 'whatsnew' && has(SCHEMA.formats, f)).slice(0, 3);
    S.frame = has(SCHEMA.frames, b.frame) ? b.frame : null; // a frame retired since, or a brief from before there were any: each format's own
    const tu = b.tutorial || {}; // what a tutorial's brief says of its lesson
    if (typeof tu.task === 'string') S.task = tu.task;
    // the voice: any film's (schema 3, b.voice), or a tutorial's of before (schema 2, in b.tutorial)
    const vo = b.voice && typeof b.voice === 'object' ? b.voice : tu.voice ? { kind: tu.voice, model: tu.voiceModel, tempo: tu.tempo, name: tu.voiceName, rate: tu.rate, captions: tu.captions } : { kind: 'none' };
    for (const [k, v] of [['voice', vo.kind], ['voiceModel', vo.model], ['voiceSpeaker', vo.speaker], ['voiceTone', vo.tone], ['voiceTempo', vo.tempo], ['voiceHuman', vo.human], ['voiceRate', vo.rate], ['captions', vo.captions]]) if (has(F[k].options, v, 'value')) S[k] = v;
    S.voiceName = vo.name || '';
    S.voiceScript = typeof vo.script === 'string' ? vo.script : '';
    S.look = has(SCHEMA.looks, b.look) ? b.look : null; // 'photo' too: a picture's id lasts one Studio run, it is chosen again
    S.scheme = SCHEMA.schemes.includes(b.scheme) ? b.scheme : 'analogous';
    S.product = b.product && b.product.name ? b.product : null; S.name = b.name || ''; S.nameTouched = true;
    siteText = S.product && !S.product.path ? S.product.url || '' : ''; // the website field shows the address the brief is for
    delete FOLD.product; // and its deck opens the card that product is in
    // the colour: the one chosen, or the brand's as the brief has it (its hint); when one was chosen, the source
    // is asked again for the brand's, so the box can still be ticked back to it
    S.readBrand = !b.accent; S.ownAccent = b.accent || null;
    S.brandAccent = !b.accent && b.accentHint ? { hex: b.accentHint, from: b.accentFrom || 'a guess' } : null;
    syncAccent();
    if (b.accent && S.product?.path) loadBrandAccent(S.product.path).then((d) => { if (d && cur === at('product')) render(); }).catch(() => {});
    S.release = b.release || { tag: null };
    const ty = b.type;
    S.type = ty && ty.display && ty.display.family && (!ty.set || typeset(ty.set)) ? { set: ty.set || null, display: ty.display, text: ty.text, mono: ty.mono } : null;
    const m = b.motion || {}, M = SCHEMA.motion;
    S.motion = {
      text: has(M.text, m.text) ? m.text : null, emphasis: m.emphasis && has(M.emphasis, m.emphasis, 'value') ? m.emphasis : null,
      transition: has(M.transitions, m.transition) ? m.transition : null,
      pace: has(M.pace, m.pace, 'value') ? m.pace : 'measured', shutter: has(M.shutter, m.shutter, 'value') ? m.shutter : 360,
    };
    S.backdrop = null;
    motionView = null;
  }
  function stepFilm(pane) {
    const last = CTX.last;
    if (last?.request) pane.append(option({ title: 'Like last time', text: last.request, sel: false, onclick: () => { applyBrief(last); render(); } }));
    pane.append(h('div', { class: 'grid wide' }, SCHEMA.recipes.map((r, i) => { const spec = ours(r.preview); return card({
      spec, label: r.label, sub: r.about, sel: S.recipe === r.id, i,
      chips: recipeChips(r),
      onhover: (el) => hover(spec, el),
      onclick: () => { applyRecipe(r); showLive(ours(r.preview)); render(); }, // the recipe may change the look: its demo again, after
    }); })));
    const r = recipe();
    if (r) { showLive(ours(r.preview)); about(r.label, r.about, `Fills in: ${recipeChips(r).join(' · ')}. Every choice stays open in the steps that follow.`); }
    else {
      showLive(ours(SCHEMA.recipes[0].preview));
      about('Live preview', 'What you see here is the engine itself drawing frames as you watch: the same pages the renderer captures. Motion blur averages five moments a frame, as the render does with sixteen.');
    }
  }
  /** A recipe's settings, a copy, with its voice preset (named by id) spelled out. */
  function recipeSet(r) {
    const { voicePreset, ...set } = JSON.parse(JSON.stringify(r.set));
    return voicePreset ? { ...set, ...preset(voicePreset).set } : set;
  }
  function recipeChips(r) {
    const s = { ...Object.fromEntries(FIELD_KEYS.map((k) => [k, F[k].default])), ...recipeSet(r) };
    const out = [FIXED[s.kind] ? `length ${lengthLabel(s.kind, s.duration)}` : lengthWords(s.kind, s.duration, true)];
    if (s.voice && s.voice !== 'none') out.push('a voice, subtitles');
    out.push(s.aspects.join(' + '));
    if (s.formats?.length && !FIXED[s.kind]) out.push(s.formats.map((f) => fmt(f).label).join(', '));
    out.push(s.files.map((f) => opt('files', f).label).join(' + '));
    return out;
  }

  // ---------------------------------------------------------------- step 2: the product
  function autoName() {
    if (S.nameTouched || !S.product) return;
    const base = slug(S.product.name);
    const tail = { teaser: 'teaser', chapters: 'film', readme: 'readme-gif', tutorial: 'tutorial' }[S.recipe]
      || (S.kind === 'tutorial' ? 'tutorial' : S.kind === 'release' ? `${slug((S.release?.tag || 'release').replace(/^v(?=\d)/, ''))}-whats-new` : S.kind === 'film' ? 'film' : 'promo');
    S.name = `${base}-${tail}`.replace(/-+/g, '-');
  }
  // The brand's colour, as three things kept: S.readBrand (it is read from the brand, the box ticked), S.brandAccent
  // (the colour guessed from the product's source: { hex, from }, null when none was found) and S.ownAccent (the
  // one chosen here). The guess is kept apart from the choice, so ticking the box again puts the previews back on
  // it: a colour once chosen used to overwrite it for good. What everything else reads derives from the three,
  // in syncAccent alone: S.accent, the colour the previews are drawn in (the film's accent when it is chosen
  // here), and S.accentFrom, where it is from.
  const TEMPLATE_ACCENT = '#5B5BF7'; // the templates' own: what the controls show where no colour is known
  const guessOf = (d) => (d.accent ? { hex: d.accent.hex, from: `guessed from ${d.accent.from}` } : null);
  function syncAccent() {
    const read = S.readBrand !== false;
    S.accent = read ? S.brandAccent?.hex || null : S.ownAccent;
    S.accentFrom = read ? S.brandAccent?.from || null : 'chosen in the Studio';
  }
  function setReadBrand(on) {
    S.readBrand = on;
    if (!on) S.ownAccent ||= S.accent || TEMPLATE_ACCENT; // a colour of one's own starts from the one shown
    syncAccent();
  }
  /** What a repository's source says of its brand's colour, asked of the server unless it is `known` already,
   *  taken while that repository is still the product. The product's data, or null: another was chosen meanwhile. */
  async function loadBrandAccent(path, known) {
    const d = known || await api('product?path=' + encodeURIComponent(path));
    if (S.product?.path !== path) return null;
    S.brandAccent = guessOf(d); syncAccent();
    return d;
  }
  /** `known`: what the server said of it already (a repository chosen with the folder picker). */
  async function pickRepo(p, known) {
    if (S.product?.path !== p.path) { S.ownAccent = S.brandAccent = null; setReadBrand(true); } // another product, another brand: its own colour, not the one chosen for the last
    siteText = '';
    S.product = { name: p.name, path: p.path };
    autoName(); render();
    try {
      const d = await loadBrandAccent(p.path, known);
      if (!d) return;
      S.product = { name: d.name, path: d.path, homepage: d.homepage, remote: d.remote, tag: d.tag, kit: d.kit, last: d.last };
      if (S.kind === 'release') S.release = { tag: d.tag };
      autoName(); render();
    } catch (e) { console.warn(e); }
  }
  let siteText = ''; // the website field, as typed
  /** An address typed, as the product takes it: its scheme added when left out, and its host if it is one. Judged on
   *  the parsed host, not on the text: a label of one character is fine (www.x.com, foo.i.ua), a bare word is not (it
   *  is still being typed: "acme" must not become https://acme), and nor is a TLD of one letter ("example.a"). */
  function siteHost(text) {
    const raw = text.trim(), v = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let host = null;
    try { const u = new URL(v), n = u.hostname; if (!/\s/.test(v) && (/^([a-z0-9-]+\.)+[a-z][a-z0-9-]+$/i.test(n) || /^\d{1,3}(\.\d{1,3}){3}$/.test(n) || n === 'localhost')) host = n.replace(/^www\./, ''); } catch {}
    return { host, v };
  }
  /** What the website field says under it: the draft's hint while it is not an address yet, else whose film it is. */
  const siteHint = () => (siteText.trim().length > 3 && !siteHost(siteText).host ? 'An address, like example.app or https://example.app/pricing.'
    : S.product && !S.product.path ? `The film is made from ${S.product.url}.` : S.product ? `An address here takes the place of ${S.product.name} as the product.` : '');
  /** The address, judged once the typing stops: one wait for the field, whichever drawing of it is typed in (a timer
   *  of the field before a card was opened and closed again took a half-typed address). */
  const judgeSite = debounce(() => {
    const { host, v } = siteHost(siteText);
    if (!host) { const n = $('#site-note'); if (n) n.textContent = siteHint(); return; }
    if (S.product?.path) { S.brandAccent = null; syncAccent(); } // the colour guessed from a repository is not this website's
    S.product = { name: host.split('.')[0].replace(/^./, (c) => c.toUpperCase()), url: v };
    autoName(); render();
  }, 500);
  let productQuery = ''; // what was typed in the search: a pick redraws the step, and the list stays filtered
  let nameNote = ''; // what the name's check found, in a few words: its card says it, open or not
  // A deck: where the film comes from (a repository, or a website), a release's version, the brand's colour, the
  // film's name. Each card follows its field as it is typed in.
  function stepProduct(pane) {
    const repo = (b) => {
      let q = productQuery;
      const list = h('div', { class: 'plist' });
      // a repository chosen with the picker, outside the project folders, heads the list while it is the product
      const extra = S.product?.path && !CTX.products.some((p) => p.path === S.product.path) ? [{ name: S.product.name, path: S.product.path }] : [];
      const fill = () => {
        const items = [...extra, ...CTX.products].filter((p) => !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
        list.replaceChildren(...items.map((p) => h('button', { class: S.product?.path === p.path ? 'sel' : '', onclick: () => pickRepo(p) },
          h('span', { class: 'pn' }, p.name), h('span', { class: 'pp' }, tilde(p.path)),
          p.last ? h('span', { class: 'chip acc' }, 'filmed before') : null)));
        if (!items.length) list.append(h('div', { class: 'pp', style: { padding: '10px 12px' } }, 'No repository matches.'));
      };
      fill();
      setTimeout(() => { const el = list.querySelector('.sel'); if (el) list.scrollTop = el.offsetTop - list.offsetTop - (list.clientHeight - el.offsetHeight) / 2; }, 0); // the chosen one in sight, in its list: the page stays where it is
      const search = h('input', { type: 'text', value: productQuery, placeholder: `Search ${CTX.products.length} ${CTX.products.length === 1 ? 'repository' : 'repositories'} under ${CTX.roots.map(tilde).join(', ')}`, oninput: (e) => { q = productQuery = e.target.value.toLowerCase(); fill(); } });
      const notRepo = h('div', { class: 'warn' });
      const from = h('div', { class: 'srcline' },
        h('span', null, 'From ', ...codes(CTX.roots.map(tilde)), ', two levels deep.'),
        settingsLink('projectFolders', 'Change folders…'),
        folderButton('Choose a repository…', 'A repository', async (p) => {
          notRepo.replaceChildren();
          const d = await api('product?path=' + encodeURIComponent(p)).catch(() => null);
          if (d) return pickRepo({ name: d.name, path: d.path }, d);
          notRepo.replaceChildren(`${tilde(p)} is not a git repository. `, h('button', { class: 'e', onclick: async () => {
            const err = await saveSetting({ projectFolders: [...CTX.roots, p] });
            if (err) notRepo.textContent = `Not added: ${err}`;
          } }, 'List the repositories in it'));
        }, 'link'));
      b.append(search, list, from, notRepo);
      if (S.product?.path) {
        const P = S.product, dl = h('dl', { class: 'facts' });
        const fact = (k, v) => v && dl.append(h('dt', null, k), h('dd', { title: v }, v));
        fact('Homepage', P.homepage); fact('GitHub', P.remote); fact('Latest tag', P.tag);
        fact('Film kit', P.kit ? 'yes, scripts/film: a new film builds on it' : P.kit === false ? 'none yet' : null);
        if (dl.childElementCount) b.append(dl);
        if (P.last) b.append(option({ title: `Like the last ${P.name} film`, text: P.last.request || P.last.name, sel: false, onclick: () => { applyBrief(P.last); render(); } }));
      }
      setTimeout(() => (S.product ? null : search.focus()), 0);
    };
    const siteFill = (b) => {
      // the field keeps what was typed (siteText) at every key, so a card opened meanwhile gives it back, with its hint;
      // the product gets the address once it is one
      const url = h('input', { type: 'url', placeholder: 'example.app', value: siteText }); // a repository picked empties it
      url.addEventListener('input', () => { siteText = url.value; judgeSite(); });
      b.append(url, h('div', { class: 'desc', id: 'site-note' }, siteHint()));
    };
    const version = (b) => b.append(
      h('input', { type: 'text', placeholder: 'v2.4.0', value: S.release?.tag || '', oninput: (e) => { S.release = { tag: e.target.value.trim() || null }; if (!S.nameTouched) autoName(); refresh(); } }),
      h('div', { class: 'desc' }, 'The changes are read from this tag: what it shipped, compared with the one before.'));
    // the brand colour: read from the brand (the box ticked: the picker, the field and the palette under it only
    // show the colour the previews use, and cannot be changed), or chosen here, which makes it the film's accent
    const colour = (b) => {
      const read = S.readBrand !== false, guess = S.brandAccent, shown = S.accent || TEMPLATE_ACCENT;
      const sw = h('div', { class: `swatches${read ? ' off' : ''}` });
      const paint = () => {
        const P = FX.palette(S.accent || TEMPLATE_ACCENT, { scheme: S.scheme, tone: 'light' });
        sw.replaceChildren(...['canvas', 'ink', 'accent', 'a', 'b', 'c', 'pale', 'deep'].map((k) => h('i', { title: k, style: { background: toHex(P[k]) } })));
      };
      paint();
      const hexIn = h('input', { type: 'text', value: shown, disabled: read, spellcheck: 'false', 'aria-label': 'The colour, as hex' });
      const pick = h('input', { type: 'color', value: shown, disabled: read, 'aria-label': 'The colour' });
      const toBrand = (on) => { setReadBrand(on); render(); };
      const chk = h('input', { type: 'checkbox', checked: read, onchange: (e) => toBrand(e.target.checked) });
      const previewAccent = debounce(() => showLive(stageSpec({ look: S.backdrop ? undefined : S.look || 'aura' })), 250);
      const set = (v) => {
        if (read || !/^#[0-9a-f]{6}$/i.test(v)) return;
        S.ownAccent = v.toUpperCase(); syncAccent();
        hexIn.value = S.accent; pick.value = S.accent; paint(); back.hidden = !guess || guess.hex === S.accent; refresh(); previewAccent();
      };
      pick.addEventListener('input', (e) => set(e.target.value));
      hexIn.addEventListener('change', (e) => set(e.target.value.trim().startsWith('#') ? e.target.value.trim() : '#' + e.target.value.trim()));
      const back = h('button', { class: 'e', hidden: read || !guess || guess.hex === S.accent, onclick: () => toBrand(true) }, guess ? `Back to the brand’s colour, ${guess.hex}` : '');
      b.append(h('label', { class: 'check' }, chk, 'Read it from the brand (Claude does, from the source or the site)'),
        h('div', { class: `color${read ? ' off' : ''}`, style: { marginTop: '10px' } }, pick, hexIn,
          h('span', { class: 'desc', style: { margin: 0 } }, read ? (guess ? guess.from : 'none found in the source: the templates’ own') : 'chosen in the Studio'), back),
        sw, h('div', { class: 'desc' }, read
          ? `${guess ? `The previews use the brand’s colour, ${guess.hex}, ${guess.from}` : 'No colour was found in the product’s source yet, so the previews use the templates’ own'}. Claude reads the real brand when it makes the film. Untick the box to choose the film’s accent yourself.`
          : `This colour is the film’s accent, whatever the brand’s source says.${guess ? ` Tick the box to go back to the brand’s own, ${guess.hex}.` : ' Tick the box to leave it to the brand again.'}`));
    };
    // the name: the work folder and every delivered file. It is checked whether its card is open or not
    const warn = h('div', { class: 'warn' });
    const checkName = debounce(async () => {
      const name = S.name;
      let short = '', long = '';
      if (name && !SLUG.test(name)) { short = 'lowercase letters, digits, dots and dashes'; long = 'Lowercase letters, digits, dots and dashes.'; }
      else if (name) try {
        const e = await api(`exists?name=${encodeURIComponent(name)}&product=${encodeURIComponent(S.product?.name || '')}`);
        if (e.work || e.deliver) { short = e.deliver ? 'already delivered: a new cut is usually -v2' : 'its work folder exists: a new cut is usually -v2'; long = `${e.deliver ? `${name}/ is already delivered` : `${name}-work/ exists`}: the brief goes beside it, and an earlier brief is kept. A new cut is usually -v2.`; }
      } catch {}
      if (name !== S.name) return; // typed on meanwhile: the check of that name says it
      nameNote = short; warn.textContent = long;
      for (const say of SAYS) say();
    }, 300);
    const name = (b) => {
      const nameIn = h('input', { type: 'text', value: S.name || '', placeholder: 'acme-promo', spellcheck: 'false' });
      nameIn.addEventListener('input', () => { S.name = nameIn.value.trim(); S.nameTouched = true; nameNote = ''; refresh(); checkName(); });
      b.append(nameIn, h('div', { class: 'desc' }, `Names the work folder (${tilde(CTX.out)}/${S.name || '<name>'}-work) and every delivered file: <product>-<what>.`), warn);
    };
    checkName();
    const site = S.product && !S.product.path;
    pane.append(deck('product', [
      deckCard('repo', 'A repository', () => (S.product?.path ? `${S.product.name} · ${tilde(S.product.path)}` : S.product ? 'Not used · the film is made from the website' : `None yet · ${CTX.products.length} under ${CTX.roots.map(tilde).join(', ')}`), repo, { na: !S.product?.path, raw: true }), // a repository's name as it is written
      deckCard('site', 'Or a website', () => (site ? `${S.product.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]} · ${S.product.url}` : S.product ? 'Not used · the repository is where the film comes from' : 'None yet · an address is enough'), siteFill, { na: !site }),
      ...(S.kind === 'release' ? [deckCard('version', 'Version', () => `${S.release?.tag || 'The latest tag'} · what it shipped, against the one before`, version)] : []),
      deckCard('colour', 'Brand colour', () => (S.readBrand !== false ? `Read from the brand · ${S.accent ? `the previews use ${S.accent}, ${S.accentFrom || 'a guess'}` : 'none found in its source yet: the previews use the templates’ own'}` : `${S.accent} · chosen in the Studio`), colour, { swatch: () => S.accent || TEMPLATE_ACCENT }),
      deckCard('name', 'Name', () => `${S.name || 'No name yet'} · ${nameNote || `${tilde(CTX.out)}/${S.name || '<name>'}-work`}`, name, { raw: true }),
    ], site ? 'site' : 'repo'));
    showLive(stageSpec({ look: S.backdrop ? undefined : S.look || 'aura' }));
    about('Your colour on a look', 'The stand-in product in the colour above. The film uses the brand’s own palette, read from its source; this is how a single accent spreads into a scheme.');
  }

  // ---------------------------------------------------------------- step 3: the format, and what the product is shown in
  // A deck of two cards, the same for every kind of film. Formats: the three storyboards' formats (a release's
  // and a tutorial's one format is theirs: the card keeps its place and says so). Device: what the product is
  // shown in, a device, a window or its UI alone, whatever the format (a tutorial of an iPhone app belongs in an
  // iPhone); left to Claude, each format keeps its own.
  function stepFormat(pane) {
    const fixed = fmt(FIXED[S.kind]), frame = frameOf(S.frame);
    const fixedSpec = fixed && (S.kind === 'tutorial' ? stageSpec() : ours(fixed.preview)); // a tutorial's demo is the stage, told, in the look, the type and the device chosen
    const fixedIs = S.kind === 'release' ? 'A release film has one format' : 'A tutorial has one format';
    const fixedSays = `${fixedIs}: ${S.kind === 'release'
      ? 'the app as it was, then each change happening in place, between two version cards. Claude proposes which changes show best.'
      : 'one real task from start to finish, a chapter a step, each step as long as its sentence takes to say. Claude writes the story first and shows it to you; the voice and the subtitles are made from it.'}`;
    // The three storyboards, as slots that fill in the order the formats are clicked: why three, and which is which,
    // at a glance. They are the head of the formats' panel, so they stay under the row of cards while the formats
    // scroll, and so does what a fourth click is told, in its own box: it was one orange line right against the
    // first row of cards, easy to miss.
    const full = h('div', { class: 'slot-warn', role: 'alert', hidden: true });
    const board = !fixed && h('section', { class: 'storyboards', 'aria-label': 'The three storyboards' }, h('div', { class: 'slots' }, [0, 1, 2].map((k) => {
      const f = fmt(S.formats[k]), next = !f && k === S.formats.length, name = h('span', { class: 'slot-k' }, `Storyboard ${k + 1}`);
      return f
        ? h('button', { class: 'slot on', title: `Drop ${f.label}: Claude picks this storyboard’s format`, 'aria-label': `Storyboard ${k + 1}: ${f.label}. Drop it`, onclick: () => { TOUCHED.add('formats'); S.formats.splice(k, 1); render(); } },
          name, h('b', null, f.label), h('span', { class: 'slot-h' }, 'your pick'), h('span', { class: 'slot-x', 'aria-hidden': 'true' }, '×'))
        // a button too, though it does nothing: the pane holds as many controls whatever is picked, so the card a
        // format was chosen on with the keyboard is found again, in its place, when the step redraws
        : h('button', { class: `slot${next ? ' next' : ''}`, disabled: true }, name, h('b', null, 'Claude picks'), h('span', { class: 'slot-h' }, next ? 'or the next format you click' : 'a different format again'));
    })), full);
    const formats = (b) => {
      if (fixed) return b.append(h('div', { class: 'grid wide' }, card({ spec: fixedSpec, label: fixed.label, sub: fixed.about, sel: true, onhover: (el) => hover(fixedSpec, el) })), h('div', { class: 'note' }, `${fixedIs}, so there is nothing to choose here. What it is shown in is still yours: the Device card.`));
      b.append(option({ title: 'Let Claude pick three', text: 'Claude answers with three storyboards, each on a different format, chosen for this product and unlike its previous films. You pick one of them.', sel: !S.formats.length, onclick: () => { S.formats = []; TOUCHED.add('formats'); render(); } }),
        section('Or choose the formats yourself'), h('div', { class: 'desc', style: { marginTop: '-4px', marginBottom: '10px' } }, 'Claude draws three storyboards, each on its own format. A format you click takes the next free storyboard, in the order you click: the first shapes storyboard 1. The ones you leave free are Claude’s, each on a different format.'),
        h('div', { class: 'grid' }, SCHEMA.formats.filter((f) => !f.kind).map((f, i) => {
          const k = S.formats.indexOf(f.id), spec = ours(f.preview);
          return card({
            spec, label: f.label, sub: f.fits, sel: k >= 0, badge: k >= 0 ? String(k + 1) : null, i,
            onhover: (el) => { if (spec) hover(spec, el); describe(f); },
            onclick: () => {
              TOUCHED.add('formats');
              if (k >= 0) S.formats.splice(k, 1);
              else if (S.formats.length >= 3) {
                full.textContent = `All three storyboards have a format. Drop one, with its × above or a click on its card, to make room for ${f.label}.`;
                full.hidden = false; board.classList.remove('full'); void board.offsetWidth; board.classList.add('full'); // said again at every click, with its nudge
                return;
              }
              else S.formats.push(f.id);
              if (spec) showLive(spec);
              render();
            },
          });
        })));
    };
    // The frames, each a tile of the stand-in product in it, on the look and the aspect chosen: the product laid
    // out as that device has it, tapped where it is touched, and seen from near (on: 'product': in the whole
    // stage a phone was thirty pixels of a tile). A hover plays it, as near; a click chooses it, and the viewer
    // goes back to the whole stage, the headline beside the device. A tutorial's stage is told, and near already.
    const pickFrame = (id) => { S.frame = id; TOUCHED.add('frame'); render(); };
    const near = (f) => stageSpec({ frame: f.id, on: 'product' });
    const device = (b) => {
      const tall = tallClass();
      b.append(option({ title: 'Let Claude pick', text: 'Each format keeps the frame it was made for: a browser for a walkthrough, a terminal for a command line, a Mac window for a tutorial. Choose one below when the product lives on one device.', sel: !frame, onclick: () => pickFrame(null) }),
        section('Or choose the device yourself'), // as the formats' card has it: the choice to leave it, then the choices, apart
        h('div', { class: 'grid' + (tall === 'p916' || tall === 'p45' ? ' tall' : '') }, SCHEMA.frames.map((f, i) => card({
          spec: near(f), tall, label: f.label, sub: f.fits, sel: S.frame === f.id, i,
          chips: f.touch ? ['taps, not clicks'] : [],
          onhover: (el) => { hover(near(f), el); describeFrame(f); },
          onclick: () => pickFrame(f.id),
        }))),
        h('div', { class: 'note' }, 'An iPhone or an iPad shows the product’s own layout on that device: an iOS app’s screens, a responsive site at that width. Where the product has no such layout, Claude says so before the storyboards and proposes the nearest honest frame: a desktop UI is never squeezed into a phone.'));
    };
    const picked = S.formats.map((f) => fmt(f).label).join(', ');
    pane.append(deck('format', [
      deckCard('formats', 'Formats', fixed ? `${fixed.label} · the one format of a ${S.kind === 'release' ? 'release film' : 'tutorial'}`
        : !S.formats.length ? 'Claude picks three · three storyboards, each on its own format'
          : `${picked} · ${['', 'storyboard 1; Claude picks the other two', 'storyboards 1 and 2; Claude picks the third', 'your three storyboards'][S.formats.length]}`, formats, { na: !!fixed, head: fixed ? null : (hd) => hd.append(board) }),
      deckCard('device', 'Device', frame ? `${frame.label} · ${frame.touch ? 'the product’s own layout on it, tapped' : frame.fits}` : 'Claude picks · each format keeps its own frame', device, { head: (hd) => hd.append(section(`${SCHEMA.frames.length} frames, in your look and aspect`)), raw: true }), // an iPhone's name as it is written
    ]));
    // the viewer: the open card's. The device's is the stage, in the frame chosen; the formats' a format's own demo
    if (FOLD.format === 'device') {
      showLive(stageSpec());
      if (frame) describeFrame(frame);
      else about('Device', 'What the product is shown in: a device, a window, or its UI alone. Left to Claude, each format keeps its own, which is what the preview shows now. Hover a frame to watch the stand-in product in it: laid out as that device has it, and tapped where it is touched.');
    } else if (fixed) { showLive(fixedSpec); about(fixed.label, fixedSays); }
    else {
      const last = fmt(S.formats[S.formats.length - 1]);
      if (last) { if (last.preview) showLive(ours(last.preview)); describe(last); }
      else { showLive(ours(fmt('bento').preview)); about('Formats', 'A format is the shape of a film: how its scenes are laid out and move. Claude draws three storyboards, each on its own format, and you choose one; picking here decides which formats they are. Hover a card to watch it: the demos are the templates’ own scenes, on a stand-in product.'); }
    }
    function describe(f) {
      about(f.label, f.about, `Fits ${f.fits}.`, f.demo ? h('p', { class: 'note' }, `Preview: ${f.demo}.`) : !f.preview ? h('p', { class: 'note' }, 'No demo of this one yet: Claude builds it from the engine’s parts.') : null);
    }
    function describeFrame(f) {
      about(f.label, f.about, `Fits ${f.fits}.`, h('p', { class: 'note' }, f.touch ? 'The preview is a stand-in app in that device’s own layout. The film shows your product’s: its iOS screens, or its site at that width.' : 'The preview is a stand-in product; the film shows your own, recreated from its source.'));
    }
  }

  // ---------------------------------------------------------------- step 4: the look, or a picture
  const FIELD_LOOKS = { mesh: 'WebGL', meshdark: 'WebGL', silk: 'WebGL', lava: 'WebGL', aurora: 'WebGL', caustics: 'WebGL', topo: 'WebGL', halftone: 'WebGL', clouds: 'WebGL', sunrise: 'gradient', halo: 'gradient', dunes: 'layers', floor: 'perspective' };
  // what each scheme derives from the accent (fx.js, palette): said on its choice and on the palette's card
  const SCHEME_SAYS = { analogous: 'its neighbours on the wheel: calm', complementary: 'its opposite: contrast', triad: 'three hues a third apart: lively', split: 'the two beside its opposite: a softer contrast', mono: 'one hue, lighter and darker' };
  // the pictures, once listed, and the folders they came from
  let lookFilter = 'all', PICS = null, PICDIRS = [];
  // A deck under the choice to leave it to a sheet: the looks, a picture of yours, the palette (where there is a
  // colour to derive one from: the product step's, so the cards are the same for the whole visit).
  function stepLook(pane) {
    pane.append(option({ title: 'Decide on a sheet of the first real frame', text: 'Claude renders the product’s first real frame once per look and you choose there. A pick below can still be the favourite.', sel: !S.look && !S.backdrop, onclick: () => { S.look = null; S.backdrop = null; render(); } }));
    const l = SCHEMA.looks.find((x) => x.id === S.look), B = S.backdrop;
    const looksHead = (hd) => hd.append(section(`${SCHEMA.looks.length} looks, in your colour and aspect`,
      h('span', { class: 'seg filters' }, ['all', 'light', 'dark', 'new'].map((k) => h('button', { class: lookFilter === k ? 'sel' : '', 'aria-pressed': String(lookFilter === k), onclick: () => { lookFilter = k; render(); } }, k[0].toUpperCase() + k.slice(1))))));
    const looks = (b) => {
      const tall = tallClass();
      b.append(
        h('div', { class: 'grid' + (tall === 'p916' || tall === 'p45' ? ' tall' : '') }, SCHEMA.looks.filter((x) => lookFilter === 'all' || (lookFilter === 'new' ? x.new : x.tone === lookFilter)).map((x, i) => card({
          spec: stageSpec({ look: x.id, backdrop: null }), tall, label: x.id, sel: !S.backdrop && S.look === x.id, i,
          chips: [x.tone, ...(FIELD_LOOKS[x.id] ? [FIELD_LOOKS[x.id]] : []), ...(x.id === 'dots' || x.id === 'plain' ? [{ t: 'fastest', acc: true }] : []), ...(x.new ? [{ t: 'new', isNew: true }] : [])],
          onhover: (el) => { hover(stageSpec({ look: x.id, backdrop: null }), el); describe(x); },
          onclick: () => { S.look = x.id; S.backdrop = null; showLive(stageSpec({ look: x.id, backdrop: null })); render(); },
        }))));
    };
    // The palette: a scheme derives three companions from the accent. Each choice shows the colours it makes, and the
    // panel says where a film uses them: the names alone (analogous, split…) said nothing, and on a look that takes
    // the accent alone (spotlight) a click changed a few bars of the stand-in's chart, which read as nothing at all.
    const painted = Object.keys(FX.PRESETS).filter((k) => FX.companions(k).length); // the looks a scheme repaints
    const onLook = !B && FX.companions(S.look || 'aura').length > 0; // the backdrop the palette is shown on changes with it
    // on a product whose chart and toast are drawn in them: the frame chosen, or the window (never a terminal, or words alone)
    const paletteSpec = (scheme) => stageSpec({ scheme, ui: !S.frame || S.frame === 'terminal' ? 'window' : undefined, look: B ? undefined : S.look || 'aura' });
    const palette = (b) => b.append(
      h('div', { class: 'schemes' }, SCHEMA.schemes.map((k) => {
        const P = FX.palette(S.accent, { scheme: k, tone: l?.tone || 'light' });
        return h('button', { class: `scheme${S.scheme === k ? ' sel' : ''}`, 'aria-pressed': String(S.scheme === k), 'data-scheme': k,
          onclick: () => { S.scheme = k; TOUCHED.add('scheme'); render(); },
          onmouseenter: (e) => hover(paletteSpec(k), e.currentTarget), onmouseleave: (e) => unhover(e.currentTarget) },
        h('span', { class: 'sw', 'aria-hidden': 'true' }, ['accent', 'a', 'b', 'c'].map((r) => h('i', { title: r === 'accent' ? 'the accent' : `companion ${r}`, style: { background: toHex(P[r]) } }))),
        h('b', null, k), h('small', null, SCHEME_SAYS[k]));
      })),
      h('div', { class: 'desc' }, `A scheme makes three companions for the accent ${S.accent} (in OKLCH: as light and as vivid as it is). A film uses them where one colour is not enough: the lights and tints of the backdrops built from several (${painted.slice(0, 4).join(', ')}… ${painted.length} of the ${SCHEMA.looks.length} looks), and the product’s second colours: a chart’s other bars, a tick, a tag.`),
      h('div', { class: 'note' }, B ? 'Your picture is the backdrop: here a scheme changes the product’s second colours only.'
        : onLook ? `${S.look ? `${S.look}, your look,` : 'aura, shown until a look is picked,'} is painted with them: rest the pointer on a scheme and watch the backdrop.`
          : `${S.look}, your look, takes the accent alone: here a scheme changes the product’s second colours only (the chart’s paler bars, in the preview). It shows across the frame on ${painted.slice(0, 3).join(', ')}…`));
    pane.append(deck('look', [
      deckCard('kit', 'Looks', B ? 'Not used · your picture is the backdrop' : l ? `${l.id} · ${[l.tone, FIELD_LOOKS[l.id], l.id === 'dots' || l.id === 'plain' ? 'fastest to render' : null].filter(Boolean).join(', ')}` : `None picked · ${SCHEMA.looks.length} to choose from, or the sheet`, looks, { na: !!B || !l, raw: true, head: looksHead }),
      deckCard('mine', 'Your picture', B ? `${B.name} · ${pictureWords(B)}` : 'None · drop one, or take a recent one', (b) => b.append(pictures()), { na: !B, raw: true }),
      ...(S.accent ? [deckCard('palette', 'Palette', `${S.scheme} · ${SCHEME_SAYS[S.scheme]}`, palette, { swatch: () => S.accent })] : []),
    ]));
    const onPalette = FOLD.look === 'palette' && !!S.accent;
    showLive(onPalette ? paletteSpec() : stageSpec());
    if (onPalette) about('Palette', `${S.scheme[0].toUpperCase()}${S.scheme.slice(1)}: ${SCHEME_SAYS[S.scheme]}. The preview shows the stand-in product, whose chart is drawn in the accent and its first companion.`, h('p', { class: 'note' }, 'The film takes the brand’s own colours where its source has them; the scheme fills in the ones it lacks.'));
    else if (S.backdrop) about('Your picture', SCHEMA.picture.about, h('p', { class: 'note' }, `${S.backdrop.name} — the film gets the same picture, as prepared here (at most 3840 px, a JPEG).`));
    else if (l) describe(l);
    else about('Looks', 'Hover a tile to watch it move. The stand-in product is in the device you chose, else in your first format’s shape (a window, a terminal, or the headline alone), so the look is judged with what the film will have on it; light and texture belong to the backdrop, and the product stays clean.');
    function describe(x) {
      const cost = x.id === 'dots' || x.id === 'plain'
        ? 'Fastest to render: no noise in the frame.'
        : 'Dithered against banding: about 2.5× the render time of dots (measured: the 8 s demo in 87 s against 35 s).';
      const d = FX.PRESETS[x.id] || '';
      about(x.id, d ? d[0].toUpperCase() + d.slice(1) + '.' : '', h('p', { class: 'note' }, `${x.tone === 'dark' ? 'Dark: the ink flips to light for text on the backdrop.' : 'Light.'} ${cost}`));
    }
  }
  /** A box to drop a file on, or to choose one through `input`: it goes to `endpoint`, and `done({ id, name })` takes it. */
  function dropZone(text, choose, input, endpoint, done) {
    const drop = h('div', { class: 'drop' }, text, h('button', { class: 'ghost', onclick: () => input.click() }, choose));
    const upload = async (file) => {
      if (!file) return;
      drop.textContent = `Reading ${file.name}…`;
      try {
        const r = await fetch(endpoint, { method: 'POST', body: file, headers: { 'x-studio-key': KEY, 'x-name': encodeURIComponent(file.name) } }), j = await r.json();
        if (!r.ok) throw new Error(j.error || r.status);
        done(j);
      } catch (e) { drop.textContent = `That did not work: ${e.message}`; }
    };
    input.onchange = (e) => upload(e.target.files[0]);
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); upload(e.dataTransfer.files[0]); });
    return drop;
  }
  function pictures() {
    const wrap = h('div');
    const grid = h('div', { class: 'pics' });
    const drop = dropZone('Drop a picture here, or', 'Choose…', $('#file'), '/api/upload', (j) => { PICS = [{ id: j.id, name: j.name, dir: 'added' }, ...(PICS || [])]; choosePicture(j); });
    const from = h('div', { class: 'srcline' });
    const fill = () => {
      from.replaceChildren(h('span', null, 'Or one of the most recent in ', ...codes(PICDIRS), ', three levels deep.'),
        settingsLink('pictureFolders', 'Change folders…'));
      grid.replaceChildren(...(PICS || []).slice(0, 48).map((p, i) => h('button', { class: `pic${S.backdrop?.image === p.id ? ' sel' : ''}`, style: { '--i': i }, title: `${p.dir}/${p.name}`, onclick: () => choosePicture(p) },
        h('img', { src: `/images/thumb/${p.id}.jpg`, loading: 'lazy', alt: '' }), h('span', null, p.name))));
      if (PICS && !PICS.length) grid.append(h('div', { class: 'note' }, 'No pictures there: drop one above, or add a folder that has some.'));
    };
    if (PICS) fill(); else api('images').then((r) => { PICS = r.images; PICDIRS = r.dirs; fill(); }).catch(() => { PICS = []; fill(); });
    wrap.append(drop, from, grid);
    if (S.backdrop) {
      const B = S.backdrop, P = SCHEMA.picture;
      const upd = (k) => (v) => { S.backdrop = { ...S.backdrop, [k]: v }; showLive(stageSpec()); render(); };
      wrap.append(h('div', { class: 'picopts' },
        h('div', null, h('span', { class: 'flabel' }, 'Blur'), seg(P.blur, B.blur, upd('blur'), true)),
        h('div', null, h('span', { class: 'flabel' }, 'Treatment'), seg(P.treatment, B.treatment, upd('treatment'), true)),
        h('div', null, h('span', { class: 'flabel' }, P.drift.label), seg([{ value: true, label: 'On' }, { value: false, label: 'Still' }], B.drift, upd('drift'), true))));
    }
    wrap.append(h('div', { class: 'note' }, SCHEMA.picture.about));
    return wrap;
  }
  /** How a picture is treated, in words: its card's line and its row in Review. */
  const pictureWords = (B) => `${[[SCHEMA.picture.blur, B.blur], [SCHEMA.picture.treatment, B.treatment]].map(([list, v]) => list.find((o) => o.value === v).label.toLowerCase()).join(', ')}, ${B.drift ? 'Ken Burns' : 'still'}`;
  function choosePicture(p) {
    S.backdrop = { image: p.id, name: p.name, blur: S.backdrop?.blur ?? 0, treatment: S.backdrop?.treatment ?? 'none', drift: S.backdrop?.drift ?? true };
    showLive(stageSpec()); render();
  }

  // ---------------------------------------------------------------- step 5: the type
  let fontSource = 'kit', fontQuery = '';
  const famCSS = (f) => (f === 'system-ui' || f === 'ui-monospace' ? f : `"${f}", system-ui`);
  // A deck under the choice to read it from the brand: the kit's sets, or any family, whose weight is set where it
  // is picked (it had a section of its own, there only once a family was chosen).
  function stepType(pane) {
    pane.append(option({ title: 'Read it from the brand', text: 'Claude uses the product’s own display and body faces, from its source or its site. A set below is the fallback, or the choice.', sel: !typeNow(), onclick: () => { S.type = null; render(); } }));
    const sets = (b) => b.append(h('div', { class: 'grid wide' }, SCHEMA.typesets.map((t, i) => card({
      i, label: t.label, sub: t.about, sel: S.type?.set === t.id,
      chips: [t.tone, t.display.family === t.text.family ? t.display.family : `${t.display.family} + ${t.text.family}`],
      body: h('div', { class: 'specimen' },
        h('div', { class: 'big', style: { fontFamily: famCSS(t.display.family), fontWeight: t.display.weight } }, 'Your product, on stage.'),
        h('div', { class: 'small', style: { fontFamily: famCSS(t.text.family), fontWeight: 450 } }, 'Built for the way you work. 24,816 teams.')),
      onhover: (el) => { hover(stageSpec({ mode: 'text', type: t }), el); describeSet(t); },
      onclick: () => { S.type = { set: t.id, display: t.display, text: t.text, mono: t.mono }; showLive(stageSpec({ mode: 'text' })); render(); },
    }))));
    // any family, for the headlines: the kit's, or one installed on this Mac
    const family = (b) => {
      const list = h('div', { class: 'fonts' });
      const fill = () => {
        const src = fontSource === 'kit' ? FONTS.kit.map((f) => ({ family: f.family, note: (f.axes || 'static').split('@')[0].replace(/,/g, ' · ') })) : FONTS.mac.map((f) => ({ family: f.family, note: `${f.styles.length} style${f.styles.length > 1 ? 's' : ''}` }));
        const q = fontQuery.toLowerCase(), items = src.filter((f) => !q || f.family.toLowerCase().includes(q));
        list.replaceChildren(...items.slice(0, 200).map((f) => h('button', {
          class: !S.type?.set && S.type?.display?.family === f.family ? 'sel' : '',
          onclick: () => { S.type = { set: null, display: { family: f.family, source: fontSource, weight: S.type?.display?.weight || 700 }, text: { family: 'system-ui', source: 'system' }, mono: null }; showLive(stageSpec({ mode: 'text' })); render(); },
          onmouseenter: (e) => hover(stageSpec({ mode: 'text', type: { display: { family: f.family, source: fontSource, weight: 700 }, text: { family: 'system-ui', source: 'system' } } }), e.currentTarget),
          onmouseleave: (e) => unhover(e.currentTarget),
        }, h('span', { class: 'fn', style: { fontFamily: famCSS(f.family) } }, f.family), h('span', { class: 'fs' }, f.note))));
        if (!items.length) list.append(h('div', { class: 'note', style: { padding: '10px 12px' } }, fontSource === 'mac' && !FONTS.mac.length ? 'Reading this Mac’s fonts…' : 'No family matches.'));
      };
      const search = h('input', { type: 'text', placeholder: 'Search families', value: fontQuery, oninput: (e) => { fontQuery = e.target.value; fill(); } });
      b.append(h('div', { class: 'row' }, h('div', { class: 'fixed' }, seg([{ value: 'kit', label: `The kit (${FONTS.kit.length})` }, { value: 'mac', label: `This Mac (${FONTS.mac.length})` }], fontSource, (v) => { fontSource = v; render(); }, true)), search), list);
      fill();
      if (custom) b.append(h('div', { class: 'field', style: { margin: '14px 0 0' } }, h('span', { class: 'flabel' }, `Headline weight, for ${custom.display.family}`),
        seg([300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: w, label: String(w) })), custom.display.weight, (w) => { S.type = { ...S.type, display: { ...S.type.display, weight: w } }; showLive(stageSpec({ mode: 'text' })); render(); }, true)));
      b.append(h('div', { class: 'note' }, 'The kit’s families are open-licensed and travel with the film (into src/fonts). A Mac family is used by its name: it renders on Macs where it is installed, and its licence decides whether a kit that carries it may be shared.'));
    };
    const set = S.type?.set ? typeset(S.type.set) : null, custom = typeNow() && !S.type.set ? S.type : null; // a set, or a family picked by hand
    pane.append(deck('type', [
      deckCard('sets', 'Type sets', set ? `${set.label} · ${set.tone}, ${set.display.family === set.text.family ? set.display.family : `${set.display.family} + ${set.text.family}`}` : `None picked · ${SCHEMA.typesets.length} sets: a display face for headlines, a text face, a mono`, sets, { na: !set }),
      deckCard('family', 'Any family', custom ? `${custom.display.family} · weight ${custom.display.weight}, ${custom.display.source === 'mac' ? 'from this Mac' : 'from the kit'}` : `None picked · ${FONTS.kit.length} in the kit, ${FONTS.mac.length} on this Mac, for the headlines`, family, { na: !custom }),
    ]));
    showLive(stageSpec({ mode: 'text' }));
    if (set) describeSet(set);
    else if (custom) about(custom.display.family, `${custom.display.source === 'mac' ? 'Installed on this Mac' : 'From the kit'}, weight ${custom.display.weight}, for the headlines; the UI keeps the product’s own face.`);
    else about('Type', 'The headlines are set in the display face; the product’s UI keeps its own. Hover a set to see it on the stage, in your look.');
    function describeSet(t) { about(t.label, t.about, h('p', { class: 'note' }, `Display ${t.display.family} ${t.display.weight} · text ${t.text.family} · mono ${t.mono.family}.`)); }
  }

  // ---------------------------------------------------------------- step 6: the motion
  // motionView: which of the two the viewer is on, the headline or the cut: the open card's (the cuts' once one is
  // chosen), else the last shown. With a style chosen, a click on a cut used to be answered by the headline again.
  let motionView = null, cutFamily = 'all';
  const paceLabel = () => SCHEMA.motion.pace.find((p) => p.value === S.motion.pace).label;
  const emphWords = () => (S.motion.emphasis ? `${SCHEMA.motion.emphasis.find((o) => o.value === S.motion.emphasis).label.toLowerCase()} on one word` : 'no word marked');
  // A deck under the choice to leave it to Claude: the headlines (their style, and the emphasis on one word), the
  // cuts, and how it all moves (the pace and the shutter).
  function stepMotion(pane) {
    const M = S.motion;
    // the tiles on a quiet backdrop, so the motion reads at that size; the viewer shows it in the film's own
    const calm = { backdrop: null, look: S.backdrop ? 'plain' : S.look || 'plain' };
    pane.append(option({ title: 'Let Claude pick', text: 'A headline style and a family of cuts that fit the format and the tone: one style carries the headlines, one family most of the cuts.', sel: !M.text && !M.transition, onclick: () => { setMotion('text', null); setMotion('transition', null); render(); } }));
    // the emphasis stays at the top of the panel, with the list's title: under thirteen tiles it was out of sight
    const headlinesHead = (hd) => hd.append(section(`${SCHEMA.motion.text.length} headline styles`,
      h('span', { class: 'emph', title: 'A mark on one word of the claim, drawn once the headline has settled: here, on “stage”' }, h('span', { class: 'emph-k' }, 'Emphasis on one word'),
        seg(SCHEMA.motion.emphasis, M.emphasis, (v) => { setMotion('emphasis', v); render(); }, true))));
    const headlines = (b) => b.append(
      h('div', { class: 'grid' }, SCHEMA.motion.text.map((x, i) => card({
        spec: stageSpec({ mode: 'text', style: x.id, ...calm }), label: x.label, sub: x.fits, sel: M.text === x.id, i,
        chips: x.new ? [{ t: 'new', isNew: true }] : [],
        onhover: (el) => { hover(stageSpec({ mode: 'text', style: x.id }), el); const d = (window.TYPE && TYPE.STYLES[x.id]) || x.fits; about(x.label, d[0].toUpperCase() + d.slice(1) + '.', h('p', { class: 'note' }, `Fits ${x.fits}.`)); },
        onclick: () => { setMotion('text', x.id); render(); },
      }))),
      h('div', { class: 'note' }, 'A tile is a still of its style arriving. The emphasis is drawn once the headline has settled, on one word of the claim (“stage” here): rest the pointer on a tile, or watch the preview, to see it land.'));
    // the cuts, by what they do to the frame
    const fams = [{ value: 'all', label: 'All' }, ...SCHEMA.motion.families, { value: 'new', label: 'New' }];
    const famOf = (x) => SCHEMA.motion.families.find((f) => f.value === x.family);
    const cutsHead = (hd) => hd.append(section(`${SCHEMA.motion.transitions.length} cuts between scenes`,
      h('span', { class: 'seg filters' }, fams.map((f) => h('button', { class: cutFamily === f.value ? 'sel' : '', 'aria-pressed': String(cutFamily === f.value), title: f.hint || null, onclick: () => { cutFamily = f.value; render(); } }, f.label)))));
    const cuts = (b) => b.append(
      h('div', { class: 'grid' }, SCHEMA.motion.transitions.filter((x) => cutFamily === 'all' || (cutFamily === 'new' ? x.new : x.family === cutFamily)).map((x, i) => card({
        spec: stageSpec({ mode: 'trans', trans: x.id, ...calm }), label: x.label, sub: x.fits, sel: M.transition === x.id, i,
        chips: [...(x.gl ? ['shader'] : []), ...(x.new ? [{ t: 'new', isNew: true }] : [])],
        onhover: (el) => {
          hover(stageSpec({ mode: 'trans', trans: x.id }), el);
          const d = (window.FILM && FILM.TRANSITIONS[x.id]) || x.fits;
          about(x.label, d[0].toUpperCase() + d.slice(1).replace(/ \(o\..*$/, '') + '.', h('p', { class: 'note' }, `Fits ${x.fits}. ${famOf(x) ? `${famOf(x).label}: ${famOf(x).hint}. ` : ''}The stage, an end card, and back: the cut both ways, marked on the scrubber.${x.gl ? ' Drawn by a shader: the film’s shader cuts share one WebGL context.' : ''}`));
        },
        onclick: () => { setMotion('transition', x.id); render(); },
      }))));
    const pace = (b) => b.append(
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Pace'),
        seg(SCHEMA.motion.pace, M.pace, (v) => { setMotion('pace', v); render(); }),
        h('div', { class: 'desc' }, 'How long a cut takes, and the springs of the type.')),
      // the shutter: how much of each frame the blur gathers. Picking one turns the viewer's blur on,
      // since without it the three look the same
      h('div', { class: 'field', style: { marginBottom: 0 } }, h('span', { class: 'flabel' }, 'Motion blur'),
        seg(SCHEMA.motion.shutter, M.shutter, (v) => {
          setMotion('shutter', v);
          if (!live.blur) blurBtn.click();
          render(); // which redraws this step, and its note: the shutter's own goes after
          about('Motion blur', `${shutterOpt(v).label}: the render blends its sixteen moments over ${v === 360 ? 'the whole of each frame' : `${v / 3.6}% of each frame`} (a ${v}° shutter). Watch a cut or a headline arrive: the less of the frame, the crisper each step.`);
        })));
    const cut = M.transition && transition(M.transition);
    pane.append(deck('motion', [
      deckCard('headlines', 'Headlines', `${M.text ? textStyle(M.text).label : 'Claude picks'} · ${M.text ? '' : `${SCHEMA.motion.text.length} styles; `}${emphWords()}`, headlines, { head: headlinesHead }),
      deckCard('cuts', 'Cuts', cut ? `${cut.label} · ${[famOf(cut)?.label.toLowerCase(), cut.gl && 'drawn by a shader'].filter(Boolean).join(', ')}` : `Claude picks · ${SCHEMA.motion.transitions.length} cuts between scenes`, cuts, { head: cutsHead }),
      deckCard('pace', 'Pace and blur', `${paceLabel()} · ${shutterOpt(M.shutter).label.toLowerCase()} motion blur (${M.shutter}°)`, pace),
    ]));
    // the viewer: the open card's, the headline or the cut; with neither open, the last one shown
    if (FOLD.motion === 'cuts' && M.transition) motionView = 'trans'; else if (FOLD.motion === 'headlines') motionView = 'text';
    if (!motionView || (motionView === 'trans' && !M.transition)) motionView = M.transition && !M.text ? 'trans' : 'text';
    showLive(motionView === 'trans' ? stageSpec({ mode: 'trans', trans: M.transition }) : stageSpec({ mode: 'text' }));
    about('Motion', 'Hover a style or a cut to watch it on the stage, in your look and type; the pace sets how long a cut takes as well as the springs of the type. The emphasis marks one word of the claim once the headline has settled, whichever style carries it.',
      h('p', { class: 'note' }, `Motion blur is ${live.blur ? 'on' : 'off'} in this preview (the button under it, or B): on, a cut and a headline are seen the way the render blends them; the shutter sets how much of each frame it gathers.`));
  }

  // ---------------------------------------------------------------- step 7: the music
  // It used to be one line in Output, "a track I give you", and a voice for tutorials only: whether the
  // Studio could make any sound was left to guess. Now the step says it first: music is chosen here, not
  // made here (the brand's library, a file, or a prompt for Gemini); a voice is made on this Mac, and
  // heard before it is chosen; subtitles come from the same lines. Any film may speak.
  let TRACKLIST = null, KIT = null; // the music library's tracks, once listed; this Mac's voice models
  const TRACKMETA = new Map(); // track id → its length and beat, measured one at a time after the list
  const trackTitle = (t) => {
    const words = t.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().split(/\s+/);
    while (words.length > 1 && [t.brand, 'music', 'track'].some((w) => w && words[0].toLowerCase() === w.toLowerCase().replace(/\s+/g, ''))) words.shift();
    const s = words.join(' ');
    return s[0].toUpperCase() + s.slice(1);
  };
  const fmtLen = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  let tracksAsked = 0; // which listing is the latest: one asked before the library changed is not shown
  function listTracks() {
    TRACKLIST = TRACKLIST || { pending: true };
    const ask = ++tracksAsked, stale = () => ask !== tracksAsked;
    api('tracks?product=' + encodeURIComponent(S.product?.name || '')).then(async (r) => {
      if (stale()) return;
      TRACKLIST = r;
      if (S.musicTrack && !r.tracks.some((t) => t.id === S.musicTrack)) S.musicTrack = null; // the library changed under it: no track sent unseen
      if (cur === at('music')) render();
      for (const t of r.tracks) { // their length and beat, one at a time: a Drive file is fetched to be read
        if (stale()) return;
        if (TRACKMETA.has(t.id)) continue;
        TRACKMETA.set(t.id, null);
        try { TRACKMETA.set(t.id, await api('beats?track=' + t.id)); } catch { TRACKMETA.set(t.id, { error: true }); }
        const el = document.querySelector(`[data-meta="${t.id}"]`); if (el) el.textContent = trackMeta(t.id);
      }
    }).catch(() => { if (stale()) return; TRACKLIST = { store: null, tracks: [] }; if (cur === at('music')) render(); });
  }
  const trackById = (id) => TRACKLIST?.tracks?.find((t) => t.id === id) || null;
  /** The chosen track's id: one of the library's, or one dropped; null for a path typed, or no track. */
  const trackId = () => (S.musicFrom === 'library' ? S.musicTrack : S.musicFrom === 'file' ? S.musicUpload?.id ?? null : null);
  const trackMeta = (id) => { const m = TRACKMETA.get(id); return !m ? 'measuring…' : m.error ? 'not audio ffmpeg reads' : `${fmtLen(m.duration)}${m.bpm ? ` · ${m.bpm} BPM${m.steady ? '' : ', drifting'}` : ' · no steady beat'}`; };
  // one sound at a time, and every button that plays it says so (a voice's ▶ in its card, and the same voice's
  // beside the line): `making` while its sample is still being made
  let nowPlaying = null, making = null, asked = 0;
  const showPlaying = () => document.querySelectorAll('[data-play]').forEach((b) => {
    const mine = b.dataset.play === nowPlaying, wait = mine && making === nowPlaying, on = mine && !wait && !player.paused;
    b.classList.toggle('on', on); b.classList.toggle('wait', wait); b.textContent = wait ? '…' : on ? '❚❚' : '▶';
  });
  for (const e of ['play', 'pause', 'ended']) player.addEventListener(e, () => { if (e === 'ended') nowPlaying = null; showPlaying(); });
  /** Nothing plays, and nothing still being made will: what it said is no longer what the page says. */
  function hush() { asked++; nowPlaying = making = null; player.pause(); showPlaying(); noteSample(''); }
  /** What a sample says of itself (how long the first one takes, why it could not be made), under the line. */
  function noteSample(t) { sampleNote = t; const el = $('#sample-note'); if (el) el.textContent = t; }
  async function toggle(key, src) {
    if (nowPlaying === key && !player.paused) { player.pause(); return; }
    const mine = ++asked; // the request this click is: one given up, or overtaken, plays nothing
    nowPlaying = key; making = null; player.pause(); noteSample(''); // what an overtaken sample said of itself goes with it
    if (typeof src === 'function') { // a sample to be made first
      making = key; showPlaying();
      try { src = await src(); } catch (e) { if (mine === asked) { nowPlaying = making = null; showPlaying(); } return; } // a request given up meanwhile leaves the current one alone
      if (mine !== asked) return; // another was asked for meanwhile
      making = null;
    }
    player.src = src; player.play().catch(() => {});
    showPlaying();
  }
  const playBtn = (key, src, label, cls = 'play') => h('button', { class: cls, 'data-play': key, title: `Play ${label}`, 'aria-label': `Play ${label}`, onclick: (e) => { e.stopPropagation(); toggle(key, src); } }, '▶'); // its state: showPlaying(), after every draw
  // the line a voice says: the one typed, else its own (Sara speaks Italian) or the schema's
  const sampleLine = (v = modelOf(S)) => S.sampleText || (v?.sample || SCHEMA.sampleLine).replace('{product}', S.product?.name || 'your product');
  let sampleNote = null; // what the last sample said of itself: how long the first one takes, or why it could not be made
  /** What a model's ▶ plays, as a key: the voice and its reading. Not the line: a line typed stops what was playing. */
  const sampleKey = (v, o = S) => `voice:${v.model}:${v.speaker || ''}:${o.voiceTone}:${o.voiceTempo}:${o.voiceHuman}`;
  const sampleURL = (id) => `/api/sample/${id}.wav?k=${KEY}`;
  function sampleId(v, o = S) { // the line, said by voice.mjs with the tone, speed and touch chosen (or a preset's): the film's own way
    return async () => {
      const q = new URLSearchParams({ model: v.model, speaker: v.speaker || '', tone: o.voiceTone, tempo: o.voiceTempo, human: o.voiceHuman, text: sampleLine(v) });
      const mine = asked, say = (t) => mine === asked && noteSample(t); // a sample given up meanwhile says nothing of itself
      say(`Saying it with ${v.label}… the first line loads the model: up to half a minute.`);
      try { const r = await api('voice-sample?' + q); say(''); return r.id; } catch (e) { say(e.data?.message || `It could not be said: ${e.message}`); throw e; }
    };
  }
  const sampleOf = (v, o = S) => async () => sampleURL(await sampleId(v, o)());
  // The ▶ beside the line plays the voice as the film will have it: over the music chosen, when there is a track the
  // Studio can read (a library's, one dropped, a path it measured), mixed by mix.mjs at the level set in With the
  // music. It used to say the line alone whatever music was chosen. voiceAlone: the voice by itself, asked for there.
  let voiceAlone = false;
  // A voice to lay over the music, whichever it is: query(), what names it to /api/voice-mix once it is there to
  // name (a model's line is made first), and alone(), its address by itself.
  const modelVoiceOver = (v) => { let id; return { query: async () => `sample=${id = await sampleId(v)()}`, alone: () => sampleURL(id) }; };
  const macVoiceOver = (query, url) => ({ query: async () => query, alone: () => url });
  /** A sample over the music (/api/voice-mix); the voice by itself instead, and a word of why, when the mix cannot be made. */
  function mixedOf(voice, bed) {
    return async () => {
      const mine = asked, say = (t) => mine === asked && noteSample(t);
      const named = await voice.query();
      say(`Laying it over ${bed.name}…`);
      try { const r = await api(`voice-mix?${named}&${bed.q}&under=${S.musicUnder}&lift=${S.musicLift}`); say(''); return sampleURL(r.id); }
      catch (e) { say(`Heard without the music: ${e.data?.message || e.message}`); return voice.alone(); }
    };
  }
  /** The prompt for a new track, from the film: Gemini made the brand's library from ones like it (its notes file). */
  function musicPrompt() {
    const bpm = S.tone === 'bold' ? 124 : 120, secs = S.duration || 60, bars = Math.max(16, Math.ceil(secs * bpm / 240 / 4) * 4); // 16 bars at the least: a track to choose a stretch of
    const style = { premium: 'Cinematic electronic: warm analog pads, a soft pulsing bass, gentle percussion, a sparse bell arpeggio', swiss: 'Minimal electronic: a clean plucked synth pattern, a tight kick and closed hi-hat, a subtle bass, a lot of air', bold: 'Upbeat synthwave: a driving eighth-note analog bass, punchy drums with a gated-reverb snare on 2 and 4, a bright arpeggio' }[S.tone];
    const voiced = S.voice !== 'none';
    return `Instrumental ${voiced ? 'background for a voice-over' : 'track for a product video'}, ${bpm} BPM, 4/4, ${bars} bars. ${style}. `
      + `Full groove from the very first beat: no intro, no fade-in, no outro, no fade-out, ${S.kind === 'promo' && !voiced ? 'ending exactly on the bar line so it loops seamlessly' : 'ending cleanly on the last bar line'}. `
      + `Constant energy throughout: ${voiced ? 'no lead melody, nothing in the range of a speaking voice, ' : ''}no vocals, no vocal chops, no risers, no drops, no key change.`;
  }
  function setMusic(from) {
    S.musicFrom = from; TOUCHED.add('music');
    S.music = from === 'library' || from === 'file' ? 'track' : from;
    if (from === 'generate' && !S.musicPromptTouched) S.musicPrompt = musicPrompt();
    render();
  }
  /** A model's voice for this film: the one chosen by ear for its kind (Chatterbox a lesson's, Leah a promo's), unless one was picked by hand. */
  function modelVoice() {
    if (S.voice === 'model' && !TOUCHED.has('voiceModel')) Object.assign(S, S.kind === 'tutorial' ? { voiceModel: 'chatterbox' } : { voiceModel: 'orpheus', voiceSpeaker: 'leah' });
  }
  function setVoice(v) {
    S.voice = v; TOUCHED.add('voice');
    hush(); // a sample playing, or still being made, was the voice before
    modelVoice();
    if (v === 'none' && !S.duration && (S.kind === 'promo' || S.kind === 'film')) S.duration = defaultDuration(S.kind); // no voice to last as long as
    voiceChanged();
  }
  function voiceChanged() { // a new track's prompt says whether a voice is over it
    if (!S.musicPromptTouched && S.music === 'generate') S.musicPrompt = musicPrompt();
    render();
  }
  function stepMusic(pane) {
    if (!TRACKLIST) listTracks();
    pane.append(section('Where it comes from'));
    const FROM = [
      { value: 'none', label: 'No music', hint: 'silent' },
      { value: 'library', label: 'Your music library', hint: TRACKLIST?.tracks ? `${TRACKLIST.tracks.length} track${TRACKLIST.tracks.length === 1 ? '' : 's'}` : 'a folder of tracks' },
      { value: 'file', label: 'A file of mine', hint: 'mp3, m4a, wav…' },
      { value: 'generate', label: 'A new one', hint: 'made with Gemini' },
      { value: 'click', label: 'Metronome', hint: 'to check the cuts' },
    ];
    pane.append(seg(FROM, S.musicFrom, setMusic));
    if (S.musicFrom === 'library') {
      if (!TRACKLIST || TRACKLIST.pending) pane.append(h('div', { class: 'note' }, 'Looking in your music library…'));
      else if (!TRACKLIST.store) pane.append(h('div', { class: 'srcline' }, h('span', null, 'No music library yet: a folder with your films’ music, any audio in it, a folder per brand if you like. A file of yours works the same.'),
        folderButton('Choose the library…', 'Your music library', (p) => saveSetting({ musicLibrary: p }), 'link')));
      else if (!TRACKLIST.tracks.length) pane.append(h('div', { class: 'srcline' }, h('span', null, 'No tracks in ', h('code', null, tilde(TRACKLIST.store)), ' yet. Make one (A new one) and save it there.'), settingsLink('musicLibrary', 'Change…')));
      else {
        pane.append(h('div', { class: 'tracks' }, TRACKLIST.tracks.map((t) => h('div', { class: `track${S.musicTrack === t.id ? ' sel' : ''}` },
          playBtn(`track:${t.id}`, `/api/audio/${t.id}?k=${KEY}`, trackTitle(t)),
          h('button', { class: 'pick', 'aria-pressed': String(S.musicTrack === t.id), onclick: () => { S.musicTrack = t.id; TOUCHED.add('music'); render(); } },
            h('span', { class: 'tn' }, trackTitle(t), t.brand ? h('span', { class: `chip${t.own ? ' acc' : ''}` }, t.own ? `${t.brand}, this product’s` : t.brand) : null),
            h('span', { class: 'tm', 'data-meta': t.id }, trackMeta(t.id)),
            t.about ? h('span', { class: 'ta' }, t.about) : null)))));
        pane.append(h('div', { class: 'srcline' }, h('span', null, 'From ', h('code', null, tilde(TRACKLIST.store)), ', with what a notes file beside them says of each. On Create the track is copied beside the film (src/audio) and its beat measured: the cuts land on it.'), settingsLink('musicLibrary', 'Change…')));
      }
    } else if (S.musicFrom === 'file') {
      pane.append(dropZone(S.musicUpload ? `Dropped: ${S.musicUpload.name}. ` : 'Or drop a track here, or', S.musicUpload ? 'Another…' : 'Choose…', $('#audiofile'), '/api/upload-audio', (j) => {
        S.musicUpload = { id: j.id, name: j.name }; S.musicFile = ''; TOUCHED.add('music');
        TRACKMETA.delete(j.id); api('beats?track=' + j.id).then((b) => { TRACKMETA.set(j.id, b); render(); }).catch(() => {});
        render();
      }));
      if (S.musicUpload) pane.append(h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'fixed' }, playBtn(`up:${S.musicUpload.id}`, `/api/audio/${S.musicUpload.id}?k=${KEY}`, S.musicUpload.name)), h('span', { class: 'desc', style: { margin: '0' } }, TRACKMETA.has(S.musicUpload.id) ? trackMeta(S.musicUpload.id) : '')));
      pane.append(h('div', { style: { marginTop: '14px' } }, control('musicFile')));
      pane.append(h('div', { class: 'note' }, 'Royalty-free, or yours to publish: a film goes out with it. Its beat is measured, and on Create it is copied beside the film.'));
    } else if (S.musicFrom === 'generate') {
      if (!S.musicPrompt) S.musicPrompt = musicPrompt();
      const area = h('textarea', { class: 'prompt', oninput: (e) => { S.musicPrompt = e.target.value; S.musicPromptTouched = true; refresh(); } }, S.musicPrompt);
      const copied = h('span', { class: 'desc', style: { margin: 0 } });
      pane.append(h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'The prompt, for Gemini'), area,
        h('div', { class: 'row', style: { marginTop: '8px', justifyContent: 'flex-start' } },
          h('div', { class: 'fixed' }, h('button', { class: 'ghost', onclick: async () => { try { await navigator.clipboard.writeText(S.musicPrompt); } catch { area.select(); document.execCommand('copy'); } copied.textContent = 'Copied.'; } }, 'Copy the prompt')),
          h('div', { class: 'fixed' }, extLink('https://gemini.google.com/app', { class: 'ghost button' }, 'Open Gemini ↗')),
          S.musicPromptTouched ? h('div', { class: 'fixed' }, h('button', { class: 'e', onclick: () => { S.musicPrompt = musicPrompt(); S.musicPromptTouched = false; render(); } }, 'Write it again from the film')) : null,
          copied),
        h('div', { class: 'desc' }, `Written from the film: its tone, its length${S.voice !== 'none' ? ', and a voice over it (no melody in the way of the words)' : ''}. Gemini makes the track in its app; every track it makes carries Google’s inaudible SynthID watermark. Save it in ${TRACKLIST?.store ? tilde(TRACKLIST.store) : 'your music library'}, or tell Claude where it is: Claude measures its beat, writes its line in the notes, and the film takes it.`)));
    } else if (S.musicFrom === 'click') pane.append(h('div', { class: 'note' }, 'A click on every beat of the film’s grid, never loudness-matched: the way to hear whether the cuts land on the beat before any music is chosen.'));
    else pane.append(h('div', { class: 'note' }, 'A silent film: a page or a feed plays it muted anyway. A film that speaks can still have no music.'));

    showLive(stageSpec());
    aboutMusic();
  }
  function aboutMusic() {
    const tr = S.musicFrom === 'library' ? trackById(S.musicTrack) : null;
    about(S.music === 'none' ? 'No music' : 'The music',
      tr ? `${trackTitle(tr)}: ${tr.about || tr.folder || `from ${tr.brand}’s library, with no notes yet`}`
        : S.music === 'generate' ? 'A new track: copy the prompt into Gemini, save what it makes in your music library, and tell Claude.'
        : S.music === 'click' ? 'A click on every beat of the film’s grid: the cuts are heard landing on it, or not.'
        : S.music === 'track' ? 'Its tempo, its bars and its sections are measured: the film takes its beat.'
        : 'A silent film: a page or a feed plays it muted anyway.',
      S.voice !== 'none' && S.music !== 'none' ? h('p', { class: 'note' }, `How far under ${voiceName()} it sits is set with the voice, the next step.`) : null);
  }

  // ---------------------------------------------------------------- step 8: the voice
  // Presets (schema.json, voicePresets) set a model's voice and its reading at once; every setting
  // stays open under them. A preset is shown chosen while every one of its settings still holds.
  const preset = (id) => SCHEMA.voicePresets.find((p) => p.id === id);
  const presetOn = (p) => Object.entries(p.set).every(([k, v]) => S[k] === v);
  const activePreset = () => SCHEMA.voicePresets.find(presetOn);
  function applyPreset(p) {
    if (nowPlaying !== sampleKey(modelOf(p.set), p.set)) hush(); // a sample of the voice before, playing or being made: not this preset's own ▶
    Object.assign(S, p.set);
    for (const k of Object.keys(p.set)) TOUCHED.add(k);
    voiceChanged();
  }
  /** A model voice's reading: its tone, its speed, its touch, as the schema names them. */
  const readings = (o = S) => ['voiceTone', 'voiceTempo', 'voiceHuman'].filter((k) => k !== 'voiceTone' || toned(o.voiceModel)); // Kokoro has no tone to read at
  const reading = (o = S) => readings(o).map((k) => opt(k, o[k]).label);
  const modelOf = (o) => SCHEMA.voices.find((v) => v.model === o.voiceModel && (!v.speaker || v.speaker === o.voiceSpeaker));
  /** A macOS voice's reading: its pace, and its pauses (it has no chuckle to make). Its card's line, and Review's. */
  const macReading = () => [`${opt('voiceRate', S.voiceRate).label} pace`, S.voiceHuman === 'clean' ? 'even pauses' : 'pauses that vary a little'];
  /** The music under a voice, in words: the mix card's line, and Review's. */
  const mixWords = () => `${S.musicUnder} LU under the voice, ${S.musicLift ? `${S.musicLift} dB up between lines` : 'steady between lines'}`;
  /** A voice's card, a preset's or a model's: what it is, a line about it, and its ▶ when it can be heard. */
  const vcard = ({ sel, onclick, name, about, meta, play }) => h('div', { class: `vcard${sel ? ' sel' : ''}` },
    h('button', { class: 'pick', 'aria-pressed': String(sel), onclick }, h('span', { class: 'vn' }, name), h('span', { class: 'va' }, about), h('span', { class: 'vm' }, meta)), play);
  // Hear it, then five cards. Beside the line, always in reach, the ▶ of the voice chosen: whichever card is open (a
  // preset's, the voices, their reading), a change is heard without leaving it, and the line it says is typed right
  // there. The cards are five whoever speaks: a preset, who speaks, how it reads, the lines and subtitles, the music
  // under them; without a voice the last three keep their place and say there is nothing to set.
  function stepVoice(pane) {
    if (!KIT) { KIT = { pending: true, models: {} }; api('voice-models').then((r) => { KIT = r; if (cur === at('voice')) render(); }).catch(() => { KIT = { models: {} }; }); }
    const ready = (m) => KIT && KIT.python && KIT.models?.[m];
    if (S.voice === 'mac' && VOICES?.length && !voiceOf(S.voiceName)) S.voiceName = defaultVoice(); // the cards and the brief name the same voice, its card open or not
    const voiced = S.voice !== 'none', model = S.voice === 'model', mac = S.voice === 'mac', mixed = S.music === 'track' || S.music === 'generate', active = activePreset();
    const v = modelOf(S), macVoice = mac ? voiceOf(S.voiceName) : null;
    const human = S.voiceHuman === 'expressive' ? 'natural' : S.voiceHuman; // a macOS voice has no chuckle to make
    const open = (id, label) => h('button', { class: 'e', onclick: () => toggleFold('voice', id, false) }, label);

    // the music under what is heard: the track chosen, where there is one to read; and what the strip says of it
    const tid = trackId(), typed = S.musicFrom === 'file' && !S.musicUpload ? (S.musicFile || '').trim() : '';
    // (a path typed is taken as it is: the server says whether a file is there, and starts the track on its first bar
    // once its beat is measured. It was waited for here, so a voice step reached before the measure said no track
    // was chosen, and stayed so.)
    const bed = S.music === 'track' && (tid || typed) ? { q: tid ? `track=${tid}` : `path=${encodeURIComponent(typed)}`, name: musicName() } : null;
    const over = bed && !voiceAlone ? bed : null, mixKey = over ? `+${over.q}:${S.musicUnder}:${S.musicLift}` : ''; // a level changed is another thing to hear: what was playing stops
    const macQ = macVoice ? `voice=${encodeURIComponent(macVoice.name)}&rate=${S.voiceRate}` : '', macURL = `/api/voice?k=${KEY}&${macQ}`;
    const bedLine = !(model || mac) || S.music === 'none' ? null
      : bed ? h('div', { class: 'au-bed' }, over ? `Heard over ${bed.name}, ${mixWords()}: the film’s own mix. ` : `Heard alone, without ${bed.name}. `,
        h('button', { class: 'e', onclick: () => { voiceAlone = !voiceAlone; hush(); render(); } }, over ? 'Hear the voice alone' : 'Hear it over the music'))
        : h('div', { class: 'au-bed' }, `The music is not in what you hear: ${S.music === 'generate' ? 'the new track is not made yet' : S.music === 'click' ? 'a metronome is never mixed under a voice' : 'no track is chosen yet'}. `,
          S.music === 'track' ? h('button', { class: 'e', onclick: () => go(at('music')) }, 'Choose it') : null);

    // hear it: the voice chosen, the line it says, its ▶; what a sample says of itself under them
    const line = h('input', { type: 'text', value: sampleLine(v), spellcheck: 'false', 'aria-label': 'The line to hear', oninput: (e) => { S.sampleText = e.target.value.slice(0, 300); hush(); } }); // a sample of the line before stops
    const hear = model ? (ready(v.model) ? playBtn(sampleKey(v) + mixKey, over ? mixedOf(modelVoiceOver(v), over) : sampleOf(v), `${v.label} saying the line${over ? `, over ${over.name}` : ''}`, 'play big') : null)
      : macVoice ? playBtn(`mac:${macVoice.name}:${S.voiceRate}${mixKey}`, over ? mixedOf(macVoiceOver(macQ, macURL), over) : macURL, `${macVoice.short}${over ? `, over ${over.name}` : ''}`, 'play big') : null;
    const cannot = model ? (KIT.pending ? 'Looking for the voice models on this Mac…' : 'Not on this Mac yet: nothing to hear') : mac ? 'Reading this Mac’s voices…' : voiced ? 'Nothing to hear: the recordings are yours to make' : 'No voice chosen: a preset’s ▶ says the line';
    pane.append(h('section', { class: 'audition', 'aria-label': 'Hear it' }, h('div', { class: 'au-box' },
      hear || h('button', { class: 'play big', disabled: true, title: cannot, 'aria-label': cannot }, '▶'),
      h('div', { class: 'au-main' },
        h('div', { class: 'au-who' }, h('span', { class: 'au-k' }, 'Hear it'), h('b', null, voiced ? voiceName() : 'No voice'),
          h('span', null, model ? reading().join(' · ') : mac ? `${opt('voiceRate', S.voiceRate).label} pace` : voiced ? 'a file a line' : 'a preset’s ▶ says this line')),
        model || !voiced ? line : h('div', { class: 'au-say' }, mac ? 'It says a greeting of its own, at the pace set in How it reads.' : 'Yours to record: nothing to hear here.'),
        bedLine,
        h('div', { class: 'desc', id: 'sample-note' }, model || over ? sampleNote || '' : ''), // a sample's progress or failure, whichever ▶ asked
        model && !KIT.pending && !KIT.python ? h('div', { class: 'warn' }, 'Not set up on this Mac yet: Claude does it at the first film that speaks (a 600 MB Python, then 330 MB to 3.5 GB a model, once). Until then nothing can be heard here.') : null))));

    const presets = (b) => b.append(
      h('div', { class: 'vcards presets' }, SCHEMA.voicePresets.map((p) => { const pv = modelOf(p.set); return vcard({
        sel: active === p, onclick: () => applyPreset(p), name: p.label, about: p.about, meta: [voiceName(false, p.set), ...reading(p.set)].join(' · '),
        play: ready(pv.model) ? playBtn(sampleKey(pv, p.set), sampleOf(pv, p.set), `the ${p.label} preset saying the line above`) : null,
      }); })),
      h('div', { class: 'desc' }, `A preset sets who speaks and how it reads at once, and each ▶ says ${model || !voiced ? 'the line above' : `“${sampleLine()}”`} its way. Every setting stays open in the cards beside this one.`));
    const who = (b) => {
      b.append(seg(F.voice.options, S.voice, setVoice));
      if (model) b.append(h('div', { class: 'vcards models' }, SCHEMA.voices.map((x) => vcard({
        sel: v === x, onclick: () => { S.voiceModel = x.model; if (x.speaker) S.voiceSpeaker = x.speaker; TOUCHED.add('voiceModel'); TOUCHED.add('voiceSpeaker'); render(); },
        name: [x.label, x.chosen ? h('span', { class: 'chip acc' }, 'chosen by ear') : null], about: x.about,
        meta: `${opt('voiceModel', x.model).label}${x.lang && x.lang !== 'en-US' ? ` · ${x.lang}` : ''}${KIT && KIT.python && !ready(x.model) ? ` · not on this Mac yet (${opt('voiceModel', x.model).size})` : ''}`,
        play: ready(x.model) ? playBtn(sampleKey(x), sampleOf(x), `${x.label} saying the line above`) : null,
      }))), h('div', { class: 'desc' }, 'Each ▶ says the line above, read as How it reads has it: what you hear is what the film gets.'));
      else if (mac) b.append(control('voiceName'));
      else if (voiced) b.append(h('div', { class: 'note' }, 'One recording a line, yours or another synthesizer’s: Claude writes the lines first and names the files (01-<line>.wav…); the subtitles and the film’s clock come from them.'));
      else b.append(h('div', { class: 'note' }, 'Nothing is said: the type and the pictures tell it. A voice can be added to any film, a promo included. ', open('preset', 'See the presets')));
    };
    const reads = (b) => {
      if (model) b.append(...readings().map(control), h('div', { class: 'note' }, `The ▶ beside the line says it this way, with ${voiceName()}.${toned(S.voiceModel) ? '' : ` ${opt('voiceModel', S.voiceModel).label} has no tone to set: it has no sampling temperature.`}`));
      else if (mac) b.append(control('voiceRate'), h('div', { class: 'field' }, h('span', { class: 'flabel' }, F.voiceHuman.label), seg(F.voiceHuman.options.filter((o) => o.value !== 'expressive'), human, (x) => { S.voiceHuman = x; TOUCHED.add('voiceHuman'); render(); }), h('div', { class: 'desc' }, 'A macOS voice keeps its pace; Natural varies the pauses between its lines.')));
      else b.append(h('div', { class: 'note' }, voiced ? 'Your recordings are read as you recorded them: nothing to set here.' : 'A reading is a voice’s: its tone, its speed, its human touch. ', voiced ? null : open('who', 'Choose who speaks')));
    };
    const lines = (b) => {
      if (!voiced) return b.append(h('div', { class: 'note' }, 'No voice, so no lines to say and none to subtitle. ', open('who', 'Choose who speaks')));
      if (S.kind !== 'tutorial' || S.voiceScript) b.append(h('div', { class: 'field' }, h('span', { class: 'flabel' }, F.voiceScript.label), h('textarea', { placeholder: F.voiceScript.placeholder, oninput: (e) => { S.voiceScript = e.target.value; TOUCHED.add('voiceScript'); refresh(); } }, S.voiceScript || ''), h('div', { class: 'desc' }, S.kind === 'tutorial' ? 'A tutorial’s lines are written from its lesson; these are said as written.' : F.voiceScript.description)));
      b.append(control('captions'));
    };
    const mix = (b) => {
      const music = h('button', { class: 'e', onclick: () => go(at('music')) }, 'Choose the music');
      if (!voiced) b.append(h('div', { class: 'note' }, `No voice for the music to sit under: ${S.music === 'none' ? 'and no music either' : 'it plays at its own level'}. `, open('who', 'Choose who speaks')));
      else if (mixed) b.append(control('musicUnder'), control('musicLift'), h('div', { class: 'note' }, `Mixed before the render (mix.mjs): both are measured, the music sits this far under the voice while it speaks and comes up where nobody does, going down before each line begins.${bed ? ' The ▶ beside the line plays it this way: the line, then a moment of the music alone.' : ''}`));
      else b.append(h('div', { class: 'note' }, `${S.music === 'click' ? 'A metronome, never mixed: it is there to hear the cuts.' : 'No music under it.'} `, music));
    };
    const caps = opt('captions', S.captions).label;
    pane.append(deck('voice', [
      deckCard('preset', 'Preset', active ? `${active.label} · ${active.about}` : model ? 'Custom · who speaks and how it reads are your own' : `None · ${voiced ? 'a preset is a voice model’s' : 'a voice and its reading at once'}`, presets, { na: !active }),
      deckCard('who', 'Who speaks', model ? `${voiceName()} · a voice model, ${opt('voiceModel', v.model).label}` : mac ? `${voiceName()} · a macOS voice${macVoice?.quality ? `, ${macVoice.quality}` : ''}` : voiced ? 'My own recordings · a file a line' : 'No voice · the pictures and the type tell it', who, { na: !voiced }),
      deckCard('reading', 'How it reads', model ? `${toned(S.voiceModel) ? `${opt('voiceTone', S.voiceTone).label} · ` : ''}${opt('voiceTempo', S.voiceTempo).label.toLowerCase()} speed, ${opt('voiceHuman', S.voiceHuman).label.toLowerCase()}` : mac ? macReading().join(' · ') : voiced ? 'As recorded · nothing to set' : 'No voice · nothing to read', reads, { na: !model && !mac }),
      deckCard('lines', 'Lines and subtitles', () => (voiced ? `${S.voiceScript.trim() ? 'Your lines' : S.kind === 'tutorial' ? 'From the lesson' : 'Claude writes them'} · ${S.captions === 'none' ? 'no subtitles' : `subtitles ${caps[0].toLowerCase()}${caps.slice(1)}`}` : 'No voice · nothing said, nothing to subtitle'), lines, { na: !voiced }),
      deckCard('mix', 'With the music', !voiced ? `No voice · ${S.music === 'none' ? 'and no music' : 'the music plays alone'}` : mixed ? `${opt('musicUnder', S.musicUnder).label} · ${mixWords()}` : S.music === 'click' ? 'Not mixed · a metronome, to hear the cuts' : 'No music · nothing under the voice', mix, { na: !voiced || !mixed }),
    ]));
    if (/^(voice|mac):/.test(nowPlaying || '') && !pane.querySelector(`[data-play="${CSS.escape(nowPlaying)}"]`)) hush(); // its voice or its reading changed, or its card closed: no ▶ says it any more
    showLive(stageSpec());
    aboutVoice();
  }
  function aboutVoice() {
    const voiced = S.voice !== 'none', p = activePreset();
    about(voiced ? `Told by ${voiceName()}` : 'No voice',
      voiced ? `${S.captions === 'none' || S.captions === 'file' ? 'No subtitles on the frame' : 'The subtitles on the stage are where the film’s go'}: the stage’s own three lines stand in for the film’s, which Claude writes${S.voiceScript.trim() ? ' from yours' : ''} and shows you before anything is said.` : 'Nothing is said: the type and the pictures tell it. A voice can be added to any film, a promo included: a preset sets one at once.',
      voiced && p ? h('p', { class: 'note' }, `${p.label}: ${p.about}`) : null);
  }

  // ---------------------------------------------------------------- step 9: length and output, from the schema
  /** Whether a field is shown: its showIf holds (a tutorial's task, a track's file). */
  const shown = (k) => !F[k].showIf || Object.entries(F[k].showIf).every(([kk, v]) => S[kk] === v);
  function control(k) {
    const f = F[k];
    if (!shown(k)) return null;
    const wrap = h('div', { class: 'field' }, h('span', { class: 'flabel' }, f.label));
    if (f.type === 'enum' || f.type === 'multi') {
      let opts = f.options;
      if (k === 'duration') {
        opts = opts.filter((o) => f.byKind[S.kind].includes(o.value) && (o.value || S.kind === 'release' || S.kind === 'tutorial' || S.voice !== 'none'))
          .map((o) => (o.value || S.kind === 'release' ? o : S.kind === 'tutorial' ? { ...o, label: 'From the story', hint: 'as long as the voice takes' } : { ...o, label: 'From the voice', hint: 'as long as its lines take' }));
        const R = durRange(S.kind); // any other length, typed: the lengths above were the only ones there were
        if (R) opts = [...opts, { value: 'custom', label: 'Custom', hint: `${durLabel(R[0])} to ${durLabel(R[1])}` }];
      }
      wrap.append(h('div', { class: 'seg' }, opts.map((o) => {
        const on = f.type === 'multi' ? S[k].includes(o.value) : k === 'duration' ? (o.value === 'custom' ? isCustom() : !isCustom() && S[k] === o.value) : S[k] === o.value;
        const shape = k === 'aspects' ? h('span', { class: 'shape', style: { width: `${Math.round(o.w / Math.max(o.w, o.h) * 22)}px`, height: `${Math.round(o.h / Math.max(o.w, o.h) * 22)}px` } }) : null;
        return h('button', {
          class: on ? 'sel' : '', 'aria-pressed': String(on),
          // an aspect is looked at by resting on it: a click adds it or drops it, and used to be the only way to see it
          ...(k === 'aspects' ? { onmouseenter: (e) => hover(stageSpec({ aspect: o.value }), e.currentTarget), onmouseleave: (e) => unhover(e.currentTarget) } : {}),
          onclick: () => {
            const was = S[k];
            TOUCHED.add(k);
            if (f.type === 'multi') {
              if (on && S[k].length <= (f.min || 0)) return;
              S[k] = on ? S[k].filter((v) => v !== o.value) : f.options.map((x) => x.value).filter((v) => S[k].includes(v) || v === o.value);
            } else if (k === 'duration') { // Custom starts from the length there is
              if (o.value !== 'custom') S[k] = o.value; else if (!inRange(S.kind, S.duration)) S.duration = defaultDuration(S.kind);
              lengthOpen = o.value === 'custom' ? lengthKey() : null;
            } else S[k] = o.value;
            if (k === 'kind') onKind(was);
            if (k === 'aspects') viewAspect = on ? null : o.value;
            render();
          },
        }, shape, h('span', null, o.label), o.hint ? h('small', null, o.hint) : null);
      })));
      if (k === 'duration' && isCustom()) wrap.append(lengthFields());
    } else if (f.type === 'string') {
      const input = h('input', { type: 'text', value: S[k] || '', placeholder: f.placeholder || '', oninput: (e) => {
        S[k] = e.target.value; TOUCHED.add(k);
        if (k === 'musicFile' && S.musicUpload) { S.musicUpload = null; render(); } else refresh(); // a path typed is the track now, not the one dropped before
      } });
      wrap.append(input);
      if (k === 'musicFile') { // the track's beat, measured by the Studio: the film takes its tempo and starts on a bar
        const note = h('div', { class: 'desc beat' });
        const measure = debounce(async () => {
          S.musicBeats = null; const path = (S.musicFile || '').trim();
          if (!path) { note.textContent = 'Its tempo, its bars and its sections are measured, so the cuts land on its beat.'; return; }
          note.textContent = 'Listening…';
          try {
            const r = await fetch(`/api/beats?path=${encodeURIComponent(path)}`, { headers: { 'x-studio-key': KEY } }), b = await r.json();
            if (path !== (S.musicFile || '').trim()) return;
            if (!r.ok) { note.textContent = b.error === 'no such file' ? 'No such file.' : b.error === 'a folder' ? 'A folder: name the track in it.' : 'Not audio that ffmpeg can read.'; return; }
            S.musicBeats = b;
            if (cur === at('review')) render(); // where the track's tempo is said, should the measure land there
            note.textContent = !b.bpm ? `No beat to follow: ${b.why}. The film keeps its own grid.`
              : `${b.bpm} BPM, ${b.steady ? 'steady' : `drifting (${b.drift} ms off one grid): the film follows its beats`} · first bar at ${b.at.toFixed(2)} s${b.sections.length ? ` · sections at ${b.sections.slice(0, 4).map(clock).join(', ')}` : ''}`;
          } catch { note.textContent = ''; }
        }, 400);
        input.addEventListener('input', measure);
        wrap.append(note); measure();
      }
    } else if (f.type === 'voice') { // this Mac's voices, by language, each to be heard before it is chosen
      if (!VOICES) wrap.append(h('div', { class: 'note' }, 'Reading this Mac’s voices…'));
      else if (!VOICES.length) wrap.append(h('div', { class: 'note' }, 'No voice found: `say` is a Mac’s. Record the steps yourself, or leave the voice out.'));
      else {
        const langs = [...new Set(VOICES.map((v) => v.lang))].sort();
        if (!voiceOf(S.voiceName)) S.voiceName = defaultVoice(); else voiceLang = voiceOf(S.voiceName).lang;
        const mine = voicesIn(voiceLang), best = mine[0].tier;
        const say = new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' });
        wrap.append(
          h('select', { 'aria-label': 'Language', onchange: (e) => { voiceLang = e.target.value; S.voiceName = ''; TOUCHED.add(k); render(); } }, langs.map((l) => h('option', { value: l, selected: l === voiceLang }, `${say.of(l.replace('_', '-'))} · ${VOICES.filter((v) => v.lang === l).length}`))),
          h('div', { class: 'fonts voices' }, mine.map((v) => h('div', { class: `voice${S.voiceName === v.name ? ' sel' : ''}` },
            h('button', { class: 'pick', 'aria-pressed': String(S.voiceName === v.name), onclick: () => { S.voiceName = v.name; TOUCHED.add(k); render(); } }, h('span', { class: 'fn' }, v.short), v.quality ? h('span', { class: 'chip acc' }, v.quality) : null),
            h('button', { class: 'hear', 'data-play': `mac:${v.name}:${S.voiceRate}`, title: `Hear ${v.short}`, 'aria-label': `Hear ${v.short}`, onclick: () => toggle(`mac:${v.name}:${S.voiceRate}`, `/api/voice?k=${KEY}&voice=${encodeURIComponent(v.name)}&rate=${S.voiceRate}`) }, '▶')))),
          // what this Mac lacks, said where the voice is chosen: voices are downloaded per Mac, so a second Mac says it again
          h('div', { class: `desc more${best ? ' lacks' : ''}` }, // best: 0 a Premium voice is here, 1 Enhanced, 2 or 3 only what every Mac has
            best >= 2 ? h('b', {}, `Only compact voices for ${say.of(voiceLang.replace('_', '-'))} on this Mac. `) : best === 1 ? h('b', {}, 'The best here is Enhanced; Premium sounds better still. ') : null,
            best ? `Better voices are a free download, once on each Mac: ${f.where} ${best === 1 ? 'Take one marked Premium.' : 'Take one marked Premium, or Enhanced.'} ` : 'Voices are downloaded on each Mac: a film told by this one on another Mac needs it there too. ',
            voiceLang.startsWith('en') ? 'In English, a voice model (above) sounds closer to a person than any of these. ' : null,
            best ? h('button', { class: 'e', onclick: () => api('voices?fresh=1').then((r) => { VOICES = r.voices; render(); }).catch(() => {}) }, 'Look again') : null));
      }
    } else if (f.type === 'text') {
      wrap.append(h('textarea', { placeholder: f.placeholder || '', oninput: (e) => { S[k] = e.target.value; TOUCHED.add(k); refresh(); } }, S[k] || ''));
    }
    if (f.description) wrap.append(h('div', { class: 'desc' }, f.description));
    if (k === 'duration') wrap.append(h('div', { class: 'desc', id: 'len-est' }, estimate()));
    if (k === 'kind' && S.kind !== 'tutorial') wrap.append(h('div', { class: 'desc' }, `Its sound: ${S.voice === 'none' ? 'no voice' : `told by ${voiceName()}`}, ${musicName()}. `, h('button', { class: 'e', onclick: () => go(at('voice')) }, 'The voice'), ' · ', h('button', { class: 'e', onclick: () => go(at('music')) }, 'the music')));
    return wrap;
  }
  /** A length typed: seconds for a promo's loop, minutes and seconds for a film in chapters or a tutorial. It is the
   *  film's length as soon as it is within the kind's range; outside it the range is said, and the last one that
   *  fitted stays. Nothing is redrawn under the typing: the card, the request line and the estimate follow. */
  function lengthFields() {
    const [lo, hi] = durRange(S.kind), mins = F.duration.units?.[S.kind] === 'min+s';
    const field = (label, value) => h('input', { type: 'text', inputmode: 'numeric', class: 'num', maxlength: '3', value: String(value), 'aria-label': label });
    const m = mins ? field('Minutes', Math.floor(S.duration / 60)) : null, s = field('Seconds', mins ? S.duration % 60 : S.duration);
    const note = h('span', { class: 'desc', id: 'len-note' });
    const say = (v) => {
      const ok = inRange(S.kind, v);
      note.textContent = ok ? lengthWords(S.kind, v) : `From ${durLabel(lo)} to ${durLabel(hi)}: it stays ${durLabel(S.duration)} until then.`;
      note.classList.toggle('warn', !ok);
      return ok;
    };
    const take = () => {
      const v = (m ? (parseInt(m.value, 10) || 0) * 60 : 0) + (parseInt(s.value, 10) || 0);
      if (!say(v)) return;
      S.duration = v; TOUCHED.add('duration'); lengthOpen = lengthKey(); // the fields stay open on what they hold
      const est = $('#len-est'); if (est) est.textContent = estimate();
      refresh();
    };
    // What is typed stays as typed while the focus is on the pair: a total out of range on the way to another one
    // (the minutes set to 0 before the seconds are typed) is said, not undone. It was put back at each field left,
    // so from 2 min 0 s, a 0 in the minutes came back as 2 on the way to the seconds, and 45 there made 2 min 45 s.
    // Once the focus leaves the pair, what stands in it is what was taken: 90 in the seconds reads 1 min 30 s.
    const tidy = () => { if (m) { m.value = String(Math.floor(S.duration / 60)); s.value = String(S.duration % 60); } else s.value = String(S.duration); say(S.duration); };
    for (const el of [m, s]) if (el) el.addEventListener('input', take);
    say(S.duration);
    return h('div', { class: 'len', onfocusout: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) tidy(); } }, m, m ? h('span', null, 'min') : null, s, h('span', null, 's'), note);
  }
  function onKind(was) {
    if (!keepsLength(S.kind, S.duration, was)) S.duration = defaultDuration(S.kind);
    // a tutorial is told: by the lesson's voice, unless one was chosen by hand
    if (S.kind === 'tutorial' && S.voice === 'none' && !TOUCHED.has('voice')) Object.assign(S, preset('lesson').set);
    modelVoice();
    if (FIXED[S.kind]) { S.formats = [FIXED[S.kind]]; TOUCHED.delete('formats'); }
    else S.formats = FIXED[was] ? [] : S.formats.filter((f) => f !== 'whatsnew'); // the one format a release or a tutorial had was not a choice: it does not follow into a promo
    if (S.kind === 'release') S.release = S.release || { tag: S.product?.tag || null };
    autoName();
  }
  function estimate() { // README, Heat: the reel at the cool defaults renders at about 29x its length (1080p60, 16 subframes)
    if (S.kind === 'release') return 'Length follows the changes: about 6–8 s each, plus the version card.';
    if (!S.duration && S.kind !== 'tutorial') return 'Length follows the voice: each line lasts as long as it takes to say, and the pictures follow it. About 29× the film’s length to render at 1080p60.';
    if (S.kind === 'tutorial' && !S.duration) return 'Length follows the story: a voice says 160 to 190 words a minute, by its pace, so a page of script (300 words) is under two minutes. A render takes about 29× the film’s length at 1080p60 and half that at 30 fps: five minutes of tutorial at 30 fps is over an hour, after a fast draft.';
    const per = S.aspects.map((a) => { const [w, h2] = aspectDims(a); return S.duration * 29 * (S.fps / 60) * (w * h2 * (S.resolution / 1080) ** 2) / (1920 * 1080); });
    const m = (s) => `${Math.max(1, Math.round(s / 60))} min`;
    return `Rough render time at the cool defaults: ${per.map(m).join(' + ')} (${S.aspects.join(' + ')}), after a fast draft. Measured: about 29× the film’s length at 1080p60.`;
  }
  const OUTPUT = [['film', 'The film', ['kind', 'duration']], ['lesson', 'The lesson', ['task']], ['picture', 'The picture', ['aspects', 'resolution', 'fps', 'files']], ['direction', 'The direction', ['tone']], ['claude', 'Reference and notes', ['reference', 'notes']]];
  /** The first line of something typed, in quotes, cut at n characters; '' for nothing. */
  const quoted = (v, n = 42) => { const t = String(v || '').trim().split('\n')[0]; return t ? `“${t.length > n ? `${t.slice(0, n - 1)}…` : t}”` : ''; };
  /** A field's value in a few words, for a folded card's line. */
  function valueOf(k) {
    const f = F[k], v = S[k];
    if (k === 'duration') return lengthLabel(S.kind, v);
    if (f.type === 'multi') return v.map((x) => opt(k, x)?.label || x).join(' + ') || 'none';
    if (f.type === 'enum') return opt(k, v)?.label ?? String(v);
    return quoted(v);
  }
  // What a card of the output says while its fields are empty: who decides then, never "Nothing yet". The reference
  // (a film, a site or a style the film takes after) is Claude's to pick when none is given, and to explain either way.
  const EMPTY = { lesson: 'Not said yet · Claude asks what it teaches' };
  const claudeSays = () => `${S.reference.trim() ? `After ${quoted(S.reference, 34)}` : 'Claude picks a reference'} · ${S.reference.trim() ? 'and says what it takes from it' : 'a real, named one, and says what it takes'}${S.notes.trim() ? `; your notes: ${quoted(S.notes, 30)}` : ''}`;
  function stepOutput(pane) {
    pane.append(deck('output', OUTPUT.flatMap(([id, title, keys]) => {
      const ks = keys.filter(shown);
      return ks.length ? [deckCard(id, title, id === 'claude' ? claudeSays : () => ks.map(valueOf).filter(Boolean).join(' · ') || EMPTY[id] || 'Nothing yet', (b) => b.append(...ks.map(control).filter(Boolean)))] : [];
    }), 'picture'));
    showLive(stageSpec());
    about('Aspect', 'Rest the pointer on an aspect to see the stand-in product laid out for it; a click adds it to the film or drops it. A second aspect is a second layout of the same film, never a crop of the first.');
  }

  // ---------------------------------------------------------------- step 10: review and create
  let errors = [], sent = null, saving = false; // saving: the brief is on its way, and no redraw may offer it again
  function brief() {
    return {
      recipe: S.recipe, kind: S.kind, name: S.name, product: S.product,
      release: S.kind === 'release' ? S.release : undefined,
      formats: FIXED[S.kind] ? [FIXED[S.kind]] : S.formats, frame: S.frame,
      ...(S.kind === 'tutorial' ? { task: S.task } : {}),
      // the voice: a Mac's, when the step that lists them was never opened, is the default it would have shown
      voice: S.voice, voiceName: S.voice === 'mac' ? (voiceOf(S.voiceName) ? S.voiceName : defaultVoice()) : null, voiceRate: S.voiceRate,
      voiceModel: S.voiceModel, voiceSpeaker: S.voiceSpeaker, voiceTone: S.voiceTone, voiceTempo: S.voiceTempo, voiceHuman: S.voiceHuman, voiceScript: S.voiceScript, captions: S.captions,
      look: S.backdrop ? 'photo' : S.look,
      backdrop: S.backdrop ? { image: S.backdrop.image, blur: S.backdrop.blur, treatment: S.backdrop.treatment, drift: S.backdrop.drift } : null,
      accent: S.readBrand ? null : S.accent, accentHint: S.accent, accentFrom: S.accentFrom, scheme: S.scheme,
      type: typeNow() ? { set: S.type.set, display: S.type.display, text: S.type.text, mono: S.type.mono } : null,
      motion: S.motion,
      duration: S.duration, aspects: S.aspects, tone: S.tone, fps: S.fps, resolution: S.resolution, files: S.files,
      music: S.music, musicFile: S.musicFrom === 'file' && !S.musicUpload ? S.musicFile : '',
      musicTrack: trackId(),
      musicPrompt: S.music === 'generate' ? S.musicPrompt || musicPrompt() : '', musicUnder: S.musicUnder, musicLift: S.musicLift,
      reference: S.reference, notes: S.notes, request: request(),
    };
  }
  function musicReview() {
    if (S.music !== 'track') return opt('music', S.music).label;
    const id = trackId(), m = id ? TRACKMETA.get(id) : S.musicBeats, tr = trackById(id);
    return `${musicName()}${tr ? ` (${tr.brand})` : ''}${m?.bpm ? ` — ${m.bpm} BPM${m.steady ? '' : ', drifting'}` : ''}`;
  }
  function stepReview(pane) {
    if (sent) return pane.append(sent);
    const M = S.motion, frame = frameOf(S.frame);
    const rows = [
      ['Film', recipe().label === opt('kind', S.kind).label ? recipe().label : `${recipe().label}: ${opt('kind', S.kind).label.toLowerCase()}`, 'film'],
      ['Product', S.product ? `${S.product.name} — ${tilde(S.product.path || S.product.url)}` : '—', 'product', S.product && !S.product.path ? 'site' : 'repo'],
      ...(S.kind === 'release' ? [['Version', S.release?.tag || 'the latest tag', 'product', 'version']] : []),
      ['Formats', FIXED[S.kind] ? fmt(FIXED[S.kind]).label : S.formats.length ? S.formats.map((f, i) => `${i + 1}. ${fmt(f).label}`).join('   ') : 'Claude picks three', 'format', 'formats'],
      ['Device', frame ? `${frame.label}${frame.touch ? ', taps for clicks' : ''}` : 'Claude picks: each format’s own', 'format', 'device'],
      ['Backdrop', S.backdrop ? `your picture ${S.backdrop.name} — ${pictureWords(S.backdrop)}` : S.look || 'chosen on a sheet of the first real frame', 'look', S.backdrop ? 'mine' : 'kit'],
      ['Colour', S.readBrand ? `read from the brand${S.accent ? ` (hint ${S.accent})` : ''}` : `${S.accent}, ${S.scheme}`, 'product', 'colour'],
      ['Type', typeNow() ? (S.type.set ? `${typeset(S.type.set).label} — ${S.type.display.family} / ${S.type.text.family}` : `${S.type.display.family} ${S.type.display.weight} (${S.type.display.source === 'mac' ? 'this Mac' : 'the kit'})`) : 'read from the brand', 'type', typeNow() && !S.type.set ? 'family' : 'sets'],
      ['Headlines', `${M.text ? textStyle(M.text).label : 'Claude picks'}${M.emphasis ? `, ${emphWords()}` : ''}`, 'motion', 'headlines'],
      ['Cuts', M.transition ? transition(M.transition).label : 'Claude picks', 'motion', 'cuts'],
      ['Pace', paceLabel(), 'motion', 'pace'],
      ['Motion blur', `${shutterOpt(M.shutter).label} (${M.shutter}° shutter)`, 'motion', 'pace'],
      ['Length', FIXED[S.kind] || !S.duration ? lengthLabel(S.kind, S.duration) : lengthWords(S.kind, S.duration), 'output', 'film'],
      ...(S.kind === 'tutorial' ? [['Lesson', S.task.trim() ? S.task.trim().split('\n')[0] : 'not said: Claude asks what it teaches', 'output', 'lesson']] : []),
      ['Music', musicReview(), 'music'],
      ['Voice', S.voice === 'model' ? voiceName(true) : S.voice === 'mac' ? `${voiceName()}${voiceOf(S.voiceName)?.quality ? ` ${voiceOf(S.voiceName).quality}` : ''}` : opt('voice', S.voice).label, 'voice', 'who'],
      ...(S.voice === 'model' || S.voice === 'mac' ? [['Reading', (S.voice === 'mac' ? macReading() : reading()).join(', ').toLowerCase(), 'voice', 'reading']] : []),
      ...(S.voice !== 'none' ? [
        ['Lines', S.voiceScript.trim() ? S.voiceScript.trim().split('\n')[0] : S.kind === 'tutorial' ? 'from the lesson' : 'Claude writes them and shows them to you first', 'voice', 'lines'],
        ['Subtitles', opt('captions', S.captions).label, 'voice', 'lines'],
        ...(S.music === 'track' || S.music === 'generate' ? [['Mix', `the music ${mixWords()}`, 'voice', 'mix']] : []),
      ] : []),
      ['Aspect', S.aspects.join(' + '), 'output', 'picture'],
      ['Tone', opt('tone', S.tone).label, 'output', 'direction'],
      ['Video', `${S.resolution}p, ${S.fps} fps, ${S.files.map((f) => opt('files', f).label).join(' + ')}`, 'output', 'picture'],
      ...(S.reference ? [['Reference', S.reference, 'output', 'claude']] : []),
      ...(S.notes ? [['Notes', S.notes, 'output', 'claude']] : []),
    ];
    // a row: what, its value, the step it is set in, and the card there it is in, which Edit opens
    pane.append(h('div', { class: 'summary' }, rows.map(([k, v, step, card]) => h('div', { class: 'r' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v), h('button', { class: 'e', onclick: () => { if (card) FOLD[step] = card; go(at(step), card && `[data-fold="${card}"]`); } }, 'Edit')))));
    const out = tilde(CTX.out);
    // where it goes, as the server will write it in the brief: the work root, or the music library when it takes films
    const deliverTo = h('code', null, CTX.library ? `${tilde(CTX.library)}/…/video/${S.name}/` : `${out}/${S.name}/`);
    api(`exists?name=${encodeURIComponent(S.name)}&product=${encodeURIComponent(S.product?.name || '')}`).then((e) => { if (e.to) deliverTo.textContent = `${tilde(e.to)}/`; }).catch(() => {});
    pane.append(h('div', { class: 'paths' },
      h('p', null, 'The brief goes to ', h('code', null, `${out}/${S.name}-work/brief.json`), ', the folder the film is made in', S.backdrop || S.type ? ', with the picture and the fonts it needs in src/' : '', '. The finished film arrives in ', deliverTo, ', alone.'),
      h('p', null, 'Next, Claude reads the brief and answers with three storyboards — or one, for a product that already has a kit. What the film needs and the product’s own sources do not hold, a logo as vector say, Claude asks you for first. Nothing renders until you have picked one and seen the stills.')));
    if (S.voice === 'mac' && VOICES?.length && !voiceOf(S.voiceName || defaultVoice())?.quality) pane.append(h('div', { class: 'warn' }, 'Told by a compact voice: a Premium one is a free download, and sounds a good deal better. ', h('button', { class: 'e', onclick: () => go(at('voice')) }, 'See which')));
    if (S.music === 'track' && !(trackId() || (S.musicFrom === 'file' && (S.musicFile || '').trim()))) pane.append(h('div', { class: 'warn' }, 'The music is a track, but none is chosen: Claude will ask for it. ', h('button', { class: 'e', onclick: () => go(at('music')) }, 'Choose it')));
    if (S.music === 'generate') pane.append(h('div', { class: 'warn' }, 'The music is a new track: Claude waits for the one Gemini makes from the prompt, saved in your music library.'));
    if (S.voice === 'model' && KIT && !KIT.python) pane.append(h('div', { class: 'warn' }, 'The voice model is not set up on this Mac: Claude sets it up before the first line (a 600 MB Python, then about 3 GB a model).'));
    if (errors.length) pane.append(h('div', { class: 'errors' }, errors.map((e) => h('div', null, e))));
    showLive(stageSpec());
    about('Ready', request());
  }
  async function create() {
    if (saving) return;
    errors = []; saving = true;
    $('#next').disabled = true;
    try {
      const r = await api('brief', { method: 'POST', body: JSON.stringify(brief()) });
      const cmd = `claude "/manovella:site-promo-film brief ${tilde(r.path)}"`;
      sent = h('div', { class: 'sent' }, h('h2', null, 'Brief saved'),
        h('p', null, h('code', null, tilde(r.path))),
        h('p', null, 'Back to Claude Code: it is reading the brief now, and this window closes on its own.'),
        h('p', null, 'Opened the Studio outside a Claude session? Start one with:'), h('p', null, h('code', null, cmd)));
      live.playing = false; clearInterval(beat);
      render();
    } catch (e) {
      errors = e.data?.errors || [e.message];
      render();
    } finally { saving = false; if (!sent) refresh(); }
  }

  // ---------------------------------------------------------------- the frame around the steps
  const STEPS = [
    { id: 'film', title: 'What film?', lede: 'Start from a recipe: it fills every choice with a sensible default, and every choice stays open.', render: stepFilm, ok: () => !!S.recipe, why: () => 'Pick a recipe to start', value: () => recipe()?.label },
    { id: 'product', title: 'Which product?', lede: 'Its repository is where the brand, the strings and the screens come from. A website works too.', render: stepProduct, ok: () => !!S.product && SLUG.test(S.name || ''), why: () => (!S.product ? 'Pick a repository, or type a website' : 'Give the film a name: lowercase letters, digits, dots and dashes'), value: () => S.product && (S.product.name + (S.kind === 'release' && S.release?.tag ? ` ${S.release.tag}` : '')), swatch: () => S.product && S.accent },
    { id: 'format', title: 'Which format?', lede: 'The shape of the film, the first thing to vary between films, and what the product is shown in. Hover to watch one.', render: stepFormat, ok: () => true, value: () => [FIXED[S.kind] ? fmt(FIXED[S.kind]).label : S.formats.length ? S.formats.map((f) => fmt(f).label).join(', ') : 'Claude picks three', frameOf(S.frame)?.label].filter(Boolean).join(' · ') },
    { id: 'look', title: 'Which look?', lede: 'The backdrop, its light and its texture, live on the real engine in your colour and aspect — or a picture of your own.', render: stepLook, ok: () => true, value: () => (S.backdrop ? `picture: ${S.backdrop.name}` : S.look || 'on a sheet') },
    { id: 'type', title: 'Which type?', lede: 'The face of the headlines: a set from the kit, any family on this Mac, or the brand’s own.', render: stepType, ok: () => true, value: () => typeName() || 'the brand’s own' },
    { id: 'motion', title: 'Which motion?', lede: 'How the headlines arrive and how one scene gives way to the next, played on the stage.', render: stepMotion, ok: () => true, value: () => [S.motion.text && textStyle(S.motion.text).label, S.motion.transition && transition(S.motion.transition).label].filter(Boolean).join(' · ') || 'Claude picks' },
    { id: 'music', title: 'Which music?', lede: 'Chosen here, not made here: your music library, a file of yours, or a new one from Gemini.', render: stepMusic, ok: () => true, value: () => musicName() },
    { id: 'voice', title: 'Which voice?', lede: 'Made on this Mac and heard before it is chosen: a preset, or every setting by hand.', render: stepVoice, ok: () => true, value: () => (S.voice === 'none' ? 'no voice' : activePreset()?.label || voiceName()) },
    { id: 'output', title: 'Length and output', lede: 'How long, which shapes, which files. Defaults are what most films use.', render: stepOutput, ok: () => S.aspects.length > 0 && S.files.length > 0, why: () => 'At least one aspect and one file', value: () => `${lengthLabel(S.kind, S.duration)} · ${S.aspects.join(' + ')}` },
    { id: 'review', title: 'Review', lede: 'The brief Claude will read. Nothing renders until you have seen the storyboards and said go.', render: stepReview, ok: () => true, value: () => '' },
  ];
  const at = (id) => STEPS.findIndex((s) => s.id === id); // a step by its name: the review's Edit, a link to the voice
  let cur = 0, seen = 0, entering = false, goingBack = false;
  let kbd = false; // the last input came from the keyboard: only then is focus carried across a redraw
  const FOCUSABLE = 'button, input, textarea, select';
  const reachable = (i) => i <= seen || STEPS.slice(0, i).every((s) => s.ok());
  function go(i, target) { // target: what to bring in sight, a row Review's Edit opened; else what is chosen here
    if (!reachable(i)) return;
    if (i !== cur) { entering = true; goingBack = i < cur; if (live.theatre) setTheatre(false); hush(); } // a new step arrives (and what was playing, or about to, stops); a choice inside one just updates it
    cur = i; seen = Math.max(seen, i); render();
    const pane = $('#pane'); pane.scrollTop = 0;
    if (target) inSight(pane.querySelector(target), 'start'); // the card, and its panel under it
    else if (!pane.querySelector('.deck')) pane.querySelector('.card.sel, .pic.sel')?.scrollIntoView({ block: 'nearest' }); // what is chosen here, in sight; a deck's cards say it at the top
  }
  const swatch = (c) => c ? h('i', { class: 'swatch', style: { background: c }, title: c }) : null;
  let sidebarWas = ''; // what the sidebar last showed: a keystroke that changes none of it redraws nothing
  function sidebar() {
    const now = JSON.stringify([cur, seen, !!sent, STEPS.map((s) => [s.ok(), S.recipe && s.value(), S.recipe && s.swatch?.()])]);
    if (now === sidebarWas) return;
    sidebarWas = now;
    const el = $('#steps'), at = kbd ? [...el.querySelectorAll('button')].indexOf(document.activeElement) : -1;
    // a step is made once the wizard has been past it, and stays made when it goes back: going back to
    // the second step used to turn the five after it into steps still to do
    const made = (i) => i !== cur && i < seen && STEPS[i].ok() || (i < cur && STEPS[i].ok());
    el.style.setProperty('--done', String(Math.max(cur, seen) / (STEPS.length - 1))); // how far down its rail the wizard has come
    el.replaceChildren(...STEPS.map((s, i) => h('li', { class: (i === cur ? 'on' : '') + (made(i) ? ' done' : ''), 'data-step': s.id },
      h('button', { disabled: !reachable(i) || !!sent, title: s.title, 'aria-current': i === cur ? 'step' : null, onclick: () => go(i) }, h('span', { class: 'n' }, made(i) ? '✓' : String(i + 1)), h('span', { class: 't' }, s.title), h('span', { class: 'v' }, swatch(S.recipe && s.swatch?.()), (S.recipe && s.value()) || '')))));
    if (at >= 0) el.querySelectorAll('button')[at]?.focus({ preventScroll: true });
  }
  function refresh() { // what changes with every keystroke: the request, the sidebar, the buttons, the cards' lines
    for (const say of SAYS) say();
    const line = request();
    $('#request').textContent = line; $('#request').title = line;
    sidebar();
    const last = cur === STEPS.length - 1, ok = STEPS[cur].ok(), why = ok || sent ? '' : STEPS[cur].why?.() || '';
    $('#next').textContent = last ? 'Create brief' : 'Continue';
    $('#next').classList.toggle('last', last);
    $('#next').disabled = !!sent || saving || !ok;
    $('#next').title = why;
    $('#why').textContent = why; // Continue is off: what it is waiting for
    $('#back').disabled = cur === 0 || !!sent;
  }
  /** What a control is, to find it again after a redraw: its kind, and its name, placeholder or words. */
  const controlId = (el) => [el.tagName, el.type, el.dataset.fold || el.getAttribute('aria-label') || el.placeholder || el.textContent.trim().slice(0, 80)].join('|'); // a card by its name: its line changes
  function render() {
    const s = STEPS[cur], pane = $('#pane');
    $('#eyebrow').textContent = `Step ${cur + 1} of ${STEPS.length}`;
    $('#title').textContent = s.title;
    $('#lede').textContent = s.lede;
    const scroll = pane.scrollTop;
    // A choice redraws the whole step. Whoever was typing or tabbing keeps their place: the same control,
    // by what it is (a deck's cards move round its panel), else by its position, and the caret where it was.
    // (The website field lost both half a second into a URL, and what was typed next went nowhere; Enter on a
    // repository left the focus on the page.)
    const a = document.activeElement, all = !entering && kbd && pane.contains(a) ? [...pane.querySelectorAll(FOCUSABLE)] : null;
    const keep = all && { i: all.indexOf(a), id: controlId(a), tag: a.tagName, type: a.type, sel: a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' ? [a.selectionStart, a.selectionEnd] : null };
    pane.replaceChildren();
    pane.classList.toggle('entering', entering); pane.classList.toggle('back', entering && goingBack);
    if (entering) { entering = false; setTimeout(() => pane.classList.remove('entering', 'back'), 700); }
    SAYS = [];
    s.render(pane);
    showPlaying();
    pane.scrollTop = scroll;
    watchDeck();
    if (keep) {
      const els = [...pane.querySelectorAll(FOCUSABLE)], same = els.filter((e) => controlId(e) === keep.id);
      const el = same.length ? same.reduce((b, e) => (Math.abs(els.indexOf(e) - keep.i) < Math.abs(els.indexOf(b) - keep.i) ? e : b)) : els[keep.i];
      if (el && el.tagName === keep.tag && el.type === keep.type) {
        el.focus({ preventScroll: true });
        if (keep.sel && keep.sel[0] != null) try { el.setSelectionRange(keep.sel[0], keep.sel[1]); } catch {} // a field that has no caret
      }
    }
    refresh();
  }
  $('#next').addEventListener('click', () => (cur === STEPS.length - 1 ? create() : go(cur + 1)));
  $('#back').addEventListener('click', () => go(cur - 1));
  $('#play').innerHTML = ICON.pause;
  $('#play').addEventListener('click', () => setPlaying(!live.playing));
  addEventListener('pointerdown', () => { kbd = false; }, true);
  addEventListener('keydown', (e) => {
    kbd = true;
    if (dialogOpen()) return; // a dialog's own keys: Esc closes it, Tab and Enter work its links
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const a = document.activeElement, tag = a.tagName;
    if (e.key === 'Enter' && !['TEXTAREA', 'INPUT', 'BUTTON'].includes(tag)) { const b = $(e.shiftKey ? '#back' : '#next'); if (!b.disabled) b.click(); return; }
    if (tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['checkbox', 'color'].includes(a.type))) return; // typing
    // Space and the arrows are the focused control's own (a checkbox toggles, a button presses, a list
    // scrolls): they drive the preview only from the page itself or from the scrubber
    const k = e.key.toLowerCase(), free = a === document.body || a === scrubEl;
    if (k === ' ' && free) { e.preventDefault(); setPlaying(!live.playing); }
    else if ((k === 'arrowleft' || k === 'arrowright') && free) { e.preventDefault(); nudge((k === 'arrowleft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1)); }
    else if (k === 'b') blurBtn.click();
    else if (k === 'f') setTheatre(!live.theatre);
    else if (k === 'escape' && live.theatre) setTheatre(false);
  });
  // ---- Settings: one window for where the Studio looks (the project folders, the picture folders, the music
  // library), where films are made (the work folder), and what Manovella is (About: its links, its sponsors and the
  // maker's other apps, about.json). Laid out as a Mac's settings are: a sidebar of panes, About at its head with the
  // icon and the version, and in each pane grouped rows of what it holds. A change is saved at once, in
  // settings.json, which deliver.mjs reads too, and the wizard follows it. What the command line or the environment
  // gives this run is shown, not changed. The gear opens it, the brand opens it on About, and so do the window app's
  // menu items (studio.json "pageItems": the kit sends studio:menu with the item's id; Settings… is ⌘,). While it is
  // open the preview pauses behind it and the wizard's keys are its own; once it closes, the preview plays again.
  const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const AB_ICON = {
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/>',
    sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
    bubble: '<path d="M4 5h16v11H9l-5 4z"/><path d="M12 8v3M12 13.5v.01"/>',
    news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    hand: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>',
    discord: '<path fill="#5865F2" stroke="none" d="M14.983 3l.123 .006c2.014 .214 3.527 .672 4.966 1.673a1 1 0 0 1 .371 .488c1.876 5.315 2.373 9.987 1.451 12.28c-1.003 2.005 -2.606 3.553 -4.394 3.553c-.732 0 -1.693 -.968 -2.328 -2.045a21.512 21.512 0 0 0 2.103 -.493a1 1 0 1 0 -.55 -1.924c-3.32 .95 -6.13 .95 -9.45 0a1 1 0 0 0 -.55 1.924c.717 .204 1.416 .37 2.103 .494c-.635 1.075 -1.596 2.044 -2.328 2.044c-1.788 0 -3.391 -1.548 -4.428 -3.629c-.888 -2.217 -.39 -6.89 1.485 -12.204a1 1 0 0 1 .371 -.488c1.439 -1.001 2.952 -1.459 4.966 -1.673a1 1 0 0 1 .935 .435l.063 .107l.651 1.285l.137 -.016a12.97 12.97 0 0 1 2.643 0l.134 .016l.65 -1.284a1 1 0 0 1 .754 -.54l.122 -.009zm-5.983 7a2 2 0 0 0 -1.977 1.697l-.018 .154l-.005 .149l.005 .15a2 2 0 1 0 1.995 -2.15zm6 0a2 2 0 0 0 -1.977 1.697l-.018 .154l-.005 .149l.005 .15a2 2 0 1 0 1.995 -2.15z"/>',
    coffee: '<path fill="currentColor" stroke="none" d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.9 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/>',
  };
  /** An element that is one drawn glyph: its attributes, and the paths of its drawing. */
  const icon = (attrs, d, tag = 'span') => { const el = h(tag, attrs); el.innerHTML = SVG(d); return el; };
  const abIcon = (k) => icon({ class: 'ab-ic', 'aria-hidden': 'true' }, AB_ICON[k] || '');
  // the tiles of the panes and of their rows: a rounded square in the pane's colour, its glyph in white
  const SET_ICON = {
    repo: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    picture: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>',
    music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
    tray: '<path d="M4 13l2.2-7h11.6L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h4.5a3.5 3.5 0 0 0 7 0H20"/>',
    folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    film: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M10 9.2v5.6l5-2.8z" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.4-4.4"/>',
  };
  const tile = (k, tint = 'grey', cls = '') => icon({ class: `tile t-${tint}${cls ? ` ${cls}` : ''}`, 'aria-hidden': 'true' }, SET_ICON[k] || '');
  const dialogOpen = () => !!document.querySelector('dialog[open]');
  let dlgResume = null; // whether the preview plays again once the dialog closes; null: nothing pending
  /** Makes `dlg` a dialog of the Studio's, and returns what shows it. */
  function modal(dlg) {
    // close comes a moment after the dialog shuts; one heard while a dialog is open (again) belongs to an earlier close
    dlg.addEventListener('close', () => { if (dialogOpen()) return; if (dlgResume) setPlaying(true); dlgResume = null; });
    dlg.addEventListener('click', (e) => { // a click on the backdrop: outside the box, not on its own empty margin
      const r = dlg.getBoundingClientRect();
      if (e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dlg.close();
    });
    return () => {
      if (dlgResume === null) dlgResume = live.playing; // reopened before the last close was heard: that one still holds
      setPlaying(false);
      if (!dlg.open) dlg.showModal();
    };
  }
  const closeBtn = (dlg) => h('button', { class: 'dlg-close', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => dlg.close() }, '×');
  const codes = (paths) => paths.flatMap((x, i) => [i ? ', ' : '', h('code', null, x)]); // folders, in a sentence

  const setDlg = $('#settings-dlg'), showSettings = modal(setDlg);
  /** The About pane's own: who and what, the sponsors and the maker's other apps. */
  function aboutView(A) {
    const sponsor = (u) => extLink(`https://github.com/${encodeURIComponent(u)}`, { class: 'ab-sp' },
      h('img', { src: `https://github.com/${encodeURIComponent(u)}.png?size=120`, alt: '', width: 60, height: 60 }), h('span', null, u));
    const app = (x) => extLink(x.url, { class: 'ab-app' }, h('img', { src: x.icon, alt: '', width: 48, height: 48 }), h('b', null, x.name), h('span', null, x.tagline), h('i', { 'aria-hidden': 'true' }, '↗'));
    return [
      h('div', { class: 'ab-cols' },
        h('div', { class: 'ab-id' },
          h('img', { src: 'about/manovella.png', width: 84, height: 84, alt: '' }),
          h('h2', { id: 'about-name' }, CTX.studio.name),
          h('p', { class: 'ab-ver' }, `Version ${CTX.studio.version}`),
          h('p', { class: 'ab-tag' }, A.tagline),
          h('nav', { class: 'ab-links', 'aria-label': 'Links' }, A.links.map((l) => extLink(l.url, null, abIcon(l.icon), l.title)))),
        h('div', { class: 'ab-support' },
          h('section', { class: 'ab-sponsors', 'aria-labelledby': 'ab-sp-h' },
            h('h3', { id: 'ab-sp-h', class: 'ab-grad' }, 'Sponsors'),
            h('p', null, 'If my open-source work saves you or your team time, consider sponsoring its development. Sponsors get their name or logo featured here and across all my projects’ documentation sites.'),
            h('div', { class: 'ab-wall' }, A.sponsors.map(sponsor),
              extLink(A.sponsorUrl, { class: 'ab-sp ab-slot' }, h('span', { class: 'ab-plus', 'aria-hidden': 'true' }, '+'), h('span', null, 'Your logo here'))),
            h('div', { class: 'ab-btns' },
              extLink(A.sponsorUrl, { class: 'ab-btn ab-heart' }, h('span', { 'aria-hidden': 'true' }, '♥'), 'Become a sponsor'),
              extLink(A.donateUrl, { class: 'ab-btn ab-coffee' }, abIcon('coffee'), 'Buy me a coffee'))),
          h('section', { class: 'ab-apps', 'aria-labelledby': 'ab-apps-h' },
            h('h3', { id: 'ab-apps-h' }, 'You might also like'),
            h('div', { class: 'ab-grid' }, A.apps.map(app))))),
      h('p', { class: 'ab-foot' }, 'Made with ', h('span', { class: 'ab-love' }, '♥'), ' by ', extLink(A.maker.url, null, A.maker.name)),
    ];
  }
  const CONTEXT = api('context'); // asked once, at the start: the boot and the Settings wait for the same answer
  // About is built once, by the first look at its pane, which a second one during it waits for (a double click builds
  // it once); the sponsors' avatars come from github.com, and only then (the privacy page)
  const aboutPane = h('section', { class: 'set-pane ab-pane', id: 'set-about', 'aria-labelledby': 'about-name' });
  let aboutBuilt = null;
  const buildAbout = () => (aboutBuilt ||= Promise.all([fetch('about.json', { cache: 'no-store' }).then((r) => r.json()), CONTEXT])
    .then(([A]) => { aboutPane.replaceChildren(...aboutView(A)); return true; }, () => { aboutBuilt = null; aboutPane.replaceChildren(h('p', { class: 'set-note' }, 'About could not be read just now.')); return false; }));

  const SETTINGS = [
    { k: 'projectFolders', nav: 'Projects', icon: 'repo', tint: 'blue', sub: 'Where the Studio looks for the products to film', group: 'Project folders', row: 'folder', prompt: 'A folder of repositories',
      about: 'The products the Studio offers are the git repositories in these folders, two levels deep. A repository anywhere else can still be chosen in the product step.' },
    { k: 'pictureFolders', nav: 'Pictures', icon: 'picture', tint: 'pink', sub: 'Where it finds the pictures a film can stand on', group: 'Picture folders', row: 'picture', prompt: 'A folder of pictures',
      about: 'The backdrops the look step offers are the most recent pictures in these folders, three levels deep. A picture dropped on the step needs no folder.' },
    { k: 'musicLibrary', nav: 'Music library', icon: 'music', tint: 'orange', sub: 'A folder with your films’ music, offered in the music step', group: 'The library', row: 'music', prompt: 'Your music library',
      about: 'Every track in the folder is offered in the music step. A folder in it per brand keeps each one’s tracks apart, and a notes file beside them can say what each is for.', none: 'None: the music step takes a file of yours, or a new track.',
      option: { k: 'deliverToLibrary', icon: 'film', label: 'Deliver finished films into it too', info: 'On, a finished film goes into the library, in <Brand>/video/<name>/, beside its brand’s music. Off, it goes into the work folder.' } },
    { k: 'workRoot', nav: 'Work folder', icon: 'tray', tint: 'green', sub: 'Where films are made, and where they arrive', group: 'The folder', row: 'folder', prompt: 'Where films are made',
      about: 'Each film is made in a <name>-work folder here, and its finished files arrive beside it, in <name>/, unless the music library takes them.' },
  ];
  let SET = null; // the settings, as the server last sent them: per key, many, set, used, lockedBy (absolute folders)
  let setPane = 'projectFolders', setQuery = ''; // the pane showing, and what the sidebar's search holds
  /** Saves `patch`, and the wizard follows: the products, the pictures, the tracks. The error, or null. */
  async function saveSetting(patch) {
    let r;
    try { r = await api('settings', { method: 'POST', body: JSON.stringify(patch) }); } catch (e) { return e.message; }
    SET = r.settings; Object.assign(CTX, { roots: r.roots, out: r.out, library: r.library, products: r.products });
    if ('pictureFolders' in patch) PICS = null; // listed again, from the new folders, when the step shows them
    // a track of the old library is no choice in the new one, and a listing of it still on its way is not shown
    if ('musicLibrary' in patch) { TRACKLIST = null; S.musicTrack = null; tracksAsked++; }
    if (setDlg.open) fillSettings();
    render();
    return null;
  }
  // a folder in a row: too long, it loses its start, not the folder's own name (Google Drive's paths are long)
  const pathCode = (p) => h('code', { title: p }, h('bdi', { dir: 'ltr' }, tilde(p)));
  const settingsLink = (k, label) => h('button', { class: 'link', onclick: () => openSettings(k) }, label);
  /** The pane showing: its row lit in the sidebar, the others' panes put away. About is built when first shown. */
  function showPane(k) {
    setPane = k;
    for (const b of setDlg.querySelectorAll('[data-pane]')) b.setAttribute('aria-current', String(b.dataset.pane === k));
    for (const p of setDlg.querySelectorAll('.set-pane')) p.hidden = p.id !== `set-${k}`;
    const main = setDlg.querySelector('.set-main'); if (main) main.scrollTop = 0;
    return k === 'about' ? buildAbout() : Promise.resolve(true);
  }
  /** Whether a pane holds what the search does (anything, while it holds nothing), and its rows kept to those. */
  const matches = (d) => !setQuery || [d.nav, d.sub, d.group, d.about, d.option?.label, d.option?.info].join(' ').toLowerCase().includes(setQuery);
  const applySearch = () => { for (const b of setDlg.querySelectorAll('.set-nav')) b.hidden = !matches(SETTINGS.find((d) => d.k === b.dataset.pane)); };
  function fillSettings(msg = '') {
    const pane = (d) => {
      const v = SET[d.k], set = v.set;
      const change = (patch) => saveSetting(patch).then((err) => {
        if (err) return fillSettings(`Not saved: ${err}`);
        setDlg.querySelector(`#set-${d.k} .set-acts button`)?.focus({ preventScroll: true }); // the redrawn pane's own
      });
      const rows = v.lockedBy || !set.length
        ? v.used.map((p) => h('div', { class: 'set-line set-row' }, tile(d.row), pathCode(p), h('span', { class: 'chip' }, v.lockedBy ? 'this run' : 'default')))
        : set.map((p) => h('div', { class: 'set-line set-row' }, tile(d.row), pathCode(p), v.missing.includes(p) ? h('span', { class: 'chip', title: 'Not there now (a drive not mounted?): kept, and used again once it is back' }, 'not found') : null,
          h('button', { class: 'x', title: v.many ? 'Remove' : 'Back to the default', 'aria-label': `Remove ${tilde(p)}`, onclick: () => change({ [d.k]: v.many ? set.filter((x) => x !== p) : null }) }, '×')));
      if (!rows.length) rows.push(h('div', { class: 'set-line set-row none' }, tile(d.row), d.none));
      const verb = v.many ? 'Add a folder' : set.length ? 'Use another folder' : 'Use a folder of your own'; // what the row does; its button only opens the picker
      if (!v.lockedBy) rows.push(h('div', { class: 'set-line set-acts' }, tile('plus', d.tint), h('span', { class: 'set-l' }, verb),
        folderButton('Choose…', d.prompt, (p) => change({ [d.k]: v.many ? [...set, p] : p }))));
      // an ⓘ opens what its row decides, in a line under it
      const more = d.option && h('div', { class: 'set-more', id: `set-more-${d.option.k}`, hidden: true }, d.option.info);
      const option = d.option && v.used.length ? h('label', { class: 'set-line set-opt' }, tile(d.option.icon, d.tint), h('span', { class: 'set-l' }, d.option.label),
        icon({ class: 'set-info', title: d.option.info, 'aria-label': `About: ${d.option.label}`, 'aria-expanded': 'false', 'aria-controls': more.id, onclick: (e) => { e.preventDefault(); more.hidden = !more.hidden; e.currentTarget.setAttribute('aria-expanded', String(!more.hidden)); } }, SET_ICON.info, 'button'),
        h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: SET[d.option.k], onchange: (e) => change({ [d.option.k]: e.target.checked }) })) : null;
      return h('section', { class: 'set-pane', id: `set-${d.k}`, 'aria-labelledby': `set-h-${d.k}` },
        h('header', { class: 'set-head' }, tile(d.icon, d.tint, 'big'), h('div', null, h('h2', { id: `set-h-${d.k}` }, d.nav), h('p', null, d.sub))),
        h('h3', { class: 'set-group' }, d.group),
        h('div', { class: 'set-rows' }, rows),
        v.lockedBy ? h('p', { class: 'set-lock' }, `Given for this run by ${v.lockedBy}.`) : null,
        option ? h('div', { class: 'set-rows' }, option, more) : null,
        h('p', { class: 'set-note' }, d.about));
    };
    // the sidebar: a search over what the panes hold, About at its head, then a row a pane
    // each row is named on the button itself: in a narrow window its words are put away, and a tile says nothing
    const nav = (d) => h('button', { class: 'set-nav', 'data-pane': d.k, title: d.nav, 'aria-label': d.nav, onclick: () => showPane(d.k) }, tile(d.icon, d.tint), h('span', null, d.nav));
    const search = h('input', { type: 'search', class: 'set-search', placeholder: 'Search', value: setQuery, 'aria-label': 'Search the settings', spellcheck: 'false',
      oninput: (e) => {
        setQuery = e.target.value.trim().toLowerCase();
        applySearch();
        const first = SETTINGS.find(matches);
        if (setQuery && first && !SETTINGS.some((d) => d.k === setPane && matches(d))) showPane(first.k); // what was looked for, shown
      } });
    const glass = icon({ class: 'set-glass', 'aria-hidden': 'true' }, SET_ICON.search);
    setDlg.replaceChildren(h('div', { class: 'set-win' },
      h('nav', { class: 'set-side', 'aria-label': 'Settings' },
        h('label', { class: 'set-find' }, glass, search),
        h('button', { class: 'set-about', 'data-pane': 'about', title: `About ${CTX.studio.name}`, 'aria-label': `About ${CTX.studio.name}, version ${CTX.studio.version}`, onclick: () => showPane('about') },
          h('img', { src: 'about/manovella.png', width: 40, height: 40, alt: '' }), h('span', null, h('b', null, `About ${CTX.studio.name}`), h('small', null, CTX.studio.version))),
        ...SETTINGS.map(nav),
        h('p', { class: 'set-file' }, 'Saved in ', h('code', { title: SET.file }, tilde(SET.file)), ' as you change them.')),
      h('div', { class: 'set-main' }, aboutPane, ...SETTINGS.map(pane), h('p', { class: 'set-status', role: 'status' }, msg))),
    closeBtn(setDlg));
    applySearch();
    showPane(setPane);
  }
  /** Opens the Settings on a pane (`pane`: a setting's key, or 'about'), or on the one last shown. */
  async function openSettings(pane) {
    if (pane) setPane = pane;
    if (setDlg.open) return void showPane(setPane); // open already (a menu item, with it open): only its pane changes
    try { await CONTEXT; SET = await api('settings'); } catch { return; }
    setQuery = '';
    fillSettings(); showSettings(); // filled, it shows its pane: About is built there, at first sight
    (setDlg.querySelector(`#set-${setPane} .set-acts button`) || setDlg.querySelector(`[data-pane="${setPane}"]`))?.focus({ preventScroll: true }); // the pane asked for, not the search
  }
  const openAbout = () => openSettings('about');
  $('#brand').addEventListener('click', openAbout);
  /** A button that opens the Mac's folder picker and gives `pick` the folder chosen. Where the Studio has no
   *  picker (not on a Mac) it becomes a field to type the folder's path in. */
  function folderButton(label, prompt, pick, cls = 'ghost') {
    const b = h('button', { class: cls, onclick: async () => {
      b.disabled = true;
      try { const r = await api('choose-folder', { method: 'POST', body: JSON.stringify({ prompt }) }); if (r.path) await pick(r.path); }
      catch (e) {
        if (e.status !== 501) return;
        const typed = h('input', { type: 'text', placeholder: 'The folder’s path, then Enter', spellcheck: 'false', onkeydown: (k) => { if (k.key === 'Enter' && typed.value.trim()) pick(typed.value.trim()); } });
        b.replaceWith(typed); typed.focus();
      } finally { b.disabled = false; }
    } }, label);
    return b;
  }
  const openSettingsPane = () => openSettings(setPane === 'about' ? 'projectFolders' : undefined); // the gear is for a setting: not About again, if that was the last pane
  $('#settings').addEventListener('click', openSettingsPane);
  // the window app's menu items the page answers (studio.json "pageItems"), by id
  addEventListener('studio:menu', (e) => ({ about: openAbout, settings: openSettingsPane })[e.detail?.id]?.());

  let armed = 0;
  $('#cancel').addEventListener('click', async () => {
    const b = $('#cancel');
    if (Date.now() - armed > 3000) { armed = Date.now(); b.textContent = 'Click again to cancel'; setTimeout(() => { b.textContent = 'Cancel'; }, 3000); return; }
    live.playing = false; clearInterval(beat);
    await api('cancel', { method: 'POST' }).catch(() => {});
    document.body.replaceChildren(h('div', { class: 'sent', style: { margin: '80px auto' } }, h('h2', null, 'Cancelled'), h('p', null, 'No brief was written. This window closes on its own.')));
  });

  // the server's heartbeat: a window that goes away without a brief ends the Studio
  const beat = setInterval(() => api('ping').catch(() => {}), 4000);
  addEventListener('pagehide', () => { if (!sent) navigator.sendBeacon(`/api/bye?k=${KEY}`); });

  (async () => {
    CTX = await CONTEXT;
    $('#ver').textContent = CTX.studio?.version ? `v${CTX.studio.version}` : ''; // studio.json, which the window app is built from too
    SCHEMA = CTX.schema; F = SCHEMA.fields;
    defaults();
    Object.assign(S, { recipe: null, product: null, name: '', nameTouched: false, accent: null, accentFrom: null, readBrand: true, brandAccent: null, ownAccent: null, release: { tag: null } });
    api('ping').catch(() => {});
    sizeFrame(1920, 1080);
    entering = true;
    render();
    // the product it was started for (--product, else the repository it runs in), in the list or not: a project
    // folder set elsewhere leaves it out, and it is still the one meant
    if (CTX.preselect) api('product?path=' + encodeURIComponent(CTX.preselect)).then((d) => { if (!S.product) pickRepo({ name: d.name, path: d.path }, d); }).catch(() => {});
    // the kit's families for the specimens (loaded by the browser only when a card uses one), and this Mac's
    api('voices').then((r) => { VOICES = r.voices; SYSLANG = r.lang; if (cur === at('voice') || S.kind === 'tutorial') render(); }).catch(() => { VOICES = []; });
    api('fonts').then((r) => {
      FONTS = r;
      $('#kitfonts').textContent = r.kit.flatMap((f) => f.faces.map((x) => `@font-face{font-family:"${f.family}";src:url("/template/fonts/${x.file}") format("woff2");font-weight:${x.weight};font-style:${x.style};${x.stretch ? `font-stretch:${x.stretch};` : ''}unicode-range:${x.unicodeRange};}`)).join('\n');
      if (cur === at('type')) render();
    }).catch(() => {});
  })().catch((e) => { $('#pane').replaceChildren(h('div', { class: 'errors' }, `The Studio could not start: ${e.message}`)); });
})();
