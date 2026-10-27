#!/usr/bin/env node
/**
 * Renommeur de fichiers avec interface (Node.js, sans dépendance).
 * Nécessite renommer-core.js dans le même dossier.
 *
 * Lancement :  node renommer-gui.js
 * -> ouvre automatiquement http://localhost:3210 dans le navigateur.
 * Le serveur n'écoute que sur votre machine (127.0.0.1).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { traiter, genererXlsx } = require('./renommer-core');

const PORT = 3210;
let dernier = null; // dernier résultat (aperçu ou application), utilisé pour l'export Excel

function listerDossiers(p) {
  const dossier = path.resolve(p || os.homedir());
  const sous = fs.readdirSync(dossier, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'fr'));
  const parent = path.dirname(dossier);
  return { path: dossier, parent: parent !== dossier ? parent : null, dirs: sous };
}

// ---------- Page HTML ----------
const HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Renommeur de fichiers</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, Segoe UI, Roboto, sans-serif; background:#f5f6f8; color:#1f2430; }
  main { max-width: 980px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 22px; margin: 0 0 16px; }
  .card { background:#fff; border:1px solid #d9dce3; border-radius:10px; padding:16px; margin-bottom:16px; }
  label { display:block; font-weight:600; margin-bottom:6px; font-size:14px; }
  .info { color:#6b7280; font-size:13px; margin-top:4px; }
  input[type=text] { width:100%; padding:9px 10px; border:1px solid #d9dce3; border-radius:6px; font-size:14px; }
  .row { display:flex; gap:8px; }
  button { padding:9px 16px; border-radius:6px; border:1px solid #d9dce3; background:#fff; cursor:pointer; font-size:14px; }
  button:hover { background:#f0f2f6; }
  button.primary { background:#2563eb; border-color:#2563eb; color:#fff; }
  button.primary:hover { background:#1d4ed8; }
  button.danger { background:#b91c1c; border-color:#b91c1c; color:#fff; }
  button.danger:hover { background:#991b1b; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
  .browser { margin-top:10px; border:1px solid #d9dce3; border-radius:6px; max-height:200px; overflow:auto; }
  .browser div { padding:6px 10px; cursor:pointer; font-size:14px; border-bottom:1px solid #eef0f4; }
  .browser div:hover { background:#eef3ff; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { text-align:left; padding:7px 8px; border-bottom:1px solid #eef0f4; vertical-align:top; word-break:break-word; }
  th { color:#6b7280; font-weight:600; font-size:13px; }
  .tag { display:inline-block; padding:1px 8px; border-radius:99px; font-size:12px; font-weight:600; }
  .t-rename { background:#dcfce7; color:#15803d; }
  .t-replace { background:#fef3c7; color:#b45309; }
  .t-delete { background:#fee2e2; color:#b91c1c; }
  .t-conflict { background:#e5e7eb; color:#374151; }
  .t-error { background:#fee2e2; color:#b91c1c; }
  .resume { font-weight:600; margin-bottom:10px; }
  .msg-err { color:#b91c1c; margin-top:10px; font-size:14px; }
  .small { font-size:12px; color:#6b7280; }
  header { background:#2563eb; color:#fff; padding:16px 0; text-align:center; font-size:18px; font-weight:600 }
  footer { font-size:16px; color:#6b7280; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; padding: 1.5rem 1.5rem; width: 100%; text-indent: 1.25rem; }
  footer a { color:#2563eb; text-decoration:none; }
  footer a:hover { text-decoration:underline; }
  .head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:10px; }
</style>
</head>
<body>
<header>
Renommeur de fichiers
</header>
<main>

  <div class="card">
    <label class="t" for="folder">Dossier à traiter</label>
    <div class="row">
      <input type="text" id="folder" placeholder="Collez ou saisissez le chemin du dossier">
      <button id="btnBrowse" type="button">Parcourir…</button>
    </div>
    <div id="browser" class="browser" style="display:none"></div>

    <div style="margin-top:14px">
      <label class="t" for="prefix">Préfixes à enlever (séparés par des virgules)</label>
      <input type="text" id="prefix" placeholder="F-, D-, T-, spec-">
      <div class="info">Laisser vide = aucun préfixe enlevé (seuls le « _ », les accents et les apostrophes sont traités).</div>
    </div>

    <div style="margin-top:14px" class="radios">
      <label class="t">Si le nom cible existe déjà et que les tailles sont différentes</label>
      <label><input type="radio" name="garder" value="petit" checked> Supprimer le plus gros, garder le plus petit</label>
      <label><input type="radio" name="garder" value="gros"> Garder le plus gros, supprimer le plus petit</label>
      <div class="info">À taille égale, le fichier le plus ancien est supprimé et le plus récent est conservé (date de modification).</div>
    </div>

    <div class="actions">
      <button class="primary" id="btnPreview" type="button">Aperçu</button>
      <button class="danger" id="btnApply" type="button" disabled>Appliquer les changements</button>
    </div>
    <div id="err" class="msg-err"></div>
  </div>

  <div class="card" id="resultCard" style="display:none">
    <div class="head">
      <div class="resume" id="resume"></div>
      <button id="btnXlsx" type="button">Exporter la liste en Excel (.xlsx)</button>
    </div>
    <table>
      <thead><tr><th style="width:110px">Action</th><th>Fichier</th><th style="width:90px">Taille (o)</th><th>Nouveau nom</th><th>Détail</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
    <div class="small" id="note" style="margin-top:10px"></div>
  </div>
</main>
<footer>
  <p>Créer en octobre 2026</p>
  <a href="http://nelly.babin.free.fr/cv/index.html" target="_blank">Développé par Nelly BABIN</a>
</footer>

<script>
const $ = (id) => document.getElementById(id);
const L_APPLY = { rename:'Renommé', delete:'Supprimé', conflict:'Conflit', error:'Erreur', unchanged:'Inchangé' };
const L_PREVIEW = { rename:'À renommer', delete:'À supprimer', conflict:'Conflit', error:'Erreur', unchanged:'Inchangé' };

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function api(url, body) {
  const r = await fetch(url, body ? { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) } : undefined);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Erreur');
  return data;
}

function prefixes() {
  const v = $('prefix').value.trim();
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null;
}
function garder() { return document.querySelector('input[name=garder]:checked').value; }

async function ouvrirNavigateur(p) {
  try {
    const d = await api('/api/ls?path=' + encodeURIComponent(p || ''));
    const b = $('browser');
    b.style.display = 'block';
    b.innerHTML = '';
    const cur = document.createElement('div');
    cur.innerHTML = '<b>Utiliser ce dossier :</b> ' + esc(d.path);
    cur.onclick = () => { $('folder').value = d.path; b.style.display = 'none'; invalider(); };
    b.appendChild(cur);
    if (d.parent) {
      const up = document.createElement('div');
      up.textContent = '↑ Dossier parent';
      up.onclick = () => ouvrirNavigateur(d.parent);
      b.appendChild(up);
    }
    d.dirs.forEach((n) => {
      const el = document.createElement('div');
      el.textContent = '📁 ' + n;
      el.onclick = () => ouvrirNavigateur(d.path + (d.path.endsWith('/') || d.path.endsWith('\\\\') ? '' : '/') + n);
      b.appendChild(el);
    });
  } catch (e) { $('err').textContent = e.message; }
}

function invalider() { $('btnApply').disabled = true; }

async function lancer(apply) {
  $('err').textContent = '';
  const folder = $('folder').value.trim();
  if (!folder) { $('err').textContent = 'Indiquez un dossier.'; return; }
  try {
    const res = await api('/api/run', { folder, prefixes: prefixes(), garder: garder(), apply });
    const s = res.stats;
    const labels = apply ? L_APPLY : L_PREVIEW;
    const modifs = res.lignes.filter((l) => l.type !== 'unchanged');
    $('resultCard').style.display = 'block';
    $('resume').textContent = (apply ? 'Terminé : ' : 'Aperçu : ') +
      s.renommes + ' renommé(s), ' + s.supprimes + ' supprimé(s), ' + s.conflits + ' conflit(s), ' +
      s.inchanges + ' inchangé(s), ' + s.erreurs + ' erreur(s)';
    $('rows').innerHTML = modifs.map((l) =>
      '<tr><td><span class="tag t-' + l.type + '">' + labels[l.type] + '</span></td><td>' + esc(l.source) +
      '</td><td class="num">' + l.taille + '</td><td>' + esc(l.cible) + '</td><td>' + esc(l.detail) + '</td></tr>').join('') ||
      '<tr><td colspan="5">Rien à modifier.</td></tr>';
    $('note').textContent = (apply ? 'Les changements ont été appliqués. ' : 'Aucun fichier n\\'a été modifié (aperçu). ') +
      'L\\'export Excel contient tous les fichiers du dossier (' + res.lignes.length + '), y compris les inchangés.';
    $('btnApply').disabled = apply || modifs.length === 0;
  } catch (e) { $('err').textContent = e.message; }
}

$('btnBrowse').onclick = () => ouvrirNavigateur($('folder').value.trim());
$('btnPreview').onclick = () => lancer(false);
$('btnApply').onclick = () => {
  const msg = garder() === 'gros'
    ? 'Appliquer les changements ? En cas de doublon, le fichier le plus PETIT sera supprimé (irréversible).'
    : 'Appliquer les changements ? En cas de doublon, le fichier le plus GROS sera supprimé (irréversible).';
  if (confirm(msg)) lancer(true);
};
$('btnXlsx').onclick = () => { window.location = '/api/export.xlsx'; };
['folder', 'prefix'].forEach((id) => $(id).addEventListener('input', invalider));
document.querySelectorAll('input[name=garder]').forEach((r) => r.addEventListener('change', invalider));
</script>
</body>
</html>`;

// ---------- Serveur ----------
function lireCorps(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function dateDuJour() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(HTML);
    }
    if (req.method === 'GET' && url.pathname === '/api/ls') {
      return json(res, 200, listerDossiers(url.searchParams.get('path')));
    }
    if (req.method === 'POST' && url.pathname === '/api/run') {
      const { folder, prefixes, garder, apply } = await lireCorps(req);
      if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
        return json(res, 400, { error: 'Dossier introuvable : ' + folder });
      }
      const resultat = traiter(folder, {
        prefixes: Array.isArray(prefixes) ? prefixes : null,
        garder: garder === 'gros' ? 'gros' : 'petit',
        apply: !!apply,
      });
      dernier = { folder: path.resolve(folder), apply: !!apply, lignes: resultat.lignes };
      return json(res, 200, resultat);
    }
    if (req.method === 'GET' && url.pathname === '/api/export.xlsx') {
      if (!dernier) return json(res, 400, { error: 'Lancez d\'abord un aperçu.' });
      const buf = genererXlsx(dernier.lignes, { apply: dernier.apply, folder: dernier.folder });
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="liste-fichiers-${dateDuJour()}.xlsx"`,
        'Content-Length': buf.length,
      });
      return res.end(buf);
    }
    res.writeHead(404); res.end('Not found');
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Le port ${PORT} est déjà utilisé (l'outil est peut-être déjà lancé).`);
  else console.error(e.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  const adresse = `http://localhost:${PORT}`;
  console.log(`Renommeur lancé : ${adresse}  (Ctrl+C pour arrêter)`);
  const cmd = process.platform === 'win32' ? `start "" ${adresse}`
    : process.platform === 'darwin' ? `open ${adresse}` : `xdg-open ${adresse}`;
  exec(cmd, () => {});
});