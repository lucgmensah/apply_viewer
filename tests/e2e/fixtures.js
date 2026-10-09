// Données d'exemple des tests de bout en bout
const base = {
  location: '', salary: '', url: '', contactName: '', contactEmail: '', contactPhone: '', notes: ''
};

const SAMPLE = [
  { ...base, id: 's1', title: 'Développeur Front-End', company: 'Acme', status: 'applied', dateApplied: '2026-09-28', location: 'Paris', salary: '45k€', url: 'https://www.linkedin.com/jobs/view/111', contactName: 'Sophie Martin', contactEmail: 'sophie@acme.fr', notes: 'Relancer lundi.\nPréparer le test technique.' },
  { ...base, id: 's2', title: 'Data Engineer', company: 'Foo', status: 'interview', dateApplied: '2026-10-02', location: 'Lyon' },
  { ...base, id: 's3', title: 'Product Manager', company: 'Bar', status: 'applied', dateApplied: '2026-09-15', location: 'Remote' },
  { ...base, id: 's4', title: 'Développeur Java', company: 'Baz', status: 'wishlist', dateApplied: '2026-10-04', location: 'Nantes' },
  { ...base, id: 's5', title: 'UX Designer', company: 'Qux', status: 'wishlist', dateApplied: '' },
  { ...base, id: 's6', title: 'DevOps', company: 'Acme', status: 'offer', dateApplied: '2026-08-20', salary: '55k€' },
  { ...base, id: 's7', title: 'QA Engineer', company: 'Corge', status: 'rejected', dateApplied: '2026-08-01' },
  { ...base, id: 's8', title: 'Ancien statut', company: 'Legacy', status: 'archived', dateApplied: '2026-07-01' }
];

const LONG_TITLE = 'Développeur Full-Stack Senior JavaScript TypeScript React Node.js spécialisé en architecture distribuée et en performance web (H/F) - CDI Paris';

const XSS_TITLE = '<img src=x onerror="window.__xss=1">Dev';

module.exports = { SAMPLE, LONG_TITLE, XSS_TITLE, base };
