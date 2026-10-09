// --- POPUP : LISTE / DÉTAIL / AJOUT ---
// Dépend de shared.js (JobTracker) et ui.js (UI).

const GROUP_KEY = 'applyview.popup.group';

const EMPTY_TEXT = {
  todo: 'Aucune offre à postuler.',
  progress: 'Aucune candidature en cours.',
  done: "Rien de terminé pour l'instant."
};

const state = {
  view: 'list', // 'list' | 'detail' | 'add'
  selectedId: null,
  group: loadGroup(),
  query: '',
  list: [],
  detected: null, // offre détectée dans l'onglet courant
  pageInfo: null, // titre / URL de la page ouverte, même hors offre reconnue
  addPrefill: null, // valeurs initiales de la vue Ajout
  addStatus: 'wishlist' // statut proposé dans la vue Ajout
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => JobTracker.escapeHTML(s);

const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>';

function loadGroup() {
  try {
    const g = localStorage.getItem(GROUP_KEY);
    if (UI.GROUPS.some((x) => x.id === g)) return g;
  } catch (e) { /* stockage indisponible */ }
  return 'progress';
}

function saveGroup(group) {
  try { localStorage.setItem(GROUP_KEY, group); } catch (e) { /* stockage indisponible */ }
}

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
  $('#btn-add').addEventListener('click', () => {
    if (state.detected) openAdd(state.detected, 'applied');
    else openAdd(state.pageInfo, 'wishlist');
  });
  $('#btn-dashboard').addEventListener('click', () => openDashboard());

  $('.segmented').addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented__item');
    if (!btn) return;
    state.group = btn.dataset.group;
    saveGroup(state.group);
    renderList();
  });

  $('#search-toggle').addEventListener('click', toggleSearch);
  $('#search-input').addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
    renderList();
  });

  $('#job-list').addEventListener('click', (e) => {
    const item = e.target.closest('.job-item');
    if (item) go('detail', item.dataset.id);
  });

  $('#banner').addEventListener('click', (e) => {
    if (!e.target.closest('#banner-action')) return;
    const tracked = trackedOffer();
    if (tracked) go('detail', tracked.id);
    else openAdd(state.detected, 'applied');
  });

  JobTracker.getAll((list) => {
    state.list = list;
    render();
    detectCurrentOffer();
  });
  JobTracker.onChange((list) => {
    state.list = list;
    // La candidature affichée a été supprimée ailleurs (dashboard, autre fenêtre)
    if (state.view === 'detail' && !list.some((c) => c.id === state.selectedId)) {
      go('list');
      UI.toast('Cette candidature a été supprimée');
      return;
    }
    render();
  });
});

// --- NAVIGATION ---
function go(view, selectedId = null) {
  state.view = view;
  state.selectedId = selectedId;
  delete $('#view-add').dataset.built;
  render();
  $('.popup-main').scrollTop = 0;
}

function render() {
  for (const view of ['list', 'detail', 'add']) {
    $(`#view-${view}`).classList.toggle('hidden', state.view !== view);
  }
  if (state.view === 'list') renderList();
  if (state.view === 'detail') renderDetail();
  if (state.view === 'add') renderAdd();
}

function openDashboard(id) {
  const hash = id ? '#' + encodeURIComponent(id) : '';
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html' + hash) });
}

// --- OFFRE DE L'ONGLET COURANT ---
// `?tabId=<id>` (réservé aux tests) cible un onglet précis : un test ne peut pas
// ouvrir la vraie popup de la barre d'outils.
function getTargetTab() {
  return new Promise((resolve) => {
    const forced = Number(new URLSearchParams(location.search).get('tabId'));
    if (forced) {
      chrome.tabs.get(forced, (tab) => resolve(chrome.runtime.lastError ? null : tab));
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve((tabs && tabs[0]) || null));
  });
}

// L'URL peut être inconnue (pas de permission sur l'onglet) : on tente alors
// la détection, qui échoue sans conséquence sur une page interne.
function isInternalUrl(url) {
  return !!url && /^(chrome|chrome-extension|about|edge|devtools):/.test(url);
}

