// --- DASHBOARD : STATISTIQUES, KANBAN, PANNEAU DE DÉTAIL ---
// Dépend de shared.js (JobTracker) et ui.js (UI).

const state = {
  list: [],
  query: ''
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

  JobTracker.getAll((list) => {
    state.list = list;
    render();
  });
  JobTracker.onChange((list) => {
    state.list = list;
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

// --- PANNEAU DE DÉTAIL (tâche 9) ---
function openPanel({ id, status, returnFocus } = {}) {}

// --- EXPORT CSV ---
function handleExportCSV() {
  if (state.list.length === 0) {
    UI.toast('Aucune candidature à exporter.');
    return;
  }

  const headers = [
    'Titre du Poste', 'Entreprise', 'Statut', 'Date Action / Envoi', 'Lieu', 'Salaire',
    "Lien de l'offre", 'Contact Nom', 'Contact Email', 'Contact Telephone', 'Notes'
  ];

  const rows = state.list.map((c) => [
    c.title, c.company, UI.statusOf(c).label, c.dateApplied, c.location, c.salary,
    c.url, c.contactName, c.contactEmail, c.contactPhone, c.notes
  ]);

  // Séparateur point-virgule (Excel FR Windows)
  const csvContent = [
    headers.join(';'),
    ...rows.map((row) => row.map((val) => {
      // Neutraliser les formules Excel (=, +, -, @) issues de contenus scrapés
      let text = String(val || '');
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
      // Échapper les guillemets et remplacer les retours à la ligne par des espaces
      return `"${text.replace(/"/g, '""').replace(/\r?\n|\r/g, ' ')}"`;
    }).join(';'))
  ].join('\r\n');

  // BOM UTF-8 pour qu'Excel Windows reconnaisse l'encodage
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `suivi_candidatures_${JobTracker.todayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
