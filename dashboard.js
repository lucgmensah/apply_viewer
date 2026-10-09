// --- DASHBOARD : STATISTIQUES, KANBAN, PANNEAU DE DÉTAIL ---
// Dépend de shared.js (JobTracker) et ui.js (UI).

const state = {
  list: [],
  query: '',
  panelId: null, // id de la candidature ouverte, 'new' en création
  returnFocus: null, // sélecteur de l'élément à refocaliser à la fermeture
  panelSnapshot: null // valeurs du panneau à l'ouverture
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => JobTracker.escapeHTML(s);

const ICONS = {
  total: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  sent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/></svg>',
  interview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  offer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/></svg>',
  rate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
};

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
  $('#search-input').addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
    renderKanban();
  });
  $('#btn-add').addEventListener('click', () => openPanel({}));
  $('#btn-export').addEventListener('click', handleExportCSV);

  setupKanbanEvents();
  setupPanel();

  JobTracker.getAll((list) => {
    state.list = list;
    render();
    openFromHash();
  });
  JobTracker.onChange((list) => {
    state.list = list;
    // La candidature ouverte a été supprimée ailleurs (popup, autre onglet)
    if (state.panelId && state.panelId !== 'new' && !list.some((c) => c.id === state.panelId)) {
      closePanel();
      UI.toast('Cette candidature a été supprimée');
    }
    render();
  });
});

function render() {
  renderStats();
  renderKanban();
}

// --- STATISTIQUES ---
function renderStats() {
  const s = UI.computeStats(state.list);
  const cards = [
    { id: 'total', label: 'Total', value: s.total },
    { id: 'sent', label: 'Envoyées', value: s.sent },
    { id: 'interview', label: 'Entretiens', value: s.interview },
    { id: 'offer', label: 'Offres', value: s.offer },
    { id: 'rate', label: 'Taux de réponse', value: s.responseRate === null ? '—' : `${s.responseRate} %`,
      title: 'Estimation : candidatures ayant dépassé le statut "envoyée"' }
  ];
  $('.stats').innerHTML = cards.map((c) => `
    <div class="card stat-card" data-stat="${c.id}"${c.title ? ` title="${esc(c.title)}"` : ''}>
      <span class="stat-card__icon" aria-hidden="true">${ICONS[c.id]}</span>
      <span class="stat-card__value">${esc(String(c.value))}</span>
      <span class="stat-card__label">${esc(c.label)}</span>
    </div>`).join('');
}

// --- KANBAN ---
function matchesQuery(c) {
  if (!state.query) return true;
  return ['title', 'company', 'location', 'notes'].some((k) => (c[k] || '').toLowerCase().includes(state.query));
}

const ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

function reminderTagHTML(value) {
  const short = UI.formatReminderShort(value);
  if (!short) return '';
  return `<span class="tag tag--reminder kanban-card__reminder" title="Rappel : ${esc(UI.formatReminder(value))}">${ICON_CLOCK}${esc(short)}</span>`;
}

function cardHTML(c) {
  const meta = [c.location, UI.relativeTime(c.dateApplied)].filter(Boolean).map(esc).join(' · ');
  return `
    <article class="kanban-card" data-id="${esc(c.id)}" draggable="true" tabindex="0" aria-label="${esc(c.title)} — ${esc(c.company)}">
      <div class="kanban-card__title">${esc(c.title)}</div>
      <div class="kanban-card__company">${esc(c.company)}</div>
      <div class="kanban-card__footer">
        <span class="kanban-card__meta">${meta}</span>
        ${c.salary ? `<span class="tag tag--neutral">${esc(c.salary)}</span>` : ''}
      </div>
      ${reminderTagHTML(c.reminderAt)}
    </article>`;
}

