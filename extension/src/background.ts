/*
 * The toolbar button opens the side panel on the current tab and reads the page. Clicking it is what grants
 * easeprint access to that one tab (activeTab); nothing runs on a page you haven't clicked on, unless you choose
 * "Record from load" for a site.
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  // Must run first, inside the click, or Chrome refuses to open the panel.
  const opening = chrome.sidePanel.open({ tabId: tab.id });
  await chrome.storage.session.set({ [`granted:${tab.id}`]: true });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['probe.js'] });
  } catch {
    // Browser pages and the Web Store can't be read. The panel says so.
  }
  await opening;
});

// "Record from load" registers the reader for one site until that page has loaded once.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const key = `fromLoad:${tabId}`;
  const got = await chrome.storage.session.get(key);
  if (!got[key]) return;
  await chrome.storage.session.remove(key);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['easeprint-load'] });
  } catch {
    /* already gone */
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove([`granted:${tabId}`, `fromLoad:${tabId}`]);
});
