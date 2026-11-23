---
name: site-promo-film
description: Build a Dribbble-level product promo film FROM a real website or app, rendered as code — one HTML canvas whose every frame is a pure function seek(t), captured frame by frame in headless Chrome and encoded to mp4 with real motion blur and a seamless loop, on a look chosen from presets (backdrop, brand light, grid or dots in parallax, grain, vignette, frosted glass, click ripples). Use when — and only when — the user asks for a promo, launch, teaser, social, walkthrough or explainer video, animation or motion piece for a product, site or app — a 6 s loop or a 5-minute film in chapters — even if they only paste a URL and say "make a video of this", or wants to change such a film's background, lighting, texture, effects, format or length. Not for editing existing footage, and never a generative "video model". For a film of what one release changed, use release-film, which builds on this engine.
argument-hint: "[studio | brief <path> | ? | a URL, or what the film is for]"
---

# Product promo film, rendered as code

One page, one canvas, and `seek(t)` draws the frame at time `t` from scratch. Headless
Chrome captures N subframes per frame, ffmpeg blends and encodes them. The film is a
function; the video is a sampling of it — which is what makes every frame reviewable,
every change cheap, and the loop exact.

These files ship with this skill. **Copy them into the film's work folder; do not rewrite
the engine.**

| File | What it is |
| --- | --- |
| `template/promo.html` | The engine plus an 8-second demo: closed-form springs, sum-of-springs tracks, a camera, text helpers (tabular figures, flips), headlines, a real cursor, a one-object morph chain, and a WebGL compositor for true 3D. Opens and renders as is. |
| `template/reel.html` | A long film on a timeline: six scenes, six **formats** (kinetic type, a browser, a bento grid with a rack focus, a terminal, a 3D cover-flow of devices, an end card), five transitions, a look per scene, chapters. ~56 s, not a loop. The catalogue of §2, running. |
| `template/film.js` | The engine the pages share: the **stage** (subpixel jitter per subframe, so nothing steps or shimmers in slow moves), `FILM.draw` for rasters, springs and cameras, the **timeline** (scenes, chapters, checkpoints, and twenty-four transitions: sixteen on the 2D canvas, eight as fragment shaders on one WebGL2 context) and effects (depth of field, knockout type, typing). Documented at the top. |
| `template/parts.js` | Vector parts: a macOS window, a browser, a terminal, an iPhone, an iPad, a MacBook, an iMac, keycaps, a switch, a ring, a button, the pointer. Each returns the rect its content goes in. |
| `template/parts.html` | Every part on one 16:10 sheet, a page like the others: `PAGE=parts.html node render.mjs stills parts 0` makes the PNG that `docs/parts.jpg` is converted from (`sips -s format jpeg -s formatOptions 92`). |
| `template/fx.js` | The look, loaded by the page: a backdrop (flat, gradient, field or picture; soft brand light; dots, grid or lines in parallax; a floor in perspective; a spotlight), a finish (vignette, grain) and the effects that lean on it (frosted glass, click ripples, focus-pull headlines). Twenty-three presets and `photo`, every field overridable, documented at the top of the file. Shared with release-film. |
| `template/type.js` | Headlines and kinetic type (§3): `TYPE.draw(ctx, t, spec)` in thirteen styles — rise, focus, settle, track, wipe, cascade, weight, split, flap, type, swap, odometer, decode — with an emphasis mark, a pace, and `TYPE.load` for a family's faces. A pure function of t, like the rest. |
| `template/fonts/` | Twenty open-licensed families (latin + latin-ext woff2, each with its OFL.txt) and `fonts.json`, their faces. A film copies only what it uses into `src/fonts/`; `scripts/fonts.mjs add` fetches another. |
| `scripts/render.mjs` | `stills <dir> t…`, `sheet <dir>` (the timeline's checkpoints), `looks <dir> <t>`, `loopcheck`, `video <out> [workers]`. Reads size, fps, duration and chapters from the page; jitters every subframe; renders in resumable chunks; `FROM`/`TO`, `PREVIEW=1`, `RESUME=1`, `KEEP=1`, `AUDIO=`, `SHUTTER=`; the extension picks the format (.mp4, .mov ProRes, .webm, .gif; `HEVC=1`; `ALPHA=1` for a transparent .mov or .webm); checks the track before the render and the file after it; fails a capture whose page lost a WebGL context, and a second render of a cut while one runs. Documented at the top. |
| `scripts/narrate.mjs` | A film's story (`story.json`: a sentence a step, a tutorial's or a promo's that speaks) into a voice, a clock and subtitles: `voice/*.aiff`, `narration.wav` (the film's `AUDIO`), `narration.js` (each step's time, for the page) and `captions.srt` / `.vtt`. The Mac's `say`, or `--from` a folder of your own recordings. `"human": "natural"` varies the pauses as a person's; a model's sounds (`[chuckle]`) are kept out of the subtitles. Documented at the top. |
| `scripts/voice.mjs` | The same story told by a voice model that runs on the Mac (`"mlx"` in `story.json`: Chatterbox for a lesson, Orpheus for a promo, Kokoro for a quick draft or a film in Italian), closer to a person than `say`: it says each step (`voice-mlx.py`, through mlx-audio), paces and levels it, then calls `narrate.mjs`. A take is a seed; `"tone"` (calm, warm, bright) is how freely the model reads, `"human"` varies each line's pace within 3 % and lets a line make a sound (`[chuckle]`, `[sigh]`: each model's own spelling, or left out). `--audition` compares takes, `--recordings` stops at the recordings, `--setup` makes the Python and fetches the models once on each Mac (`voice-constraints.txt` pins what it installs) and says whether that Mac repeats the takes recorded here. Documented at the top. |
| `scripts/mix.mjs` | A voice and a music track into one soundtrack, for `AUDIO=`: both measured (EBU R128), the music `--under` LU under the voice while it speaks, `--lift` dB up between lines, down before each line begins; prints what came out, measured on the result. Documented at the top. |
| `scripts/contact.mjs` | A captioned contact sheet of a stills or looks folder (captions from `labels.json` in it); `--size WxH` makes it exactly that size (`--font`, `--gap`, `--pad`; stills never cropped; a `.jpg` is written as JPEG); `--dark` for a dark sheet. `--compare A=<dir> B=<dir> [C=<dir>] <out.png>`: two or three folders side by side, a labelled column each and a row per still they share, for an A/B choice on one image. |
| `scripts/beats.mjs` | A soundtrack's beat, from its samples: the tempo, whether it holds, every beat, the bars, the sections, and the bpm and `AUDIO_AT` to give the page; `--out beats.js` for a page that follows a track that drifts (`FILM.beats`). `render.mjs` imports it to measure the page's beats against the track's. `--selftest`. |
| `scripts/clickcheck.mjs` | Is every click seen: for each of the page's `CLICKS`, how fast the clicked point moves on screen and how far the cursor travels before the press and during it. Exit 1 on a click nobody will see (release-film §3b), 2 on a page with no cursor. |
| `scripts/layoutcheck.mjs` | Is every headline in the frame, apart, big enough for a phone and readable: at each checkpoint, each headline `TYPE.draw` draws, against the safe area, the other headlines, its size on a phone and the backdrop round it (the limits are in its header). Exit 1 on a headline that fails, 2 on a page that draws none through `TYPE.draw`. |
| `scripts/deliver.mjs` | The last step (§8): the finished videos and their covers leave the work folder for a folder of their own; once the film is out, `trash` throws the work folder away after checking its source is safe in the kit. `--selftest`. |
| `scripts/fonts.mjs` | The kit's fonts: `add "<Family>" [axes]` from Google Fonts with its licence, `check`, `list`. |

Beside them, `studio/` (the Studio, below), `guide.md` (the guided mode, below) and `README.md`
(the catalogue in pictures, and example requests for every moment of a film).

Setup: a work folder, `~/Downloads/<name>-work/` (`~/Downloads` is the work root unless `workRoot` in the settings file, below, says otherwise), with the page and these files in its `src/`,
and `npm i playwright-core` there. It drives the installed Chrome through `channel: 'chrome'`, so
nothing else is downloaded. `<name>` is `<product>-<what>` (`acme-promo`,
`acme-2.4-whats-new`), and it names the delivery folder and every delivered file too (§8).

## Studio: the brief in a window

The visual way in. A wizard in a window of its own: recipes, formats, looks, pictures
from the Mac, type and motion shown moving on the real engine, in the product's colour and aspect,
the sound (the music library's tracks played, a voice model's voice heard saying a line before it is
chosen), and every choice written to one `brief.json`. Nothing is installed and nothing renders.
`/manovella:studio` opens it too.

- **When**: invoked with `studio`, or with nothing at all while nothing in the conversation says
  which film to make. A user who has said what they want in words goes straight to §0.
