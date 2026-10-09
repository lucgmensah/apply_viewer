// --- SERVICE WORKER : OUVERTURE DU DASHBOARD, RAPPELS ET NOTIFICATIONS ---
importScripts('shared.js', 'ui.js');

const ALARM_NAME = 'next-reminder';
const NOTIF_PREFIX = 'reminder:';

// Ouvrir le dashboard lors de l'installation de l'extension
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "dashboard.html" });
  }
  scheduleReminders();
});

// Les pages web ne peuvent pas ouvrir une page de l'extension : le widget passe par ici
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "openDashboard") {
    openDashboard(request.id);
  }
});

function openDashboard(id) {
  const hash = id ? "#" + encodeURIComponent(id) : "";
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html" + hash) });
}

// --- PLANIFICATION ---
// Une seule alarme, calée sur le prochain rappel ; recalculée à chaque modification
// des candidatures et au démarrage (les rappels manqués navigateur fermé partent alors).
const getList = () => new Promise((resolve) => JobTracker.getAll(resolve));

async function scheduleReminders() {
  const list = await getList();
  const now = new Date();
  if (JobTracker.dueReminders(list, now).length > 0) {
    // L'écriture qui retire les rappels notifiés relance la planification
    await fireDueReminders(list, now);
    return;
  }
  await chrome.alarms.clear(ALARM_NAME);
  const when = JobTracker.nextReminderTime(list, now);
  if (when !== null) chrome.alarms.create(ALARM_NAME, { when });
}

chrome.runtime.onStartup.addListener(scheduleReminders);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) scheduleReminders();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.candidatures) scheduleReminders();
});

// --- NOTIFICATIONS ---
const TITLE_PREFIX = {
  wishlist: 'Postuler',
  applied: 'Relancer',
  interview: 'Entretien',
  offer: 'Offre',
  rejected: 'Rappel'
};

function reminderTitle(c) {
  return `${TITLE_PREFIX[UI.statusOf(c).id]} : ${c.title || 'Candidature'}`;
}

const hasOfferLink = (c) => /^https?:\/\//i.test((c && c.url) || '');

function notificationId(c) {
  return `${NOTIF_PREFIX}${c.id}:${c.reminderAt}`;
}

// 'reminder:<id>:<AAAA-MM-JJTHH:mm>' → { id, reminderAt } (l'id peut contenir « : »)
function parseNotificationId(notificationId) {
  if (!notificationId.startsWith(NOTIF_PREFIX)) return null;
  const rest = notificationId.slice(NOTIF_PREFIX.length);
  const m = /^(.*):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/.exec(rest);
  return m ? { id: m[1], reminderAt: m[2] || '' } : null;
}

// Retire les rappels notifiés, sauf ceux modifiés entre-temps
function clearFiredReminders(list, fired) {
  return list.map((c) => {
    const f = fired.find((x) => x.id === c.id);
    return f && c.reminderAt === f.reminderAt ? { ...c, reminderAt: '' } : c;
  });
}

async function fireDueReminders(list, now) {
  const due = JobTracker.dueReminders(list, now);
  for (const c of due) {
    const buttons = [];
    if (hasOfferLink(c)) buttons.push({ title: "Ouvrir l'offre" });
    buttons.push({ title: 'Reporter à demain' });
    chrome.notifications.create(notificationId(c), {
      type: 'basic',
      iconUrl: 'images/icon-128.png',
      title: reminderTitle(c),
      message: [c.company, c.location].filter(Boolean).join(' · ') || 'Rappel Postulo',
      buttons,
      priority: 2
    });
  }
  const fired = due.map((c) => ({ id: c.id, reminderAt: c.reminderAt }));
  await new Promise((resolve) => JobTracker.update((current) => clearFiredReminders(current, fired), resolve));
}

function handleNotificationClick(notifId) {
  const parsed = parseNotificationId(notifId);
  if (!parsed) return;
  openDashboard(parsed.id);
  chrome.notifications.clear(notifId);
}

async function handleNotificationButton(notifId, buttonIndex) {
  const parsed = parseNotificationId(notifId);
  if (!parsed) return;
  chrome.notifications.clear(notifId);
  const c = (await getList()).find((x) => x.id === parsed.id);
  if (!c) return;

  // Le bouton « Ouvrir l'offre » n'existe que si l'offre a un lien
  const openIndex = hasOfferLink(c) ? 0 : -1;
  if (buttonIndex === openIndex) {
    chrome.tabs.create({ url: c.url });
    return;
  }
  const snoozed = JobTracker.snoozeValue(parsed.reminderAt, new Date());
  // Ne pas écraser un rappel posé depuis la notification (seulement s'il a été retiré ou est inchangé)
  JobTracker.update((list) => list.map((x) => (
    x.id === c.id && (x.reminderAt === '' || x.reminderAt === parsed.reminderAt) ? { ...x, reminderAt: snoozed } : x
  )));
}

chrome.notifications.onClicked.addListener(handleNotificationClick);
chrome.notifications.onButtonClicked.addListener(handleNotificationButton);
