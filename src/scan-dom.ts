import type { Rule } from './types';

export const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE',
  'META', 'TEMPLATE', 'TITLE', 'LINK', 'HEAD', 'SLOT', 'SOURCE', 'TRACK'
]);
export const CHROME_TAGS = new Set(['NAV', 'FOOTER', 'ASIDE', 'MENU']);
export const CHROME_ROLES = new Set([
  'navigation', 'complementary', 'contentinfo',
  'dialog', 'alertdialog', 'menu', 'menubar', 'toolbar'
]);
export const MARK_CLASS = 'slopspotter-mark';
export const MARK_ID_RE = /^slopspotter-m-\d+$/;
export const EDITOR_ROLES = new Set(['textbox', 'searchbox', 'combobox']);
export const COMPOSE_ROLES = new Set(['searchbox', 'combobox']);
export const COMPOSE_CHROME_SEL = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';
export const MIN_DOC_EDITOR_WORDS = 20;
export const MIN_MULTILINE_DOC_WORDS = 8;
export const MAX_TEXT_NODES = 12000;

let markSeq = 0;

export function reset(): void {
  markSeq = 0;
}

export function allocMarkId(): string {
  return 'slopspotter-m-' + (++markSeq);
}

export function createCache(): WeakMap<Element, boolean> {
  return new WeakMap();
}

export function jitter(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function skipNode(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  if (SKIP_TAGS.has(node.nodeName.toUpperCase())) return true;
  const el = node as Element;
  if (el.classList && el.classList.contains(MARK_CLASS)) return true;
  return false;
}

export function isEditorRoot(el: Element | null): boolean {
  if (!el || el.nodeType !== 1) return false;
  if ((el as HTMLElement).isContentEditable === true) return true;
  if (el.hasAttribute('contenteditable')) {
    const v = (el.getAttribute('contenteditable') || '').toLowerCase();
    if (v !== 'false') return true;
  }
  const role = (el.getAttribute('role') || '').toLowerCase();
  return EDITOR_ROLES.has(role);
}

function editorWordCount(el: Element): number {
  const t = ((el as HTMLElement).innerText || el.textContent || '').trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function nearestEditorRoot(el: Element | null): Element | null {
  let node = el;
  while (node && node.nodeType === 1) {
    if (isEditorRoot(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function countShallowEditors(el: Element): number {
  if (isEditorRoot(el)) return 1;
  let n = 0;
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    if (child && isEditorRoot(child)) n += 1;
  }
  return n;
}

function siblingEditorCount(el: Element): number {
  const root = nearestEditorRoot(el);
  const parent = root && root.parentElement;
  if (!parent || parent === document.body || parent === document.documentElement) return 0;
  let n = 0;
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    if (!child) continue;
    if (inComposeChrome(child)) continue;
    const name = child.nodeName;
    if (name === 'MAIN' || name === 'ARTICLE' || name === 'HEADER' || name === 'NAV' || name === 'FOOTER' || name === 'ASIDE') {
      continue;
    }
    if (isEditorRoot(child) || countShallowEditors(child) === 1) n += 1;
  }
  return n;
}

function inComposeChrome(el: Element | null): boolean {
  return !!(el && el.closest(COMPOSE_CHROME_SEL));
}

function isLargeEditorBox(el: Element): boolean {
  const rect = (el as HTMLElement).getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const vh = window.innerHeight || 0;
  const vw = window.innerWidth || 0;
  if (vh < 1 || vw < 1) return false;
  return rect.height >= Math.min(280, vh * 0.3)
    || (rect.width >= vw * 0.45 && rect.height >= 160);
}

export function isDocumentSurface(el: Element | null): boolean {
  if (!el || el.nodeType !== 1) return false;
  if (inComposeChrome(el)) return false;
  if (siblingEditorCount(el) >= 3) return true;
  const root = nearestEditorRoot(el);
  if (!root || inComposeChrome(root)) return false;
  const words = editorWordCount(root);
  if (words >= MIN_DOC_EDITOR_WORDS) return true;
  if (isLargeEditorBox(root)) return true;
  const multi = el.closest('[aria-multiline="true"]');
  if (multi && !inComposeChrome(multi)) {
    const multiWords = editorWordCount(multi);
    if (multiWords >= MIN_MULTILINE_DOC_WORDS || isLargeEditorBox(multi)) return true;
  }
  return false;
}

export function isComposeField(el: Element | null): boolean {
  if (!isEditorRoot(el) || !el) return false;
  const role = (el.getAttribute('role') || '').toLowerCase();
  if (COMPOSE_ROLES.has(role)) return true;
  return !isDocumentSurface(el);
}

export function isPageChrome(el: Element | null): boolean {
  while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
    if (CHROME_TAGS.has(el.nodeName)) return true;
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (CHROME_ROLES.has(role)) return true;
    if (el.getAttribute('aria-modal') === 'true') return true;
    el = el.parentElement;
  }
  return false;
}

export function isUnrendered(el: Element | null, cache?: WeakMap<Element, boolean>): boolean {
  const map = cache || new WeakMap<Element, boolean>();
  const chain: Element[] = [];
  while (el && el.nodeType === 1) {
    if (map.has(el)) {
      const hit = map.get(el) === true;
      for (let i = 0; i < chain.length; i++) {
        const node = chain[i];
        if (node) map.set(node, hit);
      }
      return hit;
    }
    chain.push(el);
    const html = el as HTMLElement;
    if (skipNode(el) || isComposeField(el) || html.hidden) {
      for (let i = 0; i < chain.length; i++) {
        const node = chain[i];
        if (node) map.set(node, true);
      }
      return true;
    }
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') {
      for (let i = 0; i < chain.length; i++) {
        const node = chain[i];
        if (node) map.set(node, true);
      }
      return true;
    }
    el = el.parentElement;
  }
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    if (node) map.set(node, false);
  }
  return false;
}

export function collectTextNodes(
  root: Element,
  opts?: { stripChrome?: boolean; cache?: WeakMap<Element, boolean> }
): Text[] {
  const stripChrome = !!(opts && opts.stripChrome);
  const cache = (opts && opts.cache) || new WeakMap<Element, boolean>();
  const nodes: Text[] = [];
  if (document.designMode === 'on') return nodes;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (isUnrendered(parent, cache)) return NodeFilter.FILTER_REJECT;
      if (stripChrome && isPageChrome(parent)) return NodeFilter.FILTER_REJECT;
      const text = node.nodeValue || '';
      if (!text.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    nodes.push(n as Text);
    if (nodes.length >= MAX_TEXT_NODES) break;
  }
  return nodes;
}

function hasOwnText(el: Element): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if ((n.nodeValue || '').trim()) return true;
  }
  return false;
}

