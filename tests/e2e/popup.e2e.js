const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { launch, seed, readStore, openExtPage, shot, sleep } = require('./harness');
const { SAMPLE, LONG_TITLE, base } = require('./fixtures');

const LONG = { ...base, id: 'long', title: LONG_TITLE, company: 'Acme Corporation Internationale', status: 'applied', dateApplied: '2026-09-01', location: 'Paris' };
const DATA = [...SAMPLE, LONG];

let browser, extId;
before(async () => ({ browser, extId } = await launch()));
after(async () => browser && browser.close());

const openPopup = (query = '') => openExtPage(browser, extId, `popup.html${query}`, { width: 360, height: 600 });

// Lecture de l'état visible de la liste
const listState = (page) => page.evaluate(() => ({
  active: document.querySelector('.segmented__item[aria-selected="true"]')?.dataset.group,
  counts: Object.fromEntries([...document.querySelectorAll('.segmented__item')].map((b) => [b.dataset.group, b.querySelector('.segmented__count').textContent.trim()])),
  ids: [...document.querySelectorAll('#job-list .job-item')].map((b) => b.dataset.id),
  empty: !!document.querySelector('#job-list .empty-state'),
  countLabel: document.querySelector('#list-count')?.textContent.trim()
}));

const clickGroup = (page, group) => page.click(`.segmented__item[data-group="${group}"]`);

