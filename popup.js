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
    const processScrapedDetails = (response) => {
      const title = response && response.success ? response.title : (activeTab.title ? activeTab.title.split(' | ')[0].split(' - ')[0] : '');
      const company = response && response.success ? response.company : '';
      const location = response && response.success ? response.location : '';
      const url = response && response.success ? response.url : activeTab.url;

      quickTitle.value = title;
      quickCompany.value = company;
      quickLocation.value = location;
      quickUrl.value = url;

      // Vérifier si cette offre est déjà enregistrée en BDD
      storage.get((candidatures) => {
        const isDuplicate = checkDuplicateInList(candidatures, url, title, company);
        if (isDuplicate) {
          // Afficher une alerte de doublon
          scrapingAlert.innerHTML = `
            <svg class="alert-icon" viewBox="0 0 24 24" width="16" height="16" style="color: #0B192C;">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            <span style="color: #0B192C;">Cette offre est déjà dans votre suivi !</span>
          `;
          scrapingAlert.style.borderColor = "#0B192C";
          scrapingAlert.style.backgroundColor = "#F1F5F9";
          scrapingAlert.classList.remove('hidden');
          
          // Désactiver le bouton d'enregistrement
          btnSave.textContent = "Déjà suivie";
          btnSave.disabled = true;
          btnSave.style.opacity = "0.5";
          btnSave.style.cursor = "not-allowed";
        } else if (response && response.success) {
          // Message standard d'offre détectée
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
          files: ['content.js']
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

// Fonction de détection des doublons
function checkDuplicateInList(list, url, title, company) {
  return list.some(c => {
    const t1 = (c.title || '').trim().toLowerCase();
    const t2 = (title || '').trim().toLowerCase();
    const comp1 = (c.company || '').trim().toLowerCase();
    const comp2 = (company || '').trim().toLowerCase();

    // 1. Comparer l'URL (sans paramètres de tracking)
    if (url && c.url) {
      const cleanUrl1 = c.url.split('?')[0].split('#')[0];
      const cleanUrl2 = url.split('?')[0].split('#')[0];
      if (cleanUrl1 === cleanUrl2) return true;
    }
    
    // 2. Si pas d'URL ou pas de match d'URL, vérifier par titre + entreprise
    return t1 === t2 && comp1 === comp2 && t1.length > 0;
  });
}

// Enregistrer la candidature
function handleQuickAdd(e) {
  e.preventDefault();

  const titleVal = quickTitle.value.trim();
  const companyVal = quickCompany.value.trim();
  const urlVal = quickUrl.value.trim();
  const locationVal = quickLocation.value.trim();

  storage.get((candidatures) => {
    // Vérification de doublon avant sauvegarde (au cas où les champs ont été modifiés)
    const isDuplicate = checkDuplicateInList(candidatures, urlVal, titleVal, companyVal);
    if (isDuplicate) {
      alert("Cette offre (ou un lien similaire) est déjà enregistrée.");
      return;
    }

    const newCandidature = {
      id: 'uuid-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36),
      title: titleVal,
      company: companyVal,
      status: quickStatus.value,
      dateApplied: new Date().toISOString().slice(0, 10),
      location: locationVal,
      salary: '',
      url: urlVal,
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      notes: 'Ajouté rapidement depuis l\'extension.'
    };

    candidatures.unshift(newCandidature);
    storage.set(candidatures, () => {
      form.classList.add('hidden');
      scrapingAlert.classList.add('hidden');
      successMsg.classList.remove('hidden');
      
      setTimeout(() => {
        window.close();
      }, 1800);
    });
  });
}
