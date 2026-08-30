import type { Pack } from '../types';

export const SLOP_PACK_IDS = ['en', 'fr', 'es'] as const;
export type PackId = (typeof SLOP_PACK_IDS)[number];
export const SLOP_FALLBACK_PACK: PackId = 'en';

const packs: Pack[] = [];
let active: Pack | null = null;

export function registerPack(pack: Pack): Pack {
  const i = packs.findIndex((p) => p.id === pack.id);
  if (i >= 0) packs[i] = pack;
  else packs.push(pack);
  if (!active || pack.id === SLOP_FALLBACK_PACK) active = pack;
  return pack;
}

export function getPack(id: string): Pack | null {
  return packs.find((p) => p.id === id) || null;
}

export function activePack(): Pack {
  const pack = active || getPack(SLOP_FALLBACK_PACK) || packs[0];
  if (!pack) throw new Error('no language packs registered');
  return pack;
}

export function setActivePack(id: string): Pack {
  active = getPack(id) || getPack(SLOP_FALLBACK_PACK);
  return activePack();
}

function fallbackPack(): Pack {
  return getPack(SLOP_FALLBACK_PACK) || activePack();
}

function packFromLang(htmlLang: string): Pack | null {
  const lang = String(htmlLang || '').trim().toLowerCase().replace(/_/g, '-');
  const prefix = lang.split('-')[0] ?? '';
  if (!prefix) return null;
  for (let i = 0; i < SLOP_PACK_IDS.length; i++) {
    const id = SLOP_PACK_IDS[i];
    if (!id) continue;
    const pack = getPack(id);
    if (!pack) continue;
    if (pack.id === prefix) return pack;
    const locales = pack.locales || [];
    for (let j = 0; j < locales.length; j++) {
      if (String(locales[j]).toLowerCase() === lang) return pack;
    }
  }
  return null;
}

function stopwordScore(pack: Pack, words: string[]): number {
  if (!pack.stopwords) return 0;
  const set = new Set(pack.stopwords);
  let n = 0;
  const limit = Math.min(words.length, 400);
  for (let w = 0; w < limit; w++) {
    const raw = words[w] ?? '';
    const token = raw.replace(/^[^a-zàáâäèéêëìíîïòóôöùúûüüçñœæ'-]+|[^a-zàáâäèéêëìíîïòóôöùúûüüçñœæ'-]+$/g, '');
    if (set.has(token)) n += 1;
  }
  return n;
}

export function detectPack(htmlLang: string, text: string): Pack {
  const htmlPack = packFromLang(htmlLang);
  const words = text ? String(text).toLowerCase().split(/\s+/) : [];
  let voted: Pack | null = null;
  let votedScore = -1;
  if (words.length) {
    for (let i = 0; i < SLOP_PACK_IDS.length; i++) {
      const id = SLOP_PACK_IDS[i];
      if (!id) continue;
      const pack = getPack(id);
      if (!pack) continue;
      const n = stopwordScore(pack, words);
      if (n > votedScore) {
        votedScore = n;
        voted = pack;
      }
    }
  }
  if (voted && votedScore >= 8) {
    if (!htmlPack || voted.id === htmlPack.id) return voted;
    const htmlScore = stopwordScore(htmlPack, words);
    if (votedScore >= htmlScore + 4) return voted;
  }
  if (htmlPack) return htmlPack;
  if (voted && votedScore >= 8) return voted;
  return fallbackPack();
}
