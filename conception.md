# 📑 Conception technique – Renommeur de fichiers 📑

## 1. 📝 Présentation du projet

Le Renommeur de fichiers est un utilitaire développé en **Node.js**, destiné à automatiser le nettoyage et l'uniformisation des noms de fichiers dans un dossier.

Le projet propose deux modes d'utilisation complémentaires :

- **Une interface web locale**, accessible depuis un navigateur, pour sélectionner un dossier, paramétrer les règles de traitement et visualiser les résultats.
- **Une interface en ligne de commande (CLI)**, permettant de lancer directement les opérations à partir d'un terminal.

L'application a été conçue sans dépendance externe. Elle s'appuie exclusivement sur les modules natifs de Node.js et sur les technologies web standards.

La logique métier est centralisée dans un module commun afin de garantir un comportement identique, quel que soit le mode d'utilisation.

## 2. 🚀 Objectifs et fonctionnalités

L'objectif principal est de simplifier le nettoyage de fichiers tout en conservant une maîtrise des opérations réalisées.

Les principales fonctionnalités sont :

- Suppression de préfixes personnalisables.
- Uniformisation des noms de saisons et d'épisodes.
- Suppression des suffixes situés après le premier caractère `_`.
- Nettoyage des points de suspension et des apostrophes.
- Suppression des accents et normalisation des caractères.
- Détection des doublons et comparaison des fichiers selon leur taille et leur date de modification.
- Simulation des modifications avant leur application.
- Liste détaillée des fichiers présents dans un dossier.
- Export des listes et des résultats au format Excel (`.xlsx`).

Le traitement est limité aux fichiers directement présents dans le dossier sélectionné : les sous-dossiers ne sont pas parcourus.

## 3. 🛠️ Architecture technique

Le projet repose sur une architecture volontairement simple, organisée autour de trois fichiers JavaScript.

| Fichier | Responsabilité |
|---|---|
| `renommer-core.js` | Centralisation des règles métier, traitement des fichiers et génération des exports Excel |
| `renommer-gui.js` | Serveur HTTP local et interface web |
| `renommer.js` | Interface en ligne de commande |

Cette organisation permet de séparer les responsabilités :

- Le cœur métier ne dépend pas de l'interface utilisée.
- Les deux interfaces sollicitent les mêmes fonctions de traitement.
- Les règles de renommage et de gestion des doublons sont définies à un seul endroit.

Le module commun expose ses fonctions avec `module.exports`, puis les interfaces les utilisent grâce au système de modules CommonJS de Node.js.

Cette séparation facilite la maintenance et évite de dupliquer les traitements.

## 4. 💡 Fonctionnement du traitement

### 4.1. Normalisation des noms de fichiers

La fonction `nouveauNom()` du fichier `renommer-core.js` centralise l'ensemble des règles de transformation.

Le traitement est effectué par étapes successives :

1. Identification et conservation de l'extension.
2. Suppression éventuelle d'un préfixe.
3. Uniformisation des indications de saisons et d'épisodes.
4. Suppression de la partie située après le premier `_`.
5. Nettoyage des points de suspension.
6. Remplacement des caractères accentués.
7. Remplacement des apostrophes et normalisation des espaces.

L'ordre des opérations est important : certaines transformations doivent être effectuées avant d'autres pour préserver les informations utiles du nom d'origine.

**Exemple de code – Normalisation des saisons et épisodes**

Fichier : `renommer-core.js`, fonction `nouveauNom()`.

```javascript
base = base.normalize('NFC')
  .replace(/(^|\s)(?:-\s*)?saison\s*(\d+)\s*[eé]pisode\s*(\d+)/gi,
    (m, avant, s, e) =>
      `${avant}saison ${parseInt(s, 10)} ep ${parseInt(e, 10)}`)
  .replace(/(^|\s)(?:-\s*)?[eé]pisode\s*(\d+)/gi,
    (m, avant, e) =>
      `${avant}ep ${parseInt(e, 10)}`)
  .replace(/(^|\s)(?:-\s*)?S(\d{1,2})E(\d{1,3})(?!\d)/gi,
    (m, avant, s, e) =>
      `${avant}saison ${parseInt(s, 10)} ep ${parseInt(e, 10)}`);
```

