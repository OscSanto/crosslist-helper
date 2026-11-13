// Clicking the toolbar icon opens the side panel.
const enablePanel = () =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(enablePanel);
chrome.runtime.onStartup.addListener(enablePanel);
enablePanel();
