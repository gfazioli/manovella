'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const afterPaint = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));

  // ---- copy button: the commands as the page shows them, without their prompts
  const copy = $('copy');
  copy.addEventListener('click', async () => {
    const text = $('install-cmd').textContent.replace(/^\$ /gm, '');
    try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; }
    catch {
      const r = document.createRange(); r.selectNodeContents($('install-cmd'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1800);
  });

  // ---- the live engine: the film's own size and length come from its PROMO_META
  const stage = $('stage'), play = $('play'), scrub = $('scrub'), time = $('time');
  const SRC = 'demo/promo.html#accent=8934FA&look=meshdark';
  let frame = null, win = null;
  let dur = +scrub.max, t = +$('poster').dataset.t; // start on the poster's frame, so the swap is seamless
  let want = !matchMedia('(prefers-reduced-motion: reduce)').matches; // what the visitor (or the default) asks for
  let inView = false, dragging = false, last = 0, raf = 0;

  const fmt = (v) => v.toFixed(1) + ' s';
  function render() {
    if (win) try { win.seek(t); } catch (e) { console.error(e); }
    scrub.value = t; time.textContent = fmt(t);
    scrub.style.setProperty('--p', (t / dur * 100) + '%');
    scrub.setAttribute('aria-valuetext', `${fmt(t)} of ${fmt(dur)}`);
  }

  const running = () => win && want && inView && !document.hidden && !dragging;
  // One frame: advance while running, draw, and keep going while running. A scrub asks for a single
  // frame, so a fast drag draws once per display frame, not once per input event.
  function tick(now) {
    raf = 0;
    const go = running();
    if (go) t = (t + Math.min(0.1, Math.max(0, (now - last) / 1000))) % dur;
    last = now; render();
    if (go) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  function update() {
    play.dataset.on = want ? '1' : '0'; // the intent: a click while the engine loads must not flip a play already asked for
    play.setAttribute('aria-label', want ? 'Pause' : 'Play');
    if (running()) kick();
  }

  function fit() { if (win) frame.style.transform = `scale(${stage.clientWidth / win.PROMO_META.width})`; }
  function load() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.title = 'Manovella demo film, driven by the scrubber below';
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.addEventListener('load', async () => {
      const w = frame.contentWindow;
      // A film that failed to start (no WebGL2, say) never sets ready or seek: the poster stays, the controls off.
      try {
        if (!w.ready || typeof w.seek !== 'function') throw new Error('the demo film did not start');
        await w.ready; w.seek(t);
      } catch (e) { console.error(e); frame.remove(); play.disabled = true; return; }
      const { width, height, duration } = w.PROMO_META;
      Object.assign(frame.style, { width: width + 'px', height: height + 'px' });
      stage.style.aspectRatio = `${width} / ${height}`;
      win = w; dur = duration; scrub.max = dur; scrub.disabled = false;
      fit(); render(); stage.classList.add('live'); update();
    });
    frame.src = SRC;
    stage.appendChild(frame);
  }
  new ResizeObserver(fit).observe(stage);

  play.addEventListener('click', () => { want = !want; load(); update(); });
  scrub.addEventListener('input', () => { t = Math.min(+scrub.value, dur - 0.001); kick(); });
  scrub.addEventListener('pointerdown', () => { dragging = true; });
  const release = () => { if (dragging) { dragging = false; update(); } };
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release); // a touch on the scrubber that turns into a page scroll
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; update(); }, { threshold: 0.25 }).observe(stage);
  document.addEventListener('visibilitychange', update);

  // The engine (about 200 kB) loads once the page has, and only as the stage comes near the viewport.
  const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { near.disconnect(); load(); } }, { rootMargin: '100px 0px' });
  const start = () => { near.observe(stage); stars(); };
  if (document.readyState === 'complete') start(); else addEventListener('load', start);
  render(); update();

  // ---- the launch film: the poster is a link to the video, so it plays with no script. A plain click
  // puts YouTube's player in its place, from youtube-nocookie.com: the only time the page loads
  // anything from YouTube (guide/privacy.html). A click meant for a new tab or window stays the link's.
  const film = $('film-open');
  film.addEventListener('click', (e) => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const player = document.createElement('iframe');
    player.src = `https://www.youtube-nocookie.com/embed/${new URL(film.href).searchParams.get('v')}?autoplay=1&rel=0&playsinline=1`;
    player.title = 'Manovella: the launch film, from YouTube';
    player.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    player.allowFullscreen = true;
    player.referrerPolicy = 'strict-origin-when-cross-origin'; // YouTube refuses an embed that names no site
    film.replaceWith(player);
    player.focus();
  });

  // ---- scroll reveals (site.css, "scroll reveals"): this only moves scopes between rest, armed and revealed
  (function reveals() {
    if (!('IntersectionObserver' in window)) return; // nothing armed where nothing can say a scope came into view
    // A [data-stagger] scope's items land one after another, the way the row is read.
    for (const scope of document.querySelectorAll('[data-stagger]')) {
      [...scope.querySelectorAll(':scope > [data-reveal]')].forEach((el, i) => el.style.setProperty('--reveal-delay', Math.min(i, 6) * 70 + 'ms'));
    }
    const scopes = [...document.querySelectorAll('[data-scope]')];
    for (const el of document.querySelectorAll('[data-reveal]')) if (!el.parentElement.closest('[data-scope]')) scopes.push(el);
    // Threshold 0 with a 64 px lag: a share of the scope would be a height a tall one never reaches.
    const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) reveal(e.target); }, { threshold: 0, rootMargin: '0px 0px -64px 0px' });
    function reveal(el) { el.setAttribute('data-revealed', ''); io.unobserve(el); }
    // The keyboard can get there first: focus reveals every armed scope it lands in, at once.
    document.addEventListener('focusin', (e) => {
      let el = e.target;
      while (el && el.closest) { const s = el.closest('[data-armed]:not([data-revealed])'); if (!s) break; reveal(s); el = s.parentElement; }
    });
    // Armed only if ENTIRELY off screen now: what the reader can already see never moves. Measured
    // right after the first paint, when the layout is already there to read: before it, the
    // measurement forced a layout of the whole page inside the script (90 ms of blocking at 4x CPU).
    // Every box is read before any scope is armed: a read after a write would force a style
    // recalculation per scope.
    afterPaint(() => {
      const h = innerHeight || document.documentElement.clientHeight;
      const off = scopes.filter((el) => { const b = el.getBoundingClientRect(); return b.bottom <= 0 || b.top >= h; });
      for (const el of off) { el.setAttribute('data-armed', ''); io.observe(el); }
    });
  })();

  // ---- the nav's brand arrives once the hero's logo has gone under the nav (site.css, "the nav").
  // The state sits on the nav, not on <html>: a change there would restyle the whole document.
  const logo = document.querySelector('.hero .logo'), nav = document.querySelector('.nav');
  if (logo && nav && 'IntersectionObserver' in window) {
    afterPaint(() => { if (logo.getBoundingClientRect().bottom > 64 && !nav.hasAttribute('data-past')) nav.setAttribute('data-armed', ''); });
    new IntersectionObserver(([e]) => { nav.toggleAttribute('data-past', !e.isIntersecting && e.boundingClientRect.top < 64); }, { rootMargin: '-64px 0px 0px 0px' }).observe(logo);
  }

  // ---- the year in the legal line
  for (const el of document.querySelectorAll('[data-year]')) el.textContent = new Date().getFullYear();

  // ---- GitHub stars: shown only when the public API answers (a private repository answers 404)
  // Nothing is kept in the browser: the privacy page says the site writes nothing to its storage.
  async function stars() {
    let n;
    try {
      const r = await fetch('https://api.github.com/repos/gfazioli/manovella');
      if (!r.ok) return;
      n = (await r.json()).stargazers_count;
    } catch { return; }
    if (typeof n !== 'number') return;
    const label = n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
    for (const el of document.querySelectorAll('[data-stars]')) { el.textContent = label; el.hidden = false; }
    for (const el of document.querySelectorAll('[data-stars-item]')) el.hidden = false;
    document.querySelector('.nav-gh')?.setAttribute('aria-label', `Manovella on GitHub, ${label} stars`);
  }

  // ---- Product Hunt: the badge shows once the page names the launch's post
  const ph = $('ph');
  if (ph && ph.dataset.postId) {
    ph.querySelector('img').src = `https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=${encodeURIComponent(ph.dataset.postId)}&theme=dark`;
    ph.hidden = false;
  }

  // ---- pictures, full size: without the script the link opens the file, with it a dialog
  const dlg = $('zoom');
  if (dlg && dlg.showModal) {
    const big = dlg.querySelector('img');
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a.zoom');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      const img = a.querySelector('img');
      big.width = +img.getAttribute('width'); big.height = +img.getAttribute('height');
      big.alt = img.alt; big.src = a.href;
      dlg.showModal();
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // a click on the backdrop
    dlg.addEventListener('close', () => big.removeAttribute('src'));
  }
})();
