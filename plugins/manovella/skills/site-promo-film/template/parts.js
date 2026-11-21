/*
 * parts.js — vector parts a film builds its surfaces from: windows, a browser, a terminal, devices
 * (an iPhone, an iPad, a MacBook, an iMac), keycaps, a switch, a ring. A CLASSIC script, beside film.js and fx.js.
 *
 * Every part draws on the context it is given, in that context's current transform (world units,
 * so the camera zooms it), and RETURNS the rect its content goes in, so a scene reads:
 *
 *   const r = PARTS.browser(g, { x: -480, y: -300, w: 960, h: 600 }, { url: 'example.com' });
 *   g.save(); g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, r.r); g.clip(); drawPage(g, r); g.restore();
 *
 * Proportions are macOS 26/27's, measured off real windows where it matters: traffic lights 12 pt
 * across, centres 20 pt apart, a 52 pt unified toolbar, 16-18 pt window corners. The devices' are
 * Apple's published sizes (each part says which). A part draws no text the product would not show:
 * titles and URLs are parameters. Fonts: o.fam (default system-ui, which is SF and takes any weight
 * 1-1000) and o.mono.
 *
 *   PARTS.window(g, r, o)     a macOS window: o.dark, o.title, o.radius, o.bar (0 = no toolbar), o.shadow
 *   PARTS.browser(g, r, o)    a Safari-shaped window: o.url, o.dark, o.lock
 *   PARTS.terminal(g, r, o)   a terminal window: o.title; content is lines drawn with PARTS.line
 *   PARTS.line(g, x, y, segs, size, o)   coloured segments [[text, colour], …] in the mono face
 *   PARTS.phone(g, r, o)      an iPhone: bezel, Dynamic Island; returns the screen (r.r its corner)
 *   PARTS.tablet(g, r, o)     an iPad: landscape when r.w > r.h, the camera on its long edge; returns the screen
 *   PARTS.laptop(g, r, o)     a MacBook: lid with notch, the base below r; returns the screen (s.base, the base's rect)
 *   PARTS.desktop(g, r, o)    an iMac: r is its body, a white bezel over a chin in o.color (one of PARTS.IMAC's, or
 *                             a colour to match); the stand below r; returns the screen (s.stand, the stand's rect)
 *                             (the devices take o.body, o.screen, o.shadow; draw PARTS.island / PARTS.notch last)
 *   PARTS.keycap(g, x, y, label, o)      a key, o.press 0-1 pushes it down; o.size, o.dark
 *   PARTS.toggle(g, x, y, p, o)          a switch, p 0 → 1 slides the knob and fills the track (o.on)
 *   PARTS.ring(g, cx, cy, r, p, o)       a progress ring with a round cap (o.color, o.width)
 *   PARTS.button(g, r, label, o)         a filled capsule button (o.fill, o.color, o.size)
 *   PARTS.ARROW                          the macOS pointer as a Path2D, tip at 0,0, 12 x 18.5 units
 */