function askJobDetails(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'getJobDetails' }, (response) => {
      resolve(chrome.runtime.lastError ? undefined : response);
    });
  });
}

// Titre d'onglet sans le nom du site (« Poste - Entreprise | Site » → « Poste »)
function cleanTabTitle(title) {
  return (title || '').split(' | ')[0].split(' - ')[0].trim();
}

async function detectCurrentOffer() {
  const tab = await getTargetTab();
  if (!tab || isInternalUrl(tab.url)) return;

  // Informations de la page, même si ce n'est pas une offre reconnue :
  // elles pré-remplissent l'ajout manuel (« + »), comme l'ancienne popup.
  if (tab.url) state.pageInfo = { title: cleanTabTitle(tab.title), company: '', location: '', url: tab.url };

  let response = await askJobDetails(tab.id);
  if (response === undefined) {
    // Script absent (onglet ouvert avant l'installation, site non déclaré) : l'injecter
    const injected = await new Promise((resolve) => {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ['shared.js', 'ui.js', 'content.js'] },
        () => resolve(!chrome.runtime.lastError)
      );
    });
    if (injected) response = await askJobDetails(tab.id);
  }

  if (response && (response.title || response.company)) {
    state.pageInfo = {
      title: response.title || (state.pageInfo && state.pageInfo.title) || '',
      company: response.company || '',
      location: response.location || '',
      url: response.url || tab.url || ''
    };
  }

  if (response && response.success) {
    state.detected = {
      title: response.title,
      company: response.company,
      location: response.location,
      url: response.url || tab.url
    };
    render();
  }
}

// Candidature suivie correspondant à l'offre détectée (recalculée à chaque rendu)
function trackedOffer() {
  return state.detected ? JobTracker.findDuplicate(state.list, state.detected) : null;
}

function renderBanner() {
  const banner = $('#banner');
  if (!state.detected) {
    banner.className = 'hidden';
    return;
  }
  const tracked = trackedOffer();
  const label = [state.detected.title, state.detected.company].filter(Boolean).join(' — ');
  banner.className = 'banner';
  banner.innerHTML = tracked
    ? `<div class="banner__text">
         <span class="banner__eyebrow">Déjà suivie</span>
         <span class="banner__title">${esc(label)}</span>
       </div>
       <button type="button" id="banner-action" class="banner__tracked" aria-label="Voir le détail">${UI.statusTag(tracked.status)}</button>`
    : `<div class="banner__text">
         <span class="banner__eyebrow">Offre détectée</span>
         <span class="banner__title">${esc(label)}</span>
       </div>
       <button type="button" id="banner-action" class="btn btn--primary">Ajouter cette offre</button>`;
}

// --- VUE LISTE ---
function toggleSearch() {
  const input = $('#search-input');
  const open = input.classList.toggle('hidden') === false;
  $('#search-toggle').setAttribute('aria-expanded', String(open));
  if (open) {
    input.focus();
  } else {
    input.value = '';
    state.query = '';
    renderList();
  }
}

function matchesQuery(c) {
  if (!state.query) return true;
  return ['title', 'company', 'location'].some((k) => (c[k] || '').toLowerCase().includes(state.query));
}

function renderList() {
  renderBanner();
  const inGroup = (c, g) => UI.statusOf(c).group === g;

  $('.segmented').innerHTML = UI.GROUPS.map((g) => `
    <button type="button" class="segmented__item" role="tab" data-group="${g.id}" aria-selected="${g.id === state.group}">
      ${esc(g.label)} <span class="segmented__count">${state.list.filter((c) => inGroup(c, g.id)).length}</span>
    </button>`).join('');

  const items = UI.sortCandidatures(state.list.filter((c) => inGroup(c, state.group) && matchesQuery(c)));
  $('#list-count').textContent = `${items.length} candidature${items.length > 1 ? 's' : ''}`;

  const list = $('#job-list');
  if (items.length === 0) {
    const text = state.query ? `Aucun résultat pour « ${state.query} ».` : EMPTY_TEXT[state.group];
    list.innerHTML = `<div class="empty-state">${esc(text)}</div>`;
    return;
  }
  list.innerHTML = items
    .map((c) => `<button type="button" class="job-item" data-id="${esc(c.id)}">${UI.jobItemHTML(c)}</button>`)
    .join('');
}

