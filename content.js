// --- SCRIPT DE CONTENU DE L'EXTENSION AVEC WIDGET INJECTÉ (SHADOW DOM) ---
// Dépend de shared.js (injecté juste avant, voir manifest.json et popup.js).

(() => {
  // La popup peut réinjecter ce script : ne l'initialiser qu'une seule fois par page
  if (window.__jobTrackerContentLoaded) return;
  window.__jobTrackerContentLoaded = true;

  const ROOT_ID = 'job-tracker-floating-root';
  const FONT_FAMILY = 'JobTrackerOutfit';
  const RENDER_DELAY_MS = 2000; // Laisser le temps aux pages React de rendre l'offre
  const URL_POLL_MS = 1000;

  // Écouter les messages venant de la pop-up
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getJobDetails") {
      try {
        sendResponse(scrapeJobDetails());
      } catch (e) {
        sendResponse({ success: false, error: e.toString() });
      }
    }
  });

  // Le widget ne s'affiche que sur les sites supportés (pas lors d'une injection par la popup ailleurs)
  if (!JobTracker.isSupportedSite(window.location.href)) return;

  // --- CYCLE DE VIE DU WIDGET ---
  // LinkedIn et Indeed changent d'offre sans recharger la page : on surveille l'URL
  // et on reconstruit le widget quand l'offre affichée change.
  let currentKey = null;
  let lastHref = window.location.href;
  let refreshTimer = null;

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshWidget, RENDER_DELAY_MS);
  }

  function refreshWidget() {
    try {
      const details = scrapeJobDetails();
      const key = details.success ? JobTracker.jobKey(details.url) : null;
      if (key === currentKey) return;

      currentKey = key;
      removeWidget();
      if (!key) return;

      JobTracker.getAll((list) => {
        // L'utilisateur a pu changer d'offre pendant la lecture du stockage
        if (currentKey !== key) return;
        if (JobTracker.isDuplicate(list, details)) {
          injectAlreadyTrackedWidget();
        } else {
          injectFloatingWidget(details);
        }
      });
    } catch (e) {
      console.error("Erreur lors de l'initialisation du widget de suivi :", e);
    }
  }

  if (document.readyState === 'complete') {
    scheduleRefresh();
  } else {
    window.addEventListener('load', scheduleRefresh);
  }

  setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      scheduleRefresh();
    }
  }, URL_POLL_MS);

  // --- FONCTION DE SCRAPING ---
  // `success` n'est vrai que sur une page d'offre d'un site supporté avec un titre trouvé.
  // Les autres champs restent remplis (secours og:title, etc.) pour pré-remplir la popup.
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

    const foundOnJobPage = !!(JobTracker.siteJobKey(url) && title);

    // --- SECOURS ---
    if (!title) {
      const ogTitle = document.querySelector("meta[property='og:title']");
      title = ogTitle ? ogTitle.getAttribute("content") : document.title;
    }
    if (!company) {
      const ogSite = document.querySelector("meta[property='og:site_name']");
      company = ogSite ? ogSite.getAttribute("content") : "";
    }

    const clean = (str) => str ? String(str).replace(/\s+/g, " ").trim() : "";
    title = clean(title);
    company = clean(company);
    location = clean(location);

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
      success: foundOnJobPage,
      title,
      company,
      location,
      url
    };
  }

  // --- POLICE ---
  // Un @font-face déclaré dans un Shadow DOM n'est pas appliqué par Chrome :
  // on enregistre la police embarquée au niveau du document via l'API FontFace.
  let fontLoaded = false;
  function ensureFont() {
    if (fontLoaded) return;
    fontLoaded = true;
    try {
      const face = new FontFace(
        FONT_FAMILY,
        `url(${chrome.runtime.getURL('fonts/outfit-latin-wght-normal.woff2')})`,
        { weight: '100 900', display: 'swap' }
      );
      document.fonts.add(face);
      face.load().catch(() => {});
    } catch (e) {
      // Police système en secours
    }
  }

  // --- HÔTE DU WIDGET ---
  function removeWidget() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
  }

  function createWidgetRoot(css, html) {
    removeWidget();
    ensureFont();

    const host = document.createElement('div');
    host.id = ROOT_ID;
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = css;

    const container = document.createElement('div');
    container.className = 'widget-container';
    container.innerHTML = html;

    shadow.appendChild(style);
    shadow.appendChild(container);
    return { shadow, container };
  }

  const BASE_CSS = `
    .widget-container {
      font-family: '${FONT_FAMILY}', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999999;
      color: #1A1A1A;
    }
  `;

  // --- INJECTION DU WIDGET FLOTTANT ---
  function injectFloatingWidget(details) {
    const css = BASE_CSS + `
      /* Bouton flottant réduit */
      .widget-trigger {
        display: flex;
        align-items: center;
        gap: 8px;
        background-color: #FFFFFF;
        border: 1px solid rgba(10, 8, 7, 0.12);
        color: #1F1F1F;
        padding: 10px 18px;
        border-radius: 30px;
        cursor: pointer;
        box-shadow: 0 4px 12px -2px rgba(10, 8, 7, 0.03);
        font-size: 13px;
        font-weight: 600;
        transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
      }

      .widget-trigger:hover {
        transform: translateY(-2px);
        border-color: #1F1F1F;
        box-shadow: 0 6px 16px -2px rgba(10, 8, 7, 0.06);
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
        background-color: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(10, 8, 7, 0.1);
        border-radius: 24px;
        box-shadow: 0 8px 24px rgba(10, 8, 7, 0.05);
        padding: 16px;
        animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
        border-bottom: 1px solid rgba(10, 8, 7, 0.08);
        padding-bottom: 8px;
      }

      .panel-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #1F1F1F;
        letter-spacing: -0.01em;
      }

      .btn-close {
        background: none;
        border: none;
        cursor: pointer;
        color: #7B7A75;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.15s ease;
        width: 24px;
        height: 24px;
      }

      .btn-close:hover {
        background-color: rgba(10, 8, 7, 0.05);
        color: #1F1F1F;
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
        font-weight: 700;
        color: #1F1F1F;
      }

      input, select {
        font-family: inherit;
        font-size: 12px;
        padding: 6px 12px;
        border: 1px solid rgba(10, 8, 7, 0.1);
        border-radius: 30px;
        color: #1A1A1A;
        background-color: #FFFFFF;
        outline: none;
        transition: all 0.15s ease;
      }

      input:focus, select:focus {
        border-color: #1F1F1F;
        box-shadow: 0 0 0 3px rgba(31, 31, 31, 0.08);
      }

      /* Boutons */
      .form-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 10px;
      }

      .btn {
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        padding: 8px;
        border-radius: 30px;
        cursor: pointer;
        text-align: center;
        border: 1px solid transparent;
        transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .btn-solid {
        background-color: #1F1F1F;
        color: #FFFFFF;
      }

      .btn-solid:hover {
        background-color: #000000;
        transform: translateY(-1px);
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
        color: #FFD25E;
      }

      .success-panel p {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        color: #1F1F1F;
      }
    `;

    const esc = JobTracker.escapeHTML;
    const html = `
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
            <label for="widget-title">Poste *</label>
            <input type="text" id="widget-title" required value="${esc(details.title)}">
          </div>

          <div class="form-group">
            <label for="widget-company">Entreprise *</label>
            <input type="text" id="widget-company" required value="${esc(details.company)}">
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="widget-status">Statut</label>
              <select id="widget-status">
                <option value="wishlist">À postuler</option>
                <option value="applied" selected>Candidature envoyée</option>
                <option value="interview">Entretien</option>
              </select>
            </div>
            <div class="form-group">
              <label for="widget-location">Lieu</label>
              <input type="text" id="widget-location" value="${esc(details.location)}">
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

    const { shadow, container } = createWidgetRoot(css, html);

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

      const newJob = JobTracker.createCandidature({
        title: shadow.getElementById('widget-title').value.trim(),
        company: shadow.getElementById('widget-company').value.trim(),
        status: shadow.getElementById('widget-status').value,
        location: shadow.getElementById('widget-location').value.trim(),
        url: details.url,
        notes: 'Ajouté automatiquement depuis l\'offre en ligne via le widget.'
      });

      JobTracker.update((list) => {
        // Vérification de dernière seconde (ajout possible depuis un autre onglet)
        if (JobTracker.isDuplicate(list, newJob)) return null;
        return [newJob, ...list];
      }, (saved) => {
        if (!saved) {
          alert("Cette candidature est déjà enregistrée !");
          return;
        }

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
  function injectAlreadyTrackedWidget() {
    const css = BASE_CSS + `
      .widget-trigger-saved {
        display: flex;
        align-items: center;
        gap: 8px;
        background-color: #FFFFFF;
        border: 1px solid rgba(10, 8, 7, 0.12);
        color: #FFD25E;
        padding: 10px 18px;
        border-radius: 30px;
        cursor: pointer;
        box-shadow: 0 4px 12px -2px rgba(10, 8, 7, 0.03);
        font-size: 13px;
        font-weight: 600;
        transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
      }

      .widget-trigger-saved:hover {
        transform: translateY(-2px);
        border-color: #1F1F1F;
        box-shadow: 0 6px 16px -2px rgba(10, 8, 7, 0.06);
      }

      .icon-check {
        width: 16px;
        height: 16px;
        color: #FFD25E;
      }
    `;

    const html = `
      <div class="widget-trigger-saved" id="btn-open-db">
        <svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Offre déjà suivie</span>
      </div>
    `;

    const { shadow } = createWidgetRoot(css, html);

    // Une page web ne peut pas ouvrir directement une page de l'extension :
    // on demande au service worker d'ouvrir l'onglet.
    shadow.getElementById('btn-open-db').addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ action: 'openDashboard' });
      } catch (e) {
        // Contexte invalidé (extension rechargée) : recharger la page suffit
        console.warn("Job Tracker : rechargez la page pour réactiver l'extension.", e);
      }
    });
  }
})();