Cet extrait illustre plusieurs techniques JavaScript :

- `normalize('NFC')` harmonise la représentation Unicode des caractères avant leur traitement.
- Les expressions régulières permettent de reconnaître plusieurs formats d'écriture.
- Les indicateurs `gi` rendent les recherches insensibles à la casse et applicables à l'ensemble de la chaîne.
- Les fonctions de remplacement permettent de reconstruire le texte à partir des groupes capturés.
- `parseInt()` supprime les zéros non significatifs des numéros de saison et d'épisode.

**Exemple :**

| Nom initial | Nom normalisé |
|---|---|
| `Serie - Saison 1 Épisode 05.mkv` | `Serie saison 1 ep 5.mkv` |
| `Serie - S01E15.mkv` | `Serie saison 1 ep 15.mkv` |

La normalisation des accents utilise ensuite `normalize('NFD')`, qui décompose les caractères accentués, puis une expression régulière supprime les signes diacritiques.

Une dernière vérification empêche la création d'un nom vide : si toutes les transformations ont supprimé le contenu du nom, le nom d'origine est conservé.

### 4.2. Gestion des doublons avec les collections Map

Lors du traitement d'un dossier, il est nécessaire de suivre l'état des fichiers au fur et à mesure des opérations.

Pour cela, le projet utilise plusieurs objets `Map` :

- `etat` : associe chaque nom de fichier à sa taille.
- `dates` : associe chaque nom à sa date de modification.
- `rows` : conserve les informations du rapport pour chaque fichier d'origine.

**Exemple de code – Initialisation de l'état du traitement**

Fichier : `renommer-core.js`, fonction `traiter()`.

```javascript
const etat = new Map();
const dates = new Map();
const rows = new Map();

for (const e of fs.readdirSync(folder, { withFileTypes: true })) {
  if (!e.isFile()) continue;

  const st = fs.statSync(path.join(folder, e.name));

  etat.set(e.name, st.size);
  dates.set(e.name, st.mtimeMs);

  rows.set(e.name, {
    type: 'unchanged',
    source: e.name,
    taille: st.size,
    cible: e.name,
    detail: ''
  });
}
```

L'utilisation de `Map` permet de conserver une structure de données associant directement chaque fichier à ses caractéristiques.

Ces collections sont ensuite mises à jour à chaque renommage ou suppression. Elles représentent ainsi l'état théorique du dossier pendant toute la durée du traitement.

Cette approche est particulièrement utile pour détecter les collisions entre plusieurs fichiers, y compris lorsque des opérations précédentes ont déjà modifié les noms.

### 4.3. Détection et résolution des doublons

Avant de renommer un fichier, le programme vérifie si le nom cible existe déjà.

La comparaison ignore la casse afin de considérer, par exemple, `CAFE.txt` et `cafe.txt` comme des noms équivalents.

Lorsque deux fichiers entrent en collision, leur taille est comparée.

Deux modes sont disponibles :

- **Garder le plus petit** : le fichier le plus gros est supprimé.
- **Garder le plus gros** : le fichier le plus petit est supprimé.

À taille égale, le fichier le plus ancien est supprimé et le plus récent est conservé.

Si la taille et la date de modification sont toutes les deux identiques, le programme signale un conflit et ne supprime aucun des deux fichiers.

**Exemple de code – Détermination du fichier à conserver**

```javascript
const supprimerExistant = tailleDiff
  ? (gardeLePlusGros
      ? tailleExistant < tailleSrc
      : tailleExistant > tailleSrc)
  : dateExistant < dateSrc;
```

Cette condition applique une règle de décision en deux temps :

1. Comparaison des tailles, selon le mode sélectionné.
2. Si les tailles sont identiques, comparaison des dates de modification.

La règle est centralisée dans le cœur métier afin de garantir le même comportement depuis l'interface web et la ligne de commande.

### 4.4. Séparation entre simulation et exécution réelle

