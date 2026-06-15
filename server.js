// server.js — Anghami AI Companion Demo backend

require("dotenv").config();
const express = require("express");
const path = require("path");
const catalogRouter = require("./routes/catalog");
const intentRouter = require("./routes/intent");
const agoraRouter = require("./routes/agora");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/catalog", catalogRouter);
app.use("/api/intent", intentRouter);
app.use("/api/agora", agoraRouter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Aura AI backend is alive 🎵" });
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));