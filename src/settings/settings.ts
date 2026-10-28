// La fenêtre de Gilbert, sa « base » (« Ouvrir Gilbert » dans la barre des menus, ou les trois petits
// points à côté du champ). Quand elle s'ouvre, Gilbert saute s'asseoir dessus.
// - Aujourd'hui : ta journée (rendez-vous, mails qui attendent), la session de travail, ta liste de
//   choses à faire, tes glands, et ce qu'il reste à brancher ;
// - Guide : ce qu'il sait faire, « Essayer » partout, 10 glands à ramasser par essai ;
// - Journal : ton carnet de bord ; Carnet : ce qu'il sait de toi ;
// - derrière l'engrenage : les Réglages et les Connexions (mails, agenda).

// Jersey 10 : police pixel (OFL), nette à 20 px (deux fois sa grille de 10)
import '@fontsource/jersey-10/400.css';
// VT323 : la police pixel qui a les accents vietnamiens (Jersey 10 ne les a pas)
import '@fontsource/vt323/400.css';
import '../carnet/carnet.css';
import './settings.css';
import head from '../../assets/head.png';
import { mountCarnet } from '../carnet/carnet';
import { mountConnections } from '../connections/connections';
import { renderJournal } from './journal-tab';
import { renderShop } from './shop-tab';
import { ACORN, GOLDEN_ACORN, drawGrid } from '../shared/pixels';
import {
  DEFAULT_SETTINGS, LOCALE,
  type Humor, type JournalData, type Lang, type PrefsAction, type PrefsApi, type PrefsState, type Settings, type SettingsTab, type Size,
} from '../shared/types';

declare global {
  interface Window { prefs?: PrefsApi }
}

/** Une carte du guide : ce qu'il sait faire, la phrase à lui dire, et ce que fait « Essayer » */
type Guide = { key: string; title: string; how: string; say?: string; act: [PrefsAction, string?]; needsMail?: boolean };
type MainTab = 'home' | 'guide' | 'shop' | 'journal' | 'carnet';
type GearTab = 'general' | 'connections';

