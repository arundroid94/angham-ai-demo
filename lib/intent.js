// lib/intent.js — mock intent parser + catalog search (no AI yet).

const { catalog, playlistCard, podcastCard, artistCard } = require("./catalog");

/* ===================== VOCABULARY ===================== */
// Each key is the canonical value; the array lists trigger words.

const MOODS = {
  Relaxing: ["relax", "relaxing", "calm", "soothing", "calming", "mellow"],
  Chill: ["chill", "chilled", "laid back", "lounge"],
  Energetic: ["energetic", "upbeat", "energy", "hype", "pump", "lively"],
  Happy: ["happy", "feel good", "cheerful", "joyful"],
  Romantic: ["romantic", "romance", "love songs"],
  Sad: ["sad", "heartbreak", "melancholy", "emotional"],
  Party: ["party", "dance", "club"],
  Spiritual: ["spiritual", "worship", "devotional"],
};

const ACTIVITIES = {
  Driving: ["driving", "drive", "road trip", "car", "commute"],
  Workout: ["workout", "gym", "running", "exercise", "run", "training"],
  Focus: ["focus", "study", "studying", "work", "working", "concentration"],
  Sleep: ["sleep", "sleeping", "bedtime"],
  Morning: ["morning"],
  Night: ["night", "late night"],
};

const LANGUAGES = {
  arabic: ["arabic", "arab"],
  english: ["english"],
  hindi: ["hindi", "bollywood", "indian"],
};

const GENRES = {
  Pop: ["pop"],
  Khaleeji: ["khaleeji", "gulf"],
  Tarab: ["tarab"],
  "Hip Hop": ["hip hop", "hiphop", "rap"],
  Jazz: ["jazz"],
  Classical: ["classical", "orchestra"],
  Electronic: ["electronic", "edm", "techno", "house"],
  Rock: ["rock"],
  "R&B": ["r&b", "rnb", "soul"],
  Folk: ["folk"],
  Bollywood: ["bollywood"],
  Islamic: ["islamic", "quran", "nasheed", "religious"],
  "Lo-Fi": ["lofi", "lo-fi", "lo fi"],
  Reggae: ["reggae"],
  Latin: ["latin", "salsa"],
};

const PODCAST_CATEGORIES = {
  Sports: ["sport", "sports", "football", "soccer"],
  Technology: ["tech", "technology"],
  Culture: ["culture", "cultural"],
  Religion: ["religion", "faith", "islamic", "quran"],
  Business: ["business", "startup", "finance", "money"],
  Health: ["health", "wellness", "fitness"],
  Comedy: ["comedy", "funny", "comedian"],
  News: ["news"],
  Education: ["education", "learn", "learning"],
  "True Crime": ["crime", "true crime", "mystery"],
};

/* ===================== PARSER ===================== */

function findKey(dict, q) {
  for (const [key, words] of Object.entries(dict)) {
    if (words.some((w) => q.includes(w))) return key;
  }
  return null;
}

// Returns ONLY the fields the user actually mentioned (so merging works for follow-ups).
function parseIntent(query) {
  const q = " " + query.toLowerCase() + " ";
  const intent = {};

  const mood = findKey(MOODS, q);
  if (mood) intent.mood = mood;

  const activity = findKey(ACTIVITIES, q);
  if (activity) intent.activity = activity;

  const language = findKey(LANGUAGES, q);
  if (language) intent.language = language;

  // Khaleeji / Gulf imply Arabic + the Khaleeji genre.
  if (q.includes("khaleeji") || q.includes("gulf")) {
    intent.language = "arabic";
    intent.genre = "Khaleeji";
  }

  const genre = findKey(GENRES, q);
  if (genre && !intent.genre) intent.genre = genre;

  // Content type
  if (q.includes("podcast")) {
    intent.contentType = "podcast";
    const cat = findKey(PODCAST_CATEGORIES, q);
    if (cat) intent.category = cat;
  } else if (q.includes(" artist")) {
    intent.contentType = "artist";
  } else if (q.includes("song") || q.includes("music") || q.includes("playlist")) {
    intent.contentType = "music";
  }

  // Artist name (scan the catalog)
  const artist = catalog.artists.find((a) => q.includes(a.name.toLowerCase()));
  if (artist) intent.artist = artist.name;

  // Era / decade (e.g. "1970s", "70s")
  const era = query.match(/\b(19|20)\d{2}s?\b/) || query.match(/\b\d0s\b/);
  if (era) intent.era = era[0];

  return intent;
}

// Merge a follow-up onto the previous context. New fields win; unspecified ones persist.
function mergeIntent(context, parsed) {
  return { ...(context || {}), ...parsed };
}

