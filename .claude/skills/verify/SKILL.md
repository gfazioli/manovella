---
name: verify
description: How to run this repository's film engine (plugins/manovella/skills/site-promo-film) to verify a change at its real surfaces — the beats.mjs and render.mjs CLIs, a page in Chrome, the Studio wizard — without rendering a film.
---

# Verifying a change to the film engine

The surfaces are CLIs (`scripts/*.mjs`), pages rendered in headless Chrome, and the Studio's
wizard. Drive the copy that users run: after a push, `~/.claude/plugins/cache/manovella/manovella/<version>/`;
before it, this checkout or its worktree.

## A scratch work folder

Like a film's `src/`: copy `template/promo.html`, `reel.html`, `film.js`, `fx.js`, `parts.js`,
`type.js`, `scripts/render.mjs`, `scripts/beats.mjs` (and `../release-film/template/release.html`)
into a folder under the job's tmp, and link `node_modules` from a folder where `npm i
playwright-core` was run (render.mjs drives the installed Chrome, nothing is downloaded). Run
everything in a subshell, `( cd <folder> && … )`: a bare `cd` is refused by a hook.

## Soundtracks with known beats

- `beats.mjs` exports `synth(file, { bpm, lead, bars, change, drift, noise })`: a groove whose true
  beats it returns.
- Real-sounding ones: Apple Loops in `/Library/Audio/Apple Loops/Apple/` carry a beat count; tempo =
  beats × 60 / duration. Decode each loop to PCM and build songs from the samples. ffmpeg's
  `-stream_loop` on their AAC cut sections 0.14 s short, which silently broke the ground truth.

## Drive it

- `node beats.mjs <track> [--out beats.js]`: the analysis, as a user sees it.
- `AUDIO=<track> AUDIO_AT=<s> node render.mjs beats` (PAGE= for another page): the beat check.
  A copy of promo.html with its META bpm edited is the quickest page that lands or misses.
- One render, the smallest: `PREVIEW=1 FROM=0 TO=0.5 AUDIO=… node render.mjs video out.mp4` (2 s,
  cool). Never a full film.
- The Studio: `STUDIO_PREFS=<tmp> node studio/studio.mjs --no-open --out <tmp> --roots <a folder of git repositories>`
  prints `STUDIO <url>`; drive it with playwright-core in headless Chrome: the "Promo loop" card,
  `.plist button`, then `#next` to the step needed. Without `--roots` outside a repository the
  product list is empty and the second step never enables.
- The Studio as people see it: its window is `~/Applications/Manovella.app`, a **WKWebView**, not
  Chrome. `studio/window/probe.swift` (compile it with `swiftc -O`, its header has the steps'
  format and its traps) runs the wizard or the stage there, off screen: no errors in `window.__errs`,
  a snapshot to look at. A change to the wizard's CSS or JavaScript, or a new shader, goes through it.
- A transition: `node studio/transcheck.mjs [--shots <dir>] [kind…]` plays each on the stage and
  holds its first and last frame to the scenes either side, to the pixel. Then the real path: a copy
  of `reel.html` with one of its `in: { kind: … }` changed, `PAGE=<copy> node render.mjs sheet sheet`
  (stills at every cut's half-way point), and at most half a second across the cut at full quality
  (`FROM=16.5 TO=17 node render.mjs video x.mp4`: 30 frames, 50 to 90 s).

- A 3D page (`template/space.html`, `space.js`): the scratch folder also takes `template/three/` and
  `template/models/` (folders: `cp -R`). Stills, `loopcheck`, the same frame after other frames
  (`stills a 3.25` against `stills b 5.5 0.7 3.25`: the two `t03.25.png` must be the same bytes), and
  half a second across the turn (`FROM=1 TO=1.5`, about 40 s). `GL=software` draws it as a machine
  without a GPU does. The Studio's stand-in in 3D is `studio/stage.html#ui=object`.
- Blender: `node scripts/blender.mjs --selftest` (11 s with Blender, a sample, an .obj decimated and a
  hero shot rendered twice; without Blender it runs what needs none and says the rest is skipped).
  A hero shot is a render: a frame or two, small (`--frames 1-2 --size 640x360 --samples 24`).

## Traps

- A step arrives with a 0.36 s animation: a screenshot taken at once shows an empty pane. Wait
  ~800 ms.
- `studio/selftest.mjs` is the Studio's own end-to-end test; run it after a Studio change, but a
  verification still drives the wizard itself and looks at the screenshots.
- Never compare frames read with `getImageData` from the film's own canvas: after the second read
  Chrome moves that canvas from GPU to software raster and every later frame differs a little (the
  third frame of any page, on untouched code). Copy the frame to a canvas of your own made with
  `willReadFrequently` and read that; `transcheck.mjs` does.
- A hover hides what the viewer does by itself: a card clicked with the pointer left on it is
  hovered again when the step redraws. Move the pointer away before reading the viewer.
- Bash here refuses `rm -rf` (a hook): use a new folder name under the job's tmp rather than
  clearing one.