describe('Popup — vue Liste', () => {
  test('onglet par défaut « En cours », compteurs et tri', async () => {
    await seed(browser, DATA);
    const page = await openPopup();
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload({ waitUntil: 'load' });
    await sleep(300);
    const s = await listState(page);
    assert.equal(s.active, 'progress');
    assert.deepEqual(s.counts, { todo: '3', progress: '4', done: '2' });
    assert.deepEqual(s.ids, ['s2', 's1', 's3', 'long']);
    assert.equal(s.countLabel, '4 candidatures');
    const heights = await page.$$eval('.segmented__item', (els) => els.map((e) => e.getBoundingClientRect().height));
    assert.ok(heights.every((h) => h <= 36), `onglet sur plusieurs lignes : ${heights}`);
    await shot(page, 'popup-list');
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test('« À faire » : statut inconnu inclus, sans date en dernier', async () => {
    const page = await openPopup();
    await clickGroup(page, 'todo');
    const s = await listState(page);
    assert.deepEqual(s.ids, ['s4', 's8', 's5']);
    await page.close();
  });

  test('un titre très long ne fait pas déborder la liste', async () => {
    const page = await openPopup();
    await clickGroup(page, 'progress');
    const r = await page.evaluate(() => {
      const list = document.getElementById('job-list');
      const title = document.querySelector('.job-item[data-id="long"] .job-item__title');
      return { list: list.scrollWidth <= list.clientWidth, doc: document.documentElement.scrollWidth <= 360, truncated: title.scrollWidth > title.clientWidth };
    });
    assert.ok(r.list && r.doc, 'débordement horizontal');
    assert.ok(r.truncated, 'titre non tronqué');
    await page.close();
  });

  test('la recherche filtre la liste', async () => {
    const page = await openPopup();
    await clickGroup(page, 'progress');
    await page.click('#search-toggle');
    await page.type('#search-input', 'acme');
    const s = await listState(page);
    assert.deepEqual(s.ids.sort(), ['long', 's1']);
    await page.close();
  });

  test("l'onglet choisi est mémorisé", async () => {
    const page = await openPopup();
    await clickGroup(page, 'done');
    await page.reload({ waitUntil: 'load' });
    await sleep(300);
    assert.equal((await listState(page)).active, 'done');
    await clickGroup(page, 'progress');
    await page.close();
  });

  test('état vide dans chaque onglet', async () => {
    await seed(browser, []);
    const page = await openPopup();
    for (const g of ['todo', 'progress', 'done']) {
      await clickGroup(page, g);
      assert.ok((await listState(page)).empty, `pas d'état vide pour ${g}`);
    }
    await clickGroup(page, 'progress');
    await shot(page, 'popup-empty');
    await page.close();
  });

  test('mise à jour en direct', async () => {
    await seed(browser, []);
    const page = await openPopup();
    await seed(browser, [{ ...base, id: 'live', title: 'Nouvelle', company: 'Live', status: 'applied', dateApplied: '2026-10-06' }]);
    await sleep(500);
    assert.deepEqual((await listState(page)).ids, ['live']);
    await page.close();
  });
});

module.exports = { DATA, openPopup: () => openPopup(), listState, clickGroup };

// --- Tâche 6 : bandeau et vue Ajout ---
const { worker, findLinkedInJobUrl, waitForTab } = require('./harness');

// Crée un onglet depuis l'extension pour connaître son id
async function createTab(url) {
  const w = await worker(browser);
  return w.evaluate((u) => new Promise((r) => chrome.tabs.create({ url: u, active: false }, (t) => r(t.id))), url);
}

const visibleView = (page) => page.evaluate(() => ['list', 'detail', 'add'].find((v) => !document.getElementById(`view-${v}`).classList.contains('hidden')));

async function waitFor(page, fn, timeout = 15000) {
  await page.waitForFunction(fn, { timeout });
}

describe('Popup — bandeau et ajout', () => {
  let jobUrl, jobTabId;

  before(async () => {
    jobUrl = await findLinkedInJobUrl(browser);
    jobTabId = await createTab(jobUrl);
    await sleep(6000); // chargement de l'offre
  });

  test("offre non suivie : bandeau, ajout pré-rempli, puis détail avec toast", async () => {
    await seed(browser, SAMPLE);
    const page = await openExtPage(browser, extId, `popup.html?tabId=${jobTabId}`, { width: 360, height: 600 });
    await waitFor(page, () => document.querySelector('#banner #banner-action'));
    const banner = await page.$eval('#banner', (b) => b.textContent);
    assert.match(banner, /Ajouter cette offre/);
    await shot(page, 'popup-banner-new');

    await page.click('#banner-action');
    assert.equal(await visibleView(page), 'add');
    const values = await page.evaluate(() => [document.getElementById('add-title').value, document.getElementById('add-company').value]);
    assert.ok(values[0].length > 0 && values[1].length > 0, `champs vides : ${values}`);
    await shot(page, 'popup-add');

    await page.click('#add-submit');
    await waitFor(page, () => !document.getElementById('view-detail').classList.contains('hidden'));
    const toast = await page.$eval('.toast', (t) => t.textContent);
    assert.match(toast, /Offre ajoutée/);
    const store = await readStore(browser);
    assert.equal(store.length, SAMPLE.length + 1);
    assert.equal(store[0].title, values[0]);
    await page.close();
  });

  test('offre déjà suivie : bandeau « Déjà suivie » + statut, ouvre le détail', async () => {
    const page = await openExtPage(browser, extId, `popup.html?tabId=${jobTabId}`, { width: 360, height: 600 });
    await waitFor(page, () => document.querySelector('#banner #banner-action'));
    const r = await page.$eval('#banner', (b) => ({ text: b.textContent, tag: !!b.querySelector('.tag') }));
    assert.match(r.text, /Déjà suivie/);
    assert.ok(r.tag);
    await shot(page, 'popup-banner-tracked');
    await page.click('#banner-action');
    assert.equal(await visibleView(page), 'detail');
    await page.close();
  });

  test('page interne de Chrome : pas de bandeau, pas d\'erreur', async () => {
    const tabId = await createTab('chrome://version');
    const page = await openExtPage(browser, extId, `popup.html?tabId=${tabId}`, { width: 360, height: 600 });
    await sleep(1500);
    assert.ok(await page.$eval('#banner', (b) => b.classList.contains('hidden')));
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test('« + » ouvre un formulaire vide ; un doublon est signalé sans enregistrement', async () => {
    await seed(browser, SAMPLE);
    const page = await openPopup();
    await page.click('#btn-add');
    assert.equal(await visibleView(page), 'add');
    const r = await page.evaluate(() => ({ title: document.getElementById('add-title').value, status: document.getElementById('add-status').value }));
    assert.deepEqual(r, { title: '', status: 'wishlist' });

    await page.type('#add-title', 'UX Designer');
    await page.type('#add-company', 'Qux');
    await page.click('#add-submit');
    await sleep(300);
    assert.match(await page.$eval('#add-error', (e) => e.textContent), /Cette offre est déjà dans votre suivi\./);
    assert.equal((await readStore(browser)).length, SAMPLE.length);
    assert.equal(await visibleView(page), 'add');
    await page.close();
  });
});

// --- Tâche 7 : vue Détail ---
async function openDetail(group, id) {
  const page = await openPopup();
  await clickGroup(page, group);
  await page.click(`.job-item[data-id="${id}"]`);
  return page;
}

const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

describe('Popup — vue Détail', () => {
  before(async () => seed(browser, SAMPLE));

  test('affiche les lignes renseignées, liens et notes', async () => {
    const page = await openDetail('progress', 's1');
    const r = await page.evaluate(() => {
      const v = document.getElementById('view-detail');
      return {
        visible: !v.classList.contains('hidden'),
        company: v.querySelector('.detail-company')?.textContent.trim(),
        title: v.querySelector('.detail-title')?.textContent.trim(),
        rows: [...v.querySelectorAll('.field-row')].map((r) => r.dataset.field),
        mailto: v.querySelector('a[href^="mailto:"]')?.getAttribute('href'),
        urlTarget: document.getElementById('detail-url')?.getAttribute('target'),
        urlHref: document.getElementById('detail-url')?.getAttribute('href'),
        notes: v.querySelector('.detail-notes')?.textContent,
        notesWs: v.querySelector('.detail-notes') && getComputedStyle(v.querySelector('.detail-notes')).whiteSpace
      };
    });
    assert.ok(r.visible);
    assert.equal(r.company, 'Acme');
    assert.equal(r.title, 'Développeur Front-End');
    assert.deepEqual(r.rows, ['status', 'date', 'location', 'salary', 'contact', 'url']);
    assert.equal(r.mailto, 'mailto:sophie@acme.fr');
    assert.equal(r.urlTarget, '_blank');
    assert.equal(r.urlHref, 'https://www.linkedin.com/jobs/view/111');
    assert.match(r.notes, /Relancer lundi\.\nPréparer/);
    assert.equal(r.notesWs, 'pre-wrap');
    await shot(page, 'popup-detail');
    await page.close();
  });

  test('les lignes vides ne sont pas affichées', async () => {
    const page = await openDetail('progress', 's3');
    const rows = await page.$$eval('#view-detail .field-row', (els) => els.map((r) => r.dataset.field));
    assert.deepEqual(rows, ['status', 'date', 'location']);
    await page.close();
  });

  test('changer le statut depuis le menu', async () => {
    const page = await openDetail('progress', 's1');
    await page.click('#status-trigger');
    await page.click('#status-menu [data-status="interview"]');
    await sleep(300);
    const s1 = (await readStore(browser)).find((c) => c.id === 's1');
    assert.equal(s1.status, 'interview');
    assert.ok(await page.$('#status-trigger.tag--interview'), 'tag non mis à jour');
    assert.equal(await page.$('#status-menu:not(.hidden)'), null, 'menu resté ouvert');
    await page.close();
  });

  test('passer à « envoyée » sans date ajoute la date du jour', async () => {
    const page = await openDetail('todo', 's5');
    await page.click('#status-trigger');
    await page.click('#status-menu [data-status="applied"]');
    await sleep(300);
    const s5 = (await readStore(browser)).find((c) => c.id === 's5');
    assert.equal(s5.status, 'applied');
    assert.equal(s5.dateApplied, todayLocal());
    await page.close();
  });

  test('« Modifier dans le dashboard » ouvre dashboard.html#<id>', async () => {
    const page = await openDetail('progress', 's2');
    await page.click('#detail-edit');
    const url = await waitForTab(browser, (u) => u.endsWith('dashboard.html#s2'));
    assert.ok(url);
    await page.close();
  });

  test('retour à la liste sur le même onglet', async () => {
    const page = await openDetail('done', 's6');
    await page.click('#detail-back');
    assert.equal(await visibleView(page), 'list');
    assert.equal((await listState(page)).active, 'done');
    await clickGroup(page, 'progress');
    await page.close();
  });

  test('candidature supprimée ailleurs : retour à la liste avec un message', async () => {
    await seed(browser, SAMPLE);
    const page = await openDetail('progress', 's1');
    await seed(browser, SAMPLE.filter((c) => c.id !== 's1'));
    await sleep(500);
    assert.equal(await visibleView(page), 'list');
    assert.match(await page.$eval('.toast', (t) => t.textContent), /Cette candidature a été supprimée/);
    assert.deepEqual(page.errors, []);
    await page.close();
  });
});

// --- Relecture finale ---
describe('Popup — corrections de la relecture', () => {
  test('des chaînes longues sans espace ne font pas déborder le détail', async () => {
    const longWord = 'https://exemple.fr/offres/' + 'a'.repeat(200);
    await seed(browser, [{ ...base, id: 'w', title: 'Intitulé' + 'x'.repeat(120), company: 'Société' + 'y'.repeat(120), status: 'applied', dateApplied: '2026-10-01', notes: longWord }]);
    const page = await openPopup();
    await clickGroup(page, 'progress');
    await page.click('.job-item[data-id="w"]');
    const r = await page.evaluate(() => {
      const m = document.querySelector('.popup-main');
      return { main: m.scrollWidth <= m.clientWidth, doc: document.documentElement.scrollWidth <= 360 };
    });
    assert.ok(r.main && r.doc, JSON.stringify(r));
    await page.close();
  });
});

// --- Régression : pré-remplissage du formulaire « + » avec la page ouverte ---
describe('Popup — pré-remplissage depuis la page ouverte', () => {
  test('« + » sur une offre détectée reprend ses informations', async () => {
    await seed(browser, []);
    const jobUrl = await findLinkedInJobUrl(browser);
    const tabId = await createTab(jobUrl);
    await sleep(6000);
    const page = await openExtPage(browser, extId, `popup.html?tabId=${tabId}`, { width: 360, height: 600 });
    await waitFor(page, () => document.querySelector('#banner #banner-action'));
    await page.click('#btn-add');
    const r = await page.evaluate(() => ({ title: document.getElementById('add-title').value, url: document.getElementById('add-url').value }));
    assert.ok(r.title.length > 0, 'titre vide');
    assert.match(r.url, /\/jobs\/view\//);
    await page.close();
  });

  test('« + » sur une page non reconnue reprend son titre et son URL', async () => {
    const tabId = await createTab('https://fr.linkedin.com/company/devoteam');
    await sleep(6000);
    const page = await openExtPage(browser, extId, `popup.html?tabId=${tabId}`, { width: 360, height: 600 });
    await sleep(3000);
    assert.ok(await page.$eval('#banner', (b) => b.classList.contains('hidden')), 'bandeau affiché sur une page qui n\'est pas une offre');
    await page.click('#btn-add');
    const r = await page.evaluate(() => ({ title: document.getElementById('add-title').value, url: document.getElementById('add-url').value, status: document.getElementById('add-status').value }));
    assert.ok(r.title.length > 0, 'titre vide');
    assert.match(r.url, /linkedin\.com/);
    assert.equal(r.status, 'wishlist');
    await page.close();
  });
});
