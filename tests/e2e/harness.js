// Outils communs des tests de bout en bout : Chrome for Testing avec l'extension chargée.
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'screenshots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch({ width = 1300, height = 900 } = {}) {
  const browser = await puppeteer.launch({
    headless: false,
    pipe: true,
    enableExtensions: [ROOT],
    args: [`--window-size=${width},${height}`, '--lang=fr-FR']
  });
  const target = await browser.waitForTarget((t) => t.type() === 'service_worker', { timeout: 15000 });
  const extId = new URL(target.url()).host;
  // L'installation ouvre le dashboard : on le ferme pour partir d'un état connu
  await sleep(500);
  for (const p of await browser.pages()) {
    if (p.url().includes('dashboard.html')) await p.close();
  }
  return { browser, extId };
}

async function worker(browser) {
  const target = await browser.waitForTarget((t) => t.type() === 'service_worker');
  return target.worker();
}

async function seed(browser, list) {
  const w = await worker(browser);
  await w.evaluate((l) => chrome.storage.local.set({ candidatures: l }), list);
}

async function readStore(browser) {
  const w = await worker(browser);
  return w.evaluate(async () => (await chrome.storage.local.get('candidatures')).candidatures || []);
}

async function openExtPage(browser, extId, pagePath, { width = 1280, height = 800 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(`chrome-extension://${extId}/${pagePath}`, { waitUntil: 'load' });
  return page;
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

// URL d'une vraie offre LinkedIn consultable sans connexion.
// L'accès invité est parfois limité : plusieurs tentatives avec des recherches différentes.
async function findLinkedInJobUrl(browser) {
  const keywords = ['developpeur', 'data', 'designer'];
  for (let attempt = 0; attempt < keywords.length; attempt++) {
    const page = await browser.newPage();
    try {
      await page.goto(`https://www.linkedin.com/jobs/search?keywords=${keywords[attempt]}&location=France`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(4000);
      const href = await page.evaluate(() => {
        const a = document.querySelector('a.base-card__full-link, a[href*="/jobs/view/"]');
        return a ? a.href : null;
      });
      if (href) {
        const u = new URL(href);
        return u.origin + u.pathname;
      }
    } catch (e) {
      // Nouvelle tentative
    } finally {
      await page.close();
    }
    await sleep(3000 * (attempt + 1));
  }
  throw new Error('Aucune offre LinkedIn trouvée (accès invité bloqué ?)');
}

// Attend un nouvel onglet dont l'URL satisfait le prédicat
async function waitForTab(browser, predicate, timeout = 10000) {
  const target = await browser.waitForTarget((t) => t.type() === 'page' && predicate(t.url()), { timeout });
  return target.url();
}

module.exports = { ROOT, sleep, launch, worker, seed, readStore, openExtPage, shot, findLinkedInJobUrl, waitForTab };
