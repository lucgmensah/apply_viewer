# Rappels et notifications — Apply View

- **Date** : 2026-10-09
- **Statut** : validé en discussion, en attente de relecture
- **Branche** : `feat/rappels` (créée depuis `feat/refonte-front`)

## 1. Objectif

Permettre de poser un rappel (date + heure) sur une candidature, par exemple pour postuler plus tard ou relancer un recruteur. À l'heure prévue, une notification du navigateur est affichée.

### Critères de réussite

- Un rappel se règle depuis le panneau du dashboard, le détail de la popup, et les formulaires d'ajout (popup et widget).
- La notification arrive à l'heure prévue, ou au démarrage suivant du navigateur si celui-ci était fermé à ce moment-là.
- Depuis la notification, on peut ouvrir la candidature, ouvrir l'offre, ou reporter le rappel au lendemain.
- Aucune régression sur les fonctionnalités existantes : suite de tests complète au vert.

### Hors périmètre

- Badge sur l'icône de l'extension.
- Rappels récurrents, ou plusieurs rappels par candidature.
- Notification récapitulative groupée.
- Choix de l'heure par défaut (fixée à 9 h 00).

## 2. Données

- Nouveau champ `reminderAt` sur chaque candidature : chaîne locale au format `AAAA-MM-JJTHH:mm` (valeur native d'un `input type="datetime-local"`), ou `''` s'il n'y a pas de rappel.
- Champ absent (données existantes) : équivalent à `''`.
- Le rappel est indépendant du statut : il est conservé quand le statut change, et seul le texte de la notification s'adapte.
- Une fois sa notification affichée, le rappel est retiré (`reminderAt = ''`).
- L'export CSV ajoute une colonne « Rappel ».

## 3. Fonctions partagées (`shared.js`)

Fonctions pures, testées unitairement. `shared.js` et `ui.js` utilisent `globalThis` au lieu de `window`, pour être chargés aussi dans le service worker avec `importScripts`.

| Fonction | Rôle |
|---|---|
| `parseReminder(value: string): Date \| null` | Date locale, ou `null` si la valeur est vide ou invalide. Les dates hors limites (mois 13, jour 45…) sont refusées. |
| `toReminderValue(date: Date): string` | Date → `AAAA-MM-JJTHH:mm` (heure locale). |
| `reminderPresets(now: Date): { tomorrow, in3days, in1week }` | Valeurs `reminderAt` à 9 h 00 locale : J+1, J+3 et J+7. |
| `dueReminders(list, now: Date): Candidature[]` | Candidatures dont le rappel est ≤ `now`. |
| `nextReminderTime(list, now: Date): number \| null` | Horodatage (ms) du plus proche rappel > `now`, ou `null`. |
| `snoozeValue(reminderAt: string, now: Date): string` | Report au lendemain : la date de `now` + 1 jour, à l'heure du rappel d'origine. |

## 4. Moteur (`background.js`)

`background.js` charge `shared.js` et `ui.js` via `importScripts`.

### Planification — `scheduleReminders()`

Elle est appelée dans quatre cas :
- `chrome.runtime.onStartup` ;
- `chrome.runtime.onInstalled` ;
- `chrome.storage.onChanged` sur la clé `candidatures` ;
- au réveil de l'alarme.

Son déroulement :
1. Lire la liste. Si `dueReminders(list, now)` n'est pas vide, appeler `fireDueReminders()`. L'écriture qui en résulte relance la planification.
2. Sinon, `chrome.alarms.clear('next-reminder')` puis, si `nextReminderTime` n'est pas `null`, `chrome.alarms.create('next-reminder', { when })`.

### Notification — `fireDueReminders()`

1. Pour chaque candidature échue, appeler `chrome.notifications.create('reminder:<id>:<reminderAt>', …)` avec :
   - `type: 'basic'`, `iconUrl: 'images/icon-128.png'`, `priority: 2` ;
   - `title` selon le statut :

     | Statut | Titre |
     |---|---|
     | `wishlist` | « Postuler : *poste* » |
     | `applied` | « Relancer : *poste* » |
     | `interview` | « Entretien : *poste* » |
     | `offer` | « Offre : *poste* » |
     | `rejected` | « Rappel : *poste* » |

   - `message` : « *Entreprise* · *Lieu* » (le lieu est omis s'il est vide) ;
   - `buttons` : `[{ title: "Ouvrir l'offre" }]` si l'URL commence par `http(s)://`, puis `{ title: 'Reporter à demain' }`.
2. Dans une seule écriture `JobTracker.update`, retirer `reminderAt` des candidatures notifiées. Ne retirer que si la valeur n'a pas changé entre-temps.

### Actions

| Action | Effet |
|---|---|
| Clic sur la notification | Ouvre `dashboard.html#<id>` et ferme la notification. |
| Bouton « Ouvrir l'offre » | Ouvre l'URL de l'offre dans un nouvel onglet et ferme la notification. |
| Bouton « Reporter à demain » | `reminderAt = snoozeValue(<reminderAt d'origine>, now)` et ferme la notification. |

L'id de la candidature et la valeur d'origine sont lus dans l'id de la notification. L'index du bouton se calcule selon la présence du bouton « Ouvrir l'offre ».

### Manifest

Ajout des permissions `alarms` et `notifications`.

## 5. Interfaces

### Composant « Rappel » (`ui.js`, `components.css`)

- `UI.reminderFieldHTML(idPrefix, value)` : un `input type="datetime-local"` (attribut `min` = maintenant) et des pastilles `button.chip[data-preset="tomorrow" | "in3days" | "in1week" | "clear"]`, libellées « Demain 9 h », « Dans 3 jours », « Dans 1 semaine », « Retirer ».
- `UI.formatReminder(value)` : par exemple « ven. 10 oct. à 09:00 » (`fr-FR`), ou `''`.
- Une date passée est refusée : message « Choisissez une date à venir » (toast dans le dashboard, message en ligne dans la popup).

### Dashboard

- **Panneau** : section « Rappel » sous « Statut », avec le composant commun. Elle est enregistrée avec le bouton Enregistrer et passe par la fusion des seuls champs modifiés : un rappel changé ailleurs n'est pas écrasé.
- **Carte du Kanban** : tag `.tag--reminder` « ⏰ 10 oct. 09:00 » dans le pied de carte si un rappel existe.

### Popup — Détail

- Ligne « Rappel » : la date lisible, ou « Aucun ». C'est un bouton qui déplie le composant commun.
- Chaque choix (pastille ou date validée) est enregistré immédiatement via `JobTracker.update`, avec le toast « Rappel programmé » ou « Rappel retiré ».

### Ajout (popup, widget)

- Liste déroulante « Me rappeler », avec les options *Pas de rappel* (par défaut), *Demain 9 h*, *Dans 3 jours* et *Dans 1 semaine*.
- La valeur est convertie avec `reminderPresets`.

## 6. Cas limites

- Navigateur fermé à l'heure prévue : notification au prochain démarrage (`onStartup`).
- Plusieurs rappels échus en même temps : une notification par candidature.
- Candidature supprimée avant le clic sur sa notification : le dashboard affiche le message existant « Candidature introuvable ».
- Rappel modifié (ou retiré) entre la notification et l'écriture : l'écriture ne retire que si la valeur n'a pas changé.
- Valeur `reminderAt` invalide dans les données : ignorée (aucun rappel, aucune erreur).
- Notifications désactivées au niveau du système d'exploitation : hors de notre contrôle, sans erreur.

## 7. Tests

- **Unitaires** (`tests/unit/reminders.test.js`) : `parseReminder` (valide, vide, invalide, hors limites), `toReminderValue`, `reminderPresets`, `dueReminders`, `nextReminderTime`, `snoozeValue`. Plus `UI.formatReminder`.
- **De bout en bout** :
  - moteur : un rappel à +5 s donne une notification `reminder:<id>:…` (via `chrome.notifications.getAll` dans le worker), puis `reminderAt` est vidé ;
  - un rappel déjà échu dans les données au démarrage est notifié ;
  - le report reprogramme le rappel pour J+1 à la même heure ;
  - le clic ouvre `dashboard.html#<id>` ;
  - dashboard : pastille « Demain 9 h » → enregistrer → stockage et tag sur la carte ; date passée refusée ; rappel modifié ailleurs non écrasé ;
  - popup : ligne Rappel, raccourci, retrait ;
  - ajout par la popup avec « Demain 9 h » ;
  - widget : ajout avec « Demain 9 h ».
