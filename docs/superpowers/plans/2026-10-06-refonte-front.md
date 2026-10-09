# Refonte du front — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Refaire popup, dashboard et widget avec un système de design indigo partagé, une popup en trois vues (liste / détail / ajout) et un dashboard Kanban avec panneau de détail.

**Architecture :**
- Vanilla JS et CSS chargés tels quels par l'extension (Manifest V3, sans build).
- `tokens.css` et `components.css` portent tout le style, partagé par les trois surfaces. Le widget les charge dans son Shadow DOM.
- `ui.js` centralise les statuts et les rendus HTML (échappés) ; `shared.js` reste la couche données (`JobTracker`).
- Chaque surface a son propre fichier JS.

**Tech Stack :**
- Extension : JavaScript ES2020, Chrome MV3, `chrome.storage.local`.
- Tests unitaires : `node:test` (Node 22, sans dépendance).
- Tests de bout en bout : Puppeteer (Chrome for Testing), en devDependency uniquement.

**Spec :** `docs/superpowers/specs/2026-10-06-refonte-front-design.md`

## Global Constraints

- **Aucune dépendance runtime ni étape de build** : l'extension se charge depuis la racine du dépôt. `package.json` ne sert qu'aux tests.
- **Interface en français.** Nom affiché « Apply View » ; manifest `"name": "Apply View — Bêta"`.
- **Couleurs** :
  - fond `#F7F7FB`, surface `#FFFFFF`, bordure `#ECECF3` ;
  - texte `#1B1B3A`, texte secondaire `#8A8AA3` ;
  - accent `#5B5BF6`, survol `#4A4AE0`, fond léger `#EEEEFE`.
- **Rayons** : 14 px pour les cartes, 10 px pour les champs, pilule pour les onglets et tags. Grille d'espacement de 4 px.
- **Police** : Plus Jakarta Sans variable (sous-ensemble latin), locale dans `fonts/`, avec sa licence OFL.
- **Échappement** : toute donnée utilisateur passe par `JobTracker.escapeHTML` ou par `textContent`.
- **Écritures** : toute écriture passe par `JobTracker.update`, et chaque surface écoute `JobTracker.onChange`.
- **Accessibilité** : tag de statut avec un contraste du texte d'au moins 4.5:1 ; anneau `:focus-visible` indigo de 3 px ; éléments cliquables en `<button>` ou `<a>`.
- **Messages** : aucun `alert()` / `confirm()` dans popup.js ni dashboard.js à la fin du plan (content.js garde le sien, hors périmètre).

## Review Focus

