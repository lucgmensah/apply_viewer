const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { launch, seed, readStore, openExtPage, shot, sleep, waitForTab } = require('./harness');
const { SAMPLE, LONG_TITLE, XSS_TITLE, base } = require('./fixtures');

const LONG = { ...base, id: 'long', title: LONG_TITLE, company: 'Acme Corporation Internationale', status: 'applied', dateApplied: '2026-09-01', location: 'Paris' };
const XSS = { ...base, id: 'xss', title: XSS_TITLE, company: 'Evil', status: 'wishlist', dateApplied: '2026-10-01' };
const DATA = [...SAMPLE, LONG, XSS];

let browser, extId;
before(async () => ({ browser, extId } = await launch()));
after(async () => browser && browser.close());

const openDashboard = (hash = '', opts = { width: 1440, height: 900 }) => openExtPage(browser, extId, `dashboard.html${hash}`, opts);

const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const stats = (page) => page.$$eval('.stat-card', (els) => Object.fromEntries(els.map((e) => [e.dataset.stat, e.querySelector('.stat-card__value').textContent.trim()])));

const board = (page) => page.$$eval('.kanban-col', (cols) => cols.map((c) => ({
  status: c.dataset.status,
  count: c.querySelector('.kanban-col__count').textContent.trim(),
  ids: [...c.querySelectorAll('.kanban-card')].map((k) => k.dataset.id)
})));

// Glisser-déposer HTML5 via des DragEvent synthétiques
async function dragTo(page, id, status) {
  await page.evaluate((id, status) => {
    const card = document.querySelector(`.kanban-card[data-id="${id}"]`);
    const col = document.querySelector(`.kanban-col[data-status="${status}"]`);
    const dt = new DataTransfer();
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    fire(card, 'dragstart');
    fire(col, 'dragenter');
    fire(col, 'dragover');
    fire(col, 'drop');
    fire(card, 'dragend');
  }, id, status);
}

