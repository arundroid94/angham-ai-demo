// lib/agentTools.js — tools + deterministic fallback, with fuzzy name matching.
const { parseIntent, buildResponse, parseCommand, findCatalogByName } = require("./intent");
const { buildDetail, catalog } = require("./catalog");
const fuzzy = require("./fuzzy");
const realtime = require("./realtime");

const sessions = new Map(); // channel -> { results, detail }
function getSession(ch) {
  if (!sessions.has(ch)) sessions.set(ch, { results: [], detail: null });
  return sessions.get(ch);
}
function summarizeDetail(d) {
  return {
    type: d.type, id: d.id, title: d.title, layout: d.layout,
    trackCount: d.tracks ? d.tracks.length : 0,
    tracks: d.tracks ? d.tracks.map((t) => ({ title: t.title })) : [],
  };
}

const TOOLS = [
  { type: "function", function: {
    name: "discover",
    description: "Search and show music/podcasts by mood, language, genre, activity, artist, or content type (music, podcast, artist).",
    parameters: { type: "object", properties: {
      contentType: { type: "string", enum: ["music", "podcast", "artist"] },
      mood: { type: "string" }, language: { type: "string" }, genre: { type: "string" },
      activity: { type: "string" }, artist: { type: "string" } } } } },
  { type: "function", function: {
    name: "open_item",
    description: "Open a named playlist, podcast, genre, or mood to show its contents.",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
  { type: "function", function: {
    name: "play_item",
    description: "Start playing a named PLAYLIST or PODCAST (not an individual song).",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
  { type: "function", function: {
    name: "play_track",
    description: "Play a song/episode inside the CURRENTLY OPEN playlist or podcast, by its position number or its name.",
    parameters: { type: "object", properties: { position: { type: "integer" }, name: { type: "string" } } } } },
];

// Resolve an item name to {type,id,title}: exact substring first, then fuzzy.
function resolveItem(name) {
  const exact = findCatalogByName(" " + String(name || "").toLowerCase() + " ");
  if (exact) return exact;
  const candidates = [
    ...catalog.playlists.map((p) => ({ type: "playlist", id: p.id, title: p.title })),
    ...catalog.podcasts.map((p) => ({ type: "podcast", id: p.id, title: p.title })),
    ...catalog.genres.map((g) => ({ type: "genre", id: g.id, title: g.name })),
    ...catalog.moods.map((m) => ({ type: "mood", id: m.id, title: m.name })),
  ];
  return fuzzy.bestMatch(name, candidates, (c) => c.title, 0.6);
}

// ---- core operations ----
function doDiscover(channel, intent) {
  const resp = buildResponse(intent);
  const sess = getSession(channel);
  const flat = [];
  resp.sections.forEach((s) => s.items.forEach((i) => flat.push({ type: i.type, id: i.id, title: i.title })));
  sess.results = flat;
  realtime.push(channel, { action: "show_results", title: resp.title, chips: resp.chips, sections: resp.sections });
  const names = flat.slice(0, 8).map((i) => i.title);
  return `${resp.aiResponse} [Showing: ${names.join(", ")}]`;
}

function doOpenOrPlay(channel, type, id, play) {
  const detail = buildDetail(type, id);
  if (!detail) return null;
  getSession(channel).detail = summarizeDetail(detail);
  const playable = type === "playlist" || type === "podcast";
  realtime.push(channel, (play && playable)
    ? { action: "play_detail", target: { type, id } }
    : { action: "open_detail", target: { type, id } });
  const items = (detail.tracks || detail.cards || []).map((x) => x.title);
  return (play && playable)
    ? `Playing ${detail.title}. [Tracks: ${items.join(", ")}]`
    : `Opening ${detail.title}. [Items: ${items.join(", ")}]`;
}

// Returns { title } on success, or { error: "no_open" | "not_found" }.
function doPlayTrack(channel, { position, name }) {
  const d = getSession(channel).detail;
  if (!d || !d.tracks || !d.tracks.length) return { error: "no_open" };
  let idx = -1;
  if (position) idx = parseInt(position, 10) - 1;           // explicit position wins
  if ((idx < 0 || idx >= d.tracks.length) && name) {        // else fuzzy-match the name
    const match = fuzzy.bestMatch(name, d.tracks, (t) => t.title, 0.55);
    if (match) idx = d.tracks.indexOf(match);
  }
  if (idx < 0 || idx >= d.tracks.length) return { error: "not_found" };
  realtime.push(channel, { action: "play_track", index: idx });
  return { title: d.tracks[idx].title };
}

// ---- explicit tool calls from the model ----
async function runTool(name, args, channel) {
  try {
    if (name === "discover") {
      const parts = [args.mood, args.activity, args.language, args.genre, args.artist, args.contentType].filter(Boolean);
      return { speech: doDiscover(channel, parseIntent(parts.join(" "))) };
    }
    if (name === "open_item" || name === "play_item") {
      const match = resolveItem(args.name);
      if (!match) return { speech: `I couldn't find ${args.name}.` };
      return { speech: doOpenOrPlay(channel, match.type, match.id, name === "play_item") || `I couldn't open ${args.name}.` };
    }
    if (name === "play_track") {
      const r = doPlayTrack(channel, args);
      if (r.title) return { speech: `Playing ${r.title}.` };
      if (r.error === "no_open") return { speech: "Open a playlist or podcast first, then I can play a track from it." };
      return { speech: "I couldn't find that track in this playlist." };
    }
    return { speech: "" };
  } catch (e) {
    return { speech: "", error: e.message };
  }
}

// ---- deterministic fallback ----
function handleUserText(userText, channel) {
  if (!userText) return null;
  const sess = getSession(channel);
  const cmd = parseCommand(userText, { results: sess.results, detail: sess.detail });
  if (cmd) {
    if (cmd.action === "open_detail") return doOpenOrPlay(channel, cmd.target.type, cmd.target.id, false) || cmd.aiResponse;
    if (cmd.action === "play_detail") return doOpenOrPlay(channel, cmd.target.type, cmd.target.id, true) || cmd.aiResponse;
    if (cmd.action === "play_track") {
      realtime.push(channel, { action: "play_track", index: cmd.index });
      const t = sess.detail && sess.detail.tracks && sess.detail.tracks[cmd.index];
      return `Playing ${t ? t.title : "that"}.`;
    }
  }
  const intent = parseIntent(userText);
  if (Object.keys(intent).length) return doDiscover(channel, intent);
  return null;
}

module.exports = { TOOLS, runTool, handleUserText };