Une précaution importante du projet consiste à distinguer la simulation du traitement de son application effective.

La fonction `traiter()` reçoit une option `apply` :

- `apply: false` : le programme calcule les opérations à effectuer, sans modifier les fichiers.
- `apply: true` : les renommages et suppressions sont réellement exécutés.

**Exemple de code – Exécution conditionnelle**

```javascript
if (!existant) {
  if (apply) {
    fs.renameSync(
      path.join(folder, nom),
      path.join(folder, cible)
    );
  }

  etat.delete(nom);
  etat.set(cible, tailleSrc);
}
```

La simulation utilise les mêmes règles de décision que l'exécution réelle. Seules les opérations physiques sur le système de fichiers sont conditionnées par `apply`.

Cette séparation permet de présenter un aperçu avant toute modification et de limiter les erreurs de manipulation.

Les suppressions étant définitives, l'application recommande également de réaliser une copie du dossier avant le premier traitement.

## 5. 🖥️ Interface web et communication HTTP

### 5.1. Serveur local Node.js

Le fichier `renommer-gui.js` intègre un serveur HTTP développé avec le module natif `http` de Node.js.

Le serveur écoute sur l'adresse locale `127.0.0.1`, sur le port `3210`.

L'interface est directement intégrée au script sous forme de HTML, CSS et JavaScript natif. Aucun framework front-end ni serveur applicatif supplémentaire n'est nécessaire.

L'utilisateur lance simplement :

```bash
node renommer-gui.js
```

Le navigateur est ensuite ouvert sur l'adresse locale de l'application.

Le serveur n'étant lié qu'à `127.0.0.1`, l'interface n'est pas exposée aux autres machines du réseau local.

### 5.2. Communication entre l'interface et le serveur

L'interface communique avec le serveur au moyen de requêtes HTTP et de l'API `fetch()` du navigateur.

Les échanges de données utilisent le format JSON pour les opérations de consultation et de traitement.

Les principales routes de l'application sont :

| Route | Fonction |
|---|---|
| `/` | Affichage de l'interface |
| `/api/ls` | Consultation et navigation dans les dossiers |
| `/api/run` | Simulation ou application du traitement |
| `/api/files` | Liste des fichiers d'un dossier |
| `/api/files.xlsx` | Export Excel de la liste des fichiers |
| `/api/export.xlsx` | Export Excel du résultat du traitement |

Cette organisation permet de conserver une séparation entre la présentation de l'interface et les opérations effectuées sur le système de fichiers.

Les réponses du serveur sont exploitées par le JavaScript côté navigateur pour mettre à jour les tableaux, les compteurs et les résultats affichés.

## 6. 🧩 Génération des fichiers Excel sans bibliothèque externe

### 6.1. Construction du format XLSX

Une particularité technique du projet est la génération des fichiers Excel sans utiliser de bibliothèque spécialisée.

Le format `.xlsx` repose sur le standard Office Open XML (OOXML). Il s'agit d'une archive ZIP contenant plusieurs fichiers XML décrivant notamment :

- Le classeur et ses feuilles.
- Les données des cellules.
- Les styles.
- Les relations entre les différents éléments.

Le projet construit directement ces fichiers XML, puis les regroupe dans une archive ZIP.

La fonction `construireXlsx()` génère les cellules, les lignes, les largeurs de colonnes, les filtres et la mise en forme de l'en-tête.

### 6.2. Compression ZIP et calcul CRC32

La construction de l'archive repose sur deux techniques complémentaires :

- La compression des fichiers XML avec le module natif `zlib`.
- Le calcul d'une somme de contrôle CRC32 pour chaque entrée de l'archive.

**Exemple de code – Compression et contrôle d'intégrité**

Fichier : `renommer-core.js`, fonction `zip()`.

```javascript
for (const { name, data } of entries) {
  const nameBuf = Buffer.from(name, 'utf8');

  const comp = zlib.deflateRawSync(data);
  const crc = crc32(data);

  // Construction des en-têtes ZIP
  // puis ajout des données compressées.
}
```

`deflateRawSync()` réalise la compression des données selon l'algorithme DEFLATE.