const T = {
  fr: {
    tabs: { home: "Aujourd'hui", guide: 'Guide', shop: 'Boutique', journal: 'Journal', carnet: 'Carnet' } as Record<MainTab, string>,
    gear: { general: 'Réglages', connections: 'Connexions' } as Record<GearTab, string>,
    back: 'Retour', gearTitle: 'Réglages et connexions',
    greet: (h: number): string => (h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Salut' : 'Bonsoir'),
    day: 'Ta journée', allDay: 'Journée', now: 'en cours',
    nothingToday: 'Rien à l’agenda aujourd’hui.',
    session: 'Session de travail', sessionHint: 'Je bosse avec toi, sans me laisser distraire : un gland par minute.',
    sessionOn: (at: string) => `En cours, jusqu’à ${at}.`, stop: 'Arrêter', launch: 'C’est parti',
    list: 'Ta liste', listAdd: 'Ajouter une tâche…', add: 'Ajouter', toDo: (n: number) => `${n} à faire`,
    listEmpty: 'Rien sur ta liste. Écris ci-dessus, ou dis-moi « ajoute … à ma liste ».',
    groups: { late: 'En retard', today: 'Aujourd’hui', soon: 'À venir', done: 'Fait aujourd’hui' },
    setDate: '+ date', today: 'aujourd’hui', tomorrow: 'demain', rename: 'Clique pour renommer', removeTask: 'Retirer', split: 'Étapes', splitHint: 'Je la découpe en petites étapes',
    rewardHint: 'Chaque fonction que tu utilises pour de vrai débloque une récompense : 10 glands.', reward: 'Récompense', rewardDone: '+10 glands',
    waiting: (names: string[]) => `${names.length} mail${names.length > 1 ? 's attendent' : ' attend'} ta réponse : ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`,
    start: 'Pour bien démarrer',
    steps: {
      brain: ['Mon cerveau', 'Je le télécharge une fois, ensuite tout se passe sur ton ordinateur.', 'Télécharger'],
      city: ['Ta ville', 'Pour la météo du brief.', 'Ouvrir le carnet'],
      mail: ['Tes mails', 'Je les trie et je te préviens de l’important.', 'Brancher'],
      calendar: ['Ton agenda', 'Pour le brief et les rendez-vous.', 'Brancher'],
    },
    acorns: (n: number, g: number) => `${n} gland${n > 1 ? 's' : ''}${g ? ` dont ${g} doré${g > 1 ? 's' : ''}` : ''}`,
    acornsToday: (n: number) => (n ? `+${n} aujourd’hui. ` : ''),
    acornsHint: 'Un gland par minute de session de travail, 10 par essai du guide. Bientôt : de quoi m’offrir des skins.',
    guideTitle: 'Ce que je sais faire', tried: (n: number, of: number) => `${n} / ${of} essayé${n > 1 ? 's' : ''}`,
    ask: 'Demande-moi', auto: 'Ce que je fais tout seul',
    try: 'Essayer', connect: 'Brancher',
    guide: [
      { key: 'chat', title: 'Discuter', how: 'Clique sur moi et écris, ou parle au micro : ce que j’entends s’écrit en direct. Je retiens ce qui compte (dans le Carnet).', say: 'Salut Gilbert, ça va ?', act: ['say', 'Salut Gilbert, ça va ?'] },
      { key: 'focus', title: 'Les sessions de travail', how: 'Dans Aujourd’hui (de 5 à 120 min), dans la barre des menus, ou dis-le-moi. Je bosse avec toi ; un gland par minute.', say: 'Gilbert, 25 minutes', act: ['focusStart', '25'] },
      { key: 'list', title: 'Ta liste', how: 'Tes choses à faire, dans Aujourd’hui. Coche, ou dis-moi « c’est fait : … ».', say: 'Ajoute appeler la banque à ma liste', act: ['say', 'Ajoute appeler la banque à ma liste'] },
      { key: 'remind', title: 'Les rappels', how: 'Je te fais signe à l’heure dite, même si je suis caché.', say: 'Rappelle-moi de boire de l’eau dans 10 minutes', act: ['say', 'Rappelle-moi de boire de l’eau dans 10 minutes'] },
      { key: 'mail', title: 'Tes mails', how: 'Je retrouve ce qu’on t’a écrit, et je relance ceux qui attendent ta réponse, brouillon compris.', say: 'Qu’est-ce que j’ai reçu d’important cette semaine ?', act: ['say', 'Qu’est-ce que j’ai reçu d’important cette semaine ?'], needsMail: true },
      { key: 'music', title: 'La musique', how: 'Avec Spotify ou Musique : « pause », « suivant », « reprends ».', say: 'C’est quoi ce son ?', act: ['say', 'C’est quoi ce son ?'] },
      { key: 'brief', title: 'Le brief du matin', how: 'À ta première ouverture de la journée : météo, agenda, échéances, mails importants.', say: 'brief', act: ['brief'] },
      { key: 'clipboard', title: 'Ce que tu copies', how: 'Je te dis ce que c’est (anglais, erreur, code…) et je propose de traduire, corriger, raccourcir, expliquer.', act: ['tryClipboard'] },
      { key: 'vision', title: 'Un œil sur ton écran', how: 'Une erreur, une faute, un « ci-joint » sans pièce jointe : je te le dis. Je me tais en visio.', act: ['tryVision'] },
      { key: 'tidy', title: 'Le ménage', how: 'Quand tes Téléchargements débordent, je propose de les ranger par type. Rien sans ton accord.', act: ['tidyNow'] },
      { key: 'evening', title: 'Le bilan du soir', how: 'Ce que tu as fait, ce qui t’attend demain, une note dans le Journal ; le vendredi, ta semaine.', act: ['evening'] },
      { key: 'hide', title: 'Me cacher, me ranger', how: 'Quand on ne joue pas avec moi, je monte en haut de l’écran. Tire ma queue pour me faire descendre. Pour quitter, lâche-moi dans ma poubelle (en bas à gauche).', act: ['hide'] },
    ] as Guide[],
    character: 'Son caractère',
    humor: 'Humour', humors: { sober: 'Sobre', normal: 'Normal', unbearable: 'Insupportable' },
    lang: 'Langue',
    size: 'Taille', sizes: { S: 'Petit', M: 'Moyen', L: 'Grand' },
    sound: 'Sa voix et ses petits bruits',
    hide: 'Il va se cacher en haut de l’écran après', hides: { 25: '20 à 30 s', 60: '1 min', 180: '3 min', 0: 'Jamais' },
    allowed: 'Ce qu’il a le droit de faire',
    switches: {
      vision: ['Regarder mon écran', 'Erreurs, fautes, oublis ; il se tait en visio et te rappelle à l’ordre. Il lit le texte de la fenêtre au premier plan, sur ton ordi, et ne garde rien.'],
      clipboard: ['M’aider avec ce que je copie', 'Traduire, résumer, corriger, reformuler, expliquer une erreur.'],
      tidy: ['Ranger mes Téléchargements', 'Il propose quand ça déborde, ne fait rien sans ton accord.'],
      musicComments: ['Commenter ma musique', 'De temps en temps, sur Spotify ou Musique.'],
      journal: ['Tenir mon carnet de bord', 'Le nom des applis utilisées, les sessions, la note du soir.'],
      moods: ['Avoir des humeurs', 'Content quand on joue avec lui, boudeur quand on l’oublie.'],
      messages: ['Me prévenir des messages', 'WhatsApp, Messages, Signal, Telegram : il voit seulement qu’un message est arrivé (la pastille de l’appli), jamais ce qu’il dit.'],
      mailPrimaryOnly: ['Seulement ma boîte principale', 'Il laisse de côté les pubs, les réseaux sociaux et les notifications (les onglets de Gmail). Les spams, il ne les voit jamais.'],
    },
    mails: 'Tes mails',
    visionDenied: 'Autorise-le dans Réglages Système > Confidentialité et sécurité > Enregistrement de l’écran, puis relance-le.',
    brain: 'Son cerveau',
    brainState: {
      missing: 'Pas encore téléchargé.', downloading: (p: number) => `Téléchargement : ${p} %`, loading: 'Il se réveille…',
      ready: (m: string) => `${m}, prêt. Tout tourne sur ton ordinateur.`, error: (m: string) => `Erreur : ${m}`,
    },
    download: 'Télécharger',
    voice: 'Notes vocales : Whisper, téléchargé au premier usage (≈ 250 Mo).',
    data: 'Tes données',
    dataHint: 'Tout reste sur ton ordinateur : réglages, carnet, mails retrouvés, journal. Rien n’est envoyé ailleurs (sauf le nom de ta ville, pour la météo).',
    openData: 'Ouvrir le dossier',
    close: 'Fermer',
  },
  en: {
    tabs: { home: 'Today', guide: 'Guide', shop: 'Shop', journal: 'Journal', carnet: 'Notebook' } as Record<MainTab, string>,
    gear: { general: 'Settings', connections: 'Connections' } as Record<GearTab, string>,
    back: 'Back', gearTitle: 'Settings and connections',
    greet: (h: number): string => (h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Hi' : 'Good evening'),
    day: 'Your day', allDay: 'All day', now: 'now',
    nothingToday: 'Nothing on the calendar today.',
    session: 'Work session', sessionHint: 'I work with you and nothing distracts me: one acorn per minute.',
    sessionOn: (at: string) => `Running, until ${at}.`, stop: 'Stop', launch: 'Let’s go',
    list: 'Your list', listAdd: 'Add a task…', add: 'Add', toDo: (n: number) => `${n} to do`,
    listEmpty: 'Nothing on your list. Type above, or tell me "add … to my list".',
    groups: { late: 'Overdue', today: 'Today', soon: 'Coming up', done: 'Done today' },
    setDate: '+ date', today: 'today', tomorrow: 'tomorrow', rename: 'Click to rename', removeTask: 'Remove', split: 'Steps', splitHint: 'I’ll break it into small steps',
    rewardHint: 'Each feature you really use unlocks a reward: 10 acorns.', reward: 'Reward', rewardDone: '+10 acorns',
    waiting: (names: string[]) => `${names.length} email${names.length > 1 ? 's are' : ' is'} waiting for your reply: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`,
    start: 'Getting started',
    steps: {
      brain: ['My brain', 'I download it once, then everything runs on your computer.', 'Download'],
      city: ['Your city', 'For the weather in the brief.', 'Open notebook'],
      mail: ['Your email', 'I sort it and tell you what matters.', 'Connect'],
      calendar: ['Your calendar', 'For the brief and your meetings.', 'Connect'],
    },
    acorns: (n: number, g: number) => `${n} acorn${n > 1 ? 's' : ''}${g ? `, ${g} golden` : ''}`,
    acornsToday: (n: number) => (n ? `+${n} today. ` : ''),
    acornsHint: 'One acorn per minute of work session, 10 per guide try. Soon: skins to buy me.',
    guideTitle: 'What I can do', tried: (n: number, of: number) => `${n} / ${of} tried`,
    ask: 'Ask me', auto: 'What I do on my own',
    try: 'Try it', connect: 'Connect',
    guide: [
      { key: 'chat', title: 'Chat', how: 'Click me and type, or talk into the mic: what I hear is written live. I remember what matters (in the Notebook).', say: 'Hi Gilbert, how are you?', act: ['say', 'Hi Gilbert, how are you?'] },
      { key: 'focus', title: 'Work sessions', how: 'From Today (5 to 120 min), the menu bar, or just tell me. I work with you; one acorn per minute.', say: 'Gilbert, 25 minutes', act: ['focusStart', '25'] },
      { key: 'list', title: 'Your list', how: 'Your to-dos, in Today. Tick them, or tell me "done: …".', say: 'Add call the bank to my list', act: ['say', 'Add call the bank to my list'] },
      { key: 'remind', title: 'Reminders', how: 'I give you a shout right on time, even when I’m hiding.', say: 'Remind me to drink some water in 10 minutes', act: ['say', 'Remind me to drink some water in 10 minutes'] },
      { key: 'mail', title: 'Your email', how: 'I find what people wrote to you, and nudge you about emails waiting for a reply, draft included.', say: 'What important email did I get this week?', act: ['say', 'What important email did I get this week?'], needsMail: true },
      { key: 'music', title: 'Music', how: 'With Spotify or Music: "pause", "next", "resume".', say: 'What’s this song?', act: ['say', 'What’s this song?'] },
      { key: 'brief', title: 'The morning brief', how: 'The first time you open me each day: weather, calendar, deadlines, important email.', say: 'brief', act: ['brief'] },
      { key: 'clipboard', title: 'What you copy', how: 'I tell you what it is (English, an error, code…) and offer to translate, fix, shorten, explain.', act: ['tryClipboard'] },
      { key: 'vision', title: 'An eye on your screen', how: 'An error, a typo, an "attached" with no attachment: I tell you. I go quiet in calls.', act: ['tryVision'] },
      { key: 'tidy', title: 'Tidying up', how: 'When your Downloads overflow, I offer to sort them by type. Nothing without your OK.', act: ['tidyNow'] },
      { key: 'evening', title: 'The evening wrap-up', how: 'What you did, what’s waiting tomorrow, a note in the Journal; on Fridays, your week.', act: ['evening'] },
      { key: 'hide', title: 'Hiding, putting me away', how: 'When nobody plays with me, I climb to the top of the screen. Pull my tail to bring me down. To quit, drop me in my bin (bottom left).', act: ['hide'] },
    ] as Guide[],
    character: 'His character',
    humor: 'Humour', humors: { sober: 'Sober', normal: 'Normal', unbearable: 'Unbearable' },
    lang: 'Language',
    size: 'Size', sizes: { S: 'Small', M: 'Medium', L: 'Large' },
    sound: 'His voice and little noises',
    hide: 'He hides at the top of the screen after', hides: { 25: '20 to 30 s', 60: '1 min', 180: '3 min', 0: 'Never' },
    allowed: 'What he is allowed to do',
    switches: {
      vision: ['Watch my screen', 'Errors, typos, oversights; goes quiet in calls and nudges you. Reads the front window’s text, on your computer, keeps nothing.'],
      clipboard: ['Help with what I copy', 'Translate, summarise, fix, rephrase, explain an error.'],
      tidy: ['Tidy my Downloads', 'Offers when they overflow, does nothing without your OK.'],
      musicComments: ['Comment on my music', 'Now and then, on Spotify or Music.'],
      journal: ['Keep my logbook', 'Names of the apps you use, sessions, the evening note.'],
      moods: ['Have moods', 'Happy when played with, sulky when forgotten.'],
      messages: ['Tell me about messages', 'WhatsApp, Messages, Signal, Telegram: he only sees that a message arrived (the app’s badge), never what it says.'],
      mailPrimaryOnly: ['Only my primary inbox', 'He skips ads, social networks and notifications (Gmail’s tabs). He never sees spam.'],
    },
    mails: 'Your email',
    visionDenied: 'Allow him in System Settings > Privacy & Security > Screen Recording, then restart him.',
    brain: 'His brain',
    brainState: {
      missing: 'Not downloaded yet.', downloading: (p: number) => `Downloading: ${p}%`, loading: 'Waking up…',
      ready: (m: string) => `${m}, ready. Everything runs on your computer.`, error: (m: string) => `Error: ${m}`,
    },
    download: 'Download',
    voice: 'Voice notes: Whisper, downloaded on first use (≈ 250 MB).',
    data: 'Your data',
    dataHint: 'Everything stays on your computer: settings, notebook, found emails, journal. Nothing is sent elsewhere (except your city name, for the weather).',
    openData: 'Open folder',
    close: 'Close',
  },
  vi: {
    tabs: { home: 'Hôm nay', guide: 'Hướng dẫn', shop: 'Cửa hàng', journal: 'Nhật ký', carnet: 'Sổ tay' } as Record<MainTab, string>,
    gear: { general: 'Cài đặt', connections: 'Kết nối' } as Record<GearTab, string>,
    back: 'Quay lại', gearTitle: 'Cài đặt và kết nối',
    greet: (h: number): string => (h < 5 ? 'Khuya rồi' : h < 12 ? 'Chào buổi sáng' : h < 18 ? 'Chào' : 'Chào buổi tối'),
    day: 'Ngày của cậu', allDay: 'Cả ngày', now: 'đang diễn ra',
    nothingToday: 'Hôm nay lịch trống.',
    session: 'Buổi làm việc', sessionHint: 'Tớ làm việc cùng cậu, không xao nhãng: mỗi phút một quả sồi.',
    sessionOn: (at: string) => `Đang làm, đến ${at}.`, stop: 'Dừng', launch: 'Bắt đầu',
    list: 'Danh sách việc', listAdd: 'Thêm một việc…', add: 'Thêm', toDo: (n: number) => `${n} việc`,
    listEmpty: 'Danh sách trống. Gõ ở trên, hoặc bảo tớ « thêm … vào danh sách ».',
    groups: { late: 'Trễ hạn', today: 'Hôm nay', soon: 'Sắp tới', done: 'Xong hôm nay' },
    setDate: '+ ngày', today: 'hôm nay', tomorrow: 'ngày mai', rename: 'Bấm để đổi tên', removeTask: 'Xóa', split: 'Chia bước', splitHint: 'Tớ chia nhỏ thành từng bước',
    rewardHint: 'Mỗi tính năng cậu dùng thật sự mở một phần thưởng: 10 quả sồi.', reward: 'Phần thưởng', rewardDone: '+10 quả sồi',
    waiting: (names: string[]) => `${names.length} email đang chờ cậu trả lời: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`,
    start: 'Bắt đầu',
    steps: {
      brain: ['Bộ não của tớ', 'Tải một lần, sau đó mọi thứ chạy trên máy cậu.', 'Tải về'],
      city: ['Thành phố', 'Để báo thời tiết buổi sáng.', 'Mở sổ tay'],
      mail: ['Email', 'Tớ phân loại và báo điều quan trọng.', 'Kết nối'],
      calendar: ['Lịch', 'Cho bản tin và các cuộc hẹn.', 'Kết nối'],
    },
    acorns: (n: number, g: number) => `${n} quả sồi${g ? `, ${g} quả vàng` : ''}`,
    acornsToday: (n: number) => (n ? `+${n} hôm nay. ` : ''),
    acornsHint: 'Mỗi phút làm việc một quả sồi, mỗi lần thử hướng dẫn 10 quả. Sắp tới: mua trang phục cho tớ.',
    guideTitle: 'Những gì tớ làm được', tried: (n: number, of: number) => `đã thử ${n} / ${of}`,
    ask: 'Cứ hỏi tớ', auto: 'Tớ tự làm',
    try: 'Thử xem', connect: 'Kết nối',
    guide: [
      { key: 'chat', title: 'Trò chuyện', how: 'Bấm vào tớ và gõ, hoặc nói vào micro: tớ nghe đến đâu viết đến đó. Tớ nhớ những điều quan trọng (trong Sổ tay).', say: 'Chào Gilbert, khỏe không?', act: ['say', 'Chào Gilbert, khỏe không?'] },
      { key: 'focus', title: 'Buổi làm việc', how: 'Ở mục Hôm nay (5 đến 120 phút), trên thanh menu, hoặc cứ bảo tớ. Mỗi phút một quả sồi.', say: 'Gilbert, 25 phút', act: ['focusStart', '25'] },
      { key: 'list', title: 'Danh sách việc', how: 'Những việc cần làm, ở mục Hôm nay. Đánh dấu, hoặc bảo tớ « xong rồi: … ».', say: 'Thêm gọi ngân hàng vào danh sách', act: ['say', 'Thêm gọi ngân hàng vào danh sách'] },
      { key: 'remind', title: 'Nhắc việc', how: 'Tớ nhắc đúng giờ, kể cả khi đang trốn.', say: 'Nhắc tớ uống nước sau 10 phút', act: ['say', 'Nhắc tớ uống nước sau 10 phút'] },
      { key: 'mail', title: 'Email', how: 'Tớ tìm lại những gì người ta viết cho cậu, và nhắc thư đang chờ trả lời, kèm bản nháp.', say: 'Tuần này tớ nhận được email gì quan trọng?', act: ['say', 'Tuần này tớ nhận được email gì quan trọng?'], needsMail: true },
      { key: 'music', title: 'Âm nhạc', how: 'Với Spotify hoặc Nhạc: « tạm dừng », « bài tiếp », « phát tiếp ».', say: 'Bài gì đây?', act: ['say', 'Bài gì đây?'] },
      { key: 'brief', title: 'Bản tin buổi sáng', how: 'Lần đầu cậu mở tớ mỗi ngày: thời tiết, lịch, hạn chót, email quan trọng.', say: 'brief', act: ['brief'] },
      { key: 'clipboard', title: 'Những gì cậu sao chép', how: 'Tớ nói đó là gì (tiếng Anh, lỗi, mã…) và gợi ý dịch, sửa, rút gọn, giải thích.', act: ['tryClipboard'] },
      { key: 'vision', title: 'Để mắt màn hình', how: 'Lỗi, lỗi chính tả, « đính kèm » mà không có tệp: tớ báo. Tớ im khi cậu họp.', act: ['tryVision'] },
      { key: 'tidy', title: 'Dọn dẹp', how: 'Khi thư mục Tải về đầy, tớ gợi ý xếp theo loại. Không làm gì khi chưa được đồng ý.', act: ['tidyNow'] },
      { key: 'evening', title: 'Tổng kết buổi tối', how: 'Việc đã làm, việc ngày mai, một ghi chú trong Nhật ký; thứ Sáu thì cả tuần.', act: ['evening'] },
      { key: 'hide', title: 'Trốn', how: 'Khi không ai chơi với tớ, tớ trèo lên mép trên màn hình. Kéo đuôi để tớ xuống. Muốn thoát, thả tớ vào thùng rác (góc dưới bên trái).', act: ['hide'] },
    ] as Guide[],
    character: 'Tính cách',
    humor: 'Hài hước', humors: { sober: 'Nghiêm túc', normal: 'Bình thường', unbearable: 'Lắm mồm' },
    lang: 'Ngôn ngữ',
    size: 'Kích thước', sizes: { S: 'Nhỏ', M: 'Vừa', L: 'Lớn' },
    sound: 'Giọng nói và tiếng động nhỏ',
    hide: 'Tớ trốn lên mép trên màn hình sau', hides: { 25: '20 đến 30 giây', 60: '1 phút', 180: '3 phút', 0: 'Không bao giờ' },
    allowed: 'Những gì tớ được phép làm',
    switches: {
      vision: ['Nhìn màn hình', 'Lỗi, lỗi chính tả, sơ suất; im khi họp và nhắc cậu tập trung. Đọc chữ cửa sổ phía trước, ngay trên máy, không giữ lại gì.'],
      clipboard: ['Giúp với những gì tớ sao chép', 'Dịch, tóm tắt, sửa, viết lại, giải thích lỗi.'],
      tidy: ['Dọn thư mục Tải về', 'Gợi ý khi đầy, không làm gì khi chưa được đồng ý.'],
      musicComments: ['Bình luận nhạc', 'Thỉnh thoảng, trên Spotify hoặc Nhạc.'],
      journal: ['Ghi nhật ký', 'Tên ứng dụng đã dùng, các buổi làm việc, ghi chú buổi tối.'],
      moods: ['Có tâm trạng', 'Vui khi được chơi cùng, dỗi khi bị bỏ quên.'],
      messages: ['Báo tin nhắn mới', 'WhatsApp, Messages, Signal, Telegram: tớ chỉ thấy có tin nhắn đến (chấm đỏ của ứng dụng), không bao giờ đọc nội dung.'],
      mailPrimaryOnly: ['Chỉ hộp thư chính', 'Bỏ qua quảng cáo, mạng xã hội và thông báo (các tab của Gmail). Thư rác thì tớ không bao giờ thấy.'],
    },
    mails: 'Email',
    visionDenied: 'Cho phép tớ trong Cài đặt hệ thống > Quyền riêng tư & Bảo mật > Ghi màn hình, rồi mở lại tớ.',
    brain: 'Bộ não',
    brainState: {
      missing: 'Chưa tải.', downloading: (p: number) => `Đang tải: ${p} %`, loading: 'Đang thức dậy…',
      ready: (m: string) => `${m}, sẵn sàng. Mọi thứ chạy trên máy cậu.`, error: (m: string) => `Lỗi: ${m}`,
    },
    download: 'Tải về',
    voice: 'Ghi âm giọng nói: Whisper, tải khi dùng lần đầu (≈ 250 MB).',
    data: 'Dữ liệu của cậu',
    dataHint: 'Mọi thứ ở trên máy cậu: cài đặt, sổ tay, email, nhật ký. Không gửi đi đâu (trừ tên thành phố, để xem thời tiết).',
    openData: 'Mở thư mục',
    close: 'Đóng',
  },
};

// aperçu navigateur : des réglages factices
const api: PrefsApi = window.prefs ?? (() => {
  const day = new Date().toLocaleDateString('sv');
  let state: PrefsState = {
    settings: { ...DEFAULT_SETTINGS, tried: ['chat', 'brief', 'tidy'], collected: ['tidy'], owned: ['gray', 'fox', 'glasses'], skin: { fur: 'fox', accessory: 'glasses' } }, quiet: false, vision: { supported: true, permission: 'granted' },
    brain: { state: 'ready', model: 'Gemma 4 12B' }, mail: false, calendar: true, city: false, focusEnds: 0,
    wallet: { acorns: 340, golden: 1 },
    today: {
      name: 'Jules', weather: 'ciel couvert, 24 à 31 °C à Hanoi',
      events: [{ time: '10:00', title: 'Point projet avec Paul', now: false }, { time: '15:30', title: 'Entretien Renzo Piano', now: false }],
      tasks: [
        { id: 'a', title: 'Rendre le devis', due: new Date(Date.now() - 86_400_000).toLocaleDateString('sv'), time: '', done: false },
        { id: 'b', title: 'Envoyer le portfolio', due: day, time: '18:00', done: false },
        { id: 'c', title: 'Appeler la banque', due: '', time: '', done: false },
        { id: 'd', title: 'Relire le mémoire', due: '', time: '', done: true },
      ],
      waiting: ['Paul Martin', 'Linh'],
    },
  };
  const subs: ((s: PrefsState) => void)[] = [];
  return {
    get: async () => state,
    set: (patch) => { state = { ...state, settings: { ...state.settings, ...patch } }; subs.forEach((cb) => cb(state)); },
    action: () => {},
    onChange: (cb) => { subs.push(cb); },
    onTab: () => {},
    journal: async () => ({
      days: {
        [day]: { apps: { 'Visual Studio Code': 142, 'Google Chrome': 96, Figma: 51, Slack: 18 }, focus: { sessions: 3, minutes: 100, stopped: 1 }, done: ['Rendre le devis'], mails: 4, chats: 7, note: '', acorns: 100 },
      },
      weeks: {}, acorns: { total: 137, golden: 1 }, firstSeen: Date.now() - 12 * 86_400_000,
    }),
    onJournal: () => {},
  };
})();

let t = T.fr;
const root = document.getElementById('app')!;
const MAIN: MainTab[] = ['home', 'guide', 'shop', 'journal', 'carnet'];
const GEAR: GearTab[] = ['general', 'connections'];
const TABS: SettingsTab[] = [...MAIN, ...GEAR];
const panes = {} as Record<SettingsTab, HTMLElement>;
const tabButtons = {} as Record<SettingsTab, HTMLButtonElement>;
let mainNav: HTMLElement;
let gearNav: HTMLElement;
let gearButton: HTMLButtonElement;
/** L'onglet principal où revenir en quittant la roue crantée */
let lastMain: MainTab = 'home';
let state: PrefsState;
let journal: JournalData | null = null;

function h<E extends HTMLElement = HTMLElement>(tag: string, props: Record<string, unknown> = {}, ...children: (Node | string)[]): E {
  const el = Object.assign(document.createElement(tag), props) as E;
  el.append(...children);
  return el;
}

/** Une icône pixel (une grille de « X »), à la couleur du texte */
function pixels(grid: string[], scale: number) {
  const d = grid.flatMap((row, y) => [...row.matchAll(/X+/g)].map((m) => `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`)).join('');
  const w = grid[0].length, hgt = grid.length;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('width', String(w * scale));
  svg.setAttribute('height', String(hgt * scale));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

// un engrenage : huit dents (quatre droites, quatre en biais), une couronne et le trou du milieu
const GEAR_ICON = [
  '.....XXXX.....',
  '.....XXXX.....',
  '..XX.XXXX.XX..',
  '..XXXXXXXXXX..',
  '...XXXXXXXX...',
  'XXXXXX..XXXXXX',
  'XXXXX....XXXXX',
  'XXXXX....XXXXX',
  'XXXXXX..XXXXXX',
  '...XXXXXXXX...',
  '..XXXXXXXXXX..',
  '..XX.XXXX.XX..',
  '.....XXXX.....',
  '.....XXXX.....',
];

function show(tab: SettingsTab) {
  const inGear = (GEAR as SettingsTab[]).includes(tab);
  if (!inGear) lastMain = tab as MainTab;
  for (const k of TABS) {
    panes[k].hidden = k !== tab;
    tabButtons[k].classList.toggle('on', k === tab);
  }
  mainNav.hidden = inGear;
  gearNav.hidden = !inGear;
  gearButton.classList.toggle('on', inGear);
  root.scrollTop = 0;
}

const set = (patch: Partial<Settings>) => api.set(patch);

function button(text: string, onClick: () => void, ghost = true) {
  const b = h<HTMLButtonElement>('button', { textContent: text, className: ghost ? 'ghost' : '' });
  b.addEventListener('click', onClick);
  return b;
}

/** Quelques choix exclusifs, en boutons accolés */
function seg<V extends string | number>(label: string, options: [V, string][], current: V, pick: (v: V) => void) {
  const row = h('div', { className: 'seg' });
  for (const [v, text] of options) {
    const b = button(text, () => pick(v), false);
    b.classList.toggle('on', v === current);
    row.append(b);
  }
  return [h('div', { className: 'label' }, label), row];
}

/** Un interrupteur avec son explication (ou un avertissement) */
function toggle(label: string, hint: string, on: boolean, change: (on: boolean) => void, warn = '') {
  const box = h<HTMLInputElement>('input', { type: 'checkbox', checked: on });
  box.addEventListener('change', () => change(box.checked));
  const text = h('span', {}, h('b', {}, label));
  if (warn || hint) text.append(h('small', { className: warn ? 'warn' : '' }, warn || hint));
  return h('label', { className: 'switch' }, box, text);
}

/** Un petit gland dessiné en pixels */
function acornIcon(golden = false) {
  const c = h<HTMLCanvasElement>('canvas', { width: 30, height: 30, className: 'acorn' });
  drawGrid(c.getContext('2d')!, golden ? GOLDEN_ACORN : ACORN, 0, 0, 3);
  return c;
}

// ---------- Aujourd'hui ----------

/** « aujourd'hui », « demain », « lun. 3 nov. » ; `late` si c'est passé */
function dueLabel(due: string) {
  const today = new Date().toLocaleDateString('sv');
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('sv');
  if (due === today) return { text: t.today, late: false };
  if (due === tomorrow) return { text: t.tomorrow, late: false };
  const d = new Date(`${due}T12:00`).toLocaleDateString(LOCALE[state.settings.lang], { weekday: 'short', day: 'numeric', month: 'short' });
  return { text: d, late: due < today };
}

function renderDay() {
  const d = state.today;
  const sec = h('section', { className: 'day' }, h('h2', {}, t.day));
  for (const e of d.events) {
    sec.append(h('div', { className: 'line' }, h('span', { className: 'when' }, e.time || t.allDay), h('span', {}, e.title, ...(e.now ? [h('em', {}, ` · ${t.now}`)] : []))));
  }
  if (d.waiting.length) sec.append(h('p', { className: 'waiting' }, t.waiting(d.waiting)));
  if (!d.events.length && !d.waiting.length) sec.append(h('p', { className: 'empty' }, t.nothingToday));
  return sec;
}

/** La session de travail : la lancer (25 / 50 min), ou voir où elle en est et l'arrêter */
function renderSession() {
  const sec = h('section', { className: 'session', id: 'session' }, h('h2', {}, t.session));
  if (state.focusEnds) {
    const at = new Date(state.focusEnds).toLocaleTimeString(LOCALE[state.settings.lang], { hour: '2-digit', minute: '2-digit' });
    sec.append(h('p', {}, t.sessionOn(at)), h('div', { className: 'buttons' }, button(t.stop, () => api.action('focusStop'))));
  } else {
    // la durée au curseur, de 5 en 5 minutes ; la dernière choisie est gardée
    const minutes = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${String(n % 60).padStart(2, '0')}` : ''}` : `${n} min`);
    const slider = h<HTMLInputElement>('input', { type: 'range', min: '5', max: '120', step: '5', value: String(state.settings.focusMinutes), className: 'slider' });
    const value = h('b', { className: 'slider-value' }, minutes(state.settings.focusMinutes));
    slider.addEventListener('input', () => { value.textContent = minutes(Number(slider.value)); });
    slider.addEventListener('change', () => set({ focusMinutes: Number(slider.value) }));
    sec.append(h('p', { className: 'empty' }, t.sessionHint),
      h('div', { className: 'session-pick' }, slider, value, button(t.launch, () => api.action('focusStart', slider.value), false)));
  }
  return sec;
}

const CHECK = ['.......X', '......XX', 'X....XX.', 'XX..XX..', '.XXXX...', '..XX....'];

/** Une case pixel : vide, ou cochée */
function tick(done: boolean, toggle: () => void) {
  const b = h<HTMLButtonElement>('button', { className: `tick${done ? ' on' : ''}` });
  if (done) b.append(pixels(CHECK, 2));
  b.addEventListener('click', toggle);
  return b;
}

/** Une pastille de date qui ouvre le calendrier ; `pick` reçoit AAAA-MM-JJ (ou vide si on l'efface) */
function dateChip(due: string, time: string, empty: string, pick: (due: string) => void) {
  const picker = h<HTMLInputElement>('input', { type: 'date', value: due, className: 'picker', tabIndex: -1 });
  picker.addEventListener('change', () => pick(picker.value));
  const label = due ? dueLabel(due) : { text: empty, late: false };
  // aujourd'hui avec une heure : l'heure suffit (le groupe dit déjà « Aujourd'hui »)
  const text = due && time && label.text === t.today ? time : `${label.text}${time ? ` · ${time}` : ''}`;
  const chip = h<HTMLButtonElement>('button', { className: `chip${label.late ? ' late' : ''}${due ? '' : ' unset'}`, textContent: text });
  chip.addEventListener('click', () => picker.showPicker());
  return h('span', { className: 'chip-box' }, chip, picker);
}

/** Le titre d'une tâche : du texte, qui devient un champ au clic (Entrée ou clic ailleurs pour garder) */
function taskName(id: string, title: string, done: boolean) {
  const span = h('span', { className: 'name', textContent: title, title: done ? '' : t.rename });
  if (done) return span;
  span.addEventListener('click', () => {
    const input = h<HTMLInputElement>('input', { type: 'text', value: title, className: 'name', maxLength: 200 });
    const keep = () => {
      if (input.value.trim() && input.value.trim() !== title) api.action('taskEdit', JSON.stringify({ id, title: input.value }));
      input.replaceWith(span);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = title; input.blur(); e.stopPropagation(); }
    });
    input.addEventListener('blur', keep, { once: true });
    span.replaceWith(input);
    input.focus();
    input.select();
  });
  return span;
}

