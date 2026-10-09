const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ZIP_NAME = 'postulo-v1.0.0.zip';
const ZIP_PATH = path.join(ROOT, ZIP_NAME);

// Liste exacte des fichiers et dossiers nécessaires à l'extension
const ENTRIES = [
  'manifest.json',
  'background.js',
  'content.js',
  'shared.js',
  'ui.js',
  'popup.html',
  'popup.js',
  'popup.css',
  'dashboard.html',
  'dashboard.js',
  'dashboard.css',
  'tokens.css',
  'components.css',
  'widget.css',
  'images',
  'fonts'
];

console.log('Préparation de l\'archive pour le Chrome Web Store...');

// Vérifier que tous les fichiers requis existent
for (const entry of ENTRIES) {
  const full = path.join(ROOT, entry);
  if (!fs.existsSync(full)) {
    console.error(`Erreur: fichier requis manquant: ${entry}`);
    process.exit(1);
  }
}

// Supprimer l'ancienne archive si elle existe
if (fs.existsSync(ZIP_PATH)) {
  fs.unlinkSync(ZIP_PATH);
}

// Utiliser PowerShell Compress-Archive
const pathsArg = ENTRIES.map(e => `'${e}'`).join(', ');
const psCommand = `powershell -NoProfile -Command "Compress-Archive -Path ${pathsArg} -DestinationPath '${ZIP_NAME}' -Force"`;

console.log('Création du fichier ZIP...');
execSync(psCommand, { cwd: ROOT, stdio: 'inherit' });

if (fs.existsSync(ZIP_PATH)) {
  const stat = fs.statSync(ZIP_PATH);
  const sizeKb = (stat.size / 1024).toFixed(1);
  console.log(`\nSuccès ! Archive créée : ${ZIP_NAME} (${sizeKb} Ko)`);
} else {
  console.error('Erreur lors de la création du ZIP.');
  process.exit(1);
}
