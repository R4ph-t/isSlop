// DOM walk + wrapRange. Dual-env: browser global + Node (jsdom tests).
// content.js owns chrome messaging and the tooltip; this file owns what
// touches the page tree so wrapRange can be tested without the shell.

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE',
  'META', 'TEMPLATE', 'TITLE', 'LINK', 'HEAD', 'SLOT', 'SOURCE', 'TRACK'
]);
const CHROME_TAGS = new Set(['NAV', 'FOOTER', 'ASIDE', 'MENU']);
const CHROME_ROLES = new Set([
  'navigation', 'complementary', 'contentinfo', 'banner', 'search',
  'dialog', 'alertdialog', 'menu', 'menubar'
]);
const CHROME_ATTR = /(?:^|[\s_-])(?:nav(?:bar|igation)?|sidebar|footer|cookie(?:s|banner|notice|consent)?|consent|onetrust|gdpr|newsletter|subscribe|mailchimp|comments?|disqus|related[-_]posts|social[-_]share|share[-_]buttons|advert(?:isement|orial)?|adsense|ad[-_]slot|paywall)(?:[\s_-]|$)/i;
const MARK_CLASS = 'slopspotter-mark';
const MARK_ID_RE = /^slopspotter-m-\d+$/;
const EDITOR_ROLES = new Set(['textbox', 'searchbox', 'combobox']);
const MIN_TEXT_LEN = 20;
const MAX_TEXT_NODES = 4000;

/** @type {number} */
let markSeq = 0;

function reset() {
  markSeq = 0;
}

function createCache() {
  return new WeakMap();
}

/**
 * @param {number} seed
 * @returns {number}
 */
function jitter(seed) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function skipNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  if (SKIP_TAGS.has(node.nodeName.toUpperCase())) return true;
  const el = /** @type {Element} */ (node);
  if (el.classList && el.classList.contains(MARK_CLASS)) return true;
  return false;
}

/**
 * @param {Element | null} el
 * @returns {boolean}
 */
function isEditorRoot(el) {
  if (!el || el.nodeType !== 1) return false;
  if (/** @type {HTMLElement} */ (el).isContentEditable === true) return true;
  if (el.hasAttribute('contenteditable')) {
    const v = (el.getAttribute('contenteditable') || '').toLowerCase();
    if (v !== 'false') return true;
  }
  const role = (el.getAttribute('role') || '').toLowerCase();
  return EDITOR_ROLES.has(role);
}

/**
 * @param {Element} el
 * @returns {string}
 */
function attrBlob(el) {
  const cls = typeof el.className === 'string' ? el.className : '';
  return ((el.id || '') + ' ' + cls).toLowerCase();
}

/**
 * @param {Element | null} el
 * @returns {boolean}
 */
function isPageChrome(el) {
  while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
    if (CHROME_TAGS.has(el.nodeName)) return true;
    if (el.nodeName === 'HEADER' && !el.closest('article')) return true;
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (CHROME_ROLES.has(role)) return true;
    if (el.getAttribute('aria-modal') === 'true') return true;
    if (CHROME_ATTR.test(attrBlob(el))) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * @param {Element | null} el
 * @param {WeakMap<Element, boolean>} [cache]
 * @returns {boolean}
 */
function isUnrendered(el, cache) {
  const map = cache || new WeakMap();
  const chain = [];
  while (el && el.nodeType === 1) {
    if (map.has(el)) {
      const hit = map.get(el);
      for (let i = 0; i < chain.length; i++) map.set(chain[i], hit);
      return hit;
    }
    chain.push(el);
    const html = /** @type {HTMLElement} */ (el);
    if (skipNode(el) || isEditorRoot(el) || html.hidden || el.getAttribute('aria-hidden') === 'true') {
      for (let i = 0; i < chain.length; i++) map.set(chain[i], true);
      return true;
    }
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') {
      for (let i = 0; i < chain.length; i++) map.set(chain[i], true);
      return true;
    }
    if (cs.contentVisibility === 'hidden') {
      for (let i = 0; i < chain.length; i++) map.set(chain[i], true);
      return true;
    }
    if (cs.opacity === '0') {
      for (let i = 0; i < chain.length; i++) map.set(chain[i], true);
      return true;
    }
    const fontPx = parseFloat(cs.fontSize);
    if (Number.isFinite(fontPx) && fontPx === 0) {
      for (let i = 0; i < chain.length; i++) map.set(chain[i], true);
      return true;
    }
    el = el.parentElement;
  }
  for (let i = 0; i < chain.length; i++) map.set(chain[i], false);
  return false;
}

/**
 * @param {Element} root
 * @param {{ stripChrome?: boolean, cache?: WeakMap<Element, boolean> }} [opts]
 * @returns {Text[]}
 */
function collectTextNodes(root, opts) {
  const stripChrome = !!(opts && opts.stripChrome);
  const cache = (opts && opts.cache) || new WeakMap();
  const nodes = [];
  if (document.designMode === 'on') return nodes;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (isUnrendered(parent, cache)) return NodeFilter.FILTER_REJECT;
      if (stripChrome && isPageChrome(parent)) return NodeFilter.FILTER_REJECT;
      const text = node.nodeValue || '';
      if (text.length < MIN_TEXT_LEN) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n;
  while ((n = walker.nextNode())) {
    nodes.push(/** @type {Text} */ (n));
    if (nodes.length >= MAX_TEXT_NODES) break;
  }
  return nodes;
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function inEditor(node) {
  if (typeof document !== 'undefined' && document.designMode === 'on') return true;
  let el = node && node.nodeType === 1 ? /** @type {Element} */ (node) : node && node.parentElement;
  while (el && el.nodeType === 1) {
    if (isEditorRoot(el)) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * @param {Text} textNode
 * @param {number} start
 * @param {number} end
 * @param {{ id?: string, name: string, why: string, tier: number, try?: string }} rule
 * @returns {Text}
 */
function wrapRange(textNode, start, end, rule) {
  if (inEditor(textNode)) return textNode;
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

/**
 * @param {Text} textNode
 * @param {Array<{ start: number, end: number, rule: { id?: string, name: string, why: string, tier: number, try?: string } }>} matches
 */
function applyMatches(textNode, matches) {
  const sorted = matches.slice().sort(function (a, b) {
    return b.start - a.start;
  });
  for (let i = 0; i < sorted.length; i++) {
    wrapRange(textNode, sorted[i].start, sorted[i].end, sorted[i].rule);
  }
}

const SlopScanDom = {
  MARK_CLASS,
  MARK_ID_RE,
  MIN_TEXT_LEN,
  MAX_TEXT_NODES,
  skipNode,
  isEditorRoot,
  inEditor,
  isPageChrome,
  isUnrendered,
  collectTextNodes,
  wrapRange,
  applyMatches,
  reset,
  createCache
};

if (typeof globalThis !== 'undefined') {
  globalThis.SlopScanDom = SlopScanDom;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SlopScanDom;
}
