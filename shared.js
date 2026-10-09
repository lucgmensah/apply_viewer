// --- MODULE PARTAGÉ (POPUP, DASHBOARD, SCRIPT DE CONTENU) ---
// Déclaré avec `var` : le script peut être réinjecté dans une page par la popup
// sans provoquer d'erreur de redéclaration.
var JobTracker = window.JobTracker || (() => {
  const STORAGE_KEY = 'candidatures';
  const LOCAL_KEY = 'job_tracker_candidatures'; // Fallback hors extension (développement)

  const hasChromeStorage = () =>
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  // --- STOCKAGE ---
  function getAll(callback) {
    if (hasChromeStorage()) {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        callback(result[STORAGE_KEY] || []);
      });
    } else {
      const data = localStorage.getItem(LOCAL_KEY);
      callback(data ? JSON.parse(data) : []);
    }
  }

  function saveAll(list, callback) {
    if (hasChromeStorage()) {
      chrome.storage.local.set({ [STORAGE_KEY]: list }, () => {
        if (callback) callback();
      });
    } else {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      if (callback) callback();
    }
  }

  // Lit la version la plus récente du stockage, applique `mutator` puis enregistre.
  // `mutator` renvoie la nouvelle liste, ou null pour annuler l'écriture.
  // Évite d'écraser des ajouts faits ailleurs (widget, popup) avec une copie périmée.
  function update(mutator, callback) {
    getAll((list) => {
      const updated = mutator(list);
      if (!updated) {
        if (callback) callback(false, list);
        return;
      }
      saveAll(updated, () => {
        if (callback) callback(true, updated);
      });
    });
  }

  // Notifie chaque modification de la liste (y compris depuis un autre contexte)
  function onChange(callback) {
    if (hasChromeStorage()) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[STORAGE_KEY]) {
          callback(changes[STORAGE_KEY].newValue || []);
        }
      });
    } else {
      window.addEventListener('storage', (e) => {
        if (e.key === LOCAL_KEY) callback(e.newValue ? JSON.parse(e.newValue) : []);
      });
    }
  }

  // --- IDENTIFICATION DES OFFRES ---
  function parseUrl(url) {
    try {
      return new URL(url);
    } catch (e) {
      return null;
    }
  }

  // Identifiant stable d'une offre sur un site supporté, ou null si l'URL
  // n'est pas une page d'offre. Sur Indeed et LinkedIn, l'identifiant est
  // dans les paramètres : on ne peut pas simplement les supprimer.
  function siteJobKey(url) {
    const u = parseUrl(url);
    if (!u) return null;
    const host = u.hostname;

    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
      const viewMatch = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/);
      const id = (viewMatch && viewMatch[1]) || u.searchParams.get('currentJobId');
      return id ? `linkedin:${id}` : null;
    }

    if (host === 'indeed.com' || host.endsWith('.indeed.com')) {
      const id = u.searchParams.get('jk') || u.searchParams.get('vjk');
      return id ? `indeed:${id}` : null;
    }

    if (host === 'welcometothejungle.com' || host.endsWith('.welcometothejungle.com')) {
      const match = u.pathname.match(/\/companies\/([^/]+)\/jobs\/([^/?#]+)/);
      return match ? `wttj:${match[1]}/${match[2]}`.toLowerCase() : null;
    }

    return null;
  }

  // Clé de comparaison d'URL : identifiant du site si connu, sinon URL sans paramètres
  function jobKey(url) {
    if (!url) return '';
    const siteKey = siteJobKey(url);
    if (siteKey) return siteKey;
    const u = parseUrl(url);
    if (!u) return url.split('?')[0].split('#')[0].trim();
    return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
  }

  function isSupportedSite(url) {
    const u = parseUrl(url);
    if (!u) return false;
    return /(^|\.)(linkedin|indeed|welcometothejungle)\.com$/.test(u.hostname);
  }

  const normalize = (str) => String(str || '').trim().toLowerCase();

  // Candidature correspondant à la même offre (par URL) ou, à défaut d'URL,
  // au même poste dans la même entreprise. null si aucune.
  function findDuplicate(list, candidate, excludeId) {
    const key = jobKey(candidate.url);
    const title = normalize(candidate.title);
    const company = normalize(candidate.company);

    const match = list.find((item) => {
      if (excludeId && item.id === excludeId) return false;
      if (key && item.url) return jobKey(item.url) === key;
      return title.length > 0 && normalize(item.title) === title && normalize(item.company) === company;
    });
    return match || null;
  }

  function isDuplicate(list, candidate, excludeId) {
    return findDuplicate(list, candidate, excludeId) !== null;
  }

  // --- CRÉATION ---
  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'uuid-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now().toString(36);
  }

  // Date du jour au format AAAA-MM-JJ dans le fuseau local (toISOString est en UTC)
  function todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function createCandidature(fields) {
    return {
      id: generateId(),
      title: '',
      company: '',
      status: 'wishlist',
      dateApplied: todayISO(),
      location: '',
      salary: '',
      url: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      notes: '',
      ...fields
    };
  }

  // Copie avec le nouveau statut ; passer à « envoyée » sans date renseigne la date du jour
  function applyStatus(candidature, status) {
    const needsDate = status === 'applied' && !candidature.dateApplied;
    return { ...candidature, status, dateApplied: needsDate ? todayISO() : candidature.dateApplied };
  }

  // --- UTILS ---
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    getAll,
    saveAll,
    update,
    onChange,
    siteJobKey,
    jobKey,
    isSupportedSite,
    findDuplicate,
    isDuplicate,
    generateId,
    todayISO,
    createCandidature,
    applyStatus,
    escapeHTML
  };
})();
window.JobTracker = JobTracker;
