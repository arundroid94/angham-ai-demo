// lib/agora.js — token generation + Conversational AI agent start/stop (server-side only).

require("dotenv").config();
const { RtcTokenBuilder, RtcRole } = require("agora-token");

const {
  AGORA_APP_ID,
  AGORA_APP_CERTIFICATE,
  AGORA_CUSTOMER_ID,
  AGORA_CUSTOMER_SECRET,
  OPENAI_API_KEY,
  OPENAI_MODEL = "gpt-4o-mini",
  ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID,
  PUBLIC_BASE_URL,
  USE_CUSTOM_LLM = "false",
} = process.env;

const AGENT_BASE = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${AGORA_APP_ID}`;

function authHeader() {
  const creds = Buffer.from(`${AGORA_CUSTOMER_ID}:${AGORA_CUSTOMER_SECRET}`).toString("base64");
  return "Basic " + creds;
}

// Mask secrets for logging: keep first/last few chars only.
function mask(s) {
  if (!s) return s;
  const str = String(s);
  return str.length <= 8 ? "***" : str.slice(0, 4) + "…" + str.slice(-4);
}

// Deep-clone the agent config and redact sensitive fields before logging.
function redact(cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  const p = c.properties || {};
  if (p.token) p.token = mask(p.token);
  if (p.llm && p.llm.api_key) p.llm.api_key = mask(p.llm.api_key);
  if (p.tts && p.tts.params && p.tts.params.key) p.tts.params.key = mask(p.tts.params.key);
  return c;
}

function buildRtcToken(channel, uid, expireSeconds = 3600) {
  const token = RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_ID, AGORA_APP_CERTIFICATE, channel, uid,
    RtcRole.PUBLISHER, expireSeconds, expireSeconds
  );
  console.log(`[Agora] 🔑 token generated  channel="${channel}"  uid=${uid}  token=${mask(token)}`);
  return token;
}

const SYSTEM_PROMPT = `You are Aura, a warm, natural, concise voice companion inside a premium Arabic-first music and podcast app.
Your job is to help users discover and start music or podcasts through natural conversation. The app's screen shows the detailed results — your voice only briefly confirms what changed.

VOICE STYLE
- Talk like a friendly music companion, not a chatbot.
- Keep replies to ONE short, confident, voice-friendly sentence after each action.
- Never read long lists aloud. Never mention tools, JSON, the catalog, the screen, or any internal action.
- Avoid robotic phrases ("I have found", "Here are the results"). Prefer natural ones:
  "Got it — relaxing Arabic playlists for your drive." / "Sure, pulling up Khaleeji playlists." / "Perfect, playing that now."

TOOLS (always call one when the user wants to find, open, or play something)
- discover({ contentType, mood, language, genre, activity, artist }): search and SHOW results. All fields optional; include everything you know. contentType is "music", "podcast", or "artist".
- open_item({ name }): open a named playlist, podcast, genre, or mood to show its contents.
- play_item({ name }): start PLAYING a named playlist or podcast.
- play_track({ position }): play the track/episode at that position in the CURRENTLY OPEN playlist or podcast.