export type LineBox = { left: number; top: number; width: number; height: number };
export type AriaLabel = { el: Element; text: string };

export function sliceLineRect(
  box: LineBox,
  text: string,
  start: number,
  end: number,
  measure?: (s: string) => number
): LineBox {
  const len = text.length;
  if (!len || box.width < 2) return box;
  const from = Math.max(0, Math.min(start, len));
  const to = Math.max(from + 1, Math.min(end, len));
  let leftFrac = from / len;
  let widthFrac = (to - from) / len;
  if (measure) {
    const total = measure(text);
    if (total > 0) {
      const prefix = measure(text.slice(0, from));
      const hit = measure(text.slice(from, to));
      leftFrac = prefix / total;
      widthFrac = Math.max(hit, total / len) / total;
    }
  }
  return {
    left: box.left + box.width * leftFrac,
    top: box.top,
    width: Math.max(4, box.width * widthFrac),
    height: box.height
  };
}

export function collectAriaText(
  root: Element,
  opts?: { stripChrome?: boolean; cache?: WeakMap<Element, boolean> }
): AriaLabel[] {
  const stripChrome = !!(opts && opts.stripChrome);
  const labels: AriaLabel[] = [];
  const els = root.querySelectorAll('[aria-label]');
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (!el) continue;
    if (el.closest('button, input, select, textarea, nav, footer, aside, [role="button"], [role="menuitem"], [role="tab"], [role="toolbar"]')) {
      continue;
    }
    if (el.closest('a') && !el.closest('svg')) continue;
    if (stripChrome && isPageChrome(el)) continue;
    const label = (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    if (!label) continue;
    const graphic = !!el.closest('svg, canvas');
    if (!graphic && label.length < 12) continue;
    if (!graphic && hasOwnText(el)) continue;
    const prev = labels[labels.length - 1];
    if (prev && prev.text === label) continue;
    labels.push({ el, text: label });
  }
  return labels;
}

