// The film kit's own fonts: open-licensed families, self-hosted, so a film renders the same on
// every Mac and nothing is fetched while it renders.
//
//   node fonts.mjs add "<Family>" [<axes>] [--italic]   download its latin + latin-ext woff2 from
//                                                       Google Fonts and its licence from google/fonts
//   node fonts.mjs check                                every face and licence on disk, the manifest whole
//   node fonts.mjs list                                 the families, their axes and their size
//
// <axes> is the Google Fonts css2 spec after the colon, e.g. "wght@100..900" or
// "opsz,wght@9..144,100..900" (lowercase axes first, alphabetical). Without it the family's
// default instance is fetched. --italic adds the italic faces where the family has them.
// Files go to ../template/fonts/<slug>/, the manifest is ../template/fonts/fonts.json; a page loads
// a family with TYPE.load (type.js), which registers every face and waits for all of them.
//
// Only the latin and latin-ext subsets: Western and Central European text. A film in another
// script needs that subset added by hand. Every family here is SIL OFL 1.1: it may be bundled and
// redistributed, with its licence beside it (OFL.txt in the family's folder) and under its own name.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(HERE, '..', 'template', 'fonts');
const MANIFEST = join(DIR, 'fonts.json');
// css2 answers with woff2 and unicode-range subsets only to a browser it knows
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const SUBSETS = ['latin', 'latin-ext'];

const slugOf = (f) => f.toLowerCase().replace(/[^a-z0-9]+/g, '');
const load = () => (existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { note: '', families: {} });
const save = (m) => {
  m.note = 'Open-licensed families for film pages, latin + latin-ext subsets, written by scripts/fonts.mjs. Each folder holds its OFL.txt.';
  m.families = Object.fromEntries(Object.entries(m.families).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
};
async function get(url, binary = false) {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
}

async function add(family, axes, italic) {
  const slug = slugOf(family);
  const fam = family.replace(/ /g, '+');
  let spec = axes ? `${fam}:${axes}` : fam;
  if (italic) { // ital is the first axis: "ital,wght@0,100..900;1,100..900", or "ital@0;1" for a static family
    const [names, ranges] = (axes || '').split('@');
    spec = axes ? `${fam}:ital,${names}@0,${ranges};1,${ranges}` : `${fam}:ital@0;1`;
  }
  const css = await get(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`);
  const blocks = [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face \{([^}]+)\}/g)];
  if (!blocks.length) throw new Error(`no faces for ${spec}: ${css.slice(0, 200)}`);
  mkdirSync(join(DIR, slug), { recursive: true });
  const faces = [];
  for (const [, subset, body] of blocks) {
    if (!SUBSETS.includes(subset)) continue;
    const pick = (k) => (body.match(new RegExp(`${k}:\\s*([^;]+);`)) || [])[1]?.trim();
    const url = body.match(/url\(([^)]+)\)/)[1];
    const style = pick('font-style') || 'normal', weight = pick('font-weight') || '400', stretch = pick('font-stretch') || null;
    const file = `${slug}/${slug}-${style === 'italic' ? 'italic-' : ''}${weight.replace(/ /g, '-')}-${subset}.woff2`;
    writeFileSync(join(DIR, file), await get(url, true));
    faces.push({ file, style, weight, ...(stretch ? { stretch } : {}), unicodeRange: pick('unicode-range'), subset });
  }
  // the licence, from the family's own folder in google/fonts (OFL families live under ofl/)
  const ofl = await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${slug}/OFL.txt`);
  if (!/SIL OPEN FONT LICENSE/i.test(ofl)) throw new Error(`${family}: the licence found is not the OFL`);
  writeFileSync(join(DIR, slug, 'OFL.txt'), ofl);
  const copyright = (ofl.match(/Copyright[^\n]*/) || [''])[0].trim();
  const m = load();
  m.families[family] = { slug, license: 'OFL-1.1', copyright, axes: axes || null, source: `https://fonts.google.com/specimen/${fam}`, faces };
  save(m);
  const bytes = faces.reduce((s, f) => s + statSync(join(DIR, f.file)).size, 0);
  console.log(`${family}: ${faces.length} faces, ${(bytes / 1024).toFixed(0)} KB — ${copyright}`);
}

function check() {
  const m = load();
  let bad = 0;
  for (const [family, f] of Object.entries(m.families)) {
    for (const face of f.faces) if (!existsSync(join(DIR, face.file))) { console.log(`missing: ${face.file}`); bad++; }
    if (!existsSync(join(DIR, f.slug, 'OFL.txt'))) { console.log(`no licence: ${family}`); bad++; }
  }
  console.log(bad ? `${bad} problems` : `${Object.keys(m.families).length} families, every face and licence present`);
  process.exit(bad ? 1 : 0);
}
function list() {
  const m = load();
  let total = 0;
  for (const [family, f] of Object.entries(m.families)) {
    const b = f.faces.reduce((s, x) => s + statSync(join(DIR, x.file)).size, 0); total += b;
    console.log(`${family.padEnd(24)} ${(f.axes || 'static').padEnd(40)} ${String(f.faces.length).padStart(2)} faces ${(b / 1024).toFixed(0).padStart(5)} KB`);
  }
  console.log(`total ${(total / 1024).toFixed(0)} KB`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'add') await add(rest[0], rest[1] && !rest[1].startsWith('--') ? rest[1] : null, rest.includes('--italic'));
else if (cmd === 'check') check();
else if (cmd === 'list') list();
else { console.log('node fonts.mjs add "<Family>" [<axes>] [--italic] | check | list'); process.exit(2); }