- **Run** `node <this skill's dir>/studio/studio.mjs` from the workspace, in the background (its
  repositories' siblings are the products offered), and say in one line that the window is open.
  It exits on its own, printing one line, and the exit wakes you: `BRIEF <path>`, or `CANCELLED`,
  `CLOSED`, `TIMEOUT` (say so and stop). The window is the Studio's own app where this Mac
  has built it (`~/Applications/Manovella.app`, its name, version and icon in the Dock), else a
  Chrome app window; `MANOVELLA_WINDOW=chrome` keeps Chrome. Without either it opens the default
  browser; `--no-open` prints the URL instead, for a session whose screen is elsewhere.
- **The music library** is optional: a folder with the music of the user's films, kept wherever
  they like (a synced drive, a project folder). It is where `MANOVELLA_MUSIC` points for one run,
  else `musicLibrary` in `~/Library/Application Support/manovella/settings.json`
  (`~/.config/manovella/settings.json` off macOS; a leading `~` is expanded); `musicLibraryIgnore`
  in the same file lists folder names in it to skip, and `deliverToLibrary` (true or false, default
  false) says whether finished films go into it too. Nothing is auto-detected. An older file with
  `brandLibrary` and `brandLibraryIgnore` is read as `musicLibrary` and `musicLibraryIgnore` with
  `deliverToLibrary` on, what it did before, and is rewritten with the new keys at the first change
  made in the Studio's Settings. The same file takes `projectFolders` (where the
  Studio looks for products), `pictureFolders` (its backdrop pictures; unset: `~/Pictures`) and
  `workRoot` (where `<name>-work` and, unless the film is delivered into the library or the project
  has an instruction, `<name>/` go; unset: `~/Downloads`); the Studio's Settings window (the gear
  beside the logo, or ⌘, in `Manovella.app`) writes all of them, and `deliver.mjs` reads `workRoot`
  too. Nothing else in the code reads the library keys: for a film made without the Studio, this
  paragraph is the instruction for me.
  - The Studio offers every audio file (mp3, m4a, aac, wav, aiff, flac, ogg) at the library's top level
    and in each folder in it, directly or in that folder's `audio/` folder; dot-folders and the
    names in `musicLibraryIgnore` are skipped. A folder per brand is optional and groups its tracks;
    the folder named after the product is listed first ("this product's"). An optional notes file
    beside the tracks (`…notes.txt` or `.md`: one paragraph a track, starting with the track's file
    name: what it is, its mood, where it fits) says what each is for, and the Studio shows it.
  - Finished films: with `deliverToLibrary` on and a library set, `<library>/<Brand>/video/<name>/`
    (§8); otherwise where the project's own instructions keep finished media, else `<name>/` in the
    work root (`~/Downloads/<name>/` by default).
  - A new track that has been made (below) is saved in the library, in the product's folder when
    the library keeps one per brand, with its paragraph in that folder's notes file, when a library
    exists; otherwise it just goes in the film's `src/audio/`. A folder in a file provider (Google
    Drive, iCloud Drive, Dropbox) may hold its files "dataless" until they are opened, so open or
    copy a file before measuring it. Files a library keeps are copied, never moved out of it.
- **`brief <path>`**, as the argument or from a `BRIEF` line: read the brief; it answers §0.
  - `formats: []` is my pick of three. For a promo or a film in chapters, one, two or three named are
    the storyboards' formats, in that order, and I pick the rest, each a different one; a release's
    and a tutorial's one format is theirs (`whatsnew`, `tutorial`), never filled. `look: null` is the
    looks sheet (§4).
  - `frame`: what the product is shown in, whatever the format; `null` is each format's own (a
    browser for a walkthrough, a terminal for a command line, a Mac window for a tutorial), my pick.
    - `window`: the app in its macOS window (`PARTS.window`).
    - `macbook`: a MacBook from the front, the app's window or the site's browser on its screen
      (`PARTS.laptop`, `PARTS.notch` drawn last).
    - `imac`: an iMac from the front, on its stand, the app's window or the site's browser on its
      desktop (`PARTS.desktop`: its rect is the body, 547 : 375, and the stand is drawn under it;
      `color` is one of Apple's seven, or the brand's accent for the nearest of them). No notch:
      the camera is in the white bezel.
    - `iphone`, `ipad`: the device (`PARTS.phone` with `PARTS.island` drawn last; `PARTS.tablet`,
      lying down or upright by its rect, the camera on its long edge), **the product's own layout on
      it** (§1), and every click a touch: a soft disc that presses, with the look's ripple, never
      `PARTS.ARROW`; a tutorial says *tap*.
    - `browser`: the product as a page in `PARTS.browser`, its real address in the field.
    - `terminal`: `PARTS.terminal`, typed with `FILM.typed`.
    - `bare` (the Studio's *Just the UI*): the product's UI on its own, a floating panel with
      rounded corners and a shadow, no window chrome and no device round it. The product is still
      on screen: a film with none is the Kinetic type format, not this.

    The frame holds for every scene that shows the product, in each storyboard: a tutorial of an
    iPhone app is told on an iPhone from its first step to its last. A format that is itself a
    surface bends to it: Browser walkthrough with `iphone` is the site in the phone at that width;
    Terminal with `macbook` or `imac` is the terminal's window on the Mac's desktop. **Devices in 3D** is
    the one format that shows several: the chosen device leads the cover-flow (the first card to
    face the camera, and the one it comes back to), and the others follow it. Where the frame and
    a format cannot be reconciled (`terminal` and a Browser walkthrough), say so with the request
    line and ask which gives way.
  - `accent: null` is the brand's own colour; `accentHint` is what the previews used, and
    `accentFrom` where it came from.
  - `kind: release` goes to release-film §1, with `release.tag` and its `frame`: on an iPhone or an
    iPad its clicks are taps (release-film §3b).
  - `duration` is in seconds: one of the kind's own lengths or one typed in the Studio (a promo's loop
    from 3 to 60, a film in chapters or a tutorial from 30 to 900: `duration.range` in
    `studio/schema.json`), or `0`: as long as its voice (a promo, a film), its story (a tutorial) or
    its changes (a release).
  - Its `work` folder is the work folder, already made, with what the brief needs in `src/`; its
    `deliver` is where the finished film goes, as Review showed it, in §8's order: the music
    library's when it takes films, kept as it is; otherwise the work root's `<name>/`, a default that
    a place the project's instructions keep finished media in wins over.
  - `backdrop` (with `look: 'photo'`): the picture, prepared, in `src/backdrops/`. The look is
    `FX.look({ preset: 'photo', palette, base: { image: 'backdrops/<file>', blur, …, drift } })`:
    treatment `dim` → `dim: 0.32`, `tint` → `tint: { color: 'accent', a: 0.42 }`, `duotone` →
    `duotone: ['deep', 'pale']`; `drift: true` → `drift: 0.04`. Set `tone` yourself after looking at
    it: over file:// the page cannot read the picture back. `original` says where it came from:
    unless it is the user's own photo, ask once whether it may be published before the delivery.
  - `type`: each role's family, `source` and weight. A `kit` family's faces are in `src/fonts/`
    (`faces`, `base`): `await TYPE.load(family, faces, 'fonts/')` before frame 0. A `mac` family is
    used by its name and renders only where it is installed: keep it out of a kit in a public
    repository. `display` sets every headline, `text` the sublines and captions, `mono` a terminal;
    the product's UI keeps its own face. `type: null` is the brand's own faces (§3).
  - `motion`: `text` is the TYPE style of every headline (one per film), `emphasis` a mark on the
    claim's one word, `transition` the family of most cuts (the timeline's `trans`), `pace` a factor
    for TYPE, the camera's springs and the length of a cut (calm 0.8, measured 1, brisk 1.25: the
    Studio played a cut at 1 s / pace), `shutter` the degrees of
    each frame the motion blur gathers: `PROMO_META.shutter` (360, the default, needs nothing). `null`
    is my pick. Every style carries every mark: a flap board marks the word's tiles, swap any word but
    its slot's.
  - `tutorial` (`kind: 'tutorial'`): `task` is what it teaches, in the user's words. See *Tutorials*, §2.
  - `voice`, any film's (`null`: it says nothing): `kind` is `model` (a voice model on the Mac:
    `model` `chatterbox`, `orpheus` or `kokoro`, `speaker` Orpheus's or Kokoro's voice (`if_sara` speaks Italian), `tone` `calm` / `warm` / `bright`
    and `tempo`, what the story's `"mlx"` takes), `mac` (`name`, its `quality`: `Premium`,
    `Enhanced` or `compact`, its `lang` and `rate`, the number `say` takes, not words a minute) or
    `mine` (they record one file a line); `human` is the story's `"human"` (`clean`, `natural`,
    `expressive`); `script` their lines (`null`: I write them, and show them first); `captions` is
    `both`, `burned`, `file` or `none`. The Studio let them hear a model's voice at that tone, speed
    and touch, through `voice.mjs` itself: the film's lines are said the same way; and, with a track
    chosen, over that track through `mix.mjs` at the brief's `musicMix`, from the track's first bar. See *Tutorials*
    and *A film that speaks*, §2. Schema 2 briefs kept a tutorial's voice under `tutorial`.
  - `music`: `none`, `track`, `generate` or `click`. A `track` (one of the music library's, a file, or
    one dropped) is copied into `src/audio/` (`musicFile`; `musicSource`: where it came from, the
    library's `brand` (the track's folder in it, or null for a track at its top), `file` and `about`, its paragraph in that folder's notes file, and `path`) and
    measured (`musicBeats`, §7, The beat): `bpm` goes in `PROMO_META`, `at` (its first bar) or one
    of `sections` is the `AUDIO_AT`; `steady: false` is a track the page follows with `FILM.beats`;
    `bpm: null`, no beat to follow. `generate` carries `musicPrompt`: I cannot make music. Give the
    prompt to the user for Gemini (its app; every track carries Google's SynthID watermark), wait
    for the track, copy it into `src/audio/`, and with a music library save it there
    with its paragraph in the notes file (above), measure it (`beats.mjs`), then go
    on as with a track. `musicMix` (a voice and music): `under` (LU) and `lift` (dB) for `mix.mjs`.

  Say its `request` line back, ask only what it leaves open, then the storyboards, and wait.
- **`studio/schema.json` is the wizard's single source**: fields, recipes, formats, looks, type
  sets, motion, picture options, a model's voices and the voice presets (a voice and its reading at
  once; a recipe names one by id, `voicePreset`). A new look, style, transition or format goes there as well, or the
  Studio does not offer it. `stage.html` is the stand-in product everything is previewed on (modes
  `stage`, `text`, `trans`, `tutorial`; `say=1` writes a voice-over's subtitles under the stage; `ui=` is
  what the product is in: the brief's `frame` when one is chosen, from that frame's `stage`
  (`window`, `macbook`, `imac`, `iphone`, `ipad`, `browser`, `terminal`, `bare`), else the shape of the first
  format chosen, from that format's `stage`: `terminal`, `none` for words alone, else a window. The
  stand-in is laid out again for each: an app on an iPhone, an app on an iPad lying down or upright, a
  page in a browser, and on the two that are touched a finger taps; `on=product` puts the camera on
  the product alone, for the device tiles). The
  templates' own demos take the user's colour from their hash (`#accent=5B5BF7&scheme=…`), and every
  preview asks fx.js for its WebGL backdrops at a share of the frame's pixels (`?gl=0.5`): WebKit
  copies a WebGL canvas through the CPU, 50 ms a 1080p frame. A film's URL has neither. After a change to the Studio, run `studio/selftest.mjs --shots <dir>`
  and look at the shots. After a change to a transition, or a new one, run `studio/transcheck.mjs`:
  every kind must start on the scene it leaves and end on the one it brings, to the pixel (it found
  a pop on the first frame of `cover` and of `frost`, which had shipped).
