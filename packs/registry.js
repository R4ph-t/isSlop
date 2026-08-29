// The only list a contributor edits to add a language pack.
// Dual-env: browser global + Node.

const SLOP_PACK_IDS = ['en', 'fr'];
const SLOP_FALLBACK_PACK = 'en';

function packList() {
  return (typeof globalThis !== 'undefined' && globalThis.SLOP_PACKS) || [];
}

function registerPack(pack) {
  const root = typeof globalThis !== 'undefined' ? globalThis : {};
  root.SLOP_PACKS = root.SLOP_PACKS || [];
  const i = root.SLOP_PACKS.findIndex((p) => p.id === pack.id);
  if (i >= 0) root.SLOP_PACKS[i] = pack;
  else root.SLOP_PACKS.push(pack);
  if (!root.__slopActivePack || pack.id === SLOP_FALLBACK_PACK) {
    root.__slopActivePack = pack;
  }
  return pack;
}

function getPack(id) {
  return packList().find((p) => p.id === id) || null;
}

function activePack() {
  const root = typeof globalThis !== 'undefined' ? globalThis : {};
  return root.__slopActivePack || getPack(SLOP_FALLBACK_PACK) || packList()[0] || null;
}

function setActivePack(id) {
  const pack = getPack(id) || getPack(SLOP_FALLBACK_PACK);
  if (typeof globalThis !== 'undefined') globalThis.__slopActivePack = pack;
  return pack;
}

function packFiles() {
  return SLOP_PACK_IDS.map((id) => 'packs/' + id + '.js');
}

function detectPack(htmlLang, text) {
  const lang = String(htmlLang || '').trim().toLowerCase().replace(/_/g, '-');
  const prefix = lang.split('-')[0];
  if (prefix) {
    for (let i = 0; i < SLOP_PACK_IDS.length; i++) {
      const pack = getPack(SLOP_PACK_IDS[i]);
      if (!pack) continue;
      if (pack.id === prefix) return pack;
      const locales = pack.locales || [];
      for (let j = 0; j < locales.length; j++) {
        if (String(locales[j]).toLowerCase() === lang) return pack;
      }
    }
  }
  if (text) {
    const words = String(text).toLowerCase().split(/\s+/);
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < SLOP_PACK_IDS.length; i++) {
      const pack = getPack(SLOP_PACK_IDS[i]);
      if (!pack || !pack.stopwords) continue;
      const set = {};
      for (let s = 0; s < pack.stopwords.length; s++) set[pack.stopwords[s]] = true;
      let n = 0;
      const limit = Math.min(words.length, 400);
      for (let w = 0; w < limit; w++) {
        const token = words[w].replace(/^[^a-zàâäéèêëïîôùûüçœæ'-]+|[^a-zàâäéèêëïîôùûüçœæ'-]+$/g, '');
        if (set[token]) n += 1;
      }
      if (n > bestScore) {
        bestScore = n;
        best = pack;
      }
    }
    if (best && bestScore >= 8) return best;
  }
  return getPack(SLOP_FALLBACK_PACK);
}

const SlopPacks = {
  ids: SLOP_PACK_IDS,
  fallback: SLOP_FALLBACK_PACK,
  register: registerPack,
  get: getPack,
  current: activePack,
  setActive: setActivePack,
  detect: detectPack,
  files: packFiles
};

if (typeof globalThis !== 'undefined') {
  globalThis.SLOP_PACK_IDS = SLOP_PACK_IDS;
  globalThis.SLOP_FALLBACK_PACK = SLOP_FALLBACK_PACK;
  globalThis.registerPack = registerPack;
  globalThis.SlopPacks = SlopPacks;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SLOP_PACK_IDS,
    SLOP_FALLBACK_PACK,
    registerPack,
    getPack,
    activePack,
    setActivePack,
    detectPack,
    packFiles
  };
}
