(function () {
  if (typeof window.__slopspotterTeardown === 'function') {
    window.__slopspotterTeardown();
  }

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE'
  ]);
  const MARK_CLASS = 'slopspotter-mark';
  const TIP_ID = 'slopspotter-tip';
  const DARK_CLASS = 'slopspotter-on-dark';
  const MIN_TEXT_LEN = 20;
  const TIER_NAME = { 3: 'HEAVY', 2: 'MEDIUM', 1: 'LIGHT' };

  let markSeq = 0;
  let pinnedMark = null;
  const bound = [];

  function listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    bound.push([target, type, fn, opts]);
  }

  function skipNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    if (SKIP_TAGS.has(node.nodeName.toUpperCase())) return true;
    if (node.classList && node.classList.contains(MARK_CLASS)) return true;
    return false;
  }

  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (skipNode(parent)) return NodeFilter.FILTER_REJECT;
        let el = parent;
        while (el) {
          if (skipNode(el)) return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }
        const text = node.nodeValue || '';
        if (text.length < MIN_TEXT_LEN) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
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
    // no opaque background anywhere: fall back to the text color
    const textLum = luminance(getComputedStyle(document.body).color);
    return textLum !== null && textLum > 0.6;
  }

  /* ── marking ───────────────────────────────────────────────────────── */

  // deterministic per-mark jitter so a stroke never looks stamped, but also
  // never changes between renders of the same page
  function jitter(seed) {
    const x = Math.sin(seed * 127.1) * 43758.5453;
    return x - Math.floor(x);
  }

  function wrapRange(textNode, start, end, rule) {
    const text = textNode.nodeValue;
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
    matchNode.parentNode.insertBefore(mark, matchNode);
    mark.appendChild(matchNode);
    return after;
  }

  function applyMatches(textNode, matches) {
    const sorted = matches.slice().sort((a, b) => b.start - a.start);
    for (const m of sorted) {
      wrapRange(textNode, m.start, m.end, m.rule);
    }
  }

  function fragmentRect(el, x, y) {
    const rects = el.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1) {
        return r;
      }
    }
    return rects[0] || el.getBoundingClientRect();
  }

  /* ── tooltip ───────────────────────────────────────────────────────── */

  function getTip() {
    let tip = document.getElementById(TIP_ID);
    if (tip && !tip.querySelector('.slopspotter-tip-foot')) {
      tip.parentNode.removeChild(tip);
      tip = null;
    }
    if (!tip) {
      tip = document.createElement('div');
      tip.id = TIP_ID;
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
      document.documentElement.appendChild(tip);
    }
    return tip;
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
      times = document.querySelectorAll('.' + MARK_CLASS + '[data-slop-id="' + ruleId + '"]').length;
    }
    if (metas[0]) {
      metas[0].textContent = marked === 1 ? '1 flagged word' : marked + ' flagged words';
    }
    if (metas[1]) {
      metas[1].textContent = times === 1 ? '1x on this page' : times + 'x on this page';
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
    const tip = document.getElementById(TIP_ID);
    if (!tip) return;
    tip.hidden = true;
  }

  function showTipFor(mark) {
    const tip = getTip();
    fillTip(tip, mark);
    const rects = mark.getClientRects();
    placeTip(tip, rects[0] || mark.getBoundingClientRect());
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
    const tip = document.getElementById(TIP_ID);
    if (!mark || !tip || tip.hidden) return;
    placeTip(tip, fragmentRect(mark, e.clientX, e.clientY));
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
    if (pinnedMark) {
      showTipFor(pinnedMark);
      return;
    }
    hideTip();
  }, true);
  listen(window, 'resize', hideTip);

  function clearHighlights() {
    hideTip();
    const tip = document.getElementById(TIP_ID);
    if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
    document.documentElement.classList.remove(DARK_CLASS);
    markSeq = 0;
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

  function jumpTo(id) {
    const mark = document.getElementById(id);
    if (!mark) return false;
    pinnedMark = mark;
    mark.scrollIntoView({ block: 'center', behavior: 'auto' });
    showTipFor(mark);
    mark.classList.remove('slopspotter-flash');
    void mark.offsetWidth;
    mark.classList.add('slopspotter-flash');
    window.setTimeout(function () {
      if (pinnedMark === mark) pinnedMark = null;
      mark.classList.remove('slopspotter-flash');
    }, 5000);
    return true;
  }

  function scanPage() {
    pinnedMark = null;
    clearHighlights();

    const onDark = pageIsDark();
    document.documentElement.classList.toggle(DARK_CLASS, onDark);

    const engine = window.SlopEngine;
    const packs = window.SlopPacks;
    const htmlLang = document.documentElement.lang
      || (document.querySelector('meta[http-equiv="content-language"]') || {}).content
      || '';
    const sample = document.body && document.body.innerText
      ? document.body.innerText.slice(0, 4000)
      : '';
    const pack = (packs && packs.detect)
      ? (packs.detect(htmlLang, sample) || packs.current())
      : packs && packs.current && packs.current();
    const rules = pack && pack.rules;
    if (!engine || !rules) {
      return { score: 0, label: 'Reads human', wordCount: 0, onDark: onDark, tiers: { 1: 0, 2: 0, 3: 0 }, categories: [], findings: [] };
    }

    const nodes = collectTextNodes(document.body);
    let scannedText = '';
    const nodeMatches = [];

    for (const node of nodes) {
      const text = node.nodeValue || '';
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
      applyMatches(item.node, matches);
      allMatches.push.apply(allMatches, matches);
    }

    const summary = engine.summarize(allMatches, wordCount);
    summary.onDark = onDark;
    summary.findings = collectFindings();
    if (pack) {
      summary.pack = {
        id: pack.id,
        name: pack.name,
        verified: pack.verified !== false
      };
    }
    return summary;
  }

  function handleMessage(msg, _sender, sendResponse) {
    if (!msg || !msg.type) return;
    if (msg.type === 'SLOP_SCAN') {
      sendResponse(scanPage());
      return;
    }
    if (msg.type === 'SLOP_JUMP') {
      sendResponse({ ok: jumpTo(msg.id) });
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
    bound.forEach(function (item) {
      item[0].removeEventListener(item[1], item[2], item[3]);
    });
  };
})();
