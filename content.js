(function () {
  if (window.__slopspotterLoaded) return;
  window.__slopspotterLoaded = true;

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE'
  ]);
  const MARK_CLASS = 'slopspotter-mark';
  const TIP_ID = 'slopspotter-tip';
  const MIN_TEXT_LEN = 20;

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

  function wrapRange(textNode, start, end, rule) {
    const text = textNode.nodeValue;
    if (start < 0 || end > text.length || start >= end) return textNode;

    const after = textNode.splitText(end);
    const matchNode = start > 0 ? textNode.splitText(start) : textNode;

    const mark = document.createElement('mark');
    mark.className = MARK_CLASS + ' slopspotter-t' + rule.tier;
    mark.setAttribute('data-slop', rule.name + ': ' + rule.why);
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

  function getTip() {
    let tip = document.getElementById(TIP_ID);
    if (!tip) {
      tip = document.createElement('div');
      tip.id = TIP_ID;
      tip.className = 'slopspotter-tip';
      tip.setAttribute('role', 'tooltip');
      tip.hidden = true;
      document.documentElement.appendChild(tip);
    }
    return tip;
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
    const tip = document.getElementById(TIP_ID);
    if (!tip) return;
    tip.hidden = true;
    tip.textContent = '';
  }

  function markFromEvent(e) {
    const t = e.target;
    if (!t || !t.closest) return null;
    return t.closest('.' + MARK_CLASS);
  }

  document.addEventListener('pointerover', function (e) {
    const mark = markFromEvent(e);
    if (!mark) return;
    const tip = getTip();
    tip.textContent = mark.getAttribute('data-slop') || '';
    placeTip(tip, fragmentRect(mark, e.clientX, e.clientY));
  });

  document.addEventListener('pointermove', function (e) {
    const mark = markFromEvent(e);
    const tip = document.getElementById(TIP_ID);
    if (!mark || !tip || tip.hidden) return;
    placeTip(tip, fragmentRect(mark, e.clientX, e.clientY));
  });

  document.addEventListener('pointerout', function (e) {
    const from = markFromEvent(e);
    if (!from) return;
    const next = e.relatedTarget && e.relatedTarget.closest
      ? e.relatedTarget.closest('.' + MARK_CLASS)
      : null;
    if (from !== next) hideTip();
  });

  window.addEventListener('scroll', hideTip, true);
  window.addEventListener('resize', hideTip);

  function clearHighlights() {
    hideTip();
    const tip = document.getElementById(TIP_ID);
    if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
    const marks = document.querySelectorAll('.' + MARK_CLASS);
    marks.forEach(function (mark) {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  function scanPage() {
    clearHighlights();

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
      return { score: 0, label: 'Reads human', wordCount: 0, tiers: { 1: 0, 2: 0, 3: 0 }, categories: [] };
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
    if (pack) {
      summary.pack = {
        id: pack.id,
        name: pack.name,
        verified: pack.verified !== false
      };
    }
    return summary;
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || !msg.type) return;
    if (msg.type === 'SCAN') {
      sendResponse(scanPage());
      return;
    }
    if (msg.type === 'CLEAR') {
      clearHighlights();
      sendResponse({ ok: true });
    }
  });
})();
