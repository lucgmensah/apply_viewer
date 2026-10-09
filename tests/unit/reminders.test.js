const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
require(path.join(__dirname, '..', '..', 'shared.js'));
const J = globalThis.JobTracker;

test('parseReminder : valeur valide → date locale', () => {
  const d = J.parseReminder('2026-10-10T09:00');
  assert.equal(d.getTime(), new Date(2026, 9, 10, 9, 0).getTime());
});

test('parseReminder : vide, mal formé ou hors limites → null', () => {
  assert.equal(J.parseReminder(''), null);
  assert.equal(J.parseReminder(undefined), null);
  assert.equal(J.parseReminder('abc'), null);
  assert.equal(J.parseReminder('2026-13-45T09:00'), null);
  assert.equal(J.parseReminder('2026-10-10T25:00'), null);
});

test('toReminderValue', () => {
  assert.equal(J.toReminderValue(new Date(2026, 0, 5, 7, 3)), '2026-01-05T07:03');
});

test('reminderPresets : J+1, J+3, J+7 à 9 h', () => {
  assert.deepEqual(J.reminderPresets(new Date(2026, 9, 9, 22, 0)), {
    tomorrow: '2026-10-10T09:00',
    in3days: '2026-10-12T09:00',
    in1week: '2026-10-16T09:00'
  });
});

test("reminderPresets : la veille du changement d'heure reste à 9 h", () => {
  assert.equal(J.reminderPresets(new Date(2026, 9, 24, 12)).tomorrow, '2026-10-25T09:00');
});

test('dueReminders : ignore vides et invalides, inclut un rappel égal à maintenant', () => {
  const now = new Date(2026, 9, 9, 12, 0);
  const list = [
    { id: 'a', reminderAt: '2026-10-09T12:00' },
    { id: 'b', reminderAt: '2026-10-09T11:00' },
    { id: 'c', reminderAt: '2026-10-09T13:00' },
    { id: 'd', reminderAt: '' },
    { id: 'e', reminderAt: 'invalide' },
    { id: 'f' }
  ];
  assert.deepEqual(J.dueReminders(list, now).map((c) => c.id), ['a', 'b']);
});

test('nextReminderTime : plus proche rappel futur, ou null', () => {
  const now = new Date(2026, 9, 9, 12, 0);
  const list = [
    { reminderAt: '2026-10-11T09:00' },
    { reminderAt: '2026-10-09T13:00' },
    { reminderAt: '2026-10-09T12:00' },
    { reminderAt: 'invalide' }
  ];
  assert.equal(J.nextReminderTime(list, now), new Date(2026, 9, 9, 13, 0).getTime());
  assert.equal(J.nextReminderTime([{ reminderAt: '' }], now), null);
});

test("snoozeValue : lendemain de maintenant, à l'heure du rappel d'origine", () => {
  assert.equal(J.snoozeValue('2026-10-09T14:30', new Date(2026, 9, 9, 15)), '2026-10-10T14:30');
  // Changement d'heure : toujours 14:30 locale
  assert.equal(J.snoozeValue('2026-10-24T14:30', new Date(2026, 9, 24, 15)), '2026-10-25T14:30');
  // Valeur d'origine invalide : demain 9 h
  assert.equal(J.snoozeValue('invalide', new Date(2026, 9, 9, 15)), '2026-10-10T09:00');
});
