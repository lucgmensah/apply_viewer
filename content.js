// --- SCRIPT DE CONTENU DE L'EXTENSION ---

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
  return true; // Garder le canal de communication ouvert pour la réponse asynchrone
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
      ".p5 h1",
      "h1"
    ].join(","));
    title = titleEl ? titleEl.textContent.trim() : "";

    // Entreprise
    const companyEl = document.querySelector([
      ".job-details-jobs-unified-top-card__company-name a",
      ".jobs-unified-top-card__company-name a",
      ".jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__primary-description a",
      ".jobs-details-top-card__company-url",
      ".p5 a"
    ].join(","));
    company = companyEl ? companyEl.textContent.trim() : "";

    // Lieu
    const locEl = document.querySelector([
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__primary-description span",
      ".jobs-details-top-card__bullet"
    ].join(","));
    location = locEl ? locEl.textContent.trim().split("·")[0].split("  ")[0].trim() : "";
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
    title = titleEl ? titleEl.textContent.trim() : "";

    // Entreprise
    const companyEl = document.querySelector([
      "div.jobsearch-CompanyInfoContainer a",
      "[data-company-name='true']",
      ".jobsearch-InlineCompanyRating a",
      ".jobsearch-CompanyReview--heading a",
      ".jobsearch-InlineCompanyRating div"
    ].join(","));
    company = companyEl ? companyEl.textContent.trim() : "";

    // Lieu
    const locEl = document.querySelector([
      "#jobLocationSection",
      ".jobsearch-JobInfoHeader-subtitle div:last-child",
      ".jobsearch-InlineCompanyRating + div",
      "[data-testid='job-location']",
      ".jobsearch-JobInfoContainer .jobsearch-JobInfoHeader-subtitle"
    ].join(","));
    location = locEl ? locEl.textContent.trim() : "";
  } 
  
  // 3. Welcome to the Jungle
  else if (url.includes("welcometothejungle.com")) {
    // Titre de l'offre
    const titleEl = document.querySelector([
      "h1",
      "h2",
      "[data-testid='job-header-title']"
    ].join(","));
    title = titleEl ? titleEl.textContent.trim() : "";

    // Entreprise
    const companyEl = document.querySelector([
      "a[href*='/companies/'] h4",
      "a[href*='/companies/'] span",
      "a[href*='/companies/'] div",
      "[data-testid='job-header-company']"
    ].join(","));
    
    if (companyEl && !companyEl.textContent.includes(title)) {
      company = companyEl.textContent.trim();
    } else {
      // Essayer d'extraire depuis l'URL: welcometothejungle.com/fr/companies/societe/jobs/...
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
      "i.wttj-icon-location + span",
      ".sc-bXfJDx"
    ].join(","));
    location = locEl ? locEl.textContent.trim() : "";
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

  // Nettoyage des chaînes de caractères (retirer sauts de ligne et espaces superflus)
  title = title ? title.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";
  company = company ? company.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";
  location = location ? location.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";

  // Filtres pour ne pas renvoyer le nom du site comme nom d'entreprise
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
