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
  detected: null, // résultat du scraping de l'onglet courant
  tracked: null // candidature correspondant à l'offre détectée
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => JobTracker.escapeHTML(s);

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
  $('#btn-add').addEventListener('click', () => go('add'));
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

  JobTracker.getAll((list) => {
    state.list = list;
    render();
  });
  JobTracker.onChange((list) => {
    state.list = list;
    render();
  });
});

// --- NAVIGATION ---
function go(view, selectedId = null) {
  state.view = view;
  state.selectedId = selectedId;
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

// --- VUE DÉTAIL (tâche 7) ---
function renderDetail() {}

// --- VUE AJOUT (tâche 6) ---
function renderAdd() {}
