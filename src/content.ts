import * as Scan from './scan-dom';
import * as engine from './engine';
import { detectPack } from './packs/registry';
import './packs';

if (typeof window.__slopspotterTeardown === 'function') {
  window.__slopspotterTeardown();
}

const MARK_CLASS = Scan.MARK_CLASS;
const MARK_ID_RE = Scan.MARK_ID_RE;
const DARK_CLASS = 'slopspotter-on-dark';
const MAX_SCAN_CHARS = 200000;
const MAX_SCAN_MS = 2000;
const TIER_NAME: Record<string, string> = { 3: 'HEAVY', 2: 'MEDIUM', 1: 'LIGHT' };

let pinnedMark: HTMLElement | null = null;
let flashMark: HTMLElement | null = null;
let flashTimer = 0;
let unrenderedCache = Scan.createCache();
let overlayHost: HTMLElement | null = null;
type OverlayAnchor = {
  mark: HTMLElement;
  el?: Element;
  node?: Text;
  start?: number;
  end?: number;
  label?: string;
  passive?: boolean;
};
const overlayAnchors: OverlayAnchor[] = [];
let uiHost: HTMLElement | null = null;
let uiShadow: ShadowRoot | null = null;
let tipEl: HTMLElement | null = null;
let flashBox: HTMLElement | null = null;
type Bound = [EventTarget, string, EventListener, boolean | AddEventListenerOptions | undefined];
const bound: Bound[] = [];

