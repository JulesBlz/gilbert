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
- La même ombre dure sur tous les blocs (4 px), et sur ce qu'on survole.
- Titres de bloc avec un repère carré orange.
- Onglets : un rail vertical sombre à gauche, icônes 16 × 16 avec leur nom dessous ; l'onglet ouvert s'allume en
  orange. En bas du rail : les glands (toujours visibles, avec un bouton vers la boutique) et l'engrenage
  (Réglages, Connexions ; une flèche ramène aux onglets).
- Cartes (guide, boutique) : creuses au repos, elles se soulèvent au survol.
- Pastilles d'état (connexions), étiquettes (`tag`), jauges (guide), lignes de choix (cerveaux).
- Au clavier : contour orange net sur tout ce qui se tabule. Mouvement réduit : plus d'animation.

## Moins de texte

Le design guide avant le texte : les explications se lisent au survol (`title`) ou se déplient (« Comment faire ? »).