La fonction `crc32()` calcule une valeur de contrôle à partir du contenu original. Cette valeur est intégrée aux structures de l'archive ZIP afin de permettre la vérification des données.

La fonction `zip()` construit ensuite les en-têtes locaux, le répertoire central et l'enregistrement de fin d'archive.

Cette implémentation permet de produire des fichiers Excel standards tout en conservant une application sans dépendance externe.

### 6.3. Exports disponibles

Deux types d'exports sont proposés :

**Liste des fichiers**

Contient notamment le nom, l'extension, la taille, la date de modification et le dossier d'origine.

**Résultat du traitement**

Présente l'ensemble des fichiers, y compris ceux qui n'ont pas été modifiés, avec leur nom initial, leur nouveau nom éventuel, l'action réalisée et les détails associés.

Les exports sont également accessibles depuis la ligne de commande.

## 7. 🔒 Gestion des erreurs et précautions

Le traitement des fichiers comporte plusieurs mécanismes destinés à limiter les erreurs :

- Vérification de l'existence d'un nom cible avant un renommage.
- Détection des conflits lorsque les fichiers présentent les mêmes caractéristiques.
- Conservation du nom d'origine si la normalisation produit un nom vide.
- Gestion des erreurs individuelles lors des opérations de renommage et de suppression.
- Conservation d'un rapport détaillé pour chaque fichier traité.

Les erreurs rencontrées lors d'une opération sont enregistrées dans le résultat avec leur type et leur message.

Le traitement distingue notamment les fichiers renommés, supprimés, inchangés, en conflit ou en erreur.

La simulation préalable constitue une précaution supplémentaire, particulièrement importante puisque les suppressions ne passent pas par la corbeille du système.

## 8. 🛠️ Choix techniques

Plusieurs choix ont guidé la conception de cet utilitaire.

| Choix | Intérêt |
|---|---|
| Node.js | Accès direct au système de fichiers et exécution multiplateforme |
| Modules natifs (`fs`, `path`, `http`, `zlib`) | Limitation des dépendances et simplification de l'installation |
| Séparation du cœur métier | Mutualisation des règles entre interface web et CLI |
| HTML, CSS et JavaScript natifs | Interface légère, sans framework supplémentaire |
| Collections `Map` | Suivi de l'état des fichiers pendant le traitement |
| Simulation avant application | Contrôle des opérations avant modification réelle |
| Génération OOXML manuelle | Production de fichiers Excel sans bibliothèque spécialisée |
| API HTTP locale | Communication simple entre l'interface et le serveur |

L'ensemble privilégie la simplicité de déploiement, l'autonomie de l'application et la maîtrise des opérations réalisées sur les fichiers.

## 9. 🚀 Évolutions possibles

L'architecture actuelle permet d'envisager plusieurs améliorations :

- Ajout de règles de normalisation personnalisables.
- Possibilité de traiter récursivement les sous-dossiers.
- Ajout d'un mécanisme de sauvegarde ou de restauration des opérations.
- Extension des informations disponibles dans les exports Excel.
- Ajout de tests automatisés pour les règles de normalisation et de gestion des doublons.

Ces évolutions pourraient être intégrées sans remettre en cause la séparation actuelle entre les interfaces et le cœur métier.

## 10. 🎯 Résultat

Ce projet illustre la réalisation d'un utilitaire autonome en Node.js, combinant traitement du système de fichiers, interface web locale et ligne de commande.

Au-delà des fonctionnalités de renommage, sa conception met en œuvre plusieurs techniques intéressantes :

- Organisation modulaire et séparation des responsabilités.
- Traitement de chaînes de caractères avec expressions régulières et normalisation Unicode.
- Gestion dynamique de collections avec `Map`.
- Simulation d'opérations avant leur exécution réelle.
- Communication HTTP entre un navigateur et un serveur local.
- Génération manuelle d'un fichier Excel à partir du standard OOXML et d'une archive ZIP.

L'ensemble aboutit à une application légère, sans dépendance externe, utilisable aussi bien par une interface graphique que depuis un terminal.