function renderKanban() {
  const visible = UI.sortCandidatures(state.list.filter(matchesQuery));
  $('.kanban').innerHTML = UI.STATUSES.map((s) => {
    const cards = visible.filter((c) => UI.statusOf(c).id === s.id);
    return `
      <section class="kanban-col" data-status="${s.id}" aria-label="${esc(s.label)}">
        <header class="kanban-col__header">
          <span class="kanban-col__dot" style="background: var(--status-${s.id}-fg)" aria-hidden="true"></span>
          <h2 class="kanban-col__title">${esc(s.label)}</h2>
          <span class="kanban-col__count">${cards.length}</span>
          <button type="button" class="icon-btn kanban-col__add" aria-label="Ajouter dans ${esc(s.label)}" title="Ajouter dans ${esc(s.label)}">${ICONS.plus}</button>
        </header>
        <div class="kanban-col__cards">
          ${cards.length ? cards.map(cardHTML).join('') : '<p class="kanban-col__empty">Aucune candidature</p>'}
        </div>
      </section>`;
  }).join('');
}

// Délégation d'événements : le Kanban est redessiné à chaque modification
function setupKanbanEvents() {
  const kanban = $('.kanban');

  kanban.addEventListener('click', (e) => {
    const add = e.target.closest('.kanban-col__add');
    if (add) {
      openPanel({ status: add.closest('.kanban-col').dataset.status, returnFocus: add });
      return;
    }
    const card = e.target.closest('.kanban-card');
    if (card) openPanel({ id: card.dataset.id, returnFocus: card });
  });

  kanban.addEventListener('keydown', (e) => {
    const card = e.target.closest('.kanban-card');
    if (card && e.key === 'Enter') {
      e.preventDefault();
      openPanel({ id: card.dataset.id, returnFocus: card });
    }
  });

  // --- GLISSER-DÉPOSER ---
  let draggedId = null;

  kanban.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    draggedId = card.dataset.id;
    card.classList.add('kanban-card--dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    }
  });

  kanban.addEventListener('dragend', (e) => {
    const card = e.target.closest('.kanban-card');
    if (card) card.classList.remove('kanban-card--dragging');
    kanban.querySelectorAll('.kanban-col--drop').forEach((c) => c.classList.remove('kanban-col--drop'));
    draggedId = null;
  });

  kanban.addEventListener('dragover', (e) => {
    const col = e.target.closest('.kanban-col');
    if (!col || !draggedId) return;
    e.preventDefault();
    kanban.querySelectorAll('.kanban-col--drop').forEach((c) => c !== col && c.classList.remove('kanban-col--drop'));
    col.classList.add('kanban-col--drop');
  });

  kanban.addEventListener('dragleave', (e) => {
    const col = e.target.closest('.kanban-col');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('kanban-col--drop');
  });

  kanban.addEventListener('drop', (e) => {
    const col = e.target.closest('.kanban-col');
    if (!col || !draggedId) return;
    e.preventDefault();
    col.classList.remove('kanban-col--drop');
    const id = draggedId;
    const status = col.dataset.status;
    JobTracker.update((list) => list.map((c) => (c.id === id ? JobTracker.applyStatus(c, status) : c)), (saved, list) => {
      state.list = list;
      render();
    });
  });
}

// --- PANNEAU DE DÉTAIL ---
const FIELDS = {
  title: 'f-title',
  company: 'f-company',
  dateApplied: 'f-date',
  location: 'f-location',
  salary: 'f-salary',
  url: 'f-url',
  contactName: 'f-contact-name',
  contactEmail: 'f-contact-email',
  contactPhone: 'f-contact-phone',
  notes: 'f-notes',
  reminderAt: 'f-reminder-input'
};

const panelEls = () => ({ panel: $('.panel'), backdrop: $('.panel-backdrop') });

