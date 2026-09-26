// v1.4 browser layout regression: renders the real views (synthetic data via test/preview.mjs)
// and checks, in a real Chromium layout engine:
//   1. the tab switcher keeps the same x offset on every page (no jumping)
//   2. no visible text is smaller than 11px
//   3. the first hour label of each timeline is not clipped by its scroller
//   4. the top bar never overflows horizontally and its zones do not overlap
//   5. every visible text node has WCAG contrast ≥ 4.5:1 against its background (light + dark)
// Uses synthetic data only; no vault files or browser profiles are read.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const browser = [
  process.env.LUBI_BROWSER,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((candidate) => candidate && existsSync(candidate));

if (!browser) {
  if (process.env.LUBI_REQUIRE_BROWSER === "1") throw new Error("Chrome/Edge is required for top bar layout regression");
  console.log("SKIP top bar geometry: install Chrome/Edge or set LUBI_BROWSER");
} else {
  // 1) plugin bundle for node + static previews
  if (!existsSync(join(project, "test", "plugin.cjs"))) {
    const esb = spawnSync(process.execPath, [join(project, "node_modules", "esbuild", "bin", "esbuild"), "src/main.ts", "--bundle", "--platform=node", "--format=cjs", "--external:obsidian", "--outfile=test/plugin.cjs", "--log-level=warning"], { cwd: project, encoding: "utf8" });
    assert.equal(esb.status, 0, `esbuild failed: ${esb.stderr}`);
  }
  const gen = spawnSync(process.execPath, [join(project, "test", "preview.mjs")], { cwd: project, encoding: "utf8", timeout: 60000 });
  assert.equal(gen.status, 0, `preview generation failed: ${gen.stderr?.slice(-800)}`);

  const probe = `<pre id="lubi-result"></pre><script>
  (() => {
    const out = {};
    const r = (el) => el ? el.getBoundingClientRect() : null;
    const bar = document.querySelector('.lubi-topbar');
    const tabs = document.querySelector('.lubi-topbar-tabs');
    const left = document.querySelector('.lubi-topbar-left');
    const right = document.querySelector('.lubi-topbar-right');
    out.tabsX = r(tabs) && Math.round(r(tabs).left);
    out.tabsW = r(tabs) && Math.round(r(tabs).width);
    out.barOverflow = bar ? bar.scrollWidth - bar.clientWidth : -1;
    const lr = r(left), tr = r(tabs), rr = r(right);
    out.zoneOverlap = (lr && tr && lr.width && lr.right > tr.left + 1 && getComputedStyle(tabs).gridRow === getComputedStyle(left).gridRow) || (rr && tr && rr.left < tr.right - 1 && getComputedStyle(tabs).gridRow === getComputedStyle(right).gridRow);
    // smallest visible text
    let min = 99, minAt = '';
    const walker = document.createTreeWalker(document.querySelector('.lubi-root'), NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode; if (!t.nodeValue.trim()) continue;
      const el = t.parentElement; if (!el || el.closest('.lubi-sr-only, script, style')) continue;
      const cs = getComputedStyle(el); const box = el.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || box.width === 0 || box.height === 0 || el.closest('[hidden]')) continue;
      const fs = parseFloat(cs.fontSize);
      if (fs < min) { min = fs; minAt = (el.className || el.tagName) + ' "' + t.nodeValue.trim().slice(0, 16) + '"'; }
    }
    out.minFont = min; out.minAt = minAt;
    // first hour label of each scroller must be inside the scroller at scrollTop 0
    out.clipped = [];
    for (const [sel, lab] of [['.lubi-timeline-scroll', '.lubi-hour-label'], ['.lubi-week-body', '.lubi-week-hour']]) {
      const sc = document.querySelector(sel); if (!sc) continue;
      sc.scrollTop = 0;
      const first = sc.querySelector(lab); if (!first || !first.textContent.trim()) continue;
      const a = r(sc), b = r(first);
      if (b.top < a.top - 0.5) out.clipped.push(sel + ' ' + first.textContent.trim() + ' top ' + Math.round(b.top - a.top) + 'px');
    }
    // WCAG contrast of every visible text node against its nearest opaque background
    const parse = (c) => { const m = (c.match(/[\d.]+/g) || []).map(Number); if (c.startsWith('color(')) { const v = m.slice(0, 3).map((x) => x * 255); if (m.length > 3) v.push(m[3]); return v; } return m; };
    const lum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
    const bgOf = (el) => { while (el) { const bg = getComputedStyle(el).backgroundColor; const m = parse(bg); if (m.length >= 3 && (m.length < 4 || m[3] > 0.9)) return m; el = el.parentElement; } return [255, 255, 255]; };
    out.lowContrast = [];
    const seen = new Set();
    const w2 = document.createTreeWalker(document.querySelector('.lubi-root'), NodeFilter.SHOW_TEXT);
    while (w2.nextNode()) {
      const t = w2.currentNode; if (!t.nodeValue.trim()) continue;
      const el = t.parentElement; if (!el || el.closest('.lubi-sr-only, script, style, [hidden]')) continue;
      const cs = getComputedStyle(el); const box = el.getBoundingClientRect();
      if (!box.width || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (el.closest('.is-future, .is-done, [disabled], .lubi-muted-future')) continue; // intentionally de-emphasised
      const fg = parse(cs.color); const bg = bgOf(el); const a = fg.length > 3 ? fg[3] : 1;
      const mix = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
      const L1 = lum(mix), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const key = el.className + cs.color;
      if (cr < 4.5 && !seen.has(key)) { seen.add(key); out.lowContrast.push(cr.toFixed(2) + ' ' + (el.className || el.tagName) + ' "' + t.nodeValue.trim().slice(0, 12) + '"'); }
    }
    document.getElementById('lubi-result').textContent = 'LUBI_TOPBAR:' + encodeURIComponent(JSON.stringify(out));
  })();
  </script>`;

  const tmp = mkdtempSync(join(tmpdir(), "lubi-topbar-layout-"));
  try {
    const run = (theme, page, width) => {
      const src = join(project, "preview", theme === "dark" ? "dark" : "", `${page}.html`);
      const html = readFileSync(src, "utf8").replace("</body>", `${probe}</body>`);
      const file = join(tmp, `${theme}-${page}-${width}.html`);
      writeFileSync(file, html, "utf8");
      const result = spawnSync(browser, [
        "--headless=new", "--disable-gpu", "--disable-extensions", "--no-first-run",
        "--no-default-browser-check", "--disable-background-networking", "--hide-scrollbars",
        `--window-size=${width},900`, `--user-data-dir=${join(tmp, `profile-${theme}-${page}-${width}`)}`,
        "--dump-dom", pathToFileURL(file).href,
      ], { encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
      assert.equal(result.status, 0, `headless browser failed: ${result.error || result.stderr?.slice(-500)}`);
      const matches = [...result.stdout.matchAll(/LUBI_TOPBAR:([A-Za-z0-9%._~-]+)/g)];
      assert(matches.length > 0, `browser did not return geometry for ${page}`);
      return JSON.parse(decodeURIComponent(matches[matches.length - 1][1]));
    };
    for (const theme of ["light", "dark"]) {
      for (const width of [1400, 1000, 720]) {
        const xs = {};
        for (const page of ["today", "review", "tasks"]) {
          const g = run(theme, page, width);
          xs[page] = g.tabsX;
          assert(g.barOverflow <= 1, `${theme} ${page} ${width}px: top bar overflows by ${g.barOverflow}px`);
          assert(!g.zoneOverlap, `${theme} ${page} ${width}px: top bar zones overlap ${JSON.stringify(g)}`);
          assert(g.minFont >= 11, `${theme} ${page} ${width}px: text below 11px (${g.minFont}px at ${g.minAt})`);
          assert.deepEqual(g.lowContrast, [], `${theme} ${page} ${width}px: text contrast below 4.5:1: ${g.lowContrast.join("; ")}`);
          assert.deepEqual(g.clipped, [], `${theme} ${page} ${width}px: first hour label clipped: ${g.clipped.join("; ")}`);
        }
        const values = Object.values(xs);
        assert(Math.max(...values) - Math.min(...values) <= 1, `${theme} ${width}px: tab switcher moves between pages ${JSON.stringify(xs)}`);
        console.log(`ok   top bar ${theme} ${width}px: tabs x=${values[0]} on all pages, text ≥11px, contrast ≥4.5:1, no clipped hour labels`);
      }
    }
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome may briefly hold its temp profile on Windows. */ }
  }
}
