# Renommeur de fichiers

Petit utilitaire Node.js pour nettoyer les noms de fichiers d'un dossier, avec une interface web locale ou en ligne de commande.

| Fichier | Rôle |
|---|---|
| `renommer-gui.js` | Version avec interface web locale (s'ouvre dans le navigateur) |
| `renommer.js` | Version en ligne de commande |
| `renommer-core.js` | Logique commune (obligatoire, à garder dans le même dossier que les deux autres) |

Aucune dépendance à installer.

## Prérequis

- [Node.js](https://nodejs.org) (version 18 ou plus récent recommandé)

Pour vérifier l'installation : `node --version`

## Ce que fait l'outil

Pour chaque fichier du dossier choisi (l'extension est toujours conservée) :

1. **Supprime un préfixe** (`F-`, `D-`, `T-`, `spec-`…), si une liste de préfixes est fournie.
   N'importe quel texte convient comme préfixe. Si plusieurs correspondent, le plus long est retenu.
   Sans liste de préfixes, cette étape est ignorée : les autres règles s'appliquent quand même (`Café_v2.txt` devient `Cafe.txt`).
2. **Supprime tout ce qui suit le premier `_`** (le `_` est supprimé aussi).
3. **Retire les accents** : `é è ê ë à â ù û ô î ï` deviennent `e e e e a a u u o i i`, `ç` devient `c`, `œ` devient `oe`, `æ` devient `ae`.
4. **Remplace les apostrophes par un espace** (`'` et `’`).
5. **Vérifie si le nom cible existe déjà** avant de renommer. Si oui, selon le mode choisi :
   - **Supprimer le plus gros** (mode par défaut) : le fichier le plus gros est supprimé, le plus petit est conservé sous le nom cible.
   - **Garder le plus gros** : le fichier le plus petit est supprimé, le plus gros est conservé sous le nom cible.
   - Dans les deux cas, à **taille égale**, le fichier le **plus ancien** (date de modification) est supprimé et le plus récent est conservé. Si la date est aussi identique, rien n'est supprimé et le conflit est signalé.

### Exemples

| Avant | Après |
|---|---|
| `Café_v2.txt` (sans préfixe) | `Cafe.txt` |
| `F-Café_v2.txt` (préfixe `F-`) | `Cafe.txt` |
| `spec-Rapport_v3.doc` (préfixe `spec-`) | `Rapport.doc` |
| `D-L'été_old.pdf` (préfixe `D-`) | `L ete.pdf` |

## Utilisation

### Version avec interface

```
node renommer-gui.js
```

Une page s'ouvre dans le navigateur (`http://localhost:3210`). Si ce n'est pas le cas, ouvrez cette adresse manuellement.

1. Choisissez le dossier (chemin collé ou bouton « Parcourir… »).
2. Saisissez éventuellement les préfixes à enlever, séparés par des virgules (`F-, D-, T-, spec-`). Champ vide = aucun préfixe enlevé.
3. Choisissez le mode si le nom existe déjà : supprimer le plus gros (défaut) ou garder le plus gros.
4. Cliquez sur **Aperçu** pour voir ce qui sera fait, sans rien modifier.
5. Cliquez sur **Appliquer les changements** et confirmez.
6. Cliquez sur **Exporter la liste en Excel (.xlsx)** pour télécharger la liste (voir plus bas).

Pour arrêter l'outil : `Ctrl+C` dans le terminal.

Le serveur n'écoute que sur `127.0.0.1` : il n'est pas accessible depuis le réseau.

### Version ligne de commande

```
node renommer.js <dossier>                                    # simulation, rien n'est modifié
node renommer.js <dossier> --apply                            # applique les changements
node renommer.js <dossier> --prefix=F-,D-,T-,spec- --apply    # avec une liste de préfixes
node renommer.js <dossier> --garder=gros --apply              # garder le plus gros en cas de doublon
node renommer.js <dossier> --xlsx=liste.xlsx                  # exporter la liste en Excel
```

| Option | Rôle |
|---|---|
| `--prefix=F-,D-,T-,spec-` | Préfixes à enlever (séparés par des virgules). Sans cette option, aucun préfixe n'est enlevé. |
| `--garder=petit` ou `--garder=gros` | En cas de doublon : `petit` (défaut) supprime le plus gros, `gros` supprime le plus petit. |
| `--xlsx=liste.xlsx` | Écrit la liste des fichiers dans un fichier Excel. |
| `--apply` | Exécute réellement les changements. Sans cette option, c'est un simple aperçu. |

### Depuis VS Code

1. *Fichier → Ouvrir le dossier…* et choisir le dossier contenant les scripts.
2. Ouvrir le terminal intégré (`Ctrl+ù`).
3. Lancer `node renommer-gui.js` (ou `node renommer.js ...`).

## Export Excel

Le fichier `.xlsx` contient **tous les fichiers du dossier** (y compris les inchangés), avec les colonnes :

| Colonne | Contenu |
|---|---|
| Fichier d'origine | Nom du fichier avant traitement |
| Taille (octets) | Taille du fichier |
| Nouveau nom | Nom après traitement (vide si le fichier est supprimé) |
| Action | Renommé, Supprimé, Conflit, Erreur, Inchangé (« À renommer » / « À supprimer » si c'est un aperçu) |
| Détail | Explication (fichier remplacé, comparaison des tailles, message d'erreur) |
| Dossier | Chemin du dossier traité |

L'export reflète le dernier traitement effectué (aperçu ou application). La première ligne est figée et des filtres sont activés.

## Précautions

- **L'outil peut supprimer des fichiers**, et la suppression est définitive (pas de corbeille). Faites une copie du dossier avant le premier essai.
- Lancez toujours l'**aperçu** avant d'appliquer, et vérifiez le mode choisi (garder le plus petit ou le plus gros).
- Dans l'interface, le nom des fichiers inchangés n'est pas affiché dans le tableau (ils figurent dans l'export Excel).
- La comparaison des noms ignore la casse (`CAFE.txt` et `cafe.txt` sont considérés comme le même nom).
- Les **sous-dossiers ne sont pas traités** : seuls les fichiers du dossier indiqué le sont.
- Si le nettoyage produit un nom vide, le fichier est laissé tel quel.

## Dépannage

| Problème | Solution |
|---|---|
| `node` n'est pas reconnu | Installer Node.js, puis rouvrir le terminal. |
| `Cannot find module './renommer-core'` | Mettre `renommer-core.js` dans le même dossier que `renommer.js` et `renommer-gui.js`. |
| Le port 3210 est déjà utilisé | L'outil est probablement déjà lancé dans un autre terminal : fermez-le ou ouvrez `http://localhost:3210`. |
| La page ne s'ouvre pas toute seule | Ouvrir manuellement `http://localhost:3210` dans le navigateur. |
| Erreur de permission sur un fichier | Fermer le fichier dans l'application qui l'utilise, ou vérifier les droits du dossier. |

Pour changer de port, modifier la constante `PORT` en haut de `renommer-gui.js`.