- **`studio/studio.json` is the Studio's identity**: name, id and **version**, shown beside its
  name in the sidebar and in the window app's About. Its version is Manovella's, the same number as
  the plugin's `.claude-plugin/plugin.json` and the marketplace entry (the selftest checks they
  agree): bump all three with every change, patch for a fix, minor for a feature. The app is built
  from it and `icon-1024.png` by `<this skill's dir>/studio/window/build.sh <this skill's
  dir>/studio`, once per Mac and again after a change to the kit or to `studio.json` (the bundle is not in git; the
  kit's README has the traps). The page then runs in WebKit, not Chrome: look at a change in the
  app's window too.
- **`studio/about.json` is the Studio's About**: the links, the sponsors (a new one is a GitHub
  login added to `sponsors`) and the maker's other apps, with their icons in `studio/about/`. The sidebar's logo opens it, and
  so does the app menu's About item (`"pageItems"` in `studio.json`: the kit sends the page
  `studio:menu` with the item's id). The Studio is dark only
  (`"appearance": "dark"`: the window too).

## Guided mode: `?`

Invoked with `?` or `help` (the `ARGUMENTS:` line Claude Code appends after this file), or with
nothing at all where the Studio cannot open (no screen, or the user asks for the terminal): read
`guide.md` beside this file and follow it. It shows what the skill makes and what a request looks like, asks the brief in two
rounds of questions, and says back the one-line request that would have started it. `? <topic>`
(looks, formats, render, delivery…) answers that topic alone. Nothing is rendered in this mode.

## 0 — Ask first, then wait

**A film is made only when the user asks for one in words.** Never offered in passing, never
started as a step of something else: not as an extra of a release, not because a product exists.
And a render heats the machine for minutes: renders run cool by default (§7's thermal defaults),
one at a time.

Before asking, look for the product's source on disk (the site's repo, the app's
repo). Theme tokens, fonts, components and copy read from the source beat anything
scraped, and the app's own strings can be verified instead of guessed.

Then ask all of these in one message, each with its default, and **wait**:

1. **Website URL** to base the film on — the brand is pulled from it: logo, colours,
   fonts, hero copy, the key screens. What the source and the site do not have is asked
   for here too, by name (§1).
2. **Duration**: a loop of 6 / 10 / 15 / 30 s (default 15), or a film of 60 / 90 s /
   3 / 5 min in chapters (§2b), which is not a loop.
3. **Format** (§2): the shape of the film — default: my pick of three *different* ones,
   one per storyboard, chosen for this product and unlike its previous films.
4. **Output**: aspect 16:9, 1:1, 4:5 or 9:16; fps (default 60); resolution (default 1080
   on the short side: 1920 x 1080, 1080 x 1920 upright); file: .mp4 (default), HEVC, ProRes .mov for an editor, .webm, .gif
   for a README; or transparent, to be laid over other footage (`ALPHA=1`, §7).
   **A promo is made in two versions by default: 16:9, and 9:16 for YouTube Shorts and
   Instagram Reels.** The vertical one is composed for its own frame, type and
   camera included, never the 16:9 cut placed over a blurred copy of itself: that was the
   stopgap for a film made only wide. Ask only when the user names a single aspect.
5. **Vibe**, any mix: kinetic typography · UI morph (one element becomes the next,
   cursor-driven) · 3D parallax scroll-through of the screens · spring physics with
   camera zoom-and-punch — and the tone: Swiss/minimal, bold/energetic or
   premium/cinematic.
6. **Accent**: black and white plus one hex, or the full brand palette.
7. **Look**: the backdrop and its texture — the brand's canvas flat, or a preset (paper,
   dots, grid, aura, spotlight, night, studio; §4). Default: decide on a looks sheet of the
   first real frame.
8. **Sound**: music, a track of the music library's (with what its notes file
   says of it; see the Studio section), a royalty-free track the user gives (its beat is measured, §7), a new one Gemini
   makes from a prompt I write (I cannot make music), or none; and a voice-over for any film (a
   voice model in English or, for Italian, Kokoro's Sara, a Mac voice in another language, the user's recordings; with subtitles),
   or none. Both: one track, `mix.mjs`.
9. **Reference**: a video or style to imitate. With none, pick a real, named one and
   say what you take from it, so the result does not default to "centered text on a
   gradient, everything fades".
10. **Where it goes** (default: `<name>-work/` in the work root, `~/Downloads`, while the film is made, and only the
    finished film in `<delivery>` once it is delivered; §8).

Then show **three storyboards** as tables on the beat grid (time · beats · what
happens), each on a different format from §2, recommend one, and let them pick or
tweak it. No code before that.

## 1 — Pull the real brand, and keep it honest

- Palette and tokens, display and UI fonts, the logo as vector (it has to morph),
  the hero copy, two to four real screens recreated as vector — never a pasted,
  blurry screenshot.
- **An asset the film needs and the product's own sources do not hold is asked for, never
  made up**: the logo as vector (only a PNG, or none at all), the app icon's master, a
  photo, a partner's mark, a face that is not installed or open-licensed. Look first: the
  repository, the site, its press kit. Then ask the user, in the same message as §0's
  questions when it is known by then, naming each missing piece and what stands in until it
  comes (the name set in the display face, never a traced, redrawn or generated logo). Take
  it only from the user or from the product's own sources: never from a folder of the user's
  the brief does not name, the music library included.
- **Every string is sourced.** Headlines are the site's own lines; UI text is the
  app's own strings, read from its source verbatim (a notification, an alert, a
  button). Numbers inside a UI mock-up are illustration and must be internally
  consistent; numbers in a headline are claims, and only measured ones the product
  already publishes may appear.
- Nothing the product does not do yet. No real user data on screen: invented names,
  paths and ids, the way a demo mode would show them.
- **A device shows the layout the product has on that device.** An iPhone or an iPad frame
  (the brief's `frame`, or my own pick) holds the product's own screens there: an iOS or iPadOS
  app's views read from its source, a responsive site as it lays out at that width (its real
  breakpoints, measured in a browser at 390 or 1024 points across). A product with no such
  layout, a Mac-only app or a site with no phone layout, is said so before the storyboards,
  with the nearest honest frame proposed (its Mac window, a MacBook, an iMac, a browser). Never a
  desktop UI squeezed into a phone, and never a phone layout invented for the film.
- A colour the brand uses to *mean* something (which agent, which account, which
  state) stays semantic; the decorative accent is a different token.

## 2 — Formats: pick the film's shape first

Every film made with this skill used to be the same film: a pill that morphs into the UI,
headlines beside it, the UI collapsing into the logo. Right for one product, a template
by the third. **The format is the first decision and the one to vary.**

| Format | What it is | Fits | Built from |
| --- | --- | --- | --- |
| One-object morph | one shape travels through the product's surfaces and back into the mark | an app with a strong shape language | `promo.html` |
| Kinetic type | the claim is the picture: words land on the beat, weight swelling, one word a window onto the product | a launch, a teaser, a manifesto | `reel.html` open, `FILM.knockout` |
| Browser walkthrough | the real page, clicked and scrolled, sections revealing | a web product, a site | `reel.html` web, `PARTS.browser` |
| Bento | a grid of live tiles, each one proof working; the camera racks focus onto one | a product with many small features | `reel.html` bento, `FILM.selective` |
| Terminal | a command typed by a person, output streaming, a summary line | a CLI, a developer tool | `reel.html` terminal, `FILM.typed`, `PARTS.terminal` |
| Devices in 3D | the surfaces as objects: a cover-flow, a turntable, on a glossy floor | cross-platform, "works everywhere" | `reel.html` devices (WebGL), `PARTS.laptop`, `PARTS.desktop`, `PARTS.phone`, `PARTS.tablet` |
| Zoom-through | each scene is inside a detail of the last: the camera dives through a letter, an icon, a row | nested products, a story of depth | the `iris` portal (`r0`, `zoom`) |
| Data story | a number that grows, a chart that draws itself, a line that extends: the measurement is the hero | monitoring, analytics, a quota | `promo.html` tracks, `TN`, `PARTS.ring` |
| Before / after | the same task twice, the old way and the new, split or wiped | a speed-up, a redesign | `split`, `wipe` transitions |
| Tutorial | one real task end to end: keycaps, clicks, captions | onboarding, docs, a long film | `PARTS.keycap`, captions, chapters |
| What's new | one release's delta, shown changing in place | a release | the release-film skill |

- **Three storyboards, three formats.** Not three pacings of one idea.
- **Look at the product's previous films first** (its kit): the next one uses a format, a
  transition family and a look that film did not. A series should look like one show, not
  one episode.
- **A signature move per film**, taken from the product's own UI: its quota bar filling,
  its topology drawing, its diff opening. It is what makes the film this product's, and
  no preset gives it.
- A long film is several formats in a row, each a chapter (§2b).

### Patterns that land, whatever the format

- **One object** that morphs through the product's surfaces (pill → panel →
  notification → window → logo), in the Dynamic Island language: separate springs on
  width, height and corner radius; the old content leaves before the shape moves and
  the new content arrives after it settles.
- **The loop point is a title card**: logo lockup and URL at frame 0 = last frame. The
  film ends by collapsing the UI back into the logo — the product's own bars or
  shapes becoming the mark is the strongest version.
- **Headlines** from the site, one per scene, word by word on the beat, in the space
  the camera leaves free beside the UI, drawn by `TYPE.draw` (type.js) in one style per film:
  `rise` through a clip, `focus`, `settle`, `track` for a title, `wipe`, `cascade`, `weight` (a
  variable family), `split`, `flap`, `type`, `swap` (one word changing in its slot) — and
  `odometer` for the one number that matters. An emphasis (`highlight`, `underline`, `color`) marks
  the claim's one word after it lands. README.md has them in pictures.
- **A real cursor with real clicks** — a press, a ripple where it landed, a hover
  highlight, the UI answering (a pressed button, a selection that slides). People
  notice and like it. The cursor arrives, rests, then clicks, under a camera at rest: the
  click rule in release-film §3b, which `scripts/clickcheck.mjs` measures.
- **3D section**: tilt the main screen in perspective, lift its content layer above
  the base so it parallaxes, click through the panes, scroll inside them — then come
  back flat before morphing out.
