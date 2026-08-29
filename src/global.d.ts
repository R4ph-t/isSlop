export {};

declare global {
  interface Window {
    __slopspotterTeardown?: () => void;
    __slopspotterHandle?: (
      msg: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => boolean | void;
    __slopspotterMsgBound?: boolean;
    __isslopPanelTeardown?: (() => void) | null;
  }
}
