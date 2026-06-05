// --- GESTION DU STOCKAGE (CHROME STORAGE OU LOCALSTORAGE FALLBACK) ---
const storage = {
  get: function(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['candidatures'], function(result) {
        callback(result.candidatures || []);
      });
    } else {
      // Fallback local pour développement et test hors extension
      const data = localStorage.getItem('job_tracker_candidatures');
      callback(data ? JSON.parse(data) : []);
    }
  },
  set: function(candidatures, callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ candidatures }, function() {
        if (callback) callback();
      });
    } else {
      localStorage.setItem('job_tracker_candidatures', JSON.stringify(candidatures));
      if (callback) callback();
    }
  }
};

// --- VARIABLES D'ÉTAT ---
let allCandidatures = [];
let filteredCandidatures = [];
let currentFilterStatus = 'all'; // 'all' ou un statut spécifique pour filtre par stat-card
let searchQuery = '';

// --- ÉLÉMENTS DU DOM ---
const searchInput = document.getElementById('search-input');
const btnAdd = document.getElementById('btn-add');
const btnExport = document.getElementById('btn-export');
const btnCancel = document.getElementById('btn-cancel');
const btnDelete = document.getElementById('btn-delete');
const btnSave = document.getElementById('btn-save');
const modalClose = document.getElementById('modal-close');
const modalOverlay = document.getElementById('candidature-modal');
const modalForm = document.getElementById('candidature-form');
const modalTitle = document.getElementById('modal-title');

// Champs du formulaire
const fieldId = document.getElementById('field-id');
const fieldTitle = document.getElementById('field-title');
const fieldCompany = document.getElementById('field-company');
const fieldStatus = document.getElementById('field-status');
const fieldDate = document.getElementById('field-date');
const fieldLocation = document.getElementById('field-location');
const fieldSalary = document.getElementById('field-salary');
const fieldUrl = document.getElementById('field-url');
const fieldContactName = document.getElementById('field-contact-name');
const fieldContactEmail = document.getElementById('field-contact-email');
const fieldContactPhone = document.getElementById('field-contact-phone');
const fieldNotes = document.getElementById('field-notes');

// Stats
const statTotal = document.getElementById('stat-total');
const statWishlist = document.getElementById('stat-wishlist');
const statApplied = document.getElementById('stat-applied');
const statInterview = document.getElementById('stat-interview');
const statOffer = document.getElementById('stat-offer');
const statRejected = document.getElementById('stat-rejected');

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
  setupDragAndDrop();
});

// Charger les données
function loadData() {
  storage.get((data) => {
    allCandidatures = data;
    applyFiltersAndRender();
  });
}

// Configurer les écouteurs d'événements
function setupEventListeners() {
  // Recherche
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFiltersAndRender();
  });

  // Filtres par clic sur cartes stats
  const statCards = document.querySelectorAll('.stat-card');
  statCards.forEach(card => {
    card.addEventListener('click', () => {
      const filter = card.dataset.filter;
      
      // Toggle de l'état actif
      statCards.forEach(c => c.classList.remove('active'));
      if (currentFilterStatus === filter) {
        currentFilterStatus = 'all';
      } else {
        currentFilterStatus = filter;
        card.classList.add('active');
      }
      applyFiltersAndRender();
    });
  });

  // Modales
  btnAdd.addEventListener('click', () => openModal());
  modalClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);
  
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Formulaire (Enregistrement / Suppression)
  modalForm.addEventListener('submit', handleSaveCandidature);
  btnDelete.addEventListener('click', handleDeleteCandidature);

  // Export Excel/CSV
  btnExport.addEventListener('click', handleExportCSV);
}

// --- FILTRES & RENDU ---
function applyFiltersAndRender() {
  // 1. Filtrer selon la recherche
  filteredCandidatures = allCandidatures.filter(c => {
    const titleMatch = (c.title || '').toLowerCase().includes(searchQuery);
    const companyMatch = (c.company || '').toLowerCase().includes(searchQuery);
    const notesMatch = (c.notes || '').toLowerCase().includes(searchQuery);
    const locationMatch = (c.location || '').toLowerCase().includes(searchQuery);
    return titleMatch || companyMatch || notesMatch || locationMatch;
  });

  // 2. Filtrer selon le bouton de stat sélectionné
  if (currentFilterStatus !== 'all') {
    filteredCandidatures = filteredCandidatures.filter(c => c.status === currentFilterStatus);
  }

  // Mettre à jour les compteurs globaux et colonnes
  updateStats();
  
  // Vider les colonnes
  const columns = ['wishlist', 'applied', 'interview', 'offer', 'rejected'];
  columns.forEach(col => {
    document.getElementById(`cards-${col}`).innerHTML = '';
    document.getElementById(`count-${col}`).textContent = '0';
  });

  // Remplir les colonnes
  filteredCandidatures.forEach(cand => {
    const cardElement = createJobCard(cand);
    const container = document.getElementById(`cards-${cand.status}`);
    if (container) {
      container.appendChild(cardElement);
      // Mettre à jour le compteur de la colonne
      const countEl = document.getElementById(`count-${cand.status}`);
      if (countEl) {
        countEl.textContent = parseInt(countEl.textContent || 0) + 1;
      }
    }
  });
}