describe('Dashboard — statistiques et Kanban', () => {
  test('statistiques', async () => {
    await seed(browser, DATA);
    const page = await openDashboard();
    await sleep(300);
    assert.deepEqual(await stats(page), { total: '10', sent: '6', interview: '1', offer: '1', rate: '50 %' });
    await shot(page, 'dashboard');
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test('statistiques vides', async () => {
    await seed(browser, []);
    const page = await openDashboard();
    await sleep(300);
    assert.deepEqual(await stats(page), { total: '0', sent: '0', interview: '0', offer: '0', rate: '—' });
    await shot(page, 'dashboard-empty');
    await page.close();
  });

  test('5 colonnes dans l\'ordre, compteurs, statut inconnu dans « À postuler »', async () => {
    await seed(browser, DATA);
    const page = await openDashboard();
    await sleep(300);
    const b = await board(page);
    assert.deepEqual(b.map((c) => [c.status, c.count]), [['wishlist', '4'], ['applied', '3'], ['interview', '1'], ['offer', '1'], ['rejected', '1']]);
    assert.ok(b[0].ids.includes('s8'));
    assert.deepEqual(b[1].ids, ['s1', 's3', 'long'], 'tri par date décroissante');
    await page.close();
  });

  test('un titre contenant du HTML est affiché comme du texte', async () => {
    const page = await openDashboard();
    await sleep(300);
    const r = await page.evaluate(() => ({
      text: document.querySelector('.kanban-card[data-id="xss"] .kanban-card__title').textContent,
      xss: window.__xss,
      img: !!document.querySelector('.kanban-card[data-id="xss"] img')
    }));
    assert.equal(r.text, '<img src=x onerror="window.__xss=1">Dev');
    assert.equal(r.xss, undefined);
    assert.equal(r.img, false);
    await page.close();
  });

  test('un titre très long est tronqué sans déborder', async () => {
    const page = await openDashboard();
    await sleep(300);
    const r = await page.$eval('.kanban-card[data-id="long"]', (card) => {
      const t = card.querySelector('.kanban-card__title');
      return { card: card.scrollWidth <= card.clientWidth, clamped: t.scrollHeight > t.clientHeight || t.scrollWidth > t.clientWidth };
    });
    assert.ok(r.card, 'la carte déborde');
    assert.ok(r.clamped, 'titre non tronqué');
    await page.close();
  });

  test('la recherche filtre les cartes', async () => {
    const page = await openDashboard();
    await page.type('#search-input', 'acme');
    await sleep(200);
    const ids = (await board(page)).flatMap((c) => c.ids).sort();
    assert.deepEqual(ids, ['long', 's1', 's6']);
    await page.close();
  });

  test('glisser une carte change son statut et renseigne la date', async () => {
    await seed(browser, DATA);
    const page = await openDashboard();
    await sleep(300);
    await dragTo(page, 's5', 'applied');
    await sleep(400);
    const s5 = (await readStore(browser)).find((c) => c.id === 's5');
    assert.equal(s5.status, 'applied');
    assert.equal(s5.dateApplied, todayLocal());
    assert.ok((await board(page))[1].ids.includes('s5'));
    await page.close();
  });

  test('mise à jour en direct', async () => {
    await seed(browser, DATA);
    const page = await openDashboard();
    await sleep(300);
    await seed(browser, [...DATA, { ...base, id: 'live', title: 'Live', company: 'X', status: 'offer', dateApplied: '2026-10-06' }]);
    await sleep(500);
    assert.ok((await board(page))[3].ids.includes('live'));
    await page.close();
  });

  test('écran étroit : le Kanban défile, pas la page', async () => {
    const page = await openDashboard('', { width: 1000, height: 800 });
    await sleep(300);
    const r = await page.evaluate(() => {
      const k = document.querySelector('.kanban');
      return { kanban: k.scrollWidth > k.clientWidth, page: document.documentElement.scrollWidth <= window.innerWidth };
    });
    assert.ok(r.kanban, 'le Kanban ne défile pas');
    assert.ok(r.page, 'la page déborde');
    await page.close();
  });
});

module.exports = { DATA, openDashboard, board, dragTo, todayLocal };

// --- Tâche 9 : panneau de détail ---
const panelState = (page) => page.evaluate(() => {
  const panel = document.querySelector('.panel');
  const open = !!panel && !panel.classList.contains('hidden');
  return {
    open,
    modal: open && panel.getAttribute('aria-modal') === 'true',
    heading: open ? panel.querySelector('#panel-heading').textContent.trim() : null,
    title: open ? document.getElementById('f-title').value : null,
    status: open ? document.querySelector('.panel input[name="status"]:checked')?.value : null,
    hash: location.hash
  };
});

describe('Dashboard — panneau de détail', () => {
  before(async () => seed(browser, DATA));

  test('clic sur une carte : panneau pré-rempli et hash', async () => {
    const page = await openDashboard();
    await sleep(300);
    await page.click('.kanban-card[data-id="s1"]');
    const p = await panelState(page);
    assert.ok(p.open && p.modal);
    assert.equal(p.heading, 'Modifier la candidature');
    assert.equal(p.title, 'Développeur Front-End');
    assert.equal(p.status, 'applied');
    assert.equal(p.hash, '#s1');
    await shot(page, 'dashboard-panel-edit');
    await page.close();
  });

  test('enregistrer : stockage mis à jour, toast, fermeture', async () => {
    await seed(browser, DATA);
    const page = await openDashboard();
    await sleep(300);
    await page.click('.kanban-card[data-id="s1"]');
    await page.$eval('#f-salary', (el) => { el.value = ''; });
    await page.type('#f-salary', '52k€');
    await page.click('#panel-save');
    await sleep(300);
    assert.equal((await readStore(browser)).find((c) => c.id === 's1').salary, '52k€');
    assert.match(await page.$eval('.toast', (t) => t.textContent), /Candidature enregistrée/);
    const p = await panelState(page);
    assert.equal(p.open, false);
    assert.equal(p.hash, '');
    await page.close();
  });

  test('Échap ferme et rend le focus à la carte', async () => {
    const page = await openDashboard();
    await sleep(300);
    await page.focus('.kanban-card[data-id="s2"]');
    await page.keyboard.press('Enter');
    assert.ok((await panelState(page)).open);
    await page.keyboard.press('Escape');
    assert.equal((await panelState(page)).open, false);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 's2');
    await page.close();
  });

  test('le focus reste dans le panneau', async () => {
    const page = await openDashboard();
    await sleep(300);
    await page.click('.kanban-card[data-id="s2"]');
    await page.focus('#panel-save');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'panel-close');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'panel-save');
    await page.close();
  });

  test('« + » d\'une colonne et « Nouvelle candidature » ouvrent un panneau vide', async () => {
    const page = await openDashboard();
    await sleep(300);
    await page.click('.kanban-col[data-status="interview"] .kanban-col__add');
    let p = await panelState(page);
    assert.deepEqual([p.heading, p.title, p.status], ['Nouvelle candidature', '', 'interview']);
    await shot(page, 'dashboard-panel-new');
    await page.keyboard.press('Escape');
    await page.click('#btn-add');
    p = await panelState(page);
    assert.equal(p.status, 'wishlist');
    await page.close();
  });

  test('doublon : message et panneau toujours ouvert', async () => {
    await seed(browser, DATA);
    const page = await openDashboard();
    await sleep(300);
    await page.click('#btn-add');
    await page.type('#f-title', 'UX Designer');
    await page.type('#f-company', 'Qux');
    await page.click('#panel-save');
    await sleep(300);
    assert.match(await page.$eval('.toast', (t) => t.textContent), /Une candidature identique existe déjà\./);
    assert.ok((await panelState(page)).open);
    assert.equal((await readStore(browser)).length, DATA.length);
    await page.close();
  });

  test('champs obligatoires vides : pas d\'enregistrement', async () => {
    const page = await openDashboard();
    await sleep(300);
    await page.click('#btn-add');
    await page.click('#panel-save');
    await sleep(300);
    assert.ok((await panelState(page)).open);
    assert.equal((await readStore(browser)).length, DATA.length);
    await page.close();
  });

  test('ouverture par le hash, id inconnu signalé', async () => {
    let page = await openDashboard('#s2');
    await sleep(400);
    let p = await panelState(page);
    assert.ok(p.open);
    assert.equal(p.title, 'Data Engineer');
    await page.close();

    page = await openDashboard('#inconnu');
    await sleep(400);
    assert.equal((await panelState(page)).open, false);
    assert.match(await page.$eval('.toast', (t) => t.textContent), /Candidature introuvable/);
    await page.close();
  });

  test('clic sur le voile : fermeture', async () => {
    const page = await openDashboard();
    await sleep(300);
    await page.click('.kanban-card[data-id="s2"]');
    await page.mouse.click(100, 400);
    assert.equal((await panelState(page)).open, false);
    await page.close();
  });

  test('petit écran : panneau pleine largeur', async () => {
    const page = await openDashboard('', { width: 600, height: 800 });
    await sleep(300);
    await page.click('#btn-add');
    const w = await page.$eval('.panel', (p) => Math.round(p.getBoundingClientRect().width));
    assert.equal(w, await page.evaluate(() => document.documentElement.clientWidth));
    await page.close();
  });
});

