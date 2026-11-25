# Manovella — working in this repository

Manovella is a film engine and a Studio for Claude Code: the skills `site-promo-film` and
`release-film`, and the command `/manovella:studio`.

- **One version, three places**: `plugins/manovella/.claude-plugin/plugin.json`, the `plugins[]`
  entry in `.claude-plugin/marketplace.json`, and `studio/studio.json`. Bump all three with every
  change to what ships, `plugins/manovella/` (patch for a fix, minor for a feature), or
  `plugin update` has nothing to fetch; `studio/selftest.mjs` fails when they disagree. Then
  `claude plugin validate plugins/manovella` and `claude plugin validate .`. A change to the
  promo site alone (`site/`, `scripts/site.mjs`) ships nothing and bumps nothing.
- **Other agents**: Codex and Copilot CLI install the plugin from the same marketplace. Gemini CLI
  installs an extension, `manovella-gemini.tar.gz`, that `scripts/gemini-pack.mjs` builds from the
  skills and `gemini/commands/` (the manifest's version is `plugin.json`'s, written at build time)
  and `.github/workflows/gemini-extension.yml` attaches to every GitHub Release. Gemini takes a
  release's asset only when it is the only one: attach nothing else to a release. Without it a
  Gemini install fails, so a release made by hand carries it from the start:
  `node scripts/gemini-pack.mjs` then `gh release create <tag> manovella-gemini.tar.gz …`. A command added
  to `plugins/manovella/commands/` gets its Gemini twin in `gemini/commands/manovella/`.
- **The promo site**: `node scripts/site.mjs serve` builds `site/` into `_site/` with the engine's
  own files and serves it at `http://localhost:4173/`. Vercel publishes it at
  `https://manovella.mov/` from `main` (`vercel.json`: the same build, `/guide` → `/guide/`), and
  gives every pull request a preview behind Vercel's login. Absolute links name that domain.
  - Hand-written static HTML: the home (`index.html`, `site.css`, `site.js`) and the guide
    (`guide/`, whose sidebar and topbar `guide/docs.js` builds from `NAV`; a new page goes in
    `NAV`, the pager at both ends and `sitemap.xml`). Every page links `base.css` (faces and
    palette); the build copies the faces it names and every `img/…` a page names from the
    engine's `docs/`.
  - Written by the build, never by hand: the `FAQPage` JSON-LD (from the home's `#faq`), the
    guide's version (`%%VERSION%%`, from `plugin.json`) and, on Vercel's builds only
    (`VERCEL` set), the Web Analytics script before every page's `</body>` but `demo/`'s. The build fails when the home's
    catalogue counts disagree with `studio/schema.json`.
  - Scroll reveals (`data-reveal`: `rise` for text, `morph` for cards, `lift` for big blocks;
    `data-scope`, `data-stagger`): the
    served page is at rest, a scope is armed only when measured entirely off screen after the
    first paint, and every hiding rule requires `data-armed`. Poses use `translate`/`scale`, never
    `transform`. The springs are the author's other sites' generated block, copied: never edit
    them by hand. Measure a scroll, not only the load.
  - The site is the publisher's page, so unlike the plugin it carries the publisher's links
    (Undolog's products, socials, the sponsor wall, the legal line). A new sponsor goes on the
    wall in `index.html`. The Product Hunt badge shows once its post id is in `#ph`.
  - It writes nothing to the browser's storage and sets no cookie: `guide/privacy.html` says so,
    and lists every third party a page loads from. Change both together. Vercel's analytics
    script keeps that true only while no page calls its `identify` (it then stores the visitor
    under `__va_attribution` in `localStorage`): never add one.
- **Verify** with `.claude/skills/verify/SKILL.md` (a Claude Code skill; any agent can follow the
  file) — no full film, ever; after a Studio change run
  `studio/selftest.mjs --shots <dir>` and look at the shots, and see a CSS or JS change in
  `Manovella.app` too (WebKit, not Chrome).
- **The window kit** (`studio/window/`) is generic: a small macOS app that hosts a local web page in
  a WKWebView, which any Studio-like tool could reuse. A fix to `main.swift`, `build.sh` or
  `probe.swift` stays free of anything Manovella-specific.
- **Keep the repository free of any one person's environment** (the publisher's links aside: the
  promo site's; the README's sponsor banner, its Sponsor section and its glancecard card, as the
  publisher's other READMEs have them; and the Studio's About, `studio/about.json`, with its sponsors
  and the maker's other apps, as FinderGit's and Netfox's About have them): paths, accounts,
  products, quotes.
  Examples use a neutral product (Acme), and optional integrations are configured through settings,
  never hard-coded.
- **Git**: one branch and one PR per change; a maintainer merges. No AI attribution in commits or
  PRs.
- **This file is the instructions for every agent**: Codex reads it directly, Claude Code through
  `CLAUDE.md`, which only imports it. Edit this one.
