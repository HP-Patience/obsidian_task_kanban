// 极小的 UI 组件集：全部走 CSS class，不写内联样式（动态几何除外）。

import { Notice, setIcon } from "obsidian";
import { CategoryDef } from "../settings";

export function el<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = parent.createEl(tag, { cls, text });
  return n;
}

export function icon(parent: HTMLElement, name: string, cls = "lubi-icon"): HTMLElement {
  const s = parent.createSpan({ cls });
  setIcon(s, name);
  return s;
}

/**
 * 悬浮提示统一走 Obsidian：只设 aria-label（Obsidian 会据此显示自带提示）。
 * 不要再设 title —— 浏览器会再弹一个原生提示，出现两个一模一样的提示。
 */
export function tip<T extends HTMLElement>(el: T, text: string): T {
  el.setAttribute("aria-label", text);
  el.removeAttribute("title");
  return el;
}

export function iconButton(parent: HTMLElement, name: string, label: string, onClick: () => void, cls = ""): HTMLButtonElement {
  const b = parent.createEl("button", { cls: `lubi-icon-btn ${cls}`.trim(), attr: { "aria-label": label, "data-lubi-focus": `icon:${label}` } });
  setIcon(b, name);
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function button(parent: HTMLElement, label: string, onClick: () => void, opts: { primary?: boolean; icon?: string; cls?: string } = {}): HTMLButtonElement {
  const b = parent.createEl("button", { cls: `lubi-btn ${opts.primary ? "mod-cta" : ""} ${opts.cls || ""}`.trim(), attr: { "data-lubi-focus": `button:${label}` } });
  if (opts.icon) icon(b, opts.icon, "lubi-icon lubi-btn-icon");
  b.createSpan({ text: label });
  b.addEventListener("click", (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

export function segmented<T extends string>(
  parent: HTMLElement,
  items: { id: T; label: string; icon?: string }[],
  active: T,
  onChange: (id: T) => void,
): HTMLElement {
  const wrap = parent.createDiv({ cls: "lubi-seg" });
  for (const it of items) {
    const b = wrap.createEl("button", { cls: "lubi-seg-item", attr: { "aria-pressed": String(it.id === active), "data-lubi-focus": `seg:${it.id}` } });
    if (it.icon) icon(b, it.icon, "lubi-icon lubi-seg-icon");
    b.createSpan({ text: it.label });
    b.addEventListener("click", () => {
      // 以 DOM 上的 aria-pressed 为准：外部（如 openDate 跳转）可能已改过当前页
      if (b.getAttribute("aria-pressed") === "true") return;
      wrap.querySelectorAll(".lubi-seg-item").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      onChange(it.id);
    });
  }
  return wrap;
}

export function catDot(parent: HTMLElement, cat: CategoryDef): HTMLElement {
  const d = parent.createSpan({ cls: "lubi-dot" });
  d.style.setProperty("--dot", cat.color);
  return d;
}

export function catChip(parent: HTMLElement, cat: CategoryDef, text?: string): HTMLElement {
  const c = parent.createSpan({ cls: "lubi-chip" });
  c.style.setProperty("--chip", cat.color);
  icon(c, cat.icon, "lubi-icon lubi-chip-icon");
  c.createSpan({ text: text ?? cat.name });
  return c;
}

export function emptyState(parent: HTMLElement, iconName: string, title: string, hint?: string, action?: { label: string; onClick: () => void }): HTMLElement {
  const box = parent.createDiv({ cls: "lubi-empty" });
  icon(box, iconName, "lubi-icon lubi-empty-icon");
  box.createDiv({ cls: "lubi-empty-title", text: title });
  if (hint) box.createDiv({ cls: "lubi-empty-hint", text: hint });
  if (action) button(box, action.label, action.onClick, { primary: true, icon: "plus" });
  return box;
}

/** 环形图（SVG） */
export function donut(parent: HTMLElement, slices: { value: number; color: string; label: string }[], centerText: string, centerSub?: string): SVGSVGElement {
  const size = 120;
  const r = 48;
  const stroke = 14;
  const svg = parent.createSvg("svg", { cls: "lubi-donut", attr: { viewBox: `0 0 ${size} ${size}`, width: String(size), height: String(size) } });
  const total = slices.reduce((s, x) => s + x.value, 0);
  const c = 2 * Math.PI * r;
  svg.createSvg("circle", { attr: { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "var(--background-modifier-border)", "stroke-width": stroke } });
  let offset = 0;
  if (total > 0) {
    for (const s of slices) {
      if (s.value <= 0) continue;
      const len = (s.value / total) * c;
      const circle = svg.createSvg("circle", {
        attr: {
          cx: size / 2,
          cy: size / 2,
          r,
          fill: "none",
          stroke: s.color,
          "stroke-width": stroke,
          "stroke-dasharray": `${len} ${c - len}`,
          "stroke-dashoffset": String(-offset),
          transform: `rotate(-90 ${size / 2} ${size / 2})`,
        },
      });
      circle.createSvg("title").textContent = `${s.label} ${Math.round((s.value / total) * 100)}%`;
      offset += len;
    }
  }
  const t = svg.createSvg("text", { cls: "lubi-donut-center", attr: { x: size / 2, y: size / 2 + (centerSub ? -2 : 6), "text-anchor": "middle" } });
  t.textContent = centerText;
  if (centerSub) {
    const s = svg.createSvg("text", { cls: "lubi-donut-sub", attr: { x: size / 2, y: size / 2 + 16, "text-anchor": "middle" } });
    s.textContent = centerSub;
  }
  return svg;
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: number | null = null;
  return (...a: A) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
}

export function stopAll(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
}

/** 带「撤销」按钮的 Notice */
export function undoNotice(text: string, onUndo: () => void | Promise<void>, ms = 6000): void {
  const n = new Notice("", ms) as Notice & { noticeEl?: HTMLElement };
  if (!n.noticeEl) return;
  n.noticeEl.empty();
  n.noticeEl.addClass("lubi-notice");
  n.noticeEl.createSpan({ text });
  const b = n.noticeEl.createEl("button", { cls: "lubi-notice-btn", text: "撤销" });
  b.addEventListener("click", (e) => {
    stopAll(e);
    n.hide();
    void onUndo();
  });
}

/** 轻量 tooltip：全局单例，跟随鼠标；任何重绘 / 滚动 / 离开都会关掉，不会残留 */
let tipEl: HTMLElement | null = null;
let tipBound = false;
export function hideTip(): void {
  if (tipEl) {
    tipEl.remove();
    tipEl = null;
  }
}
function showTip(rows: (string | HTMLElement)[]): HTMLElement {
  hideTip();
  tipEl = document.body.createDiv({ cls: "lubi-tip" });
  for (const r of rows) {
    if (typeof r === "string") tipEl.createDiv({ text: r });
    else tipEl.appendChild(r);
  }
  if (!tipBound) {
    tipBound = true;
    window.addEventListener("scroll", hideTip, true);
    window.addEventListener("blur", hideTip);
    document.addEventListener("pointerdown", hideTip, true);
    document.addEventListener("keydown", hideTip, true);
  }
  return tipEl;
}
function placeTip(x: number, y: number): void {
  if (!tipEl) return;
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  let left = x + 14;
  let top = y + 14;
  if (left + w > window.innerWidth - 8) left = x - w - 10;
  if (top + h > window.innerHeight - 8) top = y - h - 10;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
}
export function hoverTip(host: HTMLElement, selector: string, content: (target: HTMLElement) => (string | HTMLElement)[] | null): void {
  let current: HTMLElement | null = null;
  host.addEventListener("pointermove", (e) => {
    const t = (e.target as HTMLElement).closest(selector) as HTMLElement | null;
    if (!t || !host.contains(t)) {
      current = null;
      hideTip();
      return;
    }
    if (t !== current || !tipEl || !tipEl.isConnected) {
      current = t;
      const rows = content(t);
      if (!rows) {
        hideTip();
        return;
      }
      showTip(rows);
    }
    placeTip(e.clientX, e.clientY);
  });
  host.addEventListener("pointerleave", () => {
    current = null;
    hideTip();
  });
  // 图表柱等可聚焦控件：键盘聚焦时给出与鼠标悬停相同的说明。
  host.addEventListener("focusin", (e) => {
    const target = (e.target as HTMLElement).closest(selector) as HTMLElement | null;
    if (!target || !host.contains(target)) return;
    current = target;
    const rows = content(target);
    if (!rows) return;
    showTip(rows);
    const rect = target.getBoundingClientRect();
    placeTip(rect.right, rect.top);
  });
  host.addEventListener("focusout", (e) => {
    if (host.contains(e.relatedTarget as Node | null)) return;
    current = null;
    hideTip();
  });
}

