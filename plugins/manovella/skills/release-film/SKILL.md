---
name: release-film
description: Make a short "what's new" film for a release that changes features or UI — the changed surfaces recreated as vector from the app's own source at the release tag, shown changing in place with a real cursor and real shortcuts, rendered as code on the site-promo-film engine (a pure seek(t), 16-subframe motion blur, an exact loop). Use only when the user asks for a release video in words — never offered as a step of a release — for a release that ships something a person will see or do differently: a release video, update video, changelog or "what's new" clip, or a video for the release notes, the docs page, a newsletter or social posts. Not for a general product promo (site-promo-film), and not for a release of fixes with nothing on screen to show.
argument-hint: "[? | the product and version]"
---

# Release film: what changed, shown changing

A promo sells the product; a release film shows **one release's delta** to people who
mostly know the product already. Same engine, different job: the state *before* matters,
every claim is bounded by a tag, and the film is one episode of a series.

**This skill extends `site-promo-film`, in the sibling directory `../site-promo-film/`.
Read its SKILL.md first**: direction, the look, bans, build rules, canvas traps, stills
before the render, render and verify all apply unchanged. This file carries only what a
release adds.

| File | What it is |
| --- | --- |
| `template/release.html` | The engine plus a 16 s release demo: version card → the app as it was → a new control lands in the toolbar and is clicked (the list re-sorts, moving rows lift) → a shortcut on keycaps opens a new surface (a pill that opens into a panel) → the rest of the changelog → the update path clicked in a glass menu → back to the version card. Wide and square layouts from one file; each featured change can own a light. |
| `../site-promo-film/template/film.js` | The stage (subpixel jitter per subframe: nothing steps or shimmers in slow moves), `FILM.draw` for icons and symbols, the timeline for a long film, effects. The template loads it; documented at its top and in site-promo-film §5. |
| `../site-promo-film/template/parts.js` | Vector parts: windows, a browser, a terminal, devices, keycaps, a switch, a ring. |
| `../site-promo-film/template/fx.js` | The look — backdrop, light, grain, glass, click ripples — shared with the promo template, which documents it (its §4). |
| `../site-promo-film/scripts/render.mjs`, `contact.mjs`, `beats.mjs` | The renderer, the contact sheet and a soundtrack's beat (site-promo-film §7, The beat), used as they are: `PAGE=release.html node render.mjs …`. |
| `../site-promo-film/scripts/clickcheck.mjs` | Is every click seen (§3b): the camera still and the cursor at rest at each of the page's `CLICKS`. `node clickcheck.mjs release.html`, exit 1 on a click nobody will see. |
| `../site-promo-film/scripts/deliver.mjs` | The finished films and their covers into a folder of their own, then the work folder to the Trash once its kit is safe (site-promo-film §8). |

Copy the template (or the product's kit, §5), `film.js`, `parts.js`, `fx.js` (and `type.js` with the
fonts it sets, for headlines in a type.js style) and the four scripts
into the work folder's `src/`, `~/Downloads/<product>-<version>-whats-new-work/src/` (`~/Downloads` is the work root unless the settings say otherwise: site-promo-film, the Studio section), and
`npm i playwright-core` there. The demo renders in 69 s at 16 subframes on 8 workers, 171 s in a
dithered look (`night`); measured wide.

Invoked with `?` or `help`, or with nothing while nothing in the conversation names a release: the
guided mode, `../site-promo-film/guide.md`. It asks which version and walks the brief; nothing is
rendered in it. The Studio (site-promo-film, Studio) writes a release brief too: `kind: release`, the
version in `release.tag`; it answers §1's questions.

## 0 — Is there a film in this release?

Only asked once the user has asked for a film: a release command does not raise it, and nothing
here is proposed on its own initiative. Renders follow site-promo-film §7's
thermal defaults.

- **Build the list from the tag, never from memory**: `git log --oneline <prev-tag>..<ref>`,
  the merged PRs, the draft release notes. A film made from "what I think is in it" shows a
  feature that slipped, or one from the release before.
- It qualifies when something a person **sees or does** differently ships: a new surface, a
  new control, a redesign, a new shortcut. Fixes, speed and internals do not; say so in one
  line and stop. A film of a release with nothing to show is a title card with a number on it.
- **Feature at most three changes.** The rest go in the changelog roll, verbatim from the
  notes, or nowhere. Five featured changes means three seconds each, which is a slideshow.

## 1 — Ask, then wait

