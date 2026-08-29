// The only list a contributor edits to add a language pack.
// Dual-env: browser global + Node.

const SLOP_PACK_IDS = ['en'];
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

const SlopPacks = {
  ids: SLOP_PACK_IDS,
  fallback: SLOP_FALLBACK_PACK,
  register: registerPack,
  get: getPack,
  current: activePack,
  setActive: setActivePack,
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
    packFiles
  };
}
