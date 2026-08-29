(function () {
  if (typeof window.__slopspotterTeardown === 'function') {
    window.__slopspotterTeardown();
  }

  const Scan = window.SlopScanDom;
  if (!Scan) return;

  const MARK_CLASS = Scan.MARK_CLASS;
  const MARK_ID_RE = Scan.MARK_ID_RE;
  const DARK_CLASS = 'slopspotter-on-dark';
  const MAX_SCAN_CHARS = 200000;
  const MAX_SCAN_MS = 450;
  const TIER_NAME = { 3: 'HEAVY', 2: 'MEDIUM', 1: 'LIGHT' };

  let pinnedMark = null;
  let flashMark = null;
  let flashTimer = 0;
  let unrenderedCache = Scan.createCache();
  let uiHost = null;
  let uiShadow = null;
  let tipEl = null;
  let flashBox = null;
  const bound = [];

  function listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    bound.push([target, type, fn, opts]);
  }

  function countVisibleWords(el) {
    if (!el) return 0;
    const t = (el.innerText || '').trim();
    if (!t) return 0;
    return t.split(/\s+/).length;
  }

  function listTopLevel(selector) {
    const all = Array.from(document.querySelectorAll(selector));
    return all.filter(function (el) {
      const parent = el.parentElement;
      return !parent || !parent.closest(selector);
    });
  }

  function pickContentRoot() {
    const minWords = 80;
    const articles = listTopLevel('article').map(function (el) {
      return { el: el, w: countVisibleWords(el) };
    }).filter(function (item) {
      return item.w >= minWords;
    }).sort(function (a, b) {
      return b.w - a.w;
    });

    if (articles.length === 1) return { root: articles[0].el, kind: 'article' };
    if (articles.length > 1 && articles[0].w >= articles[1].w * 2.5) {
      return { root: articles[0].el, kind: 'article' };
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
    if (hookScores.length === 1) return { root: hookScores[0].el, kind: 'article' };
    if (hookScores.length > 1 && hookScores[0].w >= hookScores[1].w * 2.5) {
      return { root: hookScores[0].el, kind: 'article' };
    }

    const main = document.querySelector('main, [role="main"]');
    if (main && countVisibleWords(main) >= minWords) return { root: main, kind: 'main' };

    return { root: document.body, kind: 'body' };
  }

  /* ── page luminance: decides multiply vs screen ink ─────────────── */

  function luminance(color) {
    const m = /rgba?\(([^)]+)\)/.exec(color || '');
    if (!m) return null;
    const p = m[1].split(',').map(function (v) { return parseFloat(v); });
    if (p.length > 3 && p[3] === 0) return null;
    return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
  }

  function pageIsDark() {
    let el = document.body;
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

  function tokenMode(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    const first = raw.split(/[\s,/|_]+/)[0];
    if (DARK_THEME_TOKENS.has(first)) return 'dark';
    if (LIGHT_THEME_TOKENS.has(first)) return 'light';
    return null;
  }

  function classMode(el) {
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

  function attrMode(el) {
    if (!el || !el.getAttribute) return null;
    for (let i = 0; i < THEME_ATTRS.length; i++) {
      const mode = tokenMode(el.getAttribute(THEME_ATTRS[i]));
      if (mode) return mode;
    }
    if (el.hasAttribute('dark') && !el.hasAttribute('light')) return 'dark';
    if (el.hasAttribute('light') && !el.hasAttribute('dark')) return 'light';
    return null;
  }

  function colorSchemeMode(el) {
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

  function detectSiteMode() {
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

  function usableRects(el) {
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

  function pickRect(el, x, y) {
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

  /* ── tooltip / flash: closed shadow so the page cannot clobber ids ── */

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
      n.parentNode.removeChild(n);
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
    tipEl = tip;
  }

  function getTip() {
    ensureUi();
    return tipEl;
  }

  function fillTip(tip, mark) {
    const name = tip.querySelector('.slopspotter-tip-name');
    const level = tip.querySelector('.slopspotter-tip-level');
    const why = tip.querySelector('.slopspotter-tip-why');
    const instead = tip.querySelector('.slopspotter-tip-instead');
    const tryEl = tip.querySelector('.slopspotter-tip-try');
    const metas = tip.querySelectorAll('.slopspotter-tip-meta');
    const tier = mark.getAttribute('data-slop-tier');
    if (name) name.textContent = mark.getAttribute('data-slop-name') || '';
    if (level) level.textContent = TIER_NAME[tier] || '';
    if (why) why.textContent = mark.getAttribute('data-slop-why') || '';

    const suggestion = mark.getAttribute('data-slop-try') || '';
    if (instead) {
      instead.hidden = !suggestion;
      if (tryEl) tryEl.textContent = suggestion;
    }

    const marked = (mark.textContent || '').trim().split(/\s+/).filter(Boolean).length;
    const ruleId = mark.getAttribute('data-slop-id');
    let times = 0;
    if (ruleId) {
      const marks = document.getElementsByClassName(MARK_CLASS);
      for (let i = 0; i < marks.length; i++) {
        if (marks[i].getAttribute('data-slop-id') === ruleId) times += 1;
      }
    }
    if (metas[0]) {
      metas[0].textContent = marked === 1 ? '1 flagged word' : marked + ' flagged words';
    }
    if (metas[1]) {
      metas[1].textContent = times === 1 ? '1× on this page' : times + '× on this page';
    }
  }

  function placeTip(tip, rect) {
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

  function showTipFor(mark) {
    const tip = getTip();
    fillTip(tip, mark);
    const rect = pickRect(mark);
    if (!rect) {
      tip.hidden = true;
      return;
    }
    placeTip(tip, rect);
  }

  function markFromEvent(e) {
    const t = e.target;
    if (!t || !t.closest) return null;
    return t.closest('.' + MARK_CLASS);
  }

  listen(document, 'pointerover', function (e) {
    const mark = markFromEvent(e);
    if (!mark) return;
    pinnedMark = null;
    showTipFor(mark);
  });

  listen(document, 'pointermove', function (e) {
    const mark = markFromEvent(e);
    if (!mark || !tipEl || tipEl.hidden) return;
    const rect = pickRect(mark, e.clientX, e.clientY);
    if (rect) placeTip(tipEl, rect);
  });

  listen(document, 'pointerout', function (e) {
    if (pinnedMark) return;
    const from = markFromEvent(e);
    if (!from) return;
    const next = e.relatedTarget && e.relatedTarget.closest
      ? e.relatedTarget.closest('.' + MARK_CLASS)
      : null;
    if (from !== next) hideTip();
  });

  listen(window, 'scroll', function () {
    layoutFlash();
    if (pinnedMark) {
      showTipFor(pinnedMark);
      return;
    }
    hideTip();
  }, true);
  listen(window, 'resize', function () {
    layoutFlash();
    hideTip();
  });

  function clearHighlights() {
    pinnedMark = null;
    clearFlash();
    dropUi();
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
    const findings = [];
    document.querySelectorAll('.' + MARK_CLASS).forEach(function (mark) {
      const text = (mark.textContent || '').replace(/\s+/g, ' ').trim();
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
    if (flashBox) flashBox.replaceChildren();
  }

  function layoutFlash() {
    if (!flashMark || !flashMark.isConnected) {
      if (flashMark) clearFlash();
      return;
    }
    ensureUi();
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

  function jumpTo(id) {
    if (!MARK_ID_RE.test(id || '')) return false;
    const mark = document.getElementById(id);
    if (!mark || !mark.classList || !mark.classList.contains(MARK_CLASS)) return false;
    pinnedMark = mark;
    mark.scrollIntoView({ block: 'center', behavior: 'auto' });
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

  function applyInkScheme(scheme) {
    const dark = scheme === 'dark' ? true
      : scheme === 'light' ? false
      : pageIsDark();
    document.documentElement.classList.toggle(DARK_CLASS, dark);
    return dark;
  }

  function applyTierFilter(hidden) {
    [1, 2, 3].forEach(function (tier) {
      document.documentElement.classList.toggle('slopspotter-hide-t' + tier, !!(hidden && hidden[tier]));
    });
    if (pinnedMark) {
      const tier = Number(pinnedMark.getAttribute('data-slop-tier'));
      if (hidden && hidden[tier]) {
        pinnedMark = null;
        hideTip();
      }
    }
  }

  function scanPage(scope, scheme) {
    pinnedMark = null;
    unrenderedCache = Scan.createCache();
    clearHighlights();

    const use = (scheme === 'dark' || scheme === 'light') ? scheme : detectSiteMode();
    const onDark = applyInkScheme(use);

    const wantArticle = scope !== 'page';
    const picked = wantArticle ? pickContentRoot() : { root: document.body, kind: 'body' };
    const root = (picked.root && picked.root.nodeType === 1) ? picked.root : document.body;

    const engine = window.SlopEngine;
    const packs = window.SlopPacks;
    const htmlLang = document.documentElement.lang
      || (document.querySelector('meta[http-equiv="content-language"]') || {}).content
      || '';
    const sample = root.innerText ? root.innerText.slice(0, 4000) : '';
    const pack = (packs && packs.detect)
      ? (packs.detect(htmlLang, sample) || packs.current())
      : packs && packs.current && packs.current();
    const rules = pack && pack.rules;
    const empty = {
      score: 0,
      label: 'Reads human',
      wordCount: 0,
      onDark: onDark,
      scheme: onDark ? 'dark' : 'light',
      tiers: { 1: 0, 2: 0, 3: 0 },
      categories: [],
      findings: [],
      scope: wantArticle ? 'article' : 'page',
      root: picked.kind || 'body'
    };
    if (!engine || !rules) return empty;

    const nodes = Scan.collectTextNodes(root, { stripChrome: wantArticle, cache: unrenderedCache });
    let scannedText = '';
    const nodeMatches = [];
    const t0 = performance.now();
    let scannedChars = 0;

    for (const node of nodes) {
      if (scannedChars >= MAX_SCAN_CHARS) break;
      if (performance.now() - t0 > MAX_SCAN_MS) break;
      const text = node.nodeValue || '';
      scannedChars += text.length;
      scannedText += (scannedText ? ' ' : '') + text;
      const matches = engine.mergeOverlaps(engine.findMatches(text, rules));
      nodeMatches.push({ node, text, matches });
    }

    const wordCount = engine.countWords(scannedText);
    const dashCount = engine.countEmDashes(scannedText, pack);
    const flagDashes = engine.emDashShouldFlag(dashCount, wordCount, pack);

    const allMatches = [];
    for (const item of nodeMatches) {
      let matches = item.matches;
      if (flagDashes) {
        matches = engine.mergeOverlaps(matches.concat(engine.findEmDashMatches(item.text, pack)));
      }
      Scan.applyMatches(item.node, matches);
      allMatches.push.apply(allMatches, matches);
    }

    const summary = engine.summarize(allMatches, wordCount);
    summary.onDark = onDark;
    summary.scheme = onDark ? 'dark' : 'light';
    summary.findings = collectFindings();
    summary.scope = wantArticle ? 'article' : 'page';
    summary.root = picked.kind || 'body';
    if (pack) {
      summary.pack = {
        id: pack.id,
        name: pack.name,
        verified: pack.verified !== false
      };
    }
    return summary;
  }

  function handleMessage(msg, sender, sendResponse) {
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    if (sender && sender.id && sender.id !== chrome.runtime.id) return;
    if (msg.type === 'SLOP_PING') {
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'SLOP_SCAN') {
      const scope = msg.scope === 'page' ? 'page' : 'article';
      const scheme = msg.scheme === 'dark' || msg.scheme === 'light' ? msg.scheme : undefined;
      sendResponse(scanPage(scope, scheme));
      return;
    }
    if (msg.type === 'SLOP_SCHEME') {
      const scheme = msg.scheme === 'dark' || msg.scheme === 'light' ? msg.scheme : undefined;
      sendResponse({ ok: true, onDark: applyInkScheme(scheme) });
      return;
    }
    if (msg.type === 'SLOP_FILTER') {
      const src = msg.hidden && typeof msg.hidden === 'object' ? msg.hidden : {};
      applyTierFilter({ 1: !!src[1], 2: !!src[2], 3: !!src[3] });
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'SLOP_JUMP') {
      sendResponse({ ok: jumpTo(typeof msg.id === 'string' ? msg.id : '') });
      return;
    }
    if (msg.type === 'SLOP_CLEAR') {
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
    bound.forEach(function (item) {
      item[0].removeEventListener(item[1], item[2], item[3]);
    });
  };
})();
