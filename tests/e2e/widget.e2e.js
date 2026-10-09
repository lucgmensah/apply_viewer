const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, seed, readStore, shot, findLinkedInJobUrl, waitForTab, sleep } = require('./harness');

let browser, jobUrl, page;

// Attend le widget (hôte + bouton visible) et renvoie un résumé de son état
async function widgetState(p, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = await p.evaluate(() => {
      const host = document.getElementById('job-tracker-floating-root');
      if (!host || !host.shadowRoot) return null;
      const root = host.shadowRoot;
      const pill = root.querySelector('.wt-pill');
      if (!pill || getComputedStyle(root.querySelector('.widget-container')).visibility !== 'visible') return null;
      const tag = root.querySelector('.wt-pill .tag');
      return {
        text: pill.textContent.replace(/\s+/g, ' ').trim(),
        font: getComputedStyle(pill).fontFamily,
        tag: tag ? tag.className : null
      };
    });
    if (s) return s;
    await sleep(300);
  }
  return null;
}

// Attend que l'état du widget satisfasse la condition (la synchronisation est asynchrone)
async function waitWidget(p, predicate, timeout = 5000) {
  const end = Date.now() + timeout;
  let s = null;
  while (Date.now() < end) {
    s = await widgetState(p, 1000);
    if (s && predicate(s)) return s;
    await sleep(200);
  }
  return s;
}

before(async () => {
  ({ browser } = await launch());
  jobUrl = await findLinkedInJobUrl(browser);
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(jobUrl, { waitUntil: 'load', timeout: 60000 });
});
after(async () => browser && browser.close());

test('bouton replié au nouveau design', async () => {
  const s = await widgetState(page);
  assert.ok(s, 'widget absent');
  assert.match(s.text, /Suivre cette offre/);
  assert.match(s.font, /JobTrackerJakarta/);
  await shot(page, 'widget-collapsed');
});

test('le clic ouvre le panneau pré-rempli', async () => {
  const r = await page.evaluate(() => {
    const root = document.getElementById('job-tracker-floating-root').shadowRoot;
    root.querySelector('.wt-pill').click();
    const panel = root.querySelector('.wt-panel');
    return {
      open: panel && getComputedStyle(panel).display !== 'none',
      title: root.querySelector('#wt-title').value,
      brand: root.querySelector('.wt-panel').textContent.includes('Apply View')
    };
  });
  assert.ok(r.open, 'panneau fermé');
  assert.ok(r.title.length > 0, 'titre vide');
  assert.ok(r.brand, 'en-tête Apply View absent');
  await shot(page, 'widget-open');
});

test('offre suivie : statut affiché et ouverture du dashboard sur la candidature', async () => {
  await seed(browser, [{ id: 'x1', url: jobUrl, title: 'Dev', company: 'Acme', status: 'interview', dateApplied: '2026-10-01' }]);
  await page.reload({ waitUntil: 'load' });
  const s = await widgetState(page);
  assert.ok(s, 'widget absent');
  assert.match(s.text, /Offre déjà suivie/);
  assert.match(s.tag || '', /tag--interview/);
  await shot(page, 'widget-tracked');

  await page.evaluate(() => document.getElementById('job-tracker-floating-root').shadowRoot.querySelector('.wt-pill').click());
  const url = await waitForTab(browser, (u) => u.includes('dashboard.html'));
  assert.ok(url.endsWith('dashboard.html#x1'), url);
});

// --- Relecture finale ---
test('le widget suit les changements du stockage (ajout, statut, suppression)', async () => {
  await seed(browser, []);
  await page.reload({ waitUntil: 'load' });
  assert.match((await widgetState(page)).text, /Suivre cette offre/);

  await seed(browser, [{ id: 'x2', url: jobUrl, title: 'Dev', company: 'Acme', status: 'applied', dateApplied: '2026-10-01' }]);
  let s = await waitWidget(page, (w) => /tag--applied/.test(w.tag || ''));
  assert.match(s.text, /Offre déjà suivie/);
  assert.match(s.tag || '', /tag--applied/);

  await seed(browser, [{ id: 'x2', url: jobUrl, title: 'Dev', company: 'Acme', status: 'offer', dateApplied: '2026-10-01' }]);
  s = await waitWidget(page, (w) => /tag--offer/.test(w.tag || ''));
  assert.match(s.tag || '', /tag--offer/);

  await seed(browser, []);
  s = await waitWidget(page, (w) => /Suivre cette offre/.test(w.text));
  assert.match(s.text, /Suivre cette offre/);
});

test('plus aucun alert() dans le script de contenu', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'content.js'), 'utf8');
  assert.ok(!/\balert\(/.test(src));
});

test('ajout depuis le widget : message de succès puis statut de l\'offre', async () => {
  await seed(browser, []);
  await page.reload({ waitUntil: 'load' });
  await widgetState(page);
  await page.evaluate(() => {
    const root = document.getElementById('job-tracker-floating-root').shadowRoot;
    root.querySelector('.wt-pill').click();
    root.querySelector('.wt-form button[type="submit"]').click();
  });
  await sleep(300);
  const success = await page.evaluate(() => {
    const el = document.getElementById('job-tracker-floating-root').shadowRoot.querySelector('.wt-success');
    return el && !el.classList.contains('hidden');
  });
  assert.ok(success, 'message de succès absent');
  const s = await waitWidget(page, (w) => /Offre déjà suivie/.test(w.text), 6000);
  assert.match(s.text, /Offre déjà suivie/);
  assert.match(s.tag || '', /tag--applied/);
});

test('ajout depuis le widget avec rappel « Demain 9 h »', async () => {
  global.window = global;
  require(require('node:path').join(__dirname, '..', '..', 'shared.js'));
  await seed(browser, []);
  await page.reload({ waitUntil: 'load' });
  await widgetState(page);
  await page.evaluate(() => {
    const root = document.getElementById('job-tracker-floating-root').shadowRoot;
    root.querySelector('.wt-pill').click();
    root.getElementById('wt-reminder').value = 'tomorrow';
    root.querySelector('.wt-form button[type="submit"]').click();
  });
  await sleep(600);
  const store = await readStore(browser);
  assert.equal(store.length, 1);
  assert.equal(store[0].reminderAt, globalThis.JobTracker.reminderPresets(new Date()).tomorrow);
});
