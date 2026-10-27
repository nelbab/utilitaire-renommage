#!/usr/bin/env node
/**
 * Utilitaire de renommage de fichiers d'un dossier (ligne de commande).
 * Nécessite renommer-core.js dans le même dossier.
 *
 * Usage :
 *   node renommer.js <dossier>                                  -> simulation (rien n'est modifié)
 *   node renommer.js <dossier> --apply                          -> applique réellement les changements
 *   node renommer.js <dossier> --prefix=F-,D-,T-,spec- --apply
 *   node renommer.js <dossier> --garder=gros --apply
 *   node renommer.js <dossier> --xlsx=liste.xlsx                -> exporte la liste des fichiers en Excel
 *
 * Options :
 *   --prefix=F-,D-,spec-  préfixes à enlever (séparés par des virgules). Sans option : aucun préfixe enlevé.
 *   --garder=petit|gros   si le nom cible existe déjà :
 *                           petit (défaut) = supprime le fichier le plus gros
 *                           gros           = garde le plus gros (supprime le plus petit)
 *                         à taille égale : supprime le plus ancien, garde le plus récent
 *   --xlsx=fichier.xlsx   écrit la liste de tous les fichiers (et des actions) dans un fichier Excel
 *   --apply               exécute les renommages / suppressions (sinon simple aperçu)
 */

const fs = require('fs');
const path = require('path');
const { traiter, libelle, genererXlsx } = require('./renommer-core');

const args = process.argv.slice(2);
const opt = (nom) => { const a = args.find((x) => x.startsWith(`--${nom}=`)); return a ? a.slice(nom.length + 3) : null; };

const apply = args.includes('--apply');
const prefixArg = opt('prefix');
const prefixes = prefixArg ? prefixArg.split(',').map((p) => p.trim()).filter(Boolean) : null;
const garder = opt('garder') || 'petit';
const xlsx = opt('xlsx');
const folder = args.find((a) => !a.startsWith('--'));

if (!folder) {
  console.log('Usage : node renommer.js <dossier> [--prefix=F-,D-] [--garder=petit|gros] [--xlsx=liste.xlsx] [--apply]');
  process.exit(1);
}
if (!['petit', 'gros'].includes(garder)) {
  console.error('--garder doit valoir "petit" ou "gros".');
  process.exit(1);
}
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error(`Dossier introuvable : ${folder}`);
  process.exit(1);
}

console.log(apply ? '=== MODE APPLICATION ===' : '=== SIMULATION (ajoutez --apply pour exécuter) ===');
const { lignes, stats } = traiter(folder, { prefixes, apply, garder });

for (const l of lignes) {
  if (l.type === 'unchanged') continue;
  const cible = l.cible ? `  ->  ${l.cible}` : '';
  console.log(`${libelle(l.type, apply).toUpperCase().padEnd(11)} ${l.source}${cible}${l.detail ? `   [${l.detail}]` : ''}`);
}

console.log(
  `\nTerminé : ${stats.renommes} renommé(s), ${stats.supprimes} supprimé(s), ` +
  `${stats.conflits} conflit(s), ${stats.inchanges} inchangé(s), ${stats.erreurs} erreur(s).`
);
if (!apply) console.log('Aucune modification effectuée (simulation).');

if (xlsx) {
  fs.writeFileSync(xlsx, genererXlsx(lignes, { apply, folder: path.resolve(folder) }));
  console.log(`Liste exportée : ${path.resolve(xlsx)}`);
}