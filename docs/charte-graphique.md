# Charte graphique

Pixel-art en relief. Une seule source : `src/shared/theme.css`, importée par le menu, le carnet, les
connexions et la bulle de Gilbert. `npm run check:theme` refuse toute couleur ou taille de texte écrite en dur
ailleurs.

## Couleurs (huit, plus l'or des glands)

| Nom | Valeur | Usage |
|---|---|---|
| `--ink` | `#1f1b16` | texte, contours, bouton sombre, rail des onglets |
| `--bg` | `#ecdfc4` | fond du panneau : un crème chaud |
| `--card` | `#fbf5e6` | cartes, bulles |
| `--white` | `#fffdf7` | champs de saisie |
| `--line` | `#cfbd9a` | filets, contours discrets |
| `--muted` | `#6d5e48` | texte secondaire |
| `--accent` | `#e8743b` | l'orange de son « ! » : ce qui se fait |
| `--good` / `--danger` | `#4c8a45` / `#b8402e` | branché, réussi / supprimer, erreur, en retard |
| `--gold*` | | réservé aux glands (le bouton de récompense) |

## La grille de pixels

Tout le menu est dessiné avec **un seul pixel : 2 px**. Vérifié par mesure (`scripts/audit-pixels.js`, sur les huit
pages) : une seule taille de texte, aucune mesure impaire, aucun angle arrondi, aucun contrôle natif.

- **Texte** : une seule taille. Jersey 10 est dessinée avec un pixel de 1/9,1 em (mesuré) : à **18 px**, le pixel fait
  2 px. En vietnamien (VT323, pixel de 1/11 em) : 22 px. Hauteur de ligne : 24 px (26 en vietnamien). Pas de gros
  titres : la hiérarchie vient du repère (carré orange, barre devant le titre de page), de la couleur et de l'espace.
- **Icônes du rail** : Pixelarticons (MIT), à **24 px**. Seules sont retenues celles dont tous les traits tombent sur une
  grille de 2 px (test de rastérisation : on les ramène à 12 × 12 sans perte) ; le décalage éventuel est corrigé dans
  `icons.ts` (`SHIFT`). Les petites icônes (plus, corbeille, copier, cadenas, croix) sont dessinées à la main sur une
  grille de 2 px (`TINY`). Les cases à cocher sont dessinées aussi (la case native est arrondie).
- **Gilbert** dans la boutique : pixels de 2 px (sa tête dans le rail : 32 px pour 16 cases). Sur le bureau, c'est lui le
  personnage : ses pixels font 2, 4 ou 6 px selon sa taille (Petit, Moyen, Grand), et ses objets (les glands qui
  tombent) ont les siens.
- **Contours** : 2 px pour les blocs, bulles et cartes ; 4 px pour le cadre de la fenêtre et le focus.
- Ombres et espaces : multiples de 2.

## Boutons

- **Orange** (`primary`) : l'action principale d'un bloc, une seule par bloc.
- **Sombre** (par défaut) : action secondaire.
- **Creux** (`ghost`) : accessoire, ou choix non retenu dans une série.
- **Rouge** (`danger`) : supprimer, après confirmation.
- Un choix parmi plusieurs (langue, humour…) : le choix actuel est **plein** (sombre), les autres **creux**.

## Relief et composants