// --- Tâche 10 : suppression annulable, cas concurrents ---
const fs = require('node:fs');
const path = require('node:path');

async function openAndDelete(page, id) {
  await page.click(`.kanban-card[data-id="${id}"]`);
  await page.click('#panel-delete');
  await sleep(300);
}

describe('Dashboard — suppression et cas concurrents', () => {
  test('supprimer puis annuler réinsère à la position d\'origine', async () => {
    await seed(browser, DATA);
    const page = await openDashboard();
    await sleep(300);
    await openAndDelete(page, 's3');
    assert.equal(await page.$('.kanban-card[data-id="s3"]'), null, 'carte toujours affichée');
    assert.ok(!(await readStore(browser)).some((c) => c.id === 's3'));
    assert.equal((await panelState(page)).open, false);
    assert.match(await page.$eval('.toast', (t) => t.textContent), /Candidature supprimée/);

    await page.click('.toast__action');
    await sleep(300);
    const ids = (await readStore(browser)).map((c) => c.id);
    assert.equal(ids.indexOf('s3'), DATA.findIndex((c) => c.id === 's3'));
    assert.ok(await page.$('.kanban-card[data-id="s3"]'));
    await page.close();
  });

  test('sans annulation, la suppression reste après 5 s', async () => {
    await seed(browser, DATA);
    const page = await openDashboard();
    await sleep(300);
    await openAndDelete(page, 's3');
    await sleep(5500);
    assert.equal(await page.$('.toast'), null, 'toast toujours affiché');
    assert.ok(!(await readStore(browser)).some((c) => c.id === 's3'));
    await page.close();
  });

  test('candidature supprimée ailleurs pendant l\'édition', async () => {
    await seed(browser, DATA);
    const page = await openDashboard();
    await sleep(300);
    await page.click('.kanban-card[data-id="s2"]');
    await seed(browser, DATA.filter((c) => c.id !== 's2'));
    await sleep(500);
    assert.equal((await panelState(page)).open, false);
    assert.match(await page.$eval('.toast', (t) => t.textContent), /Cette candidature a été supprimée/);
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test('plus aucun alert() ni confirm() dans la popup et le dashboard', () => {
    for (const file of ['dashboard.js', 'popup.js']) {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
      assert.ok(!/\b(alert|confirm)\(/.test(src), `${file} contient alert/confirm`);
    }
  });

  test('changement de statut dans la popup visible en direct dans le dashboard', async () => {
    await seed(browser, DATA);
    const dash = await openDashboard();
    await sleep(300);
    const popup = await openExtPage(browser, extId, 'popup.html', { width: 360, height: 600 });
    await popup.click('.segmented__item[data-group="progress"]');
    await popup.click('.job-item[data-id="s3"]');
    await popup.click('#status-trigger');
    await popup.click('#status-menu [data-status="offer"]');
    await sleep(500);
    assert.ok((await board(dash))[3].ids.includes('s3'), 'carte non déplacée dans « Offre reçue »');
    await popup.close();
    await dash.close();
  });
});

// --- Relecture finale ---
describe('Dashboard — corrections de la relecture', () => {
  test('le panneau ne réécrase pas un statut modifié ailleurs', async () => {
    await seed(browser, DATA);
    const page = await openDashboard();
    await sleep(300);
    await page.click('.kanban-card[data-id="s1"]');
    await seed(browser, DATA.map((c) => (c.id === 's1' ? { ...c, status: 'interview' } : c)));
    await sleep(400);
    await page.type('#f-notes', ' Ajout.');
    await page.click('#panel-save');
    await sleep(400);
    const s1 = (await readStore(browser)).find((c) => c.id === 's1');
    assert.equal(s1.status, 'interview', 'statut modifié ailleurs écrasé');
    assert.match(s1.notes, /Ajout\.$/);
    await page.close();
  });

  test('après un clic dans une zone non focalisable du panneau, Échap ferme toujours', async () => {
    const page = await openDashboard();
    await sleep(300);
    await page.click('.kanban-card[data-id="s2"]');
    await page.click('.panel .section-title');
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.querySelector('.panel').contains(document.activeElement)), 'focus sorti du panneau');
    await page.click('.panel .section-title');
    await page.keyboard.press('Escape');
    assert.equal((await panelState(page)).open, false);
    await page.close();
  });

  test('un salaire très long ne fait pas déborder la carte', async () => {
    await seed(browser, [{ ...base, id: 'sal', title: 'Dev', company: 'Acme', status: 'applied', dateApplied: '2026-10-01', location: 'Paris', salary: '45–50k€ + variable + intéressement + mutuelle + tickets restaurant' }]);
    const page = await openDashboard();
    await sleep(300);
    const r = await page.$eval('.kanban-card[data-id="sal"]', (card) => ({ card: card.scrollWidth <= card.clientWidth, col: card.closest('.kanban-col').scrollWidth <= card.closest('.kanban-col').clientWidth }));
    assert.ok(r.card && r.col, JSON.stringify(r));
    await page.close();
  });
});
