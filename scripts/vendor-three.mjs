// Builds the three.js a film's page loads: plugins/manovella/skills/site-promo-film/template/three/three.min.js,
// with three's LICENSE beside it. Run it to move to another three.js release:
//
//   node scripts/vendor-three.mjs            build from the pinned release, write the two files
//   node scripts/vendor-three.mjs --check    build it again and compare with the committed file (exit 1 on a difference)
//
// Why a build at all. A film's page is opened from disk, and Chrome refuses module scripts over file://
// (fx.js's header), while three.js ships as ES modules only. So the modules a 3D shot needs are bundled
// into ONE classic script that sets a global THREE: the renderer and the scene graph from three's own
// build, GLTFLoader and RoomEnvironment from its examples. Only the names listed below are exported, so
// what nothing reaches is left out (647 KB against 798 KB for everything, minified).
//
// Pinned, and checked: the release comes from npm (`npm pack`), its tarball must match the sha512 npm
// publishes for it (INTEGRITY), and the bundler is a pinned esbuild run through npx. Neither is
// installed in the repository, and nothing here runs on a user's machine: the plugin ships the built file.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.187.0';
const INTEGRITY = 'sha512-Qiu7R+Cmh8CstZsY1uJOSWnVlfo7ZtNLV7mF8Jltk3LB3AtDu9cRZlcnRKkAk8Y4z6KKw35z7Y7Urd7jWY8etA==';
const ESBUILD = '0.28.2';
// what space.js uses, and what a shot written by hand reaches for: a few primitives, the lights, the
// materials glTF maps to. A name added here is in the next build.
const CORE = `WebGLRenderer Scene Group Object3D Mesh PerspectiveCamera OrthographicCamera
  AmbientLight DirectionalLight HemisphereLight PointLight SpotLight
  MeshStandardMaterial MeshPhysicalMaterial MeshBasicMaterial ShadowMaterial
  BoxGeometry SphereGeometry PlaneGeometry CylinderGeometry CircleGeometry TorusGeometry CapsuleGeometry
  BufferGeometry BufferAttribute Float32BufferAttribute
  Color Vector2 Vector3 Vector4 Quaternion Euler Matrix4 Box3 Sphere MathUtils
  AnimationMixer AnimationClip PMREMGenerator Texture CanvasTexture
  SRGBColorSpace LinearSRGBColorSpace NoToneMapping LinearToneMapping ACESFilmicToneMapping AgXToneMapping NeutralToneMapping
  PCFShadowMap VSMShadowMap FrontSide BackSide DoubleSide REVISION`.split(/\s+/);

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugins', 'manovella', 'skills', 'site-promo-film', 'template', 'three');
const check = process.argv.includes('--check');
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.error?.message || r.stderr || 'exited ' + r.status}`);
  return r.stdout;
};

const work = mkdtempSync(join(tmpdir(), 'vendor-three-'));
try {
  run('npm', ['pack', `three@${VERSION}`, '--silent'], work);
  const tgz = join(work, `three-${VERSION}.tgz`);
  const got = 'sha512-' + createHash('sha512').update(readFileSync(tgz)).digest('base64');
  if (got !== INTEGRITY) throw new Error(`three@${VERSION} from npm is not the release pinned here:\n  ${got}\n  ${INTEGRITY}`);
  run('tar', ['xzf', tgz], work);
  mkdirSync(join(work, 'node_modules'));
  symlinkSync(join(work, 'package'), join(work, 'node_modules', 'three'), 'junction');
  writeFileSync(join(work, 'entry.mjs'), [
    `export { ${CORE.join(', ')} } from 'three';`,
    "export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';",
    "export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';",
  ].join('\n'));
  const banner = `/* three.js ${VERSION} (r${VERSION.split('.')[1]}), https://threejs.org — MIT, Copyright 2010-2026 three.js authors: see LICENSE beside this file. Built by scripts/vendor-three.mjs of the Manovella repository: a classic script that sets THREE, with GLTFLoader and RoomEnvironment. */`;
  run('npx', ['--yes', `esbuild@${ESBUILD}`, 'entry.mjs', '--bundle', '--format=iife', '--global-name=THREE', '--minify', '--target=es2022',
    '--legal-comments=none', '--log-level=warning', `--banner:js=${banner}`, '--outfile=three.min.js'], work);
  const built = readFileSync(join(work, 'three.min.js'));
  if (check) {
    const have = readFileSync(join(OUT, 'three.min.js'));
    const same = built.equals(have) && readFileSync(join(work, 'package', 'LICENSE')).equals(readFileSync(join(OUT, 'LICENSE')));
    console.log(same ? `three.min.js is three@${VERSION} as this script builds it (${built.length} bytes)` : 'three.min.js or its LICENSE differs from what this script builds: run it without --check');
    process.exitCode = same ? 0 : 1;
  } else {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'three.min.js'), built);
    copyFileSync(join(work, 'package', 'LICENSE'), join(OUT, 'LICENSE'));
    console.log(`three@${VERSION} → ${join(OUT, 'three.min.js')} (${built.length} bytes), and its LICENSE`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
