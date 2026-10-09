// --- RENDUS PARTAGÉS (POPUP, DASHBOARD, WIDGET) ---
// Dépend de shared.js (JobTracker.escapeHTML). Déclaré avec `var` pour
// supporter la réinjection du script de contenu, comme shared.js.
var UI = globalThis.UI || (() => {
  const esc = (s) => JobTracker.escapeHTML(s);

  // Ordre des colonnes du Kanban et des menus. `group` = onglet de la popup.
  const STATUSES = [
    { id: 'wishlist', label: 'À postuler', short: 'À postuler', group: 'todo' },
    { id: 'applied', label: 'Candidature envoyée', short: 'Envoyée', group: 'progress' },
    { id: 'interview', label: 'Entretien', short: 'Entretien', group: 'progress' },
    { id: 'offer', label: 'Offre reçue', short: 'Offre', group: 'done' },
    { id: 'rejected', label: 'Refusée / Classée', short: 'Refusée', group: 'done' }
  ];

  const GROUPS = [
    { id: 'todo', label: 'À faire' },
    { id: 'progress', label: 'En cours' },
    { id: 'done', label: 'Terminées' }
  ];

  const BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

  // Statut inconnu (anciennes données) → affiché comme « À postuler », sans réécriture
  function statusOf(c) {
    return BY_ID[c && c.status] || BY_ID.wishlist;
  }

  function statusTag(status) {
    const s = BY_ID[status] || BY_ID.wishlist;
    return `<span class="tag tag--${s.id}">${esc(s.short)}</span>`;
  }

  // 'AAAA-MM-JJ' → Date locale à minuit, ou null
  function parseDay(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  function relativeTime(isoDate, now = new Date()) {
    const d = parseDay(isoDate);
    if (!d) return '';
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((today - d) / 86400000);
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    if (days < 30) return `il y a ${days} j`;

    let months = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
    if (today.getDate() < d.getDate()) months -= 1;
    months = Math.max(months, 1);
    if (months < 12) return `il y a ${months} mois`;
    const years = Math.floor(months / 12);
    return `il y a ${years} an${years > 1 ? 's' : ''}`;
  }

  // Plus récentes d'abord ; sans date valide à la fin ; ordre d'origine conservé à égalité
  function sortCandidatures(list) {
    return list
      .map((c, i) => ({ c, i, t: parseDay(c.dateApplied) }))
      .sort((a, b) => {
        if (a.t && b.t && a.t - b.t !== 0) return b.t - a.t;
        if (!a.t !== !b.t) return a.t ? -1 : 1;
        return a.i - b.i;
      })
      .map((x) => x.c);
  }

  function jobItemHTML(c, { meta = ['company', 'location', 'relative'] } = {}) {
    const parts = meta
      .map((key) => (key === 'relative' ? relativeTime(c.dateApplied) : c[key]))
      .filter(Boolean)
      .map(esc);
    return `<span class="job-item__title">${esc(c.title)}</span>` +
      `<span class="job-item__meta">${parts.join(' · ')}</span>` +
      statusTag(statusOf(c).id);
  }

  function computeStats(list) {
    const count = (id) => list.filter((c) => statusOf(c).id === id).length;
    const total = list.length;
    const sent = total - count('wishlist');
    const interview = count('interview');
    const offer = count('offer');
    const responded = interview + offer + count('rejected');
    return {
      total,
      sent,
      interview,
      offer,
      responseRate: sent > 0 ? Math.round((responded / sent) * 100) : null
    };
  }

  // Message temporaire, avec action facultative (ex. « Annuler »)
  function toast(message, { actionLabel, onAction, duration = 4000 } = {}) {
    let region = document.querySelector('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }

    const el = document.createElement('div');
    el.className = 'toast';
    const text = document.createElement('span');
    text.textContent = message;
    el.appendChild(text);

    const remove = () => el.remove();
    if (actionLabel && onAction) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast__action';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => {
        remove();
        onAction();
      });
      el.appendChild(btn);
    }

    region.appendChild(el);
    setTimeout(remove, duration);
  }

  return { STATUSES, GROUPS, statusOf, statusTag, relativeTime, sortCandidatures, jobItemHTML, computeStats, toast };
})();
globalThis.UI = UI;
