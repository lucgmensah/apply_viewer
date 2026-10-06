// Ouvrir le dashboard lors de l'installation de l'extension
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "dashboard.html" });
  }
});

// Les pages web ne peuvent pas ouvrir une page de l'extension : le widget passe par ici
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "openDashboard") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  }
});
