// Ce qui joue dans Spotify (ou Musique) et les commandes de lecture (macOS).
//   osascript -l JavaScript mac-music.js [status|playpause|next|previous]
//   → JSON { player, playing, title, artist, album } (player vide si rien n'est ouvert)
// On ne lance jamais l'appli : seulement si elle tourne déjà. La première fois, macOS demande
// l'autorisation de la piloter.
function run(argv) {
  const cmd = argv[0] || 'status';
  for (const name of ['Spotify', 'Music']) {
    const player = Application(name);
    if (!player.running()) continue;
    if (cmd === 'playpause') player.playpause();
    if (cmd === 'next') player.nextTrack();
    if (cmd === 'previous') player.previousTrack();
    if (cmd !== 'status') delay(0.4);
    const state = String(player.playerState());
    if (state === 'stopped') return JSON.stringify({ player: name, playing: false, title: '', artist: '', album: '' });
    const t = player.currentTrack;
    return JSON.stringify({ player: name, playing: state === 'playing', title: t.name(), artist: t.artist(), album: t.album() });
  }
  return JSON.stringify({ player: '', playing: false, title: '', artist: '', album: '' });
}
