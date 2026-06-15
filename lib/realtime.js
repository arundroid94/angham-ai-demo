// lib/realtime.js — pushes UI actions to the browser over SSE, keyed by channel.
const clients = new Map(); // channel -> response stream

function register(channel, res) { clients.set(channel, res); }
function remove(channel) { clients.delete(channel); }
function push(channel, action) {
  if (!channel) return;
  const res = clients.get(channel);
  if (res) { try { res.write(`data: ${JSON.stringify(action)}\n\n`); } catch (e) {} }
}
function has(channel) { return clients.has(channel); }
module.exports = { register, remove, push, has, clients };