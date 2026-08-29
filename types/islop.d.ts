export {};

interface SlopScanDomApi {
  MARK_CLASS: string;
  MARK_ID_RE: RegExp;
  MIN_TEXT_LEN: number;
  MAX_TEXT_NODES: number;
  skipNode: (node: Node) => boolean;
  isEditorRoot: (el: Element | null) => boolean;
  inEditor: (node: Node) => boolean;
  isPageChrome: (el: Element | null) => boolean;
  isUnrendered: (el: Element | null, cache?: WeakMap<Element, boolean>) => boolean;
  collectTextNodes: (
    root: Element,
    opts?: { stripChrome?: boolean; cache?: WeakMap<Element, boolean> }
  ) => Text[];
  wrapRange: (
    textNode: Text,
    start: number,
    end: number,
    rule: { id?: string; name: string; why: string; tier: number; try?: string }
  ) => Text;
  applyMatches: (
    textNode: Text,
    matches: Array<{
      start: number;
      end: number;
      rule: { id?: string; name: string; why: string; tier: number; try?: string };
    }>
  ) => void;
  reset: () => void;
  createCache: () => WeakMap<Element, boolean>;
}

interface SlopPackApi {
  id: string;
  name: string;
  verified?: boolean;
  rules: unknown[];
}

declare global {
  function require(id: string): any;
  var module: { exports: any };

  interface Window {
    SlopEngine?: any;
    SlopFinders?: any;
    SlopScanDom?: SlopScanDomApi;
    SlopPacks?: {
      ids: string[];
      detect: (htmlLang: string, text: string) => SlopPackApi | null;
      current: () => SlopPackApi | null;
    };
    SLOP_PACK_IDS?: string[];
    SLOP_PACKS?: unknown[];
    registerPack?: (pack: unknown) => unknown;
    __slopspotterHandle?: (
      msg: { type?: string; [key: string]: unknown },
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => void;
    __slopspotterTeardown?: () => void;
    __slopspotterMsgBound?: boolean;
    __isslopPanelTeardown?: (() => void) | null;
  }

  var SlopEngine: Window['SlopEngine'];
  var SlopFinders: Window['SlopFinders'];
  var SlopScanDom: Window['SlopScanDom'];
  var SlopPacks: Window['SlopPacks'];
  var SLOP_PACK_IDS: Window['SLOP_PACK_IDS'];
  var registerPack: Window['registerPack'];
}
