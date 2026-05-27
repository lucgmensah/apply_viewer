// --- GESTION DU STOCKAGE (FALLBACK LOCALSTORAGE) ---
const storage = {
  get: function(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['candidatures'], function(result) {
        callback(result.candidatures || []);
      });
    } else {
      const data = localStorage.getItem('job_tracker_candidatures');
      callback(data ? JSON.parse(data) : []);
    }
  },
  set: function(candidatures, callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ candidatures }, function() {
        if (callback) callback();
      });
    } else {
      localStorage.setItem('job_tracker_candidatures', JSON.stringify(candidatures));
      if (callback) callback();
    }
  }
};

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
    const processScrapedDetails = (response) => {
      if (response && response.success) {
        quickTitle.value = response.title || '';
        quickCompany.value = response.company || '';
        quickLocation.value = response.location || '';
        quickUrl.value = response.url || activeTab.url;
        
        // Afficher l'alerte verte/bleu nuit de détection automatique
        scrapingAlert.classList.remove('hidden');
      } else {
        // Fallback de base si le scraping s'exécute mais ne trouve rien de spécifique
        fallbackToTabDetails(activeTab);
      }
    };

    // Envoyer le message au script de contenu
    chrome.tabs.sendMessage(activeTab.id, { action: "getJobDetails" }, (response) => {
      if (chrome.runtime.lastError) {
        // Le script de contenu n'est pas injecté (par exemple onglet ouvert avant installation)
        // Injecter dynamiquement content.js à l'aide de l'API de scripting
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js']
        }, () => {
          if (chrome.runtime.lastError) {
            // Échec d'injection (ex: page restreinte ou erreur de droit)
            fallbackToTabDetails(activeTab);
            return;
          }
          
          // Réessayer d'envoyer le message après injection réussie
          chrome.tabs.sendMessage(activeTab.id, { action: "getJobDetails" }, (response2) => {
            if (chrome.runtime.lastError) {
              fallbackToTabDetails(activeTab);
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

// Fallback de base sur les infos de l'onglet
function fallbackToTabDetails(tab) {
  if (tab.title) {
    // Nettoyer les suffixes habituels pour pré-remplir le titre proprement
    quickTitle.value = tab.title
      .split(' | ')[0]
      .split(' - ')[0]
      .replace(/Offre d'emploi/i, '')
      .trim();
  }
  quickUrl.value = tab.url || '';
}

// Enregistrer la candidature
function handleQuickAdd(e) {
  e.preventDefault();

  const newCandidature = {
    id: 'uuid-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36),
    title: quickTitle.value.trim(),
    company: quickCompany.value.trim(),
    status: quickStatus.value,
    dateApplied: new Date().toISOString().slice(0, 10), // Date d'aujourd'hui
    location: quickLocation.value.trim(),
    salary: '',
    url: quickUrl.value.trim(),
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    notes: 'Ajouté rapidement depuis l\'extension.'
  };

  storage.get((candidatures) => {
    candidatures.unshift(newCandidature);
    storage.set(candidatures, () => {
      // Afficher message succès
      form.classList.add('hidden');
      scrapingAlert.classList.add('hidden');
      successMsg.classList.remove('hidden');
      
      // Fermer automatiquement après 1.8s
      setTimeout(() => {
        window.close();
      }, 1800);
    });
  });
}