function setupPanel() {
  $('#f-reminder').innerHTML = UI.reminderFieldHTML('f-reminder', '');
  UI.bindReminderField($('#f-reminder'), 'f-reminder', () => {});
  $('.status-group').innerHTML = UI.STATUSES.map((s) => `
    <label class="status-option">
      <input type="radio" name="status" value="${s.id}">
      ${UI.statusTag(s.id)}
    </label>`).join('');

  $('#panel-form').addEventListener('submit', (e) => {
    e.preventDefault();
    savePanel();
  });
  $('#panel-close').addEventListener('click', closePanel);
  $('#panel-cancel').addEventListener('click', closePanel);
  $('.panel-backdrop').addEventListener('click', closePanel);
  $('#panel-delete').addEventListener('click', () => deleteCandidature(state.panelId));

  // Écouté sur le document : un clic dans une zone non focalisable du panneau
  // renvoie le focus sur <body>, hors du panneau.
  document.addEventListener('keydown', (e) => {
    if ($('.panel').classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
    }
    if (e.key === 'Tab') trapFocus(e);
  });

  window.addEventListener('hashchange', openFromHash);
}

// Garde le focus dans le panneau tant qu'il est ouvert
function trapFocus(e) {
  const focusables = [...$('.panel').querySelectorAll('button, input, textarea, select, a[href]')]
    .filter((el) => !el.disabled && el.offsetParent !== null && !(el.type === 'radio' && !el.checked));
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!$('.panel').contains(document.activeElement)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// Sélecteur de l'élément qui a ouvert le panneau (les cartes sont recréées à chaque rendu)
function focusSelector(el) {
  if (!el) return null;
  if (el.dataset && el.dataset.id) return `.kanban-card[data-id="${CSS.escape(el.dataset.id)}"]`;
  const col = el.closest && el.closest('.kanban-col');
  if (col) return `.kanban-col[data-status="${col.dataset.status}"] .kanban-col__add`;
  return el.id ? `#${el.id}` : null;
}

function openPanel({ id, status, returnFocus } = {}) {
  const existing = id ? state.list.find((c) => c.id === id) : null;
  if (id && !existing) {
    UI.toast('Candidature introuvable');
    return;
  }

  const c = existing || { status: status || 'wishlist', dateApplied: JobTracker.todayISO() };
  state.panelId = existing ? existing.id : 'new';
  state.returnFocus = focusSelector(returnFocus || document.activeElement);

  $('#panel-heading').textContent = existing ? 'Modifier la candidature' : 'Nouvelle candidature';
  $('#panel-delete').classList.toggle('hidden', !existing);
  for (const [key, elId] of Object.entries(FIELDS)) {
    const input = document.getElementById(elId);
    input.value = c[key] || '';
    input.removeAttribute('aria-invalid');
  }
  const statusId = UI.statusOf(c).id;
  document.querySelectorAll('.panel input[name="status"]').forEach((r) => { r.checked = r.value === statusId; });
  // Valeurs à l'ouverture : à l'enregistrement, seuls les champs modifiés sont écrits,
  // pour ne pas écraser ce qui a changé ailleurs pendant l'édition.
  state.panelSnapshot = readPanelFields();

  const { panel, backdrop } = panelEls();
  panel.classList.remove('hidden');
  backdrop.classList.remove('hidden');
  panel.querySelector('.panel__body').scrollTop = 0;
  history.replaceState(null, '', existing ? '#' + encodeURIComponent(existing.id) : location.pathname);
  $('#f-title').focus();
}

function closePanel() {
  const { panel, backdrop } = panelEls();
  if (panel.classList.contains('hidden')) return;
  panel.classList.add('hidden');
  backdrop.classList.add('hidden');
  state.panelId = null;
  history.replaceState(null, '', location.pathname);
  const target = state.returnFocus && document.querySelector(state.returnFocus);
  if (target) target.focus();
}

function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  if (state.list.some((c) => c.id === id)) {
    openPanel({ id });
  } else {
    history.replaceState(null, '', location.pathname);
    UI.toast('Candidature introuvable');
  }
}

function readPanelFields() {
  const data = {};
  for (const [key, elId] of Object.entries(FIELDS)) data[key] = document.getElementById(elId).value.trim();
  data.status = (document.querySelector('.panel input[name="status"]:checked') || {}).value || 'wishlist';
  return data;
}

