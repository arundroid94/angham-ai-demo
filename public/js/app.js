// app.js — catalog rendering, drill-down, voice commands, intent flow.

const PLAY_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const DETAIL_TYPES = ["playlist", "podcast", "genre", "mood"];

const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg,#efeaf6,#e2dcef)",
  "linear-gradient(135deg,#eaeef6,#dde6f1)",
  "linear-gradient(135deg,#f3ecf1,#e7dcea)",
  "linear-gradient(135deg,#eaf0ef,#dde7e6)",
  "linear-gradient(135deg,#f1ece9,#e7ddd9)",
];
function gradientFor(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_GRADIENTS[h % FALLBACK_GRADIENTS.length];
}

// Show a subtle gradient if an image errors OR doesn't load within 1.5s (picsum can hang).
function applyImgFallback(imgEl, bgTargetEl, key) {
  let settled = false;
  const fallback = () => { if (settled) return; settled = true; bgTargetEl.style.background = gradientFor(key); };
  imgEl.onload = () => { settled = true; imgEl.classList.add("loaded"); };
  imgEl.onerror = fallback;
  setTimeout(fallback, 1500);
}

let songsCache = [];
let currentDetail = null;
let detailStack = [];

// On-screen state (so the backend can resolve "the third", "this playlist", etc.)
let homeItems = [];
let resultsItems = [];
let detailCardItems = [];
let detailState = null;
const mapItems = (arr) => arr.map((i) => ({ type: i.type, id: i.id, title: i.title }));

/* ===================== CARD RENDERING ===================== */
function makeCard(item) {
  const card = document.createElement("div");
  card.className = "card" + (item.type === "artist" ? " artist" : "");

  const art = document.createElement("div");
  art.className = "card-art";

  const img = document.createElement("img");
  img.src = item.image;
  img.alt = item.title;
  img.loading = "lazy";
  applyImgFallback(img, art, item.title);

  const play = document.createElement("button");
  play.className = "play-btn";
  play.innerHTML = PLAY_SVG;
  play.setAttribute("aria-label", "Play " + item.title);
  play.addEventListener("click", (e) => { e.stopPropagation(); playFromCard(item); });

  art.append(img, play);

  const t = document.createElement("div");
  t.className = "card-title";
  t.textContent = item.title;

  const s = document.createElement("div");
  s.className = "card-subtitle";
  s.textContent = item.subtitle;

  card.append(art, t, s);

  if (DETAIL_TYPES.includes(item.type)) {
    card.addEventListener("click", () => openDetail(item.type, item.id));
  }
  return card;
}

async function playFromCard(item) {
  if (item.type === "playlist" || item.type === "podcast") {
    try {
      const d = await API.getDetail(item.type, item.id);
      if (d.tracks && d.tracks.length) return Player.playQueue(d.tracks, 0);
    } catch (err) { console.error(err); }
  }
  if (songsCache.length) Player.playSong(songsCache[Math.floor(Math.random() * songsCache.length)]);
}

function renderRow(sectionId, items) {
  const row = document.getElementById(sectionId);
  if (!row) return;
  row.innerHTML = "";
  items.forEach((item) => row.appendChild(makeCard(item)));
}

/* ===================== VIEW MANAGER ===================== */
const homeView = document.getElementById("homeView");
const resultsView = document.getElementById("resultsView");
const detailView = document.getElementById("detailView");
let currentView = "home";

function setView(v) {
  if (v !== "detail") { currentView = v; detailStack = []; detailState = null; }
  homeView.hidden = v !== "home";
  resultsView.hidden = v !== "results";
  detailView.hidden = v !== "detail";
}

// Build the snapshot of what's on screen for the backend.
function buildState() {
  const view = detailView.hidden ? (resultsView.hidden ? "home" : "results") : "detail";
  let results = homeItems;
  if (view === "results") results = resultsItems;
  else if (view === "detail") results = currentDetail && currentDetail.layout === "cards" ? detailCardItems : [];
  return { view, results, detail: view === "detail" ? detailState : null };
}

