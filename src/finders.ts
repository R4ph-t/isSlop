import type { Span } from './types';

export const CHAIN_BODY = String.raw`[^,.;:!?\n\u2013\u2014\u2026]{0,160}`;
export const DEFAULT_CHAIN_SEP = String.raw`(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+|\s*[;&\u2013\u2014]\s*(?:and\s+|ou\s+)?|\s+-{1,2}\s+)`;

export function makeChainFinder(
  head: string,
  headTest: RegExp,
  minItems?: number,
  chainSep?: string
): (text: string) => Span[] {
  const sep = chainSep || DEFAULT_CHAIN_SEP;
  const split = new RegExp(sep, 'i');
  const item = head + CHAIN_BODY;
  const chain = new RegExp(String.raw`\b${item}(?:${sep}${item})+`, 'gi');
  const min = minItems == null ? 2 : minItems;
  return function (text: string): Span[] {
    const found: Span[] = [];
    for (const m of text.matchAll(chain)) {
      const count = m[0].split(split).filter((p) => headTest.test(p.trim())).length;
      if (count < min) continue;
      const index = m.index ?? 0;
      let end = index + m[0].length;
      while (end > index && /\s/.test(text[end - 1] ?? '')) end -= 1;
      found.push({ start: index, end });
    }
    return found;
  };
}

export function makeEchoFinder(wordRe?: RegExp): (text: string) => Span[] {
  const SENT = /[^.!?\n]+[.!?]?/g;
  const minGram = 4;
  const minRun = 2;
  const tokenRe = wordRe || /[a-z0-9'’-]+/g;
  function grams(s: string): Set<string> {
    const w = s.toLowerCase().match(tokenRe) || [];
    const out = new Set<string>();
    for (let i = 0; i + minGram <= w.length; i++) out.add(w.slice(i, i + minGram).join(' '));
    return out;
  }
  return function (text: string): Span[] {
    const sents: { start: number; end: number; text: string }[] = [];
    for (const m of text.matchAll(SENT)) {
      if ((m[0].match(/\S+/g) || []).length >= 4) {
        sents.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, text: m[0] });
      }
    }
    const found: Span[] = [];
    let i = 0;
    while (i < sents.length) {
      let j = i;
      let shared: string | null = null;
      while (j + 1 < sents.length) {
        const next = sents[j + 1];
        const cur = sents[j];
        if (!next || !cur) break;
        if (next.start - cur.end > 3) break;
        const common = [...grams(cur.text)].filter((g) => grams(next.text).has(g));
        if (!common.length) break;
        shared = common.sort((x, y) => y.length - x.length)[0] ?? null;
        j += 1;
      }
      const run = j - i + 1;
      const startSent = sents[i];
      const endSent = sents[j];
      if (run >= minRun && shared && startSent && endSent) {
        let end = endSent.end;
        while (end > startSent.start && /\s/.test(text[end - 1] ?? '')) end -= 1;
        found.push({ start: startSent.start, end });
        i = j + 1;
      } else {
        i += 1;
      }
    }
    return found;
  };
}

export function makeAnaphoraFinder(skipRe?: RegExp, wordRe?: RegExp): (text: string) => Span[] {
  const SENT = /[^.!?\n]+[.!?]/g;
  const minRun = 3;
  const skip = skipRe || /(?!)/;
  const firstWord = wordRe || /[A-Za-z'’-]+/;
  return function (text: string): Span[] {
    const sents: { start: number; end: number; head: string }[] = [];
    for (const m of text.matchAll(SENT)) {
      const w = m[0].match(firstWord);
      if (w) {
        const index = m.index ?? 0;
        sents.push({
          start: index + m[0].indexOf(w[0]),
          end: index + m[0].length,
          head: w[0].toLowerCase()
        });
      }
    }
    const found: Span[] = [];
    let i = 0;
    while (i < sents.length) {
      let j = i;
      while (
        j + 1 < sents.length &&
        sents[j + 1]?.head === sents[i]?.head &&
        (sents[j + 1]?.start ?? 0) - (sents[j]?.end ?? 0) < 4
      ) {
        j += 1;
      }
      const run = j - i + 1;
      const head = sents[i]?.head;
      if (run >= minRun && head && !skip.test(head) && sents[i] && sents[j]) {
        found.push({ start: sents[i].start, end: sents[j].end });
        i = j + 1;
      } else {
        i += 1;
      }
    }
    return found;
  };
}
