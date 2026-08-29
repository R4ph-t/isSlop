// Dual-env: browser global + Node. Packs must be loaded first in the browser
// (finders.js → packs/registry.js → packs/<id>.js). Node loads them here.

const TIER_WEIGHT = { 3: 4, 2: 2, 1: 1 };
const SCORE_MULTIPLIER = 25;

function packsLoaded() {
  return typeof globalThis !== 'undefined'
    && Array.isArray(globalThis.SLOP_PACKS)
    && globalThis.SLOP_PACKS.length > 0;
}

function ensurePacksLoaded() {
  if (packsLoaded()) return;
  if (typeof require !== 'function') return;
  require('./finders.js');
  const { SLOP_PACK_IDS } = require('./packs/registry.js');
  for (let i = 0; i < SLOP_PACK_IDS.length; i++) {
    require('./packs/' + SLOP_PACK_IDS[i] + '.js');
  }
}

function currentPack(pack) {
  if (pack) return pack;
  ensurePacksLoaded();
  if (typeof SlopPacks !== 'undefined' && typeof SlopPacks.current === 'function') {
    return SlopPacks.current();
  }
  return require('./packs/registry.js').activePack();
}

ensurePacksLoaded();

function countWords(text) {
  if (!text) return 0;
  const parts = text.trim().split(/\s+/);
  if (parts.length === 1 && parts[0] === '') return 0;
  return parts.length;
}

function findMatches(text, rules) {
  const matches = [];
  const list = rules || currentPack().rules;
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

function countEmDashes(text, pack) {
  const cfg = currentPack(pack) && currentPack(pack).emDash;
  if (!cfg || !cfg.re) return 0;
  const re = cfg.re;
  re.lastIndex = 0;
  let n = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    n += 1;
    if (!m[0]) re.lastIndex += 1;
  }
  return n;
}

function emDashShouldFlag(dashCount, wordCount, pack) {
  const cfg = currentPack(pack) && currentPack(pack).emDash;
  if (!cfg) return false;
  if (dashCount < cfg.minCount) return false;
  return dashCount > wordCount / cfg.wordsPerDash;
}

function findEmDashMatches(text, pack) {
  const cfg = currentPack(pack) && currentPack(pack).emDash;
  if (!cfg || !cfg.re) return [];
  const matches = [];
  const re = cfg.re;
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
      rule: cfg.rule
    });
  }
  return matches;
}

function scoreFromHits(matches, wordCount) {
  if (!wordCount) return 0;
  let weightedHits = 0;
  for (const m of matches) {
    weightedHits += TIER_WEIGHT[m.rule.tier] || 0;
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
    prev.weight += TIER_WEIGHT[tier] || 0;
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

function scanText(text, pack) {
  pack = currentPack(pack);
  const wordCount = countWords(text);
  let matches = mergeOverlaps(findMatches(text, pack.rules));
  if (emDashShouldFlag(countEmDashes(text, pack), wordCount, pack)) {
    matches = mergeOverlaps(matches.concat(findEmDashMatches(text, pack)));
  }
  return { matches, ...summarize(matches, wordCount) };
}

const SlopEngine = {
  SCORE_MULTIPLIER,
  TIER_WEIGHT,
  countWords,
  findMatches,
  mergeOverlaps,
  countEmDashes,
  emDashShouldFlag,
  findEmDashMatches,
  scoreFromHits,
  scoreLabel,
  summarize,
  scanText,
  currentPack
};

if (typeof globalThis !== 'undefined') {
  globalThis.SlopEngine = SlopEngine;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SlopEngine;
}
