// player.js — real audio playback with a queue + mini player UI.

const Player = (function () {
  const audio = new Audio();
  let queue = [];
  let index = 0;
  let onChange = null; // callback(song, index) — lets the UI highlight the current track

  const el = {
    player: document.getElementById("miniPlayer"),
    art: document.getElementById("mpArt"),
    title: document.getElementById("mpTitle"),
    artist: document.getElementById("mpArtist"),
    fill: document.getElementById("mpFill"),
    playPause: document.getElementById("mpPlayPause"),
    icon: document.getElementById("mpIcon"),
    progress: document.querySelector(".mp-progress"),
  };

  const ICON_PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
  const ICON_PLAY = '<path d="M8 5v14l11-7z"/>';
  const setIcon = (playing) => (el.icon.innerHTML = playing ? ICON_PAUSE : ICON_PLAY);

  function load() {
    const song = queue[index];
    if (!song || !song.file) return;
    el.art.src = song.cover || "";
    el.title.textContent = song.title || "Unknown";
    el.artist.textContent = song.artist || "";
    audio.src = song.file;
    el.player.classList.add("show");
    document.body.classList.add("player-active");
    audio.play().catch((err) =>
      console.warn("Audio could not play — is the file in public/audio/?", err)
    );
    if (onChange) onChange(song, index);
  }

  function playQueue(songs, start = 0) {
    queue = songs || [];
    index = start;
    if (queue.length) load();
  }
  const playSong = (song) => playQueue([song], 0);
  const toggle = () => (audio.paused ? audio.play() : audio.pause());
  function next() { if (index < queue.length - 1) { index++; load(); } }

  audio.addEventListener("play", () => setIcon(true));
  audio.addEventListener("pause", () => setIcon(false));
  audio.addEventListener("timeupdate", () => {
    if (audio.duration) el.fill.style.width = (audio.currentTime / audio.duration) * 100 + "%";
  });
  audio.addEventListener("ended", () => { el.fill.style.width = "0%"; next(); });

  el.playPause.addEventListener("click", toggle);
  el.progress.addEventListener("click", (e) => {
    if (!audio.duration) return;
    const rect = el.progress.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  });

  return { playQueue, playSong, toggle, setOnChange: (cb) => (onChange = cb) };
})();