export function runRoot(node: Text): Element {
  const el = node.parentElement;
  if (!el) return node.ownerDocument.documentElement;
  const leaf = el.closest('[data-content-editable-leaf], [aria-multiline="true"]');
  if (leaf) return leaf;
  const block = el.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, pre, figcaption, dt, dd');
  if (block) return block;
  const editor = nearestEditorRoot(el);
  if (editor) return editor;
  return el;
}

export function groupTextRuns(nodes: Text[]): Text[][] {
  const groups = new Map<Element, Text[]>();
  const order: Element[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const key = runRoot(node);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
      order.push(key);
    }
    group.push(node);
  }
  return order.map((key) => groups.get(key) || []);
}

export type TextPart = { node: Text; start: number; end: number };

export function joinTextRun(nodes: Text[]): { text: string; parts: TextPart[] } {
  let text = '';
  const parts: TextPart[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const t = node.nodeValue || '';
    if (!t) continue;
    parts.push({ node, start: text.length, end: text.length + t.length });
    text += t;
  }
  return { text, parts };
}

export function projectSpan(
  parts: TextPart[],
  start: number,
  end: number
): Array<{ node: Text; start: number; end: number }> {
  const out: Array<{ node: Text; start: number; end: number }> = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const from = Math.max(start, part.start);
    const to = Math.min(end, part.end);
    if (from < to) out.push({ node: part.node, start: from - part.start, end: to - part.start });
  }
  return out;
}

export function inEditor(node: Node | null): boolean {
  if (typeof document !== 'undefined' && document.designMode === 'on') return true;
  let el: Element | null = node && node.nodeType === 1
    ? (node as Element)
    : (node && node.parentElement);
  while (el && el.nodeType === 1) {
    if (isComposeField(el)) return true;
    el = el.parentElement;
  }
  return false;
}

export function inContentEditable(node: Node | null): boolean {
  let el: Element | null = node && node.nodeType === 1
    ? (node as Element)
    : (node && node.parentElement);
  while (el && el.nodeType === 1) {
    if ((el as HTMLElement).isContentEditable === true) return true;
    el = el.parentElement;
  }
  return false;
}

export type WrapRule = Pick<Rule, 'id' | 'name' | 'why' | 'tier' | 'try'>;

export function wrapRange(textNode: Text, start: number, end: number, rule: WrapRule): Text {
  if (inEditor(textNode)) return textNode;
  if (textNode.parentElement && textNode.parentElement.closest('svg')) return textNode;
  const text = textNode.nodeValue || '';
  if (start < 0 || end > text.length || start >= end) return textNode;

  const after = textNode.splitText(end);
  const matchNode = start > 0 ? textNode.splitText(start) : textNode;

  const seed = ++markSeq;
  const mark = document.createElement('mark');
  mark.id = 'slopspotter-m-' + seed;
  mark.className = MARK_CLASS + ' slopspotter-t' + rule.tier;
  mark.style.setProperty('--ss-j', (0.86 + jitter(seed) * 0.14).toFixed(3));
  mark.style.setProperty('--ss-ang', (97 + jitter(seed + 3) * 4).toFixed(1) + 'deg');
  mark.style.setProperty('--ss-r', (0.16 + jitter(seed + 7) * 0.1).toFixed(3) + 'em');
  mark.style.borderRadius = 'var(--ss-r)';
  mark.setAttribute('data-slop', rule.name + ': ' + rule.why);
  mark.setAttribute('data-slop-id', rule.id || '');
  mark.setAttribute('data-slop-name', rule.name);
  mark.setAttribute('data-slop-why', rule.why);
  mark.setAttribute('data-slop-tier', String(rule.tier));
  if (rule.try) mark.setAttribute('data-slop-try', rule.try);
  if (matchNode.parentNode) {
    matchNode.parentNode.insertBefore(mark, matchNode);
    mark.appendChild(matchNode);
  }
  return after;
}

export function applyMatches(
  textNode: Text,
  matches: Array<{ start: number; end: number; rule: WrapRule }>
): void {
  const sorted = matches.slice().sort((a, b) => b.start - a.start);
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (!item) continue;
    wrapRange(textNode, item.start, item.end, item.rule);
  }
}
