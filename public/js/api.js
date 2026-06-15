// api.js — helper for talking to the backend.

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error("Request failed: " + url + " (" + res.status + ")");
  return res.json();
}

const API = {
  getHome: () => fetchJSON("/api/catalog/home"),
  getType: (type) => fetchJSON("/api/catalog/" + type),
  getDetail: (type, id) => fetchJSON("/api/catalog/detail/" + type + "/" + id),
  postIntent: (query, context, state) =>
    fetchJSON("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, context: context || null, state: state || null }),
    }),

  // --- Agora (Phase 8) ---
  getToken: (channel, uid) =>
    fetchJSON(`/api/agora/token?channel=${encodeURIComponent(channel)}&uid=${uid}`),
  startAgent: (channel, uid) =>
    fetchJSON("/api/agora/start-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, uid }),
    }),
  stopAgent: (agentId) =>
    fetchJSON("/api/agora/stop-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    }),
};