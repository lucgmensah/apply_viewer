const path = require('node:path');
const fs = require('node:fs');
const { launch, seed, sleep, waitForTab } = require('../tests/e2e/harness');

const OUT_DIR = path.resolve(__dirname, '..', 'screenshots');

const SHOWCASE_DATA = [
  {
    id: 'c1',
    title: 'Lead Frontend Engineer (React/TypeScript)',
    company: 'Doctolib',
    status: 'interview',
    dateApplied: '2026-10-02',
    location: 'Paris (Hybride)',
    salary: '68k€',
    url: 'https://www.welcometothejungle.com/fr/companies/doctolib/jobs/lead-frontend',
    contactName: 'Camille Dubois',
    contactEmail: 'camille.d@doctolib.fr',
    contactPhone: '06 12 34 56 78',
    notes: 'Premier tour RH validé. Entretien d\'architecture technique prévu ce jeudi avec le VP Engineering.',
    reminderAt: '2026-10-15T09:00'
  },
  {
    id: 'c2',
    title: 'Senior Fullstack Developer',
    company: 'Qonto',
    status: 'applied',
    dateApplied: '2026-10-05',
    location: 'Paris',
    salary: '62k€',
    url: 'https://www.linkedin.com/jobs/view/4392817291',
    contactName: 'Thomas Leroy',
    contactEmail: 'tleroy@qonto.com',
    notes: 'Candidature spontanée via recommandation. Relance prévue si aucun retour d\'ici 7 jours.',
    reminderAt: '2026-10-14T09:00'
  },
  {
    id: 'c3',
    title: 'Staff Platform & Cloud Architect',
    company: 'Datadog',
    status: 'offer',
    dateApplied: '2026-09-18',
    location: 'Paris / Remote',
    salary: '85k€ + BSPCE',
    url: 'https://www.linkedin.com/jobs/view/4281928371',
    contactName: 'Alexandre Roux',
    contactEmail: 'alexandre.roux@datadoghq.com',
    notes: 'Proposition finale reçue ! Débriefing sur le package global, avantages et télétravail prévu.',
    reminderAt: '2026-10-12T14:30'
  },
  {
    id: 'c4',
    title: 'Product Designer (Design Systems)',
    company: 'Alan',
    status: 'wishlist',
    dateApplied: '',
    location: 'Remote',
    salary: '55k€',
    url: 'https://www.welcometothejungle.com/fr/companies/alan/jobs/product-designer',
    notes: 'Offre repérée sur WTTJ. Portfolio et études de cas à finaliser avant soumission.'
  },
  {
    id: 'c5',
    title: 'Data & Analytics Engineer',
    company: 'Deezer',
    status: 'interview',
    dateApplied: '2026-09-29',
    location: 'Paris',
    salary: '58k€',
    url: 'https://fr.indeed.com/viewjob?jk=7281938bca',
    contactName: 'Sarah Benali',
    notes: 'Tour technique dbt & Snowflake validé. Dernier échange avec le Lead Data.'
  },
  {
    id: 'c6',
    title: 'Site Reliability Engineer (Kubernetes/Go)',
    company: 'PayFit',
    status: 'applied',
    dateApplied: '2026-10-06',
    location: 'Paris',
    salary: '60k€',
    url: 'https://www.welcometothejungle.com/fr/companies/payfit/jobs/sre',
    notes: 'Dossier de candidature transmis directement au recruteur technique.'
  },
  {
    id: 'c7',
    title: 'Mobile Engineer (Flutter / iOS)',
    company: 'Lydia Solutions',
    status: 'wishlist',
    dateApplied: '',
    location: 'Bordeaux / Hybride',
    salary: '50k€',
    url: 'https://www.linkedin.com/jobs/view/4192837192',
    notes: 'Prise de contact via un ancien collègue en cours.'
  },
  {
    id: 'c8',
    title: 'Head of Engineering',
    company: 'Spendesk',
    status: 'rejected',
    dateApplied: '2026-09-01',
    location: 'Paris',
    salary: '90k€',
    notes: 'Recherche d\'un profil avec plus d\'expérience en gestion d\'équipes > 50 personnes. Très bon contact maintenu avec le CTO.'
  }
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('Lancement du navigateur pour générer les captures haute résolution...');
  const { browser, extId } = await launch({ width: 1440, height: 900 });

  // 1. Initialiser le stockage avec le jeu de données de présentation
  console.log('Injection des données de démonstration...');
  await seed(browser, SHOWCASE_DATA);

  // -------------------------------------------------------------
  // 2. DASHBOARD : Tableau Kanban complet (High-Res 2x)
  // -------------------------------------------------------------
  console.log('Capture 1: Dashboard Kanban...');
  const dashPage = await browser.newPage();
  await dashPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await dashPage.goto(`chrome-extension://${extId}/dashboard.html`, { waitUntil: 'load' });
  await sleep(1000);
  await dashPage.screenshot({ path: path.join(OUT_DIR, '01-dashboard-kanban.png') });

  // -------------------------------------------------------------
  // 3. DASHBOARD : Volet latéral de modification (Candidature Doctolib)
  // -------------------------------------------------------------
  console.log('Capture 2: Dashboard Volet de détail / édition...');
  await dashPage.click('.kanban-card[data-id="c1"]');
  await sleep(600);
  await dashPage.screenshot({ path: path.join(OUT_DIR, '02-dashboard-detail.png') });
  await dashPage.close();

  // -------------------------------------------------------------
  // 4. POPUP : Vue Liste
  // -------------------------------------------------------------
  console.log('Capture 3: Popup liste...');
  const popupPage = await browser.newPage();
  await popupPage.setViewport({ width: 380, height: 600, deviceScaleFactor: 2 });
  await popupPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
  await sleep(800);
  await popupPage.screenshot({ path: path.join(OUT_DIR, '03-popup-liste.png') });

  // -------------------------------------------------------------
  // 5. POPUP : Vue Détail d'une candidature
  // -------------------------------------------------------------
  console.log('Capture 4: Popup détail...');
  await popupPage.click('#job-list .job-item[data-id="c1"]');
  await sleep(600);
  await popupPage.screenshot({ path: path.join(OUT_DIR, '04-popup-detail.png') });

  // -------------------------------------------------------------
  // 6. POPUP : Formulaire d'ajout
  // -------------------------------------------------------------
  console.log('Capture 5: Popup ajout...');
  await popupPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
  await sleep(400);
  await popupPage.click('#btn-add');
  await sleep(500);
  await popupPage.screenshot({ path: path.join(OUT_DIR, '05-popup-ajout.png') });
  await popupPage.close();

  // -------------------------------------------------------------
  // 7. WIDGET : Sur une vraie offre (Welcome to the Jungle)
  // -------------------------------------------------------------
  console.log('Capture 6 & 7 & 8: Widget sur une offre...');
  const wttjJobUrl = 'https://www.welcometothejungle.com/fr/companies/findle/jobs/consultant-senior_paris';
  const jobPage = await browser.newPage();
  await jobPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await jobPage.goto(wttjJobUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await sleep(4000);

  // Nettoyer les bannières de cookies / consentements externes pour une capture impeccable
  await jobPage.evaluate(() => {
    document.querySelectorAll('#axeptio_overlay, [id*="axeptio"], .axeptio_mount, [id*="cookie"], [class*="consent"]').forEach(el => el.remove());
  });

  // Attendre l'apparition du widget
  await jobPage.waitForFunction(() => {
    const root = document.getElementById('job-tracker-floating-root')?.shadowRoot;
    const pill = root?.querySelector('.wt-pill');
    const container = root?.querySelector('.widget-container');
    return pill && container && getComputedStyle(container).visibility === 'visible';
  }, { timeout: 10000 }).catch(() => {});

  await sleep(1000);
  console.log('Capture 6: Widget bouton replié...');
  await jobPage.screenshot({ path: path.join(OUT_DIR, '06-widget-bouton.png') });

  console.log('Capture 7: Widget formulaire ouvert...');
  await jobPage.evaluate(() => {
    const root = document.getElementById('job-tracker-floating-root')?.shadowRoot;
    root?.querySelector('.wt-pill')?.click();
  });
  await sleep(800);
  await jobPage.screenshot({ path: path.join(OUT_DIR, '07-widget-formulaire.png') });

  console.log('Capture 8: Widget offre déjà suivie...');
  // Marquer l'offre comme déjà suivie avec statut Entretien
  await seed(browser, [
    ...SHOWCASE_DATA,
    {
      id: 'c_findle',
      title: 'Consultant Senior Transformation Digitale (H/F)',
      company: 'Findle',
      status: 'interview',
      dateApplied: '2026-10-01',
      url: wttjJobUrl,
      location: 'Paris'
    }
  ]);
  await jobPage.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3500);
  await jobPage.evaluate(() => {
    document.querySelectorAll('#axeptio_overlay, [id*="axeptio"], .axeptio_mount, [id*="cookie"], [class*="consent"]').forEach(el => el.remove());
  });
  await sleep(1000);
  await jobPage.screenshot({ path: path.join(OUT_DIR, '08-widget-deja-suivie.png') });
  await jobPage.close();

  await browser.close();
  console.log('Toutes les captures ont été générées avec succès dans screenshots/ !');
}

main().catch(err => {
  console.error('Erreur:', err);
  process.exit(1);
});
