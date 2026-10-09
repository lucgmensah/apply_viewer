const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer');
const { shot } = require('./harness');

let browser, page;
before(async () => {
  browser = await puppeteer.launch({ headless: true, pipe: true });
  page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1400 });
  await page.goto(pathToFileURL(path.join(__dirname, 'styleguide.html')).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
});
after(async () => browser && browser.close());

test('la police Plus Jakarta Sans est chargée et utilisée', async () => {
  const r = await page.evaluate(() => ({
    loaded: document.fonts.check('16px "Plus Jakarta Sans"'),
    family: getComputedStyle(document.body).fontFamily
  }));
  assert.ok(r.loaded, 'police non chargée');
  assert.match(r.family, /Plus Jakarta Sans/);
  await shot(page, 'styleguide');
});

test('les variables du système de design ont les valeurs du spec', async () => {
  const v = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return ['--color-bg', '--color-surface', '--color-border', '--color-text', '--color-text-muted', '--color-accent', '--radius-card', '--radius-field']
      .map((n) => cs.getPropertyValue(n).trim().toUpperCase());
  });
  assert.deepEqual(v, ['#F7F7FB', '#FFFFFF', '#ECECF3', '#1B1B3A', '#8A8AA3', '#5B5BF6', '14PX', '10PX']);
});

test('chaque tag de statut a un contraste ≥ 4.5:1', async () => {
  const results = await page.evaluate(() => {
    const parse = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    return ['wishlist', 'applied', 'interview', 'offer', 'rejected', 'neutral'].map((s) => {
      const el = document.querySelector(`.tag--${s}`);
      if (!el) return { s, ratio: 0 };
      const cs = getComputedStyle(el);
      const [a, b] = [lum(parse(cs.color)), lum(parse(cs.backgroundColor))].sort((x, y) => y - x);
      return { s, ratio: (a + 0.05) / (b + 0.05) };
    });
  });
  for (const { s, ratio } of results) assert.ok(ratio >= 4.5, `tag--${s} : ${ratio.toFixed(2)}`);
});

test('les composants attendus sont stylés', async () => {
  const r = await page.evaluate(() => {
    const get = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
    return {
      primaryBg: get('.btn--primary', 'backgroundColor'),
      segActiveBg: get('.segmented__item[aria-selected="true"]', 'backgroundColor'),
      cardRadius: get('.card', 'borderTopLeftRadius'),
      tagRadius: get('.tag', 'borderTopLeftRadius'),
      titleOverflow: get('.job-item__title', 'textOverflow')
    };
  });
  assert.equal(r.primaryBg, 'rgb(91, 91, 246)');
  assert.equal(r.segActiveBg, 'rgb(91, 91, 246)');
  assert.equal(r.cardRadius, '14px');
  assert.equal(r.tagRadius, '999px');
  assert.equal(r.titleOverflow, 'ellipsis');
});
