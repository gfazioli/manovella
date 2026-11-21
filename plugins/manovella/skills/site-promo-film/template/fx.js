/*
 * fx.js — the film's look: backdrop, light and texture, and the effects that lean on them.
 * Copy it beside the page; site-promo-film's promo.html and release-film's release.html share it.
 *
 * A CLASSIC script, loaded before the page's own: <script src="fx.js"></script>. Chrome refuses
 * module scripts over file:// (CORS, origin 'null'), and render.mjs opens the page from disk.
 * Like the engine, everything is a pure function of t and the camera; the only state is caches
 * of things that never change (noise tiles, a baked image). With film.js's stage on the context,
 * the backdrop takes the subframe's subpixel jitter like everything else, except the dither and
 * the grain, which stay on the pixel grid so the blend keeps them.
 *
 *   const LOOK = FX.look({ preset: 'aura', palette: C, ...overrides }, { W, H, fps, duration, track, spr });
 *   LOOK.backdrop(ctx, t, CAM, opts)     first in seek(), in place of the canvas fill
 *   LOOK.finish(ctx, t, opts)            last in seek(): the vignette, over everything
 *                                        (opts is seek's: { loopcheck } leaves the grain out)
 *   LOOK.glass(ctx, x, y, w, h, r, o)    a frosted surface over whatever is already drawn beneath
 *   LOOK.ripple(ctx, x, y, t, tc, k)     a click made visible; screen space, k = the cursor's scale
 *   LOOK.ink, LOOK.dim                   text colours ON the backdrop; UI text keeps its own
 *   LOOK.edge                            a hairline for surfaces on a dark backdrop, else null
 *   FX.focus(ctx, pin, pout, size, draw) a word that arrives by pulling focus instead of sliding
 *   FX.sequence([[t, LOOK], …], { fade }) a long film's backdrop by chapter, cross-faded; used like a look
 *   FX.previewAccent(C, HASH)            a preview's accent from the page's hash, over C (the Studio's)
 *   FX.palette(hex, { scheme, tone })    a palette from one colour, in OKLCH: canvas, ink, dim, accent,
 *                                        a, b, c, pale, deep (schemes: analogous, complementary, triad,
 *                                        split, mono; tone light | dark)
 *   FX.lch(L, C, h) → [r, g, b]          an OKLCH colour in sRGB, its chroma reduced until it fits;
 *   FX.toLCH([r, g, b]) → [L, C, h]      and back: what palette() is made of (the Studio tints itself with them)
 *   FX.PRESETS                           name → one line on what it is (render.mjs looks reads it)
 *   FX.companions(name) → ['a', 'b']     which of a, b, c a preset's backdrop is painted with ([]: the
 *                                        accent alone, so a scheme changes nothing behind the product)
 *
 * Settings. A preset fills them; anything given overrides it, and an object merges one level deep
 * (pattern: { alpha: 0.1 } keeps the preset's other pattern fields).
 *   tone     'light' | 'dark': sets ink and dim (each can be given too) and, on dark, edge.
 *   base     a colour — [r, g, b], '#rrggbb' or a palette role such as 'canvas' — or 'none' (the frame
 *            left clear: preset 'transparent', rendered with ALPHA=1; vignette, dither, grain off) — or
 *            { from, to, angle }, a linear gradient (degrees, 90 = top to bottom), or
 *            { image, blur, dim, depth, tint, duotone, drift, period }, a picture you hold the rights
 *            to, cover-fit (preset 'photo', tone 'auto'). Never a system wallpaper, never a stock photo
 *            or a wallpaper pack without a licence that covers a published film. Baked once:
 *              tint     { color: 'accent', a: 0.35, mode: 'soft-light' } the brand laid over it
 *              duotone  [dark, light] a gradient map of its luminance, by compositing (no read-back)
 *              drift    0.02–0.06: a slow Ken Burns on a closed path, whole cycles of `period`
 *            tone 'auto' reads the baked picture's mean luminance — not over file://, where the
 *            picture taints the canvas: there the tone stays light unless the page sets it.
 *            Or { kind, … }, below.
 *            Any colour anywhere can also be { mix: [colour, colour, p] }: p of the second, in OKLab.
 *   base.kind  a base drawn as one field. The WebGL2 kinds get one frame-sized context per look,
 *            made once (Chrome allows 16 a page; render.mjs fails a capture past that); the field is computed in OKLab, a static dither
 *            (sigma `dither` levels, default 1) is added before the 8-bit write, the camera and the
 *            jitter enter as uniforms, and the result is laid down on the pixel grid.
 *     'mesh'   { grid: [cols, rows], colors (row-major), wander, jumble, margin, period, depth, seed }:
 *              a mesh gradient. Control points on a grid overhanging the frame by `margin` (0.22),
 *              scattered by `jumble` (0.3 of a cell), each on its own closed path of `wander` (0.06
 *              of the frame); positions and colours Catmull-Rom through them, tessellated 48 x 48.
 *     'flow'   { colors (a ramp), stops, scale, warp, contrast, drift, light, sheen, period, depth }: a
 *              domain-warped noise field through the ramp; scale = features across the long side,
 *              drift = how far it travels per cycle. light > 0 reads it as a height lit from the upper
 *              left (satin folds, not smoke); sheen is that lustre's strength in OKLab L.
 *     'blobs'  { colors, under, at, r, orbit, sharp, gain, period, depth, seed }: soft pools of colour
 *              on closed orbits over `under`; r and orbit in fractions of the long side.
 *     'aurora' { colors (edge → top), under, scale, gain, drift, period, depth }: curtains of light
 *              with fine rays, added in linear light over `under`.
 *     'caustics' { colors (water → light), scale, gain, drift, period, depth }: the network sunlight
 *              draws on a pool floor, its clock on circles so the loop is exact.
 *     'topo'   { colors (tint by height…, then the ink), scale, lines, width (px), alpha, drift }:
 *              contour lines of a noise terrain, anti-aliased by their own derivative.
 *     'halftone' { colors: [dot], under, step, angle, max, at, drift }: dots whose area follows a
 *              soft light at `at` (from the centre, in long sides) and a slow noise.
 *     'clouds' { colors: [high, horizon, cloud, shade], scale, cover, drift }: a sky with layered,
 *              lit clouds.
 *     'dunes'  (2D) { colors: [sky, far … near], top, bottom, amp, seed, depth }: ridges back to
 *              front, swaying, each in more parallax than the one behind.
 *     'linear' { colors, stops, angle, sway }, 'radial' { colors, stops, at, r, depth },
 *     'conic'  { colors, stops, at, angle, sway, core, depth }: 2D multi-stop gradients, sampled at
 *              33 stops so the ramp is mixed in OKLab (canvas mixes in sRGB, through grey); sway swings
 *              the angle by ± that many degrees, slowly; a conic's centre fades into the ramp's mean
 *              colour over `core` of the long side (0.3), or every wedge meets in a pinwheel point.
 *   period   (on a kinded base) seconds per cycle of its motion, default 24. Whole cycles over the
 *            film, still for half a second either side of the loop point, and when less than one
 *            period fits, the path shrinks instead of speeding up: a 60 s film moved at 0.82-1.01x
 *            the speed of an 8 s one (six presets, measured).
 *   lights   [{ color, at: [x, y], r, a, depth }]: soft fields of colour. at in fractions of the
 *            frame, r in fractions of its long side. They tint a light tone and glow on a dark one.
 *   drift    how far the lights wander, in fractions of the long side: one closed path per film,
 *            eased in and out and still for half a second either side of the loop point, so the
 *            loop stays pixel-exact.
 *   keys     [[beat, [color, …], f, z], …]: the lights change colour per scene, mixed in OKLab
 *            (sRGB mixing goes through grey). The last key must return to the first colours;
 *            FX.look refuses it otherwise, since the loop would break. With a kinded base the same
 *            keys recolour the palette ROLES named by keyRoles (default ['accent', 'a', 'b'], the
 *            lights' order in aura), and every colour of the base built from them follows.
 *   spot     { at, r, a, color, depth }: one pool of light behind the subject.
 *   pattern  { kind: 'dots' | 'grid' | 'lines', step, size, color, alpha, depth, fade, dof, angle }:
 *            step and size in world units; fade 0–1 thins it toward the frame's edges; dof 0–1
 *            softens it as the camera zooms in, the way a lens focused on the UI would; angle (lines)
 *            in degrees.
 *   floor    { horizon, step, color, alpha, depth, glow, glowA }: a grid on the ground in
 *            perspective, fading toward the horizon (a share of the height), which can glow.
 *   depth    (on each layer) how much it follows the camera: 0 painted on the frame, 1 on the UI's
 *            own plane, parallax in between. A layer at depth k sees the camera at (x·k, y·k, z^k).
 *   vignette 0–1: how far the corners fall toward shade, in the base's own hue on a light tone so
 *            it shades instead of dirtying.
 *   dither   a STATIC noise under the UI, as a standard deviation in 8-bit levels at mid-grey:
 *            1.5 stops the encoder banding a gradient, 3 reads as a paper texture. The same
 *            pattern every frame, so the encoder stores it once: nearly free.
 *   grain    MOVING film grain, same unit: 3 is visible, 6 reads as film. A new pattern every
 *            frame costs bytes like nothing else in the film — opt in for a filmic look, never as
 *            a dither. Seeded per FRAME, never per subframe: the 16-subframe blend and the encoder
 *            take σ 3 down to 0.12, i.e. nothing.
 *   grainOn  'backdrop' (default): under the UI, which stays crisp; or 'frame': over everything.
 *   grainEvery  frames per grain pattern, default 1; 2 or 3 is a film cadence and fewer bytes.
 *   clicks   'ripple' | 'none'.
 *
 * Measured while building the kinded bases (the promo demo, 1920x1080, 16 subframes, 8 workers):
 * - The cost follows the noise, not the shader: the 8 s demo took 87-97 s with mesh, flow, blobs or
 *   aurora, like any dithered look, against 35 s for dots. A frame full of noise is a heavy PNG.
 * - Banding on the encoded mp4 (lava, aurora): flat runs of 5 px median, 7-9 px at most, with the
 *   dithers; 28-62 px median and up to 426 px with both turned off.
 * - Loopcheck inf for every kinded preset at 8 s and at 60 s, and for a sequence of four looks.
 * - A plain OKLab mean of two distant hues goes through grey: orange and violet blobs made mud
 *   until the chroma was restored after the mean (capped at 1.8x).
 * - Without WebGL2, fx.js still loads and every 2D look works; a WebGL kind throws, by name.
 * - A chapter change between a light and a dark look leaves the ink mid-grey on a mid-grey stage
 *   for the middle of the fade: change the stage between headlines, not under one.
 */