1. **Titres et entreprises très longs** (plus de 120 caractères) : tronqués avec des points de suspension dans les cartes de la popup (360 px) et du Kanban ; la mise en page ne déborde pas. → Données d'exemple `LONG_TITLE` vérifiées dans les tâches 5 et 8.
2. **HTML dans les données scrapées** (`<img onerror>` dans un titre) : affiché comme du texte partout. → Test unitaire `jobItem échappe le HTML` (tâche 3) + vérification de bout en bout dans le Kanban (tâche 8).
3. **Candidature supprimée ailleurs pendant qu'elle est ouverte** (détail de la popup ou panneau du dashboard) : retour à la liste ou fermeture, avec le toast « Cette candidature a été supprimée », sans erreur console. → Tâches 7 et 10.
4. **Données anciennes ou incomplètes** (statut inconnu, `dateApplied` vide ou invalide, pas d'URL) : affichées comme `wishlist`, sans temps relatif, triées en fin de liste. → Tests unitaires de la tâche 3.
5. **Popup ouverte sur une page interne de Chrome** (`chrome://extensions`) : pas de bandeau, pas d'erreur. → Tâche 6.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `package.json`, `.gitignore` | Scripts de test, Puppeteer en devDependency, `node_modules/` ignoré | 1 |
| `tests/unit/shared.test.js` | Tests de `shared.js` | 1 |
| `tests/unit/ui.test.js` | Tests de `ui.js` | 3 |
| `tests/e2e/harness.js` | Lancement de Chrome avec l'extension, données d'exemple, captures | 1 |
| `tests/e2e/fixtures.js` | Jeux de données d'exemple (`SAMPLE`, `LONG_TITLE`, `XSS_TITLE`) | 1 |
| `tests/e2e/*.e2e.js` | Parcours de bout en bout par surface | 4–10 |
| `tests/e2e/styleguide.html` | Page de démonstration des composants (vérification visuelle) | 2 |
| `shared.js` | + `findDuplicate` | 1 |
| `background.js` | `openDashboard` avec `id` optionnel | 1 |
| `tokens.css` | Variables (réécrit) | 2 |
| `components.css` | Composants partagés | 2 |
| `fonts/` | + Plus Jakarta Sans, − Outfit | 2 |
| `ui.js` | Statuts, rendus, statistiques, toast | 3 |
| `widget.css`, `content.js` | Style et rendu du widget | 4 |
| `manifest.json` | Nom, WAR (`tokens.css`, `components.css`, `widget.css`, police) | 4 |
| `popup.html`, `popup.css`, `popup.js` | Popup en 3 vues | 5–7 |
| `dashboard.html`, `dashboard.css`, `dashboard.js` | Stats, Kanban, panneau | 8–10 |

---

## Sous-projet 1 — Système de design + widget

### Task 1 : Infrastructure de tests, `findDuplicate`, ouverture du dashboard sur un `id`

**Files :**
- Create : `package.json`, `tests/unit/shared.test.js`, `tests/e2e/harness.js`, `tests/e2e/fixtures.js`
- Modify : `.gitignore`, `shared.js`, `background.js`

**Interfaces :**
- Produces :
  - `JobTracker.findDuplicate(list: Candidature[], candidate: {url?, title?, company?}, excludeId?: string): Candidature | null`
  - message runtime `{ action: 'openDashboard', id?: string }` → ouvre `dashboard.html` ou `dashboard.html#<id>`
  - `harness.js` exporte :
    - `launch(): Promise<{browser, extId}>`
    - `seed(browser, list): Promise<void>` (écrit `candidatures` via le service worker)
    - `readStore(browser): Promise<Candidature[]>`
    - `openExtPage(browser, extId, path): Promise<Page>`
    - `shot(page, name): Promise<void>` (écrit `tests/e2e/screenshots/<name>.png`)
  - `fixtures.js` exporte :
    - `SAMPLE` : 8 candidatures couvrant les 5 statuts, dont une sans date et une au statut `"archived"` inconnu ;
    - `LONG_TITLE` : 150 caractères ;
    - `XSS_TITLE` : `'<img src=x onerror="window.__xss=1">Dev'`.

- [ ] **Step 1 : Créer `package.json`.** Contenu : `"private": true`, scripts `"test": "node --test tests/unit/"` et `"e2e": "node --test --test-concurrency=1 tests/e2e/"`, devDependency `puppeteer` (dernière version). Ajouter `node_modules/` et `tests/e2e/screenshots/` à `.gitignore`. Lancer `npm install`.
- [ ] **Step 2 : Écrire `tests/unit/shared.test.js`.** Charger `shared.js` après avoir défini `global.window = global` et un faux `localStorage`. Reprendre les assertions déjà validées pendant les corrections :
  - `jobKey` pour Indeed `jk`/`vjk`, LinkedIn `/jobs/view/<slug>-<id>` et `currentJobId`, WTTJ, et le cas générique ;
  - `isDuplicate`, avec exclusion par `id` et titre vide ;
  - `update` relit le stockage avant d'écrire.
  
  Ajouter :
  ```js
  test('findDuplicate renvoie la candidature correspondante', () => {
    const list = [{ id: '1', title: 'Dev', company: 'Acme', url: 'https://fr.indeed.com/viewjob?jk=aaa' }];
    assert.equal(J.findDuplicate(list, { url: 'https://fr.indeed.com/jobs?vjk=aaa' }).id, '1');
    assert.equal(J.findDuplicate(list, { url: 'https://fr.indeed.com/viewjob?jk=bbb', title: 'Dev', company: 'Acme' }), null);
    assert.equal(J.findDuplicate(list, { url: 'https://fr.indeed.com/viewjob?jk=aaa' }, '1'), null);
  });
  ```
- [ ] **Step 3 :** `npm test` → FAIL, `J.findDuplicate is not a function`.
- [ ] **Step 4 : Implémenter `findDuplicate` dans `shared.js`** (même logique que l'actuel `isDuplicate`, avec `find` au lieu de `some`), puis `isDuplicate = (...a) => findDuplicate(...a) !== null`. L'exporter.
- [ ] **Step 5 :** `npm test` → PASS.
- [ ] **Step 6 : `background.js`.** Pour `openDashboard`, ouvrir `chrome.runtime.getURL('dashboard.html' + (request.id ? '#' + encodeURIComponent(request.id) : ''))`.
- [ ] **Step 7 : Écrire `harness.js` et `fixtures.js`.**
  - `launch` utilise `puppeteer.launch({ headless: false, pipe: true, enableExtensions: [<racine du dépôt>] })` et récupère `extId` depuis l'URL de la cible `service_worker`.
  - `seed` et `readStore` font `chrome.storage.local.set/get` dans le worker (`target.worker().evaluate`).
- [ ] **Step 8 : Smoke test** `tests/e2e/harness.e2e.js` : `seed(SAMPLE)` puis `readStore` → longueur 8. `npm run e2e` → PASS.
- [ ] **Step 9 : Commit** : `test: infrastructure de tests et findDuplicate`.

### Task 2 : Tokens, police et composants CSS

**Files :**
- Modify : `tokens.css` (réécrit)
- Create : `components.css`, `fonts/plus-jakarta-sans-latin-wght-normal.woff2`, `fonts/OFL-PlusJakartaSans.txt`, `tests/e2e/styleguide.html`, `tests/e2e/styleguide.e2e.js`
- Outfit reste en place jusqu'à la tâche 8, car l'ancien dashboard l'utilise encore.

**Interfaces :**
- Produces : les classes CSS suivantes (les tâches suivantes n'en inventent pas d'autres pour ces rôles) :
  - `.btn` + `.btn--primary` / `--secondary` / `--ghost` / `--danger`, `.icon-btn`
  - `.segmented` > `button.segmented__item` (`[aria-selected="true"]`) avec `.segmented__count`
  - `.card`, `.job-item` (> `.job-item__title`, `.job-item__meta`, `.tag`), `.job-item__title` tronqué sur une ligne
  - `.tag` + `.tag--wishlist` / `--applied` / `--interview` / `--offer` / `--rejected` / `--neutral`
  - `.field-row` (> `.field-row__label`, `.field-row__value`), `.section-title`, `.panel-header` (> `.icon-btn` retour, `h2`)
  - `.input`, `.select`, `.textarea`, `.input--bare` (sans bordure hors survol et focus)
  - `.banner`, `.empty-state`, `.toast-region`, `.toast` (> `.toast__action`), `.logo-dot`
- Produces : variables `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-hover`, `--color-accent-soft`, `--status-<statut>-bg`, `--status-<statut>-fg`, `--radius-card: 14px`, `--radius-field: 10px`, `--radius-pill: 999px`, `--space-1` à `--space-8` (multiples de 4 px), `--font-main`, `--shadow-sm`, `--shadow-panel`. Déclarées sur `:root, :host`.

- [ ] **Step 1 : Télécharger la police.** `https://cdn.jsdelivr.net/npm/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2` et la licence `.../LICENSE` vers `fonts/`. Vérifier avec `file` que c'est bien du WOFF2.
- [ ] **Step 2 : Réécrire `tokens.css`** : `@font-face` « Plus Jakarta Sans » (graisses 200 à 800) et les variables ci-dessus, avec les valeurs des Global Constraints. Paires des statuts (fond / texte) :

  | Statut | Fond | Texte |
  |---|---|---|
  | `wishlist` | `#F0F0F5` | `#4A4A68` |
  | `applied` | `#EEEEFE` | `#3B3BC4` |
  | `interview` | `#FFF1E6` | `#A2470B` |
  | `offer` | `#E7F7EE` | `#1C7A45` |
  | `rejected` | `#FDECEC` | `#B42318` |
  | `neutral` | `#F4F4F8` | `#5C5C78` |

- [ ] **Step 3 : Écrire `components.css`** pour toutes les classes ci-dessus, dans le style de la maquette :
  - cartes blanches à bordure `--color-border` ;
  - `.segmented` : fond `#F0F0F5`, segment actif fond accent et texte blanc ;
  - `.field-row` : grille `minmax(96px, 35%) 1fr`, libellé en texte secondaire 13 px ;
  - `:focus-visible { outline: 3px solid color-mix(in srgb, var(--color-accent) 45%, transparent); outline-offset: 2px }`.
- [ ] **Step 4 : `styleguide.html`** charge `../../tokens.css` et `../../components.css` et montre chaque composant et chaque tag de statut.
- [ ] **Step 5 : `styleguide.e2e.js`.**
  - Ouvre la page en `file://` et prend la capture `styleguide`.
  - Vérifie que la police chargée est Plus Jakarta Sans : `document.fonts.check('16px "Plus Jakarta Sans"') === true` après `document.fonts.ready`.
  - Vérifie le contraste de chaque `.tag--*` : ratio calculé depuis `getComputedStyle` ≥ 4.5, via une fonction de luminance relative écrite dans le test.
- [ ] **Step 6 :** `npm run e2e` → PASS. Examiner `screenshots/styleguide.png` à l'œil et le comparer à la maquette (cartes, onglets, tags).
- [ ] **Step 7 : Commit** : `feat(design): tokens indigo, Plus Jakarta Sans et composants partagés`. La suppression d'Outfit se fait dans le commit de la tâche 8, quand plus aucun fichier ne la référence (`grep -r outfit` vide).

### Task 3 : `ui.js` — statuts, rendus, statistiques, toast

**Files :**
- Create : `ui.js`, `tests/unit/ui.test.js`

**Interfaces :**
- Consumes : `JobTracker.escapeHTML`.
- Produces (objet global `UI`, déclaré avec `var UI = window.UI || ...` comme `shared.js`) :
  - `UI.STATUSES` : tableau ordonné `[{ id, label, short, group }]` :

    | `id` | `label` | `short` | `group` |
    |---|---|---|---|
    | `wishlist` | À postuler | À postuler | `todo` |
    | `applied` | Candidature envoyée | Envoyée | `progress` |
    | `interview` | Entretien | Entretien | `progress` |
    | `offer` | Offre reçue | Offre | `done` |
    | `rejected` | Refusée / Classée | Refusée | `done` |

  - `UI.GROUPS` : `[{ id: 'todo', label: 'À faire' }, { id: 'progress', label: 'En cours' }, { id: 'done', label: 'Terminées' }]`
  - `UI.statusOf(c): StatusDef` (statut inconnu → `wishlist`)
  - `UI.statusTag(status: string): string` → `<span class="tag tag--<id>">short</span>`
  - `UI.relativeTime(isoDate: string, now = new Date()): string` → `"aujourd'hui"`, `"hier"`, `"il y a N j"` (N < 30), `"il y a N mois"` (N < 12), `"il y a N an(s)"` ; `''` si la date est invalide ou vide
  - `UI.sortCandidatures(list): Candidature[]` → copie triée par `dateApplied` décroissante, sans date à la fin, ordre d'origine conservé à égalité
  - `UI.jobItemHTML(c, { meta = ['company','location','relative'] } = {}): string` → contenu interne d'un `.job-item` (titre, méta jointe par « · », tag)
  - `UI.computeStats(list): { total, sent, interview, offer, responseRate: number | null }`
  - `UI.toast(message: string, { actionLabel?, onAction?, duration = 4000 } = {}): void` → ajoute un `.toast` dans `.toast-region` (créée au besoin, `role="status"`, `aria-live="polite"`)

- [ ] **Step 1 : Écrire `tests/unit/ui.test.js`** (charger `shared.js` puis `ui.js` avec le shim `window`) :
  ```js
  test('statusOf : statut inconnu → wishlist', () => assert.equal(UI.statusOf({ status: 'archived' }).id, 'wishlist'));
  test('relativeTime', () => {
    const now = new Date(2026, 9, 6, 12);
    assert.equal(UI.relativeTime('2026-10-06', now), "aujourd'hui");
    assert.equal(UI.relativeTime('2026-10-05', now), 'hier');
    assert.equal(UI.relativeTime('2026-10-01', now), 'il y a 5 j');
    assert.equal(UI.relativeTime('2026-07-06', now), 'il y a 3 mois');
    assert.equal(UI.relativeTime('2024-10-06', now), 'il y a 2 ans');
    assert.equal(UI.relativeTime('', now), '');
    assert.equal(UI.relativeTime('pas-une-date', now), '');
  });
  test('sortCandidatures : récentes d\'abord, sans date à la fin', () => {
    const ids = UI.sortCandidatures([{ id: 'a', dateApplied: '' }, { id: 'b', dateApplied: '2026-01-01' }, { id: 'c', dateApplied: '2026-05-01' }]).map(c => c.id);
    assert.deepEqual(ids, ['c', 'b', 'a']);
  });
  test('jobItemHTML échappe le HTML', () => {
    const html = UI.jobItemHTML({ title: '<img src=x onerror=alert(1)>', company: 'A&B', status: 'applied' });
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('A&amp;B'));
    assert.ok(html.includes('tag--applied'));
  });
  test('computeStats', () => {
    const s = UI.computeStats(['wishlist', 'applied', 'applied', 'interview', 'offer', 'rejected'].map(status => ({ status })));
    assert.deepEqual(s, { total: 6, sent: 5, interview: 1, offer: 1, responseRate: 60 });
    assert.equal(UI.computeStats([{ status: 'wishlist' }]).responseRate, null);
  });
  ```
- [ ] **Step 2 :** `npm test` → FAIL (`UI is not defined`).
- [ ] **Step 3 : Implémenter `ui.js`** selon les interfaces. `relativeTime` compare des dates locales à minuit (pas de décalage UTC). `responseRate = Math.round((interview + offer + rejected) / sent * 100)`.
- [ ] **Step 4 :** `npm test` → PASS.
- [ ] **Step 5 : Commit** : `feat(ui): statuts, rendus partagés, statistiques et toasts`.

### Task 4 : Widget restylé

**Files :**
- Create : `widget.css`, `tests/e2e/widget.e2e.js`
- Modify : `content.js` (fonctions `createWidgetRoot`, `injectFloatingWidget`, `injectAlreadyTrackedWidget`, `ensureFont`, appel dans `refreshWidget`), `manifest.json`

**Interfaces :**
- Consumes : `JobTracker.findDuplicate`, `UI.statusTag`, les classes de la tâche 2, le message `openDashboard` avec `id`.
- Produces : `content_scripts.js = ["shared.js", "ui.js", "content.js"]`.

- [ ] **Step 1 : Test e2e `widget.e2e.js`.** Sur une vraie offre LinkedIn consultée sans connexion. Récupérer l'URL de la première offre de `https://www.linkedin.com/jobs/search?keywords=developpeur&location=France` (sélecteur `a.base-card__full-link`), approche validée pendant le débogage. Ajouter dans `harness.js` un helper `findLinkedInJobUrl(browser): Promise<string>`. Le test doit vérifier :
  - le bouton replié affiche « Suivre cette offre » et utilise la police `"JobTrackerJakarta"` (`getComputedStyle` sur la pilule) ;
  - le clic ouvre le panneau, avec un titre pré-rempli non vide ;
  - après `seed([{ id: 'x1', url: <url de l'offre>, title: 'Dev', company: 'Acme', status: 'interview' }])` et rechargement, la pilule affiche « Offre déjà suivie » et un `.tag--interview` ;
  - un clic dessus ouvre un onglet dont l'URL se termine par `dashboard.html#x1`.
  
  Captures : `widget-collapsed`, `widget-open`, `widget-tracked`.
- [ ] **Step 2 :** `npm run e2e` → FAIL (pas de `.tag--interview`, police différente).
- [ ] **Step 3 : Implémenter.**
  - `createWidgetRoot` ajoute dans le shadow root trois `<link rel="stylesheet">` vers `chrome.runtime.getURL('tokens.css' | 'components.css' | 'widget.css')`. La racine est rendue invisible jusqu'au chargement du dernier lien, pour éviter un flash sans style.
  - Les styles inline de `content.js` sont supprimés.
  - `ensureFont` enregistre `fonts/plus-jakarta-sans-latin-wght-normal.woff2` sous la famille `JobTrackerJakarta`. `widget.css` définit `:host { --font-main: 'JobTrackerJakarta', system-ui, sans-serif }`.
  - Panneau : `.card` avec en-tête `.logo-dot` + « Apply View », champs `.input`, bouton `.btn--primary` « Ajouter au suivi ».
  - `refreshWidget` utilise `findDuplicate` et passe la candidature à `injectAlreadyTrackedWidget(candidature)`, qui affiche « Offre déjà suivie » + `UI.statusTag(candidature.status)` et envoie `{ action: 'openDashboard', id: candidature.id }`.
  - `manifest.json` :
    - `name` : `Apply View — Bêta` ;
    - `description` : « Suivez vos candidatures simplement (Kanban, export CSV). Version bêta. » ;
    - ajouter `ui.js` aux `content_scripts` ;
    - WAR : `tokens.css`, `components.css`, `widget.css` et la nouvelle police.
- [ ] **Step 4 :** `npm run e2e` → PASS. Examiner les trois captures.
- [ ] **Step 5 : Commit** : `feat(widget): widget au nouveau design avec statut de l'offre suivie`.

---

## Sous-projet 2 — Popup

### Task 5 : Coque de la popup et vue Liste

**Files :**
- Modify : `popup.html`, `popup.css`, `popup.js` (réécrits)
- Create : `tests/e2e/popup.e2e.js`

**Interfaces :**
- Consumes : `JobTracker.getAll/onChange/update`, `UI.GROUPS`, `UI.statusOf`, `UI.sortCandidatures`, `UI.jobItemHTML`.
- Produces (dans `popup.js`, réutilisés par les tâches 6 et 7) :
  - `state = { view: 'list' | 'detail' | 'add', selectedId: string | null, group: 'todo' | 'progress' | 'done', query: string, list: Candidature[], detected: ScrapeResult | null, tracked: Candidature | null }`
  - `render()` (redessine la vue courante)
  - `go(view, selectedId = null)`
  - `openDashboard(id?)`
  - Structure : `#view-list`, `#view-detail`, `#view-add` (un seul visible), `#banner` dans `#view-list`.

- [ ] **Step 1 : Tests e2e** (popup ouverte par `openExtPage(browser, extId, 'popup.html')`, données `SAMPLE` + `LONG_TITLE`) :
  - l'onglet par défaut est « En cours », avec `aria-selected="true"` ;
  - les compteurs des 3 onglets correspondent aux groupes de `SAMPLE`, le statut inconnu `archived` étant compté dans « À faire » ;
  - la liste « En cours » est triée par date décroissante ;
  - « À faire » contient la carte sans date, en dernier ;
  - la carte `LONG_TITLE` ne déborde pas : `scrollWidth <= clientWidth` du conteneur de liste ;
  - la recherche « acme » filtre la liste ;
  - l'onglet choisi est mémorisé après rechargement de la page ;
  - avec un stockage vide, `.empty-state` est affiché dans chaque onglet ;
  - mise à jour en direct : `seed` d'une nouvelle candidature pendant que la popup est ouverte, et la carte apparaît.
  
  Captures : `popup-list`, `popup-empty`.
- [ ] **Step 2 :** `npm run e2e` → FAIL.
- [ ] **Step 3 : Implémenter.**
  - `popup.html` charge `tokens.css`, `components.css`, `popup.css`, puis `shared.js`, `ui.js`, `popup.js`.
  - En-tête : `.logo-dot` + « Apply View », `.icon-btn` « + » (`aria-label="Ajouter une candidature"`) qui mène à `go('add')`, et `.icon-btn` « ↗ » (`aria-label="Ouvrir le tableau de bord"`).
  - `body` fait 360 px de large, avec une hauteur maximale de 580 px et un défilement de la liste uniquement.
  - Onglet mémorisé sous la clé `localStorage` `applyview.popup.group` (try/catch).
  - Ligne « N candidature(s) » avec une loupe qui affiche un `.input` de recherche (titre, entreprise, lieu).
  - Chaque carte est un `<button class="job-item">` qui mène à `go('detail', id)`.
  - Libellés des états vides :

    | Onglet | Texte |
    |---|---|
    | À faire | « Aucune offre à postuler. » |
    | En cours | « Aucune candidature en cours. » |
    | Terminées | « Rien de terminé pour l'instant. » |

  - `#view-detail` et `#view-add` sont vides ici (tâches 6 et 7).
- [ ] **Step 4 :** `npm run e2e` → PASS. Examiner les captures.
- [ ] **Step 5 : Commit** : `feat(popup): coque et vue liste par onglets`.

### Task 6 : Bandeau d'offre et vue Ajout

**Files :**
- Modify : `popup.js`, `popup.css`, `tests/e2e/popup.e2e.js`

**Interfaces :**
- Consumes : `JobTracker.findDuplicate`, `JobTracker.createCandidature`, `UI.statusTag`, `UI.toast`, le scraping existant (`getJobDetails` + injection de `shared.js`, `ui.js`, `content.js`).
- Produces : `getTargetTab(): Promise<chrome.tabs.Tab | null>`. Le paramètre d'URL `?tabId=<id>` (point d'entrée réservé aux tests) prend le dessus sur `tabs.query({ active: true, currentWindow: true })`.

- [ ] **Step 1 : Tests e2e.**
  - Ouvrir une vraie offre LinkedIn invité dans un onglet, récupérer son id d'onglet via le worker (`chrome.tabs.query({ url: '*://*.linkedin.com/jobs/view/*' })`), puis ouvrir `popup.html?tabId=<id>`. Vérifier :
    - le bandeau contient le titre de l'offre et un bouton « Ajouter cette offre » ;
    - le clic mène à la vue Ajout, avec poste et entreprise pré-remplis ;
    - « Enregistrer » mène à la vue Détail avec le toast « Offre ajoutée » ;
    - `readStore` contient l'offre ;
    - après réouverture, le bandeau affiche « Déjà suivie » + le tag, et le clic ouvre le Détail.
  - `popup.html?tabId=<onglet chrome://version>` : pas de `#banner` visible, aucune `pageerror`.
  - Doublon : dans la vue Ajout, saisir le titre et l'entreprise d'une candidature existante sans URL → message en ligne « Cette offre est déjà dans votre suivi. », pas d'enregistrement.
  - Le « + » de l'en-tête ouvre la vue Ajout vide, avec le statut « À postuler ».
  
  Captures : `popup-banner-new`, `popup-banner-tracked`, `popup-add`.
- [ ] **Step 2 :** `npm run e2e` → FAIL.
- [ ] **Step 3 : Implémenter.**
  - La détection reprend la logique actuelle de `detectActiveJobDetails` à partir de `getTargetTab()`. Elle remplit `state.detected` et `state.tracked = findDuplicate(state.list, detected)`, puis appelle `render()`.
  - Le bandeau est un `.banner`.
  - Vue Ajout : `.panel-header` (retour) titré « Nouvelle candidature », champs poste*, entreprise*, statut (`.select`, 5 statuts), lieu, URL. Message de doublon dans un `<p role="alert">`.
  - Après enregistrement : `go('detail', newId)` et `UI.toast('Offre ajoutée')`.
  - Supprimer `window.close()` et les `alert()`.
- [ ] **Step 4 :** `npm run e2e` → PASS. Examiner les captures.
- [ ] **Step 5 : Commit** : `feat(popup): bandeau de l'offre courante et vue d'ajout`.

### Task 7 : Vue Détail de la popup

**Files :**
- Modify : `popup.js`, `popup.css`, `tests/e2e/popup.e2e.js`

**Interfaces :**
- Consumes : `UI.STATUSES`, `UI.statusTag`, `UI.toast`, `JobTracker.update`, `openDashboard(id)`.

- [ ] **Step 1 : Tests e2e** (données `SAMPLE`) :
  - dans le Détail d'une candidature `applied` : entreprise, titre, lignes Statut / Date / Lieu ; les lignes vides (salaire absent) ne sont pas rendues ;
  - le contact affiche un lien `mailto:` ;
  - « Ouvrir l'offre ↗ » a `target="_blank"` et la bonne URL ;
  - les notes conservent leurs retours à la ligne (`white-space: pre-wrap`) ;
  - clic sur le tag de statut, puis « Entretien » : `readStore` montre `interview` et le tag est mis à jour ;
  - passer une candidature `wishlist` sans date à `applied` ajoute la date du jour (`JobTracker.todayISO()`) ;
  - « Modifier dans le dashboard » ouvre un onglet `dashboard.html#<id>` ;
  - la flèche retour revient à la liste, sur le même onglet ;
  - suppression ailleurs : `seed` sans la candidature affichée → retour à la liste et toast « Cette candidature a été supprimée ».
  
  Capture : `popup-detail`.
- [ ] **Step 2 :** `npm run e2e` → FAIL.
- [ ] **Step 3 : Implémenter.**
  - `.panel-header` (retour) titré « Détail ».
  - `.card` contenant `.field-row` pour Statut, Date (format `fr-FR`), Lieu, Salaire, Contact, Offre.
  - Le tag de statut est un `<button aria-haspopup="menu">` qui ouvre un menu des 5 statuts (`role="menu"`, navigation par flèches, fermeture par Échap). Le changement passe par `JobTracker.update` avec la même règle de date que le glisser-déposer.
  - Section « Notes ».
  - `.btn--secondary` « Modifier dans le dashboard ».
  - Dans `onChange`, si `state.view === 'detail'` et que la candidature n'existe plus : `go('list')` et le toast.
- [ ] **Step 4 :** `npm run e2e` → PASS. Examiner la capture et la comparer à « Task Details » de la maquette.
- [ ] **Step 5 : Commit** : `feat(popup): vue détail avec changement de statut`.

---

## Sous-projet 3 — Dashboard

### Task 8 : Coque du dashboard, statistiques et Kanban

**Files :**
- Modify : `dashboard.html`, `dashboard.css`, `dashboard.js` (réécrits ; la modale et le code des pastilles de stats sont supprimés)
- Create : `tests/e2e/dashboard.e2e.js`
- Delete : `fonts/outfit-latin-wght-normal.woff2`, `fonts/OFL.txt`

**Interfaces :**
- Consumes : `UI.STATUSES`, `UI.computeStats`, `UI.sortCandidatures`, `UI.relativeTime`, `UI.statusOf`, `UI.toast`, `JobTracker.*`.
- Produces (dans `dashboard.js`, pour les tâches 9 et 10) :
  - `state = { list: Candidature[], query: string }`
  - `render()`
  - `openPanel({ id?: string, status?: string, returnFocus?: HTMLElement })` : réalisée dans la tâche 9 ; ici une fonction vide qui ne fait rien
  - cartes `<article class="kanban-card" tabindex="0" data-id>` ; colonnes `<section class="kanban-col" data-status>` avec `button.kanban-col__add`

- [ ] **Step 1 : Tests e2e** (données `SAMPLE` + `LONG_TITLE` + `XSS_TITLE`) :
  - les stats affichent Total 10, Envoyées, Entretiens et Offres conformes à `UI.computeStats`, et un taux en « N % » ;
  - avec un stockage vide : 0 partout et un taux « — » ;
  - 5 colonnes dans l'ordre des statuts, avec des compteurs cohérents ;
  - le statut inconnu est affiché dans « À postuler » ;
  - la carte `XSS_TITLE` affiche le texte, et `window.__xss` reste `undefined` ;
  - la carte `LONG_TITLE` est tronquée (`scrollWidth > clientWidth` sur le titre, carte sans débordement) ;
  - la recherche filtre les cartes ;
  - le glisser-déposer d'une carte `wishlist` vers « Envoyées » donne `applied` dans `readStore`, avec une date. Utiliser `page.mouse` (down, move, up), ou `dispatchEvent` de `DragEvent` si Puppeteer ne déclenche pas le DnD HTML5 ;
  - mise à jour en direct : un `seed` externe met à jour le Kanban ;
  - à 1000 px de large, le Kanban défile horizontalement et la page ne déborde pas.
  
  Captures : `dashboard`, `dashboard-empty`.
- [ ] **Step 2 :** `npm run e2e` → FAIL.
- [ ] **Step 3 : Implémenter.**
  - En-tête : `.logo-dot` + « Apply View », recherche `.input`, « Exporter CSV » (`.btn--secondary`), « Nouvelle candidature » (`.btn--primary`, qui appelle `openPanel({})`).
  - Rangée de 5 `.card` de stats, chacune avec une icône SVG, un chiffre et un libellé :

    | Libellé | Valeur |
    |---|---|
    | Total | total |
    | Envoyées | sent |
    | Entretiens | interview |
    | Offres | offer |
    | Taux de réponse | responseRate |

    Le taux de réponse a l'attribut `title` « Estimation : candidatures ayant dépassé le statut "envoyée" ».
  - Colonnes : pastille `--status-<id>-fg`, `UI.STATUSES[].label`, compteur, et « + » (`aria-label="Ajouter dans <label>"`) qui appelle `openPanel({ status })`.
  - Cartes : titre, entreprise, « lieu · il y a N j », tag salaire `.tag--neutral`.
  - Le glisser-déposer reprend l'actuel, avec la classe `.kanban-col--drop` (bordure indigo pointillée).
  - Entrée sur une carte ou clic : `openPanel({ id, returnFocus: card })`.
  - L'export CSV existant est conservé ; s'il n'y a rien à exporter, `UI.toast('Aucune candidature à exporter.')`.
  - Colonnes d'au moins 260 px avec défilement horizontal.
  - Supprimer Outfit (`grep -ri outfit` doit être vide hors `docs/`).
- [ ] **Step 4 :** `npm run e2e` → PASS. Examiner les captures.
- [ ] **Step 5 : Commit** : `feat(dashboard): statistiques et Kanban au nouveau design`.

### Task 9 : Panneau de détail

**Files :**
- Modify : `dashboard.html`, `dashboard.css`, `dashboard.js`, `tests/e2e/dashboard.e2e.js`

**Interfaces :**
- Consumes : `openPanel` (tâche 8), `JobTracker.findDuplicate`, `JobTracker.createCandidature`, `JobTracker.update`, `UI.toast`.
- Produces : `closePanel()` et `state.panelId: string | null` (`'new'` en création), utilisés par la tâche 10.

- [ ] **Step 1 : Tests e2e :**
  - le clic sur une carte ouvre `aside.panel[aria-modal="true"]`, avec des champs pré-remplis ; `location.hash === '#<id>'` ;
  - modifier le salaire puis « Enregistrer » : `readStore` est à jour, le toast « Candidature enregistrée » s'affiche, le panneau se ferme et le hash est vidé ;
  - Échap ferme le panneau et rend le focus à la carte (`document.activeElement.dataset.id`) ;
  - Tab depuis le dernier élément du panneau revient au premier (focus piégé) ;
  - le « + » de la colonne « Entretiens » ouvre le panneau vide avec le tag `interview` sélectionné ;
  - « Nouvelle candidature » ouvre le panneau vide avec `wishlist` ;
  - enregistrer un doublon : toast « Une candidature identique existe déjà. », panneau toujours ouvert ;
  - `dashboard.html#<id existant>` au chargement ouvre le panneau ; `#inconnu` affiche le toast « Candidature introuvable » ;
  - le clic sur le voile ferme le panneau ;
  - à 600 px de large, le panneau occupe toute la largeur.
  
  Captures : `dashboard-panel-edit`, `dashboard-panel-new`.
- [ ] **Step 2 :** `npm run e2e` → FAIL.
- [ ] **Step 3 : Implémenter.**
  - `aside.panel` de 420 px avec un voile `.panel-backdrop`, glissement de 200 ms, désactivé si `prefers-reduced-motion`.
  - `.panel-header` avec × et le titre « Modifier la candidature » ou « Nouvelle candidature ».
  - Sections `.section-title` Offre / Contact / Notes, en `.field-row` avec `.input--bare` :
    - Offre : poste*, entreprise*, date, lieu, salaire, URL ;
    - Contact : nom, e-mail, téléphone ;
    - Notes : `.textarea`.
  - Statut : un groupe radio de tags (`role="radiogroup"`).
  - Pied : « Supprimer » (`.btn--danger`, en édition seulement ; l'action vient de la tâche 10), « Annuler », « Enregistrer » (`.btn--primary`).
  - Hash synchronisé à l'ouverture et à la fermeture (`history.replaceState`), plus écoute de `hashchange`.
- [ ] **Step 4 :** `npm run e2e` → PASS. Examiner les captures.
- [ ] **Step 5 : Commit** : `feat(dashboard): panneau de détail modifiable`.

### Task 10 : Suppression avec annulation, cas concurrents, finitions

**Files :**
- Modify : `dashboard.js`, `tests/e2e/dashboard.e2e.js`, `tests/e2e/widget.e2e.js`

**Interfaces :**
- Consumes : `closePanel`, `state.panelId`, `UI.toast({ actionLabel, onAction, duration })`.

- [ ] **Step 1 : Tests e2e :**
  - « Supprimer » retire la carte tout de suite (et du stockage) et affiche le toast « Candidature supprimée » avec « Annuler » ; « Annuler » la réinsère **à son index d'origine** ;
  - sans annulation, au bout de 5 s le toast disparaît et la suppression reste ;
  - panneau ouvert sur X, puis `seed` sans X : le panneau se ferme et le toast « Cette candidature a été supprimée » s'affiche ;
  - `grep` : aucun `alert(` ni `confirm(` dans `dashboard.js` et `popup.js` (assertion sur le contenu des fichiers) ;
  - de bout en bout : dashboard ouvert + changement de statut dans la popup → la carte change de colonne dans le dashboard sans rechargement.
- [ ] **Step 2 :** `npm run e2e` → FAIL.
- [ ] **Step 3 : Implémenter.**
  - Suppression : mémoriser `{ item, index }`, `JobTracker.update(list => list.filter(...))`, puis `UI.toast('Candidature supprimée', { actionLabel: 'Annuler', duration: 5000, onAction: () => JobTracker.update(list => insérer item à min(index, list.length)) })`.
  - Dans `onChange`, si `state.panelId` n'est plus dans la liste et n'est pas `'new'` : `closePanel()` et le toast.
- [ ] **Step 4 :** `npm test && npm run e2e` → tout PASS. Relire toutes les captures de `tests/e2e/screenshots/` côte à côte avec la maquette.
- [ ] **Step 5 : Commit** : `feat(dashboard): suppression annulable et gestion des modifications concurrentes`.
