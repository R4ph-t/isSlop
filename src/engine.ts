import type { Match, Pack, Rule, ScanResult, Summary, Tiers } from './types';
import { activePack } from './packs/registry';
import './packs';

export const TIER_WEIGHT: Record<number, number> = { 3: 4, 2: 2, 1: 1 };
export const SCORE_MULTIPLIER = 25;

export function currentPack(pack?: Pack | null): Pack {
  return pack || activePack();
}

export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const parts = text.trim().split(/\s+/);
  if (parts.length === 1 && parts[0] === '') return 0;
  return parts.length;
}

export function eachGlobalMatch(
  re: RegExp,
  text: string | null | undefined,
  fn: (m: RegExpExecArray) => void
): void {
  if (!re || text == null) return;
  let g = re;
  if (!re.global) {
    try {
      g = new RegExp(re.source, re.flags + 'g');
    } catch {
      return;
    }
  }
  g.lastIndex = 0;
  const limit = String(text).length + 1;
  let steps = 0;
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    if (++steps > limit) break;
    if (!m[0]) {
      g.lastIndex += 1;
      continue;
    }
    fn(m);
  }
}

export function findMatches(text: string, rules?: Rule[]): Match[] {
  const matches: Match[] = [];
  const list = rules || currentPack().rules;
  for (const rule of list) {
    if (typeof rule.find === 'function') {
      const found = rule.find(text) || [];
      for (const span of found) {
        if (span.end > span.start) matches.push({ start: span.start, end: span.end, rule });
      }
      continue;
    }
    if (!rule.re) continue;
    eachGlobalMatch(rule.re, text, (m) => {
      const index = m.index ?? 0;
      matches.push({ start: index, end: index + m[0].length, rule });
    });
  }
  return matches;
}

export function mergeOverlaps(matches: Match[]): Match[] {
  if (!matches.length) return [];
  const sorted = matches.slice().sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.rule.tier - a.rule.tier;
  });
  const first = sorted[0];
  if (!first) return [];
  const merged: Match[] = [{ start: first.start, end: first.end, rule: first.rule }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (!cur || !last) continue;
    if (cur.start < last.end) {
      if (cur.rule.tier > last.rule.tier) last.rule = cur.rule;
      if (cur.end > last.end) last.end = cur.end;
    } else {
      merged.push({ start: cur.start, end: cur.end, rule: cur.rule });
    }
  }
  return merged;
}

export function countEmDashes(text: string, pack?: Pack | null): number {
  const cfg = currentPack(pack).emDash;
  if (!cfg || !cfg.re) return 0;
  let n = 0;
  eachGlobalMatch(cfg.re, text, () => {
    n += 1;
  });
  return n;
}

export function emDashShouldFlag(dashCount: number, wordCount: number, pack?: Pack | null): boolean {
  const cfg = currentPack(pack).emDash;
  if (!cfg) return false;
  if (dashCount < cfg.minCount) return false;
  return dashCount > wordCount / cfg.wordsPerDash;
}

export function findEmDashMatches(text: string, pack?: Pack | null): Match[] {
  const cfg = currentPack(pack).emDash;
  if (!cfg || !cfg.re) return [];
  const matches: Match[] = [];
  eachGlobalMatch(cfg.re, text, (m) => {
    const index = m.index ?? 0;
    matches.push({
      start: index,
      end: index + m[0].length,
      rule: cfg.rule
    });
  });
  return matches;
}

export function scoreFromHits(matches: Match[], wordCount: number): number {
  if (!wordCount) return 0;
  let weightedHits = 0;
  for (const m of matches) {
    weightedHits += TIER_WEIGHT[m.rule.tier] || 0;
  }
  const density = (weightedHits / wordCount) * 100;
  const score = Math.round(density * SCORE_MULTIPLIER);
  return Math.max(0, Math.min(100, score));
}

export function scoreLabel(score: number): string {
  if (score < 15) return 'Reads human';
  if (score < 40) return 'Some slop patterns';
  if (score < 70) return 'Heavy slop';
  return 'Slop city';
}

export function summarize(matches: Match[], wordCount: number): Summary {
  const score = scoreFromHits(matches, wordCount);
  const tiers: Tiers = { 1: 0, 2: 0, 3: 0 };
  const catMap = new Map<string, { name: string; count: number; weight: number }>();
  for (const m of matches) {
    const tier = m.rule.tier;
    if (tier === 1 || tier === 2 || tier === 3) {
      tiers[tier] += 1;
    }
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

export function scanText(text: string, pack?: Pack | null): ScanResult {
  const resolved = currentPack(pack);
  const wordCount = countWords(text);
  let matches = mergeOverlaps(findMatches(text, resolved.rules));
  if (emDashShouldFlag(countEmDashes(text, resolved), wordCount, resolved)) {
    matches = mergeOverlaps(matches.concat(findEmDashMatches(text, resolved)));
  }
  return { matches, ...summarize(matches, wordCount) };
}