- Angles toujours **droits** : contours pleins, jamais de coins coupés ni arrondis (les bulles aussi).
- Pas de cadre dans un cadre : à l'intérieur d'un bloc, des **fonds** et des filets, pas de contours.
- Icônes : [Pixelarticons](https://pixelarticons.com) (MIT), variantes « sharp », à 24 px (un multiple de 24 reste net).

- Champs : contour de 2 px, orange sombre et plus épais (4 px) au focus.
- Relief : voir « Design v2 » plus bas (filet de 2 px et ombre courte sur les cartes ; l’ombre dure de 4 px reste aux repères et aux boutons orange).
- Titres de bloc avec un repère carré orange.
- Onglets : un rail vertical sombre à gauche, icônes 16 × 16 avec leur nom dessous ; l'onglet ouvert s'allume en
  orange. En bas du rail : les glands (toujours visibles, avec un bouton vers la boutique) et l'engrenage
  (Réglages, Connexions ; une flèche ramène aux onglets).
- Cartes (guide, boutique) : creuses au repos, elles se soulèvent au survol.
- Pastilles d'état (connexions), étiquettes (`tag`), jauges (guide), lignes de choix (cerveaux).
- Au clavier : contour orange net sur tout ce qui se tabule. Mouvement réduit : plus d'animation.

## Moins de texte

Le design guide avant le texte : les explications se lisent au survol (`title`) ou se déplient (« Comment faire ? »).

## Design v2 (surfaces, boutons, sombre, raccourcis)

- **Trois niveaux de surface** : le fond de la page (`--bg`), les cartes (`--card`), les champs (`--white`). Chaque page a **une carte « héros »** teintée (`--hero`, filet `--hero-edge`) : la journée (Tableau de bord), « Aujourd'hui » (Journal), « Où j'en suis » (Projets), la vitrine (Boutique), la première carte du Guide, du Carnet et des Connexions.
- **Cartes légères** : un filet de 2 px (`--line`) et une ombre courte (2 px) ; plus de contour noir ni d'ombre de 4 px. Les champs ont un contour de 2 px (`--edge`), orange sombre au focus.
- **Une règle de boutons** : un seul bouton orange (`primary`) par carte, c'est l'action ; les autres sont creux (contour discret `--edge`, noir au survol) ; rouge pour supprimer ; le plein sombre n'existe que pour l'état « choisi » (`.seg .on`, `.tag.on`). Les boutons d'icône ou de liste n'ont jamais de contour.
- **Rythme** : 8, 16, 24 px (`--sp-2`, `--sp-4`, `--sp-5`), 4 et 12 px pour l'ajustement fin ; la grille reste de 2 px.
- **Sombre** : `:root[data-theme="dark"]` redéfinit les mêmes rôles (`--ink` devient le crème clair, `--bg` le brun profond…) ; le rail (`--rail`), l'orange et le texte sur l'orange (`--on-accent`) ne changent pas ; `--drop` donne l'ombre franche. Le réglage **Apparence** (Réglages) : comme le système, clair ou sombre ; `shared/theme-apply.ts` pose l'attribut dans le menu et sur le bureau (bulle de Gilbert comprise). Les dessins SVG en données (coche, queues de bulle) ont leur variante sombre.
- **Mouvement** : une page se pose par paliers de 2 px (jamais invisible) ; rien du tout en mouvement réduit.
- **Retours** : une pastille « Enregistré » (`settings/saved.ts`) après chaque réglage, fiche projet ou carnet modifié.
- **États vides** : une phrase et la première action (créer un premier projet, activer le carnet de bord, lancer une session).
- **Raccourcis** (menu) : ⌘1…7 les pages, ⌘8 Connexions, ⌘, Réglages, ⌘N nouvelle discussion (ou nouveau projet depuis Projets), ⌘K recherche rapide (pages, projets, discussions, actions) ; Échap ferme la recherche, puis la fenêtre. Ctrl à la place de ⌘ sous Windows.
- **Déplacer et redimensionner** : on tire la fenêtre par son titre ou le haut du rail ; des poignées de 16 px (bord droit, bord bas) et de 32 px (angle, avec son repère) la redimensionnent ; pas de barre de défilement dans le menu. Le liseré de la fenêtre reste sombre en mode sombre.
- **Fenêtre redimensionnable** (Mac) : 620 × 520 au minimum ; les grilles (boutique, guide, tuiles, champs en deux colonnes) se réarrangent ; Gilbert suit le bord de la fenêtre.
- **Tableau de bord** : la carte « Ta journée » réunit rendez-vous, mails en attente et projets qui pressent (échéances proches ou passées, réponses attendues) ; une ligne de projet ouvre sa fiche.