/** Les tâches en train d'être découpées (le bouton affiche « … » en attendant) */
const splitting = new Set<string>();

/** Ta liste, rangée : en retard, aujourd'hui, à venir, sans date, puis ce qui est fait aujourd'hui ;
 * les étapes d'une tâche découpée sont rangées sous elle */
function renderList() {
  const all = state.today.tasks;
  const tasks = all.filter((k) => !k.parent);
  const stepsOf = (id: string) => all.filter((k) => k.parent === id);
  const open = tasks.filter((k) => !k.done);
  const sec = h('section', { className: 'todo' }, h('h2', {}, t.list, ...(open.length ? [h('small', { className: 'count' }, t.toDo(open.length))] : [])));

  // ajouter : le titre, une date si on veut, Entrée
  let newDue = '';
  const title = h<HTMLInputElement>('input', { type: 'text', placeholder: t.listAdd, maxLength: 200, className: 'new-task' });
  const chipSlot = h('span');
  const drawChip = () => chipSlot.replaceChildren(dateChip(newDue, '', t.setDate, (d) => { newDue = d; drawChip(); }));
  drawChip();
  const add = () => {
    if (!title.value.trim()) return title.focus();
    api.action('taskAdd', JSON.stringify({ title: title.value, due: newDue }));
    title.value = '';
    // la liste va se redessiner avec la nouvelle tâche : le curseur reste dans le champ
    refocusAdd = true;
    newDue = '';
    drawChip();
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  sec.append(h('div', { className: 'add' }, title, chipSlot, button(t.add, add, false)));

  const today = new Date().toLocaleDateString('sv');
  // les tâches sans date viennent en dernier, sans titre de groupe
  const groups: [keyof typeof t.groups | null, typeof tasks][] = [
    ['late', open.filter((k) => k.due && k.due < today)],
    ['today', open.filter((k) => k.due === today)],
    ['soon', open.filter((k) => k.due > today)],
    [null, open.filter((k) => !k.due)],
    ['done', tasks.filter((k) => k.done)],
  ];
  for (const [g, list] of groups) {
    if (!list.length) continue;
    sec.append(g ? h('div', { className: `group group-${g}` }, t.groups[g]) : h('div', { className: 'group' }));
    for (const k of list) {
      const steps = stepsOf(k.id);
      const row = h('div', { className: `task${k.done ? ' done' : ''}` },
        tick(k.done, () => api.action(k.done ? 'taskUndo' : 'taskDone', k.id)),
        taskName(k.id, k.title, k.done));
      if (steps.length) row.append(h('span', { className: 'progress' }, `${steps.filter((x) => x.done).length}/${steps.length}`));
      if (!k.done) {
        // la date, puis les actions dans une colonne de largeur fixe : les pastilles restent alignées
        const actions = h('span', { className: 'row-actions' });
        if (!steps.length) {
          // découper en étapes : le cerveau propose, les étapes arrivent sous la tâche
          const split = h<HTMLButtonElement>('button', { className: 'split', title: t.splitHint, textContent: splitting.has(k.id) ? '…' : t.split });
          split.disabled = splitting.has(k.id) || state.brain.state !== 'ready';
          split.addEventListener('click', () => {
            splitting.add(k.id);
            api.action('taskSplit', k.id);
            split.textContent = '…';
            split.disabled = true;
            // s'il n'y arrive pas, le bouton revient
            setTimeout(() => { if (splitting.delete(k.id)) renderAll(); }, 60_000);
          });
          actions.append(split);
        } else splitting.delete(k.id);
        const remove = h<HTMLButtonElement>('button', { className: 'remove', title: t.removeTask, textContent: '×' });
        remove.addEventListener('click', () => api.action('taskRemove', k.id));
        actions.append(remove);
        row.append(dateChip(k.due, k.time, t.setDate, (due) => api.action('taskEdit', JSON.stringify({ id: k.id, due }))), actions);
      }
      sec.append(row);
      if (k.done) continue;
      for (const st of steps) {
        const stepRow = h('div', { className: `task step${st.done ? ' done' : ''}` },
          tick(st.done, () => api.action(st.done ? 'taskUndo' : 'taskDone', st.id)),
          taskName(st.id, st.title, st.done));
        if (!st.done) {
          const remove = h<HTMLButtonElement>('button', { className: 'remove', title: t.removeTask, textContent: '×' });
          remove.addEventListener('click', () => api.action('taskRemove', st.id));
          stepRow.append(h('span', { className: 'row-actions' }, remove));
        }
        sec.append(stepRow);
      }
    }
  }
  if (!tasks.length) sec.append(h('p', { className: 'empty' }, t.listEmpty));
  return sec;
}

function renderHome() {
  const s = state;
  const hour = new Date().getHours();
  const date = new Date().toLocaleDateString(LOCALE[s.settings.lang], { weekday: 'long', day: 'numeric', month: 'long' });
  const sections: HTMLElement[] = [h('div', { className: 'hello' },
    h('b', {}, `${t.greet(hour)}${s.today.name ? ` ${s.today.name}` : ''} !`),
    h('span', {}, [date, s.today.weather].filter(Boolean).join(' · ')))];

  // ce qu'il reste à brancher (les étapes faites disparaissent, la section aussi)
  const steps: [keyof typeof t.steps, boolean, () => void][] = [
    ['brain', s.brain.state !== 'missing' && s.brain.state !== 'error', () => api.action('downloadBrain')],
    ['city', s.city, () => show('carnet')],
    ['mail', s.mail, () => show('connections')],
    ['calendar', s.calendar, () => show('connections')],
  ];
  const todo = steps.filter(([, done]) => !done);
  if (todo.length) {
    const start = h('section', {}, h('h2', {}, t.start));
    for (const [k, , then] of todo) {
      const [title, why, action] = t.steps[k];
      start.append(h('div', { className: 'step' }, h('span', {}, h('b', {}, title), h('small', {}, why)), button(action, then, false)));
    }
    sections.push(start);
  }

  sections.push(renderDay(), renderSession(), renderList());

  // les glands
  const a = journal?.acorns ?? { total: 0, golden: 0 };
  const todayAcorns = journal?.days[new Date().toLocaleDateString('sv')]?.acorns ?? 0;
  sections.push(h('section', { className: 'acorns' },
    acornIcon(), h('span', {}, h('b', {}, t.acorns(a.total, a.golden)), h('small', {}, t.acornsToday(todayAcorns) + t.acornsHint)),
    ...(a.golden ? [acornIcon(true)] : [])));
  panes.home.replaceChildren(...sections);
}

// ---------- Guide ----------

/** La récompense d'un essai : un bouton ; au clic, « +10 glands » monte et s'efface */
function reward(key: string) {
  const b = h<HTMLButtonElement>('button', { className: 'reward' }, acornIcon(), t.reward);
  b.addEventListener('click', () => {
    b.disabled = true;
    b.classList.add('gone');
    b.parentElement?.append(h('span', { className: 'reward-pop' }, t.rewardDone));
    // on encaisse après l'animation : la carte est redessinée dès que le compteur change
    setTimeout(() => api.action('collect', key), 900);
  }, { once: true });
  return b;
}

function renderGuide() {
  const tried = new Set(state.settings.tried);
  const collected = new Set(state.settings.collected);
  const card = (g: Guide) => {
    const off = g.needsMail && !state.mail;
    const b = button(off ? t.connect : t.try, () => {
      if (off) return show('connections');
      // la récompense se débloque quand la fonction sert vraiment (c'est Gilbert qui le voit)
      // la session se lance depuis Aujourd'hui : on y va, et le bloc clignote
      if (g.key === 'focus') {
        show('home');
        const el = document.getElementById('session');
        el?.scrollIntoView({ block: 'center' });
        el?.classList.remove('flash');
        void el?.offsetWidth;
        el?.classList.add('flash');
        return;
      }
      api.action(...g.act);
    }, false);
    b.className = 'try';
    return h('div', { className: `card${tried.has(g.key) ? ' tried' : ''}` },
      h('b', {}, g.title),
      h('p', {}, g.how),
      ...(g.say ? [h('q', {}, g.say)] : []),
      h('div', { className: 'card-actions' }, b, ...(tried.has(g.key) && !collected.has(g.key) ? [reward(g.key)] : [])));
  };
  const ask = ['chat', 'focus', 'list', 'remind', 'mail', 'music'];
  const done = t.guide.filter((g) => tried.has(g.key)).length;
  panes.guide.replaceChildren(h('section', {},
    h('h2', {}, t.guideTitle, h('small', { className: 'count' }, t.tried(done, t.guide.length))),
    h('p', { className: 'empty' }, t.rewardHint),
    h('h3', {}, t.ask), h('div', { className: 'cards' }, ...t.guide.filter((g) => ask.includes(g.key)).map(card)),
    h('h3', {}, t.auto), h('div', { className: 'cards' }, ...t.guide.filter((g) => !ask.includes(g.key)).map(card))));
}

// ---------- Réglages (derrière la roue crantée) ----------

function renderGeneral() {
  const s = state.settings;

  const character = h('section', {}, h('h2', {}, t.character),
    ...seg<Lang>(t.lang, [['fr', 'Français'], ['en', 'English'], ['vi', 'Tiếng Việt']], s.lang, (lang) => set({ lang })),
    ...seg<Humor>(t.humor, [['sober', t.humors.sober], ['normal', t.humors.normal], ['unbearable', t.humors.unbearable]], s.humor, (humor) => set({ humor })),
    ...seg<Size>(t.size, [['S', t.sizes.S], ['M', t.sizes.M], ['L', t.sizes.L]], s.size, (size) => set({ size })),
    ...seg<number>(t.hide, ([25, 60, 180, 0] as const).map((n) => [n, t.hides[n]] as [number, string]), s.hideAfterSec, (hideAfterSec) => set({ hideAfterSec })),
    toggle(t.sound, '', !s.muted, (on) => set({ muted: !on })),
  );

  const allowed = h('section', {}, h('h2', {}, t.allowed));
  const keys = (['vision', 'clipboard', 'messages', 'tidy', 'musicComments', 'journal', 'moods'] as const)
    // les messageries : seulement sur Mac (la pastille des applis)
    .filter((k) => (k !== 'vision' || state.vision.supported) && (k !== 'messages' || /Mac/.test(navigator.platform)));
  for (const k of keys) {
    const [label, hint] = t.switches[k];
    const denied = k === 'vision' && s.vision && state.vision.permission !== 'granted' ? t.visionDenied : '';
    allowed.append(toggle(label, hint, s[k], (on) => set({ [k]: on }), denied));
  }

  const b = state.brain;
  const brainText = b.state === 'ready' ? t.brainState.ready(b.model)
    : b.state === 'downloading' ? t.brainState.downloading(Math.round(b.progress * 100))
    : b.state === 'error' ? t.brainState.error(b.message)
    : b.state === 'loading' ? t.brainState.loading : t.brainState.missing;
  const brain = h('section', {}, h('h2', {}, t.brain), h('p', {}, brainText), h('p', { className: 'empty' }, t.voice),
    ...(b.state === 'missing' || b.state === 'error' ? [h('div', { className: 'buttons' }, button(t.download, () => api.action('downloadBrain'), false))] : []));

  const data = h('section', {}, h('h2', {}, t.data), h('p', { className: 'empty' }, t.dataHint),
    h('div', { className: 'buttons' }, button(t.openData, () => api.action('openData'))));

  const [mailLabel, mailHint] = t.switches.mailPrimaryOnly;
  const mails = h('section', {}, h('h2', {}, t.mails), toggle(mailLabel, mailHint, s.mailPrimaryOnly, (on) => set({ mailPrimaryOnly: on })));

  panes.general.replaceChildren(character, allowed, mails, brain, data);
}

/** Tu écris dans un champ de cette page (un renommage, une tâche pas encore ajoutée) : on ne la reconstruit pas sous tes doigts */
const typingIn = (el: HTMLElement) => {
  const a = document.activeElement as HTMLInputElement | null;
  return Boolean(a && el.contains(a) && a.tagName === 'INPUT' && a.type === 'text' && (a.value || !a.classList.contains('new-task')));
};
let homeStale = false;
/** On vient d'ajouter une tâche : après le redessin, le curseur revient dans le champ */
let refocusAdd = false;

function renderAll() {
  if (typingIn(panes.home)) homeStale = true;
  else {
    renderHome();
    if (refocusAdd) panes.home.querySelector<HTMLInputElement>('input.new-task')?.focus();
    refocusAdd = false;
  }
  renderGuide();
  renderShop(panes.shop, state, state.settings.lang, (a, id) => api.action(a, id));
  renderGeneral();
  if (journal) renderJournal(panes.journal, journal, state.settings.lang, state.settings.journal);
}

function closeButton() {
  const b = h<HTMLButtonElement>('button', { className: 'close' }, h('i'));
  b.setAttribute('aria-label', t.close);
  b.addEventListener('click', () => window.close());
  return b;
}

api.get().then((s) => {
  state = s;
  t = T[s.settings.lang] ?? T.fr;
  document.documentElement.lang = s.settings.lang;
  for (const k of TABS) panes[k] = h('div', { className: `pane pane-${k}` });
  mainNav = h('nav', { className: 'tabs' });
  for (const k of MAIN) {
    tabButtons[k] = button(t.tabs[k], () => show(k), false);
    mainNav.append(tabButtons[k]);
  }
  gearNav = h('nav', { className: 'tabs gear-tabs' }, button(`‹ ${t.back}`, () => show(lastMain)));
  for (const k of GEAR) {
    tabButtons[k] = button(t.gear[k], () => show(k), false);
    gearNav.append(tabButtons[k]);
  }
  gearButton = h<HTMLButtonElement>('button', { className: 'gear', title: t.gearTitle }, pixels(GEAR_ICON, 2));
  gearButton.setAttribute('aria-label', t.gearTitle);
  gearButton.addEventListener('click', () => show(gearButton.classList.contains('on') ? lastMain : 'general'));
  root.replaceChildren(
    h('header', {}, h('img', { src: head, alt: '', className: 'logo' }), h('h1', {}, 'Gilbert'), gearButton, closeButton()),
    mainNav, gearNav, ...TABS.map((k) => panes[k]),
  );
  panes.home.addEventListener('focusout', () => setTimeout(() => {
    if (homeStale && !typingIn(panes.home)) { homeStale = false; renderHome(); }
  }, 0));
  mountCarnet(panes.carnet);
  mountConnections(panes.connections);
  renderAll();
  api.journal().then((d) => { journal = d; renderAll(); });
  const first = location.hash.slice(1) as SettingsTab;
  show(TABS.includes(first) ? first : 'home');
});

api.onChange((s) => {
  const relang = s.settings.lang !== state.settings.lang;
  state = s;
  // changement de langue : on reconstruit toute la fenêtre
  if (relang) location.reload();
  else renderAll();
});
api.onJournal((d) => { journal = d; renderAll(); });
api.onTab(show);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.close(); });