/* ===================== DETAIL VIEW ===================== */
const detailCover = document.getElementById("detailCover");
const detailKicker = document.getElementById("detailKicker");
const detailTitle = document.getElementById("detailTitle");
const detailDesc = document.getElementById("detailDesc");
const detailPlay = document.getElementById("detailPlay");
const detailBack = document.getElementById("detailBack");
const detailBody = document.getElementById("detailBody");

const fmtTime = (sec) => Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");

async function openDetail(type, id) {
  try {
    const d = await API.getDetail(type, id);
    currentDetail = d;
    detailStack.push({ type, id });
    renderDetail(d);
    setView("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) { console.error("Failed to open detail:", err); }
}

async function openDetailAndPlay(target) {
  await openDetail(target.type, target.id);
  if (currentDetail && currentDetail.tracks && currentDetail.tracks.length) {
    Player.playQueue(currentDetail.tracks, 0);
  }
}

async function backDetail() {
  detailStack.pop();
  if (detailStack.length) {
    const prev = detailStack[detailStack.length - 1];
    const d = await API.getDetail(prev.type, prev.id);
    currentDetail = d;
    renderDetail(d);
    setView("detail");
  } else {
    setView(currentView);
  }
}

function makeTrackRow(t, i) {
  const li = document.createElement("li");
  li.className = "track";
  li.dataset.index = i;
  li.innerHTML =
    `<span class="track-num">${i + 1}</span>` +
    `<img class="track-art" src="${t.cover}" alt="" />` +
    `<div class="track-info"><div class="track-title">${t.title}</div>` +
    `<div class="track-artist">${t.artist}</div></div>` +
    `<span class="track-dur">${fmtTime(t.duration)}</span>`;
  li.addEventListener("click", () => playDetailTrack(i));
  const tArt = li.querySelector(".track-art");
  if (tArt) applyImgFallback(tArt, tArt, t.title);
  return li;
}

function playDetailTrack(i) {
  if (currentDetail && currentDetail.tracks) Player.playQueue(currentDetail.tracks, i);
}

function renderDetail(d) {
  detailCover.src = d.cover;
  detailCover.style.background = "";
  applyImgFallback(detailCover, detailCover, d.title);
  detailKicker.textContent = d.kicker;
  detailTitle.textContent = d.title;
  detailDesc.textContent = d.subtitle || "";
  detailBody.innerHTML = "";

  // Track the open detail for command resolution.
  detailState = {
    type: d.type, id: d.id, title: d.title, layout: d.layout,
    trackCount: d.tracks ? d.tracks.length : 0,
    trackTitles: d.tracks ? d.tracks.map((t) => t.title) : [],
  };
  detailCardItems = d.layout === "cards" ? mapItems(d.cards) : [];

  if (d.layout === "tracks") {
    detailPlay.style.display = "";
    const ol = document.createElement("ol");
    ol.className = "track-list";
    d.tracks.forEach((t, i) => ol.appendChild(makeTrackRow(t, i)));
    detailBody.appendChild(ol);
  } else {
    detailPlay.style.display = "none";
    const grid = document.createElement("div");
    grid.className = "card-grid";
    d.cards.forEach((item) => grid.appendChild(makeCard(item)));
    detailBody.appendChild(grid);
  }
}

detailPlay.addEventListener("click", () => playDetailTrack(0));
detailBack.addEventListener("click", backDetail);

Player.setOnChange((song, i) => {
  if (detailView.hidden) return;
  detailBody.querySelectorAll(".track").forEach((el) =>
    el.classList.toggle("playing", Number(el.dataset.index) === i)
  );
});

/* ===================== HOME ===================== */
async function loadHome() {
  try {
    songsCache = await API.getType("songs");
    const data = await API.getHome();
    const s = data.sections;
    renderRow("trending", s.trending);
    renderRow("arabic", s.arabic);
    renderRow("podcasts", s.podcasts);
    renderRow("genres", s.genres);
    renderRow("moods", s.moods);
    homeItems = mapItems([...s.trending, ...s.arabic, ...s.podcasts, ...s.genres, ...s.moods]);
  } catch (err) { console.error("Failed to load catalog:", err); }
}
loadHome();

/* ===================== AI STATES + INTENT/COMMAND FLOW ===================== */
const micButton = document.getElementById("micButton");
const micLabel = document.getElementById("micLabel");
const micWave = document.getElementById("micWave");
const voiceDock = document.getElementById("voiceDock");

const resultsTitle = document.getElementById("resultsTitle");
const resultsChips = document.getElementById("resultsChips");
const resultsSections = document.getElementById("resultsSections");
const clearResults = document.getElementById("clearResults");

let timers = [];
let lastIntent = null;
function clearTimers() { timers.forEach(clearTimeout); timers = []; }

function setState(state) {
  micButton.classList.remove("listening", "thinking", "speaking");
  micWave.classList.remove("active");
  if (state) micButton.classList.add(state);
  if (state === "listening" || state === "speaking") micWave.classList.add("active");
}

// Mic FAB now starts/stops a live voice session with Aura.
micButton.addEventListener("click", () => VoiceSession.toggle());

// Clicking outside the dock collapses the panel (only when not in a call).
document.addEventListener("click", (e) => {
  if (VoiceSession.isActive()) return;
  if (voiceDock.classList.contains("open") && !voiceDock.contains(e.target)) {
    voiceDock.classList.remove("open");
  }
});

// Esc collapses the voice dock (only when not in a call).
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !VoiceSession.isActive() && voiceDock.classList.contains("open")) {
    voiceDock.classList.remove("open");
    setState(null);
    micLabel.textContent = "Ask Angham";
  }
});

