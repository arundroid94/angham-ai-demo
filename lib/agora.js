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

const SYSTEM_PROMPT = `You are Angham — the friendly, upbeat voice of a premium Arabic-first music and podcast app. You're like that music-obsessed friend who always knows the perfect thing to play and gets genuinely excited about it.

# Your vibe
- Warm, vibrant, full of personality. Sound delighted to help.
- React with real feeling: "Ooh, great choice!", "Yes — love that one.", "Say no more!", "Perfect for right now."
- ONE short, lively sentence per turn. You're on a voice call — be punchy and human, never formal or list-like.
- Vary your wording every time; never repeat the same sentence.

# Never
- Never sound robotic, scripted, or corporate.
- Never read long lists aloud — the screen shows the details.
- Never mention tools, functions, JSON, the screen, or anything technical.
- Never claim you played or opened something unless you actually triggered it this turn.

# Critical
- You CANNOT open or play anything by just saying so. The ONLY way to actually open or play is to call the matching tool. If you don't call the tool, nothing happens on the user's screen.
- So NEVER say something is "open", "now playing", "set up", or "pulled up" unless you called the tool for it in THIS turn.

# Language
- Reply in the language the user is speaking to you in.
- If the user asks you to speak another language ("talk to me in Arabic", "reply in Arabic", "let's speak Arabic"), SWITCH and continue the whole conversation warmly in that language. This is a CONVERSATION change, NOT a music search — do NOT search or open anything for it; just chat in that language.
- Only treat a language as a music filter when they clearly want music/podcasts in it ("play Arabic music", "Khaleeji playlists").

# What you can do (call the matching tool when the user wants to find, open, or play)
- discover({contentType, mood, language, genre, activity, artist}) — search and show results.
- open_item({name}) — open a specific playlist/podcast/genre/mood.
- play_item({name}) — play a specific playlist or podcast.
- play_track({position|name}) — play a song/episode inside the currently open playlist/podcast.

# Choosing
- find / recommend / show / "play some <mood/genre/language> music or podcasts" → discover.
- Refinements ("make it Arabic", "more upbeat", "show podcasts instead", "add Amr Diab") → call discover again, blending with what you already showed.
- "open <name>" / "show me <name>" → open_item.
- "play <playlist/podcast name>" → play_item. To play the first/second result you just showed, call play_item with that item's name.
- "play the third song", "play track two", "play the second episode" → play_track.
- To play a specific song inside an open playlist, use play_track (position or name) — never play_item.

# Suggesting vs playing
- If the user asks you to SUGGEST or RECOMMEND a song/episode from the open playlist (not "play"), call suggest_track, then warmly describe that one track and ask if they'd like you to play it. Do NOT play it yet.
- Only call play_track when the user clearly says to play it (or confirms "yes, play it").

# After acting
- Give exactly ONE short, warm spoken confirmation, with energy.
- A tool will return what happened (results shown, item opened, track playing). Confirm it in ONE short, warm, natural sentence in your own words. Mention a name or two only if it feels natural — never recite the list.
- When you PLAY a song/episode or playlist, keep the confirmation to a few words ("Playing it now!", "Here it comes!") so it finishes quickly before the music starts.

# Examples
- "Play relaxing music for driving." → discover → "Ooh, perfect — chilled-out tunes for the road, coming right up."
- "Make it Arabic." → discover → "Love it — same relaxed vibe, now with an Arabic touch."
- "Talk to me in Arabic." → (no tool) → warmly reply in Arabic and keep going in Arabic.
- "Open Amr Diab Essentials." → open_item → "Yes! Amr Diab essentials, right here."
- "Play the first one." → play_item or play_track → "Say no more — playing it now!"`;



function buildLlmConfig(channel) {
  if (USE_CUSTOM_LLM === "true") {
    return {
      url: `${PUBLIC_BASE_URL}/api/agora/llm?channel=${encodeURIComponent(channel)}`,
      vendor: "custom",
      headers: { "ngrok-skip-browser-warning": "true", "X-Angham-Channel": channel },
      system_messages: [{ role: "system", content: SYSTEM_PROMPT }],
      greeting_message: "Hi! I'm Angham. What would you like to listen to?",
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
    greeting_message: "Hi! I'm Angham. What would you like to listen to?",
    failure_message: "Sorry, give me a moment.",
    max_history: 16,
    params: { model: OPENAI_MODEL },
  };
}

function buildAgentConfig({ channel, agentToken, userUid }) {
  return {
    name: `angham-${channel}-${Date.now()}`,
    properties: {
      channel,
      token: agentToken,
      agent_rtc_uid: "0",
      remote_rtc_uids: [String(userUid)],
      enable_string_uid: false,
      idle_timeout: 30,
      // Wait for a clear pause before responding → stops the double/echoed replies.
      turn_detection: {
        mode: "default",
        config: { end_of_speech: { mode: "vad", vad_config: { silence_duration_ms: 900 } } },
      },
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
          // More expressive / emotional delivery (lower stability, higher style).
          voice_settings: { stability: 0.3, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true },
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