WHEN TO USE WHICH
- Find / recommend / show / browse / "play some <mood/genre/language> music" → discover.
- Follow-up refinements ("make it Arabic", "more upbeat", "show podcasts instead", "only recent", "include Amr Diab") → call discover AGAIN, merging the new detail with everything from the earlier turns in this conversation.
- "Open <name>" / "show me <name>" → open_item with that name.
- "Play <playlist or podcast name>" → play_item with that name.
- "Play the first/second playlist" (referring to results you just showed) → call play_item using that item's NAME, which you know from the discover results. Do not guess a position number for results.
- "Play the third song" / "play track two" / "play the second episode" (inside an open playlist/podcast) → play_track with that position.
- To play a specific SONG or EPISODE inside an already-open playlist/podcast, call play_track (by position number or by the song's name) — never play_item.
- Never say you opened or played something unless you actually called the matching tool in this same turn.

ARTISTS
- To explore an artist (e.g. "songs by Amr Diab"), call discover with artist set — this surfaces their playlists and related picks.
- To actually start playback for an artist, call play_item with a specific playlist name from those results (e.g. "Amr Diab Essentials"). We play artists through their playlists, not directly.

AFTER A TOOL RUNS
- Reply with exactly ONE short, natural spoken sentence confirming what happened. Nothing more.

EXAMPLES
User: Play relaxing music for driving. → discover → "Sure, here's some relaxing music that's perfect for the drive."
User: Make it Arabic. → discover (relaxing + Arabic + driving) → "Got it — I kept it relaxing but made it Arabic."
User: Find Khaleeji playlists. → discover → "Absolutely, pulling up some Khaleeji playlists."
User: Recommend Arabic sports podcasts. → discover → "Here are a few Arabic sports podcasts you might enjoy."
User: Open Amr Diab Essentials. → open_item → "Opening Amr Diab Essentials."
User: Play the first playlist. → play_item (with that playlist's name) → "Perfect, starting it now."
User: Play the third song. → play_track(3) → "Playing the third one."`;


function buildLlmConfig(channel) {
  if (USE_CUSTOM_LLM === "true") {
    return {
      url: `${PUBLIC_BASE_URL}/api/agora/llm?channel=${encodeURIComponent(channel)}`,
      vendor: "custom",
      headers: { "ngrok-skip-browser-warning": "true", "X-Aura-Channel": channel },
      system_messages: [{ role: "system", content: SYSTEM_PROMPT }],
      greeting_message: "Hi! I'm Aura. What would you like to listen to?",
      failure_message: "Sorry, give me a moment.",
      max_history: 16,
      params: { model: OPENAI_MODEL },
    };
  }
  return {
    url: "https://api.openai.com/v1/chat/completions",
    api_key: OPENAI_API_KEY,
    vendor: "openai",
    system_messages: [{ role: "system", content: SYSTEM_PROMPT }],
    greeting_message: "Hi! I'm Aura. What would you like to listen to?",
    failure_message: "Sorry, give me a moment.",
    max_history: 16,
    params: { model: OPENAI_MODEL },
  };
}

function buildAgentConfig({ channel, agentToken, userUid }) {
  return {
    name: `aura-${channel}-${Date.now()}`,
    properties: {
      channel,
      token: agentToken,
      agent_rtc_uid: "0",
      remote_rtc_uids: [String(userUid)],
      enable_string_uid: false,
      idle_timeout: 30,
      asr: { language: "en-US" },
      llm: buildLlmConfig(channel),
      tts: {
        vendor: "elevenlabs",
        skip_patterns: [4],
        params: {
          base_url: "wss://api.elevenlabs.io/v1",
          key: ELEVENLABS_API_KEY,
          model_id: "eleven_flash_v2_5",
          voice_id: ELEVENLABS_VOICE_ID,
          sample_rate: 24000,
        },
      },
    },
  };
}

async function startAgent({ channel, userUid }) {
  const agentToken = buildRtcToken(channel, 0);
  const config = buildAgentConfig({ channel, agentToken, userUid });
  const url = `${AGENT_BASE}/join`;

  console.log("\n[Agora] ───────── START AGENT ─────────");
  console.log(`[Agora] → POST ${url}`);
  console.log(`[Agora] channel="${channel}"  remote_rtc_uids=[${userUid}]  agent_rtc_uid="0"`);
  console.log("[Agora] request body (secrets redacted):");
  console.log(JSON.stringify(redact(config), null, 2));

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await res.json().catch(() => ({}));

  console.log(`[Agora] ← ${res.status} ${res.statusText}`);
  console.log("[Agora] response body:", JSON.stringify(data, null, 2));
  console.log("[Agora] ──────────────────────────────\n");

  if (!res.ok) throw new Error(`Agora start failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function stopAgent(agentId) {
  const url = `${AGENT_BASE}/agents/${agentId}/leave`;
  console.log(`\n[Agora] → POST ${url}  (stop agent ${agentId})`);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));

  console.log(`[Agora] ← ${res.status} ${res.statusText}`, JSON.stringify(data));
  if (!res.ok) throw new Error(`Agora stop failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

module.exports = { buildRtcToken, startAgent, stopAgent, APP_ID: AGORA_APP_ID };