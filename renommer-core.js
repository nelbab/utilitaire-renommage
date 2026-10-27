/**
 * Logique commune du renommeur (utilisée par renommer.js et renommer-gui.js).
 * Aucune dépendance : uniquement des modules fournis avec Node.js.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- Calcul du nouveau nom ----------
function nouveauNom(nom, prefixes) {
  const ext = path.extname(nom);
  let base = nom.slice(0, nom.length - ext.length);

  // 1. préfixe (liste vide = aucun préfixe enlevé ; le plus long qui correspond est retenu)
  if (prefixes && prefixes.length) {
    const p = [...prefixes]
      .sort((a, b) => b.length - a.length)
      .find((x) => base.toLowerCase().startsWith(x.toLowerCase()));
    if (p) base = base.slice(p.length);
  }

  // 2. tout ce qu'il y a après le 1er "_"
  const idx = base.indexOf('_');
  if (idx !== -1) base = base.slice(0, idx);

  // 3. accents (é -> e, ç -> c, ...)
  base = base
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  // 4. apostrophes -> espace
  base = base.replace(/['’‘`´]/g, ' ');
  base = base.replace(/\s+/g, ' ').trim();

  if (!base) return nom; // sécurité : jamais de nom vide
  return base + ext;
}

// ---------- Traitement d'un dossier ----------
/**
 * options.prefixes : tableau de préfixes (ou null)
 * options.apply    : true = exécute, false = simulation
 * options.garder   : 'petit' (défaut) = en cas de doublon, supprime le plus gros
 *                    'gros'           = en cas de doublon, garde le plus gros
 *                    (à taille égale : le plus ancien est supprimé, le plus récent conservé)
 * Retourne { lignes, stats } ; "lignes" contient TOUS les fichiers du dossier.
 */
function traiter(folder, options = {}) {
  const { prefixes = null, apply = false, garder = 'petit' } = options;
  const gardeLePlusGros = garder === 'gros';

  const etat = new Map();  // nom -> taille (reflète le dossier au fil des opérations)
  const dates = new Map(); // nom -> date de modification (ms)
  const rows = new Map();  // nom d'origine -> ligne de rapport
  for (const e of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const st = fs.statSync(path.join(folder, e.name));
    const taille = st.size;
    etat.set(e.name, taille);
    dates.set(e.name, st.mtimeMs);
    rows.set(e.name, { type: 'unchanged', source: e.name, taille, cible: e.name, detail: '' });
  }

  const stats = { renommes: 0, supprimes: 0, inchanges: 0, conflits: 0, erreurs: 0 };

  for (const nom of [...etat.keys()].sort()) {
    if (!etat.has(nom)) continue; // déjà supprimé pendant le traitement
    const cible = nouveauNom(nom, prefixes);
    if (cible === nom) continue;

    const row = rows.get(nom);
    const tailleSrc = etat.get(nom);
    const existant = [...etat.keys()].find((k) => k !== nom && k.toLowerCase() === cible.toLowerCase());

    try {
      if (!existant) {
        if (apply) fs.renameSync(path.join(folder, nom), path.join(folder, cible));
        etat.delete(nom); etat.set(cible, tailleSrc);
        dates.set(cible, dates.get(nom)); dates.delete(nom);
        row.type = 'rename'; row.cible = cible;
        stats.renommes++;
        continue;
      }

      const tailleExistant = etat.get(existant);
      const dateSrc = dates.get(nom);
      const dateExistant = dates.get(existant);
      const tailleDiff = tailleExistant !== tailleSrc;

      if (!tailleDiff && dateExistant === dateSrc) {
        row.type = 'conflict'; row.cible = cible;
        row.detail = `« ${existant} » existe déjà avec la même taille (${tailleSrc} o) et la même date : ignoré`;
        stats.conflits++;
        continue;
      }

      // Règle : on compare d'abord les tailles (selon le mode choisi) ;
      // à taille égale, on supprime le plus ancien et on garde le plus récent.
      const supprimerExistant = tailleDiff
        ? (gardeLePlusGros ? tailleExistant < tailleSrc : tailleExistant > tailleSrc)
        : dateExistant < dateSrc;
      const qualExistant = tailleDiff
        ? (tailleExistant > tailleSrc ? 'plus gros' : 'plus petit')
        : (dateExistant < dateSrc ? 'plus ancien' : 'plus récent');
      const qualSrc = tailleDiff
        ? (tailleSrc > tailleExistant ? 'plus gros' : 'plus petit')
        : (dateSrc < dateExistant ? 'plus ancien' : 'plus récent');
      const expl = (q, autreTaille) => (tailleDiff ? `${q} que ${autreTaille} o` : `${q}, même taille`);

      if (supprimerExistant) {
        if (apply) {
          fs.unlinkSync(path.join(folder, existant));
          fs.renameSync(path.join(folder, nom), path.join(folder, cible));
        }
        etat.delete(existant); etat.delete(nom); etat.set(cible, tailleSrc);
        dates.delete(existant); dates.set(cible, dateSrc); dates.delete(nom);
        row.type = 'rename'; row.cible = cible;
        row.detail = `remplace « ${existant} » (${tailleExistant} o, ${expl(qualExistant, tailleSrc)})`;
        const rowExistant = rows.get(existant);
        if (rowExistant) {
          rowExistant.type = 'delete'; rowExistant.cible = '';
          rowExistant.detail = `${expl(qualExistant, tailleSrc)} : « ${nom} » prend son nom`;
        }
        stats.supprimes++; stats.renommes++;
      } else {
        if (apply) fs.unlinkSync(path.join(folder, nom));
        etat.delete(nom); dates.delete(nom);
        row.type = 'delete'; row.cible = existant;
        row.detail = `${expl(qualSrc, tailleExistant)} : « ${existant} » est conservé`;
        stats.supprimes++;
      }
    } catch (e) {
      row.type = 'error'; row.cible = cible; row.detail = e.message;
      stats.erreurs++;
    }
  }

  const lignes = [...rows.values()].sort((a, b) => a.source.localeCompare(b.source, 'fr'));
  stats.inchanges = lignes.filter((l) => l.type === 'unchanged').length;
  return { lignes, stats };
}

