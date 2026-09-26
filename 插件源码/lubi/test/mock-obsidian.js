import fs from "fs";
// 最小 Obsidian API 模拟：够跑渲染与数据流
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement; globalThis.HTMLInputElement = window.HTMLInputElement; globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
globalThis.Node = window.Node; globalThis.Event = window.Event; globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
Object.defineProperty(globalThis, "navigator", { configurable: true, value: window.navigator });

// --- DOM 扩展（Obsidian 风格） ---
const P = window.Node.prototype, E = window.Element.prototype;
function applyAttrs(el, o) {
  if (!o) return el;
  if (typeof o === "string") { el.className = o; return el; }
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
  if (o.text !== undefined) el.textContent = String(o.text);
  if (o.type) el.setAttribute("type", o.type);
  if (o.value !== undefined) el.value = o.value;
  if (o.attr) for (const [k, v] of Object.entries(o.attr)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  return el;
}
P.createEl = function (tag, o) { const el = applyAttrs(document.createElement(tag), o); this.appendChild(el); return el; };
P.createDiv = function (o) { return this.createEl("div", o); };
P.createSpan = function (o) { return this.createEl("span", o); };
P.createSvg = function (tag, o) { const el = document.createElementNS("http://www.w3.org/2000/svg", tag); if (o?.cls) el.setAttribute("class", o.cls); if (o?.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, String(v)); this.appendChild(el); return el; };
P.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); };
P.setText = function (t) { this.textContent = t; };
E.addClass = function (...c) { this.classList.add(...c.filter(Boolean)); };
E.removeClass = function (...c) { this.classList.remove(...c); };
E.toggleClass = function (c, v) { this.classList.toggle(c, v); };
E.hasClass = function (c) { return this.classList.contains(c); };
globalThis.createDiv = (o) => applyAttrs(document.createElement("div"), o);
globalThis.createEl = (t, o) => applyAttrs(document.createElement(t), o);

// --- API 类 ---
export class TFile { constructor(path) { this.path = path; const b = path.split("/").pop(); this.name = b; this.basename = b.replace(/\.[^.]+$/, ""); this.extension = b.split(".").pop(); this.stat = { mtime: Date.now(), size: 0 }; } }
export class TFolder { constructor(path) { this.path = path; this.children = []; } }
export const normalizePath = (p) => p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
export const notices = [];
export class Notice { constructor(msg) { notices.push(String(msg)); this.noticeEl = document.createElement("div"); document.body.appendChild(this.noticeEl); } hide() { this.noticeEl.remove(); } }
// 预览 / 冒烟都用真实 lucide SVG（devDependency lucide-static），缺失时回退为空 svg，避免截图出现灰块。
const ICON_ALIAS = { "bar-chart-3": "chart-column", "octagon-alert": "octagon-alert" };
const iconCache = new Map();
function lucideSvg(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  let svg = "<svg></svg>";
  for (const n of [name, ICON_ALIAS[name]].filter(Boolean)) {
    try {
      const url = new URL(`../node_modules/lucide-static/icons/${n}.svg`, import.meta.url);
      if (fs.existsSync(url)) { svg = fs.readFileSync(url, "utf8").replace(/<!--[\s\S]*?-->/g, "").trim(); break; }
    } catch { /* ignore */ }
  }
  iconCache.set(name, svg);
  return svg;
}
export function setIcon(el, name) { el.setAttribute("data-icon", name); el.innerHTML = lucideSvg(name); }
export class Menu {
  constructor() { this.items = []; }
  addItem(f) { const it = { title: "", icon: "", cb: null, setTitle(t) { this.title = t; return this; }, setIcon(i) { this.icon = i; return this; }, onClick(c) { this.cb = c; return this; }, setSection() { return this; } }; f(it); this.items.push(it); return this; }
  addSeparator() { return this; }
  showAtMouseEvent() { menus.push(this); return this; }
  showAtPosition() { menus.push(this); return this; }
}
export const menus = [];

