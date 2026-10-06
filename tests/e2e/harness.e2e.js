const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, seed, readStore, openExtPage, waitForTab } = require('./harness');
const { SAMPLE } = require('./fixtures');

let browser, extId;
before(async () => ({ browser, extId } = await launch()));
after(async () => browser && browser.close());

test('seed / readStore', async () => {
  await seed(browser, SAMPLE);
  assert.equal((await readStore(browser)).length, 8);
});

test('openDashboard avec id ouvre dashboard.html#<id>', async () => {
  const page = await openExtPage(browser, extId, 'popup.html');
  await page.evaluate(() => chrome.runtime.sendMessage({ action: 'openDashboard', id: 's2' }));
  const url = await waitForTab(browser, (u) => u.includes('dashboard.html'));
  assert.ok(url.endsWith('dashboard.html#s2'), url);
});