// Decide whether a query is a follow-up refinement (merge with context)
// or a brand-new request (start fresh).
const REFINEMENT_TRIGGERS = ["make it", "more ", "less ", "instead", "also ",
  "include", "add ", "only ", "change to", "switch to", "rather", "but "];
const NEW_SEARCH_VERBS = ["play", "find", "recommend", "search", "discover",
  "show me", "get me", "i want", "put on"];

function isRefinement(query, hasContext) {
  if (!hasContext) return false;                      // nothing to refine
  const q = query.toLowerCase().trim();
  if (REFINEMENT_TRIGGERS.some((t) => q.includes(t))) return true;  // explicit refinement
  const startsWithSearch = NEW_SEARCH_VERBS.some((v) => q.startsWith(v));
  const wordCount = q.split(/\s+/).length;
  // Short phrases with no "search verb" (e.g. "more upbeat") are refinements too.
  return !startsWithSearch && wordCount <= 3;
}

/* ===================== SCORING ===================== */

function scorePlaylist(p, intent) {
  let s = 0;
  if (intent.language && p.language === intent.language) s += 3;
  if (intent.mood && p.mood === intent.mood) s += 3;
  if (intent.activity && p.mood === intent.activity) s += 2;
  if (intent.genre && p.genre === intent.genre) s += 3;
  if (intent.genre && p.tags.includes(intent.genre.toLowerCase())) s += 1;
  return s;
}
function scoreArtist(a, intent) {
  let s = 0;
  if (intent.artist && a.name === intent.artist) s += 10;
  if (intent.language && a.language === intent.language) s += 3;
  if (intent.genre && a.genres.includes(intent.genre)) s += 3;
  return s;
}
function scorePodcast(p, intent) {
  let s = 0;
  if (intent.language && p.language === intent.language) s += 3;
  if (intent.category && p.category === intent.category) s += 4;
  return s;
}

// Sort by score; if nothing matched, fall back to the first N (always return results).
function topItems(list, scoreFn, intent, n) {
  const scored = list.map((x) => ({ x, s: scoreFn(x, intent) }));
  const anyMatch = scored.some((o) => o.s > 0);
  scored.sort((a, b) => b.s - a.s);
  const chosen = anyMatch ? scored.filter((o) => o.s > 0) : scored;
  return chosen.slice(0, n).map((o) => o.x);
}

/* ===================== SEARCH + RESPONSE ===================== */

function searchCatalog(intent) {
  const contentType = intent.contentType || "music";
  const sections = [];

  if (contentType === "podcast") {
    sections.push({ type: "podcasts", title: "Podcasts",
      items: topItems(catalog.podcasts, scorePodcast, intent, 12).map(podcastCard) });
    sections.push({ type: "playlists", title: "You might also like",
      items: topItems(catalog.playlists, scorePlaylist, intent, 8).map(playlistCard) });
  } else if (contentType === "artist") {
    sections.push({ type: "artists", title: "Artists",
      items: topItems(catalog.artists, scoreArtist, intent, 12).map(artistCard) });
    sections.push({ type: "playlists", title: "Playlists",
      items: topItems(catalog.playlists, scorePlaylist, intent, 12).map(playlistCard) });
  } else {
    sections.push({ type: "playlists", title: "Playlists",
      items: topItems(catalog.playlists, scorePlaylist, intent, 12).map(playlistCard) });
    sections.push({ type: "artists", title: "Artists",
      items: topItems(catalog.artists, scoreArtist, intent, 12).map(artistCard) });
  }
  return sections;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function buildChips(intent) {
  const chips = [];
  if (intent.mood) chips.push(intent.mood);
  if (intent.activity && intent.activity !== intent.mood) chips.push(intent.activity);
  if (intent.language) chips.push(cap(intent.language));
  if (intent.genre) chips.push(intent.genre);
  if (intent.category) chips.push(intent.category);
  if (intent.artist) chips.push(intent.artist);
  if (intent.era) chips.push(intent.era);
  return chips;
}

function buildAiResponse(intent, contentType) {
  if (intent.artist) return `Here are top picks featuring ${intent.artist}.`;
  const what = contentType === "podcast" ? "podcasts" : contentType === "artist" ? "artists" : "playlists";
  const desc = [intent.mood ? intent.mood.toLowerCase() : "", intent.language ? cap(intent.language) : ""]
    .filter(Boolean).join(" ");
  let s = `Here are some ${desc} ${what}`.replace(/\s+/g, " ");
  if (intent.activity) s += ` for ${intent.activity.toLowerCase()}`;
  return s.trim() + ".";
}

function buildResponse(intent) {
  const contentType = intent.contentType || "music";
  const label = contentType === "podcast" ? "discover_podcasts"
    : contentType === "artist" ? "discover_artist" : "discover_music";
  return {
    action: "show_results",
    intent: { ...intent, intent: label, contentType }, // echoed back for context retention
    title: buildChips(intent).join(" ") || "Recommended for you",
    chips: buildChips(intent),
    aiResponse: buildAiResponse(intent, contentType),
    sections: searchCatalog(intent),
  };
}

/* ===================== VOICE COMMANDS (drill-down) ===================== */
const ORDINALS = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4,
  sixth: 5, seventh: 6, eighth: 7, ninth: 8, tenth: 9 };

