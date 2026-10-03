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
  const gen = spawnSync(process.execPath, [join(project, "test", "preview.mjs")], { cwd: project, encoding: "utf8", timeout: 60000, env: { ...process.env, LUBI_TEST_DAY_START_PLAN: "1" } });
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
    // Daily boundary labels must remain visible at both scroll limits.
    out.dayBoundaryClipped = [];
    {
      const sc = document.querySelector(".lubi-timeline-scroll");
      if (sc) {
        for (const edge of [{ text: "00:00", position: 0, selector: ".lubi-hour-label.is-day-start" }, { text: "24:00", position: Math.max(0, sc.scrollHeight - sc.clientHeight), selector: ".lubi-hour-label.is-day-end" }]) {
          sc.scrollTop = edge.position;
          const label = sc.querySelector(edge.selector), box = r(label), frame = r(sc);
          const visibleTop = frame.top + sc.clientTop, visibleBottom = visibleTop + sc.clientHeight;
          if (!label || label.textContent.trim() !== edge.text || !box || getComputedStyle(label).visibility === "hidden" || box.top < visibleTop - 0.5 || box.bottom > visibleBottom + 0.5) out.dayBoundaryClipped.push(edge.text);
          if (edge.text === "24:00" && label && box) {
            const endLine = sc.querySelector(".lubi-tl-line.is-day-end"), endBox = r(endLine);
            if (!endBox || Math.abs((box.top + box.bottom) / 2 - endBox.top) > 0.75 || box.right >= endBox.left) out.dayBoundaryClipped.push("24:00 must be centered immediately left of its rule");
          }
        }
        sc.scrollTop = 0;
      }
    }
    // Keep the weekly grid end marker visible after scrolling to the configured last hour.
    out.weekEndClipped = [];
    {
      const sc = document.querySelector(".lubi-week-body");
      if (sc && getComputedStyle(sc).display !== "none") {
        sc.scrollTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
        const end = sc.querySelector(".lubi-week-hour.is-day-end"), box = r(end), frame = r(sc);
        const visibleTop = frame.top + sc.clientTop, visibleBottom = visibleTop + sc.clientHeight;
        const columns = [...sc.querySelectorAll(".lubi-week-col")];
        const endLines = [...sc.querySelectorAll(".lubi-week-line.is-day-end")];
        if (!end || end.textContent.trim() !== "24:00" || !box || getComputedStyle(end).visibility === "hidden" || box.top < visibleTop - 0.5 || box.bottom > visibleBottom + 0.5 || endLines.length !== columns.length || endLines.some((line, i) => line.style.top !== columns[i]?.style.height)) out.weekEndClipped.push("24:00");
        sc.scrollTop = 0;
      }
    }
    // The midnight line and plan lane start below a visible top gutter.
    out.dayTopInset = null;
    {
      const sc = document.querySelector(".lubi-timeline-scroll");
      const timeline = sc?.querySelector(".lubi-timeline"), line = timeline?.querySelector(".lubi-tl-line.is-first"), label = timeline?.querySelector(".lubi-hour-label.is-day-start");
      if (sc && timeline && line && label) {
        sc.scrollTop = 0;
        const frame = r(sc), grid = r(timeline);
        out.dayTopInset = grid.top - frame.top - sc.clientTop;
        out.midnightLineOffset = r(line).top - grid.top;
        out.midnightLabelOffset = r(label).top - grid.top;
        out.paddingTop = parseFloat(getComputedStyle(sc).paddingTop) || 0;
        const planTitle = timeline.querySelector(".lubi-plan-lane-title");
        const qaPlan = [...timeline.querySelectorAll(".lubi-plan")].find(plan => plan.querySelector(".lubi-plan-title")?.textContent === "午夜计划（布局回归）");
        out.planHandleErrors = [];
        for (const plan of timeline.querySelectorAll('.lubi-plan')) {
          const top = plan.querySelector('.lubi-block-handle.is-top'), bottom = plan.querySelector('.lubi-block-handle.is-bottom');
          if (!top || !bottom) { out.planHandleErrors.push('missing handle'); continue; }
          const center = el => {
            const box = r(el), cs = getComputedStyle(el, '::after');
            return box.left + parseFloat(cs.left) + parseFloat(cs.marginLeft) + parseFloat(cs.width)/2;
          };
          if (Math.abs(center(top) - center(bottom)) > 0.5 || Math.abs(center(top) - (r(plan).left+r(plan).right)/2) > 0.5) out.planHandleErrors.push('top/bottom handles must share card center');
          const cancel = plan.querySelector('.lubi-plan-cancel');
          if (cancel && r(top).right > r(cancel).left + 0.5) out.planHandleErrors.push('top resize hit area covers cancel control');
        }
        out.dayPlanTitleOffset = planTitle ? r(planTitle).top - grid.top : null;
        out.dayPlanBlockOffset = qaPlan ? r(qaPlan).top - grid.top : null;
        out.dayPlanTitleGap = planTitle && qaPlan ? r(qaPlan).top - r(planTitle).bottom : null;
        out.dayStartGutterPx = parseFloat(timeline.style.getPropertyValue("--lubi-day-start-gutter")) || 0;
        out.hourPx = r(timeline.querySelector(".lubi-tl-canvas")).height / 24;
      }
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
          assert.deepEqual(g.weekEndClipped, [], `${theme} ${page} ${width}px: clipped weekly 24:00 boundary ${g.weekEndClipped.join(", ")}`);
          if (page === "today") {
            assert.deepEqual(g.planHandleErrors, [], `${theme} ${width}px: plan resize handles are misaligned: ${g.planHandleErrors.join("; ")}`);
            assert(Math.abs(g.dayTopInset) <= 0.5 && g.paddingTop === 0, `${theme} ${width}px: move the 00:00 origin inside the grid, not the whole scroller ${JSON.stringify(g)}`);
            assert(g.dayStartGutterPx === 32 && Math.abs(g.midnightLineOffset - 32) <= 0.5 && Math.abs(g.midnightLabelOffset - 32) <= 0.5, `${theme} ${width}px: reserve the 24px plan-title row above 00:00 ${JSON.stringify(g)}`);
            assert(g.dayPlanTitleGap >= 0, `${theme} ${width}px: midnight plan card overlaps the sticky plan title ${JSON.stringify(g)}`);
            assert(Math.abs(g.dayPlanTitleOffset) <= 0.5, `${theme} ${width}px: plan title should live in the header row ${JSON.stringify(g)}`);
            assert(Math.abs(g.dayPlanBlockOffset - (g.dayStartGutterPx + 5 * g.hourPx / 60)) <= 0.5, `${theme} ${width}px: a 00:05 plan should stay on its real time line ${JSON.stringify(g)}`);
          }
          assert.deepEqual(g.dayBoundaryClipped, [], `${theme} ${page} ${width}px: clipped daily boundary labels ${g.dayBoundaryClipped.join(", ")}`);
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
