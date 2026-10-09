# Refonte du front - Apply View

- **Date** : 2026-10-06
- **Statut** : validé en discussion, en attente de relecture
- **Branche** : `feat/refonte-front`
- **Inspiration** : maquette « Jets » (popup d'extension blanche, accent indigo, liste à onglets segmentés, vue détail en lignes libellé / valeur)

## 1. Objectif

Refaire entièrement l'interface de l'extension (popup, dashboard, widget injecté) avec une identité visuelle unique, inspirée de la maquette Jets. La popup devient une mini-application de consultation, plus seulement un formulaire d'ajout. Le dashboard garde le Kanban mais remplace la modale par un panneau de détail.

### Critères de réussite

- Les trois surfaces (popup, dashboard, widget) utilisent les mêmes tokens et composants, sans styles dupliqués.
- Depuis la popup, on peut consulter ses candidatures, voir le détail, changer un statut et ajouter l'offre de l'onglet courant.
- Le dashboard n'utilise plus `alert()`, `confirm()` ni de modale. Tout se fait au clavier (focus visible, Échap, Entrée).
- Aucune régression fonctionnelle : détection d'offre, doublons, synchronisation en direct, export CSV, glisser-déposer.

### Hors périmètre

- Pas de changement du modèle de données (`candidatures` dans `chrome.storage.local`). Les tags de la maquette correspondent aux statuts existants. Les cases à cocher et les pièces jointes de la maquette ne sont pas reprises.
- Pas de mode sombre (les tokens le permettront plus tard).
- Pas d'historique des statuts, de rappels ni de nouveaux sites (voir l'audit).
- Pas de framework ni d'étape de build.

## 2. Découpage

La refonte comporte trois sous-projets livrés dans cet ordre. Chacun donne une extension fonctionnelle et commitée :

1. **Système de design + widget**
2. **Popup**
3. **Dashboard**

## 3. Approche technique

Vanilla JS et CSS, sans dépendance, chargés directement par l'extension :

