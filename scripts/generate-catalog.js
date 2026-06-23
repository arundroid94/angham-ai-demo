// scripts/generate-catalog.js
// Run with: node scripts/generate-catalog.js
// Generates all JSON catalog files into the /data folder.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const img = (seed) => `https://picsum.photos/seed/${seed}/400/400`;

/* ========== SONGS (5 real playable) ========== */
const songs = [
  { id: "song-1", title: "Leil w Ahlam",  artist: "Demo Arabic",  language: "arabic",  duration: 212, file: "/audio/arabic-1.mp3",  cover: img("song-ar-1") },
  { id: "song-2", title: "Sahra",          artist: "Demo Arabic",  language: "arabic",  duration: 198, file: "/audio/arabic-2.mp3",  cover: img("song-ar-2") },
  { id: "song-3", title: "Midnight Drive", artist: "Demo English", language: "english", duration: 224, file: "/audio/english-1.mp3", cover: img("song-en-1") },
  { id: "song-4", title: "Golden Hour",    artist: "Demo English", language: "english", duration: 236, file: "/audio/english-2.mp3", cover: img("song-en-2") },
  { id: "song-5", title: "City Lights",    artist: "Demo English", language: "english", duration: 205, file: "/audio/english-3.mp3", cover: img("song-en-3") },
];
const allSongIds = songs.map((s) => s.id);
function pickSongs(language) {
  const preferred = language === "arabic" ? ["song-1", "song-2"] : ["song-3", "song-4", "song-5"];
  return [...new Set([...preferred, ...allSongIds])];
}

/* ========== GENRES (15) ========== */
const genreNames = ["Pop", "Khaleeji", "Tarab", "Hip Hop", "Jazz", "Classical", "Electronic",
  "Rock", "R&B", "Folk", "Bollywood", "Islamic", "Lo-Fi", "Reggae", "Latin"];
const genres = genreNames.map((name, i) => ({
  id: "genre-" + (i + 1),
  name,
  image: img("genre-" + name.replace(/\s+/g, "-").toLowerCase()),
}));

/* ========== MOODS (15) ========== */
const moodNames = ["Relaxing", "Energetic", "Focus", "Romantic", "Happy", "Chill", "Workout",
  "Sleep", "Party", "Sad", "Driving", "Study", "Morning", "Night", "Spiritual"];
const moodEmojis = ["😌", "⚡", "🎯", "❤️", "😄", "🍃", "💪", "😴", "🎉", "😢", "🚗", "📚", "🌅", "🌙", "🕌"];
const moods = moodNames.map((name, i) => ({
  id: "mood-" + (i + 1),
  name,
  emoji: moodEmojis[i],
  image: img("mood-" + name.toLowerCase()),
}));

/* ========== ARTISTS (50) ========== */
const arabicArtists = ["Amr Diab", "Fairuz", "Nancy Ajram", "Mohammed Abdu", "Elissa",
  "Kadim Al Sahir", "Abdul Majeed Abdullah", "Tamer Hosny", "Sherine", "Wael Kfoury",
  "Najwa Karam", "Rashed Al Majed", "Hussain Al Jassmi", "Assala Nasri", "Angham",
  "Mohamed Hamaki", "Saad Lamjarred", "Balqees", "Ahlam", "Diana Haddad",
  "Cheb Khaled", "Marwan Khoury", "Carole Samaha", "Ragheb Alama", "Majida El Roumi",
  "Abdullah Al Rowaished", "Mayada El Hennawy", "Latifa", "Samira Said", "Kazem Al Saher"];
const jazzArtists = ["Miles Davis", "Ella Fitzgerald", "Louis Armstrong", "Nina Simone",
  "Stan Getz", "John Coltrane", "Billie Holiday", "Diana Krall", "Norah Jones", "Frank Sinatra"];
const bollywoodArtists = ["Lata Mangeshkar", "A.R. Rahman", "Kishore Kumar"];
const popArtists = ["Adele", "Ed Sheeran", "Coldplay", "The Weeknd", "Dua Lipa", "Michael Bublé"];
const reggaeArtists = ["Bob Marley"];

const artists = [];
function addArtist(name, language, genre) {
  const id = "artist-" + (artists.length + 1);
  artists.push({
    id, name, language, genres: [genre],
    image: img("artist-" + name.replace(/\s+/g, "-").toLowerCase()),
    monthlyListeners: 120000 + ((artists.length * 53219) % 9000000),
  });
}
arabicArtists.forEach((n, i) => addArtist(n, "arabic", ["Pop", "Khaleeji", "Tarab"][i % 3]));
jazzArtists.forEach((n) => addArtist(n, "english", "Jazz"));
bollywoodArtists.forEach((n) => addArtist(n, "hindi", "Bollywood"));
popArtists.forEach((n) => addArtist(n, "english", "Pop"));
reggaeArtists.forEach((n) => addArtist(n, "english", "Reggae"));

