// --- SCRIPT DE CONTENU DE L'EXTENSION AVEC WIDGET INJECTÉ (SHADOW DOM) ---

// Écouter les messages venant de la pop-up (si l'utilisateur clique quand même dessus)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getJobDetails") {
    try {
      const details = scrapeJobDetails();
      sendResponse(details);
    } catch (e) {
      sendResponse({ success: false, error: e.toString() });
    }
  }
});

// Lancer la détection automatique après le chargement complet de la page
window.addEventListener('load', () => {
  // Attendre 2 secondes que les éléments dynamiques (React, etc.) soient bien rendus
  setTimeout(() => {
    try {
      const details = scrapeJobDetails();
      if (details && details.success) {
        // Vérifier si cette offre est déjà suivie
        checkIfAlreadyTracked(details.url, details.title, details.company, (alreadyTracked) => {
          if (alreadyTracked) {
            injectAlreadyTrackedWidget(details);
          } else {
            injectFloatingWidget(details);
          }
        });
      }
    } catch (e) {
      console.error("Erreur lors de l'initialisation du widget de suivi :", e);
    }
  }, 2000);
});

// Vérifier si l'offre est déjà enregistrée (par URL ou par couple titre+entreprise si pas d'URL)
function checkIfAlreadyTracked(url, title, company, callback) {
  const checkDuplicate = (list) => {
    return list.some(c => {
      // Nettoyage pour comparaison insensible à la casse
      const t1 = (c.title || '').trim().toLowerCase();
      const t2 = (title || '').trim().toLowerCase();
      const comp1 = (c.company || '').trim().toLowerCase();
      const comp2 = (company || '').trim().toLowerCase();
      
      // Si on a l'URL de l'offre (cas le plus courant)
      if (url && c.url) {
        // Enlever les paramètres de tracking éventuels pour comparer l'URL brute
        const cleanUrl1 = c.url.split('?')[0].split('#')[0];
        const cleanUrl2 = url.split('?')[0].split('#')[0];
        if (cleanUrl1 === cleanUrl2) return true;
      }
      
      // Sinon comparaison sur titre + entreprise
      return t1 === t2 && comp1 === comp2;
    });
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['candidatures'], function(result) {
      callback(checkDuplicate(result.candidatures || []));
    });
  } else {
    const data = localStorage.getItem('job_tracker_candidatures');
    callback(checkDuplicate(data ? JSON.parse(data) : []));
  }
}

// --- ENREGISTREMENT DANS LE STOCKAGE DEPUIS LE WIDGET ---
function saveJobFromWidget(jobData, callback) {
  const save = (list) => {
    // Vérification de sécurité doublon de dernière seconde
    const isDup = list.some(c => 
      (c.url && c.url === jobData.url) || 
      (c.title.toLowerCase() === jobData.title.toLowerCase() && c.company.toLowerCase() === jobData.company.toLowerCase())
    );
    if (isDup) {
      alert("Cette candidature est déjà enregistrée !");
      return;
    }
    list.unshift(jobData);
    return list;
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['candidatures'], function(result) {
      const list = result.candidatures || [];
      const updatedList = save(list);
      if (updatedList) {
        chrome.storage.local.set({ candidatures: updatedList }, function() {
          if (callback) callback();
        });
      }
    });
  } else {
    const data = localStorage.getItem('job_tracker_candidatures');
    const list = data ? JSON.parse(data) : [];
    const updatedList = save(list);
    if (updatedList) {
      localStorage.setItem('job_tracker_candidatures', JSON.stringify(updatedList));
      if (callback) callback();
    }
  }
}

