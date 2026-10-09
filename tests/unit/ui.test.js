const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
require(path.join(__dirname, '..', '..', 'shared.js'));
require(path.join(__dirname, '..', '..', 'ui.js'));
const UI = window.UI;

test('STATUSES : ordre, libellés et groupes du spec', () => {
  assert.deepEqual(UI.STATUSES.map((s) => [s.id, s.short, s.group]), [
    ['wishlist', 'À postuler', 'todo'],
    ['applied', 'Envoyée', 'progress'],
    ['interview', 'Entretien', 'progress'],
    ['offer', 'Offre', 'done'],
    ['rejected', 'Refusée', 'done']
  ]);
  assert.deepEqual(UI.GROUPS.map((g) => g.label), ['À faire', 'En cours', 'Terminées']);
});

test('statusOf : statut inconnu → wishlist', () => {
  assert.equal(UI.statusOf({ status: 'archived' }).id, 'wishlist');
  assert.equal(UI.statusOf({}).id, 'wishlist');
  assert.equal(UI.statusOf({ status: 'offer' }).id, 'offer');
});

test('statusTag', () => {
  assert.equal(UI.statusTag('interview'), '<span class="tag tag--interview">Entretien</span>');
  assert.equal(UI.statusTag('inconnu'), '<span class="tag tag--wishlist">À postuler</span>');
});

test('relativeTime', () => {
  const now = new Date(2026, 9, 6, 12);
  assert.equal(UI.relativeTime('2026-10-06', now), "aujourd'hui");
  assert.equal(UI.relativeTime('2026-10-05', now), 'hier');
  assert.equal(UI.relativeTime('2026-10-01', now), 'il y a 5 j');
  assert.equal(UI.relativeTime('2026-07-06', now), 'il y a 3 mois');
  assert.equal(UI.relativeTime('2025-10-06', now), 'il y a 1 an');
  assert.equal(UI.relativeTime('2024-10-06', now), 'il y a 2 ans');
  assert.equal(UI.relativeTime('', now), '');
  assert.equal(UI.relativeTime('pas-une-date', now), '');
});

test("sortCandidatures : récentes d'abord, sans date à la fin, stable", () => {
  const ids = UI.sortCandidatures([
    { id: 'a', dateApplied: '' },
    { id: 'b', dateApplied: '2026-01-01' },
    { id: 'c', dateApplied: '2026-05-01' },
    { id: 'd', dateApplied: '2026-01-01' },
    { id: 'e', dateApplied: 'invalide' }
  ]).map((c) => c.id);
  assert.deepEqual(ids, ['c', 'b', 'd', 'a', 'e']);
});

test('jobItemHTML échappe le HTML', () => {
  const html = UI.jobItemHTML({ title: '<img src=x onerror=alert(1)>', company: 'A&B', status: 'applied' });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('A&amp;B'));
  assert.ok(html.includes('tag--applied'));
});

test('jobItemHTML : méta jointe par « · », champs vides omis', () => {
  const html = UI.jobItemHTML({ title: 'Dev', company: 'Acme', location: '', status: 'offer', dateApplied: '' });
  assert.match(html, /<span class="job-item__meta">Acme<\/span>/);
});

test('computeStats', () => {
  const s = UI.computeStats(['wishlist', 'applied', 'applied', 'interview', 'offer', 'rejected'].map((status) => ({ status })));
  assert.deepEqual(s, { total: 6, sent: 5, interview: 1, offer: 1, responseRate: 60 });
  assert.equal(UI.computeStats([{ status: 'wishlist' }]).responseRate, null);
  assert.deepEqual(UI.computeStats([]), { total: 0, sent: 0, interview: 0, offer: 0, responseRate: null });
});

test('formatReminder / formatReminderShort', () => {
  assert.match(UI.formatReminder('2026-10-10T09:00'), /^sam\.? 10 oct\.? à 09:00$/);
  assert.equal(UI.formatReminder(''), '');
  assert.equal(UI.formatReminder('invalide'), '');
  assert.match(UI.formatReminderShort('2026-10-10T09:00'), /^10 oct\.? 09:00$/);
});

test('reminderFieldHTML : champ date + heure et 4 pastilles', () => {
  const html = UI.reminderFieldHTML('f-reminder', '2026-10-10T09:00');
  assert.match(html, /<input[^>]+id="f-reminder-input"[^>]+type="datetime-local"[^>]+value="2026-10-10T09:00"/);
  for (const p of ['tomorrow', 'in3days', 'in1week', 'clear']) assert.match(html, new RegExp(`data-preset="${p}"`));
  assert.match(html, />Demain 9 h</);
  assert.match(html, />Retirer</);
});
