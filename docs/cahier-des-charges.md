# Gilbert — cahier des charges

> Compagnon de bureau pixel art, IA 100 % locale, Mac + Windows, gratuit.
> Version 0.1 — 27/10/2026

---

## 1. Vision

Gilbert est un petit animal en pixel art qui vit sur le bureau. Il surveille les emails et l'agenda, briefe le matin, rattrape les erreurs, chambre gentiment. Tout tourne sur la machine de l'utilisateur : aucune donnée ne sort, aucun abonnement.

Projet perso, pensé dès le départ pour être installé par n'importe qui (onboarding, mémoire par utilisateur, installeurs Mac et Windows).

## 2. Décisions d'architecture

| Sujet | Choix | Pourquoi |
|---|---|---|
| Plateforme | **Electron + TypeScript** | Mac et Windows avec un seul code. Fenêtres transparentes, toujours au premier plan, traversables par la souris : c'est mature sur les deux OS. Capture d'écran, notifications, icône de barre des menus/zone de notification intégrées. |
| Rendu | Canvas 2D, sprites PNG 24×24 dessinés pixel par pixel, affichés en ×3/×4/×5 sans lissage | Pixel net, léger. |
| IA | **llama.cpp embarqué**, via la bibliothèque `node-llama-cpp` (binaires prêts pour Mac et Windows) | 100 % local, gratuit, Metal sur Mac, GPU ou CPU sur Windows. Aucune installation séparée pour l'utilisateur (contrairement à Ollama). |
| Modèle | **Gemma 4** (Google, Apache 2.0), quantifié Q4_K_M, téléchargé au premier lancement depuis Hugging Face, **taille choisie selon la RAM** | Bon en français. La vision passe par l'OCR du système (voir 4.4). |
| Données | Fichiers JSON locaux dans le dossier de l'appli (`memory.json`, `settings.json`) | Simple, lisible, aucune dépendance native. SQLite si le volume l'exige plus tard. |
| Mot de passe mail | Trousseau du système (Keychain macOS / Windows Credential Manager) | Jamais en clair. |

**Profils de modèle selon la RAM (indicatif) :**

| RAM | Modèle visé | Poids disque | Qualité attendue |
|---|---|---|---|
| ≥ 20 Go (ton M5 24 Go) | Gemma 4 12B | 7,1 Go | Bonne conversation, humour correct, vision utile |
| 12 à 20 Go | Gemma 4 E4B | 5 Go | Correct |
| < 12 Go | Gemma 4 E2B | 3,1 Go | Basique |

Le cerveau est derrière une interface (`Brain`) : on pourra brancher un autre moteur plus tard si le projet devient un produit, sans toucher au reste. Ce n'est pas de l'hybride, juste une porte laissée ouverte.

## 3. Intégrations (gratuites, pour n'importe qui)

