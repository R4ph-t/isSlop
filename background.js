chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id == null) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['panel.js']
    });
  } catch (err) {
    const message = (err && err.message) || String(err);
    if (
      /cannot be scripted|cannot access|chrome:\/\/|edge:\/\/|extensions gallery/i.test(message)
    ) {
      return;
    }
    console.warn('isSlop: cannot inject panel on this tab', message);
  }
});
