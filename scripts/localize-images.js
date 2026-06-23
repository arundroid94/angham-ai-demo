// Run AFTER generate-catalog.js. Downloads every cover/image to public/images/
// and rewrites the data files to use the local copies.
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const IMG_DIR = path.join(__dirname, "..", "public", "images");
fs.mkdirSync(IMG_DIR, { recursive: true });

function fetchTo(url, file, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && redirects < 5) {
        r.resume(); return resolve(fetchTo(r.headers.location, file, redirects + 1));
      }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error("status " + r.statusCode)); }
      const out = fs.createWriteStream(file);
      r.pipe(out);
      out.on("finish", () => out.close(() => resolve()));
    }).on("error", reject);
  });
}

(async () => {
  const cache = new Map(); // remote URL -> local path
  for (const name of ["songs", "playlists", "artists", "podcasts", "genres", "moods"]) {
    const p = path.join(DATA_DIR, name + ".json");
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const item of data) {
      for (const field of ["cover", "image"]) {
        const url = item[field];
        if (typeof url === "string" && url.startsWith("http")) {
          if (!cache.has(url)) {
            const fname = crypto.createHash("md5").update(url).digest("hex").slice(0, 12) + ".jpg";
            const dest = path.join(IMG_DIR, fname);
            try {
              if (!fs.existsSync(dest)) await fetchTo(url, dest);
              cache.set(url, "/images/" + fname);
              process.stdout.write(".");
            } catch (e) {
              console.warn("\nskip", url, e.message);
              cache.set(url, url); // keep remote URL if download fails
            }
          }
          item[field] = cache.get(url);
        }
      }
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  }
  console.log("\nDone. Localized", cache.size, "unique images.");
})();