// --- ÉLÉMENTS DU DOM ---
const btnOpenDashboard = document.getElementById('btn-open-dashboard');
const btnGoDashboard = document.getElementById('btn-go-dashboard');
const form = document.getElementById('quick-add-form');
const scrapingAlert = document.getElementById('scraping-alert');
const successMsg = document.getElementById('success-msg');

const quickTitle = document.getElementById('quick-title');
const quickCompany = document.getElementById('quick-company');
const quickStatus = document.getElementById('quick-status');
const quickLocation = document.getElementById('quick-location');
const quickUrl = document.getElementById('quick-url');
const btnSave = document.getElementById('btn-save');

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
  // Navigation Dashboard
  btnOpenDashboard.addEventListener('click', openDashboard);
  btnGoDashboard.addEventListener('click', openDashboard);

  // Soumission Formulaire
  form.addEventListener('submit', handleQuickAdd);

  // Tenter de récupérer les données de l'onglet actif
  detectActiveJobDetails();
});

// Ouvrir le dashboard dans un nouvel onglet
function openDashboard() {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: 'dashboard.html' });
  } else {
    window.open('dashboard.html', '_blank');
  }
}

// Détecter l'offre sur la page active
function detectActiveJobDetails() {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    quickUrl.value = window.location.href;
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    
    const activeTab = tabs[0];
    quickUrl.value = activeTab.url || '';

    // Ne pas tenter d'injecter ou de scraper sur les pages internes de Chrome
    if (!activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://') || activeTab.url.startsWith('about:')) {
      if (activeTab.title) {
        quickTitle.value = activeTab.title.split(' | ')[0].split(' - ')[0];
      }
      return;
    }

    // Traitement de la réponse de scraping
    // Les champs sont pré-remplis même hors page d'offre (og:title, etc.),
    // mais l'alerte « Offre détectée » n'apparaît que si `success` est vrai.
    const processScrapedDetails = (response) => {
      const fallbackTitle = activeTab.title ? activeTab.title.split(' | ')[0].split(' - ')[0] : '';
      const title = (response && response.title) || fallbackTitle;
      const company = (response && response.company) || '';
      const location = (response && response.location) || '';
      const url = (response && response.url) || activeTab.url;

      quickTitle.value = title;
      quickCompany.value = company;
      quickLocation.value = location;
      quickUrl.value = url;

      // Vérifier si cette offre est déjà enregistrée en BDD
      JobTracker.getAll((candidatures) => {
        const isDuplicate = JobTracker.isDuplicate(candidatures, { url, title, company });
        if (isDuplicate) {
          // Afficher une alerte de doublon
          scrapingAlert.innerHTML = `
            <svg class="alert-icon" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            <span>Cette offre est déjà dans votre suivi !</span>
          `;
          scrapingAlert.classList.add('duplicate');
          scrapingAlert.classList.remove('hidden');

          // Désactiver le bouton d'enregistrement
          btnSave.textContent = "Déjà suivie";
          btnSave.disabled = true;
        } else if (response && response.success) {
          // Message standard d'offre détectée
          scrapingAlert.classList.remove('duplicate');
          scrapingAlert.classList.remove('hidden');
        }
      });
    };

    // Envoyer le message au script de contenu
    chrome.tabs.sendMessage(activeTab.id, { action: "getJobDetails" }, (response) => {
      if (chrome.runtime.lastError) {
        // Tenter l'injection si pas chargé
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['shared.js', 'content.js']
        }, () => {
          if (chrome.runtime.lastError) {
            processScrapedDetails(null);
            return;
          }
          
          chrome.tabs.sendMessage(activeTab.id, { action: "getJobDetails" }, (response2) => {
            if (chrome.runtime.lastError) {
              processScrapedDetails(null);
              return;
            }
            processScrapedDetails(response2);
          });
        });
      } else {
        processScrapedDetails(response);
      }
    });
  });
}

// Enregistrer la candidature
function handleQuickAdd(e) {
  e.preventDefault();

  const newCandidature = JobTracker.createCandidature({
    title: quickTitle.value.trim(),
    company: quickCompany.value.trim(),
    status: quickStatus.value,
    location: quickLocation.value.trim(),
    url: quickUrl.value.trim(),
    notes: "Ajouté rapidement depuis l'extension."
  });

  JobTracker.update((candidatures) => {
    // Vérification de doublon avant sauvegarde (au cas où les champs ont été modifiés)
    if (JobTracker.isDuplicate(candidatures, newCandidature)) return null;
    return [newCandidature, ...candidatures];
  }, (saved) => {
    if (!saved) {
      alert("Cette offre (ou un lien similaire) est déjà enregistrée.");
      return;
    }

    form.classList.add('hidden');
    scrapingAlert.classList.add('hidden');
    successMsg.classList.remove('hidden');

    setTimeout(() => {
      window.close();
    }, 1800);
  });
}