function matchOrdinal(q) {
  for (const [w, i] of Object.entries(ORDINALS)) if (q.includes(w)) return i;
  const m = q.match(/\b(\d{1,2})\b/);
  if (m) { const n = parseInt(m[1], 10); if (n >= 1 && n <= 50) return n - 1; }
  if (q.includes("last")) return "last";
  return null;
}

function matchTypeWord(q) {
  if (q.includes("playlist")) return "playlist";
  if (q.includes("podcast")) return "podcast";
  if (q.includes("genre")) return "genre";
  if (q.includes("mood")) return "mood";
  return null;
}

function findCatalogByName(q) {
  const pl = catalog.playlists.find((p) => q.includes(p.title.toLowerCase()));
  if (pl) return { type: "playlist", id: pl.id, title: pl.title };
  const pod = catalog.podcasts.find((p) => q.includes(p.title.toLowerCase()));
  if (pod) return { type: "podcast", id: pod.id, title: pod.title };
  const g = catalog.genres.find((x) => q.includes(x.name.toLowerCase()));
  if (g) return { type: "genre", id: g.id, title: g.name };
  const m = catalog.moods.find((x) => q.includes(x.name.toLowerCase()));
  if (m) return { type: "mood", id: m.id, title: m.name };
  return null;
}

// Returns an action object for navigation/playback commands, or null (=> discovery).
function parseCommand(query, state) {
  const q = query.toLowerCase().trim();
  state = state || {};
  const results = state.results || [];
  const detail = state.detail || null;

  const ordinal = matchOrdinal(q);
  const isOpen = /^(open|show me|go to)\b/.test(q);
  const isPlay = /^(play|start|put on)\b/.test(q);
  if (!isOpen && !isPlay) return null;

  // 1) Play a track in the open detail by position: "play the third song/episode"
  if (isPlay && detail && ordinal !== null && /(song|track|episode|one)\b/.test(q)) {
    const idx = ordinal === "last" ? (detail.trackCount || 1) - 1 : ordinal;
    if (idx >= 0 && idx < (detail.trackCount || 0))
      return { action: "play_track", index: idx, aiResponse: `Playing track ${idx + 1}.` };
  }

  // 2) Play a track by name in the open detail: "play City Lights"
  if (isPlay && detail && detail.trackTitles) {
    const idx = detail.trackTitles.findIndex((t) => q.includes(t.toLowerCase()));
    if (idx >= 0) return { action: "play_track", index: idx, aiResponse: `Playing ${detail.trackTitles[idx]}.` };
  }

  // 3) Play the current collection: "play this playlist", "start this"
  if (isPlay && detail && detail.layout === "tracks" && /(this|that|\bit\b)/.test(q)) {
    return { action: "play_detail", target: { type: detail.type, id: detail.id }, aiResponse: `Playing ${detail.title}.` };
  }

  // 4) Open/play the Nth item on screen: "play the first playlist", "open the second podcast"
  if (ordinal !== null) {
    const typeWord = matchTypeWord(q);
    const list = results.filter((r) => !typeWord || r.type === typeWord);
    const idx = ordinal === "last" ? list.length - 1 : ordinal;
    const t = list[idx];
    if (t) {
      if (isPlay && (t.type === "playlist" || t.type === "podcast"))
        return { action: "play_detail", target: { type: t.type, id: t.id }, aiResponse: `Playing ${t.title}.` };
      return { action: "open_detail", target: { type: t.type, id: t.id }, aiResponse: `Opening ${t.title}.` };
    }
  }

  // 5) Open/play a named item: "open Arabic Drive", "play Khaleeji Nights"
  const match = findCatalogByName(q);
  if (match) {
    if (isPlay && (match.type === "playlist" || match.type === "podcast"))
      return { action: "play_detail", target: { type: match.type, id: match.id }, aiResponse: `Playing ${match.title}.` };
    if (isOpen)
      return { action: "open_detail", target: { type: match.type, id: match.id }, aiResponse: `Opening ${match.title}.` };
  }

  return null;
}

module.exports = { parseIntent, mergeIntent, buildResponse, isRefinement, parseCommand, findCatalogByName };