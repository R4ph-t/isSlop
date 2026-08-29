chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id == null) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['panel.js']
    });
  } catch (err) {
    /* chrome:// and the Web Store reject scripting */
  }
});
