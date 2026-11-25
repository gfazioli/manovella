// Is every click seen? For each click a page declares: how fast the clicked point moves ON SCREEN
// around it (the camera's motion alone), how far the cursor still travels just before it, and
// whether the cursor stays through the press. A click a viewer can see lands on a cursor at rest,
// under a camera at rest, and the cursor is still there while the button is down.
//
//   node clickcheck.mjs [page#hash]        default ./release.html; exit 1 if a click fails
//
// The page exposes, as the templates do: CLICKS (beats, or seconds when there is no B), B (beat →
// seconds), curX(t) and curY(t) (the cursor's world position), toScreen(x, y) (world → screen
// through CAM), and either CAMERA(t) → { x, y, z } or setCam(t) (sets CAM). K, when present, names
// each click. A page with no CLICKS has no cursor to check: exit 2, never a pass.
//
// Limits, set on a release film that hid two of its clicks: under 5 px/s on screen, under 2 pt of
// cursor travel in the 0.4 s before the press and in the 0.2 s after it. A cut that was too
// fast clicked under a camera moving 1255 and 1414 px/s, on cursors still 20-45 pt from their targets.
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [file, hash = ''] = (process.argv[2] || 'release.html').split('#');
const SCREEN_MAX = 5, TRAVEL_MAX = 2;
const browser = await chromium.launch({ channel: 'chrome' });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(resolve(file)).href + (hash ? '#' + hash : '')); // file:///C:/… on Windows
  await page.evaluate(() => window.ready);
  const rows = await page.evaluate(() => {
    if (typeof CLICKS === 'undefined' || typeof curX !== 'function') return null;
    const sec = (c) => (typeof B === 'function' ? B(c) : c);
    const cam = (u) => { if (typeof CAMERA === 'function') CAM = CAMERA(u); else setCam(u); };
    const move = (a, b) => Math.hypot(curX(b) - curX(a), curY(b) - curY(a));
    return CLICKS.map((c, i) => {
      const t = sec(c), wx = curX(t), wy = curY(t); // the clicked point, fixed in the world
      const at = (u) => { cam(u); return toScreen(wx, wy); };
      const [x0, y0] = at(t - 0.15), [x1, y1] = at(t + 0.15);
      const name = (typeof K === 'object' && Object.keys(K).find((k) => K[k] === c)) || `click ${i + 1}`;
      return { name, t, screen: Math.hypot(x1 - x0, y1 - y0) / 0.3, travel: move(t - 0.4, t), after: move(t, t + 0.2) };
    });
  });
  if (!rows) { console.log('the page declares no CLICKS (or no curX/curY): nothing to check'); code = 2; }
  else {
    for (const r of rows) {
      const bad = r.screen > SCREEN_MAX || r.travel > TRAVEL_MAX || r.after > TRAVEL_MAX;
      if (bad) code = 1;
      console.log(`${bad ? 'FAIL' : 'ok  '} ${r.name.padEnd(14)} ${r.t.toFixed(2).padStart(6)} s   screen ${r.screen.toFixed(1).padStart(6)} px/s   cursor ${r.travel.toFixed(1).padStart(5)} pt before, ${r.after.toFixed(1).padStart(5)} pt in the press`);
    }
    console.log(code ? `a click is not seen: rest the camera and the cursor before it, and keep the cursor through the press (limits ${SCREEN_MAX} px/s, ${TRAVEL_MAX} pt)` : `${rows.length} clicks, all under a still camera on a cursor at rest`);
  }
} finally {
  await browser.close();
}
process.exit(code);