// --- VUE DÉTAIL ---
function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function renderDetail() {
  const view = $('#view-detail');
  const c = state.list.find((x) => x.id === state.selectedId);
  if (!c) return;

  const status = UI.statusOf(c);
  const row = (field, label, valueHTML) => valueHTML
    ? `<div class="field-row" data-field="${field}"><span class="field-row__label">${label}</span><span class="field-row__value">${valueHTML}</span></div>`
    : '';

  const contact = [
    c.contactName ? esc(c.contactName) : '',
    c.contactEmail ? `<a href="mailto:${esc(c.contactEmail)}">${esc(c.contactEmail)}</a>` : '',
    c.contactPhone ? esc(c.contactPhone) : ''
  ].filter(Boolean).join('<br>');

  const menu = UI.STATUSES
    .map((s) => `<button type="button" role="menuitem" data-status="${s.id}" tabindex="-1">${UI.statusTag(s.id)}</button>`)
    .join('');

  view.innerHTML = `
    <div class="panel-header">
      <button type="button" class="icon-btn" id="detail-back" aria-label="Retour à la liste">${ICON_BACK}</button>
      <h2>Détail</h2>
    </div>
    <article class="card detail-card">
      <p class="detail-company">${esc(c.company)}</p>
      <h3 class="detail-title">${esc(c.title)}</h3>
      <div class="detail-rows">
        <div class="field-row" data-field="status">
          <span class="field-row__label">Statut</span>
          <span class="field-row__value status-picker">
            <button type="button" id="status-trigger" class="tag tag--${status.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Statut : ${esc(status.short)}. Modifier">${esc(status.short)}</button>
            <div id="status-menu" class="status-menu hidden" role="menu" aria-label="Choisir un statut">${menu}</div>
          </span>
        </div>
        <div class="field-row" data-field="reminder">
          <span class="field-row__label">Rappel</span>
          <span class="field-row__value">
            <button type="button" id="reminder-trigger" class="link-btn" aria-expanded="false" aria-controls="reminder-editor">${esc(UI.formatReminder(c.reminderAt) || 'Aucun')}</button>
          </span>
        </div>
        <div id="reminder-editor" class="reminder-editor hidden">
          ${UI.reminderFieldHTML('d-reminder', c.reminderAt || '')}
          <button type="button" id="reminder-save" class="btn btn--primary">OK</button>
          <p id="reminder-error" class="form-error" role="alert"></p>
        </div>
        ${row('date', 'Date', esc(formatDate(c.dateApplied)))}
        ${row('location', 'Lieu', esc(c.location))}
        ${row('salary', 'Salaire', esc(c.salary))}
        ${row('contact', 'Contact', contact)}
        ${row('url', 'Offre', c.url ? `<a id="detail-url" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Ouvrir l'offre ↗</a>` : '')}
      </div>
    </article>
    ${c.notes ? `<section><h3 class="section-title">Notes</h3><p class="card detail-notes">${esc(c.notes)}</p></section>` : ''}
    <button type="button" id="detail-edit" class="btn btn--secondary">Modifier dans le dashboard</button>`;

  $('#detail-back').addEventListener('click', () => go('list'));
  $('#detail-edit').addEventListener('click', () => openDashboard(c.id));
  bindStatusMenu(c.id);
  bindReminderEditor(c.id);
}

// Rappel : chaque choix est enregistré immédiatement, comme le statut
function bindReminderEditor(id) {
  const trigger = $('#reminder-trigger');
  const editor = $('#reminder-editor');
  trigger.addEventListener('click', () => {
    const open = editor.classList.toggle('hidden') === false;
    trigger.setAttribute('aria-expanded', String(open));
  });

  const save = (value) => {
    if (value === null || !UI.isValidFutureReminder(value)) {
      $('#reminder-error').textContent = 'Choisissez une date à venir';
      return;
    }
    JobTracker.update((list) => list.map((c) => (c.id === id ? { ...c, reminderAt: value } : c)), (saved, list) => {
      state.list = list;
      render();
      UI.toast(value ? 'Rappel programmé' : 'Rappel retiré');
    });
  };

  UI.bindReminderField(editor, 'd-reminder', save);
  $('#reminder-save').addEventListener('click', () => save(UI.readReminderInput($('#d-reminder-input'))));
}

function bindStatusMenu(id) {
  const trigger = $('#status-trigger');
  const menu = $('#status-menu');
  const items = () => [...menu.querySelectorAll('[role="menuitem"]')];

  const close = () => {
    menu.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutside, true);
  };
  const onOutside = (e) => {
    if (!menu.contains(e.target) && e.target !== trigger) close();
  };
  const open = () => {
    menu.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutside, true);
    items()[0].focus();
  };

  trigger.addEventListener('click', () => (menu.classList.contains('hidden') ? open() : close()));

  menu.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); }
  });

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[role="menuitem"]');
    if (!item) return;
    close();
    const status = item.dataset.status;
    JobTracker.update((list) => list.map((c) => (c.id === id ? JobTracker.applyStatus(c, status) : c)), (saved, list) => {
      state.list = list;
      render();
    });
  });
}

// --- VUE AJOUT ---
function openAdd(prefill, status = 'wishlist') {
  state.addPrefill = prefill;
  state.addStatus = status;
  go('add');
}

function renderAdd() {
  const view = $('#view-add');
  // Ne pas reconstruire le formulaire à chaque modification du stockage (saisie en cours)
  if (view.dataset.built) return;
  view.dataset.built = '1';

  const p = state.addPrefill || {};
  const status = state.addStatus;
  const options = UI.STATUSES
    .map((s) => `<option value="${s.id}"${s.id === status ? ' selected' : ''}>${esc(s.label)}</option>`)
    .join('');

  view.innerHTML = `
    <div class="panel-header">
      <button type="button" class="icon-btn" id="add-back" aria-label="Retour">${ICON_BACK}</button>
      <h2>Nouvelle candidature</h2>
    </div>
    <form id="add-form" class="form-stack" novalidate>
      <label class="form-field">Poste *<input class="input" id="add-title" required value="${esc(p.title)}"></label>
      <label class="form-field">Entreprise *<input class="input" id="add-company" required value="${esc(p.company)}"></label>
      <label class="form-field">Statut<select class="select" id="add-status">${options}</select></label>
      <label class="form-field">Lieu<input class="input" id="add-location" value="${esc(p.location)}" placeholder="Paris, télétravail…"></label>
      <label class="form-field">Lien de l'offre<input class="input" id="add-url" type="url" value="${esc(p.url)}" placeholder="https://…"></label>
      <label class="form-field">Me rappeler${UI.reminderSelectHTML('add-reminder')}</label>
      <p id="add-error" class="form-error" role="alert"></p>
      <button type="submit" id="add-submit" class="btn btn--primary">Enregistrer</button>
    </form>`;

  $('#add-back').addEventListener('click', () => go('list'));
  $('#add-form').addEventListener('submit', handleAdd);
  (p.title ? $('#add-submit') : $('#add-title')).focus();
}

function handleAdd(e) {
  e.preventDefault();
  const error = $('#add-error');
  const title = $('#add-title').value.trim();
  const company = $('#add-company').value.trim();
  if (!title || !company) {
    error.textContent = "Le poste et l'entreprise sont obligatoires.";
    return;
  }

  const candidature = JobTracker.createCandidature({
    title,
    company,
    status: $('#add-status').value,
    location: $('#add-location').value.trim(),
    url: $('#add-url').value.trim(),
    reminderAt: UI.reminderFromPreset($('#add-reminder').value),
    notes: "Ajouté depuis la popup de l'extension."
  });

  JobTracker.update((list) => {
    if (JobTracker.isDuplicate(list, candidature)) return null;
    return [candidature, ...list];
  }, (saved, list) => {
    if (!saved) {
      error.textContent = 'Cette offre est déjà dans votre suivi.';
      return;
    }
    state.list = list;
    go('detail', candidature.id);
    UI.toast('Offre ajoutée');
  });
}