// ---------- Libellés ----------
function libelle(type, apply) {
  const L = apply
    ? { rename: 'Renommé', delete: 'Supprimé', conflict: 'Conflit', error: 'Erreur', unchanged: 'Inchangé' }
    : { rename: 'À renommer', delete: 'À supprimer', conflict: 'Conflit', error: 'Erreur', unchanged: 'Inchangé' };
  return L[type] || type;
}

// ---------- Export Excel (.xlsx) sans dépendance ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const parts = [];
  const centraux = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centraux.push(central, nameBuf);

    offset += local.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entries.length, 8);
  fin.writeUInt16LE(entries.length, 10);
  fin.writeUInt32LE(cd.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, fin]);
}

function xml(s) {
  return String(s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colonne(i) { return String.fromCharCode(65 + i); } // A..F

/** Génère un fichier .xlsx (Buffer) avec la liste des fichiers. */
function genererXlsx(lignes, { apply = false, folder = '' } = {}) {
  const entetes = ['Fichier d\'origine', 'Taille (octets)', 'Nouveau nom', 'Action', 'Détail', 'Dossier'];
  const largeurs = [42, 16, 42, 14, 70, 50];

  const cellule = (c, r, v, style) => {
    const ref = colonne(c) + r;
    if (typeof v === 'number') return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  };

  let rowsXml = `<row r="1">${entetes.map((h, c) => cellule(c, 1, h, 1)).join('')}</row>`;
  lignes.forEach((l, i) => {
    const r = i + 2;
    const vals = [l.source, l.taille, l.cible || '', libelle(l.type, apply), l.detail || '', folder];
    rowsXml += `<row r="${r}">${vals.map((v, c) => cellule(c, r, v)).join('')}</row>`;
  });

  const derniere = lignes.length + 1;
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${largeurs.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${rowsXml}</sheetData>` +
    `<autoFilter ref="A1:F${derniere}"/>` +
    '</worksheet>';

  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const entries = [
    { name: '[Content_Types].xml', data: Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>') },
    { name: '_rels/.rels', data: Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>') },
    { name: 'xl/workbook.xml', data: Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Fichiers" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>') },
    { name: 'xl/styles.xml', data: Buffer.from(styles) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
  ];
  return zip(entries);
}

module.exports = { nouveauNom, traiter, libelle, genererXlsx };