class Vault {
  constructor() { this.files = new Map(); this.handlers = {}; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return { ev, fn }; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  getAbstractFileByPath(p) {
    p = normalizePath(p);
    if (this.files.has(p)) return new TFile(p);
    const kids = [...this.files.keys()].filter((k) => k.startsWith(p + "/"));
    if (kids.length || this._folders?.has(p)) { const f = new TFolder(p); f.children = kids.filter((k) => !k.slice(p.length + 1).includes("/")).map((k) => new TFile(k)); return f; }
    return null;
  }
  getMarkdownFiles() { return [...this.files.keys()].filter((k) => k.endsWith(".md")).map((k) => new TFile(k)); }
  async read(f) { return this.files.get(f.path) ?? ""; }
  async cachedRead(f) { return this.read(f); }
  async create(p, c) { p = normalizePath(p); this.files.set(p, c); const f = new TFile(p); this.emit("create", f); return f; }
  async modify(f, c) { this.files.set(f.path, c); this.emit("modify", f); }
  async process(f, fn) { const next = fn(this.files.get(f.path) ?? ""); this.files.set(f.path, next); this.emit("modify", f); return next; }
  async createFolder(p) { (this._folders ||= new Set()).add(normalizePath(p)); }
  adapter = { exists: async (p) => this.files.has(normalizePath(p)) || this._folders?.has(normalizePath(p)) || [...this.files.keys()].some((k) => k.startsWith(normalizePath(p) + "/")), write: async (p, c) => { this.files.set(normalizePath(p), c); } };
}
class Workspace {
  constructor(app) { this.app = app; this.leaves = []; this._ready = []; }
  onLayoutReady(fn) { this._ready.push(fn); }
  getLeavesOfType(t) { return this.leaves.filter((l) => l.type === t); }
  getLeaf() { const l = { app: this.app, type: null, view: null, setViewState: async (s) => { l.type = s.type; l.view = this._factory(l); await l.view.onOpen(); }, openFile: async () => {} }; this.leaves.push(l); return l; }
  revealLeaf() {}
}
export class App { constructor() { this.vault = new Vault(); this.workspace = new Workspace(this); } }
export class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; this._data = null; this.commands = []; this._views = {}; }
  async loadData() { return this._data; }
  async saveData(d) { this._data = JSON.parse(JSON.stringify(d)); }
  registerView(t, f) { this._views[t] = f; this.app.workspace._factory = (leaf) => f(leaf); }
  addRibbonIcon() { return document.createElement("div"); }
  addSettingTab() {}
  addCommand(c) { this.commands.push(c); }
  registerEvent() {}
}
export class ItemView { constructor(leaf) { this.leaf = leaf; this.app = leaf.app; this.contentEl = document.createElement("div"); this.containerEl = document.createElement("div"); this.containerEl.appendChild(this.contentEl); document.body.appendChild(this.containerEl); } }
export const openModals = [];
export class Modal {
  constructor(app) { this.app = app; this.modalEl = document.createElement("div"); this.titleEl = document.createElement("div"); this.contentEl = document.createElement("div"); this.modalEl.append(this.titleEl, this.contentEl); }
  open() { document.body.appendChild(this.modalEl); openModals.push(this); this.onOpen?.(); }
  close() { this.modalEl.remove(); const i = openModals.indexOf(this); if (i >= 0) openModals.splice(i, 1); this.onClose?.(); }
}
export class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = document.createElement("div"); } }
export class Setting {
  constructor(el) { this.settingEl = el.createDiv({ cls: "setting-item" }); this.controlEl = this.settingEl.createDiv(); }
  setName(n) { this.settingEl.createDiv({ text: n }); return this; } setDesc() { return this; } setHeading() { return this; }
  addText(f) { const el = this.controlEl.createEl("input"); f({ setValue: (v) => { el.value = v; return this; }, setPlaceholder: () => this, onChange: () => this, inputEl: el }); return this; }
  addTextArea(f) { return this.addText(f); }
  addToggle(f) { f({ setValue: () => ({ onChange: () => {} }) }); return this; }
  addDropdown(f) { const d = { addOption: () => d, setValue: () => d, onChange: () => d }; f(d); return this; }
  addButton(f) { const b = { setButtonText: () => b, setCta: () => b, onClick: () => b }; f(b); return this; }
  addExtraButton(f) { const b = { setIcon: () => b, setTooltip: () => b, setDisabled: () => b, onClick: () => b }; f(b); return this; }
}
export class WorkspaceLeaf {}