| Fichier | Rôle |
|---|---|
| `tokens.css` (réécrit) | Variables de couleurs, rayons, espacements, ombres, police. Déclarées sur `:root, :host` pour fonctionner aussi dans le Shadow DOM du widget. |
| `components.css` (nouveau) | Composants partagés : boutons, onglets segmentés, cartes, tags de statut, lignes libellé / valeur, en-tête de panneau, champs, bandeau, état vide, toast, anneau de focus. |
| `ui.js` (nouveau) | Rendus partagés : `STATUSES` (ordre, libellés, groupe d'onglet), `statusTag(status)`, `relativeTime(date)`, `jobItem(candidature)`. Les libellés de statuts ne sont définis qu'ici. |
| `shared.js` (existant) | Stockage, doublons, clés d'offres. Ajout de `findDuplicate(list, candidate, excludeId)`, qui renvoie la candidature correspondante ou `null` ; `isDuplicate` s'appuie dessus. Le widget et le bandeau de la popup en ont besoin pour afficher le statut et ouvrir `#<id>`. |
| `background.js` (existant) | Le message `openDashboard` accepte un `id` optionnel et ouvre `dashboard.html#<id>`. |
| `popup.html/.css/.js` | Réécrits (sous-projet 2). |
| `dashboard.html/.css/.js` | Réécrits (sous-projet 3). |
| `content.js` | Le widget charge `tokens.css` + `components.css` + `widget.css` dans son Shadow DOM. Le scraping et le cycle de vie sont inchangés. |

`ui.js` produit du HTML échappé via `JobTracker.escapeHTML`. Toute donnée utilisateur passe par l'échappement ou par `textContent`.

## 4. Sous-projet 1 - Système de design + widget

### Tokens

- **Couleurs** :
  - fond `#F7F7FB` ; surface `#FFFFFF` ; bordure `#ECECF3` ;
  - texte `#1B1B3A` ; texte secondaire `#8A8AA3` ;
  - accent `#5B5BF6`, survol `#4A4AE0`, fond léger `#EEEEFE`.
- **Statuts** : paires fond pastel / texte foncé, contraste du texte d'au moins 4.5:1 (niveau AA) :

  | Statut | Teinte |
  |---|---|
  | `wishlist` (À postuler) | gris |
  | `applied` (Envoyée) | indigo |
  | `interview` (Entretien) | orange |
  | `offer` (Offre) | vert |
  | `rejected` (Refusée) | rouge |

- **Formes** : rayon 14 px pour les cartes, 10 px pour les champs, pilule pour les onglets et tags. Espacements sur une grille de 4 px. Ombres très légères : la structure repose sur les bordures.
- **Police** : Plus Jakarta Sans variable, sous-ensemble latin, embarquée dans `fonts/` avec sa licence OFL. Outfit est retirée.

### Composants (`components.css`)

- `.btn` : variantes `--primary` (indigo), `--secondary` (bordure), `--ghost`, `--danger`. `.icon-btn` : bouton rond de l'en-tête.
- `.segmented` : conteneur gris, segment actif rempli en indigo avec texte blanc. Affiche un compteur.
- `.card`, `.job-item` : titre, ligne de métadonnées, tag à droite.
- `.tag` + `.tag--<statut>`.
- `.field-row` : libellé secondaire à gauche, valeur à droite. `.panel-header` : flèche retour + titre.
- `.input`, `.select`, `.textarea`.
- `.banner`, `.empty-state`, `.toast`.
- `:focus-visible` : anneau indigo de 3 px sur tous les éléments interactifs. Les éléments cliquables sont des `<button>` ou des `<a>`.

### Widget

- Le Shadow DOM charge les feuilles par `<link rel="stylesheet">` vers `chrome.runtime.getURL(...)`. Ces fichiers sont ajoutés aux `web_accessible_resources` (mêmes origines que la police).
- La police est enregistrée via l'API `FontFace`, comme aujourd'hui : un `@font-face` dans un Shadow DOM n'est pas appliqué.
- Bouton replié : pilule blanche, icône indigo, « Suivre cette offre ».
- Panneau d'ajout : carte façon maquette (en-tête logo + « Apply View », champs, bouton principal indigo).
- État « Offre déjà suivie » : pilule avec le **tag du statut actuel**. Le clic ouvre le dashboard sur cette candidature (`#<id>`).

### Nom

« Apply View » partout : titres de la popup et du dashboard, widget, `manifest.json` (« Apply View - Bêta »).

## 5. Sous-projet 2 - Popup

360 px de large. En-tête : pastille logo + « Apply View », puis deux boutons ronds : **+** (ajout manuel) et **↗** (ouvrir le dashboard).

Trois vues, gérées par un état local `view = 'list' | 'detail' | 'add'` et `selectedId`. Le passage d'une vue à l'autre se fait sans rechargement, avec la flèche retour.

### Vue Liste (par défaut)

- **Bandeau offre**, calculé à partir de la réponse du script de contenu (scraping existant) :
  - `success` et non suivie : carte « Poste - Entreprise » + bouton **Ajouter cette offre**, qui ouvre la vue Ajout pré-remplie ;
  - `success` et déjà suivie : « Déjà suivie » + tag de statut ; le clic ouvre le Détail ;
  - sinon : aucun bandeau.
- **Onglets segmentés**, avec compteurs :

  | Onglet | Statuts |
  |---|---|
  | À faire | `wishlist` |
  | En cours | `applied`, `interview` |
  | Terminées | `offer`, `rejected` |

  L'onglet actif est mémorisé dans `localStorage` (try/catch). Par défaut : « En cours ».
- **Ligne d'en-tête** : « N candidatures » + icône loupe, qui affiche un champ de recherche filtrant titre, entreprise et lieu.
- **Cartes** triées par `dateApplied` décroissante, puis par ordre d'insertion. Un clic ouvre le Détail. Un état vide est prévu pour chaque onglet.

### Vue Détail

- Entreprise en petit, titre du poste en grand.
- Lignes : **Statut**, Date, Lieu, Salaire, Contact (nom, e-mail en `mailto:`), **Offre** (« Ouvrir l'offre ↗ », nouvel onglet).
- **Statut** : tag cliquable qui ouvre un menu des 5 statuts. Le changement est enregistré immédiatement via `JobTracker.update`. Passage à `applied` sans date : la date du jour est ajoutée (même règle que le glisser-déposer).
- Bloc Notes en lecture (retours à la ligne conservés).
- Bouton **Modifier dans le dashboard** : ouvre `dashboard.html#<id>`.
- Lignes vides masquées.

### Vue Ajout

- Formulaire : poste*, entreprise*, statut, lieu, URL. Pré-rempli par le scraping, sinon vide (ajout manuel via **+**).
- Doublon : message dans la vue, plus d'`alert()`.
- Après l'enregistrement, la popup affiche le Détail de la nouvelle candidature avec un toast « Offre ajoutée ». Elle ne se ferme plus automatiquement.

### Données

- `JobTracker.getAll` au chargement, `JobTracker.onChange` pour rester à jour, `JobTracker.update` pour toute écriture.

## 6. Sous-projet 3 - Dashboard

### En-tête

- Logo + « Apply View ».
- Recherche, avec le même filtrage qu'aujourd'hui sur titre, entreprise, lieu et notes.
- **Exporter CSV** (secondaire) et **Nouvelle candidature** (principal).
- Le titre « Welcome in your job board, » est supprimé.

### Statistiques

Une rangée de 5 cartes informatives, non cliquables. Chacune a une icône, un grand chiffre et un libellé :

| Carte | Calcul |
|---|---|
| Total | nombre de candidatures |
| Envoyées | statut ≠ `wishlist` |
| Entretiens | `interview` |
| Offres | `offer` |
| Taux de réponse | (`interview` + `offer` + `rejected`) ÷ Envoyées, arrondi à l'entier ; « - » si Envoyées = 0 |

Le taux de réponse est une approximation : sans historique, on considère qu'un statut au-delà de « envoyée » signifie qu'une réponse a été reçue. Une info-bulle le précise.

### Kanban

- 5 colonnes dans l'ordre des statuts.
- En-tête de colonne : pastille de couleur, nom, compteur, bouton **+**. Le **+** ouvre le panneau en création avec ce statut.
- Carte : poste, entreprise, puis « lieu · il y a N j » ; salaire en tag s'il est renseigné. La carte est un élément focalisable : Entrée ou clic ouvre le panneau.
- Glisser-déposer conservé : zone de dépôt surlignée en indigo pointillé. Écriture via `JobTracker.update`.
- Responsive : colonnes d'au moins 260 px ; défilement horizontal du Kanban en dessous d'environ 1100 px de large.

### Panneau de détail (remplace la modale)

- 420 px, glisse depuis la droite par-dessus le Kanban, avec un voile léger. Pleine largeur en dessous de 640 px.
- Ouvert par : clic ou Entrée sur une carte, **Nouvelle candidature**, **+** d'une colonne, ou un `#<id>` dans l'URL au chargement (et à l'événement `hashchange`). Un `id` inconnu affiche un toast « Candidature introuvable ».
- Contenu : formulaire modifiable en lignes libellé / valeur. Champs sans bordure jusqu'au survol ou au focus. Trois sections :
  - **Offre** : poste*, entreprise*, statut, date, lieu, salaire, URL ;
  - **Contact** : nom, e-mail, téléphone ;
  - **Notes**.
- Statut choisi par une rangée de tags. C'est aussi l'alternative clavier au glisser-déposer.
- **Enregistrer** explicite (pas de sauvegarde automatique), plus **Supprimer** en mode édition.
- Fermeture par Échap, ×, ou clic sur le voile. Le focus reste piégé dans le panneau et revient sur la carte d'origine à la fermeture.
- Le hash de l'URL est mis à jour à l'ouverture et retiré à la fermeture.

### Messages (toasts)

Remplacent tous les `alert()` / `confirm()` :
- doublon détecté (le panneau reste ouvert) ;
- rien à exporter ;
- candidature enregistrée ;
- **suppression avec « Annuler »** pendant 5 s : la candidature est retirée tout de suite et réinsérée à sa position d'origine si l'on annule.

## 7. Cas limites et erreurs

- Stockage vide : états vides dans la popup et le Kanban, statistiques à 0, taux « - ».
- Candidature supprimée dans un autre contexte pendant qu'elle est ouverte (popup Détail ou panneau) : retour à la liste ou fermeture, avec un toast « Cette candidature a été supprimée ».
- Statut inconnu dans les données : traité comme `wishlist` à l'affichage, sans réécriture.
- `dateApplied` vide ou invalide : pas de temps relatif ; tri en fin de liste.
- Popup ouverte sur une page interne de Chrome : pas de scraping, pas de bandeau (comportement actuel).

## 8. Tests

- `shared.js` : les tests Node existants doivent continuer de passer. Ajouter des tests Node pour `ui.js` : `relativeTime`, regroupement des statuts, échappement dans `jobItem`, calcul du taux de réponse.
- Vérification visuelle par captures Puppeteer (Chrome for Testing + extension chargée), avec des données d'exemple injectées dans `chrome.storage.local` :
  - widget : repli, panneau, « déjà suivie » ;
  - popup : liste (3 onglets + vide), détail, ajout, bandeau (non suivie / suivie / absent) ;
  - dashboard : vue générale, panneau en création et en édition, toasts.
- Parcours automatisés Puppeteer :
  - changement de statut dans la popup, visible en direct dans un dashboard ouvert ;
  - glisser-déposer ;
  - suppression puis annulation ;
  - ouverture via `#id` ;
  - Échap ferme le panneau et rend le focus à la carte ;
  - ajout depuis le widget, visible en direct dans le dashboard.