async function handleQuery(query) {
  clearTimers();
  setState("thinking");
  micLabel.textContent = "Finding the perfect music…";

  let data;
  try {
    data = await API.postIntent(query, lastIntent, buildState());
  } catch (err) {
    console.error(err);
    setState(null);
    micLabel.textContent = "Sorry, something went wrong.";
    return;
  }

  setState("speaking");
  micLabel.textContent = data.aiResponse || "Done.";

  if (data.action === "open_detail") {
    openDetail(data.target.type, data.target.id);
  } else if (data.action === "play_detail") {
    openDetailAndPlay(data.target);
  } else if (data.action === "play_track") {
    playDetailTrack(data.index);
  } else {
    // show_results
    lastIntent = data.intent;
    renderResults(data);
  }

  timers.push(setTimeout(() => {
    setState(null);
    micLabel.textContent = "Ask Angham AI";
    voiceDock.classList.remove("open");
  }, 3500));
}

function renderResults(data) {
  resultsTitle.textContent = data.title;

  resultsChips.innerHTML = "";
  data.chips.forEach((c) => {
    const chip = document.createElement("span");
    chip.className = "result-chip";
    chip.textContent = c + " ✓";
    resultsChips.appendChild(chip);
  });

  resultsSections.innerHTML = "";
  const flat = [];
  data.sections.forEach((sec) => {
    if (!sec.items || sec.items.length === 0) return; // skip empty sections
    const wrap = document.createElement("section");
    wrap.className = "row-section";
    const h = document.createElement("h2");
    h.className = "row-title";
    h.textContent = sec.title;
    const row = document.createElement("div");
    row.className = "card-row";
    sec.items.forEach((item) => { row.appendChild(makeCard(item)); flat.push(item); });
    wrap.append(h, row);
    resultsSections.appendChild(wrap);
  });
  if (flat.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-note";
    p.textContent = "I couldn't find anything for that — try rephrasing your request.";
    resultsSections.appendChild(p);
  }
  resultsItems = mapItems(flat);

  setView("results");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

clearResults.addEventListener("click", () => {
  setView("home");
  lastIntent = null;
});