const express = require("express");
const { buildRtcToken, startAgent, stopAgent, APP_ID } = require("../lib/agora");
const realtime = require("../lib/realtime");
const agentTools = require("../lib/agentTools");

const router = express.Router();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";



// --- RTC token ---
router.get("/token", (req, res) => {
  const channel = req.query.channel;
  const uid = parseInt(req.query.uid, 10) || 0;
  if (!channel) return res.status(400).json({ error: "channel is required" });
  try {
    res.json({ appId: APP_ID, channel, uid, token: buildRtcToken(channel, uid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Agent lifecycle ---
router.post("/start-agent", async (req, res) => {
  const { channel, uid } = req.body || {};
  if (!channel || uid === undefined) return res.status(400).json({ error: "channel and uid are required" });
  try { res.json(await startAgent({ channel, userUid: uid })); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post("/stop-agent", async (req, res) => {
  const { agentId } = req.body || {};
  if (!agentId) return res.status(400).json({ error: "agentId is required" });
  try { res.json(await stopAgent(agentId)); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// --- SSE stream of UI actions to the browser ---
router.get("/events", (req, res) => {
  const channel = req.query.channel;
  if (!channel) return res.status(400).end();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (res.flushHeaders) res.flushHeaders();
  res.write(`data: ${JSON.stringify({ action: "connected" })}\n\n`);
  realtime.register(channel, res);
  req.on("close", () => realtime.remove(channel));
});

// --- Custom LLM endpoint (called by Agora). OpenAI proxy + tools, streamed back as SSE. ---
async function openaiChat(messages, model) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, tools: agentTools.TOOLS, tool_choice: "auto", stream: false }),
  });
  return r.json();
}

router.post("/llm", async (req, res) => {
  const channel = req.query.channel || req.headers["x-aura-channel"] || null;
  console.log("[LLM] channel:", channel, " browserConnected:", channel ? realtime.has(channel) : false);
  const body = req.body || {};
  const model = body.model || OPENAI_MODEL;
  const convo = (body.messages || []).map((m) => ({ role: m.role, content: m.content }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (res.flushHeaders) res.flushHeaders();
  const sendChunk = (delta, finish = null) => {
    res.write(`data: ${JSON.stringify({ id: "chatcmpl-" + Date.now(), object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  };

  let finalText = "";
  try {
    const data = await openaiChat(convo, model);          // single call
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;

    if (msg && msg.tool_calls && msg.tool_calls.length) {
      const parts = [];
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch (e) {}
        const r = await agentTools.runTool(tc.function.name, args, channel);
        console.log("[LLM] tool:", tc.function.name, JSON.stringify(args), "→", (r.speech || "").slice(0, 80));
        if (r.speech) parts.push(r.speech);
      }
      finalText = parts.join(" ");
    } else {
      // Model didn't call a tool — try to satisfy the request deterministically.
      const lastUser = [...convo].reverse().find((m) => m.role === "user");
      const fb = agentTools.handleUserText(lastUser ? lastUser.content : "", channel);
      if (fb) { console.log("[LLM] fallback handled →", fb.slice(0, 80)); finalText = fb; }
      else finalText = (msg && msg.content) || "Okay.";
    }
  } catch (err) {
    console.error("[LLM] error:", err.message);
    finalText = "Sorry, I had a little trouble there.";
  }

  console.log("[LLM] ← reply:", (finalText || "").slice(0, 120));
  sendChunk({ role: "assistant", content: finalText || "Okay." });
  sendChunk({}, "stop");
  res.write("data: [DONE]\n\n");
  res.end();
});

// See which browsers are currently connected for SSE.
router.get("/debug/clients", (req, res) =>
  res.json({ channels: [...require("../lib/realtime").clients.keys()] }));

// Deterministic test: run a tool for a channel and push the result (no voice/LLM).
router.post("/sim", async (req, res) => {
  const { channel, tool, args } = req.body || {};
  if (!channel || !tool) return res.status(400).json({ error: "channel and tool required" });
  const result = await agentTools.runTool(tool, args || {}, channel);
  res.json({ channel, connected: require("../lib/realtime").has(channel), result });
});

module.exports = router;