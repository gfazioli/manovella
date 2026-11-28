/*
 * space.js — a 3D shot inside a film: a model, a camera and lights, drawn by seek(t) with three.js
 * and laid on the film's canvas like any other layer. For a physical product or a hero object; a
 * product's UI is still rebuilt as vector (parts.js), never shown as a model of a screen.
 *
 * A CLASSIC script, after three.js and film.js. A page that has no 3D loads none of this:
 *   <script src="three/three.min.js"></script>     three.js r187 as one classic script (MIT; LICENSE beside it)
 *   <script src="film.js"></script> <script src="space.js"></script>
 *   <script src="models/acme.glb.js"></script>     the model, as a script: a page from file:// fetches nothing
 *                                                  (scripts/blender.mjs prepare writes it beside the .glb)
 *
 *   const SHOT = SPACE.shot({ W, H, rig: 'auto', tone: LOOK.tone, accent: C.accent })
 *   const pod = await SHOT.load('models/acme.glb')            before frame 0, in window.ready
 *   const CAM = SPACE.orbit([[1, 140, 22, 2.4, 0.7, 0.9], …], { yaw: 28, pitch: 14, dist: 2.9 })
 *   // in seek(t), after the backdrop and before the headlines:
 *   pod.turn(360 * FILM.spr(t, 1, 0.5, 1));                   everything that moves is set from t, every frame
 *   pod.pose('Dial', t - 4);                                  the glTF's own animation, at a time
 *   SHOT.draw(ctx, CAM(t));                                   render, and lay it on the frame
 *
 * SPACE.shot(o) → SHOT      o: W, H (the frame); rig 'auto' | 'daylight' | 'studio' | 'soft' (below); tone
 *                           'light' | 'dark' (what 'auto' reads: LOOK.tone); accent [r, g, b] (the studio rig's
 *                           rim light); floor (true: a ground at y = 0 that shows only the shadow), shadow
 *                           (its opacity, 0-1), exposure (1), env (the room light's strength, by rig)
 *   SHOT.load(url, o) → Promise<model>   a .glb. o.fit (1): its longest side in scene units; o.ground (true):
 *                           stood on y = 0 and centred on the vertical axis (false: centred in height too)
 *   SHOT.add(object)        a three.js object of your own (THREE.Mesh…), into the scene
 *   SHOT.draw(ctx, pose, o) the scene through `pose`, onto ctx. o.alpha (1), o.shift [x, y] px: the whole
 *                           picture moved on the frame as a lens shift (the model beside a headline), with
 *                           no change of perspective
 *   SHOT.project(p, pose) → [x, y, depth]   where a point of the scene [x, y, z] lands on the frame, in px:
 *                           for a label, a line or a cursor that points at a part (depth > 1: behind the camera's far side)
 *   SHOT.scene, SHOT.camera, SHOT.lights { key, fill, rim }, SHOT.renderer      three.js's own, to go further
 * model                     .object (the pivot the page turns and moves), .size [w, h, d], .clips { name: seconds }
 *   model.turn(deg)         about the vertical axis: a turntable is model.turn(360 * t / period)
 *   model.pose(name, s, o)  its animation `name` at s seconds, held at either end (o.loop: wrapped round)
 *   model.tint(name, rgb)   the material called `name` in a colour, its glow with it: the brand's accent
 *   model.part(name)        a named node of the model (THREE.Object3D), to move by hand or to point at
 * SPACE.orbit(keys, home) → (t) => pose   a camera on springs, like FILM.camera: keys [[t, yaw, pitch, dist, f, z], …]
 *                           (degrees; dist in scene units, its log on the spring), home { yaw, pitch, dist }
 *                           plus whatever else a pose takes, passed through
 * pose                      { yaw, pitch, dist, fov: 30, target: [0, h/2, 0], roll: 0 }: yaw 0 is the model's
 *                           front, positive round to its right; pitch up from the horizon; fov vertical.
 *                           scripts/blender.mjs render --pose takes the same four numbers.
 * SPACE.sequence(name) → Promise<seq>   a hero shot rendered by blender.mjs (<script src="<name>/sequence.js">
 *                           first): seq.draw(ctx, t, { x, y, w, h, loop, alpha }) draws frame floor(t × fps) in
 *                           ctx's transform, seq.duration its seconds. Its motion blur is Blender's, inside
 *                           each picture: render it at the film's fps and shutter.
 * SPACE.gpu()               what draws WebGL here, as the browser names it (a GPU, or SwiftShader in software)
 *
 * How it stays a film:
 * - Deterministic: nothing here reads a clock or a random number. three.js's scene is state, so the rule
 *   is the page's: set from t, on every frame, everything that moves (model.turn, model.pose, a part's
 *   rotation). Two seeks of one t are then one picture, on every worker.
 * - The engine's motion blur and antialias: each of render.mjs's subframes is one draw at its own
 *   moment, so a turning model blurs as a moving card does; and the subframe's subpixel jitter goes into
 *   the 3D camera (a view offset), not into the blit, so edges in a slow orbit do not shimmer. MSAA is
 *   on as well, for stills and previews, which have one sample.
 * - Looks and transitions: the 3D layer is premultiplied alpha over whatever the look drew; in a
 *   timeline scene it is drawn into that scene's buffer, so every transition carries it.
 * - One WebGL context a page, whatever the number of shots (Chrome keeps 16 a page, and render.mjs fails
 *   a capture whose page lost one): every SPACE.shot of one size shares a renderer.
 * - Colour: sRGB out, Khronos PBR Neutral tone mapping (a brand colour stays that colour; ACES shifts it).
 * - Light, by look. 'daylight': a soft room, a key from the upper left, a light shadow: for a light
 *   backdrop. 'studio': a dim room, a hard key, a rim in the accent from behind: for a dark one. 'soft':
 *   the room alone, nearly shadowless. 'auto' is daylight on a light tone and studio on a dark one.
 * - A preview's share: ?gl=0.5 (the Studio's) renders at that share of the pixels, as fx.js's WebGL
 *   backdrops do. A film's URL has none.
 *
 * Measured (the demo, space.html, 1920x1080, an M1 Max, Chrome 158): a subframe (seek and capture) takes
 * 46 ms on a plain look, against 38 ms for promo.html: the 3D layer is about 8 ms of it. In software
 * (SwiftShader, what a machine without a GPU draws with; GL=software on this Mac) it takes 163 ms, and
 * the page is ready in 2.8 s, not 0.14: slower, and usable. Half a second at full quality (30 frames of
 * 16 subframes, 3 workers) took 39 to 41 s, twice the same file to the byte; loopcheck is inf.
 */
