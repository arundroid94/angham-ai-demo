// voice.js — live voice session with Angham (Agora RTC + Conversational AI agent).

const VoiceSession = (function () {

  let client = null, micTrack = null, agentId = null, channel = null, uid = null;
  let active = false, lastState = null, events = null;

  const micButton = document.getElementById("micButton");
  const micLabel = document.getElementById("micLabel");
  const micWave = document.getElementById("micWave");
  const voiceDock = document.getElementById("voiceDock");

  function setState(state, label) {
    if (state !== lastState) {
      micButton.classList.remove("listening", "thinking", "speaking");
      micWave.classList.remove("active");
      if (state) micButton.classList.add(state);
      if (state === "listening" || state === "speaking") micWave.classList.add("active");
      lastState = state;
    }
    if (label !== undefined) micLabel.textContent = label;
  }

  async function start() {
    if (active) return;
    if (typeof AgoraRTC === "undefined") { micLabel.textContent = "Voice SDK not loaded."; return; }
    active = true;
    voiceDock.classList.add("open");
    setState("thinking", "Connecting…");

    try {
      channel = "aura-" + Math.floor(Math.random() * 100000);
      uid = Math.floor(Math.random() * 100000) + 1000;

      channel = "aura-" + Math.floor(Math.random() * 100000);
      uid = Math.floor(Math.random() * 100000) + 1000;

      events = new EventSource(`/api/agora/events?channel=${encodeURIComponent(channel)}`);
      events.onmessage = (e) => { try { handleAction(JSON.parse(e.data)); } catch (_) {} };

      const { appId, token } = await API.getToken(channel, uid);

      client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "audio") user.audioTrack.play();
      });

      client.enableAudioVolumeIndicator();
      client.on("volume-indicator", (volumes) => {
        if (!active) return;
        const agentSpeaking = volumes.some((v) => v.uid !== uid && v.level > 5);
        setState(agentSpeaking ? "speaking" : "listening",
                 agentSpeaking ? "Angham is speaking…" : "Listening… talk to Angham");
      });

      await client.join(appId, channel, token, uid);
      micTrack = await AgoraRTC.createMicrophoneAudioTrack();
      await client.publish([micTrack]);

      const res = await API.startAgent(channel, uid);
      agentId = res.agent_id;

      setState("listening", "Listening… talk to Angham");
    } catch (err) {
      await cleanup();
      active = false;
      voiceDock.classList.remove("open");
      setState(null, "Couldn’t start voice — please try again.");
      setTimeout(() => { micLabel.textContent = "Ask Angham"; }, 2500);
    }
  }

  async function stop() {
    if (!active) return;
    active = false;
    setState("thinking", "Ending…");
    if (agentId) {
      try { await API.stopAgent(agentId); } catch (e) {}
      agentId = null;
    }
    await cleanup();
    voiceDock.classList.remove("open");
    setState(null, "Ask Angham");
  }

  async function cleanup() {
    try { if (events) { events.close(); events = null; } } catch (e) {}
    try { if (micTrack) { micTrack.stop(); micTrack.close(); micTrack = null; } } catch (e) {}
    try { if (client) { await client.leave(); client = null; } } catch (e) {}
    lastState = null;
  }

  // Apply UI actions pushed from the backend (driven by the LLM's tool calls).
  function handleAction(a) {
    if (!a || !a.action) return;
    if (a.action === "show_results" && typeof renderResults === "function") {
      renderResults(a);                                   // keep listening
    } else if (a.action === "open_detail" && typeof openDetail === "function") {
      openDetail(a.target.type, a.target.id);             // keep listening
    } else if (a.action === "play_detail" && typeof openDetailAndPlay === "function") {
      openDetailAndPlay(a.target);
      endSessionAfterPlay();                              // a song started → end the session
    } else if (a.action === "play_track" && typeof playDetailTrack === "function") {
      playDetailTrack(a.index);
      endSessionAfterPlay();                              // a song started → end the session
    }
  }

  // Once playback begins, let Angham's confirmation finish, then stop the agent
  // and return the mic to its idle "start" state. The music keeps playing.
  function endSessionAfterPlay() {
    setTimeout(() => { if (active) stop(); }, 2200);
  }
  

  function toggle() { active ? stop() : start(); }

  window.addEventListener("beforeunload", () => {
    if (active && agentId && navigator.sendBeacon) {
      navigator.sendBeacon("/api/agora/stop-agent",
        new Blob([JSON.stringify({ agentId })], { type: "application/json" }));
    }
  });

  return { start, stop, toggle, isActive: () => active, getChannel: () => channel };
})();