#!/usr/bin/env node
// Manovella as a Gemini CLI extension. Node built-ins, git and tar.
//
//   node scripts/gemini-pack.mjs [<out>.tar.gz]   the archive (default manovella-gemini.tar.gz)
//   node scripts/gemini-pack.mjs --check          built and checked, nothing kept
//
// The extension is the plugin's skills (skills/), the Studio's command (gemini/commands/ here:
// /manovella:studio) and a gemini-extension.json whose version is the plugin's, written here, so there
// is no fourth place to bump. .github/workflows/gemini-extension.yml attaches the archive to every
// GitHub Release: `gemini extensions install https://github.com/gfazioli/manovella` downloads the
// latest release's asset when it is the release's only one and its name says no platform, and
// `gemini extensions update` follows the releases. To try one locally: extract the archive into a
// folder and `gemini extensions install <folder>`.
//
// Why an archive, not the repository (measured with Gemini CLI 0.68.0): Gemini wants
// gemini-extension.json, skills/ and commands/ at the root of what it fetches and takes no subfolder,
// and it copies what it fetched with fs.cp, which turns a relative symlink (skills -> plugins/...) into
// an absolute path to the temporary folder it then deletes. Git on Windows checks symlinks out as text
// files too. So: real files (copyFileSync follows a link), copied from what git tracks (no
// node_modules, no built window app).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const OUT = resolve(argv.find((a) => !a.startsWith('--')) || 'manovella-gemini.tar.gz');

const dir = mkdtempSync(join(tmpdir(), 'manovella-gemini-'));
try {
  // the extension, written into dir: the tracked skills and commands, the licence, the manifest
  const { version, description } = JSON.parse(readFileSync(join(ROOT, 'plugins/manovella/.claude-plugin/plugin.json'), 'utf8'));
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '-z', '--', 'plugins/manovella/skills', 'gemini/commands'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const files = [...tracked.map((f) => [f, relative(f.startsWith('gemini/') ? 'gemini' : 'plugins/manovella', f)]), ['LICENSE', 'LICENSE']];
  for (const [from, to] of files) {
    mkdirSync(dirname(join(dir, to)), { recursive: true });
    copyFileSync(join(ROOT, from), join(dir, to)); // the mode too: the scripts stay executable
  }
  writeFileSync(join(dir, 'gemini-extension.json'), `${JSON.stringify({ name: 'manovella', version, description }, null, 2)}\n`);

  // what Gemini needs of it: both skills, the Studio, the command and its prompt
  const missing = ['skills/site-promo-film/SKILL.md', 'skills/release-film/SKILL.md', 'skills/site-promo-film/studio/studio.mjs', 'commands/manovella/studio.toml']
    .filter((f) => !existsSync(join(dir, f)));
  if (!missing.length && !/^prompt\s*=/m.test(readFileSync(join(dir, 'commands/manovella/studio.toml'), 'utf8'))) missing.push('the command\'s prompt');
  if (missing.length) throw new Error(`the Gemini extension ${version} lacks ${missing.join(', ')}`);

  if (CHECK) console.log(`ok   the Gemini extension ${version}: ${files.length + 1} files`);
  else {
    // the files at the archive's root, as Gemini reads them, owned by no one in particular (no user name
    // of the machine it was built on); on macOS (bsdtar), no AppleDouble ._ files beside them
    const owner = process.platform === 'darwin' ? ['--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root'] : ['--owner=0', '--group=0', '--numeric-owner'];
    execFileSync('tar', ['-czf', OUT, ...owner, '-C', dir, ...readdirSync(dir)], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    console.log(`${OUT}: the Gemini extension ${version}, ${files.length + 1} files`);
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
