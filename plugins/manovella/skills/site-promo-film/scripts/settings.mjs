// Manovella's user settings: settings.json in its own folder, ~/Library/Application Support/manovella
// (~/.config/manovella on Linux, %APPDATA%\manovella on Windows: platform.mjs; STUDIO_PREFS, for a test,
// names another). The Studio's Settings write
// it; the Studio and deliver.mjs read it. Every key is optional, and a folder that is not there counts
// as unset, so a missing or broken file means today's defaults everywhere.
//
//   projectFolders      folders whose git repositories (two levels deep) the Studio offers as products;
//                       unset: the parent of the repository the Studio runs in, its siblings
//   pictureFolders      folders whose most recent pictures the Studio offers as backdrops; unset: ~/Pictures
//   musicLibrary        a folder of the films' music: audio at its top, or in a folder per brand (or its audio/)
//   musicLibraryIgnore  folder names in it to skip
//   deliverToLibrary    true: finished films go into it too, <library>/<Brand>/video/<name>/ (default false)
//   workRoot            where a film's <name>-work and its delivery folder go; unset: ~/Downloads
//
// A command line or an environment variable still wins over the file, for one run: --roots or
// MANOVELLA_ROOTS, --out, MANOVELLA_MUSIC, FILM_DOWNLOADS (deliver.mjs's tests). An older file, from when the
// music library was the brand library (brandLibrary, brandLibraryIgnore), reads as the new keys, delivering
// into it as it did then, and is written with them at its first change.
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { configDir } from './platform.mjs';

export const HOME = homedir();
/** A path as typed, ~ expanded; and one for showing, the home folder as ~. */
export const untilde = (p) => (p === '~' ? HOME : typeof p === 'string' && /^~[\\/]/.test(p) ? join(HOME, p.slice(2)) : p);
export const tl = (p) => (p && (p === HOME || p.startsWith(HOME + sep)) ? '~' + p.slice(HOME.length) : p);
/** The folder settings the Studio's Settings show and change: true, a list of folders; false, one folder. */
export const MANY = { projectFolders: true, pictureFolders: true, musicLibrary: false, workRoot: false };

export const prefsDir = () => (process.env.STUDIO_PREFS ? resolve(untilde(process.env.STUDIO_PREFS)) : configDir());
const FILE = () => join(prefsDir(), 'settings.json');

/** The settings, or {} when the file is missing or unreadable. */
export function readSettings() {
  let s;
  try { s = JSON.parse(readFileSync(FILE(), 'utf8')); } catch { return {}; }
  return s && typeof s === 'object' && !Array.isArray(s) ? fromOlder(s) : {};
}
/** An older file's brand library as the music library, delivering into it as it did; the new keys win. */
function fromOlder({ brandLibrary, brandLibraryIgnore, ...s }) {
  if (brandLibrary != null && !('musicLibrary' in s)) Object.assign(s, { musicLibrary: brandLibrary, deliverToLibrary: s.deliverToLibrary ?? true });
  if (brandLibraryIgnore != null && !('musicLibraryIgnore' in s)) s.musicLibraryIgnore = brandLibraryIgnore;
  return s;
}
/** Merges `patch` into the file (a null value removes its key) and returns the result. The keys this
 *  module does not know, a hand-written musicLibraryIgnore say, are kept. Written whole, then renamed:
 *  a crash never leaves half a file. */
export function writeSettings(patch) {
  const s = { ...readSettings(), ...patch };
  for (const k of Object.keys(s)) if (s[k] == null) delete s[k];
  mkdirSync(prefsDir(), { recursive: true });
  writeFileSync(FILE() + '.tmp', JSON.stringify(s, null, 2) + '\n');
  renameSync(FILE() + '.tmp', FILE());
  return s;
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
/** A folder setting: its absolute path, ~ expanded, when it names a folder that is there; else null. */
export const folder = (v) => {
  if (typeof v !== 'string' || !v.trim()) return null;
  const p = resolve(untilde(v.trim()));
  return isDir(p) ? p : null;
};
/** A list of folders: the ones that are there, once each, in order. */
export const folders = (v) => (Array.isArray(v) ? [...new Set(v.map(folder).filter(Boolean))] : []);

/** Where the work folders and deliveries go: FILM_DOWNLOADS (a test's), else workRoot, else ~/Downloads.
 *  deliver.mjs has its own copy of this (it is copied into a film's src/ alone): change both together. */
export const workRoot = () => (process.env.FILM_DOWNLOADS ? resolve(untilde(process.env.FILM_DOWNLOADS)) : folder(readSettings().workRoot) || join(HOME, 'Downloads'));
