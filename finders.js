// Shared structural finders. Packs pass language-specific separators / skip lists.
// Dual-env: browser global + Node.

const CHAIN_BODY = String.raw`[^,.;:!?\n\u2013\u2014\u2026]*`;
const DEFAULT_CHAIN_SEP = String.raw`(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+|\s*[;&\u2013\u2014]\s*(?:and\s+|or\s+)?|\s+-{1,2}\s+)`;

function makeChainFinder(head, headTest, minItems, chainSep) {
  const sep = chainSep || DEFAULT_CHAIN_SEP;
  const split = new RegExp(sep, 'i');
  const item = head + CHAIN_BODY;
  const chain = new RegExp(String.raw`\b${item}(?:${sep}${item})+`, 'gi');
  const min = minItems == null ? 2 : minItems;
  return function (text) {
    const found = [];
    for (const m of text.matchAll(chain)) {
      const count = m[0].split(split).filter((p) => headTest.test(p.trim())).length;
      if (count < min) continue;
      let end = m.index + m[0].length;
      while (end > m.index && /\s/.test(text[end - 1])) end -= 1;
      found.push({ start: m.index, end });
    }
    return found;
  };
}

function makeEchoFinder() {
  const SENT = /[^.!?\n]+[.!?]?/g;
  const minGram = 4;
  const minRun = 2;
  function grams(s) {
    const w = s.toLowerCase().match(/[a-z0-9'’-]+/g) || [];
    const out = new Set();
    for (let i = 0; i + minGram <= w.length; i++) out.add(w.slice(i, i + minGram).join(' '));
    return out;
  }
  return function (text) {
    const sents = [];
    for (const m of text.matchAll(SENT)) {
      if ((m[0].match(/\S+/g) || []).length >= 4) {
        sents.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      }
    }
    const found = [];
    let i = 0;
    while (i < sents.length) {
      let j = i;
      let shared = null;
      while (j + 1 < sents.length) {
        if (sents[j + 1].start - sents[j].end > 3) break;
        const common = [...grams(sents[j].text)].filter((g) => grams(sents[j + 1].text).has(g));
        if (!common.length) break;
        shared = common.sort((x, y) => y.length - x.length)[0];
        j += 1;
      }
      const run = j - i + 1;
      if (run >= minRun && shared) {
        let end = sents[j].end;
        while (end > sents[i].start && /\s/.test(text[end - 1])) end -= 1;
        found.push({ start: sents[i].start, end });
        i = j + 1;
      } else {
        i += 1;
      }
    }
    return found;
  };
}

function makeAnaphoraFinder(skipRe) {
  const SENT = /[^.!?\n]+[.!?]/g;
  const minRun = 3;
  const skip = skipRe || /(?!)/;
  return function (text) {
    const sents = [];
    for (const m of text.matchAll(SENT)) {
      const w = m[0].match(/[A-Za-z'’-]+/);
      if (w) {
        sents.push({
          start: m.index + m[0].indexOf(w[0]),
          end: m.index + m[0].length,
          head: w[0].toLowerCase()
        });
      }
    }
    const found = [];
    let i = 0;
    while (i < sents.length) {
      let j = i;
      while (
        j + 1 < sents.length &&
        sents[j + 1].head === sents[i].head &&
        sents[j + 1].start - sents[j].end < 4
      ) {
        j += 1;
      }
      const run = j - i + 1;
      if (run >= minRun && !skip.test(sents[i].head)) {
        found.push({ start: sents[i].start, end: sents[j].end });
        i = j + 1;
      } else {
        i += 1;
      }
    }
    return found;
  };
}

const SlopFinders = {
  CHAIN_BODY,
  DEFAULT_CHAIN_SEP,
  makeChainFinder,
  makeEchoFinder,
  makeAnaphoraFinder
};

if (typeof globalThis !== 'undefined') {
  globalThis.SlopFinders = SlopFinders;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SlopFinders;
}