(function () {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const smooth = (e0, e1, x) => { x = clamp((x - e0) / (e1 - e0)); return x * x * (3 - 2 * x); };
  const ease5 = (x) => x * x * x * (x * (6 * x - 15) + 10); // at rest at both ends: no velocity, no acceleration
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  // rounded, not truncated: a colour back from OKLab is 90.99999999 as often as 91
  const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  const mix = (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p)];
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  // ---------------------------------------------------------------- OKLab
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  function toLab(rgb) {
    const [r, g, b] = rgb.map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function fromLab([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map((v) => clamp(gam(clamp(v)), 0, 255));
  }
  const mixLab = (a, b, p) => { const A = toLab(a), B = toLab(b); return fromLab([0, 1, 2].map((i) => lerp(A[i], B[i], p))); };
  // OKLab → LINEAR sRGB, unclamped: how far outside the gamut a colour falls
  function labLinear([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  const inGamut = (lab) => labLinear(lab).every((v) => v > -1e-5 && v < 1 + 1e-5);
  /** OKLCH (L 0–1, chroma, hue in degrees) → [r, g, b]. Out of sRGB, the chroma is reduced until it
   *  fits: clipping the channels instead would shift the hue. */
  function lch(L, C, h) {
    const rad = (((h % 360) + 360) % 360) * Math.PI / 180, at = (c) => [L, c * Math.cos(rad), c * Math.sin(rad)];
    if (!inGamut(at(C))) {
      let lo = 0, hi = C;
      for (let i = 0; i < 28; i++) { const md = (lo + hi) / 2; if (inGamut(at(md))) lo = md; else hi = md; }
      C = lo;
    }
    return fromLab(at(C)).map((v) => Math.round(v));
  }
  const toLCH = (rgb) => { const [L, a, b] = toLab(rgb); return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180 / Math.PI) + 360) % 360]; };
  // seeded: the same organic scatter on every worker and every machine
  const mulberry = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const clampi = (x, a, b) => (x < a ? a : x > b ? b : x);

  /** The clock of slow backdrop motion. Still for the first and last half second (the loop point is
   *  exact, not asymptotic), a smooth ramp up and down in speed, even speed between, and WHOLE
   *  cycles: cycles = round(moving time / period), so a 5-minute film moves as slowly as an
   *  8-second one. When less than one period fits, the path shrinks rather than speeds up (amp < 1).
   *  theta(t) = 2π · cycles · phase, exactly 0 before the motion starts and after it ends. */
  function clock(DUR, period) {
    const t0 = 0.5, t1 = Math.max(t0 + 0.2, DUR - 0.5), R = Math.min(2, (t1 - t0) / 4), Tm = t1 - t0 - R;
    const cycles = Math.max(1, Math.round(Tm / period)), amp = Math.min(1, Tm / cycles / period);
    const F = (x) => x * x * x - x * x * x * x / 2; // the integral of smoothstep: speed ramps, never jumps
    const phase = (t) => {
      if (t <= t0 || t >= t1) return 0;
      if (t < t0 + R) return R * F((t - t0) / R) / Tm;
      if (t > t1 - R) return 1 - R * F((t1 - t) / R) / Tm;
      return (R / 2 + t - t0 - R) / Tm;
    };
    return { cycles, amp, theta: (t) => 2 * Math.PI * cycles * phase(t) };
  }

  // ---------------------------------------------------------------- WebGL backdrops: mesh, flow, blobs, aurora, caustics, topo, halftone, clouds
  // One frame-sized WebGL2 canvas per look, made once; the field is computed in OKLab and written
  // with a static dither (the same every frame, so the encoder stores it once) BEFORE the 8-bit
  // write, which is where a smooth ramp would otherwise band. The camera enters as a uniform
  // (parallax by depth, like every layer) and so does film.js's jitter, so the blit into the 2D
  // canvas happens on the pixel grid and the dither is never averaged away.
  // A PREVIEW (the Studio's) may ask for the field at a share of the frame's pixels: ?gl=0.5 in
  // the page's address. WebKit copies a WebGL canvas into a 2D one through the CPU (measured, the Film
  // Studio's window: 45 to 51 ms a 1080p frame for mesh, silk and aurora, against 4 for dots), so a
  // preview played at 20 frames a second, 4 with motion blur. The field is computed in the frame's
  // own coordinates either way (uGL is the canvas it lands on) and drawn stretched to the frame. A
  // render never asks: without ?gl the canvas is the frame and every pixel is what it always was.
  const GL_SHARE = (() => { try { const q = Number(new URLSearchParams(location.search).get('gl')); return q >= 0.25 && q < 1 ? q : 1; } catch { return 1; } })();
  const GL_KINDS = ['mesh', 'flow', 'blobs', 'aurora', 'caustics', 'topo', 'halftone', 'clouds'];
  const VERT_FULL = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const VERT_MESH = `#version 300 es
in vec2 aPos; in vec3 aLab; uniform vec2 uRes; out vec3 vLab;
void main() { vLab = aLab; gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0); }`;
  const FRAG_HEAD = `#version 300 es
precision highp float;
uniform vec2 uRes;      // the frame, device px
uniform vec2 uGL;       // the canvas the field is drawn on: the frame, or a preview's share of it (GL_SHARE)
uniform vec3 uCam;      // the camera as this layer sees it: x, y in world px, zoom
uniform vec2 uJit;      // film.js's subpixel jitter for this subframe
uniform float uDither;  // sigma of the static dither, 8-bit levels
out vec4 o;
float h12(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 lab2lin(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
             -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
             -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
vec3 lin2srgb(vec3 v) { v = clamp(v, 0.0, 1.0); return mix(12.92 * v, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, v)); }
vec2 world() { vec2 f = vec2(gl_FragCoord.x, uGL.y - gl_FragCoord.y) * (uRes / uGL) - uJit; return (f - 0.5 * uRes) / uCam.z + uCam.xy; }
vec4 outLin(vec3 lin) {
  vec2 q = floor(gl_FragCoord.xy);
  float n = (h12(q) + h12(q + 17.13) + h12(q + 41.71) - 1.5) * 2.0; // near-normal, sigma 1
  return vec4(lin2srgb(lin) + n * uDither / 255.0, 1.0);
}
vec2 g2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return -1.0 + 2.0 * fract(sin(p) * 43758.5453); }
float gn(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(g2(i), f), dot(g2(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(g2(i + vec2(0, 1)), f - vec2(0, 1)), dot(g2(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 4; i++) { s += a * gn(p); p = m * p + 3.7; a *= 0.5; } return s; }
uniform int uN; uniform vec3 uLab[8]; uniform float uAt[8];
vec3 ramp(float x) { vec3 c = uLab[0]; for (int i = 1; i < 8; i++) { if (i >= uN) break; c = mix(c, uLab[i], smoothstep(uAt[i - 1], uAt[i], x)); } return c; }
`;
  const FRAG = {
    mesh: `in vec3 vLab;
void main() { o = outLin(lab2lin(vLab)); }`,
    // a domain-warped noise field (two warps), mapped through the ramp; time runs on a circle in
    // noise space, so the field is periodic and the loop exact
    // With uLight > 0 the field is read as a height and lit from the upper left, a soft diffuse
    // plus a broad specular: folds of satin instead of smoke.
    flow: `uniform float uTheta, uR, uScale, uWarp, uContrast, uSheen, uLight;
float field(vec2 p) {
  vec2 c1 = uR * vec2(cos(uTheta), sin(uTheta)), c2 = 0.7 * uR * vec2(cos(2.0 * uTheta + 1.3), sin(2.0 * uTheta + 1.3));
  vec2 q = vec2(fbm(p + c1), fbm(p + vec2(5.2, 1.3) - c1));
  vec2 r = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2) + c2), fbm(p + uWarp * q + vec2(8.3, 2.8) - c2));
  return fbm(p + uWarp * r);
}
void main() {
  vec2 p = world() / max(uRes.x, uRes.y) * uScale;
  float v = field(p);
  vec3 lab = ramp(clamp(0.5 + v * uContrast, 0.0, 1.0));
  if (uLight > 0.0) {
    float e = 0.003 * uScale;
    vec3 n = normalize(vec3((v - field(p + vec2(e, 0.0))) / e, (v - field(p + vec2(0.0, e))) / e, 1.0 / uLight));
    vec3 l = normalize(vec3(-0.45, -0.6, 0.66)), h = normalize(l + vec3(0.0, 0.0, 1.0));
    lab.x += uSheen * (dot(n, l) - 0.66) + 0.6 * uSheen * pow(max(dot(n, h), 0.0), 18.0);
  }
  o = outLin(lab2lin(lab));
}`,
    // soft blobs of colour over an under-colour. The blobs' colours are averaged in OKLab with
    // Gaussian weights and their chroma restored (a plain mean of two distant hues goes through
    // grey: orange and violet made mud), then laid over the under-colour by how much blob is there.
    blobs: `uniform int uNB; uniform vec3 uBL[8]; uniform vec3 uBP[8]; uniform vec3 uBase; uniform float uGain, uSharp;
void main() {
  vec2 w = world(); vec3 acc = vec3(0.0); float F = 0.0, cw = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNB) break;
    vec2 d = (w - uBP[i].xy) / uBP[i].z; float k = exp(-dot(d, d) * uSharp);
    acc += uBL[i] * k; cw += k * length(uBL[i].yz); F += k;
  }
  vec3 m = acc / max(F, 1e-6);
  m.yz *= min((cw / max(F, 1e-6)) / max(length(m.yz), 1e-5), 1.8);
  o = outLin(lab2lin(mix(uBase, m, 1.0 - exp(-F * uGain))));
}`,
    // curtains: a bright lower edge that wanders, fine rays rising above it to heights that vary
    // along it, the ramp by height, added in linear light over the under-colour
    aurora: `uniform float uTheta, uR, uScale, uGain; uniform vec3 uBase;
void main() {
  vec2 p = world() / max(uRes.x, uRes.y);
  vec3 lin = lab2lin(uBase);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 c = uR * vec2(cos(uTheta + fk * 2.1), sin(uTheta + fk * 2.1));
    float x = p.x * uScale + fk * 3.7;
    float edge = -0.06 + 0.1 * fk + 0.24 * fbm(vec2(x * 1.25, fk * 1.7) + c);
    float up = edge - p.y;
    float hgt = 0.1 + 0.12 * (0.5 + 0.5 * gn(vec2(x * 2.6, fk * 2.3) + 1.5 * c));
    float body = up > 0.0 ? exp(-up / hgt) : exp(up * 55.0);
    float rays = 0.5 + 0.5 * pow(0.5 + 0.5 * gn(vec2(x * 22.0, fk * 5.3) + 3.0 * c), 1.3);
    lin += lab2lin(ramp(clamp(up / 0.35, 0.0, 1.0))) * body * rays * uGain * (1.0 - 0.22 * fk);
  }
  o = outLin(lin);
}`,
    // caustic light, the network sunlight draws on a pool floor: the well-known iterated distortion,
    // its clock replaced by points on circles (periodic in uTheta, so the loop is exact); the ramp
    // runs from the water (uLab[0]) to the light (uLab[last])
    caustics: `uniform float uTheta, uR, uScale, uGain;
float caustic(vec2 p) {
  vec2 i = p; float c = 1.0; const float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float fn = float(n), a = uR * 2.6 * cos(uTheta + fn * 1.7), b = uR * 2.6 * sin(uTheta + fn * 0.9);
    i = p + vec2(cos(a - i.x) + sin(b + i.y), sin(a - i.y) + cos(b + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + a) / inten), p.y / (cos(i.y + b) / inten)));
  }
  c /= 5.0; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
void main() {
  // far from the origin, as in the original (-250): near it 1/length(p·…) blows up and the whole frame saturates
  vec2 p = world() / max(uRes.x, uRes.y) * uScale * 6.2831853 + 2.0 * uR * vec2(cos(uTheta), sin(uTheta)) - 250.0;
  p += 1.4 * vec2(gn(p * 0.21), gn(p * 0.21 + 5.2)); // a slow warp: the recipe repeats every 2π, and that shows
  o = outLin(lab2lin(ramp(clamp(caustic(p) * uGain, 0.0, 1.0))));
}`,
    // a contour map of a slowly changing terrain: the isolines of a noise field, anti-aliased by their
    // own screen-space derivative (about uWidth px at any zoom), every fifth heavier, over a faint
    // tint by height (the ramp); the ink is the last colour
    topo: `uniform float uTheta, uR, uScale, uLines, uWidth, uAlpha; uniform vec3 uInk;
void main() {
  vec2 p = world() / max(uRes.x, uRes.y) * uScale, c = uR * vec2(cos(uTheta), sin(uTheta));
  float h = fbm(p + c) + 0.35 * fbm(2.3 * p - c + 4.1);
  float v = h * uLines, f = fract(v), d = min(f, 1.0 - f) / max(fwidth(v), 1e-4);
  float major = mod(floor(v + 0.5), 5.0) < 0.5 ? 1.0 : 0.0, w = uWidth * (1.0 + 0.6 * major);
  float line = 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, d);
  vec3 lab = mix(ramp(clamp(0.5 + h * 0.9, 0.0, 1.0)), uInk, clamp(line * uAlpha * (1.0 + 0.7 * major), 0.0, 1.0));
  o = outLin(lab2lin(lab));
}`,
    // a halftone screen: dots on a rotated grid, their AREA following a soft light at uSpot (a share of
    // the long side from the centre) and a slow drift of noise; anti-aliased by the derivative
    halftone: `uniform float uTheta, uR, uStep, uAngle, uMax; uniform vec2 uSpot; uniform vec3 uDot, uBase;
void main() {
  float ca = cos(uAngle), sa = sin(uAngle);
  mat2 R = mat2(ca, sa, -sa, ca);
  vec2 q = R * world() / uStep, cell = floor(q) + 0.5;
  vec2 P = (transpose(R) * (cell * uStep)) / max(uRes.x, uRes.y), c = uR * vec2(cos(uTheta), sin(uTheta));
  float tone = smoothstep(0.9, 0.05, length(P - uSpot)) + 0.25 * (0.5 + 0.5 * gn(P * 2.4 + 1.5 * c)) - 0.1;
  float r = 0.5 * uMax * sqrt(clamp(tone, 0.0, 1.0)), d = length(q - cell), aa = max(fwidth(d), 1e-4);
  o = outLin(lab2lin(mix(uBase, uDot, 1.0 - smoothstep(r - aa, r + aa, d))));
}`,
    // a soft sky: high (uLab[0]) to the horizon (uLab[1]), layered clouds (uLab[2]) stretched sideways
    // and shaded where more cloud lies toward the light (uLab[3]), drifting on a circle
    clouds: `uniform float uTheta, uR, uScale, uCover;
float dens(vec2 q, vec2 c) { return fbm(q) + 0.5 * fbm(q * 2.2 + 7.3 - 0.6 * c); }
void main() {
  vec2 p = world() / max(uRes.x, uRes.y), c = uR * vec2(cos(uTheta), sin(uTheta));
  vec3 sky = mix(uLab[0], uLab[1], clamp(0.5 + p.y * 1.1, 0.0, 1.0));
  vec2 q = p * uScale * vec2(0.8, 1.7) + c;
  float d = dens(q, c), cloud = smoothstep(uCover, uCover + 0.32, d);
  float lit = clamp(0.62 + (d - dens(q + vec2(-0.07, -0.12), c)) * 2.6, 0.0, 1.0);
  o = outLin(lab2lin(mix(sky, mix(uLab[3], uLab[2], lit), cloud)));
}`,
  };
  const TESS = 48; // mesh: quads per side of the whole grid; the rasterizer interpolates within one

  function glStage(W, H, kind) {
    const cv = document.createElement('canvas'); cv.width = Math.round(W * GL_SHARE); cv.height = Math.round(H * GL_SHARE);
    const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error(`fx: the '${kind}' backdrop draws with WebGL2, which this browser does not offer — pick a 2D base`);
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`fx: ${kind} shader: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, kind === 'mesh' ? VERT_MESH : VERT_FULL));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG_HEAD + FRAG[kind]));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`fx: ${kind} program: ${gl.getProgramInfoLog(prog)}`);
    gl.useProgram(prog); gl.viewport(0, 0, cv.width, cv.height);
    const locs = {}, U = (n) => (n in locs ? locs[n] : (locs[n] = gl.getUniformLocation(prog, n)));
    return { cv, gl, prog, U };
  }
  /** The backdrop of a WebGL kind: returns { cv, render(t, cam, jitter) }. colorsAt(t) resolves the
   *  base's colours for that frame (they follow the keys when there are keys). */
  function glBackdrop(kind, base, { W, H, clk, colorsAt, labOf }) {
    const S = glStage(W, H, kind), { gl, U } = S, rnd = mulberry(base.seed ?? 11);
    gl.uniform2f(U('uRes'), W, H); gl.uniform2f(U('uGL'), S.cv.width, S.cv.height);
    gl.uniform1f(U('uDither'), base.dither ?? 1);
    const setRamp = (cols) => {
      const n = Math.min(8, cols.length), at = base.stops && base.stops.length === cols.length ? base.stops : cols.map((_, i) => i / Math.max(1, cols.length - 1));
      gl.uniform1i(U('uN'), n);
      gl.uniform3fv(U('uLab'), new Float32Array(cols.slice(0, n).flatMap(labOf)));
      gl.uniform1fv(U('uAt'), new Float32Array(at.slice(0, n)));
    };
    const common = (c, J) => { gl.uniform3f(U('uCam'), c.x, c.y, c.z); gl.uniform2f(U('uJit'), J[0], J[1]); };
    if (kind === 'mesh') {
      const [Cn, Rn] = base.grid || [4, 3], N = Cn * Rn, m = base.margin ?? 0.22, wander = base.wander ?? 0.06, jumble = base.jumble ?? 0.3;
      const seeds = Array.from({ length: N }, () => ({
        jx: (rnd() - 0.5) * jumble / (Cn - 1), jy: (rnd() - 0.5) * jumble / (Rn - 1),
        mx: rnd() < 0.3 ? 2 : 1, my: rnd() < 0.3 ? 2 : 1, px: rnd() * 2 * Math.PI, py: rnd() * 2 * Math.PI,
      }));
      const V = (TESS + 1) * (TESS + 1), pos = new Float32Array(V * 2), lab = new Float32Array(V * 3);
      const idx = new Uint16Array(TESS * TESS * 6);
      for (let b = 0, q = 0; b < TESS; b++) for (let a = 0; a < TESS; a++, q += 6) {
        const i0 = b * (TESS + 1) + a;
        idx.set([i0, i0 + 1, i0 + TESS + 1, i0 + 1, i0 + TESS + 2, i0 + TESS + 1], q);
      }
      const bp = gl.createBuffer(), bl = gl.createBuffer(), bi = gl.createBuffer();
      const aPos = gl.getAttribLocation(S.prog, 'aPos'), aLab = gl.getAttribLocation(S.prog, 'aLab');
      gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bl); gl.enableVertexAttribArray(aLab); gl.vertexAttribPointer(aLab, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      const CP = new Float64Array(N * 2), CL = new Float64Array(N * 3), tmp = new Float64Array(3);
      // Catmull-Rom through the control points, first along the rows, then down the columns
      const cr = (p0, p1, p2, p3, u) => 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
      const surf = (src, dim, s, t2, out, o) => {
        const i = Math.min(Math.floor(s), Cn - 2), u = s - i, j = Math.min(Math.floor(t2), Rn - 2), v = t2 - j;
        for (let d = 0; d < dim; d++) {
          const rv = [0, 0, 0, 0];
          for (let r = 0; r < 4; r++) {
            const row = clampi(j + r - 1, 0, Rn - 1) * Cn;
            const P = (k) => src[(row + clampi(i + k, 0, Cn - 1)) * dim + d];
            rv[r] = cr(P(-1), P(0), P(1), P(2), u);
          }
          out[o + d] = cr(rv[0], rv[1], rv[2], rv[3], v);
        }
      };
      return {
        cv: S.cv,
        render(t, c, J) {
          const th = clk.theta(t), amp = clk.amp, cols = colorsAt(t);
          for (let k = 0; k < N; k++) {
            const i = k % Cn, j = Math.floor(k / Cn), s = seeds[k];
            const u = -m + (1 + 2 * m) * i / (Cn - 1) + s.jx + wander * amp * Math.sin(s.mx * th + s.px) / s.mx;
            const v = -m + (1 + 2 * m) * j / (Rn - 1) + s.jy + wander * amp * Math.sin(s.my * th + s.py) / s.my;
            CP[k * 2] = (u - 0.5) * W; CP[k * 2 + 1] = (v - 0.5) * H;
            const L3 = labOf(cols[k % cols.length]); CL[k * 3] = L3[0]; CL[k * 3 + 1] = L3[1]; CL[k * 3 + 2] = L3[2];
          }
          for (let b = 0, n = 0; b <= TESS; b++) for (let a = 0; a <= TESS; a++, n++) {
            const s = a / TESS * (Cn - 1), t2 = b / TESS * (Rn - 1);
            surf(CP, 2, s, t2, tmp, 0);
            pos[n * 2] = W / 2 + (tmp[0] - c.x) * c.z + J[0]; pos[n * 2 + 1] = H / 2 + (tmp[1] - c.y) * c.z + J[1];
            surf(CL, 3, s, t2, lab, n * 3);
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, bl); gl.bufferData(gl.ARRAY_BUFFER, lab, gl.DYNAMIC_DRAW);
          const e = cols[0]; gl.clearColor(e[0] / 255, e[1] / 255, e[2] / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
        },
      };
    }
    if (kind === 'flow') {
      gl.uniform1f(U('uScale'), base.scale ?? 1.4); gl.uniform1f(U('uWarp'), base.warp ?? 1.6);
      gl.uniform1f(U('uContrast'), base.contrast ?? 1.5); gl.uniform1f(U('uSheen'), base.sheen ?? 0);
      gl.uniform1f(U('uLight'), base.light ?? 0);
      return {
        cv: S.cv,
        render(t, c, J) {
          common(c, J); setRamp(colorsAt(t));
          gl.uniform1f(U('uTheta'), clk.theta(t)); gl.uniform1f(U('uR'), (base.drift ?? 0.6) * clk.amp);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
      };
    }
    if (kind === 'blobs') {
      const LONG = Math.max(W, H), orbit = base.orbit ?? 0.12, r = base.r ?? 0.3;
      const n = Math.min(8, (base.colors || []).length || 1);
      const bl = Array.from({ length: n }, (_, i) => ({
        at: base.at?.[i] || [0.12 + 0.76 * rnd(), 0.12 + 0.76 * rnd()],
        mx: rnd() < 0.35 ? 2 : 1, my: rnd() < 0.35 ? 2 : 1, px: rnd() * 2 * Math.PI, py: rnd() * 2 * Math.PI, rs: 0.8 + 0.4 * rnd(),
      }));
      gl.uniform1f(U('uGain'), base.gain ?? 1.4); gl.uniform1f(U('uSharp'), base.sharp ?? 1.6);
      const bp = new Float32Array(8 * 3), bc = new Float32Array(8 * 3);
      return {
        cv: S.cv,
        render(t, c, J) {
          common(c, J);
          const th = clk.theta(t), amp = clk.amp, cols = colorsAt(t);
          gl.uniform3fv(U('uBase'), new Float32Array(labOf(cols.under)));
          bl.forEach((b, i) => {
            const x = (b.at[0] - 0.5) * W + orbit * LONG * amp * Math.sin(b.mx * th + b.px) / b.mx;
            const y = (b.at[1] - 0.5) * H + orbit * LONG * amp * 0.8 * Math.sin(b.my * th + b.py) / b.my;
            bp.set([x, y, r * LONG * b.rs], i * 3); bc.set(labOf(cols[i % cols.length]), i * 3);
          });
          gl.uniform1i(U('uNB'), n); gl.uniform3fv(U('uBP'), bp); gl.uniform3fv(U('uBL'), bc);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
      };
    }
    if (kind === 'caustics' || kind === 'topo' || kind === 'halftone' || kind === 'clouds') {
      const set = {
        caustics: { uScale: base.scale ?? 1.5, uGain: base.gain ?? 1 },
        topo: { uScale: base.scale ?? 1.25, uLines: base.lines ?? 14, uWidth: base.width ?? 1.15, uAlpha: base.alpha ?? 0.22 },
        halftone: { uStep: base.step ?? 13, uAngle: ((base.angle ?? 15) * Math.PI) / 180, uMax: base.max ?? 0.95 },
        clouds: { uScale: base.scale ?? 2.4, uCover: base.cover ?? 0.02 },
      }[kind];
      Object.entries(set).forEach(([k, v]) => gl.uniform1f(U(k), v));
      // uSpot, not uAt: the ramp's stops already have that name in the shared header
      if (kind === 'halftone') { const a = base.at || [0.2, -0.16]; gl.uniform2f(U('uSpot'), a[0], a[1]); }
      return {
        cv: S.cv,
        render(t, c, J) {
          common(c, J); const cols = colorsAt(t);
          if (kind === 'topo') { setRamp(cols.slice(0, -1)); gl.uniform3fv(U('uInk'), new Float32Array(labOf(cols[cols.length - 1]))); }
          else if (kind === 'halftone') { gl.uniform3fv(U('uBase'), new Float32Array(labOf(cols.under))); gl.uniform3fv(U('uDot'), new Float32Array(labOf(cols[0]))); }
          else setRamp(cols);
          gl.uniform1f(U('uTheta'), clk.theta(t)); gl.uniform1f(U('uR'), (base.drift ?? 0.5) * clk.amp);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
      };
    }
    // aurora
    gl.uniform1f(U('uScale'), base.scale ?? 1.2); gl.uniform1f(U('uGain'), base.gain ?? 0.55);
    return {
      cv: S.cv,
      render(t, c, J) {
        common(c, J); const cols = colorsAt(t); setRamp(cols);
        gl.uniform3fv(U('uBase'), new Float32Array(labOf(cols.under)));
        gl.uniform1f(U('uTheta'), clk.theta(t)); gl.uniform1f(U('uR'), (base.drift ?? 0.5) * clk.amp);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }
  /** A 2D gradient's stops, mixed in OKLab: canvas interpolates in sRGB, which dulls a ramp through
   *  grey, so the ramp is sampled at 33 stops. cyclic (a conic) closes back on the first colour. */
  function rampStops(g, cols, at, cyclic) {
    const labs = cols.map(toLab);
    let pos = at && at.length === cols.length ? at.slice() : cols.map((_, i) => i / (cols.length - (cyclic ? 0 : 1)));
    if (cyclic) { labs.push(labs[0]); pos.push(1); }
    if (labs.length === 1) { labs.push(labs[0]); pos = [0, 1]; }
    const n = labs.length;
    for (let k = 0; k <= 32; k++) {
      const x = k / 32;
      let i = 0; while (i < n - 2 && x > pos[i + 1]) i++;
      const p = clamp((x - pos[i]) / ((pos[i + 1] - pos[i]) || 1));
      g.addColorStop(x, rgba(fromLab([0, 1, 2].map((d) => lerp(labs[i][d], labs[i + 1][d], p)))));
    }
  }

  // ---------------------------------------------------------------- grain tiles
  const TILE = 512;
  let TILES = null;
  function tiles() { // seeded, so every worker and every machine draws the same grain
    if (TILES) return TILES;
    let s = 0x2545F491;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    TILES = [0, 1, 2, 3].map(() => {
      const c = document.createElement('canvas'); c.width = c.height = TILE;
      const x = c.getContext('2d'), img = x.createImageData(TILE, TILE), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (rnd() + rnd() + rnd() - 1.5) / 1.5; // near-normal in [-1, 1], σ = 1/3
        d[i] = d[i + 1] = d[i + 2] = n > 0 ? 255 : 0; d[i + 3] = Math.round(Math.abs(n) * 255);
      }
      x.putImageData(img, 0, 0);
      return c;
    });
    return TILES;
  }
  const hash = (n) => {
    let h = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
  };

  // ---------------------------------------------------------------- presets
  const PRESETS = {
    plain: ['the brand canvas, flat', () => ({ tone: 'light', base: 'canvas' })],
    paper: ['canvas, a fine paper texture, a soft vignette: editorial', () => ({ tone: 'light', base: 'canvas', vignette: 0.25, dither: 3 })],
    dots: ['a dot matrix on the UI’s plane', () => ({
      tone: 'light', base: 'canvas',
      pattern: { kind: 'dots', step: 32, size: 1.1, color: [120, 120, 140], alpha: 0.16, depth: 1 },
    })],
    grid: ['a fine grid behind the UI, parallax, fading out: technical', () => ({
      tone: 'light', base: 'canvas', vignette: 0.15, dither: 1.5,
      pattern: { kind: 'grid', step: 72, size: 1, color: 'ink', alpha: 0.08, depth: 0.55, fade: 0.9, dof: 0.7 },
    })],
    aura: ['the brand colours as soft light, drifting', () => ({
      tone: 'light', base: 'canvas', drift: 0.05, dither: 1.5,
      lights: [
        { color: 'accent', at: [0.88, 0.1], r: 0.62, a: 0.3 },
        { color: 'a', at: [0.06, 0.94], r: 0.55, a: 0.24 },
        { color: 'b', at: [0.6, 1.1], r: 0.42, a: 0.16 },
      ],
    })],
    spotlight: ['a light studio: one pool of light behind the subject', () => ({
      tone: 'light', base: { from: [226, 227, 231], to: [206, 207, 212], angle: 90 }, vignette: 0.4, dither: 1.5,
      spot: { at: [0.62, 0.44], r: 0.62, a: 0.95, color: [255, 255, 255], depth: 0.2 },
    })],
    night: ['dark, the brand colours glowing', () => ({
      tone: 'dark', base: [11, 12, 18], drift: 0.06, vignette: 0.5, dither: 2,
      lights: [
        { color: 'accent', at: [0.86, 0.14], r: 0.6, a: 0.55 },
        { color: 'a', at: [0.1, 0.9], r: 0.5, a: 0.36 },
        { color: 'b', at: [0.56, 1.12], r: 0.4, a: 0.26 },
      ],
    })],
    studio: ['dark, one soft light, a deep vignette: cinematic', () => ({
      tone: 'dark', base: [19, 20, 24], vignette: 0.6, dither: 2,
      spot: { at: [0.6, 0.42], r: 0.72, a: 0.2, color: [255, 255, 255], depth: 0.2 },
    })],
    // the WebGL kinds and the multi-stop gradients: every colour is a palette role or a mix of two
    mesh: ['a mesh of pale brand tints, drifting: airy, light', () => ({
      tone: 'light', vignette: 0.1, dither: 1.5,
      base: {
        kind: 'mesh', grid: [4, 3], wander: 0.06, period: 24, depth: 0.1, colors: [
          'canvas', { mix: ['canvas', 'a', 0.45] }, { mix: ['canvas', 'accent', 0.38] }, { mix: ['canvas', 'accent', 0.62] },
          { mix: ['canvas', 'b', 0.42] }, 'canvas', { mix: ['canvas', 'accent', 0.24] }, { mix: ['canvas', 'a', 0.55] },
          { mix: ['canvas', 'accent', 0.3] }, { mix: ['canvas', 'b', 0.5] }, 'canvas', { mix: ['canvas', 'a', 0.3] },
        ],
      },
    })],
    meshdark: ['a deep mesh of the brand colours: rich, dark', () => ({
      tone: 'dark', vignette: 0.35, dither: 2,
      base: {
        kind: 'mesh', grid: [4, 3], wander: 0.07, period: 24, depth: 0.1, colors: [
          [10, 11, 20], { mix: [[10, 11, 20], 'accent', 0.55] }, [12, 12, 24], { mix: [[10, 11, 20], 'a', 0.5] },
          { mix: [[10, 11, 20], 'b', 0.45] }, [14, 14, 26], { mix: [[10, 11, 20], 'accent', 0.8] }, [11, 12, 22],
          [10, 11, 20], { mix: [[10, 11, 20], 'a', 0.35] }, [12, 12, 22], { mix: [[10, 11, 20], 'b', 0.6] },
        ],
      },
    })],
    silk: ['a slow flowing field of brand tints with a lustre: silk', () => ({
      tone: 'light', vignette: 0.12, dither: 1.5,
      base: {
        kind: 'flow', scale: 0.72, warp: 1.05, contrast: 1.25, light: 0.75, sheen: 0.075, drift: 0.3, period: 30, depth: 0.08,
        colors: [{ mix: ['canvas', 'accent', 0.16] }, { mix: ['canvas', 'accent', 0.4] }, { mix: ['canvas', 'a', 0.3] }, { mix: ['canvas', 'accent', 0.22] }],
      },
    })],
    lava: ['dark, large soft blobs of colour orbiting slowly', () => ({
      tone: 'dark', vignette: 0.4, dither: 2,
      base: {
        kind: 'blobs', under: [9, 10, 18], gain: 1.3, r: 0.22, orbit: 0.14, sharp: 1.6, period: 26, depth: 0.1,
        at: [[0.78, 0.2], [0.14, 0.82], [0.6, 0.95], [0.3, 0.12]],
        colors: ['accent', 'a', 'b', { mix: ['accent', 'b', 0.5] }],
      },
    })],
    aurora: ['dark, curtains of light rising from a wandering edge', () => ({
      tone: 'dark', vignette: 0.3, dither: 2,
      base: {
        kind: 'aurora', under: [6, 8, 16], gain: 0.55, scale: 1.2, period: 30, depth: 0.08,
        colors: ['a', { mix: ['a', 'accent', 0.5] }, 'accent'],
      },
    })],
    sunrise: ['a pastel dawn in several stops, warm light low', () => ({
      tone: 'light', vignette: 0.12, dither: 1.5,
      base: {
        kind: 'linear', angle: 100, stops: [0, 0.3, 0.62, 0.8, 1],
        colors: [{ mix: ['canvas', 'accent', 0.32] }, { mix: ['canvas', 'accent', 0.12] }, { mix: ['canvas', 'b', 0.3] }, { mix: ['canvas', 'b', 0.12] }, 'canvas'],
      },
      spot: { at: [0.62, 0.72], r: 0.5, a: 0.5, color: [255, 250, 240], depth: 0.15 },
    })],
    halo: ['light, a faint sheen swaying around the subject', () => ({
      tone: 'light', vignette: 0.22, dither: 1.5,
      base: {
        kind: 'conic', at: [0.62, 0.46], angle: -30, sway: 14, period: 20,
        colors: ['canvas', { mix: ['canvas', 'accent', 0.3] }, 'canvas', { mix: ['canvas', 'a', 0.26] }, 'canvas', { mix: ['canvas', 'b', 0.22] }],
      },
      spot: { at: [0.62, 0.46], r: 0.4, a: 0.55, color: [255, 255, 255], depth: 0.2 },
    })],
    caustics: ['light, the network sunlight draws on a pool floor, in the brand tint, shifting slowly', () => ({
      tone: 'light', vignette: 0.14, dither: 1.5,
      base: {
        kind: 'caustics', scale: 2.6, gain: 1.3, drift: 0.55, period: 28, depth: 0.08,
        colors: [{ mix: ['canvas', 'accent', 0.2] }, { mix: ['canvas', 'accent', 0.08] }, [255, 255, 255]],
      },
    })],
    topo: ['light, the contour lines of a slowly shifting terrain: technical, quiet', () => ({
      tone: 'light', vignette: 0.12, dither: 1.5,
      base: {
        kind: 'topo', scale: 1.5, lines: 20, width: 1.2, alpha: 0.26, drift: 0.35, period: 30, depth: 0.25,
        colors: ['canvas', { mix: ['canvas', 'accent', 0.08] }, 'ink'],
      },
    })],
    halftone: ['light, a halftone screen: dots that swell toward a soft light, editorial', () => ({
      tone: 'light', vignette: 0.1, dither: 1,
      base: {
        kind: 'halftone', step: 16, angle: 15, max: 0.95, at: [0.26, -0.22], drift: 0.6, period: 26, depth: 0.5,
        colors: [{ mix: ['canvas', 'accent', 0.45] }], under: 'canvas',
      },
    })],
    clouds: ['light, a soft sky with clouds drifting across: airy, dreamy', () => ({
      tone: 'light', vignette: 0.1, dither: 1.5,
      base: {
        kind: 'clouds', scale: 2.4, cover: 0.02, drift: 0.5, period: 34, depth: 0.06,
        colors: [{ mix: ['canvas', 'accent', 0.34] }, { mix: ['canvas', 'b', 0.12] }, [255, 255, 255], { mix: ['canvas', 'accent', 0.22] }],
      },
    })],
    lines: ['light, fine parallel lines at an angle, in parallax: Swiss', () => ({
      tone: 'light', base: 'canvas', vignette: 0.12, dither: 1,
      pattern: { kind: 'lines', angle: 62, step: 24, size: 1, color: 'ink', alpha: 0.11, depth: 0.6, fade: 0.8 },
    })],
    floor: ['dark, a stage: a floor grid in perspective and a glow on the horizon', () => ({
      tone: 'dark', vignette: 0.45, dither: 2,
      base: { kind: 'linear', angle: 90, stops: [0, 0.62, 1], colors: [[8, 9, 14], { mix: [[10, 11, 18], 'accent', 0.16] }, [8, 9, 13]] },
      floor: { horizon: 0.64, step: 120, alpha: 0.24, depth: 0.5, glow: 'accent', glowA: 0.55 },
    })],
    ember: ['dark and warm: a low glow, a grainy texture, filmic', () => ({
      tone: 'dark', vignette: 0.55, dither: 3.4,
      base: { kind: 'radial', at: [0.5, 1.1], r: 1.05, stops: [0, 0.45, 1], colors: [{ mix: [[16, 11, 12], 'b', 0.5] }, { mix: [[12, 10, 12], 'accent', 0.22] }, [9, 8, 10]] },
    })],
    dunes: ['light, layered ridges in the brand tints, swaying slowly, in depth', () => ({
      tone: 'light', vignette: 0.12, dither: 1.5,
      base: {
        kind: 'dunes', top: 0.46, bottom: 0.86, amp: 0.07, period: 30, depth: 0.05, seed: 5,
        // far ridges pale, near ones deeper: aerial perspective in the brand's own hue
        colors: ['canvas', { mix: ['canvas', 'accent', 0.1] }, { mix: ['canvas', 'accent', 0.2] }, { mix: ['canvas', 'accent', 0.32] }, { mix: ['canvas', 'accent', 0.46] }],
      },
    })],
    // not in FX.PRESETS (the looks sheet has no picture to show): FX.look({ preset: 'photo', base: { image, … } })
    photo: ['your picture, cover-fit, a soft vignette; base.blur, tint, duotone, drift', () => ({
      tone: 'auto', vignette: 0.28, dither: 1.2, base: { image: null, blur: 0, depth: 0.08 },
    })],
    transparent: ['nothing behind: the frame left clear, for a film laid over other footage (ALPHA=1)', () => ({
      tone: 'light', base: 'none',
    })],
  };

  // not on the looks sheet (FX.PRESETS): photo has no picture to show, transparent only the page's background
  const HIDDEN = new Set(['photo', 'transparent']);
  /** Which of the palette's companions (a, b, c: the colours a scheme derives from the accent) a preset's
   *  backdrop is painted with: [] for a look that takes the accent alone, or no colour at all. The Studio says
   *  it beside the palette: on those a scheme changes nothing behind the product. Worked out when asked, once
   *  a preset: a film never asks. It is read off the preset's own settings, as any value that is exactly 'a',
   *  'b' or 'c' (today always a palette role, in a color, a colors list or a mix): a setting that took one of
   *  those strings for something else would be counted, and colours a film gives over the preset are not seen. */
  const COMPANIONS = new Map();
  function companions(name) {
    if (!COMPANIONS.has(name)) {
      const found = new Set();
      (function walk(v) {
        if (v === 'a' || v === 'b' || v === 'c') found.add(v);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      })(PRESETS[name] ? PRESETS[name][1]() : null);
      COMPANIONS.set(name, [...found].sort());
    }
    return COMPANIONS.get(name);
  }

  function look(cfg, env) {
    const { W, H, fps, duration: DUR, track, spr } = env;
    const name = cfg.preset || 'plain';
    if (!PRESETS[name]) throw new Error(`fx: no look preset '${name}' (${Object.keys(PRESETS).join(', ')})`);
    const L = PRESETS[name][1]();
    for (const [k, v] of Object.entries(cfg)) L[k] = isObj(v) && isObj(L[k]) ? { ...L[k], ...v } : v;
    const pal = cfg.palette || {};
    // a colour: [r, g, b], '#rrggbb', a palette role, or { mix: [colour, colour, p] } (p of the second, in OKLab)
    const resolve = (v, P) => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string' && v[0] === '#') return hex(v);
      if (P[v]) return P[v];
      if (isObj(v) && Array.isArray(v.mix)) return mixLab(resolve(v.mix[0], P), resolve(v.mix[1], P), v.mix[2] ?? 0.5);
      throw new Error(`fx: '${isObj(v) ? JSON.stringify(v) : v}' is not a colour or a palette role`);
    };
    const col = (v) => resolve(v, pal);
    // tone 'auto' (a picture): light until the picture is baked and its mean luminance says otherwise
    let dark = L.tone === 'dark', ink, dim;
    const toneInk = () => {
      ink = col(L.ink ?? (dark ? [242, 243, 247] : pal.ink ?? [26, 28, 36]));
      dim = col(L.dim ?? (dark ? [150, 155, 170] : pal.dim ?? [107, 111, 123]));
    };
    toneInk();
    const LONG = Math.max(W, H);
    const base = L.base === 'none' ? { none: true } : isObj(L.base) ? { ...L.base } : { rgb: col(L.base ?? 'canvas') };
    if (base.none) Object.assign(L, { vignette: 0, dither: 0, grain: 0 }); // each would cover the clear frame: even when asked for
    if (name === 'photo' && !base.image) throw new Error("fx: the 'photo' look needs base.image, a picture you hold the rights to");
    if (base.from) { base.from = col(base.from); base.to = col(base.to); }

    // a mesh, flow, blobs or aurora (WebGL) or a multi-stop gradient: base.kind
    const kind = base.kind;
    const KINDS_2D = ['linear', 'radial', 'conic', 'dunes'];
    if (kind && !GL_KINDS.includes(kind) && !KINDS_2D.includes(kind)) throw new Error(`fx: no base kind '${kind}' (${[...GL_KINDS, ...KINDS_2D].join(', ')})`);
    // With keys, the palette roles they name (keyRoles, by default the lights' accent, a, b) change
    // per scene, and every colour of the base built from them follows, mixes included.
    let palAt = null;
    if (kind && L.keys?.length) {
      const roles = L.keyRoles || ['accent', 'a', 'b'];
      const last = L.keys[L.keys.length - 1][1];
      roles.forEach((r, i) => {
        if (col(last[i] ?? r).some((v, j) => Math.round(v) !== Math.round(col(r)[j]))) {
          throw new Error('fx: the last key must return the colours to their first values, or the loop breaks');
        }
      });
      const tr = roles.map((r, i) => [0, 1, 2].map((c) => track(toLab(col(r))[c],
        L.keys.map(([tb, cs, f = 0.6, z = 1]) => [tb, toLab(col(cs[i] ?? r))[c], f, z]))));
      palAt = (t) => { const P = { ...pal }; roles.forEach((r, i) => { P[r] = fromLab(tr[i].map((fn) => fn(t))); }); return P; };
    }
    const baseCols = (P) => {
      const a = (base.colors?.length ? base.colors : ['canvas']).map((s) => resolve(s, P));
      a.under = resolve(base.under ?? (dark ? [10, 11, 18] : 'canvas'), P);
      return a;
    };
    const fixedCols = kind && !palAt ? baseCols(pal) : null;
    const colorsAt = (t) => fixedCols || baseCols(palAt(t));
    const clk = kind ? clock(DUR, base.period ?? 24) : null;
    const glk = GL_KINDS.includes(kind) ? glBackdrop(kind, base, { W, H, clk, colorsAt, labOf: toLab }) : null;
    let shade;
    const toneShade = () => { shade = dark ? [0, 0, 0] : mix(base.rgb ?? base.from ?? (kind ? colorsAt(0).under : null) ?? [128, 128, 128], [0, 0, 0], 0.62); };
    toneShade();
    const lights = (L.lights || []).map((l) => ({ depth: 0.12, ...l, rgb: col(l.color) }));
    const pattern = L.pattern ? { depth: 1, fade: 0, dof: 0, ...L.pattern, rgb: col(L.pattern.color ?? [120, 120, 140]) } : null;
    const spot = L.spot ? { depth: 0.2, ...L.spot, rgb: col(L.spot.color ?? [255, 255, 255]) } : null;
    const floor = L.floor ? { horizon: 0.64, step: 120, alpha: 0.26, depth: 0.5, ...L.floor, rgb: col(L.floor.color ?? (dark ? [255, 255, 255] : 'ink')), glowRGB: L.floor.glow ? col(L.floor.glow) : null } : null;

    // per-scene colours: one OKLab track per light and channel, springs on the beat grid
    let lightRGB = (i) => lights[i].rgb;
    if (L.keys?.length && lights.length) {
      const last = L.keys[L.keys.length - 1][1];
      lights.forEach((l, i) => {
        if (col(last[i] ?? l.color).some((v, j) => Math.round(v) !== Math.round(l.rgb[j]))) {
          throw new Error('fx: the last key must return the lights to their first colours, or the loop breaks');
        }
      });
      const tr = lights.map((l, i) => [0, 1, 2].map((c) => track(toLab(l.rgb)[c],
        L.keys.map(([tb, cs, f = 0.6, z = 1]) => [tb, toLab(col(cs[i] ?? l.color))[c], f, z]))));
      lightRGB = (i, t) => fromLab(tr[i].map((fn) => fn(t)));
    }

    // a picture as the base: baked once at cover size (+12 % so parallax and drift never show an
    // edge), with everything that does not move baked in — blur, a duotone, a tint, a dim — so a
    // frame costs one drawImage. No pixel is read back except for tone 'auto': a page opened from
    // file:// taints its canvas with a file:// picture, and there the tone stays as set.
    let baked = null;
    const clkImg = base.image && base.drift ? clock(DUR, base.period ?? 24) : null;
    const ready = base.image ? (async () => {
      const img = new Image(); img.src = base.image; await img.decode();
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.12;
      const c = document.createElement('canvas'); c.width = Math.ceil(img.naturalWidth * s); c.height = Math.ceil(img.naturalHeight * s);
      const x = c.getContext('2d');
      const b = base.blur || 0; // drawn 3σ past the edges, or the blur pulls transparency into them
      const f = [b ? `blur(${b}px)` : '', base.duotone ? 'grayscale(1)' : ''].filter(Boolean).join(' ');
      if (f) x.filter = f;
      x.drawImage(img, -3 * b, -3 * b, c.width + 6 * b, c.height + 6 * b); x.filter = 'none';
      if (base.duotone) { // a gradient map by compositing, no read-back: grey × the light, then screened with the dark
        const [d0, d1] = base.duotone.map(col);
        x.globalCompositeOperation = 'multiply'; x.fillStyle = rgba(d1); x.fillRect(0, 0, c.width, c.height);
        x.globalCompositeOperation = 'screen'; x.fillStyle = rgba(d0); x.fillRect(0, 0, c.width, c.height);
      }
      if (base.tint) { // { color, a, mode }: the brand laid over the picture, 'soft-light' by default
        x.globalCompositeOperation = base.tint.mode || 'soft-light';
        x.fillStyle = rgba(col(base.tint.color ?? 'accent'), base.tint.a ?? 0.35); x.fillRect(0, 0, c.width, c.height);
      }
      x.globalCompositeOperation = 'source-over';
      if (base.dim) { x.fillStyle = `rgba(0,0,0,${base.dim})`; x.fillRect(0, 0, c.width, c.height); }
      if (L.tone === 'auto') {
        try {
          const m = document.createElement('canvas'); m.width = m.height = 24;
          const y = m.getContext('2d'); y.drawImage(c, 0, 0, 24, 24);
          const d = y.getImageData(0, 0, 24, 24).data;
          let sum = 0; for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          dark = sum / (d.length / 4) < 0.52; toneInk(); toneShade();
        } catch { /* a tainted canvas: keep the tone as set */ }
      }
      baked = c;
    })() : Promise.resolve();
    const grainTiles = L.grain || L.dither ? tiles() : null;

    const lcam = (cam, k) => ({ x: cam.x * k, y: cam.y * k, z: Math.pow(cam.z, k) });
    // identity on the device's own pixels, without film.js's subpixel jitter when it is installed
    const pixelGrid = (c) => (c.rawSetTransform ? c.rawSetTransform(1, 0, 0, 1, 0, 0) : c.setTransform(1, 0, 0, 1, 0, 0));
    const place = (at, c) => [W / 2 + ((at[0] - 0.5) * W - c.x) * c.z, H / 2 + ((at[1] - 0.5) * H - c.y) * c.z];
    // a Gaussian falloff: a two-stop radial gradient shows its rim as a ring
    const GAUSS = Array.from({ length: 9 }, (_, i) => { const u = i / 8; return (Math.exp(-4.5 * u * u) - Math.exp(-4.5)) / (1 - Math.exp(-4.5)); });
    function glow(ctx, x, y, r, rgb, a) {
      if (r <= 0 || a <= 0) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      GAUSS.forEach((v, i) => g.addColorStop(i / 8, rgba(rgb, +(a * v).toFixed(4))));
      ctx.fillStyle = g; ctx.fillRect(-2, -2, W + 4, H + 4);
    }
    // an elliptical radial ramp over the frame, u = 1 at the corners
    function ellipse(ctx, alpha, rgb = [0, 0, 0]) {
      ctx.save(); ctx.setTransform(W / H, 0, 0, 1, W / 2, H / 2);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, H / Math.SQRT2);
      for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, rgba(rgb, +clamp(alpha(i / 12)).toFixed(4)));
      ctx.fillStyle = g; ctx.fillRect(-H / 2 - 2, -H / 2 - 2, H + 4, H + 4);
      ctx.restore();
    }

    let patCv = null;
    function drawPattern(ctx, cam) {
      const p = pattern, c = lcam(cam, p.depth);
      const soft = p.dof * clamp(Math.log(cam.z) / Math.log(3));
      const direct = !p.fade && soft < 0.01;
      let g = ctx;
      if (!direct) {
        if (!patCv) { patCv = document.createElement('canvas'); patCv.width = W; patCv.height = H; }
        g = patCv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
        const J = ctx.jitter || [0, 0]; g.setTransform(1, 0, 0, 1, J[0], J[1]);
      }
      const sp = p.step * c.z, r = p.size * c.z;
      const ox = ((W / 2 - c.x * c.z) % sp + sp) % sp, oy = ((H / 2 - c.y * c.z) % sp + sp) % sp;
      g.beginPath();
      if (p.kind === 'lines') { // parallel lines at p.angle degrees, p.step apart, through the camera's offset
        const a = ((p.angle ?? 90) * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, Lw = W + H;
        const o = (W / 2 - c.x * c.z) * nx + (H / 2 - c.y * c.z) * ny, off = ((o % sp) + sp) % sp, n0 = Math.ceil(Lw / sp) + 1;
        for (let k = -n0; k <= n0; k++) { const d = off + k * sp; g.moveTo(nx * d - dx * Lw, ny * d - dy * Lw); g.lineTo(nx * d + dx * Lw, ny * d + dy * Lw); }
        g.lineWidth = r; g.strokeStyle = rgba(p.rgb, p.alpha); g.stroke();
      } else if (p.kind === 'grid') {
        for (let x = ox - sp; x < W + sp; x += sp) { g.moveTo(x, 0); g.lineTo(x, H); }
        for (let y = oy - sp; y < H + sp; y += sp) { g.moveTo(0, y); g.lineTo(W, y); }
        g.lineWidth = r; g.strokeStyle = rgba(p.rgb, p.alpha); g.stroke();
      } else {
        for (let x = ox - sp; x < W + sp; x += sp) for (let y = oy - sp; y < H + sp; y += sp) { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); }
        g.fillStyle = rgba(p.rgb, p.alpha); g.fill();
      }
      if (direct) return;
      if (p.fade) { g.globalCompositeOperation = 'destination-in'; ellipse(g, (u) => 1 - p.fade * smooth(0.2, 1, u)); g.globalCompositeOperation = 'source-over'; }
      ctx.save(); pixelGrid(ctx); ctx.globalAlpha = 1 - 0.65 * soft;
      if (soft >= 0.01) ctx.filter = `blur(${(soft * 2.5).toFixed(2)}px)`; // device px: a filter ignores the transform
      ctx.drawImage(patCv, 0, 0); ctx.restore();
    }

    let floorCv = null;
    function drawFloor(ctx, cam) {
      const f = floor, c = lcam(cam, f.depth);
      if (!floorCv) { floorCv = document.createElement('canvas'); floorCv.width = W; floorCv.height = H; }
      const g = floorCv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      const J = ctx.jitter || [0, 0]; g.setTransform(1, 0, 0, 1, J[0], J[1]);
      const hy = H * f.horizon - c.y * c.z * 0.25, vx = W / 2 - c.x * c.z * 0.35, S = f.step * c.z, lw = Math.max(0.8, c.z);
      g.beginPath();
      for (let i = 0; i < 40; i++) { const z = 1 + i * 0.32, y = hy + (H + 2 - hy) / (z * z * 0.55 + 0.45); if (y - hy < 1.5) break; g.moveTo(-2, y); g.lineTo(W + 2, y); }
      const off = ((c.x * c.z) % S + S) % S, n = Math.ceil(W * 4 / S) + 2;
      for (let j = -n; j <= n; j++) { const xb = vx + (j * S - off) * 3; g.moveTo(vx + (xb - vx) * 0.02, hy + 1); g.lineTo(vx + (xb - vx) * 1.6, H + (H - hy) * 0.6); }
      g.lineWidth = lw; g.strokeStyle = rgba(f.rgb, f.alpha); g.stroke();
      g.globalCompositeOperation = 'destination-in'; // fading out toward the horizon
      const gr = g.createLinearGradient(0, hy, 0, H);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
      ctx.save(); pixelGrid(ctx); ctx.drawImage(floorCv, 0, 0); ctx.restore();
      if (f.glowRGB) { // the horizon's own light
        ctx.save(); ctx.globalCompositeOperation = dark ? 'screen' : 'source-over';
        ctx.setTransform(1, 0, 0, 0.16, 0, hy * (1 - 0.16)); glow(ctx, vx, hy, W * 0.62, f.glowRGB, f.glowA ?? 0.6); ctx.restore();
      }
    }

    function backdrop(ctx, t, cam, opts = {}) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (base.none) ctx.clearRect(-2, -2, W + 4, H + 4);
      else if (base.rgb) { ctx.fillStyle = rgba(base.rgb); ctx.fillRect(-2, -2, W + 4, H + 4); }
      else if (base.from) {
        const a = (base.angle ?? 90) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
        const hl = Math.abs(dx) * W / 2 + Math.abs(dy) * H / 2;
        const g = ctx.createLinearGradient(W / 2 - dx * hl, H / 2 - dy * hl, W / 2 + dx * hl, H / 2 + dy * hl);
        g.addColorStop(0, rgba(base.from)); g.addColorStop(1, rgba(base.to));
        ctx.fillStyle = g; ctx.fillRect(-2, -2, W + 4, H + 4);
      } else if (baked) {
        const c = lcam(cam, base.depth ?? 0.1);
        let s = 1, ox = 0, oy = 0;
        if (clkImg) { // a slow Ken Burns on a closed path: still at both ends, whole cycles, so the loop holds
          const th = clkImg.theta(t), a = base.drift * clkImg.amp;
          s = 1 + a * (0.5 - 0.5 * Math.cos(th)); ox = a * 0.5 * W * Math.sin(th); oy = a * 0.3 * H * Math.sin(2 * th);
        }
        ctx.drawImage(baked, W / 2 - (baked.width * s / 2 + c.x) * c.z + ox, H / 2 - (baked.height * s / 2 + c.y) * c.z + oy, baked.width * s * c.z, baked.height * s * c.z);
      } else if (kind === 'dunes') { // ridges back to front, each a sum of slow waves, parallax by layer
        const cols = colorsAt(t), th = clk.theta(t), amp = clk.amp, n = cols.length - 1, rnd = mulberry(base.seed ?? 5);
        // each wave's phase sways by amp·D·sin(m·θ), m whole: exactly back where it began at the loop point
        ctx.fillStyle = rgba(cols[0]); ctx.fillRect(-2, -2, W + 4, H + 4); // the sky
        const top = base.top ?? 0.4, bottom = base.bottom ?? 0.84, A = (base.amp ?? 0.05) * H;
        for (let i = 0; i < n; i++) {
          const k = n > 1 ? i / (n - 1) : 1, c = lcam(cam, (base.depth ?? 0.05) * (1 + 3 * k));
          const y0 = H * lerp(top, bottom, k) - c.y * c.z, ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], fr = [0.7 + rnd() * 0.5, 1.6 + rnd() * 0.8, 3.1 + rnd()];
          ctx.beginPath(); ctx.moveTo(-4, H + 4);
          for (let x = -4; x <= W + 4; x += 6) {
            const u = ((x - W / 2) / c.z + c.x) / W;
            const y = y0 + A * (1 - 0.35 * k) * (Math.sin(6.283 * u * fr[0] + ph[0] + amp * 1.2 * Math.sin(th + i)) + 0.45 * Math.sin(6.283 * u * fr[1] + ph[1] - amp * 0.9 * Math.sin(2 * th + i)) + 0.18 * Math.sin(6.283 * u * fr[2] + ph[2] + amp * 0.6 * Math.sin(th - i)));
            ctx.lineTo(x, y);
          }
          ctx.lineTo(W + 4, H + 4); ctx.closePath();
          ctx.save(); ctx.shadowColor = `rgba(0,0,0,${dark ? 0.35 : 0.1})`; ctx.shadowBlur = 36; ctx.shadowOffsetY = -6;
          ctx.fillStyle = rgba(cols[i + 1]); ctx.fill(); ctx.restore();
        }
      } else if (glk) { // the jitter enters the shader; the blit stays on the pixel grid with its dither
        glk.render(t, lcam(cam, base.depth ?? 0.1), ctx.jitter || [0, 0]);
        ctx.save(); pixelGrid(ctx);
        if (glk.cv.width === W) ctx.drawImage(glk.cv, 0, 0); else ctx.drawImage(glk.cv, 0, 0, W, H); // a preview's share, stretched
        ctx.restore();
      } else if (kind) { // a multi-stop 2D gradient; linear is painted on the frame, radial and conic have a centre
        const cols = colorsAt(t), c = lcam(cam, base.depth ?? 0.15);
        const sway = (base.sway || 0) * clk.amp * Math.sin(clk.theta(t));
        let g;
        if (kind === 'linear') {
          const a = ((base.angle ?? 90) + sway) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
          const hl = Math.abs(dx) * W / 2 + Math.abs(dy) * H / 2;
          g = ctx.createLinearGradient(W / 2 - dx * hl, H / 2 - dy * hl, W / 2 + dx * hl, H / 2 + dy * hl);
        } else {
          const [x, y] = place(base.at || [0.5, 0.5], c);
          g = kind === 'radial' ? ctx.createRadialGradient(x, y, 0, x, y, (base.r ?? 0.75) * LONG * c.z)
            : ctx.createConicGradient(((base.angle ?? 0) + sway) * Math.PI / 180, x, y);
        }
        rampStops(g, cols, base.stops, kind === 'conic');
        ctx.fillStyle = g; ctx.fillRect(-2, -2, W + 4, H + 4);
        // a conic's centre is a point every wedge meets: a pinwheel. A core of the ramp's own mean
        // colour, fading out over `core` of the long side, turns it into a soft glow.
        if (kind === 'conic' && (base.core ?? 0.3) > 0) {
          const labs = cols.map(toLab), mean = fromLab([0, 1, 2].map((d) => labs.reduce((s, l) => s + l[d], 0) / labs.length));
          const [x, y] = place(base.at || [0.5, 0.5], c);
          glow(ctx, x, y, (base.core ?? 0.3) * LONG * c.z, mean, 1);
        }
      }
      if (pattern) drawPattern(ctx, cam);
      if (floor) drawFloor(ctx, cam);
      ctx.globalCompositeOperation = dark ? 'screen' : 'source-over';
      if (lights.length) { // still for the first and last half second: the loop point is exact, not asymptotic
        const u = 2 * Math.PI * ease5(clamp((t - 0.5) / (DUR - 1))), d = (L.drift || 0) * LONG;
        lights.forEach((l, i) => { // a figure of eight per light, each on its own phase
          const c = lcam(cam, l.depth), ph = u + i * 2.1;
          const [x, y] = place([l.at[0] + d * Math.sin(ph) / W, l.at[1] + d * 0.7 * Math.sin(2 * ph + i) / H], c);
          glow(ctx, x, y, l.r * LONG * c.z, lightRGB(i, t), l.a);
        });
      }
      if (spot) { const c = lcam(cam, spot.depth), [x, y] = place(spot.at, c); glow(ctx, x, y, spot.r * LONG * c.z, spot.rgb, spot.a); }
      ctx.globalCompositeOperation = 'source-over';
      if (L.dither) noise(ctx, grainTiles[0], 0, 0, L.dither); // static, so loopcheck keeps it
      if (L.grainOn !== 'frame') grain(ctx, t, opts);
      ctx.restore();
    }

    function noise(ctx, tile, ox, oy, sd) {
      const pat = ctx.createPattern(tile, 'repeat');
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, -ox, -oy]));
      ctx.save(); pixelGrid(ctx);
      ctx.globalAlpha = sd / 42.5; // the tiles at full alpha: σ = 127.5 / 3 levels at mid-grey
      ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    function grain(ctx, t, opts) {
      // it changes every frame by design, so it is the one thing loopcheck has to leave out
      if (!L.grain || opts.loopcheck) return;
      // whole frames only: a pattern that changed mid-frame would be averaged down by the blend.
      // A subframe a hair under an integer frame still belongs to it, hence the epsilon.
      const f = Math.floor(Math.floor(t * fps + 1e-6) / (L.grainEvery || 1)), h = hash(f);
      noise(ctx, grainTiles[h & 3], (h >>> 2) % TILE, (h >>> 11) % TILE, L.grain);
    }

    function finish(ctx, t, opts = {}) { // over everything: the vignette, and grain when grainOn is 'frame'
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (L.vignette) ellipse(ctx, (u) => L.vignette * Math.pow(smooth(0.3, 1.05, u), 1.5), shade);
      if (L.grainOn === 'frame') grain(ctx, t, opts);
      ctx.restore();
    }

    // Frame-sized from the start and never resized: a scratch canvas grown on first use (the menu
    // bar's size, then the menu's) blurred differently on that first frame than on every later one.
    const glassCv = document.createElement('canvas'); glassCv.width = W; glassCv.height = H;
    /** A frosted surface: what is already drawn beneath, blurred and saturated, then a tint and a
     *  rim. Call it where an opaque fill would go, in the same coordinates. It can only see the main
     *  canvas: inside an offscreen 3D layer there is nothing beneath it yet. */
    function glass(ctx, x, y, w, h, r, o = {}) {
      const { blur = 18, sat = 1.5, tint = [255, 255, 255], alpha = 0.72, rim = 0.55, shadow = null } = o;
      const m = ctx.getTransform(), k = Math.hypot(m.a, m.b); // the camera's transforms: scale and translate
      const B = blur * k, M = Math.ceil(B * 3), dx = m.a * x + m.c * y + m.e, dy = m.b * x + m.d * y + m.f;
      // what lies beneath, plus a margin for the blur to draw from, within the frame
      const bx = clamp(Math.floor(dx) - M, 0, W), by = clamp(Math.floor(dy) - M, 0, H);
      const bw = clamp(Math.ceil(dx + w * k) + M, 0, W) - bx, bh = clamp(Math.ceil(dy + h * k) + M, 0, H) - by;
      const g = glassCv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      if (bw > 0 && bh > 0) {
        g.filter = `blur(${B.toFixed(2)}px) saturate(${sat})`; // device px: a filter ignores the transform
        g.drawImage(ctx.canvas, bx, by, bw, bh, 0, 0, bw, bh); // sampled before this surface draws anything
        g.filter = 'none';
      }
      const rad = Math.min(r, w / 2, h / 2);
      ctx.save();
      ctx.beginPath(); ctx.roundRect(x, y, w, h, rad);
      if (shadow) { ctx.shadowColor = shadow[2]; ctx.shadowBlur = shadow[0] * k; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = shadow[1] * k; }
      ctx.fillStyle = rgba(tint); ctx.fill(); // casts the shadow; the glass covers it
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (bw > 0 && bh > 0) ctx.drawImage(glassCv, 0, 0, bw, bh, bx, by, bw, bh);
      ctx.setTransform(m); ctx.fillStyle = rgba(tint, alpha); ctx.fillRect(x, y, w, h);
      ctx.restore();
      if (rim > 0) {
        ctx.save(); ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, rad - 0.5));
        const gr = ctx.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, `rgba(255,255,255,${rim})`); gr.addColorStop(1, `rgba(255,255,255,${(rim * 0.25).toFixed(3)})`);
        ctx.lineWidth = 1; ctx.strokeStyle = gr; ctx.stroke(); ctx.restore();
      }
    }

    /** A click made visible: a ring from the cursor's tip, over any surface. (x, y) is the click
     *  point on screen now, so the ring stays on it if the camera moves. */
    function ripple(ctx, x, y, t, tc, k = 1) {
      if (L.clicks === 'none' || t <= tc) return;
      const fade = 1 - spr(t, tc + 0.06, 1.6, 1);
      if (fade <= 0.002) return;
      const r = (3 + 19 * spr(t, tc, 2.4, 1)) * k;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${(0.1 * fade).toFixed(4)})`; ctx.fill();
      ctx.shadowColor = `rgba(0,0,0,${(0.35 * fade).toFixed(4)})`; ctx.shadowBlur = 4 * k;
      ctx.lineWidth = 1.6 * k; ctx.strokeStyle = `rgba(255,255,255,${(0.75 * fade).toFixed(4)})`; ctx.stroke();
      ctx.restore();
    }

    return {
      name, about: PRESETS[name][0],
      get tone() { return dark ? 'dark' : 'light'; }, get ink() { return ink; }, get dim() { return dim; },
      get edge() { return dark ? 'rgba(255,255,255,0.12)' : null; },
      transparent: !!base.none, // FX.sequence fades into it by taking the look before away
      backdrop, finish, glass, ripple, ready, W, H,
    };
  }

  /** A long film's backdrop by chapter: [[t, LOOK], …], t in seconds, the first at 0, every look made
   *  with FX.look on the same env. At each boundary the next look fades in over `fade` seconds
   *  centred on it: drawn into a frame-sized canvas made once (with the frame's own jitter) and laid
   *  over the current one; the vignettes cross-fade the same way. The returned object is used like a
   *  look. ink and dim are mixed in OKLab while a fade runs — read them after backdrop() in the same
   *  seek — and tone, edge, glass and ripple are the dominant look's. A film that loops ends on the
   *  look it began with. */
  function sequence(entries, o = {}) {
    const fade = o.fade ?? 0.8;
    const list = entries.map(([t, lk]) => ({ t, lk })).sort((a, b) => a.t - b.t);
    if (!list.length) throw new Error('fx: a sequence needs at least one look');
    const { W, H } = list[0].lk;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const g = off.getContext('2d');
    // the offscreen mirrors film.js's stage: the same jitter, the same raw escape for the dither
    const CP = CanvasRenderingContext2D.prototype, raw = CP.setTransform.bind(g), get = CP.getTransform.bind(g);
    let J = [0, 0];
    g.setTransform = function (a, b, c, d, e, f) {
      if (a === undefined) { a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; } else if (a !== null && typeof a === 'object') ({ a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 } = a);
      raw(a, b, c, d, e + J[0], f + J[1]);
    };
    g.resetTransform = () => raw(1, 0, 0, 1, J[0], J[1]);
    g.getTransform = () => { const m = get(); m.e -= J[0]; m.f -= J[1]; return m; };
    g.rawSetTransform = raw;
    Object.defineProperty(g, 'jitter', { get: () => J });
    g.imageSmoothingQuality = 'high';
    const state = (t) => { // [the look, the next one fading in or null, how far it has]
      let k = 0;
      while (k + 1 < list.length && t >= list[k + 1].t - fade / 2) k++;
      if (k > 0 && t < list[k].t + fade / 2) return [list[k - 1].lk, list[k].lk, smooth(list[k].t - fade / 2, list[k].t + fade / 2, t)];
      return [list[k].lk, null, 0];
    };
    let now = state(0);
    const text = (key) => { const [A, B, p] = now; return B ? mixLab(A[key], B[key], p) : A[key]; };
    const lead = () => { const [A, B, p] = now; return B && p >= 0.5 ? B : A; };
    return {
      name: 'sequence', about: list.map((e) => e.lk.name).join(' → '), W, H,
      get tone() { return lead().tone; },
      get ink() { return text('ink'); },
      get dim() { return text('dim'); },
      get edge() { return lead().edge; },
      /** Sets the time ink, dim, tone and edge answer for, when they are read before backdrop(). */
      at(t) { now = state(t); return this; },
      backdrop(ctx, t, cam, opts = {}) {
        now = state(t);
        const [A, B, p] = now;
        A.backdrop(ctx, t, cam, opts);
        if (!B || p <= 0) return;
        if (B.transparent) { // a clear look fading in only takes the one before away: A·(1 − p), alpha included
          ctx.save();
          if (ctx.rawSetTransform) ctx.rawSetTransform(1, 0, 0, 1, 0, 0); else ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = p; ctx.fillStyle = '#000'; ctx.fillRect(-2, -2, W + 4, H + 4); ctx.restore();
          return;
        }
        J = ctx.jitter || [0, 0];
        raw(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
        B.backdrop(g, t, cam, opts);
        ctx.save();
        if (ctx.rawSetTransform) ctx.rawSetTransform(1, 0, 0, 1, 0, 0); else ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = p; ctx.drawImage(off, 0, 0); ctx.restore();
      },
      finish(ctx, t, opts = {}) {
        const [A, B, p] = state(t);
        if (!B) { A.finish(ctx, t, opts); return; }
        ctx.save(); ctx.globalAlpha *= 1 - p; A.finish(ctx, t, opts); ctx.restore();
        ctx.save(); ctx.globalAlpha *= p; B.finish(ctx, t, opts); ctx.restore();
      },
      glass: (...a) => lead().glass(...a),
      ripple: (...a) => lead().ripple(...a),
      ready: Promise.all(list.map((e) => e.lk.ready)),
    };
  }

  /** A palette from one brand colour, derived in OKLCH: canvas, ink and dim (text on the backdrop),
   *  accent (the colour itself), a, b, c (companions by scheme), pale and deep (the accent's hue,
   *  light and dark). Schemes: analogous (±30°), complementary, triad, split, mono. tone 'light' or
   *  'dark' sets canvas, ink and dim, and lifts the companions for a dark stage. Deterministic, and
   *  every colour inside sRGB with its hue kept. FX.palette('#5B5BF7', { scheme: 'triad', tone: 'dark' }). */
  function palette(src, scheme = 'analogous', tone = 'light') {
    if (isObj(scheme)) ({ scheme = 'analogous', tone = 'light' } = scheme);
    const rgb = Array.isArray(src) ? src.slice(0, 3) : hex(src);
    const [L0, C0, h0] = toLCH(rgb);
    const turns = { analogous: [30, -30, 60], complementary: [180, 25, 205], triad: [120, 240, 60], split: [150, 210, 30], mono: [0, 0, 0] }[scheme];
    if (!turns) throw new Error(`fx: no palette scheme '${scheme}' (analogous, complementary, triad, split, mono)`);
    const dark = tone === 'dark';
    const Lc = dark ? clamp(L0, 0.62, 0.8) : clamp(L0, 0.52, 0.72), Cc = clamp(C0, 0.05, 0.19);
    const comp = scheme === 'mono'
      ? [lch(Lc + 0.12, Cc * 0.55, h0 + 6), lch(Lc - 0.12, Cc * 0.85, h0 - 6), lch(Lc + 0.2, Cc * 0.35, h0)]
      : turns.map((d, i) => lch(Lc + (i === 1 ? -0.04 : 0.02), Cc * (i === 2 ? 0.7 : 0.9), h0 + d));
    return {
      accent: rgb.slice(),
      canvas: dark ? lch(0.17, 0.014, h0) : lch(0.975, 0.008, h0),
      ink: dark ? lch(0.96, 0.008, h0) : lch(0.22, 0.02, h0),
      dim: dark ? lch(0.72, 0.02, h0) : lch(0.52, 0.02, h0),
      a: comp[0], b: comp[1], c: comp[2],
      pale: lch(dark ? 0.3 : 0.92, Cc * 0.45, h0),
      deep: lch(dark ? 0.12 : 0.3, Cc * 0.7, h0),
    };
  }

  /** A word that arrives by pulling focus: blur, fade and a short rise, all gone at pin = 1.
   *  size is the type size in device px, since a filter's blur ignores the transform. */
  function focus(ctx, pin, pout, size, draw) {
    const a = clamp(pin * 1.3) * clamp(1 - pout * 1.5);
    if (a <= 0.002) return;
    const b = (1 - clamp(pin)) * size * 0.14 + clamp(pout) * size * 0.08;
    ctx.save(); ctx.globalAlpha *= a;
    if (b > 0.05) ctx.filter = `blur(${b.toFixed(2)}px)`;
    ctx.translate(0, (1 - clamp(pin, 0, 1.2)) * size * 0.12 - clamp(pout) * size * 0.04);
    draw();
    ctx.restore();
  }

  /** A preview's colour, from the page's hash (the Studio's: #accent=5B5BF7&scheme=analogous): the
   *  accent and the two it derives, laid over the page's palette C. A film's URL has no accent, so a
   *  film keeps the colours it names. */
  function previewAccent(C, hash) {
    const hex6 = hash.get('accent') || '';
    if (!/^[0-9a-f]{6}$/i.test(hex6)) return C;
    const P = palette('#' + hex6, { scheme: hash.get('scheme') || 'analogous' });
    return Object.assign(C, { accent: P.accent, a: P.a, b: P.b });
  }

  window.FX = { look, focus, sequence, palette, previewAccent, companions, lch, toLCH, PRESETS: Object.fromEntries(Object.entries(PRESETS).filter(([k]) => !HIDDEN.has(k)).map(([k, v]) => [k, v[0]])), PHOTO: PRESETS.photo[0] };
})();