### Emails → IMAP + mot de passe d'application
- Connexion IMAP en écoute continue (IDLE) : notification quasi instantanée.
- Gmail : l'utilisateur active la validation en 2 étapes et génère un « mot de passe d'application » (guidé pas à pas dans l'onboarding).
- Bonus : marche aussi avec Outlook, iCloud, etc.
- **Pourquoi pas l'API Gmail officielle ?** Lire les mails relève d'une autorisation « restreinte » chez Google : distribuer l'appli à n'importe qui exige une vérification de Google et un audit de sécurité payant. En mode test : 100 utilisateurs max et reconnexion tous les 7 jours. Incompatible avec « gratuit ».

### Agenda → adresse secrète iCal de Google Agenda
- L'utilisateur colle son « adresse secrète au format iCal » (Paramètres de l'agenda). Lecture seule, gratuit, sans compte développeur.
- Rafraîchie toutes les 5 min.
- Agenda privé (iCloud, Nextcloud, agenda d'entreprise…) : identifiant et mot de passe facultatifs dans Connexions, envoyés au serveur de l'agenda en authentification HTTP « Basic » ; le mot de passe est chiffré comme celui des mails. Inutile pour l'adresse secrète Google, qui contient déjà sa clé.
- Limite : Gilbert ne peut pas créer d'événement dans Google Agenda. Les deadlines qu'il détecte vont dans sa propre liste de tâches.

### Spotify → contrôle local
- Mac : AppleScript vers l'appli Spotify. Windows : contrôles média du système.
- Gilbert sait ce qui joue (relevé toutes les 15 s, seulement si Spotify ou Musique est déjà ouvert : il ne les lance jamais), peut mettre pause/lecture/suivant/précédent et commenter tes goûts musicaux.
- Commandes : menu « Musique », ou dans la discussion : « pause », « reprends », « suivant », « précédent », « c'est quoi ce son ? ». Il sait aussi ce qui joue quand tu lui en parles.
- Remarques sur un nouveau morceau (lancé par toi, pas par lui) : Sobre jamais, Normal 1 fois sur 5 (au plus toutes les 25 min), Insupportable près d'1 fois sur 2 (au plus toutes les 10 min). Case « Commenter mes goûts musicaux » pour les couper.
- Sur Mac, la première fois, macOS demande l'autorisation de piloter Spotify (Automatisation).
- (L'API Web Spotify demande un compte développeur et limite les utilisateurs : écartée.)

### Météo → Open-Meteo
- Gratuit, sans clé. La ville est celle du carnet (profil) ; c'est la seule chose envoyée hors de la machine, et seulement pour la météo. Sans ville, le brief s'en passe (et Gilbert suggère une fois de la noter).

## 4. Fonctionnalités

### 4.1 Emails
- **Seulement la boîte principale** (réglage, activé par défaut) : avec Gmail, les onglets Promotions, Réseaux sociaux, Notifications et Forums sont laissés de côté (recherche Gmail « category:primary ») ; ailleurs, les lettres d'information et pubs (en-têtes List-Unsubscribe / Precedence). Les spams ne sont jamais dans la boîte de réception.
- Chaque nouveau mail est trié par le modèle local : **important / normal / bruit**.
- Important → Gilbert sursaute avec son « ! », bulle avec expéditeur + résumé d'une ligne ; passe même pendant une session de travail.
- Normal → il sursaute aussi avec son « ! » (« Nouveau mail de Paul : … ») ; pendant une session ou un Chut, il attend le récap.
- Bruit → ignoré.
- L'importance apprend de toi : expéditeurs VIP, mails ouverts vite, réponses 👍/👎 sur ses alertes.
- Il peut proposer un brouillon de réponse (copié dans le presse-papiers). **Il n'envoie jamais rien lui-même.**

### 4.2 Deadlines
- Sources : Google Agenda + deadlines détectées dans les mails (« avant vendredi ») + celles que tu lui dis.
- Une deadline détectée est toujours **proposée** (« J'ajoute ? »), jamais ajoutée en silence.
- Rappels : J-3, J-1, H-2. Si tu ignores une alerte, il revient plus tard, de plus en plus insistant (et drôle). Plafond : 3 relances.

### 4.2 bis Prévenir, et le récap d'absence
- Mail important, rendez-vous dans 10 min, échéance qui approche, erreur repérée à l'écran : s'il est caché en haut de l'écran, Gilbert descend et te le dit tout de suite (avec un « ! » pour ce qui presse).
- Absent (plus d'une minute sans clavier ni souris) ou en mode Chut : tout attend. À ton retour, s'il s'est passé plusieurs choses, il fait un **récap** à la manière du brief : « Pendant ton absence… », 1 à 3 bulles rédigées par le cerveau à partir des faits datés (un rendez-vous passé est signalé comme commencé sans toi), puis ses questions (« J'ajoute l'échéance ? »). Une seule chose : il la dit simplement.
- Ses remarques du moment (écran, musique) ne sont jamais gardées pour plus tard : périmées au bout de 2 min.
- Pendant le brief ou un récap, le reste attend la fin ; si personne ne clique « Suite » pendant 10 min, il abandonne la suite pour ne rien bloquer.

### 4.2 ter Rappels, mémoire des mails, relances, concentration, bilan du soir
- **Rappels dictés** : « rappelle-moi d'appeler Paul demain à 10 h » (aussi en anglais et en vietnamien) → le cerveau en tire quoi / quel jour / quelle heure, Gilbert confirme et le note dans les échéances du carnet. Il le rappelle à l'heure dite (ou à 9 h sans heure), avec « Fait » et « Dans 10 min ». Un jour seul (« vendredi ») = le plus proche, calculé par le code (le modèle sautait parfois une semaine).
- **Mémoire des mails (RAG local)** : chaque mail reçu (hors publicités) est rangé dans `mails.json` avec son résumé, et le dernier mois est relu au premier branchement (300 mails au plus, gardés 120 jours). Une question qui peut concerner tes mails (mots du courrier, expéditeur connu, « mon train part quand ? ») → le cerveau propose les mots qu'un tel mail contiendrait (train → billet, SNCF), la recherche BM25 retrouve les 3 meilleurs mails, et ils accompagnent la question : il répond en disant de qui et de quand. Pas de modèle d'embeddings à télécharger.
- **Mails sans réponse** : le tri repère les mails où une vraie personne attend ta réponse. Toutes les 3 h, Gilbert regarde tes mails envoyés ; au-delà de 2 jours sans réponse, il te le dit une fois et propose un **brouillon**, écrit en ton nom et copié dans le presse-papiers (bouton pour ouvrir le mail dans Gmail). Il n'envoie jamais rien.
- **Garde-fou de concentration** (avec « Regarder mon écran ») : un rendez-vous dans l'heure et demie ou une échéance du jour, et 8 min sur YouTube, Netflix, Twitch, un réseau social… → une phrase de rappel à l'ordre, drôle, sans morale ; plus directe s'il doit recommencer (au plus toutes les 25 min). Il parle même si tu regardes une vidéo sans toucher la souris.
- **Bilan du soir** : une fois par jour à partir de 18 h, quand tu es là : ce qui est fait (les rappels cochés « Fait »), ce qui reste, demain (rendez-vous, échéances), qui attend ta réponse. Rien à dire → il se tait.

### 4.2 quater Langues
- Français (par défaut), anglais, **vietnamien** (Gilbert dit « tớ » et t'appelle « cậu »). Pour le vietnamien, consignes au modèle en anglais avec réponse en vietnamien, et police **VT323** (pixel, avec les accents vietnamiens que Jersey 10 n'a pas). Le menu de la barre des menus reste en français.

### 4.2 quinquies Travailler avec Gilbert, et le reste du quotidien
- **Sessions de travail** : « Gilbert, 25 minutes » (ou « on bosse 50 min », « pomodoro », le menu, les Réglages). Il s'installe derrière un petit ordinateur pixel et tape avec toi ; un compte à rebours flotte au-dessus de sa tête. Rien ne le distrait : ni clic (un clic montre juste le temps restant, avec « Arrêter », qui demande confirmation (on garde ses glands, pas le gland doré)), ni prise à la main, ni vannes, ni regard sur l'écran, ni notifications, sauf l'urgent (rendez-vous dans 10 min, rappel à l'heure dite). Le reste attend la fin, en récap (« Pendant ta session… »). À la fin : des **glands**, puis une pause (5 min, 10 après 50 min) et « On remet ça ? ».
- **Glands** : un gland par minute de session (même arrêtée en route) ; une session menée au bout a une petite chance de rapporter un **gland doré** (0,2 % par minute : ≈ 5 % sur 25 min, ≈ 10 % sur 50) ; 10 glands par fonction essayée dans le guide. Il fait tomber le gland à côté de lui en fin de session. Le compteur est sur Aujourd'hui et dans le Journal. Plus tard : de quoi lui acheter des **skins**.
- **Carnet de bord** (désactivable) : chaque minute devant l'écran, l'appli au premier plan est notée (son nom seulement) ; plus les sessions, rappels cochés, mails importants, échanges avec lui. Le soir (à partir de 19 h), Gilbert en écrit une note de 3 lignes ; le vendredi à partir de 17 h, le résumé de la semaine, qu'il te dit en bulles. Onglet Journal : aujourd'hui en tuiles (concentration et sessions, temps devant l'écran et part concentrée, glands, choses faites, mails importants, échanges) puis le temps par appli (durée et %) ; la semaine (concentration par jour, total comparé à la semaine d'avant, moyenne par jour travaillé, meilleur jour, série, part des sessions menées au bout, temps d'écran, applis de la semaine) ; depuis qu'on se connaît (jours ensemble, concentration totale, glands, choses faites) ; les notes et résumés passés.
- **Aide sur ce que tu copies** (désactivable) : une bulle discrète, sans qu'il bouge, qui dit d'abord ce qu'il a vu (« un texte en anglais (34 mots) », « un message d'erreur », « du code », « un texte ») puis propose ce qui a du sens : langue étrangère → Traduire, Corriger, Reformuler (Résumer si long) ; ton texte → Corriger, Reformuler, Plus court, Plus pro (Résumer si long) ; erreur ou code → Expliquer ; toujours « Non merci ». Il réfléchit (petits points), puis écrit le résultat dans une bulle plus large, qui reste là jusqu'à un bouton (« Copier », « Merci ») ou qu'on l'attrape ; au-delà de 600 caractères, le texte est coupé et « Copier » donne tout. **Il ne touche jamais au presse-papiers tout seul.** Ignoré ou refusé 3 fois de suite → silence 15 min. Jamais pour un mot seul (mot de passe, lien) ni pendant une session ou un Chut.
- **Notes vocales** : bouton micro pixel à côté des trois points. Un clic, tu parles : ce que Whisper « small » (multilingue, ~250 Mo téléchargés au premier usage, sur la machine) entend s'écrit dans le champ au fil de la voix (en grisé, retranscrit toutes les ~1,2 s). Il s'arrête tout seul après un silence ; le texte final reste dans le champ pour que tu le relises ou le corriges, et Entrée l'envoie.
- **Rangement des Téléchargements** (désactivable) : au-delà de 15 fichiers qui traînent depuis plus de 2 jours, il propose (au plus tous les 3 jours) de les ranger par type dans des sous-dossiers de Téléchargements. Rien sans « Ranger », rien n'est supprimé, jamais d'écrasement, et « Annuler » remet tout comme avant.
- **Anniversaires** : 3 jours avant, une idée de cadeau tirée de ce qu'il sait du proche ; le jour même, il propose d'écrire un petit message en ton nom (copié, prêt à coller).
- **Messageries** (Mac, désactivable) : WhatsApp, Messages, Signal, Telegram. Gilbert ne lit rien : il regarde seulement la pastille de leur icône (`lsappinfo`, toutes les 5 s) ; quand le nombre de non-lus augmente et que l'appli n'est pas au premier plan, il sursaute avec son « ! » (« Nouveau message sur WhatsApp (3 non lus) »).
- **Humeurs** (désactivables) : il s'attache quand on clique, joue, parle ou travaille avec lui (les clics plafonnent par jour), perd un peu à chaque jour sans te voir. Boudeur : bonjour piqué, réponses plus sèches, personnalité un brin vexée avant de se laisser amadouer ; ravi : plus affectueux. Chaque année, il fête le jour de votre rencontre.

### 4.2 sexies Le menu, la fenêtre, le guide
- **Menu de la barre des menus** (sa tête, ou clic droit sur lui) : une « base » courte. L'état du moment (en session jusqu'à…, se tait jusqu'à…, en visio, cerveau en téléchargement), puis Lui parler, Brief du jour, Session de travail (25 / 50 min, ou Arrêter), Chut (1 h / jusqu'à demain, ou Tu peux reparler), Ouvrir Gilbert…, Réglages…, Quitter.
- **Fenêtre de Gilbert** (aussi par les trois petits points du champ). **Quand elle s'ouvre, Gilbert saute s'asseoir sur son bord du haut** (c'est son sol tant qu'elle est ouverte : il s'y promène, y parle, y sursaute) ; **quand elle se ferme, il redescend d'un bond** et reprend ce qu'il faisait. Caché en haut, il se laisse tomber droit dessus ; déjà en session de travail ou en pleine discussion, il reste où il est ; attrapé, il quitte la fenêtre. Ce qui arrive pendant un bond (une session qui commence, une réplique, une alerte) attend qu'il soit posé ; s'il travaille sur la fenêtre quand elle se ferme, il redescend et continue de travailler.
  - **Aujourd'hui** : bonjour, la date et la météo ; « Pour bien démarrer » seulement s'il manque quelque chose ; **ta journée** (rendez-vous du jour, mails qui attendent ta réponse) ; **session de travail** (un curseur de 5 à 120 min, de 5 en 5, qui garde la dernière durée, et « C'est parti » ; ou en cours jusqu'à… avec Arrêter ; aussi dans la barre des menus) ; **ta liste** ; les glands.
  - **Guide**, **Journal**, **Carnet** (les classiques et « pour mieux te connaître »).
  - **Engrenage** (en haut à droite) : **Réglages** et **Connexions**, à part, avec « Retour ». Réglages : son caractère, ce qu'il a le droit de faire (dont les messageries), tes mails (seulement la boîte principale), son cerveau, tes données.
- **Ta liste** : tes choses à faire, rangées en groupes (En retard, Aujourd'hui, À venir, puis les tâches sans date, sans titre, et Fait aujourd'hui). Un champ pour ajouter (Entrée ; le curseur y reste), avec une pastille « + date » facultative ; chaque ligne a une case pixel à cocher, un titre qui se renomme d'un clic (Entrée pour garder, Échap pour annuler), une pastille de date qui ouvre le calendrier (rouge si en retard ; « + date » en pointillés s'il n'y en a pas), dans une colonne fixe pour que toutes les pastilles soient alignées, puis « Étapes » et × au survol. **Étapes** : le cerveau découpe la tâche en 3 à 6 actions courtes, rangées en retrait sous elle, avec l'avancement (« 2/4 ») ; la dernière cochée coche la tâche. Ce qui est fait aujourd'hui reste barré jusqu'au soir ; décoché, il ne compte plus dans le Journal. Ce que tu as mis toi-même reste « en retard » tant que tu ne l'as pas coché. Dans la discussion : « ajoute … à ma liste », « à faire : … », « c'est fait : … », « découpe … ». La liste et les sessions de travail sont indépendantes.
- **Guide** (onglet à part) : deux familles, « Demande-moi » (discuter, sessions, ta liste, rappels, mails, musique) et « Ce que je fais tout seul » (brief, ce que tu copies, l'œil sur l'écran, le ménage, le bilan du soir, se cacher). Chaque carte : ce que ça fait, la phrase à lui dire, et toujours le même bouton « Essayer ». Essayer laisse la fenêtre ouverte ; Gilbert saute d'abord à côté de la fenêtre, assez loin (230 px du bord) pour que sa bulle ne passe pas dessous, puis le fait ; tant que la fenêtre est ouverte, Gilbert et ses bulles passent au-dessus d'elle (phrase déjà écrite dans le champ, brief, exemple de texte copié, regard sur la fenêtre que tu lui montres, rangement, cachette…), sauf la session de travail : Essayer ramène sur Aujourd'hui, où le bloc Session clignote. Sans mails branchés, le bouton devient « Brancher ». **Chaque fonction réellement utilisée débloque une récompense** (pas le simple clic sur « Essayer » : un message envoyé, une session lancée, une tâche ajoutée, un rappel noté, une question sur les mails, une commande de musique, le brief dit, une aide du presse-papiers prise, un regard sur l'écran, les Téléchargements vérifiés, le bilan du soir, Gilbert redescendu par la queue ; il le signale d'une petite bulle) : un bouton « Récompense » (un gland, qui brille) apparaît à côté d'« Essayer » ; au clic, « +10 glands » monte et s'efface, et le compteur augmente. Rien ne recouvre le texte de la carte. Ce qui a été essayé est coché (« 3 / 12 essayés »). Proposé une fois après le premier brief ; « aide » l'ouvre aussi.
- **Ce qu'il fait de tes réponses au Carnet** : il t'appelle par ton surnom (rarement), te souhaite ton anniversaire, t'encourage sur ton objectif de temps en temps, reconnaît ta procrastination dans ses rappels à l'ordre et ressort ta phrase quand il insiste ou que ça ne va pas. Les sujets interdits le restent.
- **Logo** : sa tête seule, dans la barre des menus, en grand dans la fenêtre, et sur l'installeur.
- **L'installeur et la poubelle du bureau** : l'installeur (le .dmg ou le .exe) a la tête de Gilbert ; il ne sert qu'une fois. Au premier lancement, l'appli (ouverte depuis l'installeur) se copie sur le bureau en remplaçant l'ancienne version, s'y relance (argument --fresh), éjecte l'installeur et le met à la corbeille (récupérable), et ne laisse aucun raccourci : l'appli ELLE-MÊME est sur le bureau, « Gilbert.app », avec pour icône (personnalisée, donc sans le carré gris que macOS 26 met aux icônes d'appli) une benne verte ouverte, en pixel art de 31 x 33 cases (assets/dumpster.png, tirée de tools/dumpster-source.bmp par tools/make-dumpster.py ; mesures dans src/shared/dumpster.ts). L'icône ne change JAMAIS (changer l'image d'une icône du Finder prend 1 à 2 s : trop fragile) et Gilbert ne dessine rien par-dessus. Il relit la place de l'icône (Finder ; on peut la déplacer) : au lancement la benne s'ébranle (grondement, et elle tremble : le temps de la secousse seulement, Gilbert en dessine une copie par-dessus l'icône et la fait vibrer), puis il jaillit de derrière le bord avant (on ne voit que ce qui dépasse au-dessus du bord), monte haut et retombe à côté ; pour quitter, on le tient (l'icône s'entoure d'un halo quand il approche) et on le lâche dessus, ou « Quitter » : il arrive par le haut, passe sous le bord et disparaît, la benne tremble avec un bruit sourd, puis l'appli s'arrête. Si d'autres fenêtres cachent l'icône, il n'y a rien à montrer : il tombe du haut de l'écran au lancement, fait un petit saut d'au revoir en quittant. Sous Windows, l'installeur crée le raccourci du bureau (l'appli lui donne l'icône bin.ico) ; sans icône connue (Windows, développement), il dessine la benne lui-même en bas à gauche.
- **Sa poubelle** : une poubelle en métal bleuté, haute, à côtes verticales et couvercle bombé à anse (dessin original, dans src/shared/bin.json). Au lancement, elle apparaît là où il vit, le couvercle saute et Gilbert en sort d'un bond, puis elle s'efface. **Pour quitter**, on l'attrape : sa poubelle apparaît en bas à gauche et entrouvre son couvercle quand il passe au-dessus ; lâché dessus, il saute dedans, le couvercle retombe et l'appli se ferme. « Quitter » dans la barre des menus fait pareil (au plus 3,5 s, puis l'appli se ferme quoi qu'il arrive). L'engrenage est un engrenage pixel à huit dents.

### 4.2 septies La boutique
- Les glands se dépensent dans l'onglet **Boutique** (ce qui reste = gagné − dépensé ; le Journal garde le total gagné). Peu d'objets, soignés :
  - **Pelages** : Gris d'origine, Renard roux (300), Neige (300), Minuit (450), Or massif (3 glands dorés). Les quatre teintes de la fourrure changent, le masque, le ventre et les yeux restent ; toutes les animations suivent.
  - **Accessoires** : Lunettes rondes dorées (150), Lunettes de soleil à verres bleus et monture rouge (250), Couronne (2 glands dorés). Ils sont posés sur chaque frame, calés sur ses yeux (de face, de profil, en plein saut, pendant le rire, pendu par la queue) ; la couronne seulement quand le haut de sa tête est libre (pas quand il pend tête en bas).
- Gilbert en grand en haut ; survoler un objet le lui fait essayer. « Acheter » demande un deuxième clic (« Sûr ? »), puis il le porte aussitôt et demande si ça lui va. Un accessoire porté se retire ; un pelage acheté se remet quand on veut. Sans assez de glands : « Il manque 110 ».

### 4.3 Brief du matin
Déclenché à la première ouverture de l'appli dans la journée (la journée commence à 5 h). Si Gilbert a passé la nuit allumé, il le fait à ton retour devant l'écran. À l'ouverture il annonce qu'il prépare le point, attend d'avoir lu l'agenda et trié les mails de la nuit (ceux-ci vont dans le brief au lieu d'être annoncés un par un), puis parle en 2 à 5 bulles, un bouton « Suite » entre chacune. Rejouable depuis le menu (« Brief du jour »).
1. Salut personnalisé + météo (ciel, températures)
2. Agenda du jour et échéances des 3 prochains jours, avec les heures
3. Mails importants arrivés depuis hier soir
4. Anniversaire d'un proche (aujourd'hui ou demain)
5. La vanne du jour

Le cerveau rédige à partir des seuls faits fournis (consigne : ne rien inventer, taire les rubriques vides). Sans cerveau (pas encore téléchargé), une version simple est dite à la place. Les rappels d'échéance du jour sont considérés comme faits par le brief.

### 4.4 Vision de l'écran et rattrapage d'erreurs
- **Désactivée par défaut.** Gilbert la propose une fois, après le premier brief (« Oui » / « Non merci ») ; ensuite, case « Regarder mon écran » dans le menu. Sur Mac, il faut l'autoriser dans Réglages Système > Confidentialité et sécurité > Enregistrement de l'écran, puis le relancer.
- **Comment il voit :** toutes les 40 s, seulement si tu as touché clavier ou souris dans les 20 dernières secondes, il lit le **texte** de la fenêtre au premier plan avec la reconnaissance de texte du système (Vision sur Mac, Windows.Media.Ocr sur Windows), puis le cerveau local l'analyse. Rien n'est gardé : l'image est effacée dès qu'elle est lue, le texte n'est jamais écrit sur le disque. Sa propre fenêtre est masquée de la capture (il ne lit pas ses bulles). Si le texte n'a pas changé, il ne relance pas l'analyse.
  - Pourquoi du texte et pas l'image : node-llama-cpp ne sait pas encore donner d'images au modèle, et sur une capture réduite à la taille qu'un modèle d'image accepte, les petits caractères deviennent illisibles. L'OCR du système lit à pleine résolution, en moins d'une seconde.
- **Ce qu'il signale** (une fois par problème, au plus une remarque toutes les 3 min) :
  - message d'erreur ou d'échec affiché (compilation, commande, paiement refusé…) ;
  - faute de frappe flagrante dans ce que tu rédiges ;
  - jour de la semaine qui ne correspond pas à la date (il reçoit le calendrier des 3 semaines autour d'aujourd'hui) ;
  - oubli : « ci-joint » sans pièce jointe, objet vide, « [prénom] » laissé tel quel.
  Garde-fous : le modèle doit se dire « certain » et recopier le passage en cause ; si ce passage n'est pas vraiment à l'écran, la remarque est jetée.
- **Vannes contextuelles :** de temps en temps, une remarque taquine sur ce que tu fais, sans citer de donnée personnelle (Sobre : jamais ; Normal : ~toutes les 35 min ; Insupportable : ~toutes les 12 min).
- **Chut automatique :** en visio (Zoom, Teams, FaceTime, Webex, Google Meet…) ou en diaporama plein écran, il se tait (ni voix ni bulles) et garde ses messages pour la fin.
- Jamais lus : gestionnaires de mots de passe, ses propres fenêtres ; et rien en mode Chut ou quand tu n'es pas là.
- Pas encore : réunion qui commence alors que tu es ailleurs, conflit d'agenda, mail sans réponse depuis 3 jours, 👍/👎 pour qu'il apprenne.

### 4.5 Personnalité
- **Gilbert** : un vieux de la vieille, pince-sans-rire, taquin mais loyal, jamais méchant. Il te tutoie.
- Français par défaut, anglais réglable.
- Curseur d'humour : *Sobre ↔ Normal ↔ Insupportable*. Par défaut, au plus une vanne spontanée par heure, toujours liée au contexte.
- Sujets interdits définis à l'onboarding.
- Les vannes mêlent génération par le modèle et une banque de répliques écrites à la main (plus fiable qu'un petit modèle seul).

### 4.6 bis Faire connaissance (la toute première fois)
- À son tout premier lancement (mémoire vide), Gilbert se présente et propose, par une bulle à trois boutons, de poser quelques questions : « Allez-y », « Plus tard » (il redemandera un autre jour), « Non merci » (jamais plus). Les questions (prénom, ville pour la météo, ce que tu fais, ton carburant, ton objectif du moment) s'affichent une à une au-dessus du champ ; Entrée sur un champ vide passe, Échap arrête (on garde ce qui a été répondu). Ensuite il remercie par ton prénom, rappelle que tout se complète dans le Carnet, puis propose son cerveau s'il n'en a pas encore. Aucun message sur l'installation : la première chose qu'il dit, c'est bonjour.

### 4.6 Mémoire
- Pas de questionnaire de départ : il apprend en discutant, et tout se complète dans le carnet.
- **Apprentissage** : après chaque message, il cherche au plus 2 choses à retenir : goûts, habitudes (même « en ce moment »), projets en cours, événements à venir (gardés avec leur date en clair, jamais « jeudi » seul), proches, travail, études, santé, ce qui stresse ou motive ; il ignore les simples questions et le déjà-connu, et le signale (« Je retiens : … »). Si tu écris dans le Carnet au même moment, ce qu'il vient d'apprendre est gardé (avant, l'enregistrement du Carnet pouvait l'effacer).
- **Carnet de Gilbert** : un écran pour voir, modifier ou supprimer tout ce qu'il sait.
- Chaque installation a sa propre mémoire.

### 4.7 Présence et interactions
- Fenêtre transparente sur tout l'écran ; seul Gilbert capte la souris.
- Il se déplace par petits bonds (appel, vol, réception). Si personne ne joue avec lui pendant 20 à 30 s (réglable), il saute se cacher au-dessus du haut de l'écran : seule sa queue pend ; on la tire pour le faire tomber. Un simple clic sur la queue le fait aussi descendre, prêt à discuter. Quand tu reviens après une absence, sa queue s'agite pour te dire bonjour. Attrapé, il pend par la queue et se débat. Une alerte le fait redescendre tout seul.
- **Clic** → champ de discussion ; ses **trois petits points** ouvrent la fenêtre de Gilbert. **Glisser** → le déplacer. **Clic droit** → le menu de la barre des menus.
- États animés : repos, marche, sommeil, réflexion, alerte, rire, moquerie, tombé (lâché trop haut).

### 4.8 Sons
- Bips 8-bit doux pour les alertes.
- Voix façon « charabia animal » : chaque lettre affichée joue une syllabe courte, à une hauteur propre à Gilbert. Son généré par l'appli (Web Audio), aucun fichier tiers.
- Volume et mode muet dans les réglages.

## 5. Direction artistique
- Pose assise et expressions (repos, clignement, parole, réflexion, joie, alerte) : la référence relevée case par case (23×19 pixels), la queue qui pend du haut de l'écran aussi. Mouvements (marche, bonds, petits sauts, saut vers le haut, chute, pendu) : planches générées dans `art/source/`, nettoyées par `tools/clean-sprites.mjs` à la même échelle (même largeur de tête que la référence), et calées sur les yeux. Une seule cadence (0,1 s par frame), seul l'envol est deux fois plus rapide.
- Bulle pixel : bordure épaisse, coins crantés, police pixel **Jersey 10** (OFL) à 20 px, sans lissage. Ce que tu tapes : un cadre simple sans pointe, avec un petit menu « ⋯ » (carnet, connexions).
- ⚠️ Avant toute diffusion publique ou commerciale, vérifier les conditions d'utilisation de ce modèle, ou le remplacer par un dessin original.
- Tous les sprites et animations sont générés pour le projet.

## 6. Distribution
- Installeurs `.dmg` (Mac) et `.exe` (Windows) via electron-builder, hébergés gratuitement sur GitHub Releases.
- Sans budget, l'appli n'est **pas signée** (signature « ad hoc » sur Mac, sans durcissement d'exécution pour que llama.cpp puisse charger ses bibliothèques) : au premier lancement, macOS demande d'autoriser l'ouverture dans Réglages > Confidentialité et sécurité, et Windows affiche « Exécuter quand même ». Si le projet devient un produit : compte Apple Developer (99 $/an) + certificat Windows.
- Construction : `npm run dist:mac` sur un Mac, `npm run dist:win` sur Windows, ou les deux via le workflow GitHub Actions « Installeurs » (gratuit). Les scripts système (vision, musique) et llama.cpp sont sortis de l'archive `app.asar` pour être exécutables. Le `.dmg` fait ~165 Mo ; le cerveau (1,5 à 7 Go) se télécharge au premier lancement.
- Permissions macOS demandées au fil de l'onboarding : Enregistrement de l'écran (vision), Automatisation (Spotify).

## 7. Feuille de route

| Phase | Contenu | Résultat |
|---|---|---|
| 0 | Direction artistique : animal + palette | Gilbert a une tête |
| 1 | **Gilbert vit** : fenêtre transparente Mac + Windows, sprites animés, marche, sommeil, glisser, bulle, sons | Un desktop pet qui tourne, sans IA |
| 2 | **Cerveau** : llama.cpp embarqué, téléchargement du modèle selon la RAM, discussion au clic, personnalité, FR/EN | On peut parler à Gilbert |
| 3 | **Mémoire** : onboarding, faits appris, Carnet | Il te connaît |
| 4 | **Mails + agenda** : IMAP, iCal, tri, alertes, deadlines, rappels | Il te prévient |
| 5 | **Brief du matin** + météo | Il te briefe |
| 6 | **Vision** : captures, détection d'erreurs, vannes contextuelles, mode Chut automatique | Il te rattrape |
| 7 | Spotify, finitions, installeurs, test chez quelqu'un d'autre | Il se partage |

## 8. Points à valider au prototype
- Choix du modèle multimodal : meilleur compromis français / humour / vision / vitesse sur 24 Go.
- Consommation mémoire réelle (modèle + Electron) et batterie de la vision périodique.
- Fenêtre traversable par la souris au pixel près sur Windows et sur Mac avec plusieurs écrans.
- Mots de passe d'application Gmail : toujours disponibles au moment du développement.