// Calculer et afficher les statistiques
function updateStats() {
  const stats = {
    total: allCandidatures.length,
    wishlist: allCandidatures.filter(c => c.status === 'wishlist').length,
    applied: allCandidatures.filter(c => c.status === 'applied').length,
    interview: allCandidatures.filter(c => c.status === 'interview').length,
    offer: allCandidatures.filter(c => c.status === 'offer').length,
    rejected: allCandidatures.filter(c => c.status === 'rejected').length
  };

  statTotal.textContent = stats.total;
  statWishlist.textContent = stats.wishlist;
  statApplied.textContent = stats.applied;
  statInterview.textContent = stats.interview;
  statOffer.textContent = stats.offer;
  statRejected.textContent = stats.rejected;
}

// Créer l'élément HTML d'une carte
function createJobCard(c) {
  const card = document.createElement('div');
  card.className = 'job-card';
  card.setAttribute('draggable', 'true');
  card.dataset.id = c.id;
  card.dataset.status = c.status;

  // Formater la date en FR (JJ/MM/AAAA)
  let dateFormatted = '';
  if (c.dateApplied) {
    const d = new Date(c.dateApplied);
    if (!isNaN(d.getTime())) {
      dateFormatted = d.toLocaleDateString('fr-FR');
    }
  }

  // Préparer les badges
  let badgesHTML = '';
  if (c.location) {
    badgesHTML += `<span class="badge badge-location">${escapeHTML(c.location)}</span>`;
  }
  if (c.salary) {
    badgesHTML += `<span class="badge badge-salary">${escapeHTML(c.salary)}</span>`;
  }

  card.innerHTML = `
    <div class="job-card-title">${escapeHTML(c.title)}</div>
    <div class="job-card-company">${escapeHTML(c.company)}</div>
    <div class="job-card-footer">
      <span class="job-card-date">${dateFormatted}</span>
      <div class="job-card-badges">
        ${badgesHTML}
      </div>
    </div>
  `;

  // Ouvrir les détails lors du clic
  card.addEventListener('click', (e) => {
    // Empêcher l'ouverture si on dragge
    if (card.classList.contains('dragging')) return;
    openModal(c);
  });

  // Événements de Drag
  card.addEventListener('dragstart', () => {
    card.classList.add('dragging');
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    // Enlever les styles temporaires des colonnes
    document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
  });

  return card;
}

// --- GESTION DU DRAG & DROP ---
function setupDragAndDrop() {
  const columns = document.querySelectorAll('.kanban-column');
  
  columns.forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', () => {
      col.classList.remove('drag-over');
    });

    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      
      const draggingCard = document.querySelector('.job-card.dragging');
      if (draggingCard) {
        const id = draggingCard.dataset.id;
        const newStatus = col.dataset.status;
        
        // Mettre à jour dans la liste
        allCandidatures = allCandidatures.map(cand => {
          if (cand.id === id) {
            return { 
              ...cand, 
              status: newStatus,
              // Mettre à jour automatiquement la date d'action si c'est "envoyée" ou "entretien"
              dateApplied: (newStatus === 'applied' && !cand.dateApplied) ? new Date().toISOString().slice(0, 10) : cand.dateApplied
            };
          }
          return cand;
        });

        // Enregistrer et rafraîchir
        storage.set(allCandidatures, () => {
          applyFiltersAndRender();
        });
      }
    });
  });
}

// --- GESTION DE LA MODALE ET DU FORMULAIRE ---
function openModal(cand = null) {
  modalForm.reset();
  
  if (cand) {
    // Mode édition
    modalTitle.textContent = "Modifier la Candidature";
    btnDelete.classList.remove('hidden');
    
    fieldId.value = cand.id;
    fieldTitle.value = cand.title || '';
    fieldCompany.value = cand.company || '';
    fieldStatus.value = cand.status || 'wishlist';
    fieldDate.value = cand.dateApplied || '';
    fieldLocation.value = cand.location || '';
    fieldSalary.value = cand.salary || '';
    fieldUrl.value = cand.url || '';
    fieldContactName.value = cand.contactName || '';
    fieldContactEmail.value = cand.contactEmail || '';
    fieldContactPhone.value = cand.contactPhone || '';
    fieldNotes.value = cand.notes || '';
  } else {
    // Mode ajout
    modalTitle.textContent = "Nouvelle Candidature";
    btnDelete.classList.add('hidden');
    fieldId.value = '';
    
    // Date du jour par défaut
    fieldDate.value = new Date().toISOString().slice(0, 10);
    fieldStatus.value = 'wishlist';
  }
  
  modalOverlay.classList.add('open');
}