- **Holds need an event per beat** even without music: the product's real
  micro-behaviour (a timestamp ticking every second, a reading that rotates, a
  countdown) and a slow camera drift. A settled frame held for two seconds reads as
  dead time.
- **A whip pan needs no blur effect**: a camera key with f ≈ 2.5 and ζ ≈ 1, and the 16
  subframes turn the move into real directional blur.

## 2b — Long films: one to five minutes

A long film is **scenes on a timeline** (`FILM.timeline`, `reel.html`): each scene draws
its whole frame at its own local time, with its own camera and look; consecutive scenes
overlap by their transition. Outside a transition a scene draws straight onto the frame,
so a five-minute film costs per frame what a short one does.

- **Structure**: an opening that states the claim (≤ 10 s), then one chapter per idea,
  each 15–45 s and each a different format, then the close. Give a chapter a `chapter:`
  title: it becomes a chapter mark in the mp4 and a list for the YouTube description.
- **Pace**: an event every 2–4 s, a new visual idea every 8–15 s, a change of look or
  format at every chapter. A light scene after a dark one is a chapter break by itself.
- **Recurring motifs** tie it together: the same dashboard on every surface (`reel.html`
  draws one and reuses it), the same mark, the same cursor.
- **Transitions** are part of the language, not decoration. FILM.TRANSITIONS lists the
  twenty-four, in four families:
  - *quiet* (the cut is not the point): `fade`, `dip`, `blur`, `wipe`;
  - *move* (the frame travels): `push` between siblings, `cover`, `split`, `stripes`, `snap` (a
    cut on the move: one scene leaves accelerating, the next lands decelerating, their speeds
    matched where they meet; fast, on the beat), `whip` (a whip pan, smeared along the move);
  - *depth* (toward the camera, or a surface turning): `zoom`, `window` (a card or a window
    opening into the next scene), `zoomblur` (a dive with the speed drawn in), `flip` (the
    other side: before and after), `cube` (the next face: platforms, plans), `page` (a page
    curling off: editorial, docs);
  - *reveal* (the next scene through a shape): `iris` from where the cursor clicked, a `portal`
    through a letter's counter (`iris` with `r0` and `zoom`), `shape` with the product's own
    mark, `frost` (a pane of glass), `sweep` (a line in the accent), `tiles` and `ripple` (both
    from where the cursor clicked), `halftone` (dots in the accent), `liquid` (one scene melts
    into the next, its front lit in the accent).
- **The shader kinds** (`FILM.GL_TRANSITIONS`: `whip`, `zoomblur`, `liquid`, `ripple`,
  `halftone`, `flip`, `cube`, `page`) share one WebGL2 context a page, made at the first frame
  that needs it: one of Chrome's sixteen (§5), whatever their number. Their frames cost about
  twice a 2D cut's (the same half second of `reel.html`, 48 subframes: 93 s with `cube`, 50 s
  with `push`) and nothing outside the cut. What `flip` and `cube` uncover is transparent: give
  the timeline an `under` (the backdrop) or the transition a `bg`, or it is black.
- **How the cuts hang together** (what the films made here keep to): two or three kinds a film, repeated, and one family carrying most of them;
  **one direction a film** (`from` the same side on every cut, unless a cut means "back");
  **depth is a sign** — a scene that leaves toward the camera is answered by one that arrives
  from further back (`zoom`, `zoomblur`), never by one that shrinks; and a cut **starts where
  something happened** (`at`: the click, the button, the letter), not at the centre by default.
- **`from` is a side, a rectangle or a scale, by kind** (`push`, `window`, `zoom`): a scene's
  `in` inherits the film's `trans`, and each kind ignores a `from` that is not its own type.
