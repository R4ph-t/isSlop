// Dual-env: browser global + Node. Requires rules.js to be loaded first in the browser.

const _rules = (typeof SLOP_RULES !== 'undefined')
  ? {
      SLOP_RULES,
      EM_DASH_RE,
      EM_DASH_RULE,
      EM_DASH_WORDS_PER_DASH,
      EM_DASH_MIN_COUNT,
      TIER_WEIGHT
    }
  : require('./rules.js');

const SCORE_MULTIPLIER = 25;

function countWords(text) {
  if (!text) return 0;
  const parts = text.trim().split(/\s+/);
  if (parts.length === 1 && parts[0] === '') return 0;
  return parts.length;
}

function findMatches(text, rules) {
  const matches = [];
  const list = rules || _rules.SLOP_RULES;
  for (const rule of list) {
    if (typeof rule.find === 'function') {
      const found = rule.find(text) || [];
      for (const m of found) {
        if (m.end > m.start) matches.push({ start: m.start, end: m.end, rule });
      }
      continue;
    }
    const re = rule.re;
    if (!re) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!m[0]) {
        re.lastIndex += 1;
        continue;
      }
      matches.push({ start: m.index, end: m.index + m[0].length, rule });
    }
  }
  return matches;
}

function mergeOverlaps(matches) {
  if (!matches.length) return [];
  const sorted = matches.slice().sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.rule.tier - a.rule.tier;
  });
  const merged = [{ start: sorted[0].start, end: sorted[0].end, rule: sorted[0].rule }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (cur.start < last.end) {
      if (cur.rule.tier > last.rule.tier) last.rule = cur.rule;
      if (cur.end > last.end) last.end = cur.end;
    } else {
      merged.push({ start: cur.start, end: cur.end, rule: cur.rule });
    }
  }
  return merged;
}

function countEmDashes(text) {
  const re = _rules.EM_DASH_RE;
  re.lastIndex = 0;
  let n = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    n += 1;
    if (!m[0]) re.lastIndex += 1;
  }
  return n;
}

function emDashShouldFlag(dashCount, wordCount) {
  if (dashCount < _rules.EM_DASH_MIN_COUNT) return false;
  return dashCount > wordCount / _rules.EM_DASH_WORDS_PER_DASH;
}

function findEmDashMatches(text) {
  const matches = [];
  const re = _rules.EM_DASH_RE;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!m[0]) {
      re.lastIndex += 1;
      continue;
    }
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      rule: _rules.EM_DASH_RULE
    });
  }
  return matches;
}

function scoreFromHits(matches, wordCount) {
  if (!wordCount) return 0;
  let weightedHits = 0;
  for (const m of matches) {
    weightedHits += _rules.TIER_WEIGHT[m.rule.tier] || 0;
  }
  const density = (weightedHits / wordCount) * 100;
  const score = Math.round(density * SCORE_MULTIPLIER);
  return Math.max(0, Math.min(100, score));
}

function scoreLabel(score) {
  if (score < 15) return 'Reads human';
  if (score < 40) return 'Some slop patterns';
  if (score < 70) return 'Heavy slop';
  return 'Slop city';
}

function summarize(matches, wordCount) {
  const score = scoreFromHits(matches, wordCount);
  const tiers = { 1: 0, 2: 0, 3: 0 };
  const catMap = new Map();
  for (const m of matches) {
    const tier = m.rule.tier;
    tiers[tier] = (tiers[tier] || 0) + 1;
    const cat = m.rule.category;
    const prev = catMap.get(cat) || { name: cat, count: 0, weight: 0 };
    prev.count += 1;
    prev.weight += _rules.TIER_WEIGHT[tier] || 0;
    catMap.set(cat, prev);
  }
  const categories = Array.from(catMap.values()).sort((a, b) => b.weight - a.weight || b.count - a.count);
  return {
    score,
    label: scoreLabel(score),
    wordCount,
    tiers,
    categories
  };
}

function scanText(text) {
  const wordCount = countWords(text);
  let matches = mergeOverlaps(findMatches(text, _rules.SLOP_RULES));
  if (emDashShouldFlag(countEmDashes(text), wordCount)) {
    matches = mergeOverlaps(matches.concat(findEmDashMatches(text)));
  }
  return { matches, ...summarize(matches, wordCount) };
}

const SlopEngine = {
  SCORE_MULTIPLIER,
  countWords,
  findMatches,
  mergeOverlaps,
  countEmDashes,
  emDashShouldFlag,
  findEmDashMatches,
  scoreFromHits,
  scoreLabel,
  summarize,
  scanText
};

if (typeof globalThis !== 'undefined') {
  globalThis.SlopEngine = SlopEngine;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SlopEngine;
}