/* ========== PLAYLISTS (100) ========== */
const curated = [
  { title: "Arabic Drive", language: "arabic" }, { title: "Desert Chill", language: "arabic" },
  { title: "Khaleeji Nights", language: "arabic" }, { title: "Morning Energy", language: "english" },
  { title: "Relax & Focus", language: "english" }, { title: "Arabic Hits", language: "arabic" },
  { title: "Golden Classics", language: "english" }, { title: "Sunset Vibes", language: "english" },
  { title: "Amr Diab Essentials", language: "arabic" }, { title: "Fairuz Mornings", language: "arabic" },
  { title: "Tarab Classics", language: "arabic" }, { title: "Cairo Pop", language: "arabic" },
  { title: "Beirut Nights", language: "arabic" }, { title: "Arabic Acoustic", language: "arabic" },
  { title: "Ramadan Nights", language: "arabic" }, { title: "Oud & Strings", language: "arabic" },
];
const prefixes = ["Arabic", "Khaleeji", "Desert", "Sunset", "Late Night", "Morning", "Ramadan",
  "Beirut", "Cairo", "Gulf", "Oud", "Tarab", "Chill", "Drive", "Workout", "Focus", "Romance",
  "Golden", "Classic", "Summer"];
const suffixes = ["Vibes", "Nights", "Hits", "Mix", "Sessions", "Essentials", "Lounge",
  "Grooves", "Flow", "Energy"];
const arabicPrefixes = ["Arabic", "Khaleeji", "Desert", "Ramadan", "Beirut", "Cairo", "Gulf", "Oud", "Tarab"];

const playlists = [];
function addPlaylist(title, language, i) {
  const id = "playlist-" + (playlists.length + 1);
  const mood = moodNames[i % moodNames.length];
  const genre = genreNames[i % genreNames.length];
  playlists.push({
    id, title,
    description: `${mood} ${genre.toLowerCase()} vibes`,
    cover: img("pl-" + id),
    language, mood, genre,
    tags: [language, mood.toLowerCase(), genre.toLowerCase()],
    songIds: pickSongs(language),
  });
}
curated.forEach((c, i) => addPlaylist(c.title, c.language, i));
let idx = curated.length;
outer:
for (const pre of prefixes) {
  for (const suf of suffixes) {
    if (playlists.length >= 100) break outer;
    const title = `${pre} ${suf}`;
    if (playlists.some((p) => p.title === title)) continue;
    const language = arabicPrefixes.includes(pre) ? "arabic" : "english";
    addPlaylist(title, language, idx++);
  }
}

/* ========== PODCASTS (30) ========== */
const podcastNames = ["Sports Majlis", "Kalam Riyadi", "Tech in Arabic", "The Culture Cast",
  "Daily Khaleeji", "Mindful Mornings", "Business Now", "Health Talks", "Faith & Life",
  "Comedy Hour", "Morning News Brief", "Startup Stories", "History Unfolded", "Crime Files",
  "Science Simplified", "The Football Show", "Wellness Weekly", "Money Matters", "Deen Daily",
  "Laugh Lounge", "Gulf Voices", "Cinema Talk", "Quran Reflections", "Tech Trends",
  "Athlete Diaries", "Mind & Body", "Global Affairs", "The Founder", "Untold Mysteries", "Learn Arabic"];
const podcastCategories = [
  "Sports", "Sports", "Technology", "Culture", "News",
  "Health", "Business", "Health", "Religion", "Comedy",
  "News", "Business", "Education", "True Crime", "Education",
  "Sports", "Health", "Business", "Religion", "Comedy",
  "Culture", "Culture", "Religion", "Technology", "Sports",
  "Health", "News", "Business", "True Crime", "Education",
];
const hosts = ["Sara Al-Amri", "Omar Khalil", "Layla Hassan", "Yusuf Rahman", "Mariam Saleh",
  "Khalid Nasser", "Dana Fahad", "Tariq Aziz"];

const podcasts = podcastNames.map((title, i) => {
  const episodeCount = 6 + (i % 5);
  const episodes = Array.from({ length: episodeCount }, (_, e) => ({
    id: `podcast-${i + 1}-ep-${e + 1}`,
    title: `Episode ${e + 1}`,
    duration: 600 + ((e * 137) % 1800),
    file: songs[(i + e) % songs.length].file,
  }));
  return {
    id: "podcast-" + (i + 1),
    title,
    host: hosts[i % hosts.length],
    category: podcastCategories[i],
    language: i % 2 === 0 ? "arabic" : "english",
    image: img("pod-" + (i + 1)),
    episodes,
  };
});

/* ========== WRITE FILES ========== */
const files = { songs, playlists, artists, podcasts, genres, moods };
Object.entries(files).forEach(([name, data]) => {
  fs.writeFileSync(path.join(DATA_DIR, name + ".json"), JSON.stringify(data, null, 2));
  console.log(`✅ data/${name}.json  (${data.length} items)`);
});
console.log("Done.");