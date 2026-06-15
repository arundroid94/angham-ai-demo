// lib/catalog.js — loads the JSON catalog once and exposes card normalizers.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
function load(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name + ".json"), "utf-8"));
}

const catalog = {
  songs: load("songs"),
  playlists: load("playlists"),
  artists: load("artists"),
  podcasts: load("podcasts"),
  genres: load("genres"),
  moods: load("moods"),
};

// Normalize each item into a uniform "card" shape for the frontend.
const playlistCard = (p) => ({ id: p.id, title: p.title, subtitle: "Playlist", image: p.cover, type: "playlist" });
const podcastCard  = (p) => ({ id: p.id, title: p.title, subtitle: p.host,     image: p.image, type: "podcast" });
const artistCard   = (a) => ({ id: a.id, title: a.name,  subtitle: "Artist",   image: a.image, type: "artist" });
const genreCard    = (g) => ({ id: g.id, title: g.name,  subtitle: "Genre",    image: g.image, type: "genre" });
const moodCard     = (m) => ({ id: m.id, title: m.name,  subtitle: "Mood",     image: m.image, type: "mood" });

function buildDetail(type, id) {
  if (type === "playlist") {
    const pl = catalog.playlists.find((p) => p.id === id);
    if (!pl) return null;
    const tracks = pl.songIds
      .map((sid) => catalog.songs.find((s) => s.id === sid))
      .filter(Boolean)
      .map((s) => ({ title: s.title, artist: s.artist, cover: s.cover, duration: s.duration, file: s.file }));
    return { type: "playlist", id: pl.id, title: pl.title, kicker: "PLAYLIST", cover: pl.cover, subtitle: pl.description, layout: "tracks", tracks };
  }
  if (type === "podcast") {
    const pod = catalog.podcasts.find((p) => p.id === id);
    if (!pod) return null;
    const tracks = pod.episodes.map((e) => ({ title: e.title, artist: pod.host, cover: pod.image, duration: e.duration, file: e.file }));
    return { type: "podcast", id: pod.id, title: pod.title, kicker: "PODCAST · " + pod.category, cover: pod.image, subtitle: "Hosted by " + pod.host, layout: "tracks", tracks };
  }
  if (type === "genre" || type === "mood") {
    const coll = type === "genre" ? catalog.genres : catalog.moods;
    const item = coll.find((x) => x.id === id);
    if (!item) return null;
    const key = type === "genre" ? "genre" : "mood";
    let matched = catalog.playlists.filter((p) => p[key] === item.name);
    if (matched.length === 0) matched = catalog.playlists.slice(0, 12);
    const cards = matched.slice(0, 18).map(playlistCard);
    return { type, id: item.id, title: item.name, kicker: type.toUpperCase(), cover: item.image, subtitle: cards.length + " playlists", layout: "cards", cards };
  }
  return null;
}

module.exports = { catalog, playlistCard, podcastCard, artistCard, genreCard, moodCard, buildDetail };