(function () {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const col = (c, a = 1) => (typeof c === 'string' ? c : `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`);
  const mix = (a, b, p) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * p);
  const zoomOf = (g) => { const m = g.getTransform(); return Math.hypot(m.a, m.b); };
  // shadows are device pixels: scale them with the context's zoom, or they shrink as the camera nears
  function shadow(g, blur, oy, c) { const k = zoomOf(g); g.shadowColor = c; g.shadowBlur = blur * k; g.shadowOffsetX = 0; g.shadowOffsetY = oy * k; }
  const noShadow = (g) => { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; };
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2))); }
  const FAM = 'system-ui', MONO = 'ui-monospace, Menlo, monospace';
  function text(g, s, x, y, size, o = {}) {
    g.save(); g.font = `${o.w || 500} ${size}px ${o.fam || FAM}`; g.fillStyle = col(o.col || [30, 30, 36]);
    g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'middle'; g.letterSpacing = (o.ls || 0) + 'px';
    g.fillText(s, x, y); g.restore();
  }

  function lights(g, x, y, dark) { // the traffic lights, centred on y, the first centre at x
    [[255, 95, 87], [254, 188, 46], [40, 200, 64]].forEach((c, i) => {
      g.beginPath(); g.arc(x + i * 20, y, 6, 0, Math.PI * 2);
      g.fillStyle = col(c); g.fill();
      g.lineWidth = 0.5; g.strokeStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.12)'; g.stroke();
    });
  }
  function frame(g, r, o, fillTop, fillBody) {
    const rad = o.radius ?? 18;
    g.save();
    if (o.shadow !== false) shadow(g, 60, 24, o.dark ? 'rgba(0,0,0,0.55)' : 'rgba(20,24,40,0.28)');
    rr(g, r.x, r.y, r.w, r.h, rad); g.fillStyle = col(fillBody); g.fill(); noShadow(g);
    if (o.bar) { g.save(); rr(g, r.x, r.y, r.w, r.h, rad); g.clip(); g.fillStyle = col(fillTop); g.fillRect(r.x, r.y, r.w, o.bar);
      g.fillStyle = o.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'; g.fillRect(r.x, r.y + o.bar - 0.5, r.w, 0.5); g.restore(); }
    rr(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad - 0.5); g.lineWidth = 1;
    g.strokeStyle = o.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)'; g.stroke();
    g.restore();
    return rad;
  }

  /** A macOS window. Returns the content rect below the toolbar, with r its bottom corner radius. */
  function window_(g, r, o = {}) {
    const dark = !!o.dark, bar = o.bar ?? 52;
    const rad = frame(g, r, { ...o, bar }, dark ? [44, 44, 48] : [246, 246, 248], dark ? [30, 30, 32] : [255, 255, 255]);
    if (bar) {
      lights(g, r.x + 20, r.y + bar / 2, dark);
      if (o.title) text(g, o.title, r.x + r.w / 2, r.y + bar / 2, 13, { w: 600, align: 'center', col: dark ? [235, 235, 245] : [40, 40, 46] });
    } else lights(g, r.x + 20, r.y + 20, dark);
    return { x: r.x, y: r.y + bar, w: r.w, h: r.h - bar, r: rad };
  }

  /** A Safari-shaped window: lights, back and forward, the address field in the middle. */
  function browser(g, r, o = {}) {
    const dark = !!o.dark, bar = 52;
    const rad = frame(g, r, { ...o, bar }, dark ? [40, 40, 44] : [243, 243, 246], dark ? [22, 22, 24] : [255, 255, 255]);
    const cy = r.y + bar / 2, ink = dark ? [220, 220, 230] : [90, 90, 100];
    lights(g, r.x + 20, cy, dark);
    g.save(); g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col(ink);
    g.beginPath(); g.moveTo(r.x + 108, cy - 6); g.lineTo(r.x + 102, cy); g.lineTo(r.x + 108, cy + 6); g.stroke(); // back
    g.globalAlpha *= 0.4; g.beginPath(); g.moveTo(r.x + 128, cy - 6); g.lineTo(r.x + 134, cy); g.lineTo(r.x + 128, cy + 6); g.stroke(); // forward, disabled
    g.restore();
    const fw = Math.min(r.w * 0.46, 520), fx = r.x + (r.w - fw) / 2;
    rr(g, fx, cy - 15, fw, 30, 15); g.fillStyle = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.055)'; g.fill();
    const url = o.url || 'example.com';
    g.save(); g.font = `500 14px ${o.fam || FAM}`; const uw = g.measureText(url).width; g.restore();
    const lx = fx + fw / 2 - uw / 2 - 12;
    if (o.lock !== false) { // a padlock: body and shackle
      g.save(); g.fillStyle = col(ink, 0.9); rr(g, lx - 5, cy - 2, 10, 8, 2); g.fill();
      g.lineWidth = 1.6; g.strokeStyle = col(ink, 0.9); g.beginPath(); g.arc(lx, cy - 2, 3.3, Math.PI, 0); g.stroke(); g.restore();
    }
    text(g, url, fx + fw / 2 + 6, cy + 0.5, 14, { w: 500, align: 'center', col: dark ? [235, 235, 245] : [40, 40, 46], fam: o.fam });
    return { x: r.x, y: r.y + bar, w: r.w, h: r.h - bar, r: rad };
  }

  /** A terminal window, dark, its title in the bar; the content rect has the text inset. */
  function terminal(g, r, o = {}) {
    const bar = 38;
    const rad = frame(g, r, { ...o, dark: true, bar, radius: o.radius ?? 14 }, [38, 38, 42], [20, 20, 23]);
    lights(g, r.x + 20, r.y + bar / 2, true);
    if (o.title) text(g, o.title, r.x + r.w / 2, r.y + bar / 2, 12.5, { w: 600, align: 'center', col: [170, 170, 180] });
    const pad = o.pad ?? 22;
    return { x: r.x + pad, y: r.y + bar + pad * 0.8, w: r.w - 2 * pad, h: r.h - bar - pad * 1.6, r: rad };
  }
  /** Coloured segments on one line, in the mono face; returns the x after the last one. */
  function line(g, x, y, segs, size = 16, o = {}) {
    g.save(); g.font = `${o.w || 500} ${size}px ${o.mono || MONO}`; g.textBaseline = 'middle';
    for (const [s, c] of segs) { g.fillStyle = col(c || [220, 220, 228]); g.fillText(s, x, y); x += g.measureText(s).width; }
    g.restore();
    return x;
  }

  /** An iPhone: the frame is r; returns the screen, with r its corner radius. */
  function phone(g, r, o = {}) {
    const R = r.w * 0.17, b = r.w * 0.035;
    g.save();
    if (o.shadow !== false) shadow(g, 50, 22, 'rgba(10,12,24,0.35)');
    rr(g, r.x, r.y, r.w, r.h, R); g.fillStyle = col(o.body || [26, 26, 30]); g.fill(); noShadow(g);
    rr(g, r.x + 0.8, r.y + 0.8, r.w - 1.6, r.h - 1.6, R - 0.8); g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,0.18)'; g.stroke();
    const s = { x: r.x + b, y: r.y + b, w: r.w - 2 * b, h: r.h - 2 * b, r: R - b };
    rr(g, s.x, s.y, s.w, s.h, s.r); g.fillStyle = col(o.screen || [0, 0, 0]); g.fill();
    g.restore();
    s.island = { x: s.x + s.w / 2 - s.w * 0.17, y: s.y + s.w * 0.035, w: s.w * 0.34, h: s.w * 0.095 };
    return s;
  }
  /** Draw the Dynamic Island last, over the screen's content. */
  function island(g, s) { const i = s.island; rr(g, i.x, i.y, i.w, i.h, i.h / 2); g.fillStyle = '#000'; g.fill(); }

  /** An iPad: the frame is r, landscape when r.w > r.h; returns the screen, with r its corner radius.
   *  The proportions are the iPad Pro 13" (M4)'s: 281.6 x 215.5 mm round a 2752 x 2064 display at
   *  264 ppi (264.8 x 198.6 mm), so one bezel of 8.4 mm all round, 3 % of the long side (the 11",
   *  249.7 x 177.5 mm round 2420 x 1668, has the same 8.4 mm: give it a rect of its own shape). The
   *  display's corners are 18 pt on a 1366 pt side, and the body's are concentric with them. The front
   *  camera is on the long edge, where the M4 has it: above the screen in landscape, to its right in
   *  portrait (the iPad turned a quarter clockwise); s.camera says where, { x, y, r }. */
  function tablet(g, r, o = {}) {
    const long = Math.max(r.w, r.h), b = long * 0.03, R = long * 0.043, land = r.w > r.h;
    g.save();
    if (o.shadow !== false) shadow(g, 56, 24, 'rgba(10,12,24,0.34)');
    rr(g, r.x, r.y, r.w, r.h, R); g.fillStyle = col(o.body || [26, 26, 30]); g.fill(); noShadow(g);
    rr(g, r.x + 0.8, r.y + 0.8, r.w - 1.6, r.h - 1.6, R - 0.8); g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,0.18)'; g.stroke(); // the aluminium edge
    const s = { x: r.x + b, y: r.y + b, w: r.w - 2 * b, h: r.h - 2 * b, r: R - b };
    rr(g, s.x, s.y, s.w, s.h, s.r); g.fillStyle = col(o.screen || [0, 0, 0]); g.fill();
    // the camera: a lens in the bezel, half way along the long edge
    const c = s.camera = land ? { x: r.x + r.w / 2, y: r.y + b / 2, r: b * 0.17 } : { x: r.x + r.w - b / 2, y: r.y + r.h / 2, r: b * 0.17 };
    g.beginPath(); g.arc(c.x, c.y, c.r, 0, Math.PI * 2); g.fillStyle = 'rgb(9,10,14)'; g.fill();
    g.lineWidth = c.r * 0.28; g.strokeStyle = 'rgba(255,255,255,0.13)'; g.stroke();
    g.beginPath(); g.arc(c.x - c.r * 0.22, c.y - c.r * 0.22, c.r * 0.3, 0, Math.PI * 2); g.fillStyle = 'rgba(96,112,168,0.55)'; g.fill();
    g.restore();
    return s;
  }

  /** A MacBook: r is the lid; the base is drawn below it. Returns the screen, with r its corner radius.
   *  The proportions are the MacBook Pro 14"'s: a 312.6 mm lid round a 302.4 mm display (3024 px at
   *  254 ppi), so a bezel of 1.6-1.8 % of the lid's width; display corners of 10 pt on 1512, far tighter
   *  than the lid's; a notch 12.4 % of the display wide and 2.1 % deep, its top square in the bezel.
   *  The lid is black glass (o.body) inside an aluminium edge, which is the base's colour (o.base). */
  function laptop(g, r, o = {}) {
    const R = r.w * 0.026, b = r.w * 0.018, e = r.w * 0.0028, alu = o.base || [196, 198, 204];
    g.save();
    if (o.shadow !== false) shadow(g, 60, 26, 'rgba(10,12,24,0.3)');
    rr(g, r.x, r.y, r.w, r.h, R); g.fillStyle = col(mix(alu, [0, 0, 0], 0.18)); g.fill(); noShadow(g); // the aluminium edge of the lid
    rr(g, r.x + e, r.y + e, r.w - 2 * e, r.h - e, R - e); g.fillStyle = col(o.body || [18, 18, 21]); g.fill();
    const s = { x: r.x + b, y: r.y + b, w: r.w - 2 * b, h: r.h - 2 * b, r: b * 0.5 };
    rr(g, s.x, s.y, s.w, s.h, s.r); g.fillStyle = col(o.screen || [0, 0, 0]); g.fill();
    // the base, seen from the front: a slab a little wider than the lid, its top lip catching the light,
    // its under side rounding away, and the scoop a thumb opens the lid by
    const bw = r.w * 1.16, bx = r.x - (bw - r.w) / 2, by = r.y + r.h, bh = r.w * 0.028, q = bh * 1.9;
    const gr = g.createLinearGradient(0, by, 0, by + bh);
    gr.addColorStop(0, col(mix(alu, [255, 255, 255], 0.55))); gr.addColorStop(0.16, col(alu)); gr.addColorStop(0.62, col(mix(alu, [0, 0, 0], 0.16))); gr.addColorStop(1, col(mix(alu, [0, 0, 0], 0.42)));
    if (o.shadow !== false) shadow(g, 34, 16, 'rgba(10,12,24,0.26)');
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + bw, by); g.lineTo(bx + bw, by + bh * 0.28);
    g.quadraticCurveTo(bx + bw - q * 0.2, by + bh, bx + bw - q, by + bh); g.lineTo(bx + q, by + bh); g.quadraticCurveTo(bx + q * 0.2, by + bh, bx, by + bh * 0.28); g.closePath();
    g.fillStyle = gr; g.fill(); noShadow(g);
    const sw = r.w * 0.15, sx = r.x + r.w / 2 - sw / 2, sh = bh * 0.36;
    g.beginPath(); g.roundRect(sx, by, sw, sh, [0, 0, sh, sh]);
    const sg = g.createLinearGradient(0, by, 0, by + sh); sg.addColorStop(0, col(mix(alu, [0, 0, 0], 0.4))); sg.addColorStop(1, col(mix(alu, [0, 0, 0], 0.14)));
    g.fillStyle = sg; g.fill();
    g.restore();
    s.notch = { x: s.x + s.w / 2 - s.w * 0.062, y: s.y, w: s.w * 0.124, h: s.w * 0.021 };
    s.base = { x: bx, y: by, w: bw, h: bh }; // what stands under the lid: with it, the whole MacBook's extent
    return s;
  }
  /** Draw the notch last, over the screen's content: square where it meets the bezel, with the camera in it. */
  function notch(g, s) {
    const n = s.notch, up = Math.min(n.h, s.w * 0.012); // into the bezel above the screen, never past the lid
    g.save();
    g.beginPath(); g.roundRect(n.x, n.y - up, n.w, n.h + up, [0, 0, n.h * 0.42, n.h * 0.42]); g.fillStyle = '#000'; g.fill();
    g.beginPath(); g.arc(n.x + n.w / 2, n.y + n.h * 0.42, n.h * 0.16, 0, Math.PI * 2); g.fillStyle = 'rgb(16,18,26)'; g.fill();
    g.lineWidth = n.h * 0.045; g.strokeStyle = 'rgba(255,255,255,0.14)'; g.stroke();
    g.restore();
  }

  /** The iMac's colours, as Apple's own pictures of each show them from the front: the chin under its glass, and
   *  the stand's aluminium; hue is the colour's own (its back's), for matching one to a brand. */
  const IMAC = {
    silver: { chin: [214, 215, 217], stand: [207, 208, 210] },
    blue: { hue: 212, chin: [186, 206, 231], stand: [174, 194, 221] },
    purple: { hue: 245, chin: [200, 196, 229], stand: [188, 181, 214] },
    pink: { hue: 346, chin: [255, 206, 218], stand: [241, 183, 197] },
    orange: { hue: 15, chin: [254, 203, 176], stand: [243, 189, 165] },
    yellow: { hue: 50, chin: [250, 237, 182], stand: [235, 216, 158] },
    green: { hue: 141, chin: [186, 217, 199], stand: [177, 204, 187] },
  };
  /** Which of them: by name, or for an [r, g, b] the one nearest it in hue (silver for a grey, and by default). */
  function imacColor(c) {
    if (!Array.isArray(c)) return Object.hasOwn(IMAC, c) ? c : 'silver';
    const max = Math.max(...c), d = max - Math.min(...c);
    if (max === 0 || d / max < 0.15) return 'silver';
    const h = ((max === c[0] ? (c[1] - c[2]) / d : max === c[1] ? 2 + (c[2] - c[0]) / d : 4 + (c[0] - c[1]) / d) * 60 + 360) % 360;
    const off = (k) => Math.abs(((IMAC[k].hue - h + 540) % 360) - 180);
    return Object.keys(IMAC).filter((k) => 'hue' in IMAC[k]).reduce((a, k) => (off(k) < off(a) ? k : a));
  }
  /** An iMac: r is its body, the display over its chin; the stand is drawn below it. Returns the screen, with r
   *  its corner radius. The proportions are the iMac 24" (M4)'s. Published: 547 mm wide and 461 mm tall with its
   *  stand, the stand 130 mm wide, round a 23.5" display of 4480 x 2520 at 218 ppi (522 x 294 mm): so a bezel of
   *  12.5 mm each side, 2.3 % of the width. The rest is measured off Apple's own front elevation, drawn to that
   *  scale, and so estimated: the same 12.5 mm over and under the display; a chin of 55 mm; a body of 375 mm (give
   *  r that shape, 547 : 375), its corners 10 mm; the stand's 86 mm under it, 12 of them its foot seen edge-on;
   *  a display whose corners are all but square. The bezel is white glass (o.body) whatever the colour, the chin
   *  has no logo, and the camera is in the bezel, so there is no notch to draw: s.camera says where, { x, y, r }.
   *  o.color is one of Apple's seven (PARTS.IMAC: silver, the default, blue, purple, pink, orange, yellow,
   *  green), or an [r, g, b] to be matched by the nearest of them: a brand's accent (PARTS.imacColor(rgb) says
   *  which, once: a film drawing the iMac every frame passes the name). s.color names the one drawn,
   *  s.chin and s.stand are their rects: the stand's bottom is where the whole iMac ends. */
  function desktop(g, r, o = {}) {
    const w = r.w, b = w * 0.0229, ch = w * 0.1005, R = w * 0.018, name = imacColor(o.color), { chin, stand: alu } = IMAC[name];
    const sw = w * 0.2377, sx = r.x + (w - sw) / 2, sy = r.y + r.h, sh = w * 0.1572, f = w * 0.022, fy = sy + sh - f;
    g.save();
    // the stand: a neck that comes down from behind the body, to a foot seen edge-on: its top catching the
    // light, the line under it, its front edge
    const neck = g.createLinearGradient(0, sy, 0, fy);
    neck.addColorStop(0, col(mix(alu, [0, 0, 0], 0.16))); neck.addColorStop(0.5, col(alu)); neck.addColorStop(1, col(mix(alu, [0, 0, 0], 0.07)));
    if (o.shadow !== false) shadow(g, 34, 16, 'rgba(10,12,24,0.26)');
    g.beginPath(); g.roundRect(sx, sy - R, sw, sh + R, [0, 0, f * 0.3, f * 0.3]); g.fillStyle = neck; g.fill(); noShadow(g);
    g.save(); g.clip();
    g.fillStyle = col(mix(alu, [255, 255, 255], 0.6)); g.fillRect(sx, fy, sw, f * 0.3);
    g.fillStyle = col(mix(alu, [0, 0, 0], 0.45)); g.fillRect(sx, fy + f * 0.3, sw, f * 0.2);
    g.fillStyle = col(mix(alu, [255, 255, 255], 0.3)); g.fillRect(sx, fy + f * 0.5, sw, f * 0.5);
    g.restore();
    // the body: one sheet of glass, white round the display and the colour's own tint under it
    if (o.shadow !== false) shadow(g, 60, 26, 'rgba(10,12,24,0.3)');
    rr(g, r.x, r.y, w, r.h, R); g.fillStyle = col(o.body || [235, 236, 238]); g.fill(); noShadow(g);
    g.save(); g.clip(); g.fillStyle = col(chin); g.fillRect(r.x, sy - ch, w, ch); g.restore();
    rr(g, r.x + 0.6, r.y + 0.6, w - 1.2, r.h - 1.2, R - 0.6); g.lineWidth = 1.2; g.strokeStyle = 'rgba(40,44,60,0.16)'; g.stroke(); // its edge, which a light backdrop would lose
    const s = { x: r.x + b, y: r.y + b, w: w - 2 * b, h: r.h - 2 * b - ch, r: w * 0.002 }, k = w * 0.0012; // the display, inside its black hairline
    rr(g, s.x - k, s.y - k, s.w + 2 * k, s.h + 2 * k, s.r + k); g.fillStyle = 'rgb(10,10,12)'; g.fill();
    rr(g, s.x, s.y, s.w, s.h, s.r); g.fillStyle = col(o.screen || [0, 0, 0]); g.fill();
    // the camera: a lens in the middle of the bezel over the display
    const c = s.camera = { x: r.x + w / 2, y: r.y + b * 0.46, r: b * 0.24 };
    g.beginPath(); g.arc(c.x, c.y, c.r, 0, Math.PI * 2); g.fillStyle = 'rgb(9,10,14)'; g.fill();
    g.beginPath(); g.arc(c.x - c.r * 0.22, c.y - c.r * 0.22, c.r * 0.3, 0, Math.PI * 2); g.fillStyle = 'rgba(96,112,168,0.55)'; g.fill();
    g.restore();
    s.color = name; s.chin = { x: r.x, y: sy - ch, w, h: ch };
    s.stand = { x: sx, y: sy, w: sw, h: sh }; // what the body stands on: with it, the whole iMac's extent
    return s;
  }

  /** A keycap, centre (x, y). press 0-1 pushes it down; the label keeps its own face. */
  function keycap(g, x, y, label, o = {}) {
    const s = o.size || 64, p = clamp(o.press || 0), dark = !!o.dark;
    const w = Math.max(s, (o.wide || 1) * s), h = s, d = s * 0.08 * (1 - p);
    g.save();
    rr(g, x - w / 2, y - h / 2 + s * 0.08, w, h, s * 0.18); g.fillStyle = dark ? 'rgba(0,0,0,0.6)' : 'rgba(40,44,60,0.25)'; g.fill(); // the side
    rr(g, x - w / 2, y - h / 2 + s * 0.08 - d, w, h, s * 0.18);
    const top = dark ? mix([58, 58, 64], [40, 40, 44], p) : mix([255, 255, 255], [232, 233, 238], p);
    g.fillStyle = col(top); g.fill();
    g.lineWidth = 1; g.strokeStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'; g.stroke();
    const ls = [...label].length > 1 ? s * 0.26 : s * 0.42; // a word ('return') sits smaller than a glyph
    text(g, label, x, y + s * 0.08 - d, ls, { w: 500, align: 'center', col: dark ? [235, 235, 240] : [40, 40, 46], fam: o.fam });
    g.restore();
  }

  /** A switch: p 0 → 1 slides the knob across and fills the track with o.on. */
  function toggle(g, x, y, p, o = {}) {
    const w = o.w || 51, h = o.h || 31, q = clamp(p);
    g.save();
    rr(g, x, y, w, h, h / 2); g.fillStyle = col(mix(o.off || [214, 214, 220], o.on || [52, 199, 89], q)); g.fill();
    shadow(g, 4, 2, 'rgba(0,0,0,0.25)');
    g.beginPath(); g.arc(x + h / 2 + (w - h) * q, y + h / 2, h / 2 - 2, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.restore();
  }
  /** A progress ring: the track, then an arc from twelve o'clock with a round cap. */
  function ring(g, cx, cy, r, p, o = {}) {
    const w = o.width || r * 0.22, c = o.color || [91, 91, 247];
    g.save(); g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = col(c, o.track ?? 0.18); g.stroke();
    if (p > 0.001) { g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(p)); g.strokeStyle = col(c); g.stroke(); }
    g.restore();
  }
  /** A capsule button with a centred label. */
  function button(g, r, label, o = {}) {
    g.save();
    if (o.shadow) shadow(g, 18, 8, 'rgba(20,20,60,0.25)');
    rr(g, r.x, r.y, r.w, r.h, r.h / 2); g.fillStyle = col(o.fill || [91, 91, 247]); g.fill(); noShadow(g);
    text(g, label, r.x + r.w / 2, r.y + r.h / 2 + 0.5, o.size || r.h * 0.4, { w: o.w || 600, align: 'center', col: o.color || [255, 255, 255], fam: o.fam });
    g.restore();
  }

  const ARROW = new Path2D('M0 0 L0 16.2 L3.9 12.5 L6.5 18.5 L9 17.4 L6.5 11.5 L11.8 11.5 Z');
  window.PARTS = { window: window_, browser, terminal, line, phone, island, tablet, laptop, notch, desktop, IMAC: Object.keys(IMAC), imacColor, keycap, toggle, ring, button, ARROW, rr, text, shadow, noShadow };
})();
