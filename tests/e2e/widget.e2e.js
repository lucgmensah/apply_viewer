const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, seed, shot, findLinkedInJobUrl, waitForTab, sleep } = require('./harness');

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
