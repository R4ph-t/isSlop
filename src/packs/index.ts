import './en';
import './fr';
import './es';

export {
  SLOP_PACK_IDS,
  SLOP_FALLBACK_PACK,
  registerPack,
  getPack,
  activePack,
  setActivePack,
  detectPack
} from './registry';
export type { PackId } from './registry';
