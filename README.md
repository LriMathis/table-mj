# Table du MJ — D&D 5e

Table virtuelle pour Donjons & Dragons 5e. Le maître du jeu gère la partie depuis son PC ; les joueurs suivent la carte et jouent leur personnage depuis un navigateur (téléphone, tablette ou ordinateur), en local ou à distance.

- Carte de combat avec grille, pions, brouillard de guerre, règle et signaux
- Suivi du combat : initiative, PV, états, attaques et sorts résolus automatiquement
- Grimoire de 477 sorts en français, montée de niveau guidée pour les 13 classes
- Plusieurs campagnes, bestiaire illustré, journal, sauvegardes automatiques
- Aucune dépendance : Python 3 (bibliothèque standard) et JavaScript sans compilation

## Prérequis

- Python 3.10 ou plus récent
- Linux, macOS ou Windows (les scripts `.sh` sont pour Linux et macOS ; sous Windows, utilisez `python table_mj.py`)

## Démarrage

```bash
git clone git@github.com:LriMathis/table-mj.git
cd table-mj
./lancer_distance.sh
```

| Commande | Usage |
|---|---|
| `./lancer_mj.sh` | MJ seul, sur ce PC |
| `./lancer_reseau.sh` | MJ et joueurs sur le même réseau local |
| `./lancer_distance.sh` | MJ et joueurs par Internet |

Options de `table_mj.py` : `--reseau`, `--distance`, `--port N`, `--donnees DOSSIER`, `--fiches DOSSIER`, `--no-browser`.

- **Interface MJ** : http://127.0.0.1:8765/ (ouverte automatiquement). Elle n'est accessible que depuis le PC du MJ.
- **Vue joueurs** : l'adresse à communiquer s'affiche dans le terminal et dans l'onglet **Carte → Joueurs connectés**.
- Accès direct : `/#combat`, `/#grimoire`… pour un onglet du MJ ; `/joueurs?perso=vex&onglet=sorts` pour la fiche d'un joueur.
- Le serveur s'arrête avec **Ctrl+C**. Laissez le terminal ouvert pendant la partie.

### Réseau local

Les joueurs ouvrent `http://<ip-du-pc>:8765/joueurs`. Si la page ne répond pas, autorisez le port dans le pare-feu : `sudo ufw allow 8765/tcp`.

### Partie à distance

Le serveur tourne sur le PC du MJ ; un tunnel HTTPS gratuit et sans compte le rend joignable depuis Internet.

1. Le MJ lance `./lancer_distance.sh`. Au premier lancement, `cloudflared` est téléchargé dans `outils/` (environ 40 Mo).
2. Une adresse `https://xxxx.trycloudflare.com/joueurs` s'affiche dans le terminal et dans l'onglet Carte, avec un bouton de copie.
3. Les joueurs ouvrent cette adresse dans leur navigateur. Ils n'ont rien à installer.

L'adresse change à chaque lancement. La voix n'est pas gérée : utilisez un outil comme Discord en parallèle.

**Sécurité** : le tunnel pointe vers un port séparé qui ne sert que la vue joueurs. L'interface et l'API du MJ y répondent 403, et toute requête relayée par un proxy est refusée sur l'API du MJ. Si cloudflared n'est pas disponible, le serveur utilise `ssh` et localhost.run en secours ; dans ce mode, les images de plus de 300 Ko environ peuvent ne pas s'afficher.

## Fonctionnalités

### Carte de combat
- Création d'une carte par glisser-déposer d'une image ; grille réglable ou calibrée en traçant une case.
- Pions en médaillon : anneau aux couleurs du camp (bleu pour les PJ, rouge pour les adversaires, or pour les PNJ) et arc de points de vie.
- États affichés en pastilles ; pions morts, cachés et combattant actif clairement signalés.
- Brouillard de guerre peint au pinceau, règle de mesure (diagonale = 1 case), signaux visibles par tous (Alt + clic pour le MJ, appui long pour les joueurs).
- Le MJ choisit la carte montrée aux joueurs et peut leur envoyer son cadrage.