Look first: the product's previous films (its kit, §5), the project's instructions for where
release media goes, and its demo mode or fixtures. An asset neither the kit nor the source at
the tag holds (the icon's master, a logo as vector) is asked for in the same message, never
made up (site-promo-film §1). Then ask in one message, each with a
default:

1. **Release and ref** to film (default: the tag; `main` when it is not tagged yet, then
   re-check at the tag).
2. **Featured changes** (default: my pick from the log, one line each on why it shows well).
3. **Duration** (default: ~6–8 s per featured change plus ~3 s of version card, 15–30 s; double
   that once there are clicks to see, §3b). A film of 30 s or more that goes on YouTube gets
   chapters (§6); a shorter one cannot: YouTube wants three, the first at 0:00, each at least 10 s.
4. **Formats**: a 16:9 master (default), and a square cut as a second layout.
5. **Look** (default: the kit's; for a first film, a looks sheet of one real frame, as in
   site-promo-film §4).
6. **Where it goes** (default: `<product>-<version>-whats-new/`, delivered as site-promo-film §8
   says, holding only the finished films and covers, while their `-work` folder stays in
   the work root (`~/Downloads` by default); the project's own place for release media when its instructions name one).
7. **Music**: none by default. Release clips autoplay muted, so the text carries everything.

Then **one storyboard** on the beat grid when the product has a kit (the style is settled,
only the content is a choice), **three** when this is its first film. Wait for a go.

## 2 — Source: the app, at the ref

- **Read the code at the ref, not the working tree**: `git show <ref>:<path>`. View code
  gives the strings, symbols, spacing and colours; the project's scripted screenshots (demo
  mode, fixtures) give proportions. Never a capture with real data in it.
- **The before-state comes from the previous tag's source.** Recreated from memory it is
  wrong in exactly the detail the release changed.
- **Every string on screen exists at the ref**: `git grep -nF -- '<string>' <ref>` must hit,
  for UI text, menu items, and the shortcut on a keycap (grep the binding, not the docs).
  Film in the source language.
- **Headlines are the release notes' benefit lines**, a few words: not PR titles, and nothing
  the release does not do. They are public claims.
- **A change that ships off by default needs its switch on screen.** Otherwise the film
  advertises something the viewer cannot find.

## 3 — Storyboard patterns

- **Open and close on the version card**: icon, name, "What's new in X.Y", the version in the
  accent colour. It is frame 0 and the last frame, about 1.5 s on each side of the loop point.
- **Change in place.** Show the surface as it was for a beat, then let the change happen *on
  it*: the control lands in the toolbar, the list re-sorts, the panel grows a section. No
  before/after labels and no split screen: the transition is the explanation. Punch the camera
  in as the change lands, pull back as it is used.
- **A new surface grows out of what opens it**: the click, the menu item, the shortcut. A
  shortcut goes on keycaps in the headline slot, pressed on the beat the surface answers.
- **One featured change, one headline, one interaction.** The headline enters as the change
  lands, not before: the viewer sees it, then reads what it was.
- **A chapter can own a colour.** With a look that has lights, the look's `keys` recolour them
  as each featured change lands and bring the first colours back for the version card, as
  the demo does. Leave it out when the product's colours mean something (an account, a state).
- **The rest of the changelog** as a short roll in the headline slot, a label ("Also in X.Y")
  and three to five lines verbatim from the notes, one per beat. Only when the rest is worth
  naming.
- **Close on the update path, clicked for real**: the product's own route to the new version
  (a Check for Updates… menu item, a store button, the site's URL). Then the UI collapses back
  into the icon. In a menu, the highlighted row is the one under the cursor at that instant,
  computed from the cursor's own track, so passing over a row lights it as a real menu does.
- No progress bars, chapter counters or "NEW" badges: the headline change is the chapter break.
- **Change in place is the format, not the only one.** When the kit's last film already did it,
  vary: the notes opening into the screens they describe, the changed surface in 3D depth, a
  before/after `wipe` on the same frame, a tutorial of the new flow. site-promo-film §2 has the
  catalogue; a release film takes one and says which in its storyboard.
- **A major release can carry a long film** (1–3 min, one chapter per featured change, not a
  loop) on the timeline of site-promo-film §2b, beside the short clip for social posts.

## 3b — Every click is seen

A release film is mostly clicks, and a click is a beat the viewer has to see land. A 30 s
cut once played with its moves too fast and some clicks missing. Measured: two clicks fell
while the frame moved at 1255 and 1414 px/s, and most landed on a cursor still 20-45 pt from its
target. The 60 s cut timed by the rule below measured every click under 2 px/s and 1 pt.

- **The camera has arrived before the click.** Start a camera move at least about 1.3 s before the
  click it frames, and move on only once the UI has answered it.
- **The cursor rests before it presses**: give each move about two seconds on slow springs (f 0.85
  across, 0.75 down; a short hop can be quicker), so it sits still for half a second.
- **It stays through the press**, held long enough to see (down 0.05 s, up 0.14 s later), with a
  larger ring; the next move starts no sooner than 0.3 s after the press.
- **What a click opens never covers what was clicked**: a panel drops from under its item, a
  window grows from beside the notification it came from, a sheet closes 0.15-0.2 s after its
  button is pressed. The first 60 s master grew the shell over the clicked item at the press and
  hid it; the stills at exact times never showed it, frames pulled from the mp4 did.
- **Check it**: `node clickcheck.mjs release.html` before the go (it measures the camera on the
  clicked point, the travel before the press and during it; both templates pass), and after the
  render pull a frame from the mp4 at every click time (site-promo-film §7).
- **On an iPhone or an iPad** (the brief's `frame`, site-promo-film §0) a click is a tap: no arrow
  is drawn, and a finger shows only while it taps (a soft disc that presses, with the look's
  ripple). The page still declares `CLICKS`, and `curX(t)` / `curY(t)` are where the finger is:
  they jump to the next tapped point between taps and rest on it before and after each one, so
  `clickcheck.mjs` measures the taps exactly as it measures clicks, and a page with no `CLICKS`
  still exits 2. The rules above hold, the camera's above all.

## 4 — Layout: a slot and a free region

The template computes the camera instead of hand-tuning it. `fit(rect, head)` returns the
camera that makes a world rect fill the **free region** (beside the headline **slot** in
wide, below it in square, or the whole frame without a headline), capped at `zmax`. Three
rules, each measured while building the demo:

- **With a headline up, a close-up reaches back to the surface's own edge on the slot's
  side** (`toEdge`). Fit only the detail and the rest of the window slides under the
  headline, which then sits half on the canvas and half on the dark window.
- **In square, a close-up keeps the surface's full width**, or its row labels are cut at both
  edges of the frame.
- **The leaving title is drawn beneath the morphing shape**, so the window grows over it.
  Drawn on top, its fading letters print across the window for half a second.

A second aspect is a second layout, never a crop of the first: the page reads
`location.hash`, and `PAGE='release.html#square'` passes the hash through `render.mjs`. The
hash also takes the look, joined with `&`: `PAGE='release.html#square&look=night'`.

## 5 — The kit: every film of a product looks like one show

The first film for a product (or its site-promo film) produces a **kit**: fonts, colour
tokens, the icon as vector, the version card, the window chrome, the camera language, the
look (its preset and overrides: one `FX.look` line). Commit it with the product, where its
instructions say (otherwise propose a place, `scripts/film/` so far), before the work folder is
thrown away, so the next release starts from the kit rather than from the template: one
storyboard, only the content changes, and the series is recognisable. On the version card only
the number changes.

**What a kit keeps is the page, not the engine.** The engine is the skill's and is copied again
for every film. The page is the work: the product's surfaces as vector, every string sourced at a
tag, the timing that survived the review rounds, and a README of what those rounds taught. It is
kept so the next film changes only its content, and so a shipped film can be re-cut (a reworded
string, a 9:16 version, another poster) in minutes rather than rebuilt. Whether to keep it:

- **A product that gets a film at every release keeps its kit**, in its own repository.
- **A public repository keeps nothing unless the user says so**: a kit there would
  publish a copy of the engine and fonts whose licence has to travel with them. Ask; do not propose it.
- **A one-off film asks at delivery.** No is `deliver.mjs trash --discard`, once the user has seen
  the list of what goes.
- No images in a kit: symbols and icons are generated or copied by commands its README gives, and
  ignored (so there is no image to optimise).

**A kit made before `film.js` needs four edits** before its next film, or it keeps the
flicker seen in finished films: load `film.js`; `const STAGE =
FILM.stage(mainCtx)`; `STAGE.begin(opts)` first in `seek(t, opts)`; and `FILM.draw(ctx, img,
…)` for every `drawImage` of the icon or a tinted symbol (a symbol is a canvas, and Chrome
ignores the smoothing setting for canvases). A full-frame fill should overhang the frame by
2 px. Measured on a real 28 s kit with exactly these edits: its 14 worst blocks in slow
moves flicker 37–76 % less, at no render cost.

## 6 — Deliver with the release, not after it

- The film ships in the same motion as the release notes and the docs page. Render from the
  ref before tagging when you can, and re-check the strings (§2) against the final tag before
  delivering: a string reworded after the render is a re-render.
- **Outputs**: the master mp4; a **poster** per aspect (`render.mjs stills stills 0`, since frame 0
  is the version card the poster matches the loop); the square cut if asked. A film of 30 s or more
  declares `PROMO_META.chapters` (seconds, the first at 0, three or more, each at least 10 s:
  the template shows where), so the mp4 carries the marks and `deliver.mjs` writes
  `<name>-chapters.txt` for the YouTube description; one that does not declare them gets none. When a destination
  caps the size, encode a lighter copy from the master rather than re-rendering smaller.
- **Deliver them** with `deliver.mjs` (site-promo-film §8): the films, the posters renamed on the
  way (`stills/t00.00.png=<product>-<version>-whats-new-poster.png`), nothing else. Several
  storyboards shipped for different channels are `-A`, `-B`, `-C` in the same folder.
- **The work folder goes after the release**, through `deliver.mjs trash --kit
  <repo>/scripts/film`, which refuses while a source file of the film is not in the pushed kit. So
  the kit (§5) is committed first: for a product's first film the work folder *is* its kit.
- Where each file goes (release page, docs, newsletter, social drafts) is the project's
  decision: read its instructions. Never commit media into a repository outside its release
  flow.
- **A YouTube title, description and tags** go beside every film, as `<name>-youtube.txt`
  (site-promo-film §8): the release's headline in the title, its benefit lines and the upgrade
  guide's URL in the description, the version among the tags.
- **Report**: the specs, the YouTube title, description and tags ready to paste, the ref and commit every
  string was checked against, and what was verified (loopcheck, clickcheck, probe, frames extracted
  from the mp4 at every click time).