function closeModal() {
  modalOverlay.classList.remove('open');
}

// Sauvegarde candidature
function handleSaveCandidature(e) {
  e.preventDefault();
  
  const id = fieldId.value;
  const candidatureData = {
    id: id || generateUUID(),
    title: fieldTitle.value.trim(),
    company: fieldCompany.value.trim(),
    status: fieldStatus.value,
    dateApplied: fieldDate.value,
    location: fieldLocation.value.trim(),
    salary: fieldSalary.value.trim(),
    url: fieldUrl.value.trim(),
    contactName: fieldContactName.value.trim(),
    contactEmail: fieldContactEmail.value.trim(),
    contactPhone: fieldContactPhone.value.trim(),
    notes: fieldNotes.value.trim()
  };

  // Détection des doublons (exclure l'élément en cours de modification)
  const isDuplicate = allCandidatures.some(c => {
    if (c.id === id) return false;

    const t1 = (c.title || '').trim().toLowerCase();
    const t2 = (candidatureData.title || '').trim().toLowerCase();
    const comp1 = (c.company || '').trim().toLowerCase();
    const comp2 = (candidatureData.company || '').trim().toLowerCase();

    // 1. Comparer l'URL (sans paramètres de tracking)
    if (candidatureData.url && c.url) {
      const cleanUrl1 = c.url.split('?')[0].split('#')[0];
      const cleanUrl2 = candidatureData.url.split('?')[0].split('#')[0];
      if (cleanUrl1 === cleanUrl2) return true;
    }

    // 2. Vérification par titre + entreprise
    return t1 === t2 && comp1 === comp2;
  });

  if (isDuplicate) {
    alert("Une candidature avec ce lien ou ce poste chez cette entreprise existe déjà !");
    return;
  }

  if (id) {
    // Modification
    allCandidatures = allCandidatures.map(c => c.id === id ? candidatureData : c);
  } else {
    // Nouvel ajout
    allCandidatures.unshift(candidatureData);
  }

  storage.set(allCandidatures, () => {
    applyFiltersAndRender();
    closeModal();
  });
}

// Suppression candidature
function handleDeleteCandidature() {
  const id = fieldId.value;
  if (!id) return;

  if (confirm("Êtes-vous sûr de vouloir supprimer cette candidature ?")) {
    allCandidatures = allCandidatures.filter(c => c.id !== id);
    storage.set(allCandidatures, () => {
      applyFiltersAndRender();
      closeModal();
    });
  }
}

// --- EXPORTATION EXCEL / CSV ---
function handleExportCSV() {
  if (allCandidatures.length === 0) {
    alert("Aucune candidature à exporter.");
    return;
  }

  const headers = [
    "Titre du Poste", 
    "Entreprise", 
    "Statut", 
    "Date Action / Envoi", 
    "Lieu", 
    "Salaire", 
    "Lien de l'offre", 
    "Contact Nom", 
    "Contact Email", 
    "Contact Telephone", 
    "Notes"
  ];
  
  const statusMap = {
    wishlist: "A postuler",
    applied: "Candidature envoyee",
    interview: "Entretien en cours",
    offer: "Offre recue",
    rejected: "Refusee / Classee"
  };

  const rows = allCandidatures.map(c => [
    c.title || "",
    c.company || "",
    statusMap[c.status] || c.status || "",
    c.dateApplied || "",
    c.location || "",
    c.salary || "",
    c.url || "",
    c.contactName || "",
    c.contactEmail || "",
    c.contactPhone || "",
    c.notes || ""
  ]);

  // Générer le contenu CSV avec séparateur point-virgule (Excel FR Windows)
  const csvContent = [
    headers.join(";"),
    ...rows.map(row => row.map(val => {
      // Échapper les guillemets et remplacer les retours à la ligne par des espaces
      const escaped = String(val).replace(/"/g, '""').replace(/\r?\n|\r/g, " ");
      return `"${escaped}"`;
    }).join(";"))
  ].join("\r\n");

  // Ajout du BOM UTF-8 (\uFEFF) pour qu'Excel Windows reconnaisse l'encodage de suite
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  
  link.setAttribute("href", url);
  link.setAttribute("download", `suivi_candidatures_${dateStr}.csv`);
  document.body.appendChild(link);
  
  link.click();
  document.body.removeChild(link);
}

// --- UTILS ---
function generateUUID() {
  return 'uuid-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
