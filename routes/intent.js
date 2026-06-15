// routes/intent.js — POST /api/intent (commands first, then discovery)

const express = require("express");
const { parseIntent, mergeIntent, buildResponse, isRefinement, parseCommand } = require("../lib/intent");

const router = express.Router();

router.post("/", (req, res) => {
  const { query, context, state } = req.body || {};
  if (!query || !query.trim()) {
    return res.status(400).json({ error: "Missing 'query' in request body." });
  }

  // Navigation/playback commands take priority and use the on-screen state.
  const command = parseCommand(query, state);
  if (command) return res.json(command);

  // Otherwise treat as a discovery request.
  const parsed = parseIntent(query);
  const intent = isRefinement(query, !!context) ? mergeIntent(context, parsed) : parsed;
  res.json(buildResponse(intent));
});

module.exports = router;