function listen(
  target: EventTarget,
  type: string,
  fn: EventListener,
  opts?: boolean | AddEventListenerOptions
): void {
  target.addEventListener(type, fn, opts);
  bound.push([target, type, fn, opts]);
}

  function countVisibleWords(el: Element | null): number {
    if (!el) return 0;
    const t = (el instanceof HTMLElement ? el.innerText : el.textContent || '').trim();
    if (!t) return 0;
    return t.split(/\s+/).length;
  }

  function listTopLevel(selector: string): Element[] {
    const all = Array.from(document.querySelectorAll(selector));
    return all.filter(function (el) {
      const parent = el.parentElement;
      return !parent || !parent.closest(selector);
    });
  }

  function pickContentRoot() {
    const minWords = 40;
    const articles = listTopLevel('article').map(function (el) {
      return { el: el, w: countVisibleWords(el) };
    }).filter(function (item) {
      return item.w >= minWords;
    }).sort(function (a, b) {
      return b.w - a.w;
    });

    function widen(picked: { el: Element; w: number; kind: string }) {
      const main = document.querySelector('main, [role="main"]');
      if (!main || main === picked.el) return { root: picked.el, kind: picked.kind };
      const mw = countVisibleWords(main);
      if (main.contains(picked.el) && mw >= 80 && picked.w * 2.5 < mw) {
        return { root: main, kind: 'main' };
      }
      return { root: picked.el, kind: picked.kind };
    }

    if (articles.length === 1) return widen({ el: articles[0].el, w: articles[0].w, kind: 'article' });
    if (articles.length > 1 && articles[0].w >= articles[1].w * 2.5) {
      return widen({ el: articles[0].el, w: articles[0].w, kind: 'article' });
    }

    const hooks = document.querySelectorAll(
      '[itemprop="articleBody"], .entry-content, .post-content, .article-body, .article-content, .post-body, .markdown-body, .prose, #mw-content-text'
    );
    const hookScores = [];
    for (let i = 0; i < hooks.length; i++) {
      const w = countVisibleWords(hooks[i]);
      if (w >= minWords) hookScores.push({ el: hooks[i], w: w });
    }
    hookScores.sort(function (a, b) { return b.w - a.w; });
    if (hookScores.length === 1) return widen({ el: hookScores[0].el, w: hookScores[0].w, kind: 'article' });
    if (hookScores.length > 1 && hookScores[0].w >= hookScores[1].w * 2.5) {
      return widen({ el: hookScores[0].el, w: hookScores[0].w, kind: 'article' });
    }

    const main = document.querySelector('main, [role="main"]');
    if (main && countVisibleWords(main) >= minWords) return { root: main, kind: 'main' };

    return { root: document.body, kind: 'body' };
  }

  /* ── page luminance: decides multiply vs screen ink ─────────────── */

  function luminance(color: string): number | null {
    const m = /rgba?\(([^)]+)\)/.exec(color || '');
    if (!m) return null;
    const p = m[1].split(',').map(function (v) { return parseFloat(v); });
    if (p.length > 3 && p[3] === 0) return null;
    return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
  }

  function pageIsDark(): boolean {
    let el: HTMLElement | null = document.body;
    while (el) {
      const lum = luminance(getComputedStyle(el).backgroundColor);
      if (lum !== null) return lum < 0.45;
      el = el.parentElement;
    }
    const textLum = luminance(getComputedStyle(document.body).color);
    return textLum !== null && textLum > 0.6;
  }

  const DARK_THEME_TOKENS = new Set([
    'dark', 'night', 'black', 'dim', 'midnight', 'darkly', 'dracula', 'oled'
  ]);
  const LIGHT_THEME_TOKENS = new Set([
    'light', 'day', 'white', 'default', 'cream', 'bright'
  ]);
  const DARK_CLASS_TOKENS = new Set([
    'dark', 'dark-mode', 'darkmode', 'theme-dark', 'theme-night', 'night-mode',
    'nightmode', 'is-dark', 'mode-dark', 'dark-theme', 'color-scheme-dark',
    'skin-theme-clientpref-night', 'skin-night-theme'
  ]);
  const LIGHT_CLASS_TOKENS = new Set([
    'light', 'light-mode', 'lightmode', 'theme-light', 'theme-day', 'day-mode',
    'is-light', 'mode-light', 'light-theme', 'color-scheme-light',
    'skin-theme-clientpref-day'
  ]);
  const THEME_ATTRS = [
    'data-theme', 'data-color-mode', 'data-bs-theme', 'data-mode',
    'data-color-scheme', 'data-ui-theme', 'theme'
  ];

  function tokenMode(value: string | null): 'dark' | 'light' | null {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    const first = raw.split(/[\s,/|_]+/)[0];
    if (DARK_THEME_TOKENS.has(first)) return 'dark';
    if (LIGHT_THEME_TOKENS.has(first)) return 'light';
    return null;
  }

  function classMode(el: Element | null): 'dark' | 'light' | null {
    if (!el || !el.classList) return null;
    let dark = false;
    let light = false;
    for (let i = 0; i < el.classList.length; i++) {
      const name = el.classList[i].toLowerCase();
      if (DARK_CLASS_TOKENS.has(name)) dark = true;
      if (LIGHT_CLASS_TOKENS.has(name)) light = true;
    }
    if (dark && !light) return 'dark';
    if (light && !dark) return 'light';
    return null;
  }

  function attrMode(el: Element | null): 'dark' | 'light' | null {
    if (!el || !el.getAttribute) return null;
    for (let i = 0; i < THEME_ATTRS.length; i++) {
      const mode = tokenMode(el.getAttribute(THEME_ATTRS[i]));
      if (mode) return mode;
    }
    if (el.hasAttribute('dark') && !el.hasAttribute('light')) return 'dark';
    if (el.hasAttribute('light') && !el.hasAttribute('dark')) return 'light';
    return null;
  }

  function colorSchemeMode(el: Element | null): 'dark' | 'light' | null {
    if (!el) return null;
    const cs = (getComputedStyle(el).colorScheme || '').toLowerCase().trim();
    if (!cs || cs === 'normal' || cs === 'auto') return null;
    const parts = cs.split(/\s+/).filter(function (p) { return p && p !== 'only'; });
    const hasDark = parts.indexOf('dark') !== -1;
    const hasLight = parts.indexOf('light') !== -1;
    if (hasDark && !hasLight) return 'dark';
    if (hasLight && !hasDark) return 'light';
    return null;
  }

  function opaqueLum(el: Element | null): number | null {
    let node = el as HTMLElement | null;
    while (node && node !== document.documentElement) {
      const lum = luminance(getComputedStyle(node).backgroundColor);
      if (lum !== null) return lum;
      node = node.parentElement;
    }
    return null;
  }

  function surfaceMode(root?: Element | null): 'dark' | 'light' | null {
    const seen = new Set<Element>();
    const candidates: Element[] = [];
    if (root) candidates.push(root);
    const extra = document.querySelectorAll(
      '.kix-page-paginated, .kix-page, canvas.kix-canvas-tile-content, [data-content-editable-root]'
    );
    for (let i = 0; i < extra.length; i++) {
      const el = extra[i];
      if (el) candidates.push(el);
    }
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width < 160 || r.height < 60) continue;
      const lum = opaqueLum(el);
      if (lum === null) continue;
      return lum < 0.45 ? 'dark' : 'light';
    }
    return null;
  }

  function detectSiteMode(root?: Element | null) {
    const surface = surfaceMode(root);
    if (surface) return surface;
    const html = document.documentElement;
    const body = document.body;
    const meta = document.querySelector('meta[name="color-scheme"]');
    const declared = attrMode(html)
      || classMode(html)
      || attrMode(body)
      || classMode(body)
      || tokenMode(meta && meta.getAttribute('content'))
      || colorSchemeMode(html)
      || colorSchemeMode(body);
    if (declared) return declared;
    return pageIsDark() ? 'dark' : 'light';
  }

  /* ── marking ───────────────────────────────────────────────────────── */

  function usableRects(el: Element): DOMRect[] {
    const out = [];
    const rects = el.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      if (rects[i].width >= 1 && rects[i].height >= 1) out.push(rects[i]);
    }
    if (!out.length) {
      const box = el.getBoundingClientRect();
      if (box.width >= 1 && box.height >= 1) out.push(box);
    }
    return out;
  }

  function pickRect(el: Element, x?: number, y?: number): DOMRect | null {
    const rects = usableRects(el);
    if (!rects.length) return null;
    if (x != null && y != null) {
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1) {
          return r;
        }
      }
    }
    return rects[0];
  }

  function glyphRect(el: Element): DOMRect {
    const own = el.getBoundingClientRect();
    if (own.width >= 4 && own.height >= 2) return own;
    let node: Element | null = el.parentElement;
    while (node && node !== document.documentElement) {
      const r = node.getBoundingClientRect();
      if (r.width >= 4 && r.height >= 4) return r;
      node = node.parentElement;
    }
    return own;
  }

  let measureCtx: CanvasRenderingContext2D | null = null;
  function textWidth(font: string, text: string): number {
    if (!text) return 0;
    if (!measureCtx) {
      const canvas = document.createElement('canvas');
      measureCtx = canvas.getContext('2d');
    }
    if (!measureCtx) return text.length;
    measureCtx.font = font || '16px sans-serif';
    return measureCtx.measureText(text).width;
  }

  function labelFont(el: Element): string {
    const attr = el.getAttribute('data-font-css');
    if (attr) return attr;
    const cs = getComputedStyle(el);
    return cs.font || ((cs.fontWeight || '400') + ' ' + (cs.fontSize || '16px') + ' ' + (cs.fontFamily || 'sans-serif'));
  }

  function sliceGlyph(el: Element, text: string, start: number, end: number): DOMRect {
    const box = glyphRect(el);
    const font = labelFont(el);
    const sliced = Scan.sliceLineRect(box, text, start, end, function (s) {
      return textWidth(font, s);
    });
    return new DOMRect(sliced.left, sliced.top, sliced.width, sliced.height);
  }

  function dropOverlays() {
    overlayAnchors.length = 0;
    if (overlayHost && overlayHost.parentNode) overlayHost.parentNode.removeChild(overlayHost);
    overlayHost = null;
  }

  function ensureOverlayHost(): HTMLElement {
    if (overlayHost && overlayHost.isConnected) return overlayHost;
    dropOverlays();
    document.querySelectorAll('[data-isslop="overlays"]').forEach(function (n) {
      n.parentNode?.removeChild(n);
    });
    overlayHost = document.createElement('div');
    overlayHost.setAttribute('data-isslop', 'overlays');
    overlayHost.style.cssText = 'display: contents';
    document.documentElement.appendChild(overlayHost);
    return overlayHost;
  }

  function rangeBox(node: Text, start: number, end: number): DOMRect | null {
    const len = (node.nodeValue || '').length;
    if (!node.isConnected || start < 0 || end > len || start >= end) return null;
    const range = document.createRange();
    try {
      range.setStart(node, start);
      range.setEnd(node, end);
    } catch {
      return null;
    }
    return range.getBoundingClientRect();
  }

  function placeMarkBox(mark: HTMLElement, r: DOMRect | null): void {
    if (!r || r.width < 2 || r.height < 2) {
      mark.style.display = 'none';
      return;
    }
    mark.style.left = Math.round(r.left) + 'px';
    mark.style.top = Math.round(r.top) + 'px';
    mark.style.width = Math.max(0, Math.round(r.width)) + 'px';
    mark.style.height = Math.max(0, Math.round(r.height)) + 'px';
    mark.style.display = 'block';
  }

  function placeOverlay(mark: HTMLElement, el: Element): void {
    placeMarkBox(mark, glyphRect(el));
  }

  function placeAnchor(item: OverlayAnchor): void {
    if (item.node) {
      placeMarkBox(item.mark, rangeBox(item.node, item.start || 0, item.end || 0));
      return;
    }
    if (item.el && item.label && item.start != null && item.end != null) {
      placeMarkBox(item.mark, sliceGlyph(item.el, item.label, item.start, item.end));
      return;
    }
    if (item.el) placeOverlay(item.mark, item.el);
  }

  function makeOverlayMark(rule: Scan.WrapRule, snippet: string, passive: boolean): HTMLElement {
    const host = ensureOverlayHost();
    const mark = document.createElement('div');
    mark.id = Scan.allocMarkId();
    mark.className = MARK_CLASS + ' slopspotter-overlay slopspotter-t' + rule.tier
      + (passive ? ' slopspotter-overlay-pass' : '');
    const seed = Number(String(mark.id).replace(/\D/g, '')) || 1;
    mark.style.setProperty('--ss-j', (0.86 + Scan.jitter(seed) * 0.14).toFixed(3));
    mark.style.setProperty('--ss-ang', (97 + Scan.jitter(seed + 3) * 4).toFixed(1) + 'deg');
    mark.style.setProperty('--ss-r', (0.16 + Scan.jitter(seed + 7) * 0.1).toFixed(3) + 'em');
    mark.style.borderRadius = 'var(--ss-r)';
    mark.setAttribute('data-slop', rule.name + ': ' + rule.why);
    mark.setAttribute('data-slop-id', rule.id || '');
    mark.setAttribute('data-slop-name', rule.name);
    mark.setAttribute('data-slop-why', rule.why);
    mark.setAttribute('data-slop-tier', String(rule.tier));
    mark.setAttribute('data-slop-snippet', snippet);
    if (rule.try) mark.setAttribute('data-slop-try', rule.try);
    host.appendChild(mark);
    return mark;
  }

  function paintOverlay(
    el: Element,
    rule: Scan.WrapRule,
    snippet: string,
    start?: number,
    end?: number,
    label?: string
  ): HTMLElement {
    const mark = makeOverlayMark(rule, snippet, false);
    overlayAnchors.push({ mark, el, start, end, label });
    placeAnchor(overlayAnchors[overlayAnchors.length - 1] as OverlayAnchor);
    return mark;
  }

  function paintRangeOverlay(
    node: Text,
    start: number,
    end: number,
    rule: Scan.WrapRule,
    snippet: string
  ): HTMLElement | null {
    const mark = makeOverlayMark(rule, snippet, true);
    overlayAnchors.push({ mark, node, start, end, passive: true });
    placeAnchor(overlayAnchors[overlayAnchors.length - 1] as OverlayAnchor);
    return mark;
  }

  function overlayAt(x: number, y: number): HTMLElement | null {
    for (let i = overlayAnchors.length - 1; i >= 0; i--) {
      const item = overlayAnchors[i];
      if (!item || !item.mark.isConnected) continue;
      const r = item.mark.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || item.mark.style.display === 'none') continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return item.mark;
    }
    return null;
  }

  function relayoutOverlays(): void {
    for (let i = overlayAnchors.length - 1; i >= 0; i--) {
      const item = overlayAnchors[i];
      if (!item) continue;
      const live = item.mark.isConnected
        && ((item.node && item.node.isConnected) || (item.el && item.el.isConnected));
      if (!live) {
        item.mark.remove();
        overlayAnchors.splice(i, 1);
        continue;
      }
      placeAnchor(item);
    }
  }

  function dropUi() {
    if (uiHost && uiHost.parentNode) uiHost.parentNode.removeChild(uiHost);
    uiHost = null;
    uiShadow = null;
    tipEl = null;
    flashBox = null;
  }

  function ensureUi() {
    if (uiHost && uiHost.isConnected && uiShadow && tipEl && flashBox) return;
    dropUi();
    document.querySelectorAll('[data-isslop="ui"]').forEach(function (n) {
      n.parentNode?.removeChild(n);
    });
    uiHost = document.createElement('div');
    uiHost.setAttribute('data-isslop', 'ui');
    uiHost.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 0',
      'height: 0',
      'overflow: visible',
      'pointer-events: none',
      'z-index: 2147483647'
    ].join(';');
    uiShadow = uiHost.attachShadow({ mode: 'closed' });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('highlight.css');
    uiShadow.appendChild(link);

    const tip = document.createElement('div');
    tip.className = 'slopspotter-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;

    const head = document.createElement('div');
    head.className = 'slopspotter-tip-head';
    const name = document.createElement('span');
    name.className = 'slopspotter-tip-name';
    const level = document.createElement('span');
    level.className = 'slopspotter-tip-level';
    head.append(name, level);

    const why = document.createElement('div');
    why.className = 'slopspotter-tip-why';

    const instead = document.createElement('div');
    instead.className = 'slopspotter-tip-instead';
    instead.hidden = true;
    const insteadKicker = document.createElement('div');
    insteadKicker.className = 'slopspotter-tip-kicker';
    insteadKicker.textContent = 'TRY INSTEAD';
    const insteadText = document.createElement('div');
    insteadText.className = 'slopspotter-tip-try';
    instead.append(insteadKicker, insteadText);

    const foot = document.createElement('div');
    foot.className = 'slopspotter-tip-foot';
    const words = document.createElement('span');
    words.className = 'slopspotter-tip-meta';
    const times = document.createElement('span');
    times.className = 'slopspotter-tip-meta';
    foot.append(words, times);

    tip.append(head, why, instead, foot);
    uiShadow.appendChild(tip);

    flashBox = document.createElement('div');
    flashBox.setAttribute('aria-hidden', 'true');
    uiShadow.appendChild(flashBox);

    document.documentElement.appendChild(uiHost);
    uiHost.classList.toggle(DARK_CLASS, document.documentElement.classList.contains(DARK_CLASS));
    tipEl = tip;
  }

  function getTip(): HTMLElement {
    ensureUi();
    if (!tipEl) throw new Error('tooltip missing');
    return tipEl;
  }

  function fillTip(tip: HTMLElement, mark: Element): void {
    const name = tip.querySelector('.slopspotter-tip-name');
    const level = tip.querySelector('.slopspotter-tip-level');
    const why = tip.querySelector('.slopspotter-tip-why');
    const instead = tip.querySelector('.slopspotter-tip-instead');
    const tryEl = tip.querySelector('.slopspotter-tip-try');
    const metas = tip.querySelectorAll('.slopspotter-tip-meta');
    const tier = mark.getAttribute('data-slop-tier');
    if (name) name.textContent = mark.getAttribute('data-slop-name') || '';
    if (level) level.textContent = TIER_NAME[tier || ''] || '';
    if (why) why.textContent = mark.getAttribute('data-slop-why') || '';

    const suggestion = mark.getAttribute('data-slop-try') || '';
    if (instead instanceof HTMLElement) {
      instead.hidden = !suggestion;
      if (tryEl) tryEl.textContent = suggestion;
    }

    const marked = (mark.getAttribute('data-slop-snippet') || mark.textContent || '').trim();
    const markedWords = marked.split(/\s+/).filter(Boolean).length;
    const ruleId = mark.getAttribute('data-slop-id');
    let times = 0;
    if (ruleId) {
      const marks = document.getElementsByClassName(MARK_CLASS);
      for (let i = 0; i < marks.length; i++) {
        if (marks[i].getAttribute('data-slop-id') === ruleId) times += 1;
      }
    }
    if (metas[0]) {
      metas[0].textContent = markedWords === 1 ? '1 flagged word' : markedWords + ' flagged words';
    }
    if (metas[1]) {
      metas[1].textContent = times === 1 ? '1× on this page' : times + '× on this page';
    }
  }

  function placeTip(tip: HTMLElement, rect: DOMRect): void {
    const pad = 8;
    const gap = 6;
    tip.style.left = '0px';
    tip.style.top = '0px';
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = rect.left;
    let top = rect.top - th - gap;
    if (top < pad) top = rect.bottom + gap;
    if (left + tw > window.innerWidth - pad) left = window.innerWidth - tw - pad;
    if (left < pad) left = pad;
    if (top + th > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - th - pad);
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }

  function hideTip() {
    if (pinnedMark) return;
    if (!tipEl) return;
    tipEl.hidden = true;
  }

  function showTipFor(mark: HTMLElement): void {
    const tip = getTip();
    fillTip(tip, mark);
    const rect = pickRect(mark);
    if (!rect) {
      tip.hidden = true;
      return;
    }
    placeTip(tip, rect);
  }

  function markFromEvent(e: Event): HTMLElement | null {
    const t = e.target;
    if (!(t instanceof Element)) return null;
    return t.closest('.' + MARK_CLASS);
  }

  listen(document, 'pointerover', function (e: Event) {
    const mark = markFromEvent(e);
    if (!mark) return;
    pinnedMark = null;
    showTipFor(mark);
  });

  listen(document, 'pointermove', function (e: Event) {
    const pe = e as PointerEvent;
    const fromDom = markFromEvent(e);
    const mark = fromDom || overlayAt(pe.clientX, pe.clientY);
    if (mark) {
      if (!fromDom && !pinnedMark) showTipFor(mark);
      if (!tipEl || tipEl.hidden) return;
      const rect = pickRect(mark, pe.clientX, pe.clientY);
      if (rect) placeTip(tipEl, rect);
      return;
    }
    if (!pinnedMark && tipEl && !tipEl.hidden && !fromDom) {
      const overlayTip = overlayAnchors.some(function (item) {
        return item.passive && item.mark.isConnected;
      });
      if (overlayTip) hideTip();
    }
  });

  listen(document, 'pointerout', function (e: Event) {
    if (pinnedMark) return;
    const from = markFromEvent(e);
    if (!from) return;
    const related = (e as PointerEvent).relatedTarget;
    const next = related instanceof Element
      ? related.closest('.' + MARK_CLASS)
      : null;
    if (from !== next) hideTip();
  });

  listen(window, 'scroll', function () {
    relayoutOverlays();
    layoutFlash();
    if (pinnedMark) {
      showTipFor(pinnedMark);
      return;
    }
    hideTip();
  }, true);
  listen(window, 'resize', function () {
    relayoutOverlays();
    layoutFlash();
    hideTip();
  });

  function clearHighlights() {
    pinnedMark = null;
    clearFlash();
    dropUi();
    dropOverlays();
    document.documentElement.classList.remove(
      DARK_CLASS, 'slopspotter-hide-t1', 'slopspotter-hide-t2', 'slopspotter-hide-t3'
    );
    Scan.reset();
    const marks = document.querySelectorAll('.' + MARK_CLASS);
    marks.forEach(function (mark) {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  function collectFindings() {
    const findings: import('./types').Finding[] = [];
    document.querySelectorAll('.' + MARK_CLASS).forEach(function (mark) {
      const text = (mark.getAttribute('data-slop-snippet') || mark.textContent || '')
        .replace(/\s+/g, ' ').trim();
      const tier = Number(mark.getAttribute('data-slop-tier') || 1);
      findings.push({
        id: mark.id,
        name: mark.getAttribute('data-slop-name') || '',
        snippet: text.length > 52 ? text.slice(0, 51) + '…' : text,
        tier: tier
      });
    });
    return findings;
  }

  function clearFlash() {
    flashMark = null;
    if (flashTimer) {
      window.clearTimeout(flashTimer);
      flashTimer = 0;
    }
    flashBox?.replaceChildren();
  }

  function layoutFlash() {
    if (!flashMark || !flashMark.isConnected) {
      if (flashMark) clearFlash();
      return;
    }
    ensureUi();
    if (!flashBox) return;
    flashBox.replaceChildren();
    const rects = flashMark.getClientRects();
    const n = rects.length;
    const radius = getComputedStyle(flashMark).borderRadius;
    const dir = getComputedStyle(flashMark).direction;
    const pad = 2;
    for (let i = 0; i < n; i++) {
      const r = rects[i];
      if (r.width < 1 || r.height < 1) continue;
      const piece = document.createElement('div');
      piece.className = 'slopspotter-flash-ring';
      if (i === 0) piece.classList.add('is-first');
      if (i === n - 1) piece.classList.add('is-last');
      if (i > 0 && i < n - 1) piece.classList.add('is-mid');
      piece.style.top = (r.top - pad) + 'px';
      piece.style.left = (r.left - pad) + 'px';
      piece.style.width = (r.width + pad * 2) + 'px';
      piece.style.height = (r.height + pad * 2) + 'px';
      piece.style.borderRadius = radius;
      piece.style.direction = dir;
      flashBox.appendChild(piece);
    }
  }

  function jumpTo(id: string): boolean {
    if (!MARK_ID_RE.test(id || '')) return false;
    const mark = document.getElementById(id);
    if (!mark || !mark.classList || !mark.classList.contains(MARK_CLASS)) return false;
    const anchor = overlayAnchors.find(function (item) { return item.mark === mark; });
    const target = (anchor && anchor.el && anchor.el.isConnected)
      ? anchor.el
      : (anchor && anchor.node && anchor.node.parentElement)
        ? anchor.node.parentElement
        : mark;
    pinnedMark = mark;
    target.scrollIntoView({ block: 'center', behavior: 'auto' });
    relayoutOverlays();
    showTipFor(mark);
    clearFlash();
    flashMark = mark;
    layoutFlash();
    flashTimer = window.setTimeout(function () {
      flashTimer = 0;
      if (pinnedMark === mark) pinnedMark = null;
      if (flashMark === mark) clearFlash();
    }, 5000);
    return true;
  }

  function applyInkScheme(scheme?: string): boolean {
    const dark = scheme === 'dark' ? true
      : scheme === 'light' ? false
      : pageIsDark();
    document.documentElement.classList.toggle(DARK_CLASS, dark);
    if (uiHost) uiHost.classList.toggle(DARK_CLASS, dark);
    return dark;
  }

  function applyTierFilter(hidden?: { 1?: boolean; 2?: boolean; 3?: boolean } | null): void {
    ([1, 2, 3] as const).forEach(function (tier) {
      document.documentElement.classList.toggle('slopspotter-hide-t' + tier, !!(hidden && hidden[tier]));
    });
    if (pinnedMark) {
      const tier = Number(pinnedMark.getAttribute('data-slop-tier'));
      if ((tier === 1 || tier === 2 || tier === 3) && hidden && hidden[tier]) {
        pinnedMark = null;
        hideTip();
      }
    }
  }

  function scanPage(scope: string): import('./types').PageSummary {
    pinnedMark = null;
    unrenderedCache = Scan.createCache();
    clearHighlights();

    const wantArticle = scope !== 'page';
    const picked = wantArticle ? pickContentRoot() : { root: document.body, kind: 'body' };
    const root = (picked.root && picked.root.nodeType === 1) ? picked.root : document.body;
    const onDark = applyInkScheme(detectSiteMode(root));

    const htmlLang = document.documentElement.lang
      || (document.querySelector('meta[http-equiv="content-language"]') as HTMLMetaElement | null)?.content
      || '';
    const empty = {
      score: 0,
      label: 'Reads human',
      wordCount: 0,
      onDark: onDark,
      scheme: (onDark ? 'dark' : 'light') as 'dark' | 'light',
      tiers: { 1: 0, 2: 0, 3: 0 },
      categories: [],
      findings: [],
      scope: (wantArticle ? 'article' : 'page') as 'article' | 'page',
      root: picked.kind || 'body'
    };

    const nodes = Scan.collectTextNodes(root, { stripChrome: wantArticle, cache: unrenderedCache });
    const ariaLabels = Scan.collectAriaText(root, { stripChrome: wantArticle, cache: unrenderedCache });
    const runs = Scan.groupTextRuns(nodes).map(function (group) {
      return Scan.joinTextRun(group);
    });
    let scannedText = '';
    const t0 = performance.now();
    let scannedChars = 0;

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (!run) continue;
      if (scannedChars >= MAX_SCAN_CHARS) break;
      if (performance.now() - t0 > MAX_SCAN_MS) break;
      scannedChars += run.text.length;
      scannedText += (scannedText ? '\n' : '') + run.text;
    }

    for (const item of ariaLabels) {
      if (scannedChars >= MAX_SCAN_CHARS) break;
      scannedChars += item.text.length;
      scannedText += (scannedText ? '\n' : '') + item.text;
    }

    const pack = detectPack(htmlLang, scannedText);
    const rules = pack && pack.rules;
    if (!engine || !rules) return empty;

    const wordCount = engine.countWords(scannedText);
    const dashCount = engine.countEmDashes(scannedText, pack);
    const flagDashes = engine.emDashShouldFlag(dashCount, wordCount, pack);

    const allMatches: import('./types').Match[] = [];
    const pendingFindings: import('./types').Finding[] = [];

    function takeMatches(text: string): import('./types').Match[] {
      let matches = engine.mergeOverlaps(engine.findMatches(text, rules));
      if (flagDashes) {
        matches = engine.mergeOverlaps(matches.concat(engine.findEmDashMatches(text, pack)));
      }
      return matches;
    }

    function rememberFindings(text: string, matches: import('./types').Match[]): void {
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        if (!m) continue;
        const snippet = text.slice(m.start, m.end).replace(/\s+/g, ' ').trim();
        pendingFindings.push({
          id: '',
          name: m.rule.name,
          snippet: snippet.length > 52 ? snippet.slice(0, 51) + '…' : snippet,
          tier: m.rule.tier
        });
      }
    }

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (!run || !run.text) continue;
      const matches = takeMatches(run.text);
      allMatches.push(...matches);
      rememberFindings(run.text, matches);
      const byNode = new Map<Text, Array<{ start: number; end: number; rule: Scan.WrapRule; snippet: string }>>();
      for (let j = 0; j < matches.length; j++) {
        const m = matches[j];
        if (!m) continue;
        const snippet = run.text.slice(m.start, m.end).replace(/\s+/g, ' ').trim();
        const bits = Scan.projectSpan(run.parts, m.start, m.end);
        for (let k = 0; k < bits.length; k++) {
          const bit = bits[k];
          if (!bit) continue;
          let list = byNode.get(bit.node);
          if (!list) {
            list = [];
            byNode.set(bit.node, list);
          }
          list.push({ start: bit.start, end: bit.end, rule: m.rule, snippet });
        }
      }
      byNode.forEach(function (list, node) {
        if (Scan.inContentEditable(node)) {
          for (let n = 0; n < list.length; n++) {
            const hit = list[n];
            if (!hit) continue;
            paintRangeOverlay(node, hit.start, hit.end, hit.rule, hit.snippet);
          }
          return;
        }
        Scan.applyMatches(node, list);
      });
    }
    for (const item of ariaLabels) {
      const matches = takeMatches(item.text);
      allMatches.push(...matches);
      rememberFindings(item.text, matches);
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        if (!m) continue;
        const snippet = item.text.slice(m.start, m.end).replace(/\s+/g, ' ').trim();
        paintOverlay(item.el, m.rule, snippet || item.text, m.start, m.end, item.text);
      }
    }

    const marked = collectFindings();
    const summary: import('./types').PageSummary = {
      ...engine.summarize(allMatches, wordCount),
      onDark,
      scheme: onDark ? 'dark' : 'light',
      findings: marked.length ? marked : pendingFindings,
      scope: wantArticle ? 'article' : 'page',
      root: picked.kind || 'body'
    };
    if (pack) {
      summary.pack = {
        id: pack.id,
        name: pack.name,
        verified: pack.verified !== false
      };
    }
    return summary;
  }

  function handleMessage(msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (r?: unknown) => void): void {
    if (!msg || typeof msg !== 'object' || !('type' in msg) || typeof (msg as { type: unknown }).type !== 'string') return;
    const data = msg as { type: string; scope?: string; scheme?: string; hidden?: { 1?: boolean; 2?: boolean; 3?: boolean }; id?: string };
    if (sender && sender.id && sender.id !== chrome.runtime.id) return;
    if (data.type === 'SLOP_PING') {
      sendResponse({ ok: true });
      return;
    }
    if (data.type === 'SLOP_SCAN') {
      const scope = data.scope === 'page' ? 'page' : 'article';
      sendResponse(scanPage(scope));
      return;
    }
    if (data.type === 'SLOP_SCHEME') {
      const scheme = data.scheme === 'dark' || data.scheme === 'light' ? data.scheme : undefined;
      sendResponse({ ok: true, onDark: applyInkScheme(scheme) });
      return;
    }
    if (data.type === 'SLOP_FILTER') {
      const src = data.hidden && typeof data.hidden === 'object' ? data.hidden : {};
      applyTierFilter({ 1: !!src[1], 2: !!src[2], 3: !!src[3] });
      sendResponse({ ok: true });
      return;
    }
    if (data.type === 'SLOP_JUMP') {
      sendResponse({ ok: jumpTo(typeof data.id === 'string' ? data.id : '') });
      return;
    }
    if (data.type === 'SLOP_CLEAR') {
      pinnedMark = null;
      clearHighlights();
      sendResponse({ ok: true });
    }
  }

  window.__slopspotterHandle = handleMessage;
  if (!window.__slopspotterMsgBound) {
    window.__slopspotterMsgBound = true;
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (typeof window.__slopspotterHandle === 'function') {
        return window.__slopspotterHandle(msg, sender, sendResponse);
      }
    });
  }

  window.__slopspotterTeardown = function () {
    pinnedMark = null;
    clearFlash();
    dropUi();
    dropOverlays();
    bound.forEach(function (item) {
      item[0].removeEventListener(item[1], item[2], item[3]);
    });
  };