// --- FONCTION DE SCRAPING ---
function scrapeJobDetails() {
  const url = window.location.href;
  let title = "";
  let company = "";
  let location = "";

  // 1. LinkedIn
  if (url.includes("linkedin.com")) {
    const titleEl = document.querySelector([
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      "h1.t-24",
      ".jobs-details-top-card__job-title",
      ".p5 h1",
      "h1"
    ].join(","));
    title = titleEl ? titleEl.textContent : "";

    const companyEl = document.querySelector([
      ".job-details-jobs-unified-top-card__company-name a",
      ".jobs-unified-top-card__company-name a",
      "a[href*='/company/']",
      ".jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__primary-description a",
      ".p5 a"
    ].join(","));
    company = companyEl ? companyEl.textContent : "";

    const locEl = document.querySelector([
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__primary-description span",
      ".jobs-details-top-card__bullet"
    ].join(","));
    location = locEl ? locEl.textContent : "";
    if (location) {
      location = location.trim().split("·")[0].split("  ")[0];
    }
  } 
  
  // 2. Indeed
  else if (url.includes("indeed.com")) {
    const titleEl = document.querySelector([
      "h1.jobsearch-JobInfoHeader-title",
      ".jobsearch-JobInfoHeader-title span",
      "h1.jobTitle",
      "h1"
    ].join(","));
    title = titleEl ? titleEl.textContent : "";

    const companyEl = document.querySelector([
      "div.jobsearch-CompanyInfoContainer a",
      "a[href*='/cmp/']",
      "[data-company-name='true']",
      ".jobsearch-InlineCompanyRating a",
      ".jobsearch-CompanyReview--heading a",
      ".jobsearch-InlineCompanyRating div"
    ].join(","));
    company = companyEl ? companyEl.textContent : "";

    const locEl = document.querySelector([
      "#jobLocationSection",
      ".jobsearch-JobInfoHeader-subtitle div:last-child",
      ".jobsearch-InlineCompanyRating + div",
      "[data-testid='job-location']",
      ".jobsearch-JobInfoContainer .jobsearch-JobInfoHeader-subtitle"
    ].join(","));
    location = locEl ? locEl.textContent : "";
  } 
  
  // 3. Welcome to the Jungle
  else if (url.includes("welcometothejungle.com")) {
    const titleEl = document.querySelector([
      "[data-testid='job-header-title']",
      "h1",
      "h2"
    ].join(","));
    title = titleEl ? titleEl.textContent : "";

    const companyEl = document.querySelector([
      "a[href*='/companies/'] h4",
      "a[href*='/companies/'] span",
      "a[href*='/companies/'] div",
      "[data-testid='job-header-company']"
    ].join(","));
    
    if (companyEl && !companyEl.textContent.includes(title)) {
      company = companyEl.textContent;
    } else {
      const match = url.match(/\/companies\/([^/]+)/);
      if (match && match[1]) {
        company = match[1]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
      }
    }

    const locEl = document.querySelector([
      "[data-testid='job-metadata-location']",
      "span[title*='Lieu']",
      "i.wttj-icon-location + span"
    ].join(","));
    location = locEl ? locEl.textContent : "";
  }

  // --- SECOURS ---
  if (!title) {
    const ogTitle = document.querySelector("meta[property='og:title']");
    title = ogTitle ? ogTitle.getAttribute("content") : document.title;
  }
  if (!company) {
    const ogSite = document.querySelector("meta[property='og:site_name']");
    company = ogSite ? ogSite.getAttribute("content") : "";
  }

  title = title ? String(title).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";
  company = company ? String(company).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";
  location = location ? String(location).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";

  if (company.toLowerCase() === "linkedin" && url.includes("linkedin.com")) company = "";
  if (company.toLowerCase() === "indeed" && url.includes("indeed.com")) company = "";
  if (company.toLowerCase() === "welcome to the jungle" && url.includes("welcometothejungle")) company = "";

  if (title) {
    title = title
      .replace(/ - Indeed\.com/i, "")
      .replace(/ \| LinkedIn/i, "")
      .replace(/ - Welcome to the Jungle/i, "");
  }

  return {
    success: !!(title || company),
    title,
    company,
    location,
    url
  };
}