function savePanel() {
  const fields = readPanelFields();
  const missing = ['title', 'company'].filter((k) => !fields[k]);
  for (const k of ['title', 'company']) {
    document.getElementById(FIELDS[k]).setAttribute('aria-invalid', String(missing.includes(k)));
  }
  if (missing.length) {
    document.getElementById(FIELDS[missing[0]]).focus();
    UI.toast("Le poste et l'entreprise sont obligatoires.");
    return;
  }

  // Rappel : seulement s'il a été modifié, et dans le futur
  if (fields.reminderAt !== state.panelSnapshot.reminderAt && !UI.isValidFutureReminder(fields.reminderAt)) {
    document.getElementById(FIELDS.reminderAt).focus();
    UI.toast('Choisissez une date à venir');
    return;
  }

  const editId = state.panelId !== 'new' ? state.panelId : null;
  const candidature = editId ? null : JobTracker.createCandidature(fields);
  const changes = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== state.panelSnapshot[k]));

  JobTracker.update((list) => {
    if (!editId) return JobTracker.isDuplicate(list, fields) ? null : [candidature, ...list];
    const current = list.find((c) => c.id === editId);
    const merged = { ...current, ...changes };
    if (!current || JobTracker.isDuplicate(list, merged, editId)) return null;
    return list.map((c) => (c.id === editId ? merged : c));
  }, (saved, list) => {
    if (!saved) {
      UI.toast('Une candidature identique existe déjà.');
      return;
    }
    state.list = list;
    render();
    closePanel();
    UI.toast('Candidature enregistrée');
  });
}

// Suppression immédiate, annulable pendant 5 s (réinsertion à la position d'origine)
function deleteCandidature(id) {
  let removed = null;
  // Fermer avant d'écrire : onChange peut arriver avant le retour de l'écriture
  // et ne doit pas prendre cette suppression pour une suppression faite ailleurs.
  closePanel();
  JobTracker.update((list) => {
    const index = list.findIndex((c) => c.id === id);
    if (index === -1) return null;
    removed = { item: list[index], index };
    return list.filter((c) => c.id !== id);
  }, (saved, list) => {
    state.list = list;
    render();
    if (!saved) return;
    UI.toast('Candidature supprimée', {
      actionLabel: 'Annuler',
      duration: 5000,
      onAction: () => JobTracker.update((current) => {
        if (current.some((c) => c.id === removed.item.id)) return null;
        const next = current.slice();
        next.splice(Math.min(removed.index, next.length), 0, removed.item);
        return next;
      }, (restored, restoredList) => {
        state.list = restoredList;
        render();
      })
    });
  });
}

// --- EXPORT CSV ---
// Contenu CSV : séparateur point-virgule (Excel FR Windows)
function buildCSV(list) {
  const headers = [
    'Titre du Poste', 'Entreprise', 'Statut', 'Date Action / Envoi', 'Lieu', 'Salaire',
    "Lien de l'offre", 'Contact Nom', 'Contact Email', 'Contact Telephone', 'Rappel', 'Notes'
  ];

  const rows = list.map((c) => [
    c.title, c.company, UI.statusOf(c).label, c.dateApplied, c.location, c.salary,
    c.url, c.contactName, c.contactEmail, c.contactPhone, (c.reminderAt || '').replace('T', ' '), c.notes
  ]);

  return [
    headers.join(';'),
    ...rows.map((row) => row.map((val) => {
      // Neutraliser les formules Excel (=, +, -, @) issues de contenus scrapés
      let text = String(val || '');
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
      // Échapper les guillemets et remplacer les retours à la ligne par des espaces
      return `"${text.replace(/"/g, '""').replace(/\r?\n|\r/g, ' ')}"`;
    }).join(';'))
  ].join('\r\n');
}

function handleExportCSV() {
  if (state.list.length === 0) {
    UI.toast('Aucune candidature à exporter.');
    return;
  }

  // BOM UTF-8 pour qu'Excel Windows reconnaisse l'encodage
  const blob = new Blob(['﻿' + buildCSV(state.list)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `suivi_candidatures_${JobTracker.todayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