- **Scenes that draw no backdrop** (`transparent: true`, over the timeline's `under`) are joined
  with `fade`, `dip`, `push`, `frost`, `snap`, `tiles` or a shader kind. The others (`cover`,
  `zoom`, `iris`, `wipe`, `blur`, `split`, `shape`, `window`, `stripes`, `sweep`) lay one scene
  over the other and take the upper for opaque: what the lower still shows through it goes at
  once on the cut's last frame (up to 223 levels, measured: `studio/transcheck.mjs --sheer`).
- **Not a loop**: `PROMO_META.loop = false`, `seek` clamps instead of wrapping, and the
  film ends on its last frame. loopcheck says so and passes.
- **Review a long film by its checkpoints**: `node render.mjs sheet sheet` takes a still
  at each scene settled and each transition at its half-way point (a spring is half done
  well before half its time, so this is computed, not `dur / 2`).
- **Draft, then final**: `PREVIEW=1` renders the whole film at one subframe and half size,
  about 16x faster (a 17 s film at 720p: 15 s); `FROM=… TO=…` renders one chapter at full
  quality; `RESUME=1` picks up a stopped render; `KEEP=1` and a second run give another
  format in seconds.

### Tutorials: a film that is told

A tutorial (`kind: 'tutorial'`, the Studio's Tutorial recipe) is one real task from start to finish,
with a voice and subtitles, as long as its story takes. It is told before it is drawn, and **the
voice sets the clock**.

**Which voice is settled for a film in English**: a voice
model, Chatterbox for a tutorial and Orpheus "leah" for a promo that speaks (step 2). **For a film in
Italian**: Kokoro's `if_sara` (`"mlx": { "model": "kokoro", "voice": "if_sara" }`: the language is derived from
the voice, or written as `"lang"`), the only voice heard in a language but English. A Mac voice
(`voice: 'mac'`) is for any other language the models were not tried in, or for the user who asks for one
in words: for an English film, never propose one and never name one to download.

1. **The story is the storyboard.** Write `story.json` from the brief's `task` and the product's
   own strings: a step for each thing the viewer does, one sentence each (12-20 words: a voice says
   160 to 190 a minute), `chapter` on the step where a new part begins, `hold` where the picture needs
   a moment after the sentence, `silence` for a step nobody speaks over. Show it to the user as
   sentences and wait: a line rewritten now costs nothing, after the render it costs the render.
2. **`node narrate.mjs story.json`** (the brief's `voice: 'mac'`; a model's voice is the next
   paragraph) says each sentence (`say`, with the brief's `voiceName` and
   `rate`; the same sentence gives the same file to the byte, so a re-run changes nothing), measures
   it, and writes `narration.wav`, `narration.js`, `captions.srt` and `captions.vtt`. With
   `voice: 'mine'`, the user records one file a step, named as `narrate.mjs` names them, and
   `--from <dir>` takes those instead. It lists every subtitle shown for under a second or read
   faster than 20 characters a second: shorten that sentence.
   **A voice model** (`voice: 'model'`, the Tutorial recipe's default: `say`'s best
   voice is fluent and still a machine, so three models were chosen by ear). The story carries
   `"mlx": { "model": "chatterbox", "tempo": 0.88, "level": -18, "seed": 1000 }` (the brief's
   `voice.model`, `voice.tempo` and, when not `warm`, `voice.tone`; `"orpheus"` speaks as
   `voice.speaker`, "leah" unless another is named; `"kokoro"` likewise, "af_heart" unless it is "af_bella", "am_michael" or "if_sara"; the brief's `voice.human` is the story's
   `"human"`) and is told with **`node
   voice.mjs story.json`** instead: it says each step with the model, paces and levels it, and calls
   `narrate.mjs` itself, which stops (exit 3) on such a story when run alone. Chatterbox, even and
   calm, is a lesson's voice; Orpheus "leah", warmer, a promo's (`--recordings` leaves the lines as
   files for a film that lays them on beats of its own). Chatterbox and Orpheus were chosen in US English
   and tried in no other language; Kokoro (330 MB, quick, no tone: it has no temperature) was heard in US
   English (`af_heart`, `af_bella`, `am_michael`) and Italian (`if_sara`): in any other language, `mac` or `mine`.
   `--setup kokoro` installs the packages it needs (about 160 MB); a Python made before it lacks them.
   - The model's text is plain: pauses are punctuation (`[[slnc …]]` is taken out), and a name it
     would misread is written as it is said in `say` and as it is spelled in `caption`.
   - **A take is a seed**: the same model, voice, words and seed give the same audio on the same Mac
     and versions; another seed reads the line another way. I cannot hear. `--audition 3` says
     three takes a step into `voice-mlx/audition` and prints their lengths: I take the median, write
     its `seed` on the step, say that this is how it was picked, and hand over the draft to be
     listened to (names above all); the user who wants to choose by ear listens to that folder. A take the
     user has heard is never said again at another seed without their ear.
   - **The Python and the models are per Mac.** When `voice.mjs` stops for lack of them (exit 3),
     say in one line what is about to be downloaded (a 600 MB Python environment in
     `~/.local/share/film-voice`, and 3 to 3.5 GB a model from Hugging Face, once) and run `node
     voice.mjs --setup <model>`: these are the voices the skill promises. Never tell the
     story with `say` to get past it. `--setup` ends by saying whether this Mac says the probe line
     as the take recorded in `voice.mjs`: pass on "NOT the take" in those words, because a film
     approved on another machine then needs its recordings brought over (its `voice-mlx` folder), or new
     takes heard.
   **The Mac's voice is per Mac too.** A Premium or Enhanced voice is a download on each Mac (System Settings,
   Accessibility, Read & Speak, which older macOS calls Spoken Content, System voice, Manage Voices;
   give the user the names as macOS shows them in their own language), and `say -v` with a voice that is
   not there does not fail: it speaks with the default one. `narrate.mjs` stops instead (exit 3) and
   names the voice to download: pass that on to the user in those words, never tell the story with
   another voice to get past it. When the brief's `voice.quality` is `compact`, say once, before the
   story, what would sound better: in English a voice model (above), in another language a voice
   marked Premium, and where it is downloaded; it is their call. The pace `narrate.mjs` prints is the real one
   (`rate` 175 is 185 words a minute with Samantha, 211 with Tara): a lesson wants 150 to 170, so
   lower `rate` (the Studio's Calm is 130) or write pauses into the sentence, `[[slnc 280]]`, which
   the subtitles leave out.
3. **The page follows it**: `<script src="narration.js">`, then
   `FILM.narrated(NARRATION, (step, i) => ({ draw(g, lt) { … } }))` gives `FILM.timeline` one scene a
   step, each beginning a moment before its sentence (`step.at` is when the voice starts, in the
   scene's own seconds) and exactly as long as the voice takes; chapters come from the steps. An
   action lands on the word that names it: time it from `step.at`. Never give a scene a length by
   hand.
   **A walkthrough of one surface is one world, not a scene a step.** When every step happens in the
   same window (a product's kit page: a camera, a cursor, a list that changes), cutting between
   scenes of the same picture gains nothing and breaks the cursor's path. Keep the page's single
   `seek`, and give it no time of its own: `const at = (id, dt = 0) => STEP[id].t + dt` over
   `NARRATION.steps`, and every click, key and camera move is `at('<step>', seconds into its
   sentence)`; `PROMO_META.duration` is `NARRATION.duration`, the chapters and a checkpoint a step
   come from the steps, `FILM.captions` is drawn last. Made this way from a release film's page
   (a tutorial made from a release film's page): the beats the lesson does not have became `NEVER`, the changes
   the app already has `DONE`, and four blocks marked THE LESSON (the times, the camera, the keys,
   the cursor) are all the next tutorial rewrites. `clickcheck.mjs` holds as for a release film.
4. **Subtitles**: `captions: 'both'` or `'burned'` → `over: (g, t) => FILM.captions(g, t,
   NARRATION.cues)` on the timeline, in the brief's text face; `'both'` or `'file'` → the `.srt` and
   `.vtt` are delivered beside the film, and the `.srt` goes into the mp4 as a track the player can
   turn on: `ffmpeg -i film.mp4 -i captions.srt -map 0 -map 1 -c copy -c:s mov_text
   -metadata:s:s:0 language=<the voice's> out.mp4`.
5. **Render** with `AUDIO=narration.wav AUDIO_LUFS=-16` (speech sits a little under music's -14);
   the beat check says the track has no beat, which is right. Music under a voice is mixed in
   before, by `mix.mjs` (*A film that speaks*, step 4), as far under as the brief's `musicMix`
   says: ask before adding music the brief did not ask for.
6. **What it costs**: a render is about 29× the film's length at 1080p60, so tutorials are 30 fps
   (the recipe's default, half the time) and get a `PREVIEW=1` draft of the whole first: a
   five-minute tutorial is over an hour at full quality. The voices that ship with macOS are compact
   (22 kHz); when the user has downloaded an Enhanced or Premium one it is first in the Studio's
   list, which says under it what that Mac still lacks.

### A film that speaks: a voice-over on any film

A promo, a film in chapters or a release film may speak, from the brief's `voice`: the voice, its
tone, its speed and how human it sounds are the user's choice. It is told as a tutorial is (above), with what a film that is not a lesson changes:

1. **The lines**: the brief's `voice.script`, or mine from the product's own claim and strings: a
   line a scene, 8 to 14 words, few of them (a 15 s promo says two or three). Shown to the user as
   sentences, and waited on, as a tutorial's story is.
2. **The story** is `story.json` with a step a line, the brief's `voice.human` as `"human"` and, for
   a model, `"mlx": { "model", "voice": <speaker>, "tone", "tempo", "seed": 1000 }`. With
   `expressive` I may write one sound where a line invites it (`[chuckle]` on a light line, `[sigh]`
   on a relief; one line in four at the most, never on the claim): `voice.mjs` gives each model its
   own spelling and leaves out one it cannot make, saying so; the subtitles never show one. A
   person hears the draft before anything renders, as for a tutorial: a tone or a sound is judged by
   ear, and I cannot hear.
3. **The clock**: `duration: 0` is a film as long as its voice: `voice.mjs story.json` (or
   `narrate.mjs`), then `FILM.narrated`, as a tutorial. A fixed length (a 15 s loop) keeps its beat
   grid: `voice.mjs story.json --recordings`, then `narrate.mjs story.json --from voice-mlx` with
   `lead` and each step's `hold` set so each line starts on its scene's first beat (it prints when
   each starts: read them against the grid). A line longer than its scene is a shorter line, never a
   faster voice; a loop that speaks ends its last line a beat before the loop point.
4. **The mix**: with music, `node mix.mjs --voice narration.wav --music src/audio/<track> --at
   <musicBeats.at> --under <musicMix.under> --lift <musicMix.lift> [--length <the film's s>] --out
   mix.wav`, then `AUDIO=mix.wav AUDIO_AT=0 AUDIO_LUFS=-16`: the music starts on its first bar with
   the film, so the beat check still holds. It prints how far under the voice the music came out,
   measured on the mix: say it. Without music, `AUDIO=narration.wav AUDIO_LUFS=-16`.
5. **The subtitles**: as a tutorial's (step 4 above), from `voice.captions`.

## 3 — Direction

- **Look** (§4): the base is the brand's own page neutral when it has one — a tinted brand
  neutral beside a colourful logo reads as the product, a generic warm grey reads as a
  template. The presets build light and texture on top of it. Say which look in the
  storyboard.
- **Type**: the brand's display and body faces, and the product's real UI font for
  the UI (`system-ui` is SF on macOS; the name "SF Pro Text" does not resolve in
  canvas). Without a brand face, a set from the kit's fonts (`template/fonts/`, the Studio's
  type sets) rather than the first sans that comes to mind.
- **Springs everywhere**, damping 0.78–0.92 (at most ~3 % overshoot).
- **The camera zooms so each moment fills the frame**; the smallest text on screen
  stays readable at that zoom (≥ ~14 px at 1080p).
- **Every headline and tagline reads on a phone**, where most people watch: at least 9 pt
  on a screen 390 pt wide, `9 × width / 390` px (45 px in a 1920-wide film, 25 px in a
  1080-wide vertical one), and a title well above that. Text inside the product drawn with
  `TYPE.draw` (a counter in a dashboard) takes `ui: true` and keeps the UI rule above. A title card on a big backdrop looks fine in a
  still at full size and shrinks to a line on a phone: `layoutcheck.mjs` fails a smaller one.
- **Camera language varies with the format**: locked off while the UI moves (a terminal),
  a slow push (type), a rack focus (a grid), a dive (zoom-through), an orbit or a
  cover-flow in 3D (devices), a whip pan between siblings. One per film carries it.
- **Effects that earn their place**, all in `film.js`/`fx.js`: depth of field and rack
  focus (`FILM.selective`), type as a window onto the product (`FILM.knockout`), typing
  with a human cadence (`FILM.typed`), frosted glass, click ripples, focus-pull words, 3D
  with reflections, and the transitions. Each one says something about the product; none
  is there because it exists.
- **Light and texture belong to the backdrop; the product stays clean.** The lights,
  the spot, the grain and the vignette are the stage. On the product, only what the
  product itself does: its logo, the sheen on its bars, its own glass.
- **Banned**: bouncy cartoon easing, particle bursts, lens flares, light leaks, glows
  or outlines on UI elements, chromatic aberration, glitches, gradient chrome,
  mismatched icon strokes (one icon set, one stroke width), dead time, anything that
  screams "template".

## 4 — The look: backdrop, light, texture

`fx.js` draws everything behind the product and the finish over it, as pure functions of
`t` and the camera, so stills, loop and render keep their guarantees. The page names its
look in one line — `FX.look({ preset, palette: C, …overrides })` — and the settings are
documented at the top of `fx.js`.

| Preset | What it is |
| --- | --- |
| `plain` | the brand canvas, flat |
| `paper` | canvas, a fine paper texture, a soft vignette: editorial |
| `dots` | a dot matrix on the UI's plane (the templates' default) |
| `grid` | a fine grid behind the UI, parallax, fading out: technical |
| `aura` | the brand colours as soft light, drifting |
| `spotlight` | a light studio: one pool of light behind the subject |
| `night` | dark, the brand colours glowing |
| `studio` | dark, one soft light, a deep vignette: cinematic |
| `mesh` | a mesh gradient of pale brand tints, drifting: airy, light |
| `meshdark` | a deep mesh of the brand colours: rich, dark |
| `silk` | a slow flowing field of brand tints with a lustre: satin, not smoke |
| `lava` | dark, large soft blobs of colour orbiting slowly |
| `aurora` | dark, curtains of light rising from a wandering edge |
| `sunrise` | a pastel dawn in several stops, warm light low |
| `halo` | light, a faint sheen swaying around the subject |
| `caustics` | light, the network sunlight draws on a pool floor, in the brand tint |
| `topo` | light, the contour lines of a slowly shifting terrain: technical, quiet |
| `halftone` | light, a halftone screen whose dots swell toward a soft light: editorial |
| `clouds` | light, a soft sky with clouds drifting across: airy |
| `lines` | light, fine parallel lines at an angle, in parallax: Swiss |
| `dunes` | light, layered ridges in the brand tints, swaying, in depth |
| `floor` | dark, a stage: a floor grid in perspective and a glow on the horizon |
| `ember` | dark and warm, a low glow and a grainy texture: filmic |
| `photo` | a picture you may publish, cover-fit: `blur`, `tint`, `duotone`, a Ken Burns `drift` (the Studio's pictures, or one an image model makes: below) |

Most of them are **fields**, `base: { kind, … }` in the header of `fx.js`: `mesh`, `flow`,
`blobs`, `aurora`, `caustics`, `topo`, `halftone` and `clouds` are computed in WebGL (one context
per look, made once; Chrome allows 16 a page, and `render.mjs` fails a capture whose page lost one), mixed in OKLab and dithered in the shader before
the 8-bit write; `linear`, `radial` and `conic` are 2D gradients of many stops, pre-sampled so the
ramp is mixed in OKLab too, and `dunes` is drawn in 2D, a layer per ridge. Their
motion has a `period` in seconds, a whole number of cycles over the film: a 60 s film moves at
the speed of an 8 s one (0.82–1.01x, measured), never faster.

- **A colour scheme from one hex**: `FX.palette('#5B5BF7', { scheme: 'triad', tone: 'dark' })`
  gives the roles every preset reads (canvas, ink, dim, accent, a, b, c, pale, deep), in
  OKLCH, inside the sRGB gamut. For a product with one brand colour and nothing else.
- **A picture nobody has** (a room, a desk, a scene for the product to sit in): an image model
  makes it. For example Codex's built-in image generation runs unattended, on the ChatGPT plan's
  quota, with no API key; any other image model does as well. With Codex, run
  `codex exec --ephemeral --skip-git-repo-check -c model_reasoning_effort="high" -s workspace-write -C <dir> [-i ref.png …] - < prompt.txt`,
  detached. In the prompt, ask for the built-in `image_gen`, exactly one image, no text or logos,
  the native size kept, and a copy in the working directory. The service never reports which model
  it served. A 16:9 frame came out at 1672×941, a square at 1254×1254, in 45–80 s; the original
  also stays under `~/.codex/generated_images/`. `-i` takes style references, or an edit base
  ("every element where it is, change only the light"). Upscale it if the film needs more pixels.
  Put the picture in `~/Pictures` (or a picture folder the user has added in Settings), where the Studio's pictures list it, with its prompt beside it
  as the making-of record, and say in the delivery notes that the scene is AI-made. Animated GIF
  output needs Codex 0.168 or later with `-c features.image_generation_animation=true`. SVG,
  markup, `complexity` and the choice between Flare and Sunburst are API-only.
- **A backdrop per chapter**: `FX.sequence([[0, lookA], [24, lookB], …], { fade: 0.8 })` is used
  like one look and cross-fades between them. Or give each timeline scene its own look, as
  `reel.html` does: then the transition carries the change.
- **Choose on a sheet, not in words.** Twenty-three presets now; the sheet is still one command,
  and the Studio shows them moving.
  `dots` is the template's default, and a film that never looks at the sheet ends up on it.
- **Render the sheet from a real frame.** `node render.mjs looks looks 3.5` renders that
  frame once per preset (through `#look=` in the URL), and `node contact.mjs looks
  looks.png 4` lays them out. Use a frame with the UI, a headline and some empty backdrop.
  Then tune the chosen preset with overrides; its colours come from the palette's roles.
- **Two or three left: compare them on one sheet**, over the whole film, not one frame.
  `PAGE='promo.html#look=aura' node render.mjs sheet sheet-aura`, the same for each candidate,
  then `node contact.mjs --compare aura=sheet-aura meshdark=sheet-meshdark looks-ab.png`: a
  column per look (the label is any word), a row per moment. Rows pair stills by name, that is by
  time: two takes of a scene compare the same way when they share their times (`render.mjs
  stills <dir> t…` at fixed times gives them).
- **Depth is the parallax.** Each backdrop layer follows the camera by a factor k — 0
  painted on the frame, 1 on the UI's plane — seeing it at (x·k, y·k, z^k): lights ≈ 0.1,
  a spot 0.2, a grid 0.5, dots 1. A camera move then reads as depth without any 3D.
- **A chapter can own a colour**: `keys` recolours the lights on the beat (mixed in OKLab;
  sRGB mixing goes through grey). The last key must bring the first colours back, or
  `FX.look` refuses to load.
- **A dark tone flips the ink** for text on the backdrop (`LOOK.ink`, `LOOK.dim`) and gives
  dark surfaces a hairline (`LOOK.edge`), without which they sink into it. UI text keeps
  its own colours.
- **Effects that lean on the backdrop**: `LOOK.glass()` for a frosted surface — a menu, a
  popover, a sheet: what is behind shows through, blurred and saturated; `LOOK.ripple()`
  for a click, a ring from the cursor's tip (`clicks: 'none'` drops it); `FX.focus()` for
  a word that arrives by pulling focus.

Measured while building it:

- **Noise is what stops the encoder banding a gradient.** A dark ramp that Chrome itself
  dithers (22 px flat runs) comes out of x264 with 51 px runs; σ 1.5 of static dither
  brings them to 7, σ 2 to 5. So every preset with a gradient in it (lights, a spot, a
  vignette) carries a `dither` of 1.5–2.
- **Moving grain is the most expensive thing a film can contain; static noise is nearly
  free.** The encoder stores a static pattern once and references it. On a 640×360 test, a
  second of grey carrying σ 3 was 1.94 MB as moving grain and 91 KB as dither. The 8 s demo
  in `aura` came to 99.7 MB with σ 2.5 of moving grain under the UI (115.7 MB over
  everything), 4.6 MB with the preset's dither, 1.9 MB with no noise. So the presets
  dither, and `grain` is a choice made for a filmic look, knowing its price; `grainEvery:
  2–3` takes 17–37 % off it at σ 3.
- **Grain is seeded per frame, never per subframe.** Per subframe, the 16-subframe blend
  and x264 took σ 3 down to 0.12 — a flat frame. Per frame it came out at 2.97.
- **`ctx.filter` blur ignores the transform**, like `shadowBlur`: blur(2px) spread 9 px
  under scale 1 and under scale 4. Scale it by the zoom yourself; `glass` does.
- **A click lands on a cursor that has arrived, under a camera that has.** Clicked 0.5 s into
  a move, the cursor was still 51–57 px short and kept gliding, and the ripple was left behind
  it. Both templates check it on load and print the beat that lands short; `clickcheck.mjs`
  measures the camera too, and the press (release-film §3b): the templates now give each move
  about two seconds on slower springs (f 0.85 / 0.75) and pass it.
- **An eased drift is only asymptotically still**: the last frame's start differed from
  frame 0 by a handful of pixels, one level each (PSNR 103, not inf). The lights now hold
  still for half a second either side of the loop point.
- **Glass sees only the main canvas.** Inside an offscreen 3D layer there is nothing
  beneath it yet, so a glass surface belongs to the flat parts of the film.
- **A scratch canvas is made once, at its final size.** The glass's, first grown to the menu
  bar's size and then to the menu's, blurred that first frame differently from every later
  one (PSNR 77.7 between two seeks of the same t). A frame that depends on what was drawn
  before it is not a function of t: it breaks the loop check and makes stills disagree with
  the video.

## 5 — Build

- One HTML file at the output resolution. `seek(t, opts)` is a pure function of `t`: no
  CSS transitions, no timers, no state between frames. The page exposes
  `window.PROMO_META = { width, height, fps, duration, bpm }` and `window.ready` (a promise
  resolved once the fonts and the look are loaded) — `render.mjs` reads both.
- **Springs are closed-form step responses that return exactly 1 once the residual is
  under 2e-5**, so an end state is exact and the loop can be pixel-identical. A value
  with several targets is the sum of one spring per change; a target may itself move
  (`S0 + Σ pᵢ·(Sᵢ(t) − Sᵢ₋₁(t))`), which is how a morph can land on a panel whose
  height is still animating.
- Camera: springs on x, y and **log** zoom.
- Everything must be at rest at the loop point, so check settle times against the end:
  settle ≈ ln(5·10⁴) / (ζ·2π·f) seconds.

**The stage: nothing may step or shimmer in a slow move.** Zooms and moving images flickered a
little in finished films, and it was measured on a lab film and on a real 28 s release film:

- **Every page installs `FILM.stage` on its frame's context and calls `STAGE.begin(opts)`
  first in `seek`.** render.mjs gives each of the 16 subframes a different subpixel offset
  on a stratified 4x4 grid; the blend then antialiases as well. Text in a slow drift
  stopped stepping (its centroid wobble went from 0.33 px to 0.05 px), at no cost in render
  time. On a real 28 s release film, ported: its 14 worst blocks in slow moves flicker
  37–76 % less, four in five of the blocks that flickered improved, the mp4 came out 9 %
  smaller, and it rendered in 179 s against 178.
- **Every raster goes through `FILM.draw`**, never a bare `drawImage`: at the default
  'low' smoothing a 1024 px icon drawn at 90–150 px shimmers (up to 2.5x the flicker of 'high', in a drift),
  and Chrome ignores the smoothing setting entirely for a canvas source — which every
  tinted SF Symbol is. `FILM.draw` mipmaps both, the canvas by a trilinear copy baked once per
  size: a canvas drawn into and then drawn from in the same frame forces a GPU sync, and a first
  version that did that per call rendered the same film 77 % slower.
- **What must stay on the pixel grid uses `ctx.rawSetTransform`**: the dither and the grain
  (fx.js does), and a canvas that already carries the jitter, like a WebGL layer (the
  templates add the jitter to the quads instead). A full-frame fill overhangs the frame
  by 2 px, since the frame moves by up to 0.4 px.
- A kit built before the stage ports in four edits: load `film.js`, `FILM.stage` on the
  frame's context, `STAGE.begin(opts)` in `seek`, `FILM.draw` for every `drawImage` of an
  icon or symbol.

Canvas traps, each measured on a real film:

- **`shadowBlur` and shadow offsets are device pixels**, untouched by the transform —
  scale them by the camera zoom (and by the supersample when drawing offscreen).
- **Canvas has no `font-variant-numeric`.** Lay digits in fixed cells (`TN`) and
  place whatever sits beside them with the same measure (`TW`), or a counter jitters
  and an icon collides with the number it labels.
- **A word revealed through a clip must travel ≥ 1.3 em.** At 1.05 em the exiting
  word's descender stays inside the clip box — a stray "y" tail over the next scene.
- **True perspective needs WebGL.** Canvas 2D is affine only: draw each layer into an
  offscreen canvas (3× supersample), composite them as WebGL2 quads with clip-space
  `w` for perspective-correct mapping, mipmaps plus anisotropic filtering. An identity
  rig reproduces the flat frame, so switch between the 2D and GL paths only while
  something is moving.
- **A lifted layer overhangs its base in projection.** Fade it at the scroll edges
  (a `destination-out` gradient on the offscreen layer), in proportion to the lift.
- **The cursor lives in world coordinates** (springs on x and y at different
  frequencies, so paths arc) and is drawn in screen space at a size ∝ zoom^0.35. A
  click target on a tilted plane is that point *projected at the click time*.
- **Watch the frame edges**: a camera that frames the hero can leave a 20 px sliver of
  some chrome along the top. Frame it fully in or fully out.

## 6 — Stills before the render

Render one still per scene — the settled moment, plus one mid-morph where a morph
carries the scene — and build the contact sheet:

```sh
node render.mjs stills stills 0 1.5 4 …
node contact.mjs stills contact-sheet.png      # captions from stills/labels.json
node render.mjs sheet sheet                    # a timeline film: every scene settled, every cut half way
mv sheet sheet-v1 && node render.mjs sheet sheet                # after a fix: the same checkpoints again,
node contact.mjs --compare before=sheet-v1 after=sheet ab.png    # and each one before and after it
```

Look at every frame yourself first: cramped, off-grid, illegible at that zoom, clip
remnants (descenders, cut glyphs), slivers at the frame edge, empty holds, a ripple
that is not on the cursor's tip. Run `node clickcheck.mjs <page>`: a click it fails is a click
the viewer will not see. Run `node layoutcheck.mjs <page>` too. Fix and re-render. Then show the user the contact
sheet with one line per scene — and the looks sheet (§4) while the look is still
open — and **wait for a go** before the full render. Review material stays in the work
folder, already in `~/Downloads`: end with its `open` command, never a copy in the delivery.
Scratch files too (a probe's output, a list, a test still): in the work folder, never in `/tmp`.

## 7 — Render and verify

```sh
SUB=16 node render.mjs video ../<name>.mp4  # 16 subframes per frame, a third of the cores
node render.mjs loopcheck                   # PSNR must be inf
```

- **16 subframes, not 4.** At 4 the motion blur shows as discrete ghost copies on any
  fast move — four cursors, doubled text in a zoom. Cost on 8 workers, measured: the 8 s
  demo in 35 s (`dots`) or about 87 s in a dithered look, whose every PNG carries noise;
  the 16 s release demo in 69 s (`dots`) or 171 s (`night`). So 30 s at 60 fps was about
  2 minutes, or 5½ with dither — at full speed, before the heat defaults, which take about three
  times longer and stay at 80 °C.
- **Fast frames get 48**: at 16, a fast push showed its 16 moments as
  copies about 12 px apart (text and a button's edge in steps), gone at 48. Before the render each
  frame is captured once at a quarter of its size, and the mean difference to the next (0–255) is
  its speed; above `FAST` (4), and the frames either side, it gets `SUB_FAST` (48) subframes, the
  rest 16. Calibrated on `reel.html` without jitter or grain, lossless: 16 and 48 agree to 61–68 dB
  PSNR under a speed of 2 and part below 52 dB from about 6. On the reel: 8.5% of the frames are
  fast (on `promo.html`, none), the measuring pass took 20 s (default QoS) for 56 s of film, so a
  render costs about a fifth more. Slow frames render byte for byte as before; a fast frame repeats the 4×4 grid
  three times, so it antialiases like its neighbours. Chunks are cut where frames turn fast, with
  no more subframes than a slow one, and the longest go first. A resumed render keeps its plan;
  `SUB_FAST=0` turns it off, `PREVIEW` never has it.
- **The shutter**: `PROMO_META.shutter` or `SHUTTER=`, in degrees, is
  how much of each frame its subframes cover. 360, the default, spreads them over the whole frame:
  the smoothest blur, and the film renders byte for byte as before. 270 is a touch crisper; 180 is a
  film camera's, crisp moves with a cinema cadence; 0 keeps one moment a frame, antialiased but
  unblurred. Same cost at every value. The Studio's motion step offers 360, 270 and 180, and its
  viewer's Motion blur gathers the same share of the frame; `loopcheck` compares frame 0 with the
  shutter's own last moment.
- **The shutter's phase**: `PROMO_META.shutterPhase` or
  `SHUTTER_PHASE=`, in degrees of a frame from -360 to 360, is when the shutter opens. 0, the
  default, opens it on the frame's own moment, so the blur trails forward from it and the film
  renders byte for byte as before. Minus half the shutter centres it (`SHUTTER=180
  SHUTTER_PHASE=-90`): a move blurs as much before the moment as after, which is what After
  Effects calls Shutter Phase. A moment before the first frame or past the last wraps round a loop
  and holds the end of a film that is not one. Not in the Studio: it is set on the page or the
  command line.
- **`tmix=frames=N` then `select` on `n % N == N−1`** makes each frame the mean of its
  own N subframes; each worker's segment starts on a frame boundary so nothing mixes
  across segments. A synthetic check (grey levels 0/32/64/96 must give 48) settles it
  in seconds if in doubt.
- **Colour**: convert with `scale=out_color_matrix=bt709` and tag with the
  `h264_metadata` bitstream filter — the scale filter drops the primaries and transfer
  tags, and players then guess. `render.mjs` does both.
- **Heat: one render at a time, cool by default.** `render.mjs` runs in the `utility` QoS class on
  a third of the cores, with a governor that reads the die (`thermo.swift`, no sudo) and holds the
  workers above 80 °C. Measured on 8 s of the reel: the old 12 workers at full speed reached
  87.9 °C inside a minute; 6 in `utility` held 80.0 °C with no pause, in 231 s; and under an
  80 °C ceiling full speed was *slower* (250 s, 198 of them cooling) and still overshot to 85.5.
  Never raise the workers or switch the governor off unless the user asks; `QOS=background` for
  the coolest long master. The table is in README.md.
- **Jitter is on by default** (`JITTER=0` turns it off) and a page without the stage simply
  ignores `opts.jitter`, so an old kit still renders, without the benefit.
- **The loop is checked on screenshots, never on `getImageData`.** After a few
  readbacks Chrome moves the canvas to software raster, and the first version of this
  check reported ~390k differing pixels between two frames whose screenshots were
  identical. The check leaves the grain out (`seek(t, { loopcheck: true })`): it changes
  every frame by design.
- **The capture is CDP's PNG with `optimizeForSpeed`, one browser per worker.** A
  browser encodes its screenshots on one thread, so eight pages in one browser took
  turns, and a frame with grain is 2–3 MB of noise: 223 ms a subframe that way, 22 ms
  with both changes (the fast PNG is lossless and pixel-identical to `page.screenshot`).
  Before them, an 8 s film with grain was on course for half an hour and looked hung —
  every segment still 0 bytes after two minutes. A film without noise gained too, with an
  identical output: the 8 s demo went from 119 s to 35 s, byte for byte the same mp4.
- **Chunks**: the workers take 5 s chunks (never fewer than one per worker) from one queue,
  and a chunk only gets its final name once complete. A stopped render resumes with
  `RESUME=1`, which refuses if the page, its scripts, a file it loaded as it opened (a picture, a
  font), anything `PROMO_META.inputs` names (files or folders the page loads later, while it
  seeks) or the settings changed; `KEEP=1`
  keeps the chunks, so `node render.mjs video film.webm` after a good `film.mp4` is an
  encode, not a render (measured: a 4 s range re-encoded to four formats in 1–3 s each). A
  resumed render came out bit-identical to an uninterrupted one (framemd5).
- **A page must capture at the film's size.** On a busy machine (load 6) about one
  render in four had a browser whose captures came out 1920x993, its window's own size on a
  1080-high screen less the browser's bars, while the page itself said 1920x1080; the encode
  scaled those frames back up, a shade softer (PSNR 53 dB), and the same render run twice
  differed in that chunk. `openPage` now takes one capture once the page is ready, reads its size
  from the PNG header and sets the viewport again until it holds (seen in a real run: caught,
  set, film identical); every subframe's size is checked before the blend; and each worker's
  browser must draw a reference frame to the byte, or it is launched again, as the check of last
  resort. Fourteen real renders at load 7-8 after the fix: fourteen identical films.
- **A lost WebGL context fails the capture.** Chrome keeps 16 WebGL
  contexts a page and, past that, loses the oldest, which draws nothing from then on: no
  exception, only a console warning. Measured: `promo.html` with 16 more contexts lost its card's
  compositor, the card vanished from the still (PSNR 11.8 dB) and `stills` ended with exit 0.
  `openPage` now notes every WebGL context the page makes before its scripts run, and every
  capture checks them right after its seek, in the same round trip: a lost one stops `stills`,
  `sheet`, `looks`, `loopcheck`, the fast-frame pass and a video before the picture is taken, the
  video's chunk not kept. Chrome's WebGL warnings are printed, once each. Each fx.js WebGL base is one context and the page's own WebGL canvases are
  more: a film of many chapters, each with its own WebGL look, is where it shows.
- **Each cut keeps its own chunks.** Two `video` renders from one
  folder (a master and a square cut) shared `.segments.noindex/`, and the second one's fresh start
  deleted the first one's chunks: while it ran, or, kept with `KEEP=1`, after it. Each cut (a page
  and its hash) now has its own folder, `.segments.noindex/<cut>/`, and a lock beside it: a second
  render of the same cut while one runs stops at once and says so. The lock is macOS's own
  (`O_EXLOCK` on open), held by the kernel while the render's process lives and gone with it
  however it ends, so a render that was killed leaves nothing to clear (elsewhere there is no lock).
  Chunks of a render.mjs before 0.18.4, at the top of `.segments.noindex/`, are not reused: the
  render says so.
- **Formats**: the extension decides. `.mp4` H.264 (CRF 14) or `HEVC=1` (10-bit, `hvc1`, about
  half the size); `.mov` ProRes 422 HQ 10-bit for an editor; `.webm` VP9; `.gif` with a
  palette (`GIF_FPS`, `GIF_W`). All carry BT.709 tags — ProRes, VP9 and x265 write what the
  frames say, and the scale filter drops primaries and transfer, so render.mjs sets them
  on the frames (`setparams`); without it .mov and .webm came out `unknown`.
- **A transparent film**, for an editor to lay over other footage (a release card over a screen
  recording, a headline over a talking head): the look `transparent` (`#look=transparent`) draws no
  backdrop, and `ALPHA=1` renders it with its alpha into a `.mov` (ProRes 4444) or a `.webm` (VP9);
  `.mp4` and `.gif` are refused (how, and what was measured: the top of render.mjs). Tried on
  `promo.html` only: a timeline's transition fills what it uncovers with its `bg` unless the
  timeline has an `under` (§2b), so a timeline film gives it one that draws the transparent backdrop.
- **Chapters**: `PROMO_META.chapters` (the timeline's) are written into .mp4 and .mov, and
  printed as a YouTube list, which wants the first at 0:00 and each at least 10 s long.
- **Music**: `AUDIO=track.mp3 AUDIO_AT=12.4 node render.mjs video …` muxes the track from
  12.4 s in (AAC 192k, 48 kHz), faded out over the last 0.6 s, and brings it to -14 LUFS: two-pass
  loudnorm on the stretch the film uses and nothing after it, one gain for the whole of it (linear)
  as long as that leaves the true peak at or under -1.5 dBTP, raised by 12 dB at most. When one gain
  would pass the peak, the log says so before the render: loudnorm then rides the level, which
  changes the dynamics (a voice with high peaks; lower `AUDIO_LUFS`, or limit the track first, to
  keep one gain). Under 3 s of sound loudnorm cannot ride anything: such a range gets the one gain
  the peak allows and stays under the target, which the log says too. The log prints the track's loudness and the file's, measured on the file, and
  which of the two it was. `AUDIO_LUFS=-16`
  for another target, `AUDIO_NORM=0` to keep the track as it is. (Measured: a -8.9 LUFS track came out at -14.6, a -26.7 one at -15.1.) `AUDIO=click` muxes a
  metronome on the page's `bpm` instead, never normalized — the way to hear whether the cuts land
  on the beat before any music is chosen. The track is checked before the first frame: a file with no sound in it, or an `AUDIO_AT` past its end, stops the render
  there; a track that ends before the film does, and every second or more under -60 dB in the
  stretch it uses (a wrong `AUDIO_AT` on an intro's silence shows as silence from 0), are said in the
  log, and the render goes on. A voice over music is one track before the render: `mix.mjs`
  (*A film that speaks*, §2).
- **The beat**: `node beats.mjs track.mp3` before the storyboard's
  beat grid is fixed. It prints the tempo, whether it holds (every four bars within 25 ms of one
  grid), the bars, the section starts, and what the page needs. A steady track: its bpm in
  `PROMO_META`, and `AUDIO_AT` on a bar's first beat, so `B(0)` is a downbeat and every `B(4n)` a
  bar; a section start is where the film's big moment goes. A track that drifts (a band, an edit):
  `--out src/beats.js`, `<script src="beats.js">`, and `const B = FILM.beats(BEATS.beats,
  <AUDIO_AT>)`: the cuts follow it. Every `render.mjs video` with `AUDIO=<track>` first measures
  the page's `B(n)` against the track's beats and prints where they part and what makes them land;
  `render.mjs beats` does only that, exit 1 when they miss. The bars are a guess from the bass and
  the harmony (right on eight grooves of nine): if the bar lands a beat late, move `AUDIO_AT` a beat.
  No pulse (a pad, a drumless track) is said as such, and the film keeps its own grid.
- **The file is probed when it is written**: its size, its frames,
  its length within a frame, its BT.709 tags, its sound when `AUDIO` was given. A file that does not
  match fails the render with what is wrong, the chunks kept: before this a chunk cut short
  (measured: 73 frames of 120 after a truncated chunk and `RESUME=1`) gave a short film and exit 0.
  `RESUME=1` now counts the frames of every chunk it would reuse and renders a short or unreadable
  one again; the file check stays behind it.
- Then **extract three to five frames from the mp4 and look at them** — a clean render log proves
  nothing about the picture. **Pull one at every click time too**: a still at the exact time
  showed the clicked item, while the mp4's blended frame showed it already covered by what
  the click opened.

## 8 — Deliver: one folder to use, one to throw away

A film that ends as one folder holding the masters beside the drafts, stills, contact sheets and
`src/` with its `node_modules` (641 MB for three films) cannot be moved without the scaffolding or
cleaned up without losing the film. So there are two folders:

| Folder | Holds | Lifetime |
| --- | --- | --- |
| `~/Downloads/<name>-work/` | `src/` (page, engine, fonts, tools, `node_modules`), stills, sheets, looks, drafts, the renders | until the film is out, then the Trash |
| `<delivery>` | only what gets used: every format and aspect of the film, a cover per aspect, a chapter list for a long film | the user's, to use |

`<delivery>` is a folder named `<name>/`. With `deliverToLibrary` on and a music library set (the Studio section) it is
`<library>/<Brand>/video/<name>/`; otherwise where the project's own instructions keep finished
media, else `<name>/` in the work root. `deliver.mjs` refuses a folder whose name the delivered
files do not start with.

Render the masters in the work folder, the poster too (`render.mjs stills stills 0`: frame 0 is the
loop's title card), then deliver them, renaming as they go:

```sh
node deliver.mjs <delivery> ../<name>.mp4 ../<name>-square.mp4 \
  stills/t00.00.png=<name>-poster.png stills-square/t00.00.png=<name>-poster-square.png
```

- It **copies** (an APFS clone, so no extra space) and never overwrites: a name already delivered
  with other content is refused, so a new cut is `-v2`, a new name. A draft (`draft`, `preview`,
  `wip` in the name) is refused, and so is a delivery folder inside the work folder, which would go
  to the Trash with it. Everything is checked before anything is copied.
- **Videos** are probed and printed: size, fps, duration, frames, codec, colour tags, with a warning
  for frames ≠ fps × duration or tags that are not BT.709. A video with chapters gets
  `<name>-chapters.txt` beside it, the list a YouTube description wants.
- **Subtitles** (`.srt`, `.vtt`) and other text files (`.txt`) are copied byte for byte, no optimising and
  no probing; name them like the film (`<name>.srt`, `<name>-fr.vtt`).
- **Covers** go through ImageOptim when `/Applications/ImageOptim.app` is installed (an optional
  step: without it the copy is delivered as rendered): the delivered copy is
  optimised, the work folder's stays as rendered, and each pair is compared: same size, SSIM
  printed, a warning under 0.995 and over 2 MB (YouTube's limit for a thumbnail). Measured on a
  real release film's posters: 1.0 MB → 0.13 MB at SSIM 0.9995. Look at a cover on a gradient
  look anyway.
- It records what it delivered in `<name>-work/.delivered.json`: a second run skips what is there,
  and `trash` knows which renders left.
- **A film that goes to YouTube also gets `<name>-youtube.txt`** beside it, written by hand after
  the delivery, so the title and description are ready to paste. Three sections, each with its
  count, in the film's language:
  - **Title**, ≤ 100 characters.
  - **Description**, ≤ 5,000: what the product is in one or two sentences taken from its site, then
    the chapter list from `<name>-chapters.txt` when there is one, then the links. Chapters show only
    with the first at 0:00, at least three, each at least 10 s long (YouTube Help, *Video chapters*):
    the description IS where they go, there is no other field.
  - **Tags**, one comma-separated line, pasted as is into Studio's Tags field: the product's name and
    its spellings (`Acme App`, `acmeapp`), the platform, the stack, what the film shows; no
    duplicates. ≤ 500 characters counted as YouTube counts them (Data API, `snippet.tags`): the commas
    count, and a tag with a space counts two more for its implied quotes. YouTube says tags play a
    minimal role in discovery, so keep them few and true rather than many.
  - No `<` or `>` anywhere: YouTube refuses them as invalid characters.

Then report in one message: the delivery folder and its `open` command, the specs, the
YouTube title, description and tags (when there is a `-youtube.txt`) in a fenced block each, ready to paste, what was verified and how,
and the one limitation worth knowing, not a list of everything that went right.
The work folder's path and size go on the last line, with what happens to it.

**The work folder waits for the release, then goes to the Trash, and never by hand.** Its `src/` is
the product's film kit until the kit is committed (release-film §5), so when the user says the film
is out:

```sh
DRY=1 node deliver.mjs trash ~/Downloads/<name>-work --kit <repo>/scripts/film   # what would be lost
node deliver.mjs trash ~/Downloads/<name>-work --kit <repo>/scripts/film
```

- It takes only a folder in the work root (`~/Downloads` unless `workRoot` says otherwise) whose name ends in `-work` and that holds a film's source:
  a delivery folder is refused by construction. A film begun before the work root changed is
  judged against the root it is in: `--root <that folder>`.
- **Every source file must be safe**: its content reachable from a remote branch of the kit's
  repository, at any path and in any commit, so a kit edited after the film, or reorganised,
  still counts. Source is code wherever it sits, and every other file in the page's own folder: a
  picture, a font or a track the page uses exists nowhere else either. A file the kit's
  `.gitignore` ignores is generated and skipped, so a kit says there what it can make again
  (frames, assets a tool writes); what the tools write to be looked at (folders named `stills*`,
  `sheet*`, `looks*`, `poster*`, `drafts*`, and `contact*.png`, `sheet*.png`, `looks*.png`) is skipped too. Every render that
  is not a draft must have been delivered, and its delivered copy must still be in place with the
  bytes it left with: a copy deleted or replaced later no longer counts. A loose file at the top
  of the folder (a poster, notes, a track) must have been delivered as well. What fails is listed,
  with why (not in the kit, differs, not committed, not pushed, delivered copy gone, kept
  nowhere), and refused.
- **The folders beside the source are not judged**: `trash` prints each with its file count and
  size (`beside the source, not checked: codex/ 2 files, 8.1 MB · stills/ 40 files, 31.0 MB`).
  Read that line to the user before the folder goes: a generated picture's original or a recording kept there
  is in no kit.
- Measured on two real kits: one work folder had 15 of 17 source files in its kit, one generated
  file skipped, and one data file kept nowhere else; the other had its final page only in the
  kit's history (edited after the film) and five older versions nowhere. That list is the user's
  decision: show it, and pass `--discard` only on their word. Committing the kit first is the
  answer for a product that gets a film at every release; a public repository keeps no kit
  unless the user says so (release-film §5).
- Old folders from before the split: deliver their finished files first, then rename the folder
  `<name>-work`, then `trash`. The move is `/usr/bin/trash`: the folder can still be taken back
  out of the Trash.
- Ask before running it for real. A background job never throws a work folder away on its own.

## Tooling notes

- `page.setContent()` cannot show `file://` images (about:blank origin): write the HTML
  to a file and `goto` it — `contact.mjs` does.
- **`fx.js` is a classic script, not a module**: Chrome refuses module scripts over
  `file://` (CORS, origin 'null'), and the page is opened from disk.
- Self-host the brand fonts (woff2 beside the page) and load every face before the first `seek`:
  `TYPE.load(family, faces, 'fonts/')` registers and awaits them all (a face left to load on first
  use draws that frame in the fallback). The kit's own fonts are in `template/fonts/`, each with its
  OFL licence, which travels with it.
- Times are separate arguments. Under zsh a variable holding `0 1.5 4` does not split,
  `render.mjs` receives one argument and writes a single `t00NaN.png`: use an array.
- ffmpeg 7+ removed `-vsync`; extract frames with `-fps_mode passthrough`.