// --- INJECTION DU WIDGET FLOTTANT (SHADOW DOM) ---
function injectFloatingWidget(details) {
  // Éviter les doublons
  if (document.getElementById('job-tracker-floating-root')) return;

  // Créer l'élément hôte
  const host = document.createElement('div');
  host.id = 'job-tracker-floating-root';
  document.body.appendChild(host);

  // Attacher le Shadow DOM
  const shadow = host.attachShadow({ mode: 'open' });

  // Styles CSS isolés pour le widget
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');

    .widget-container {
      font-family: 'Outfit', sans-serif;
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999999;
      color: #0B192C;
    }

    /* Bouton flottant réduit */
    .widget-trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      background-color: #FFFFFF;
      border: 2px solid #0B192C;
      color: #0B192C;
      padding: 10px 18px;
      border-radius: 30px;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(11, 25, 44, 0.15);
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s ease;
      user-select: none;
    }

    .widget-trigger:hover {
      transform: translateY(-2px);
      background-color: #F8FAFC;
    }

    .widget-trigger.hidden {
      display: none;
    }

    .icon-briefcase {
      width: 16px;
      height: 16px;
    }

    /* Panneau d'ajout complet */
    .widget-panel {
      display: none;
      flex-direction: column;
      width: 320px;
      background-color: #FFFFFF;
      border: 2px solid #0B192C;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(11, 25, 44, 0.2);
      padding: 16px;
      animation: slideIn 0.3s ease forwards;
    }

    .widget-panel.open {
      display: flex;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Header du panneau */
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      border-bottom: 1px solid #E2E8F0;
      padding-bottom: 8px;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .btn-close {
      background: none;
      border: none;
      cursor: pointer;
      color: #475569;
      padding: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .btn-close:hover {
      background-color: #F8FAFC;
      color: #0B192C;
    }

    /* Champs du formulaire */
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
    }

    .form-row {
      display: flex;
      gap: 8px;
    }

    .form-row .form-group {
      flex: 1;
    }

    label {
      font-size: 11px;
      font-weight: 600;
    }

    input, select {
      font-family: 'Outfit', sans-serif;
      font-size: 12px;
      padding: 6px 8px;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      color: #0B192C;
      background-color: #FFFFFF;
      outline: none;
    }

    input:focus, select:focus {
      border-color: #0B192C;
    }

    /* Boutons */
    .form-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 10px;
    }

    .btn {
      font-family: 'Outfit', sans-serif;
      font-size: 12px;
      font-weight: 500;
      padding: 7px;
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }

    .btn-solid {
      background-color: #0B192C;
      color: #FFFFFF;
    }

    .btn-solid:hover {
      background-color: #1E3E62;
    }

    .btn-outline {
      background-color: #FFFFFF;
      color: #0B192C;
      border: 1px solid #0B192C;
    }

    .btn-outline:hover {
      background-color: #F8FAFC;
    }

    /* Message succès */
    .success-panel {
      display: none;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 16px 8px;
      gap: 8px;
    }

    .success-panel.open {
      display: flex;
    }

    .icon-success {
      color: #0B192C;
    }

    .success-panel p {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
    }
  `;

  // Créer le squelette HTML du widget
  const container = document.createElement('div');
  container.className = 'widget-container';

  container.innerHTML = `
    <!-- Bouton réduit -->
    <div class="widget-trigger" id="widget-trigger">
      <svg class="icon-briefcase" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
      </svg>
      <span>Suivre cette offre</span>
    </div>

    <!-- Formulaire d'ajout rapide -->
    <div class="widget-panel" id="widget-panel">
      <div class="panel-header">
        <h3>Ajouter au Job Tracker</h3>
        <button class="btn-close" id="btn-close-panel" aria-label="Fermer">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <form id="widget-form">
        <div class="form-group">
          <label>Poste *</label>
          <input type="text" id="widget-title" required value="${escapeHTML(details.title)}">
        </div>
        
        <div class="form-group">
          <label>Entreprise *</label>
          <input type="text" id="widget-company" required value="${escapeHTML(details.company)}">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Statut</label>
            <select id="widget-status">
              <option value="wishlist">À postuler</option>
              <option value="applied" selected>Candidature envoyée</option>
              <option value="interview">Entretien</option>
            </select>
          </div>
          <div class="form-group">
            <label>Lieu</label>
            <input type="text" id="widget-location" value="${escapeHTML(details.location)}">
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-solid">Ajouter au Suivi</button>
        </div>
      </form>
    </div>

    <!-- Message de Succès -->
    <div class="widget-panel success-panel" id="success-panel">
      <svg class="icon-success" viewBox="0 0 24 24" width="32" height="32">
        <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
      <p>Offre ajoutée avec succès !</p>
    </div>
  `;

  // Ajouter styles et contenu au Shadow DOM
  shadow.appendChild(style);
  shadow.appendChild(container);

  // --- LOGIQUE D'INTERACTION DANS LE SHADOW DOM ---
  const trigger = shadow.getElementById('widget-trigger');
  const panel = shadow.getElementById('widget-panel');
  const success = shadow.getElementById('success-panel');
  const btnClose = shadow.getElementById('btn-close-panel');
  const formEl = shadow.getElementById('widget-form');

  // Ouvrir le panneau
  trigger.addEventListener('click', () => {
    trigger.classList.add('hidden');
    panel.classList.add('open');
  });

  // Fermer le panneau
  btnClose.addEventListener('click', () => {
    panel.classList.remove('open');
    trigger.classList.remove('hidden');
  });

  // Enregistrer
  formEl.addEventListener('submit', (e) => {
    e.preventDefault();

    const titleVal = shadow.getElementById('widget-title').value.trim();
    const companyVal = shadow.getElementById('widget-company').value.trim();
    const statusVal = shadow.getElementById('widget-status').value;
    const locationVal = shadow.getElementById('widget-location').value.trim();

    const newJob = {
      id: 'uuid-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36),
      title: titleVal,
      company: companyVal,
      status: statusVal,
      dateApplied: new Date().toISOString().slice(0, 10),
      location: locationVal,
      salary: '',
      url: details.url,
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      notes: 'Ajouté automatiquement depuis l\'offre en ligne via le widget.'
    };

    saveJobFromWidget(newJob, () => {
      // Afficher l'écran succès
      panel.classList.remove('open');
      success.classList.add('open');

      // Masquer complètement le widget après 2 secondes
      setTimeout(() => {
        container.style.display = 'none';
      }, 2000);
    });
  });
}

// --- WIDGET POUR OFFRE DÉJÀ SUIVIE ---
function injectAlreadyTrackedWidget(details) {
  if (document.getElementById('job-tracker-floating-root')) return;

  const host = document.createElement('div');
  host.id = 'job-tracker-floating-root';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');

    .widget-container {
      font-family: 'Outfit', sans-serif;
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999999;
      color: #0B192C;
    }

    .widget-trigger-saved {
      display: flex;
      align-items: center;
      gap: 8px;
      background-color: #FFFFFF;
      border: 2px solid #0B192C;
      color: #0B192C;
      padding: 10px 18px;
      border-radius: 30px;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(11, 25, 44, 0.15);
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s ease;
      user-select: none;
    }

    .widget-trigger-saved:hover {
      transform: translateY(-2px);
      background-color: #F8FAFC;
    }

    .icon-check {
      width: 16px;
      height: 16px;
      color: #0B192C;
    }
  `;

  const container = document.createElement('div');
  container.className = 'widget-container';
  container.innerHTML = `
    <div class="widget-trigger-saved" id="btn-open-db">
      <svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>Offre déjà suivie</span>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(container);

  shadow.getElementById('btn-open-db').addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const dbUrl = chrome.runtime.getURL('dashboard.html');
      window.open(dbUrl, '_blank');
    } else {
      window.open('dashboard.html', '_blank');
    }
  });
}

// --- UTILS ---
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
