# studio-window

A Studio — a local tool whose page a Node server serves on 127.0.0.1 and opens in a window — shows up in
the Dock as one more **Google Chrome** when that window is a Chrome app window. This kit makes it an app
of its own instead: the same page in a WKWebView, under the Studio's name, version and icon in the Dock,
the app switcher and the About panel. It is a window and nothing else; the Studio's server still serves
the page and decides when the session is over.

| File | What it is |
| --- | --- |
| `main.swift` | the window, the same for every Studio; what differs comes from its Info.plist |
| `build.sh <studio folder> [<destination>]` | builds `<name>.app` from `main.swift` and the Studio's `studio.json` + `icon-1024.png`, into `~/Applications` |
| `probe.swift <url> <steps.json> <outDir>` | drives a Studio's page in a WKWebView without showing it: steps (wait, load, run a script, snapshot) and every error of the page. A Studio's own test runs in headless Chrome; this is the engine its window uses |
| `make-icon.swift <glyph> <top> <bottom> <highlight> <out.png>` | draws a 1024 px icon on a squircle in the Studio's colour: `gauge`, `chat`, `cube`, `bars`, `film` or `bone` in white with one part lit, or `svg:<file>` — the project's own mark (its favicon), painted whole in the highlight colour |

## What a Studio provides

Beside its server, in the folder `build.sh` is pointed at:

- **`studio.json`**, the Studio's identity, read by its page too:

  ```json
  { "name": "Example Studio", "id": "example-studio", "version": "1.1.0",
    "ping": "/api/ping", "hint": "Example Studio opens from …", "width": 1360, "height": 900 }
  ```

  `name`, `id` and `version` are required. `version` is the Studio's own semver, shown by its page and
  in the app's About panel; bump it with every change to the Studio (patch for a fix, minor for a
  feature). `ping` is the GET the app sends every 10 s with `?k=<key>` (`""` for none); `hint` is what
  the window says when it is opened from the Dock with no URL. `appearance`, `"dark"` or `"light"`,
  fixes the window's appearance (its title bar, and the page's `prefers-color-scheme`) for a Studio
  drawn in one scheme only; without it the window follows the Mac's. `pageItems` lists app-menu
  items the page answers itself, `[{ "id": "about" }, { "id": "settings", "title": "Settings…", "key": "," }]`:
  each sends the page a `studio:menu` event whose `detail.id` is the item's id (lowercase letters, digits
  and dashes). `about` takes the place of the system's About panel (icon, name, version), which stays
  when it is absent; the others follow it in the app menu, with their title and key (⌘ plus it).
- **`icon-1024.png`**, drawn with `make-icon.swift` and optimised (ImageOptim, when installed). Pick a glyph and a colour
  no other Studio uses: the point is telling them apart at Dock size.
- **A launcher that prefers the app**: when `~/Applications/<name>.app/Contents/MacOS/<name>` exists, spawn
  it with `--url <the page's URL>` where Chrome was spawned, keep the process, and treat its exit as the
  window closing; kill it with SIGTERM when the session ends. Otherwise fall back to Chrome, so a Mac
  without the app — a colleague's — works as before. A test that drives Chrome (`STUDIO_CHROME_ARGS`) or
  an env switch (`<STUDIO>_WINDOW=chrome`) keeps Chrome.

## How the window behaves

- Only the origin of the `--url` it was given loads inside (and its iframes); any other link opens in the
  default browser. Downloads go to `~/Downloads`, never over an existing file. `alert`, `confirm`,
  `prompt` and file inputs get native sheets.
- It pings the server itself every 10 s, because WebKit slows a hidden window's timers; App Nap is held
  off for the same reason. Three pings in a row with no answer mean the server is gone, and it quits.
- Closing the window quits the app. SIGTERM ends it quietly, with no "quit unexpectedly" report.
- Safari ▸ Develop shows its page (`isInspectable`), for something that misbehaves only here.

## Traps

- **One build per Mac, after every change to `main.swift`**: the bundle is not in git. A window already
  open keeps the build it started with.
- **The page runs in WebKit, not Chrome**: an API only Chrome has (`field-sizing`, some `Intl` and CSS
  features) degrades there. Look at the window itself, not only at a headless-Chrome screenshot.
- **The Dock may be hidden** (`defaults read com.apple.dock autohide`), so a screenshot of the screen does
  not show the icon. What the Dock shows comes from LaunchServices, which can be asked directly:
  `lsappinfo info -only name,bundleid,bundlepath "$(lsappinfo find pid=<pid>)"` must name the app, not
  Chrome.
- **The port changes every launch**, so the page's `localStorage` does not survive a restart in either
  window: state that must last belongs to the server.
