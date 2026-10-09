const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch, seed, readStore, worker, waitForTab, sleep } = require('./harness');
const { base } = require('./fixtures');

global.window = global;
require(path.join(__dirname, '..', '..', 'shared.js'));
const J = globalThis.JobTracker;

let browser;
before(async () => ({ browser } = await launch()));
after(async () => browser && browser.close());

const inSeconds = (s) => J.toReminderValue(new Date(Date.now() + s * 1000));
const minutesAgo = (m) => J.toReminderValue(new Date(Date.now() - m * 60000));

async function notificationIds() {
  const w = await worker(browser);
  return w.evaluate(() => new Promise((r) => chrome.notifications.getAll((all) => r(Object.keys(all)))));
}

async function clearNotifications() {
  const w = await worker(browser);
  await w.evaluate(() => new Promise((r) => chrome.notifications.getAll(async (all) => {
    for (const id of Object.keys(all)) await chrome.notifications.clear(id);
    r();
  })));
}

async function waitUntil(fn, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(300);
  }
  return null;
}

describe('Moteur de rappels', () => {
  test('un rappel à venir déclenche une notification puis est retiré', async () => {
    await clearNotifications();
    const at = inSeconds(4);
    await seed(browser, [{ ...base, id: 's1', title: 'Dev', company: 'Acme', status: 'wishlist', reminderAt: at }]);
    const id = await waitUntil(async () => (await notificationIds()).find((n) => n === `reminder:s1:${at}`));
    assert.ok(id, 'notification absente');
    const s1 = await waitUntil(async () => (await readStore(browser)).find((c) => c.id === 's1' && c.reminderAt === ''));
    assert.ok(s1, 'rappel non retiré');
  });

  test('un rappel déjà échu (navigateur fermé) est notifié immédiatement', async () => {
    await clearNotifications();
    const at = minutesAgo(30);
    await seed(browser, [{ ...base, id: 's2', title: 'Data', company: 'Foo', status: 'applied', reminderAt: at }]);
    const id = await waitUntil(async () => (await notificationIds()).includes(`reminder:s2:${at}`), 5000);
    assert.ok(id);
  });

  test('une valeur invalide est ignorée sans erreur', async () => {
    await clearNotifications();
    const w = await worker(browser);
    await seed(browser, [{ ...base, id: 's3', title: 'X', company: 'Y', status: 'wishlist', reminderAt: 'invalide' }]);
    await sleep(1500);
    assert.deepEqual(await notificationIds(), []);
    assert.equal((await readStore(browser))[0].reminderAt, 'invalide');
    assert.equal(await w.evaluate(() => typeof scheduleReminders), 'function');
  });

  test('titre selon le statut', async () => {
    const w = await worker(browser);
    const titles = await w.evaluate(() => ['wishlist', 'applied', 'interview', 'offer', 'rejected', 'inconnu']
      .map((status) => reminderTitle({ title: 'Dev', status })));
    assert.deepEqual(titles, ['Postuler : Dev', 'Relancer : Dev', 'Entretien : Dev', 'Offre : Dev', 'Rappel : Dev', 'Postuler : Dev']);
  });

  test('clic sur la notification : ouvre la candidature', async () => {
    const w = await worker(browser);
    await w.evaluate(() => handleNotificationClick('reminder:s1:2026-10-10T09:00'));
    assert.ok(await waitForTab(browser, (u) => u.endsWith('dashboard.html#s1')));
  });

  test('bouton « Ouvrir l\'offre » (offre avec URL)', async () => {
    await seed(browser, [{ ...base, id: 's4', title: 'Dev', company: 'Acme', status: 'wishlist', url: 'https://example.com/offre/42', reminderAt: '' }]);
    const w = await worker(browser);
    await w.evaluate(() => handleNotificationButton('reminder:s4:2026-10-09T14:30', 0));
    assert.ok(await waitForTab(browser, (u) => u.startsWith('https://example.com/offre/42')));
  });

  test('bouton « Reporter à demain » : lendemain, même heure', async () => {
    await seed(browser, [{ ...base, id: 's4', title: 'Dev', company: 'Acme', status: 'wishlist', url: 'https://example.com/offre/42', reminderAt: '' }]);
    const w = await worker(browser);
    await w.evaluate(() => handleNotificationButton('reminder:s4:2026-10-09T14:30', 1));
    const expected = J.snoozeValue('2026-10-09T14:30', new Date());
    const s4 = await waitUntil(async () => (await readStore(browser)).find((c) => c.id === 's4' && c.reminderAt === expected), 5000);
    assert.ok(s4, 'rappel non reporté');
  });

  test('sans URL, le premier bouton est « Reporter »', async () => {
    await seed(browser, [{ ...base, id: 's5', title: 'Dev', company: 'Acme', status: 'wishlist', url: '', reminderAt: '' }]);
    const w = await worker(browser);
    await w.evaluate(() => handleNotificationButton('reminder:s5:2026-10-09T08:15', 0));
    const expected = J.snoozeValue('2026-10-09T08:15', new Date());
    assert.ok(await waitUntil(async () => (await readStore(browser)).find((c) => c.id === 's5' && c.reminderAt === expected), 5000));
  });

  test('un rappel modifié entre-temps n\'est pas retiré', async () => {
    const w = await worker(browser);
    const result = await w.evaluate(() => clearFiredReminders(
      [{ id: 'a', reminderAt: '2026-10-12T09:00' }, { id: 'b', reminderAt: '2026-10-09T09:00' }],
      [{ id: 'a', reminderAt: '2026-10-09T09:00' }, { id: 'b', reminderAt: '2026-10-09T09:00' }]
    ));
    assert.deepEqual(result.map((c) => c.reminderAt), ['2026-10-12T09:00', '']);
  });
});
