---
description: Open Manovella's Studio — choose a promo or release film's recipe, product, format, look, sound (your music library's tracks, a voice heard before it is chosen, subtitles) and output on live previews, then get the brief back for the storyboards
argument-hint: "[--product <path>] [--roots <dir>,…]"
---

Open the Studio: invoke the `manovella:site-promo-film` skill with the argument `studio $ARGUMENTS`, and follow its **Studio** section. Pass any `--product` or `--roots` given here on to `studio.mjs`.

Opening the Studio is the user asking for a film's brief, nothing more: nothing is rendered until the storyboards are picked and the stills seen.

- **Its window** is the Studio's own app where this Mac has built it, `~/Applications/Manovella.app` (`<the skill's dir>/studio/window/build.sh <the skill's dir>/studio`, once per Mac and after the kit or `studio.json` changes): its name, version and icon in the Dock instead of one more Google Chrome. Without it, a Chrome app window as before; `MANOVELLA_WINDOW=chrome` keeps Chrome. Every ending (`BRIEF`, `CANCELLED`, `CLOSED`, `TIMEOUT`) closes the window, and closing the window is `CLOSED`.
- **Its version** is Manovella's, one number in `studio.json`, `.claude-plugin/plugin.json` and the marketplace entry, shown beside its name in the sidebar: bump all three with every change, patch for a fix, minor for a feature, and run `studio/selftest.mjs` after (it checks they agree).
