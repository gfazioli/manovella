// What differs between macOS, Linux and Windows for the code that runs from the skill's own folder
// (the Studio, settings.mjs): where settings and caches go, where Chrome is, and how an address is
// opened. macOS keeps what it did before this file. The scripts a film copies into its src/
// (render.mjs, deliver.mjs…) import nothing, so they carry their own few lines of the same.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

export const MAC = platform() === 'darwin', WIN = platform() === 'win32';
const HOME = homedir(), env = process.env;

/** Manovella's settings folder (settings.json, prefs.json): Application Support, %APPDATA%, or XDG's config. */
export const configDir = () => (MAC ? join(HOME, 'Library', 'Application Support', 'manovella')
  : WIN ? join(env.APPDATA || join(HOME, 'AppData', 'Roaming'), 'manovella')
    : join(env.XDG_CONFIG_HOME || join(HOME, '.config'), 'manovella'));
/** Its cache folder (pictures converted, samples, the Studio's runs and Chrome profile): Caches, %LOCALAPPDATA%, or XDG's cache. */
export const cacheDir = () => (MAC ? join(HOME, 'Library', 'Caches', 'manovella')
  : WIN ? join(env.LOCALAPPDATA || join(HOME, 'AppData', 'Local'), 'manovella', 'cache')
    : join(env.XDG_CACHE_HOME || join(HOME, '.cache'), 'manovella'));

/** The user's Downloads or Pictures folder: on Linux the desktop's own (xdg-user-dir), which a localised
 *  desktop names otherwise (~/Scaricati, ~/Immagini); elsewhere, and where it says nothing, ~/Downloads, ~/Pictures. */
export function userDir(kind) {
  if (!MAC && !WIN) {
    const x = spawnSync('xdg-user-dir', [kind === 'pictures' ? 'PICTURES' : 'DOWNLOAD'], { encoding: 'utf8' });
    const dir = x.status === 0 && x.stdout.trim() ? resolve(x.stdout.trim()) : HOME; // a folder switched off: the home, with a slash
    if (dir !== HOME) return dir;
  }
  const own = join(HOME, kind === 'pictures' ? 'Pictures' : 'Downloads');
  // Windows with OneDrive's folder backup keeps Pictures there
  if (WIN && kind === 'pictures' && !existsSync(own) && env.OneDrive && existsSync(join(env.OneDrive, 'Pictures'))) return join(env.OneDrive, 'Pictures');
  return own;
}

/** A program on the PATH, as its full path (with Windows' extensions), or null. */
export function which(name) {
  const exts = WIN ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const d of (env.PATH || '').split(delimiter).filter(Boolean)) {
    for (const x of exts) { const p = join(d, name + x); try { if (statSync(p).isFile()) return p; } catch { /* not here */ } }
  }
  return null;
}

/** The installed Google Chrome (or Chromium), for a window of the Studio's own; rendering finds
 *  Chrome through Playwright's channel 'chrome' instead. */
export function findChrome() {
  if (MAC) {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(HOME, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/Applications/Chromium.app/Contents/MacOS/Chromium'].find((p) => existsSync(p)) || null;
  }
  if (WIN) {
    return [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean)
      .map((d) => join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')).find((p) => existsSync(p)) || null;
  }
  // a snap's Chromium cannot keep a profile under ~/.cache: the default browser opens the Studio instead
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) { const p = which(n); if (p && !p.startsWith('/snap/')) return p; }
  return null;
}

/** An address in the default browser, without waiting: macOS's open, Windows' explorer, Linux's
 *  xdg-open. False where there is nothing to open it with (no desktop): say the address instead. */
export function openInBrowser(url) {
  const cmd = MAC ? 'open' : WIN ? 'explorer.exe' : 'xdg-open';
  if (!MAC && !WIN && !which(cmd)) return false;
  const p = spawn(cmd, [url], { stdio: 'ignore', detached: true });
  p.on('error', () => {}); // gone between the look and the start: the address was printed already
  p.unref();
  return true;
}
