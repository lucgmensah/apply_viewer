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
    // Mode test hors extension : pré-remplir l'URL courante de test
    quickUrl.value = window.location.href;
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    
    const activeTab = tabs[0];
    quickUrl.value = activeTab.url || '';

    // Envoyer un message au content script de la page active pour scraper les détails
    chrome.tabs.sendMessage(activeTab.id, { action: "getJobDetails" }, (response) => {
      // Ignorer les erreurs si le script de contenu n'est pas injecté sur cette page
      if (chrome.runtime.lastError) {
        // Fallback de base : pré-remplir le titre avec le titre de la page web
        if (activeTab.title) {
          // Ex: "Job Offer for Dev at Google - LinkedIn" -> nettoyer un peu ou préremplir
          quickTitle.value = activeTab.title.split(' | ')[0].split(' - ')[0];
        }
        return;
      }

      if (response && response.success) {
        // Remplissage automatique !
        quickTitle.value = response.title || '';
        quickCompany.value = response.company || '';
        quickLocation.value = response.location || '';
        quickUrl.value = response.url || activeTab.url;
        
        // Afficher l'alerte verte/bleu nuit de détection automatique
        scrapingAlert.classList.remove('hidden');
      }
    });
  });
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
      
      // Fermer automatiquement après 1.5s
      setTimeout(() => {
        window.close();
      }, 1800);
    });
  });
}