(function () {
  'use strict';
  const need = () => { if (!window.THREE) throw new Error('space: three.js is not loaded: <script src="three/three.min.js"></script> before space.js'); return window.THREE; };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const RAD = Math.PI / 180;
  // a preview's share of the frame's pixels (the Studio's ?gl=), as in fx.js
  const GL_SHARE = (() => { try { const q = Number(new URLSearchParams(location.search).get('gl')); return q >= 0.25 && q < 1 ? q : 1; } catch { return 1; } })();

  const RIGS = {
    //          room   key                                     fill   rim   shadow
    daylight: { env: 0.7, key: 1.6, keyAt: [-2.6, 4.2, 3.2], fill: 0.2, rim: 0.0, shadow: 0.28 },
    studio: { env: 0.42, key: 3.4, keyAt: [-3.0, 4.0, 2.4], fill: 0.0, rim: 3.2, shadow: 0.5 },
    soft: { env: 1.3, key: 0.7, keyAt: [-2.0, 5.0, 2.0], fill: 0.5, rim: 0.0, shadow: 0.14 },
  };

  // ---------------------------------------------------------------- one renderer a frame size
  const RENDERERS = new Map();
  function rendererFor(W, H) {
    const key = `${W}x${H}`;
    let R = RENDERERS.get(key);
    if (R) return R;
    const THREE = need();
    const cv = document.createElement('canvas');
    let gl;
    try { gl = new THREE.WebGLRenderer({ canvas: cv, alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true }); }
    catch (e) { throw new Error(`space: a 3D shot draws with WebGL2, which this browser does not offer here (${e.message})`); }
    gl.setPixelRatio(1);
    gl.setSize(Math.round(W * GL_SHARE), Math.round(H * GL_SHARE), false);
    gl.setClearColor(0x000000, 0);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    // the room: three's own procedural studio, baked once into a prefiltered map. No file, no clock.
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    pm.dispose();
    R = { gl, cv, env };
    RENDERERS.set(key, R);
    return R;
  }
  function gpu() {
    // the shots' own context when there is one: a context made to ask would be one more of the page's sixteen
    const c = RENDERERS.size ? RENDERERS.values().next().value.gl.getContext() : document.createElement('canvas').getContext('webgl2');
    if (!c) return 'no WebGL2';
    const x = c.getExtension('WEBGL_debug_renderer_info');
    return x ? c.getParameter(x.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER);
  }

  // ---------------------------------------------------------------- a model
  const bytesOf = (b64) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  async function glbBytes(url) {
    const name = url.split(/[\\/]/).pop().split(/[?#]/)[0];
    const held = (window.SPACE_ASSETS || {})[name];
    if (held) return bytesOf(held);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status}`);
      return await r.arrayBuffer();
    } catch (e) {
      throw new Error(`space: ${url} could not be loaded (${e.message}). A page opened from disk cannot fetch a file: load the model as a script, <script src="${url}.js"></script> (scripts/blender.mjs prepare or embed writes it), before this runs`);
    }
  }
  function wrapModel(THREE, gltf, o) {
    const inner = gltf.scene, pivot = new THREE.Group();
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const k = (o.fit ?? 1) / Math.max(size.x, size.y, size.z, 1e-9);
    inner.scale.multiplyScalar(k);
    inner.position.sub(new THREE.Vector3(mid.x, o.ground === false ? mid.y : box.min.y, mid.z).multiplyScalar(k));
    pivot.add(inner);
    inner.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    // a mixer a clip, so each is posed at its own time and none carries a state from the frame before
    const clips = {}, mixers = {};
    for (const c of gltf.animations || []) {
      clips[c.name] = c.duration;
      const m = new THREE.AnimationMixer(inner);
      m.clipAction(c).play();
      mixers[c.name] = m;
    }
    const materials = () => { const out = new Map(); inner.traverse((n) => { for (const m of [].concat(n.material || [])) out.set(m.name, m); }); return out; };
    return {
      object: pivot, scene: inner, size: [size.x * k, size.y * k, size.z * k], clips,
      turn(deg) { pivot.rotation.y = deg * RAD; return this; },
      pose(name, s, { loop = false } = {}) {
        const m = mixers[name];
        if (!m) throw new Error(`space: the model has no animation '${name}' (${Object.keys(clips).join(', ') || 'none'})`);
        const d = clips[name];
        // held just inside its end: at the end itself the mixer wraps round to the start
        m.setTime(loop ? ((s % d) + d) % d : clamp(s, 0, d * (1 - 1e-7)));
        return this;
      },
      tint(name, rgb) {
        const m = materials().get(name);
        if (!m) throw new Error(`space: the model has no material '${name}' (${[...materials().keys()].join(', ')})`);
        m.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
        if (m.emissive && m.emissive.getHex() !== 0) m.emissive.copy(m.color);
        return this;
      },
      part(name) {
        const n = inner.getObjectByName(name) || inner.getObjectByName(name.replace(/ /g, '_')); // glTF names lose their spaces
        if (!n) { const all = []; inner.traverse((x) => x.name && all.push(x.name)); throw new Error(`space: the model has no part '${name}' (${all.join(', ')})`); }
        return n;
      },
    };
  }

  // ---------------------------------------------------------------- a shot
  function shot(o = {}) {
    const THREE = need();
    const { W, H } = o;
    if (!(W > 0 && H > 0)) throw new Error('space: SPACE.shot({ W, H }) needs the frame\'s size');
    const R = rendererFor(W, H);
    const name = !o.rig || o.rig === 'auto' ? (o.tone === 'dark' ? 'studio' : 'daylight') : o.rig;
    const rig = RIGS[name];
    if (!rig) throw new Error(`space: no rig '${o.rig}' (auto, ${Object.keys(RIGS).join(', ')})`);
    const scene = new THREE.Scene();
    scene.environment = R.env;
    scene.environmentIntensity = o.env ?? rig.env;
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 200);
    const key = new THREE.DirectionalLight(0xffffff, rig.key);
    key.position.set(...rig.keyAt);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera; sc.left = -1.8; sc.right = 1.8; sc.top = 1.8; sc.bottom = -1.8; sc.near = 0.5; sc.far = 14;
    key.shadow.radius = 5; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.012;
    const fill = new THREE.DirectionalLight(0xffffff, rig.fill);
    fill.position.set(3, 1.5, 3);
    const a = o.accent || [255, 255, 255];
    const rim = new THREE.DirectionalLight(new THREE.Color().setRGB(a[0] / 255, a[1] / 255, a[2] / 255, THREE.SRGBColorSpace), rig.rim);
    rim.position.set(2.6, 2.2, -3.4);
    scene.add(key, key.target, fill, rim);
    let floor = null;
    if (o.floor !== false) {
      floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: o.shadow ?? rig.shadow }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
    }
    R.gl.toneMappingExposure = o.exposure ?? 1;
    let height = null; // the default target's: half the first model's height
    const aim = (pose) => {
      const yaw = (pose.yaw ?? 0) * RAD, pitch = (pose.pitch ?? 0) * RAD, d = pose.dist ?? 3, t = pose.target || [0, height ?? 0.5, 0];
      camera.fov = pose.fov ?? 30;
      camera.position.set(t[0] + d * Math.sin(yaw) * Math.cos(pitch), t[1] + d * Math.sin(pitch), t[2] + d * Math.cos(yaw) * Math.cos(pitch));
      camera.up.set(0, 1, 0);
      camera.lookAt(t[0], t[1], t[2]);
      if (pose.roll) camera.rotateZ(pose.roll * RAD);
    };
    return {
      scene, camera, renderer: R.gl, lights: { key, fill, rim }, floor, rig: name,
      async load(url, lo = {}) {
        const buf = await glbBytes(url);
        const gltf = await new Promise((ok, ko) => new THREE.GLTFLoader().parse(buf, url.replace(/[^\\/]*$/, ''), ok, (e) => ko(new Error(`space: ${url} is not a model three.js reads: ${e.message || e}`))));
        const m = wrapModel(THREE, gltf, lo);
        scene.add(m.object);
        height ??= m.size[1] / 2;
        R.gl.compile(scene, camera); // its shaders, before frame 0 rather than inside it
        return m;
      },
      add(object) { scene.add(object); return object; },
      draw(ctx, pose = {}, d = {}) {
        const J = ctx.jitter || [0, 0], s = d.shift || [0, 0];
        aim(pose);
        // the subframe's jitter and the shift, as a window on the frame: the picture moves, the perspective does not
        camera.setViewOffset(W, H, -(J[0] + s[0]), -(J[1] + s[1]), W, H);
        camera.updateProjectionMatrix();
        R.gl.toneMappingExposure = o.exposure ?? 1;
        R.gl.render(scene, camera);
        ctx.save();
        (ctx.rawSetTransform || ctx.setTransform).call(ctx, 1, 0, 0, 1, 0, 0); // on the pixel grid: the jitter is in the camera
        ctx.globalAlpha *= d.alpha ?? 1;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(R.cv, 0, 0, W, H);
        ctx.restore();
      },
      project(p, pose = {}, d = {}) {
        const s = d.shift || [0, 0];
        aim(pose);
        camera.clearViewOffset(); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
        const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
        return [(v.x * 0.5 + 0.5) * W + s[0], (0.5 - v.y * 0.5) * H + s[1], v.z];
      },
    };
  }

  // ---------------------------------------------------------------- the camera, on springs
  function orbit(keys, home = {}) {
    const F = window.FILM;
    if (!F) throw new Error('space: SPACE.orbit uses film.js\'s springs: load film.js first');
    const h = { yaw: 28, pitch: 14, dist: 2.9, ...home };
    const col = (i, v0, f = (x) => x) => F.track(f(v0), keys.map((k) => [k[0], f(k[i]), k[4] ?? 1, k[5] ?? 0.9]));
    const Y = col(1, h.yaw), P = col(2, h.pitch), D = col(3, h.dist, Math.log);
    return (t) => ({ ...h, yaw: Y(t), pitch: P(t), dist: Math.exp(D(t)) });
  }

  // ---------------------------------------------------------------- a rendered sequence, drawn by t
  async function sequence(name, o = {}) {
    const s = typeof name === 'string' ? (window.SPACE_SEQUENCES || {})[name] : name;
    if (!s) throw new Error(`space: no sequence '${name}': load its script first, <script src="${name}/sequence.js"></script> (scripts/blender.mjs render writes it)`);
    const dir = o.dir ?? `${s.name}/`;
    const load = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error(`space: ${src} of the sequence '${s.name}' is missing`)); i.src = src; });
    const frames = await Promise.all(Array.from({ length: s.frames }, (_, i) => load(`${dir}${String(i + 1).padStart(4, '0')}.png`)));
    const at = (t, loop) => { const i = Math.floor(t * s.fps + 1e-6); return loop ? ((i % s.frames) + s.frames) % s.frames : clamp(i, 0, s.frames - 1); };
    return {
      ...s, duration: s.frames / s.fps, images: frames, at,
      draw(ctx, t, d = {}) {
        const img = frames[at(t, d.loop)], w = d.w ?? s.width, h = d.h ?? s.height;
        ctx.save();
        ctx.globalAlpha *= d.alpha ?? 1;
        if (window.FILM) window.FILM.draw(ctx, img, d.x ?? 0, d.y ?? 0, w, h); else ctx.drawImage(img, d.x ?? 0, d.y ?? 0, w, h);
        ctx.restore();
      },
    };
  }

  window.SPACE = { shot, orbit, sequence, gpu, RIGS: Object.keys(RIGS) };
})();
