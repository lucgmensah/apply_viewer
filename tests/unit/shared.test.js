const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
global.localStorage = {
  data: {},
  getItem(k) { return this.data[k] ?? null; },
  setItem(k, v) { this.data[k] = String(v); }
};
require(path.join(__dirname, '..', '..', 'shared.js'));
const J = window.JobTracker;

test('jobKey : identifiant Indeed (jk / vjk)', () => {
  assert.equal(J.jobKey('https://fr.indeed.com/viewjob?jk=abc123&from=serp'), 'indeed:abc123');
  assert.equal(J.jobKey('https://fr.indeed.com/jobs?q=dev&vjk=abc123'), 'indeed:abc123');
  assert.notEqual(J.jobKey('https://fr.indeed.com/viewjob?jk=aaa'), J.jobKey('https://fr.indeed.com/viewjob?jk=bbb'));
});

test('jobKey : identifiant LinkedIn (vue et currentJobId)', () => {
  assert.equal(J.jobKey('https://www.linkedin.com/jobs/view/4012345678/?trk=x'), 'linkedin:4012345678');
  assert.equal(J.jobKey('https://www.linkedin.com/jobs/view/dev-front-at-acme-4012345678'), 'linkedin:4012345678');
  assert.equal(J.jobKey('https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=dev'), 'linkedin:4012345678');
});

test('jobKey : WTTJ et URL générique', () => {
  assert.equal(J.jobKey('https://www.welcometothejungle.com/fr/companies/acme/jobs/dev_paris?q=1'), 'wttj:acme/dev_paris');
  assert.equal(J.jobKey('https://example.com/careers/42/?utm=x'), 'https://example.com/careers/42');
});

test('siteJobKey : null hors page d\'offre', () => {
  assert.equal(J.siteJobKey('https://www.linkedin.com/jobs/'), null);
  assert.equal(J.siteJobKey('https://fr.indeed.com/'), null);
});

test('isSupportedSite', () => {
  assert.ok(J.isSupportedSite('https://fr.indeed.com/viewjob?jk=1'));
  assert.ok(!J.isSupportedSite('https://evil-indeed.com.example.org/'));
});

const LIST = [
  { id: '1', title: 'Dev', company: 'Acme', url: 'https://fr.indeed.com/viewjob?jk=aaa' },
  { id: '2', company: 'NoTitle' }
];

test('isDuplicate : offres Indeed différentes ne sont pas des doublons', () => {
  assert.ok(!J.isDuplicate(LIST, { title: 'Dev', company: 'Acme', url: 'https://fr.indeed.com/viewjob?jk=bbb' }));
  assert.ok(J.isDuplicate(LIST, { title: 'X', company: 'Y', url: 'https://fr.indeed.com/jobs?vjk=aaa' }));
});

test('isDuplicate : titre + entreprise sans URL, exclusion, titre vide', () => {
  assert.ok(J.isDuplicate(LIST, { title: ' dev ', company: 'ACME', url: '' }));
  assert.ok(!J.isDuplicate(LIST, { title: 'Dev', company: 'Acme', url: 'https://fr.indeed.com/viewjob?jk=aaa' }, '1'));
  assert.ok(!J.isDuplicate(LIST, { title: '', company: 'NoTitle' }));
});

test('findDuplicate renvoie la candidature correspondante', () => {
  const list = [{ id: '1', title: 'Dev', company: 'Acme', url: 'https://fr.indeed.com/viewjob?jk=aaa' }];
  assert.equal(J.findDuplicate(list, { url: 'https://fr.indeed.com/jobs?vjk=aaa' }).id, '1');
  assert.equal(J.findDuplicate(list, { url: 'https://fr.indeed.com/viewjob?jk=bbb', title: 'Dev', company: 'Acme' }), null);
  assert.equal(J.findDuplicate(list, { url: 'https://fr.indeed.com/viewjob?jk=aaa' }, '1'), null);
});

test('update relit le stockage avant d\'écrire', () => {
  J.saveAll([{ id: 'a' }]);
  J.saveAll([{ id: 'b' }, { id: 'a' }]); // ajout fait ailleurs
  let ids;
  J.update(l => [...l, { id: 'c' }], (ok, l) => { ids = l.map(x => x.id); });
  assert.deepEqual(ids, ['b', 'a', 'c']);
  let saved;
  J.update(() => null, (ok) => { saved = ok; });
  assert.equal(saved, false);
});

test('todayISO, generateId, escapeHTML', () => {
  assert.match(J.todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(J.generateId(), /^[0-9a-f-]{36}$/);
  assert.equal(J.escapeHTML('<a "x">'), '&lt;a &quot;x&quot;&gt;');
});

test('applyStatus : date du jour ajoutée seulement en passant à « envoyée » sans date', () => {
  const c = { id: 'a', status: 'wishlist', dateApplied: '' };
  const applied = J.applyStatus(c, 'applied');
  assert.equal(applied.status, 'applied');
  assert.equal(applied.dateApplied, J.todayISO());
  assert.equal(c.status, 'wishlist', 'objet d\'origine modifié');
  assert.equal(J.applyStatus({ status: 'wishlist', dateApplied: '2026-01-01' }, 'applied').dateApplied, '2026-01-01');
  assert.equal(J.applyStatus({ status: 'applied', dateApplied: '' }, 'interview').dateApplied, '');
});
