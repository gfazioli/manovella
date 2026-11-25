# Guided mode: a first film, one question at a time

Read this when a film skill is invoked with `?` or `help`, or with nothing at all while nothing in
the conversation says which film to make and the Studio cannot open. It teaches the skill by using it: what it makes, what a
request looks like, a brief built from the user's answers, and then the one-line request that
would have said all of it. Speak the user's language; the example requests below are meant to be
said in any language, and the user's own words are what the skills trigger on.

**The Studio is the visual version of this mode** (SKILL.md, Studio): offer it first, in one line,
whenever the session has a screen. These questions are for when it cannot open, or when the user
would rather answer in the terminal.

**Nothing is rendered in this mode.** A guided brief ends where site-promo-film §0 ends (release-film
§1 for a release): storyboards, and a wait for the pick. The user asking how the skill works is not
the user asking for a film: a film is made only when it is asked for.

## 1 — What it makes: one short paragraph

- A film rendered as code from a product's real brand and UI. A **promo**: a loop of 6–30 s, or a
  film of 1–5 minutes in chapters. A **release film**: what one version changed, shown changing in
  place.
- What arrives: the video in every format and aspect asked for, a cover for each, and a chapter
  list for a long film, in a folder of its own in the work folder (`~/Downloads` unless Settings says otherwise), ready to move. Everything made
  along the way stays in a `-work` folder beside it, and goes to the Trash once the film is out.
- The steps, each one waiting for the user: brief → three storyboards → a contact sheet of stills →
  the render → the delivery. The render runs cool, so a 30 s film takes about 5–15 minutes.

## 2 — Requests that work

Show five or six, adapted to what is in front of you: a product the workspace is about, a URL from
the conversation, the latest tag of a repository that is open. For example:

- *Make a 15-second promo loop of https://example.app: premium, dark, no music.*
- *A 60-second film of the app in chapters, one per feature, 16:9 for YouTube.*
- *A release film for 2.4 from the v2.4.0 tag: the three changes that show best, 16:9 plus a square cut.*
- *A 9:16 teaser for social, 10 s, kinetic type on the site's own headline.*
- *A 6-second GIF loop for the README: the terminal typing the install command, 960 px wide.*
- *Storyboard B with A's ending* · *show me the looks sheet first* · *just a fast draft of the whole film*.

README.md beside this file has the full list, grouped by moment: a first film, a release, the
review rounds, other formats, delivery and cleanup.

## 3 — The questions

The agent's own question tool where it has one (AskUserQuestion in Claude Code), two rounds of at
most four questions, the default first in each and marked "(Recommended)". Without one, ask the same
questions as one numbered list with the default in brackets, and wait.

**Round 1**

1. **What**: a promo of a product · a release film · change a film already made (open its work
   folder and continue there) · just learning (stop after §2 and §5).
2. **Which product**: options from what is on disk (the workspace's repositories, a site's URL
   already in the conversation); "Other" takes a URL.
3. **Length**: a 15 s loop (Recommended) · a 30 s loop · a 60–90 s film in chapters · 3–5 minutes.
   For a release film ask instead which version (default: the latest tag) and let the length follow
   from the changes, about 6–8 s each plus the version card.
4. **Shape**: 16:9 plus a square cut (Recommended) · 16:9 only · 9:16 vertical · 1:1 only.

**Round 2**

1. **Tone**: premium and cinematic · Swiss and minimal · bold and energetic.
2. **Look**: decide on a looks sheet of the first real frame (Recommended) · the product's kit, when
   it has one · light (paper, mesh, caustics, dunes) · dark (night, studio, aurora, floor) · a picture
   of the user's own (a path they give).
3. **Sound**: none (Recommended: release clips autoplay muted) · a track of the music library's
   (when a library is set: SKILL.md, Studio) or a royalty-free one the user gives (its beat is measured, and the cuts
   land on it) · a new track Gemini makes from a prompt I write · a metronome, to hear whether the
   cuts land on the beat. And a voice-over, any film's: none (Recommended for a loop) · a voice model
   (English: Orpheus "leah" for a promo; Italian: Kokoro "if_sara") · a Mac voice (another language), with subtitles or not.
4. **Files**: .mp4 (Recommended) · plus .webm for a web page · plus ProRes .mov for an editor · plus
   a GIF for a README.

Everything not asked keeps its default from site-promo-film §0 (release-film §1): fps, resolution,
accent, format, reference, and where it goes. A logo or other asset the product's sources lack is
asked for by name, never made up (SKILL.md §1).

## 4 — The request they could have typed

Say the brief back as one line in the user's language — for example *"a 30 s promo loop of
example.app, 16:9 plus a square cut, premium, look chosen on a sheet, no music"* — and tell them
that line alone starts here next time. Then carry on at site-promo-film §0 from the storyboards
(release-film §1 for a release): three storyboards on three formats, a recommendation, and a wait.

## 5 — `?` with a topic

`? looks`, `? formats`, `? parts`, `? transitions`, `? render`, `? delivery`, `? release`, `? heat`:
answer just that, from README.md in a few lines, with one example request. Where README shows a
picture (the looks, the formats, the parts, the transitions), copy it to `~/Downloads` as
`film-<topic>.jpg` and end with `open ~/Downloads/film-<topic>.jpg`.
