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