### Combat et sorts
- Grimoire de 477 sorts en français : noms et résumés d'[AideDD](https://www.aidedd.org), mécaniques du SRD 5.1.
- Dégâts selon le niveau d'emplacement ou, pour les tours de magie, selon le niveau du personnage.
- Gestion automatique des rayons multiples, jets de sauvegarde (DD, moitié des dégâts), soins, PV temporaires, concentration et rituels.
- Lancement depuis la fiche ou le panneau de tour : l'emplacement est consommé, puis la cible est choisie.
- Les noms de sorts personnalisés sont reconnus (par exemple « Poigne des morts » pour *Contact glacial*).

### Vue joueurs
- Fiche, actions, sorts, dés, journal et groupe, sur un écran adapté au téléphone.
- En combat, attaques et sorts ne sont possibles qu'à son tour (sauf réactions) ; le joueur est alerté quand son tour arrive.
- Les dés sont lancés par le serveur. Le MJ voit chaque jet et applique les dégâts d'un clic.
- L'état des adversaires est donné qualitativement (blessé, en sang…), jamais en PV exacts.

### Montée de niveau
Assistant en étapes conforme aux règles officielles pour les 13 classes :
1. Points de vie (moyenne, jet ou maximum), aptitudes de classe et sous-classe.
2. Amélioration de caractéristiques ou don (16 dons, effets appliqués).
3. Expertise.
4. Nouveaux sorts et remplacement d'un sort connu.
5. Récapitulatif modifiable.

Possibilité d'enchaîner plusieurs niveaux, d'annuler les 5 derniers passages, ou de laisser les joueurs monter de niveau eux-mêmes.

### Outils du MJ
- Plusieurs campagnes, chacune avec ses personnages, cartes, combats et journal ; bestiaire et images partagés.
- Création de campagne à partir des fiches du dossier `fiches/` ou de personnages d'une autre campagne.
- Diffusion d'un texte ou d'une image sur tous les écrans des joueurs.
- Quêtes et PNJ révélés aux joueurs à la demande ; les notes du MJ ne leur sont jamais envoyées.
- Réglages des joueurs : déplacements, actions, montée de niveau.
- Bestiaire illustré avec fiches cliquables pour lancer les dés.
- 8 thèmes visuels, choisis par chaque appareil.

## Sauvegardes

Tout est enregistré automatiquement dans `donnees/`. Des archives `.zip` sont également créées dans `donnees/sauvegardes-auto/` au démarrage, toutes les 20 minutes en cas de modification et à chaque changement de campagne. Une sauvegarde manuelle est possible depuis l'onglet Campagnes.

Les archives automatiques ne sont pas versionnées dans ce dépôt.

## Structure du projet

```
table_mj.py              point d'entrée
lancer_*.sh              scripts de lancement
serveur/                 serveur HTTP (bibliothèque standard uniquement)
  principal.py           démarrage, sauvegardes automatiques
  web.py                 routes : API du MJ (poste local) et API des joueurs
  distance.py            tunnel pour la partie à distance
  stockage.py            fichiers, campagne active, fusion des modifications
  campagnes.py           gestion des campagnes, import des fiches
  joueurs.py             données filtrées pour les joueurs, jets, attaques, sorts
  regles.py              règles 5e
  des.py                 lanceur de dés
  fiches.py              lecture des fiches texte
web/
  commun/                styles, thèmes, carte, dés, base de sorts
  mj/                    interface du MJ
  joueurs/               interface des joueurs
donnees/                 campagnes, bestiaire et images
fiches/                  fiches de personnages à importer (.txt / .md)
ressources/              portraits et images d'origine
```

## Crédits

- Icônes et portraits des monstres : [game-icons.net](https://game-icons.net) (Lorc, Delapouite, Skoll, Caro Asercion, DarkZaitzev, Carl Olsen), licence [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Sorts : noms et résumés [AideDD](https://www.aidedd.org), mécaniques SRD 5.1 ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
- Partie à distance : [cloudflared](https://github.com/cloudflare/cloudflared) (Cloudflare Quick Tunnels).
