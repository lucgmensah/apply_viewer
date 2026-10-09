// --- SCRIPT DE CONTENU DE L'EXTENSION AVEC WIDGET INJECTÉ (SHADOW DOM) ---
// Dépend de shared.js (injecté juste avant, voir manifest.json et popup.js).

(() => {
  // La popup peut réinjecter ce script : ne l'initialiser qu'une seule fois par page
  if (window.__jobTrackerContentLoaded) return;
  window.__jobTrackerContentLoaded = true;

  const ROOT_ID = 'job-tracker-floating-root';
  const FONT_FAMILY = 'JobTrackerJakarta';
  const RENDER_DELAY_MS = 2000; // Laisser le temps aux pages React de rendre l'offre
  const URL_POLL_MS = 1000;
  const SUCCESS_MS = 2000; // durée d'affichage du message de succès

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
  let currentDetails = null;
  let widgetMode = null; // 'add' ou 'tracked:<id>:<statut>' : état affiché
  let successUntil = 0; // le message de succès reste affiché jusqu'à cette date
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
      currentDetails = key ? details : null;
      widgetMode = null;
      removeWidget();
      if (!key) return;

      JobTracker.getAll((list) => {
        // L'utilisateur a pu changer d'offre pendant la lecture du stockage
        if (currentKey === key) syncWidget(list);
      });
    } catch (e) {
      console.error("Erreur lors de l'initialisation du widget de suivi :", e);
    }
  }

  // Affiche l'état correspondant à la liste (offre suivie ou non, statut actuel).
  // Ne reconstruit le widget que si cet état change : un formulaire en cours de saisie est conservé.
  function syncWidget(list) {
    if (!currentKey || !currentDetails || Date.now() < successUntil) return;
    const tracked = JobTracker.findDuplicate(list, currentDetails);
    const mode = tracked ? `tracked:${tracked.id}:${tracked.status}` : 'add';
    if (mode === widgetMode) return;
    widgetMode = mode;
    if (tracked) {
      injectAlreadyTrackedWidget(tracked);
    } else {
      injectFloatingWidget(currentDetails);
    }
  }

  // Ajout, changement de statut ou suppression depuis la popup ou le dashboard
  JobTracker.onChange(syncWidget);

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
        `url(${chrome.runtime.getURL('fonts/plus-jakarta-sans-latin-wght-normal.woff2')})`,
        { weight: '200 800', display: 'swap' }
      );
      document.fonts.add(face);
      face.load().catch(() => {});
    } catch (e) {
      // Police système en secours
    }
  }

  // --- HÔTE DU WIDGET ---
  const STYLESHEETS = ['tokens.css', 'components.css', 'widget.css'];

  function removeWidget() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
  }

  // Crée l'hôte Shadow DOM avec les feuilles de style partagées.
  // Le widget reste invisible jusqu'au chargement des styles (pas de flash sans style).
  function createWidgetRoot(html) {
    removeWidget();
    ensureFont();

    const host = document.createElement('div');
    host.id = ROOT_ID;
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const container = document.createElement('div');
    container.className = 'widget-container';
    container.style.visibility = 'hidden';
    container.innerHTML = html;

    let pending = STYLESHEETS.length;
    const reveal = () => {
      pending -= 1;
      if (pending === 0) container.style.visibility = '';
    };
    STYLESHEETS.forEach((file) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(file);
      link.addEventListener('load', reveal);
      link.addEventListener('error', reveal);
      shadow.appendChild(link);
    });

    shadow.appendChild(container);
    return { shadow, container };
  }

  const ICONS = {
    briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="16 9 10.5 15 8 12.5"></polyline></svg>'
  };

  // --- WIDGET D'AJOUT ---
  function injectFloatingWidget(details) {
    const esc = JobTracker.escapeHTML;
    const statusOptions = UI.STATUSES
      .map((s) => `<option value="${s.id}"${s.id === 'applied' ? ' selected' : ''}>${esc(s.short)}</option>`)
      .join('');

    const { shadow } = createWidgetRoot(`
      <button type="button" class="wt-pill">${ICONS.briefcase}<span>Suivre cette offre</span></button>

      <div class="wt-panel card hidden" role="dialog" aria-label="Ajouter au suivi">
        <div class="wt-panel__header">
          <span class="logo-dot" aria-hidden="true"></span>
          <span>Apply View</span>
          <button type="button" class="icon-btn wt-close" aria-label="Fermer">${ICONS.close}</button>
        </div>
        <form class="wt-form">
          <div class="wt-field">
            <label class="wt-label" for="wt-title">Poste *</label>
            <input class="input" type="text" id="wt-title" required value="${esc(details.title)}">
          </div>
          <div class="wt-field">
            <label class="wt-label" for="wt-company">Entreprise *</label>
            <input class="input" type="text" id="wt-company" required value="${esc(details.company)}">
          </div>
          <div class="wt-row">
            <div class="wt-field">
              <label class="wt-label" for="wt-status">Statut</label>
              <select class="select" id="wt-status">${statusOptions}</select>
            </div>
            <div class="wt-field">
              <label class="wt-label" for="wt-location">Lieu</label>
              <input class="input" type="text" id="wt-location" value="${esc(details.location)}">
            </div>
          </div>
          <div class="wt-field">
            <label class="wt-label" for="wt-reminder">Me rappeler</label>
            ${UI.reminderSelectHTML('wt-reminder')}
          </div>
          <button type="submit" class="btn btn--primary">Ajouter au suivi</button>
        </form>
      </div>

      <div class="wt-panel card wt-success hidden" role="status">${ICONS.success}<span>Offre ajoutée au suivi</span></div>
    `);

    const pill = shadow.querySelector('.wt-pill');
    const panel = shadow.querySelector('.wt-panel');
    const success = shadow.querySelector('.wt-success');
    const formEl = shadow.querySelector('.wt-form');

    pill.addEventListener('click', () => {
      pill.classList.add('hidden');
      panel.classList.remove('hidden');
      shadow.getElementById('wt-title').focus();
    });

    shadow.querySelector('.wt-close').addEventListener('click', () => {
      panel.classList.add('hidden');
      pill.classList.remove('hidden');
      pill.focus();
    });

    formEl.addEventListener('submit', (e) => {
      e.preventDefault();

      const newJob = JobTracker.createCandidature({
        title: shadow.getElementById('wt-title').value.trim(),
        company: shadow.getElementById('wt-company').value.trim(),
        status: shadow.getElementById('wt-status').value,
        location: shadow.getElementById('wt-location').value.trim(),
        reminderAt: UI.reminderFromPreset(shadow.getElementById('wt-reminder').value),
        url: details.url,
        notes: 'Ajouté automatiquement depuis l\'offre en ligne via le widget.'
      });

      // Réserver l'affichage du succès avant d'écrire : onChange peut arriver
      // avant le retour de l'écriture et remplacerait le widget trop tôt.
      successUntil = Date.now() + SUCCESS_MS;
      const showCurrentState = () => {
        successUntil = 0;
        JobTracker.getAll(syncWidget);
      };

      JobTracker.update((list) => {
        // Vérification de dernière seconde (ajout possible depuis un autre onglet)
        if (JobTracker.isDuplicate(list, newJob)) return null;
        return [newJob, ...list];
      }, (saved) => {
        if (!saved) {
          // Déjà suivie (ajoutée ailleurs entre-temps) : afficher son statut
          showCurrentState();
          return;
        }
        panel.classList.add('hidden');
        success.classList.remove('hidden');
        // Puis l'état de l'offre affichée (« déjà suivie » + statut)
        setTimeout(showCurrentState, SUCCESS_MS);
      });
    });
  }

  // --- WIDGET POUR OFFRE DÉJÀ SUIVIE ---
  function injectAlreadyTrackedWidget(candidature) {
    const { shadow } = createWidgetRoot(`
      <button type="button" class="wt-pill" title="Ouvrir dans le tableau de bord">
        ${ICONS.check}<span>Offre déjà suivie</span>${UI.statusTag(candidature.status)}
      </button>
    `);

    // Une page web ne peut pas ouvrir directement une page de l'extension :
    // on demande au service worker d'ouvrir l'onglet.
    shadow.querySelector('.wt-pill').addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ action: 'openDashboard', id: candidature.id });
      } catch (e) {
        // Contexte invalidé (extension rechargée) : recharger la page suffit
        console.warn("Apply View : rechargez la page pour réactiver l'extension.", e);
      }
    });
  }
})();
