const express = require("express");
const { catalog, playlistCard, podcastCard, genreCard, moodCard, buildDetail } = require("../lib/catalog");

const router = express.Router();

router.get("/home", (req, res) => {
  const arabicPlaylists = catalog.playlists.filter((p) => p.language === "arabic");
  res.json({
    sections: {
      trending: catalog.playlists.slice(0, 12).map(playlistCard),
      arabic:   arabicPlaylists.slice(0, 12).map(playlistCard),
      podcasts: catalog.podcasts.slice(0, 12).map(podcastCard),
      genres:   catalog.genres.map(genreCard),
      moods:    catalog.moods.map(moodCard),
    },
  });
});

router.get("/detail/:type/:id", (req, res) => {
  const d = buildDetail(req.params.type, req.params.id);
  if (!d) return res.status(404).json({ error: "Not found" });
  res.json(d);
});

router.get("/:type", (req, res) => {
  const type = req.params.type;
  if (!catalog[type]) return res.status(404).json({ error: "Unknown type: " + type });
  res.json(catalog[type]);
});

module.exports = router;