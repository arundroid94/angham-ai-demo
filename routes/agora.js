const express = require("express");
const { buildRtcToken, startAgent, stopAgent, APP_ID } = require("../lib/agora");
const realtime = require("../lib/realtime");
const agentTools = require("../lib/agentTools");

const router = express.Router();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ---- RTC token ----
router.get("/token", (req, res) => {
  const channel = req.query.channel;
  const uid = parseInt(req.query.uid, 10) || 0;
  if (!channel) return res.status(400).json({ error: "channel is required" });
  try { res.json({ appId: APP_ID, channel, uid, token: buildRtcToken(channel, uid) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Agent lifecycle ----
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

// ---- SSE stream of UI actions to the browser ----
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
router.get("/debug/clients", (req, res) => res.json({ channels: [...realtime.clients.keys()] }));

// ---- Custom LLM (called by Agora) ----
async function openaiChat(messages, model) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, tools: agentTools.TOOLS, tool_choice: "auto", stream: false }),
  });
  return r.json();
}

const PLAY_ACKS = ["Enjoy!", "Here it comes!", "Playing it now!", "Let's go!"];
const ACTION_CLAIM = /\b(open(ed|ing)?|play(ing|ed)?|pull(ed|ing)? up|now open|now playing|set up|all set|here'?s)\b/i;

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

  let finalText = "", uiActed = false, lastResult = null;
  try {
    for (let i = 0; i < 3; i++) {
      const data = await openaiChat(convo, model);
      const msg = data && data.choices && data.choices[0] && data.choices[0].message;
      if (!msg) break;

      if (msg.tool_calls && msg.tool_calls.length) {
        convo.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
        let playAck = null;
        for (const tc of msg.tool_calls) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch (e) {}
          const result = await agentTools.runTool(tc.function.name, args, channel);
          uiActed = true; lastResult = result;
          console.log("[LLM] tool:", tc.function.name, JSON.stringify(args), "→", JSON.stringify(result).slice(0, 100));
          if ((tc.function.name === "play_item" || tc.function.name === "play_track") &&
              (result.result === "playing" || result.result === "playing_track")) {
            playAck = PLAY_ACKS[Math.floor(Math.random() * PLAY_ACKS.length)];
          }
          convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        if (playAck) { finalText = playAck; break; }
        continue; // natural confirmation on the next pass
      }

      finalText = msg.content || "";
      break;
    }

    if (uiActed && !finalText && lastResult) {
      if (lastResult.result === "opened") finalText = `Here's ${lastResult.name}.`;
      else if (lastResult.result === "results_shown") finalText = `Here are some ${lastResult.description} picks for you.`;
      else if (lastResult.result === "suggestion") finalText = `How about ${lastResult.name}? Want me to play it?`;
    }

    // The model didn't call a tool. Always try to recover the action from the transcript.
    if (!uiActed) {
      const lastUser = [...convo].reverse().find((m) => m.role === "user");
      const text = lastUser ? lastUser.content : "";
      const recovered = agentTools.handleUserText(text, channel); // command first, else discovery
      if (recovered) {
        finalText = recovered;                       // we actually performed it → use this
      } else if (ACTION_CLAIM.test(finalText)) {
        // model claimed an action it never performed and we can't recover → don't lie
        finalText = "Sorry, I didn't catch which one — tell me the name and I'll open it.";
      }
    }
  } catch (err) {
    console.error("[LLM] error:", err.message);
    finalText = "Sorry, I had a little trouble there.";
  }

  finalText = finalText || "Okay.";
  console.log("[LLM] ← reply:", finalText.slice(0, 120));
  sendChunk({ role: "assistant", content: finalText });
  sendChunk({}, "stop");
  res.write("data: [DONE]\n\n");
  res.end();
});

module.exports = router;