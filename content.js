// --- SCRIPT DE CONTENU DE L'EXTENSION (VERSION AMÉLIORÉE) ---

// Écouter les messages venant de la pop-up
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getJobDetails") {
    try {
      const details = scrapeJobDetails();
      sendResponse(details);
    } catch (e) {
      sendResponse({ success: false, error: e.toString() });
    }
  }
  // Ne pas retourner true car sendResponse est appelé de façon synchrone
});

// Fonction principale de scraping
function scrapeJobDetails() {
  const url = window.location.href;
  let title = "";
  let company = "";
  let location = "";

  // 1. LinkedIn
  if (url.includes("linkedin.com")) {
    // Titre de l'offre
    const titleEl = document.querySelector([
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      "h1.t-24",
      ".jobs-details-top-card__job-title",
      ".p5 h1",
      "h1"
    ].join(","));
    title = titleEl ? titleEl.textContent : "";

    // Entreprise (sélecteurs par classes et par pattern d'URL /company/)
    const companyEl = document.querySelector([
      ".job-details-jobs-unified-top-card__company-name a",
      ".jobs-unified-top-card__company-name a",
      "a[href*='/company/']",
      ".jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__primary-description a",
      ".p5 a"
    ].join(","));
    company = companyEl ? companyEl.textContent : "";

    // Lieu
    const locEl = document.querySelector([
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__primary-description span",
      ".jobs-details-top-card__bullet"
    ].join(","));
    location = locEl ? locEl.textContent : "";
    if (location) {
      location = location.trim().split("·")[0].split("  ")[0];
    }
  } 
  
  // 2. Indeed
  else if (url.includes("indeed.com")) {
    // Titre de l'offre
    const titleEl = document.querySelector([
      "h1.jobsearch-JobInfoHeader-title",
      ".jobsearch-JobInfoHeader-title span",
      "h1.jobTitle",
      "h1"
    ].join(","));
    title = titleEl ? titleEl.textContent : "";

    // Entreprise (sélecteurs par classes et par pattern d'URL /cmp/)
    const companyEl = document.querySelector([
      "div.jobsearch-CompanyInfoContainer a",
      "a[href*='/cmp/']",
      "[data-company-name='true']",
      ".jobsearch-InlineCompanyRating a",
      ".jobsearch-CompanyReview--heading a",
      ".jobsearch-InlineCompanyRating div"
    ].join(","));
    company = companyEl ? companyEl.textContent : "";

    // Lieu
    const locEl = document.querySelector([
      "#jobLocationSection",
      ".jobsearch-JobInfoHeader-subtitle div:last-child",
      ".jobsearch-InlineCompanyRating + div",
      "[data-testid='job-location']",
      ".jobsearch-JobInfoContainer .jobsearch-JobInfoHeader-subtitle"
    ].join(","));
    location = locEl ? locEl.textContent : "";
  } 
  
  // 3. Welcome to the Jungle
  else if (url.includes("welcometothejungle.com")) {
    // Titre de l'offre
    const titleEl = document.querySelector([
      "[data-testid='job-header-title']",
      "h1",
      "h2"
    ].join(","));
    title = titleEl ? titleEl.textContent : "";

    // Entreprise (sélecteur par pattern d'URL /companies/)
    const companyEl = document.querySelector([
      "a[href*='/companies/'] h4",
      "a[href*='/companies/'] span",
      "a[href*='/companies/'] div",
      "[data-testid='job-header-company']"
    ].join(","));
    
    if (companyEl && !companyEl.textContent.includes(title)) {
      company = companyEl.textContent;
    } else {
      // Extraction secours via l'URL : welcometothejungle.com/fr/companies/societe/jobs/...
      const match = url.match(/\/companies\/([^/]+)/);
      if (match && match[1]) {
        company = match[1]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
      }
    }

    // Lieu
    const locEl = document.querySelector([
      "[data-testid='job-metadata-location']",
      "span[title*='Lieu']",
      "i.wttj-icon-location + span"
    ].join(","));
    location = locEl ? locEl.textContent : "";
  }

  // --- COMPORTEMENT DE SECOURS (OG Tags) ---
  if (!title) {
    const ogTitle = document.querySelector("meta[property='og:title']");
    title = ogTitle ? ogTitle.getAttribute("content") : document.title;
  }
  if (!company) {
    const ogSite = document.querySelector("meta[property='og:site_name']");
    company = ogSite ? ogSite.getAttribute("content") : "";
  }

  // Nettoyage sécurisé des chaînes de caractères
  title = title ? String(title).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";
  company = company ? String(company).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";
  location = location ? String(location).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";

  // Filtres pour ne pas renvoyer le nom du site
  if (company.toLowerCase() === "linkedin" && url.includes("linkedin.com")) company = "";
  if (company.toLowerCase() === "indeed" && url.includes("indeed.com")) company = "";
  if (company.toLowerCase() === "welcome to the jungle" && url.includes("welcometothejungle")) company = "";

  // Enlever les suffixes de titres de page courants
  if (title) {
    title = title
      .replace(/ - Indeed\.com/i, "")
      .replace(/ \| LinkedIn/i, "")
      .replace(/ - Welcome to the Jungle/i, "");
  }

  return {
    success: !!(title || company),
    title,
    company,
    location,
    url
  };
}
