// Ouvrir le dashboard lors de l'installation de l'extension
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "dashboard.html" });
  }
});
